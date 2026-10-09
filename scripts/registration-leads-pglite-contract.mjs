#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Execute the actual migration in isolated PostgreSQL with synthetic identities.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1), otherCompany = id(2), staff = id(3), outsider = id(4);
const student = id(10), active = id(11), enrolled = id(12), archived = id(13);
const lead = id(20), converted = id(21), foreignLead = id(22);
const checks = [];
await db.exec(`
  create role authenticated; create role anon; create schema auth;
  create type public.app_role as enum ('master','admin','trainer','student');
  create table public.students (id uuid primary key, company_id uuid, status text,
    sales_stage text, updated_at timestamptz, answers jsonb);
  create table public.leads (id uuid primary key, company_id uuid, stage text,
    converted_to_student_id uuid, updated_at timestamptz, answers jsonb);
  create table public.enrollments (id uuid primary key, student_id uuid, company_id uuid, status text);
  create table public.qa_staff (user_id uuid, company_id uuid);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function public.is_company_staff(actor uuid, tenant uuid) returns boolean language sql stable as
    $$ select exists(select 1 from public.qa_staff where user_id=actor and company_id=tenant) $$;
  create function public.has_role(actor uuid, role public.app_role) returns boolean language sql stable as
    $$ select false $$;
  create function public.can_manage_staff_student(tenant uuid, target uuid) returns boolean language sql stable as
    $$ select public.is_company_staff(auth.uid(),tenant) and exists
      (select 1 from public.students where id=target and company_id=tenant) $$;
  grant usage on schema public,auth to authenticated,anon;
  insert into public.qa_staff values ('${staff}','${company}');
  insert into public.students values
    ('${student}','${company}','pending','payment_pending',null,'{"goal":"fitness"}'),
    ('${active}','${company}','active','active',null,'{}'),
    ('${enrolled}','${company}','pending','contacted',null,'{}'),
    ('${archived}','${company}','inactive','lost',null,'{}');
  insert into public.enrollments values ('${id(30)}','${enrolled}','${company}','active');
  insert into public.leads values
    ('${lead}','${company}','interested',null,null,'{"goal":"mobility"}'),
    ('${converted}','${company}','contacted','${student}',null,'{}'),
    ('${foreignLead}','${otherCompany}','interested',null,null,'{}');
`);
await db.exec(await readFile("supabase/migrations/20261009172654_registration_dormant_leads.sql", "utf8"));

async function actor(user = staff, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || ""]);
  assert.ok(["authenticated", "anon"].includes(role));
  await db.exec(`set role ${role}`);
}
async function move(entity, record, expected, target, tenant = company) {
  const result = await db.query("select public.set_registration_lead_stage($1,$2,$3,$4,$5) result", [tenant,entity,record,expected,target]);
  return result.rows[0].result;
}
async function snapshot() {
  await db.exec("reset role");
  const result = await db.query(`select jsonb_build_object(
    'students',(select jsonb_agg(to_jsonb(s) order by id) from students s),
    'leads',(select jsonb_agg(to_jsonb(l) order by id) from leads l),
    'enrollments',(select jsonb_agg(to_jsonb(e) order by id) from enrollments e)) state`);
  return result.rows[0].state;
}
async function rejects(name, args, code, user = staff, role = "authenticated") {
  const before = await snapshot();
  await actor(user, role);
  await assert.rejects(() => move(...args), (error) => error.code === code);
  assert.deepEqual(await snapshot(), before, `${name} left writes behind`);
  checks.push(name);
}
try {
  await rejects("anonymous execution denied", ["lead",lead,"interested","lost"], "42501", null, "anon");
  await rejects("missing identity denied", ["lead",lead,"interested","lost"], "28000", null);
  await rejects("outsider lead denied", ["lead",lead,"interested","lost"], "42501", outsider);
  await rejects("outsider student denied", ["student",student,"payment_pending","lost"], "42501", outsider);
  await rejects("foreign company denied", ["lead",foreignLead,"interested","lost",otherCompany], "42501");
  await rejects("mismatched company record denied", ["lead",foreignLead,"interested","lost"], "P0002");
  await rejects("converted lead denied", ["lead",converted,"contacted","lost"], "23514");
  await rejects("active profile denied", ["student",active,"interested","lost"], "23514");
  await rejects("active enrollment denied", ["student",enrolled,"contacted","lost"], "23514");
  await rejects("stale stage denied", ["student",student,"contacted","lost"], "40001");
  await rejects("invalid destination denied", ["student",student,"payment_pending","active"], "22023");
  await rejects("resume only from Leads", ["lead",lead,"interested","contacted"], "23514");
  await actor();
  assert.deepEqual(await move("student",student,"payment_pending","lost"), {id:student,stage:"lost"});
  let state = await snapshot();
  assert.equal(state.students.find(s=>s.id===student).status, "pending");
  assert.deepEqual(state.students.find(s=>s.id===student).answers, {goal:"fitness"});
  checks.push("student transformed with status and answers preserved");
  await actor();
  assert.deepEqual(await move("student",student,"lost","contacted"), {id:student,stage:"contacted"});
  checks.push("student resumes contact");
  await actor();
  assert.deepEqual(await move("lead",lead,"interested","lost"), {id:lead,stage:"lost"});
  await actor();
  assert.deepEqual(await move("lead",lead,"lost","contacted"), {id:lead,stage:"contacted"});
  state = await snapshot();
  assert.deepEqual(state.leads.find(l=>l.id===lead).answers, {goal:"mobility"});
  checks.push("pre-registration transformed and resumed without deletion");
  await actor();
  await move("student",archived,"lost","contacted");
  state = await snapshot();
  assert.equal(state.students.find(s=>s.id===archived).status,"inactive");
  assert.equal(state.students.length,4);
  assert.equal(state.leads.length,3);
  assert.deepEqual(state.enrollments,[{id:id(30),student_id:enrolled,company_id:company,status:"active"}]);
  checks.push("legacy archived profile restored without changing access or enrollments");
  console.log(JSON.stringify({ok:true,checks:checks.length,details:checks}));
} finally {
  await db.close();
}
