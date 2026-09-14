#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const modulePath = process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite";
const { PGlite } = await import(modulePath);

const projectRoot = process.cwd();
const migrationPath = resolve(projectRoot, "supabase/migrations/20260914152000_trainer_company_dashboard_read_access.sql");
const migrationSql = await readFile(migrationPath, "utf8");

const ids = {
  trainer: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000002",
  coordinator: "10000000-0000-4000-8000-000000000003",
  otherTrainer: "10000000-0000-4000-8000-000000000004",
  company: "20000000-0000-4000-8000-000000000001",
  otherCompany: "20000000-0000-4000-8000-000000000002",
  assignedStudent: "30000000-0000-4000-8000-000000000001",
  companyStudent: "30000000-0000-4000-8000-000000000002",
  otherStudent: "30000000-0000-4000-8000-000000000003",
  alertCompany: "40000000-0000-4000-8000-000000000001",
  alertOther: "40000000-0000-4000-8000-000000000002",
  alertOwn: "40000000-0000-4000-8000-000000000003",
};

const db = new PGlite();

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
};

const scalar = async (sql, params = []) => {
  const result = await db.query(sql, params);
  return result.rows[0]?.value;
};

const expectRejected = async (sql, label) => {
  try {
    await db.query(sql);
  } catch {
    return;
  }
  throw new Error(`${label}: expected statement to be rejected`);
};

await db.exec(`
  set time zone 'America/Sao_Paulo';
  create schema if not exists auth;
  create role anon;
  create role authenticated;
  create role service_role;

  create type public.app_role as enum ('admin', 'coordinator', 'trainer', 'master', 'student');

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table public.company_members (
    company_id uuid not null,
    user_id uuid not null,
    primary key (company_id, user_id)
  );

  create table public.user_roles (
    user_id uuid not null,
    role public.app_role not null,
    primary key (user_id, role)
  );

  create table public.staff_permissions (
    company_id uuid not null,
    user_id uuid not null,
    permission text not null,
    enabled boolean not null default false,
    primary key (company_id, user_id, permission)
  );

  create table public.students (
    id uuid primary key,
    company_id uuid not null,
    assigned_trainer_id uuid
  );

  create table public.enrollments (
    id uuid primary key,
    company_id uuid not null,
    student_id uuid not null,
    trainer_id uuid
  );

  create table public.admin_alerts (
    id uuid primary key,
    company_id uuid not null,
    target_user_id uuid,
    student_id uuid,
    enrollment_id uuid,
    resolved_at timestamptz,
    resolved_by uuid
  );

  create table public.leads (
    id uuid primary key,
    company_id uuid not null,
    full_name text not null,
    stage text not null,
    converted_to_student_id uuid
  );

  grant select on public.company_members, public.user_roles, public.staff_permissions, public.students, public.enrollments to authenticated;
  grant select, update on public.admin_alerts to authenticated;
  grant select on public.leads to authenticated;

  create or replace function public.has_role(_user_id uuid, _role public.app_role)
  returns boolean
  language sql
  stable
  as $$
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = _user_id and ur.role = _role
    )
  $$;

  create or replace function public.get_user_company_id(_user_id uuid)
  returns uuid
  language sql
  stable
  as $$
    select cm.company_id
    from public.company_members cm
    where cm.user_id = _user_id
    order by cm.company_id
    limit 1
  $$;

  create or replace function public.is_company_staff(_user_id uuid, _company_id uuid)
  returns boolean
  language sql
  stable
  as $$
    select exists (
      select 1
      from public.company_members cm
      join public.user_roles ur on ur.user_id = cm.user_id
      where cm.user_id = _user_id
        and cm.company_id = _company_id
        and ur.role in ('admin'::public.app_role, 'coordinator'::public.app_role, 'trainer'::public.app_role)
    )
  $$;

  create or replace function public.has_staff_permission(_company_id uuid, _permission text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select
      auth.uid() is not null
      and _permission = 'company_dashboard_full'
      and exists (
        select 1
        from public.company_members cm
        join public.user_roles ur on ur.user_id = cm.user_id
        join public.staff_permissions sp
          on sp.company_id = cm.company_id
         and sp.user_id = cm.user_id
         and sp.permission = _permission
         and sp.enabled
        where cm.company_id = _company_id
          and cm.user_id = auth.uid()
          and ur.role = 'trainer'::public.app_role
      )
  $$;

  create or replace function public.can_read_staff_student(_company_id uuid, _student_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select
      auth.uid() is not null
      and exists (
        select 1 from public.students s
        where s.id = _student_id and s.company_id = _company_id
      )
      and (
        public.has_role(auth.uid(), 'master'::public.app_role)
        or (
          public.is_company_staff(auth.uid(), _company_id)
          and (
            public.has_role(auth.uid(), 'admin'::public.app_role)
            or public.has_role(auth.uid(), 'coordinator'::public.app_role)
            or public.has_staff_permission(_company_id, 'company_dashboard_full')
            or exists (
              select 1 from public.students assigned
              where assigned.id = _student_id
                and assigned.company_id = _company_id
                and assigned.assigned_trainer_id = auth.uid()
            )
            or exists (
              select 1 from public.enrollments e
              where e.student_id = _student_id
                and e.company_id = _company_id
                and e.trainer_id = auth.uid()
            )
          )
        )
      )
  $$;

  create or replace function public.can_manage_staff_student(_company_id uuid, _student_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select
      auth.uid() is not null
      and exists (
        select 1 from public.students s
        where s.id = _student_id and s.company_id = _company_id
      )
      and (
        public.has_role(auth.uid(), 'master'::public.app_role)
        or (
          public.is_company_staff(auth.uid(), _company_id)
          and (
            public.has_role(auth.uid(), 'admin'::public.app_role)
            or public.has_role(auth.uid(), 'coordinator'::public.app_role)
            or exists (
              select 1 from public.students assigned
              where assigned.id = _student_id
                and assigned.company_id = _company_id
                and assigned.assigned_trainer_id = auth.uid()
            )
            or exists (
              select 1 from public.enrollments e
              where e.student_id = _student_id
                and e.company_id = _company_id
                and e.trainer_id = auth.uid()
            )
          )
        )
      )
  $$;

  alter table public.admin_alerts enable row level security;
  alter table public.leads enable row level security;

  create policy "admin alerts staff update"
  on public.admin_alerts for update to authenticated
  using (
    public.is_company_staff(auth.uid(), admin_alerts.company_id)
    and (
      admin_alerts.target_user_id = auth.uid()
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    )
  )
  with check (
    public.is_company_staff(auth.uid(), admin_alerts.company_id)
    and admin_alerts.company_id is not null
    and (
      admin_alerts.target_user_id = auth.uid()
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    )
    and (
      admin_alerts.target_user_id is null
      or exists (
        select 1 from public.company_members cm
        where cm.user_id = admin_alerts.target_user_id
          and cm.company_id = admin_alerts.company_id
      )
    )
    and (
      admin_alerts.student_id is null
      or exists (
        select 1 from public.students s
        where s.id = admin_alerts.student_id
          and s.company_id = admin_alerts.company_id
      )
    )
    and (
      admin_alerts.enrollment_id is null
      or exists (
        select 1 from public.enrollments e
        where e.id = admin_alerts.enrollment_id
          and e.company_id = admin_alerts.company_id
      )
    )
  );

  create policy staff_leads on public.leads
  for all to authenticated
  using (company_id in (select leads.company_id from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','coordinator','trainer','master')));

  create policy "Company staff manage leads" on public.leads
  for all to authenticated
  using (
    public.is_company_staff(auth.uid(), company_id)
    or public.has_role(auth.uid(), 'master'::public.app_role)
  )
  with check (
    public.is_company_staff(auth.uid(), company_id)
    or public.has_role(auth.uid(), 'master'::public.app_role)
  );
`);


// The minimal table schema covers real projected columns; RLS is enabled on actual
// parents and children below. These policies are NOT bypassed by the test caller.
await db.exec(`
  alter table students add column full_name text default 'Student', add column status text default 'active', add column birth_date date default current_date,
    add column selected_plan_id uuid, add column created_at timestamptz default now(), add column sales_stage text,
    add column fiscal_completed_at timestamptz, add column payment_link_sent_at timestamptz, add column activated_at timestamptz,
    add column assessment_due_at timestamptz, add column onboarding_instructions_sent_at timestamptz,
    add column country_code text default 'BR', add column whatsapp text, add column phone text, add column email text,
    add column address text, add column city text, add column state text, add column cpf text, add column cep text,
    add column address_number text, add column neighborhood text;
  alter table enrollments add column status text default 'active', add column end_date date default current_date+5,
    add column training_start_date date default current_date-10, add column payment_status text default 'pending', add column plan_id uuid;
  alter table admin_alerts add column type text default 'test', add column severity text default 'info', add column title text default 'Alerta',
    add column message text, add column created_at timestamptz default now();
  create table plans(id uuid primary key,company_id uuid,name text,plan_kind text);
  create table profiles(user_id uuid primary key,full_name text);
  create table training_cycles(id uuid primary key,company_id uuid,student_id uuid,enrollment_id uuid,cycle_number int default 1,
    start_date date default current_date-10,end_date date default current_date+5,status text default 'active',prescribed_offline_at timestamptz,
    prescription_cleared_at timestamptz,superseded_at timestamptz,superseded_by_cycle_id uuid);
  create table workouts(id uuid primary key,company_id uuid,cycle_id uuid,exercises jsonb default '[]',superseded_at timestamptz);
  create table prescription_bundles(id uuid primary key,company_id uuid,student_id uuid,training_cycle_id uuid,created_at timestamptz default now(),
    status text default 'active',has_strength bool,has_cardio bool,has_swimming bool,has_cycling bool,has_nutrition bool,
    strength_plan_id uuid,running_plan_id uuid,nutrition_plan_id uuid);
  create table prescription_bundle_items(id uuid primary key,company_id uuid,student_id uuid,bundle_id uuid,entity_id uuid,entity_type text,modality text);
  create table ai_strength_plans(id uuid primary key,company_id uuid,student_id uuid,bundle_id uuid,training_cycle_id uuid);
  create table running_plans(id uuid primary key,company_id uuid,student_id uuid,bundle_id uuid,training_cycle_id uuid);
  create table nutrition_plans(id uuid primary key,company_id uuid,student_id uuid,bundle_id uuid,training_cycle_id uuid);
  create table cycle_feedback(id uuid primary key,company_id uuid,student_id uuid,cycle_id uuid,enrollment_id uuid,nps int,
    wants_adjustment bool,adjustment_notes text,created_at timestamptz default now(),applied bool default false);
  create table payments(id uuid primary key,company_id uuid,student_id uuid,enrollment_id uuid,status text);
  create table workout_sessions(id uuid primary key,company_id uuid,student_id uuid,workout_id uuid,status text,completed_at timestamptz);
  create table functional_assessments(id uuid primary key,company_id uuid,student_id uuid,created_at timestamptz);
  create table student_body_limitations(id uuid primary key,company_id uuid,student_id uuid,region text,severity text,created_at timestamptz default now());
  create table whatsapp_chats(id uuid primary key,company_id uuid,student_id uuid,contact_name text,cadence_muted bool default false,remote_jid text default 'fixture@s.whatsapp.net');
  create table whatsapp_messages(id uuid primary key,company_id uuid,chat_id uuid,timestamp timestamptz,is_from_me bool,body text);
  grant select,insert,update,delete on all tables in schema public to authenticated;
`);

// Use the exact canonical parent + alerts SELECT policies, retaining the full
// audited alert UPDATE WITH CHECK fixture above. No synthetic allow-all parents.
const permissionsSql = await readFile(resolve(projectRoot, 'supabase/migrations/20260820113000_add_explicit_staff_permissions.sql'),'utf8');
for (const table of ['students','enrollments','training_cycles','workouts']) await db.exec(`alter table public.${table} enable row level security`);
const parentPolicySection = permissionsSql.slice(permissionsSql.indexOf('create policy "Company staff read accessible students"'),permissionsSql.indexOf('drop policy if exists "admin alerts staff select"'));
await db.exec(parentPolicySection);
const alertSelect = permissionsSql.match(/create policy "admin alerts staff select"[\s\S]*?;/)[0];
await db.exec(alertSelect);

const children = ['payments','functional_assessments','workout_sessions','student_body_limitations'];
const childSecuritySql = await readFile(resolve(projectRoot, 'supabase/migrations/20260815062126_remove_legacy_same_company_student_leaks.sql'),'utf8');
for (const table of children) {
  await db.exec(`alter table public.${table} enable row level security`);
  const policies = [...childSecuritySql.matchAll(/create policy [\s\S]*?;/gi)].map(m => m[0]).filter(sql => sql.includes('Company staff manage') && new RegExp(`on public\\.${table} for all to authenticated`,'i').test(sql));
  if (policies.length !== 1) throw new Error(`Expected one real staff ALL policy for ${table}, got ${policies.length}`);
  await db.exec(policies[0]);
  await db.exec(`create policy "Master full access" on public.${table} for all to authenticated using (public.has_role(auth.uid(),'master')) with check(public.has_role(auth.uid(),'master'))`);
}

// Deterministic UUIDs make corrupt relationships auditable in the fixture.
const uid = (category,n) => `${String(category).padStart(8,'0')}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const master = uid(1,90), studentUser=uid(1,91);
const sid=[ids.assignedStudent,ids.companyStudent,ids.otherStudent];
const cid=[ids.company,ids.company,ids.otherCompany];
const eid=[1,2,3].map(i=>uid(50,i)), cycles=[1,2,3].map(i=>uid(51,i)), workouts=[1,2,3].map(i=>uid(52,i));
const childId=(t,i)=>uid(60+children.indexOf(t),i+1);
const login=async(user,role='authenticated')=>db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${user||''}',false)`);
const owner=async()=>db.exec('reset role');
const snapshot=async(company=ids.company)=>(await db.query('select public.get_company_dashboard_snapshot($1) as value',[company])).rows[0].value;
const sqlQuote=s=>`'${s}'`;
await db.exec(`
 insert into company_members(company_id,user_id) values ('${ids.company}','${ids.trainer}'),('${ids.company}','${ids.admin}'),('${ids.company}','${ids.coordinator}'),('${ids.company}','${ids.otherTrainer}'),('${ids.otherCompany}','${ids.otherTrainer}'),('${ids.company}','${studentUser}');
 insert into user_roles(user_id,role) values ('${ids.trainer}','trainer'),('${ids.admin}','admin'),('${ids.coordinator}','coordinator'),('${ids.otherTrainer}','trainer'),('${master}','master'),('${studentUser}','student');
 insert into profiles(user_id,full_name) values ('${ids.trainer}','Treinador A'),('${ids.otherTrainer}','Treinador B'),('${ids.admin}','Admin'),('${ids.coordinator}','Coordenador');
 insert into plans values ('${uid(49,1)}','${ids.company}','Plano A','standard'),('${uid(49,2)}','${ids.otherCompany}','FORBIDDEN PLAN','standard');
`);
for(let i=0;i<3;i++){
  await db.exec(`
   insert into students(id,company_id,assigned_trainer_id,full_name,email,cpf,address) values ('${sid[i]}','${cid[i]}','${i===0?ids.trainer:ids.otherTrainer}','${['Aluno atribuído','Colega não atribuído','FORBIDDEN TENANT'][i]}','private@example.invalid','123SECRETCPF','PRIVATE ADDRESS');
   insert into enrollments(id,company_id,student_id,trainer_id,plan_id) values ('${eid[i]}','${cid[i]}','${sid[i]}','${i===0?ids.trainer:ids.otherTrainer}','${uid(49,i===2?2:1)}');
   insert into training_cycles(id,company_id,student_id,enrollment_id) values ('${cycles[i]}','${cid[i]}','${sid[i]}','${eid[i]}');
   insert into workouts(id,company_id,cycle_id,exercises) values ('${workouts[i]}','${cid[i]}','${cycles[i]}','[{"name":"Teste"}]');
   insert into cycle_feedback(id,company_id,student_id,cycle_id,enrollment_id,nps,wants_adjustment) values ('${uid(53,i+1)}','${cid[i]}','${sid[i]}','${cycles[i]}','${eid[i]}',${[9,5,2][i]},${i===1});
   insert into whatsapp_chats(id,company_id,student_id,contact_name) values ('${uid(54,i+1)}','${cid[i]}','${sid[i]}','Contato ${i}');
   insert into whatsapp_messages values ('${uid(55,i+1)}','${cid[i]}','${uid(54,i+1)}',now()-interval '2 days',false,'PRIVATE RAW MESSAGE');
  `);
  for(const table of children) await db.exec(`insert into ${table}(id,company_id,student_id) values ('${childId(table,i)}','${cid[i]}','${sid[i]}')`);
}
await db.exec(`
 update payments set status='PENDING';
 insert into admin_alerts(id,company_id,student_id,title) values ('${ids.alertCompany}','${ids.company}','${sid[1]}','GENERAL ALERT'),('${ids.alertOther}','${ids.otherCompany}','${sid[2]}','FORBIDDEN TENANT ALERT');
 insert into admin_alerts(id,company_id,student_id,enrollment_id,target_user_id,title) values
 ('${ids.alertOwn}','${ids.company}','${sid[0]}','${eid[0]}','${ids.trainer}','TRAINER OWN ALERT'),
 ('${uid(40,92)}','${ids.company}','${sid[1]}','${eid[1]}','${ids.otherTrainer}','PRIVATE OTHER TRAINER ALERT');
 insert into leads values ('${uid(56,1)}','${ids.company}','Lead One','interested',null),('${uid(56,2)}','${ids.company}','Lead Two','contacted',null),('${uid(56,3)}','${ids.otherCompany}','FORBIDDEN LEAD','interested',null);
 -- Renewal-specific list is deliberately different from the 7-day summary.
 insert into enrollments(id,company_id,student_id,status,end_date,plan_id) values ('${uid(50,10)}','${ids.company}','${sid[1]}','active',current_date+20,'${uid(49,1)}'),('${uid(50,11)}','${ids.company}','${sid[1]}','awaiting_renewal',current_date-2,'${uid(49,1)}');
 -- One genuine monthly prescription with two distinct aerobic entities.
 insert into prescription_bundles(id,company_id,student_id,training_cycle_id,has_strength,has_cardio,has_swimming,has_cycling,has_nutrition,strength_plan_id,running_plan_id,nutrition_plan_id) values ('${uid(70,1)}','${ids.company}','${sid[1]}','${cycles[1]}',true,true,true,true,true,'${uid(71,1)}','${uid(72,1)}','${uid(73,1)}');
 insert into ai_strength_plans values ('${uid(71,1)}','${ids.company}','${sid[1]}','${uid(70,1)}','${cycles[1]}');
 insert into running_plans values ('${uid(72,1)}','${ids.company}','${sid[1]}','${uid(70,1)}','${cycles[1]}'),('${uid(72,2)}','${ids.company}','${sid[1]}','${uid(70,1)}','${cycles[1]}');
 insert into nutrition_plans values ('${uid(73,1)}','${ids.company}','${sid[1]}','${uid(70,1)}','${cycles[1]}');
 insert into prescription_bundle_items values
 ('${uid(74,1)}','${ids.company}','${sid[1]}','${uid(70,1)}','${uid(71,1)}','ai_strength_plan','musculacao'),
 ('${uid(74,2)}','${ids.company}','${sid[1]}','${uid(70,1)}','${uid(72,1)}','running_plan','corrida'),
 ('${uid(74,3)}','${ids.company}','${sid[1]}','${uid(70,1)}','${uid(72,2)}','running_plan','natação'),
 ('${uid(74,4)}','${ids.company}','${sid[1]}','${uid(70,1)}','${uid(73,1)}','nutrition_plan','nutricao');
`);

// Snapshot every pre-existing routine + policy, excluding ONLY legacy staff_leads.
const catalog=async()=>{
 const result=await db.query(`select 'function:'||p.proname||'/'||p.proargtypes::text as name,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname <> 'get_company_dashboard_snapshot'
 union all select 'policy:'||tablename||'/'||policyname,concat(cmd,'|',roles::text,'|',qual,'|',with_check) from pg_policies where schemaname='public' and policyname <> 'staff_leads' order by name`);
 return JSON.stringify(result.rows);
};
const beforeCatalog=await catalog();
const deniedCodes=[];
const rejected42501=async(sql,label)=>{
 try{await db.query(sql);}catch(e){assertEqual(e.code,'42501',label+' SQLSTATE');deniedCodes.push(label);return;}
 throw new Error(label+': expected 42501');
};
const changedRows=async(sql)=>Number(await scalar(`with changed as (${sql} returning 1) select count(*)::int as value from changed`));
async function assertDirectBoundary(phase){
 await login(ids.trainer);
 for(const table of ['students','enrollments','training_cycles','workouts']){
   const col=table==='students'?'id':'student_id';
   if(table==='workouts'){
     assertEqual(Number(await scalar(`select count(*)::int as value from workouts where id='${workouts[1]}'`)),0,phase+' unassigned workout invisible');
   }else assertEqual(Number(await scalar(`select count(*)::int as value from ${table} where ${col}='${sid[1]}'`)),0,phase+' unassigned '+table+' invisible');
 }
 assertEqual(Number(await scalar(`select count(*)::int as value from students where id='${sid[0]}'`)),1,phase+' assigned student visible');
 assertEqual(await scalar(`select has_staff_permission('${ids.company}','company_dashboard_full') as value`),false,phase+' explicit permission unchanged');
 for(const table of children){
   assertEqual(Number(await scalar(`select count(*)::int as value from ${table} where id='${childId(table,1)}'`)),0,phase+' child select denied '+table);
   assertEqual(await changedRows(`update ${table} set student_id=student_id where id='${childId(table,1)}'`),0,phase+' child update denied '+table);
   assertEqual(await changedRows(`delete from ${table} where id='${childId(table,1)}'`),0,phase+' child delete denied '+table);
   await rejected42501(`insert into ${table}(id,company_id,student_id) values('${uid(99,children.indexOf(table)+1)}','${ids.company}','${sid[1]}')`,phase+' child insert denied '+table);
   await rejected42501(`update ${table} set student_id='${sid[1]}' where id='${childId(table,0)}'`,phase+' child relink unassigned denied '+table);
   await rejected42501(`update ${table} set student_id='${sid[2]}',company_id='${ids.otherCompany}' where id='${childId(table,0)}'`,phase+' child tenant relink denied '+table);
   assertEqual(await changedRows(`update ${table} set student_id=student_id where id='${childId(table,0)}'`),1,phase+' assigned update remains '+table);
   await db.exec('begin');
   assertEqual(await changedRows(`delete from ${table} where id='${childId(table,0)}'`),1,phase+' assigned delete remains '+table);
   await db.exec('rollback');
   await db.exec('begin');
   await db.exec(`insert into ${table}(id,company_id,student_id) values('${uid(98,children.indexOf(table)+1)}','${ids.company}','${sid[0]}')`);
   await db.exec('rollback');
 }
 assertEqual(await changedRows(`update admin_alerts set resolved_at=now() where id='${ids.alertCompany}'`),0,phase+' company alert write denied');
 await rejected42501(`update admin_alerts set student_id='${sid[2]}',enrollment_id='${eid[2]}' where id='${ids.alertOwn}'`,phase+' alert cross-tenant parents denied');
 await rejected42501(`update admin_alerts set student_id='${sid[1]}' where id='${ids.alertOwn}'`,phase+' alert unassigned parent denied');
 await rejected42501(`update workouts set cycle_id='${cycles[1]}' where id='${workouts[0]}'`,phase+' workout relink denied');
 await rejected42501(`update enrollments set student_id='${sid[1]}' where id='${eid[0]}'`,phase+' enrollment relink denied');
 await rejected42501(`update training_cycles set student_id='${sid[1]}' where id='${cycles[0]}'`,phase+' cycle relink denied');
}
await assertDirectBoundary('before');
// Negative control: reproduce the discarded broad-read grant inside a transaction.
// It must unlock all four child ALL policies, proving this canary catches escalation.
await owner();
await db.exec(`begin;
 create or replace function public.has_staff_permission(_company_id uuid,_permission text)
 returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and _company_id is not null and _permission='company_dashboard_full'
 and exists(select 1 from public.company_members cm join public.user_roles ur on ur.user_id=cm.user_id
 where cm.company_id=_company_id and cm.user_id=auth.uid() and ur.role='trainer'::public.app_role)
 $$;
`);
await login(ids.trainer);
assertEqual(Number(await scalar(`select count(*)::int as value from students where id='${sid[1]}'`)),1,'negative control broad-read exposes unassigned parent');
for(const table of children){
 assertEqual(await changedRows(`update ${table} set student_id=student_id where id='${childId(table,1)}'`),1,'negative control broad-read unlocks UPDATE '+table);
 await db.exec(`insert into ${table}(id,company_id,student_id) values('${uid(97,children.indexOf(table)+1)}','${ids.company}','${sid[1]}')`);
 assertEqual(await changedRows(`delete from ${table} where id='${childId(table,1)}'`),1,'negative control broad-read unlocks DELETE '+table);
}
await db.exec('rollback');
await login(ids.trainer);
assertEqual(Number(await scalar('select count(*)::int as value from leads')),3,'legacy staff_leads demonstrates leak');
await owner();
await db.exec(migrationSql);
assertEqual(await catalog(),beforeCatalog,'all pre-existing functions and non-legacy policies byte-equivalent');
await assertDirectBoundary('after');
assertEqual(Number(await scalar('select count(*)::int as value from leads')),2,'legacy leak removed');
const trainerSnapshot=await snapshot();
assertEqual(trainerSnapshot.stats.totalStudents,2,'company-wide active count');
assertEqual(trainerSnapshot.stats.trainers,2,'company-wide trainer count');
assertEqual(trainerSnapshot.stats.interestedStudents,2,'scoped lead count');
assertEqual(trainerSnapshot.alerts.birthdays.length,2,'unassigned birthday included');
assertEqual(trainerSnapshot.renewals.awaitingRenewal.length,1,'unassigned renewal included');
assertEqual(trainerSnapshot.renewals.expiringContracts.length,3,'30 day coordinator renewal window');
assertEqual(trainerSnapshot.expiringContracts.length,3,'7 day summary includes expired renewal');
assertEqual(trainerSnapshot.contactCadence.find(r=>r.student_id===sid[1])?.kind,'aluno','unassigned contact remains aluno, never lead');
assertEqual(trainerSnapshot.cohortFeedback.reduce((n,r)=>n+r.alunos,0),2,'unassigned cohort included');
assertEqual(trainerSnapshot.pendingFeedback.length,2,'unassigned feedback included');
assertEqual(trainerSnapshot.alerts.pendingActions.length,2,'company alerts projection');
assertEqual(JSON.stringify(trainerSnapshot).includes('PRIVATE OTHER TRAINER ALERT'),false,'trainer cannot read another staff target alert');
assertEqual(trainerSnapshot.atRiskStudents.length,2,'attention panel includes unassigned');
const badges=trainerSnapshot.monthlyPrescriptions[0].completedBadges;
for(const [modality,expected] of Object.entries({cardio:true,cycling:false,strength:true,nutrition:true,swimming:true})) assertEqual(badges[modality],expected,'materialized modality '+modality);
for(const forbidden of ['123SECRETCPF','PRIVATE ADDRESS','private@example.invalid','PRIVATE RAW MESSAGE','FORBIDDEN TENANT','FORBIDDEN LEAD','FORBIDDEN PLAN']) assertEqual(JSON.stringify(trainerSnapshot).includes(forbidden),false,'payload excludes '+forbidden);
for(const user of [ids.admin,ids.coordinator,master]){
 await login(user);
 const privilegedSnapshot=await snapshot();
 assertEqual(privilegedSnapshot.alerts.pendingActions.length,3,'admin/coordinator/master sees company-targeted alerts '+user);
 assertEqual(JSON.stringify(privilegedSnapshot).includes('PRIVATE OTHER TRAINER ALERT'),true,'privileged role sees other staff target alert '+user);
 const comparablePrivileged=JSON.parse(JSON.stringify(privilegedSnapshot));
 const comparableTrainer=JSON.parse(JSON.stringify(trainerSnapshot));
 comparablePrivileged.alerts.pendingActions=[];
 comparableTrainer.alerts.pendingActions=[];
 assertEqual(JSON.stringify(comparablePrivileged),JSON.stringify(comparableTrainer),'staff/master operational snapshot parity '+user);
 for(const table of children)assertEqual(await changedRows(`update ${table} set student_id=student_id where id='${childId(table,1)}'`),1,'admin/coordinator/master child access preserved '+table);
}
await login(ids.otherTrainer);
const otherTrainerSnapshot=await snapshot();
assertEqual(otherTrainerSnapshot.alerts.pendingActions.length,2,'other trainer sees general and own targeted alerts');
assertEqual(JSON.stringify(otherTrainerSnapshot).includes('PRIVATE OTHER TRAINER ALERT'),true,'other trainer sees own targeted alert');
assertEqual(JSON.stringify(otherTrainerSnapshot).includes('TRAINER OWN ALERT'),false,'other trainer cannot read first trainer target alert');
await login(ids.trainer);
await rejected42501(`select get_company_dashboard_snapshot('${ids.otherCompany}')`,'foreign company RPC');
await rejected42501('select get_company_dashboard_snapshot(null)','null company RPC');
await login(studentUser);
await rejected42501(`select get_company_dashboard_snapshot('${ids.company}')`,'student role RPC');
await login('');
await rejected42501(`select get_company_dashboard_snapshot('${ids.company}')`,'missing auth RPC');
await login('', 'anon');
await rejected42501(`select get_company_dashboard_snapshot('${ids.company}')`,'anon execute revoked');
await owner();
assertEqual(await scalar(`select has_function_privilege('anon','get_company_dashboard_snapshot(uuid)','EXECUTE') as value`),false,'anon ACL');
assertEqual(await scalar(`select has_function_privilege('authenticated','get_company_dashboard_snapshot(uuid)','EXECUTE') as value`),true,'authenticated ACL');

// Corrupt FK graph: child company alone must never confer visibility or badges.
await db.exec(`
 insert into enrollments(id,company_id,student_id,plan_id) values ('${uid(50,90)}','${ids.company}','${sid[2]}','${uid(49,1)}');
 insert into training_cycles(id,company_id,student_id,enrollment_id) values ('${uid(51,90)}','${ids.company}','${sid[1]}','${eid[2]}');
 insert into workouts(id,company_id,cycle_id,exercises) values ('${uid(52,90)}','${ids.company}','${cycles[2]}','[{}]');
 insert into prescription_bundles(id,company_id,student_id,training_cycle_id) values ('${uid(70,90)}','${ids.company}','${sid[2]}','${cycles[2]}'),('${uid(70,91)}','${ids.company}','${sid[1]}','${cycles[2]}');
 insert into cycle_feedback(id,company_id,student_id,cycle_id,enrollment_id,nps) values ('${uid(53,90)}','${ids.company}','${sid[2]}','${cycles[2]}','${eid[2]}',1),('${uid(53,91)}','${ids.company}','${sid[1]}','${cycles[0]}','${eid[1]}',1);
 insert into whatsapp_chats(id,company_id,student_id,contact_name) values ('${uid(54,90)}','${ids.company}','${sid[2]}','FORBIDDEN CORRUPT CHAT');
 insert into whatsapp_messages values ('${uid(55,90)}','${ids.company}','${uid(54,90)}',now()-interval '4 days',false,'FORBIDDEN'),('${uid(55,91)}','${ids.otherCompany}','${uid(54,2)}',now(),false,'FORBIDDEN CROSS MESSAGE');
 insert into admin_alerts(id,company_id,student_id,enrollment_id,title) values ('${uid(40,90)}','${ids.company}','${sid[2]}','${eid[2]}','FORBIDDEN ALERT'),('${uid(40,91)}','${ids.company}','${sid[1]}','${eid[0]}','FORBIDDEN WRONG PARENT');
 insert into prescription_bundle_items values ('${uid(74,90)}','${ids.company}','${sid[2]}','${uid(70,1)}','${uid(72,2)}','running_plan','ciclismo');
`);
await login(ids.trainer);
assertEqual(JSON.stringify(await snapshot()),JSON.stringify(trainerSnapshot),'cross-company and mismatched parents cannot affect any card');

// Presence: empty, superseded, offline, failed/partial, and mismatched entity.
await owner();
await db.exec(`
 insert into training_cycles(id,company_id,student_id,enrollment_id,cycle_number,start_date,end_date,status) values
 ('${uid(51,10)}','${ids.company}','${sid[1]}','${eid[1]}',2,current_date+6,current_date+35,'scheduled');
 insert into workouts(id,company_id,cycle_id,exercises) values ('${uid(52,10)}','${ids.company}','${uid(51,10)}','[]');
 insert into prescription_bundles(id,company_id,student_id,training_cycle_id,status,has_cardio,running_plan_id) values ('${uid(70,10)}','${ids.company}','${sid[1]}','${uid(51,10)}','partial',true,'${uid(72,10)}');
 insert into running_plans values ('${uid(72,10)}','${ids.company}','${sid[1]}','${uid(70,10)}','${uid(51,10)}');
 insert into prescription_bundle_items values ('${uid(74,10)}','${ids.company}','${sid[1]}','${uid(70,10)}','${uid(72,10)}','running_plan','corrida');
`);
const readiness=async()=>{await login(ids.trainer);return (await snapshot()).cycleCountdowns.find(r=>r.student_id===sid[1]).next_ready;};
assertEqual(await readiness(),false,'empty workout + partial bundle not ready');
await owner();await db.exec(`update prescription_bundles set status='failed' where id='${uid(70,10)}'`);
assertEqual(await readiness(),false,'failed bundle not ready');
await owner();await db.exec(`update prescription_bundles set status='active' where id='${uid(70,10)}'`);
assertEqual(await readiness(),true,'real complete cardio makes next cycle ready');
await owner();await db.exec(`update running_plans set student_id='${sid[0]}' where id='${uid(72,10)}'`);
assertEqual(await readiness(),false,'entity belongs to wrong same-company student');
await owner();await db.exec(`update training_cycles set prescribed_offline_at=now() where id='${uid(51,10)}'`);
assertEqual(await readiness(),true,'offline cycle ready');
await owner();await db.exec(`update training_cycles set prescribed_offline_at=null where id='${uid(51,10)}';update workouts set exercises='[{}]' where id='${uid(52,10)}'`);
assertEqual(await readiness(),true,'nonempty exercises ready');
await owner();await db.exec(`update workouts set superseded_at=now() where id='${uid(52,10)}'`);
assertEqual(await readiness(),false,'superseded workout excluded');
await owner();await db.exec(`update training_cycles set status='superseded' where id='${uid(51,10)}'`);
assertEqual(await readiness(),false,'superseded cycle excluded');
console.log(`trainer company dashboard PGlite contract passed: parent/child RLS before+after, ${deniedCodes.length} SQLSTATE denials, role parity, tenant/parent corruption, complete projection, materialization, policy preservation`);
await db.close();
