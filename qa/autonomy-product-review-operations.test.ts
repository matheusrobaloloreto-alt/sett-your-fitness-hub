import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companyOperationTransitionAllowed} from '../supabase/functions/_shared/company-operation-transitions.ts';

// Existing local dependency only; no install, port, Docker or application database.
const modulePath=process.env.SETT_TEST_PGLITE_MODULE;
test('operations SQL denies disabled transitions including status-derived legacy stages', {skip:!modulePath,timeout:30000},async()=>{
 const {PGlite}=await import(modulePath!);
 const db=new PGlite();
 try {
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create schema auth;create schema commercial_private;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('qa.role',true)$$;
   create type public.app_role as enum('master','admin','coordinator','trainer','student');
   create table companies(id uuid primary key);
   create table company_members(company_id uuid,user_id uuid);
   create table user_roles(user_id uuid,role app_role);
   create table students(id uuid primary key,company_id uuid,status text,sales_stage text);
   create table leads(id uuid primary key,company_id uuid,stage text);
   create table company_commercial_settings(company_id uuid,settings jsonb);
   create function public.has_role(uuid,app_role) returns boolean language sql stable security definer as $$select exists(select 1 from user_roles where user_id=$1 and role=$2)$$;
   create function public.can_manage_company_commercial(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from company_members where company_id=$1 and user_id=auth.uid()) and has_role(auth.uid(),'admin')$$;
   create function public.commercial_plain_text(jsonb,integer) returns boolean language sql immutable as $$select jsonb_typeof($1)='string' and length($1#>>'{}')<=$2$$;
   create function public.company_feature_allowed(uuid,text) returns boolean language sql stable as $$select true$$;
   create function commercial_private.feature_allowed(uuid,text) returns boolean language sql stable as $$select true$$;
   grant usage on schema public,auth,commercial_private to authenticated,service_role;
   insert into auth.users values('00000000-0000-0000-0000-000000000001');
   insert into companies values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
   insert into company_members values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
   insert into user_roles values('00000000-0000-0000-0000-000000000001','admin');
   select set_config('qa.uid','00000000-0000-0000-0000-000000000001',false);
   select set_config('qa.role','authenticated',false);
  `);
  await db.exec(readFileSync('supabase/migrations/20261028113017_company_operations.sql','utf8'));
  const company='10000000-0000-0000-0000-000000000001';
  await db.exec(`set role authenticated;`);
  const settings=(await db.query('select public.get_company_operations($1) as value',[company])).rows[0].value.settings;
  settings.transitions=[];
  await db.query('select public.save_company_operations($1,$2::jsonb,0)',[company,JSON.stringify(settings)]);
  await assert.rejects(db.query('select public.save_company_operations($1,$2::jsonb,0)',[company,JSON.stringify(settings)]),{code:'PT409'});
  await assert.rejects(db.query('select public.get_company_operations($1)',['10000000-0000-0000-0000-000000000002']),{code:'42501'});
  await db.exec(`reset role;select set_config('qa.role','service_role',false);set role service_role;`);
  await assert.rejects(db.query('select public.assert_company_operation_transition($1,$2,$3)',[company,'lost','interested']),{code:'42501'});
  await assert.rejects(db.query('select public.assert_company_operation_transition($1,$2,$3)',[company,'interested','active']),{code:'22023'});
  await db.exec(`reset role;insert into students values('20000000-0000-0000-0000-000000000001','${company}','inactive',null);`);
  await assert.rejects(db.exec(`update students set sales_stage='interested' where id='20000000-0000-0000-0000-000000000001';`),{code:'42501'});
  // Same effective lost -> interested change through status must not bypass policy.
  await assert.rejects(db.exec(`update students set status='interested' where id='20000000-0000-0000-0000-000000000001';`),{code:'42501'});
 } finally {await db.close();}
});


test('preflight denies transport failures and preserves explicit protected lifecycle stages',async()=>{
 assert.equal(await companyOperationTransitionAllowed({rpc:async()=>{throw Error('synthetic transport failure');}},'synthetic','interested','contacted'),false);
 assert.equal(await companyOperationTransitionAllowed({rpc:async()=>({data:true,error:{code:'42501'}})},'synthetic','interested','contacted'),false);
 let calls=0;
 const rpc=async()=>{calls++;return {data:false,error:null};};
 for(const stage of ['payment_pending','active_onboarding','active']) assert.equal(await companyOperationTransitionAllowed({rpc},'synthetic',stage,'fiscal_registration_pending'),true);
 assert.equal(calls,0);
});

test('Edge raw-null student source must not turn inactive lost into interested before creating links',async()=>{
 const student={status:'inactive',sales_stage:null};
 // Current Edge caller passes status explicitly so NULL sales_stage derives lost for an inactive student.
 const rpc=async(_name:string,args:Record<string,unknown>)=>({data:args._source==='interested',error:null});
 assert.equal(await companyOperationTransitionAllowed({rpc},'synthetic',student.sales_stage,'fiscal_registration_pending',student.status),false);
});
