import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Run with SETT_QA_PGLITE_MODULE pointing to an installed PGlite ESM entry.
const { PGlite } = await import(process.env.SETT_QA_PGLITE_MODULE || "@electric-sql/pglite");
const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

const company = "00000000-0000-0000-0000-000000000001";
const flow = "00000000-0000-0000-0000-000000000002";
const chat = "00000000-0000-0000-0000-000000000003";
const student = "00000000-0000-0000-0000-000000000004";
const instance = "00000000-0000-0000-0000-000000000005";
const owner = "00000000-0000-0000-0000-000000000006";
const lease = "00000000-0000-0000-0000-000000000007";
const actor = "00000000-0000-0000-0000-000000000008";
const foreignCompany = "00000000-0000-0000-0000-000000000009";
const trainer = "00000000-0000-0000-0000-000000000010";
const master = "00000000-0000-0000-0000-000000000011";
const recipient = "15550100100@s.whatsapp.net";

test("weekly flow migration on isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema commercial_private;
    revoke all on schema commercial_private from public, anon, authenticated;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table public.companies(id uuid primary key);
    create type public.app_role as enum ('master', 'admin', 'coordinator', 'trainer', 'student');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('sett.test_actor', true), '')::uuid $$;
    create table public.user_roles(user_id uuid, role public.app_role);
    create function public.has_role(_actor uuid, _role app_role) returns boolean
      language sql stable security definer set search_path = '' as $$
        select exists(select 1 from public.user_roles where user_id = _actor and role = _role)
      $$;
    create table public.company_members(user_id uuid, company_id uuid);
    create table public.role_permissions(company_id uuid, role text, module text, enabled boolean);
    create table public.company_product_settings(company_id uuid, settings jsonb);
    create table public.students(id uuid primary key, company_id uuid, full_name text, status text, whatsapp text, phone text,
      weekly_contact_recipient_generation bigint, opted_in boolean, user_id uuid);
    create table public.enrollments(id uuid default gen_random_uuid(), company_id uuid, student_id uuid, status text,
      payment_status text, training_start_date date, start_date date, end_date date, created_at timestamptz default now());
    create table public.whatsapp_instances(id uuid primary key, company_id uuid, status text);
    create table public.whatsapp_chats(id uuid primary key, company_id uuid, student_id uuid, remote_jid text,
      instance_id uuid, contact_name text, created_at timestamptz default now(), cadence_muted boolean, is_archived boolean);
    create table public.whatsapp_messages(chat_id uuid, company_id uuid, timestamp timestamptz,
      failed_at timestamptz, is_from_me boolean, status text, type text, origin text, sender_id text, message_id_external text);
    create unique index test_provider_message_key on public.whatsapp_messages (chat_id, message_id_external);
    create table public.automation_flows(id uuid primary key, company_id uuid, is_active boolean, trigger_type text);
    create table public.flow_sessions(id uuid primary key default gen_random_uuid(), flow_id uuid, chat_id uuid, current_node_id text,
      status text, context jsonb, created_at timestamptz default now(), started_at timestamptz, last_activity_at timestamptz, updated_at timestamptz);
    create table public.intercycle_anamnesis_deliveries(id uuid primary key, company_id uuid, student_id uuid);
    create table public.automation_dispatch_attempts(kind text, owner_id uuid, send_key text, lease_token uuid,
      state text, started_at timestamptz, acknowledged_at timestamptz, provider_message_id text);
    create table public.webhook_dispatch_owners(id uuid primary key, company_id uuid, chat_id uuid,
      status text, dispatch_lease_token uuid, dispatch_lease_until timestamptz);
    create table public.company_message_sequences(id uuid primary key, company_id uuid, chat_id uuid, scope jsonb, snapshot jsonb);
    create table public.company_message_parts(sequence_id uuid, part_index integer, state text, token uuid, receipt text, updated_at timestamptz);
    create function public.weekly_contact_recipient_key(text) returns text language sql immutable as
      $$ select split_part($1, '@', 1) $$;
    create function public.weekly_contact_consent_is_current(uuid,uuid,text,bigint) returns boolean
      language sql stable as $$ select opted_in from public.students
        where id = $1 and company_id = $2 and weekly_contact_recipient_generation = $4 $$;
  `);
  const staff = migration("20260718120000_harden_student_tenant_isolation");
  await db.exec(staff.slice(staff.indexOf("create or replace function public.is_company_staff"),
    staff.indexOf("create or replace function public.is_student_company_staff")));
  await db.exec(staff.slice(staff.indexOf('create policy "Company staff manage automation flows"'),
    staff.indexOf("do $$", staff.indexOf('create policy "Company staff manage automation flows"'))));
  const companyPolicy = migration("20261026093137_company_communication_cadence");
  await db.exec(companyPolicy.slice(companyPolicy.indexOf("create or replace function public.company_communication_number"),
    companyPolicy.indexOf("-- Transform the canonical function")));
  const previous = migration("20261109002000_weekly_contact_dispatch_guards");
  await db.exec(previous.slice(previous.indexOf("alter table public.automation_flows add column weekly_contact_inactivity_hours"),
    previous.indexOf("create function public.weekly_contact_dispatch_check")));
  await db.exec(`
    revoke all on function public.weekly_contact_eligibility(uuid,uuid,uuid,text,bigint,uuid,timestamptz) from public, anon, authenticated;
    alter table public.automation_flows enable row level security;
    grant select, insert, update on public.automation_flows to authenticated, service_role;
    select set_config('sett.test_actor', '${actor}', false);
    insert into public.companies values ('${company}'), ('${foreignCompany}');
    insert into public.user_roles values ('${actor}', 'admin'), ('${trainer}', 'trainer'), ('${master}', 'master');
    insert into public.company_members values ('${actor}', '${company}'), ('${trainer}', '${company}');
    insert into public.students values ('${student}', '${company}', 'Synthetic Student', 'active', '${recipient}', null, 1, true);
    insert into public.enrollments(company_id,student_id,status,start_date,end_date)
      values ('${company}', '${student}', 'active', '2026-11-08', '2026-11-10');
    insert into public.whatsapp_instances values ('${instance}', '${company}', 'connected');
    insert into public.whatsapp_chats(id,company_id,student_id,instance_id,remote_jid)
      values ('${chat}', '${company}', '${student}', '${instance}', '${recipient}');
    insert into public.automation_flows values ('${flow}', '${company}', true, 'weekly_contact', 24),
      (gen_random_uuid(), '${foreignCompany}', true, 'weekly_contact', 0);
  `);
  await db.exec(migration("20261117120000_weekly_contact_flow_conditions"));
  assert.equal(await scalar("select weekly_contact_inactivity_hours result from automation_flows where id=$1", [flow]), 24);
  await t.test("existing RLS and the write predicate prevent foreign and stale updates", async () => {
    await db.exec("begin; set local role authenticated");
    try {
      const update = (tenant, prevInterval, prevInactivity, nextInterval, nextInactivity) => db.query(`
        update public.automation_flows set weekly_contact_interval_hours=$4, weekly_contact_inactivity_hours=$5
        where company_id=$1 and trigger_type='weekly_contact' and weekly_contact_interval_hours=$2
          and weekly_contact_inactivity_hours=$3 returning id`, [tenant, prevInterval, prevInactivity, nextInterval, nextInactivity]);
      assert.deepEqual((await update(foreignCompany, 0, 0, 144, 72)).rows, []);
      assert.deepEqual((await update(company, 0, 24, 144, 72)).rows, [{ id: flow }]);
      assert.deepEqual((await update(company, 0, 24, 168, 0)).rows, []);
      assert.deepEqual((await update(company, 144, 24, 168, 0)).rows, []);
    } finally {
      await db.exec("rollback");
    }
  });
  await t.test("weekly fields require same-tenant WhatsApp permission for trainers", async () => {
    const scope = async (role, user) => {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('sett.test_actor', $1, true)", [user]);
    };
    const denied = async (statement, params) => {
      await db.exec("savepoint forbidden_write");
      await assert.rejects(() => db.query(statement, params), { code: "42501", message: "weekly_contact_conditions_forbidden" });
      await db.exec("rollback to forbidden_write; release forbidden_write");
    };
    const edit = "update automation_flows set weekly_contact_interval_hours=144 where id=$1 returning id";
    await db.exec("begin");
    try {
      // Permission in a different company cannot authorize this trainer.
      await db.query("insert into role_permissions values ($1,'trainer','whatsapp',true), ($2,'trainer','whatsapp',false)", [foreignCompany, company]);
      await scope("authenticated", trainer);
      await denied(edit, [flow]);
      await denied("update automation_flows set weekly_contact_inactivity_hours=36 where id=$1", [flow]);
      await denied("insert into automation_flows(id,company_id,is_active,trigger_type,weekly_contact_interval_hours) values (gen_random_uuid(),$1,true,'weekly_contact',144)", [company]);
      assert.deepEqual((await db.query("update automation_flows set is_active=false where id=$1 returning id", [flow])).rows, [{ id: flow }]);
      await db.exec("reset role");
      await db.query("update role_permissions set enabled=true where company_id=$1", [company]);
      await scope("authenticated", trainer);
      assert.deepEqual((await db.query(edit, [flow])).rows, [{ id: flow }]);
      await scope("authenticated", master);
      assert.deepEqual((await db.query("update automation_flows set weekly_contact_interval_hours=168 where id=$1 returning id", [flow])).rows, [{ id: flow }]);
      await scope("service_role", "");
      assert.deepEqual((await db.query("update automation_flows set weekly_contact_interval_hours=0 where id=$1 returning id", [flow])).rows, [{ id: flow }]);
    } finally {
      await db.exec("rollback");
    }
  });

  await t.test("an automation receipt overrides a manual label in the inactivity guard", async () => {
    const stamp = "2026-11-09T15:00:00Z";
    const eligibility = () => scalar("select weekly_contact_eligibility($1,$2,$3,$4,1,$5,$6) result",
      [flow, chat, student, recipient, owner, stamp]);
    await db.exec(`begin;
      update whatsapp_chats set created_at='2026-10-20';
      insert into flow_sessions(id,flow_id,chat_id,status,context) values ('${owner}','${flow}','${chat}','completed','{}');
      insert into whatsapp_messages values ('${chat}','${company}','2026-11-09T12:00:00Z',null,true,'sent','text','panel_manual',null,'provider-echo');`);
    try {
      assert.equal(await eligibility(), "weekly_contact_conversation_active");
      await db.query(`insert into automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state,provider_message_id)
        values ('flow',$1,'message',$2,'acked','provider-echo')`, [owner, lease]);
      assert.equal(await eligibility(), "eligible");
    } finally {
      await db.exec("rollback");
    }
  });

  await t.test("weekly flow rules are independent and additive to the company safety limits", async () => {
    const historical = "00000000-0000-0000-0000-000000000020";
    const stamp = "2026-11-09T15:00:00Z";
    const at = () => scalar("select weekly_contact_eligibility($1,$2,$3,$4,1,$5,$6) result",
      [flow, chat, student, recipient, owner, stamp]);
    await db.exec(`begin;
      update enrollments set start_date='2026-11-08',end_date='2026-11-10';
      update whatsapp_chats set created_at='2026-10-20';
      update automation_flows set weekly_contact_inactivity_hours=0 where id='${flow}';
      insert into company_product_settings values ('${company}', '{"contact_policy":{"minimum_interval_hours":96,"max_weekly_contacts":2}}');
      insert into flow_sessions(id,flow_id,chat_id,status,context)
        values ('${historical}', '${flow}', '${chat}', 'cancelled',
          '{"trigger_type":"weekly_contact","student_id":"${student}"}');
      insert into automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state,acknowledged_at)
        values ('flow','${historical}','message','${lease}','acked','2026-11-05T11:00:00Z');
      insert into whatsapp_messages values ('${chat}','${company}','2026-11-09T12:00:00Z',null,false,'sent','text','provider_live',null,'recent-activity');`);
    const setRules = (extra, inactive) => db.query("update automation_flows set weekly_contact_interval_hours=$1, weekly_contact_inactivity_hours=$2 where id=$3", [extra, inactive, flow]);
    try {
      assert.equal(await scalar("select weekly_contact_interval_hours result from automation_flows where id=$1", [flow]), 0);
      assert.equal(await at(), "eligible"); // Both optional rules off, company floor satisfied.
      await setRules(120, 0);
      assert.equal(await at(), "weekly_contact_interval_blocked");
      await setRules(0, 24);
      assert.equal(await at(), "weekly_contact_conversation_active");
      await setRules(120, 24);
      assert.equal(await at(), "weekly_contact_conversation_active");
      await db.exec("delete from whatsapp_messages where message_id_external='recent-activity'");
      assert.equal(await at(), "weekly_contact_interval_blocked"); // Meeting either condition alone is insufficient.
      await setRules(100, 24);
      assert.equal(await at(), "eligible"); // Exact 100h boundary is allowed.
      await setRules(1, 0);
      await db.exec(`update automation_dispatch_attempts set acknowledged_at='2026-11-05T16:00:00Z' where owner_id='${historical}'`);
      assert.equal(await at(), "weekly_contact_interval_blocked"); // 95h is below the company floor.
      await setRules(0, 0);
      assert.equal(await at(), "weekly_contact_interval_blocked");
      await db.exec(`update automation_dispatch_attempts set acknowledged_at='2026-11-05T11:00:00Z' where owner_id='${historical}';
        update company_product_settings set settings=jsonb_set(settings,'{contact_policy,max_weekly_contacts}', '1') where company_id='${company}'`);
      assert.equal(await at(), "weekly_contact_interval_blocked"); // The cap still wins.
      await db.exec("update students set opted_in=false");
      assert.equal(await at(), "weekly_contact_ineligible");
      assert.equal(await scalar("select has_function_privilege('authenticated','public.weekly_contact_eligibility(uuid,uuid,uuid,text,bigint,uuid,timestamptz)','execute') result"), false);
      await assert.rejects(() => setRules(721, 0), { code: '23514' });
    } finally {
      await db.exec("rollback");
    }
  });

});
