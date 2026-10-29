// Local SQL authorization/transaction tests. Vault double is NOT encryption evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const modulePath = process.env.SETT_TEST_PGLITE_MODULE;
if (!modulePath) throw new Error('SETT_TEST_PGLITE_MODULE must point to an existing local PGlite module');
const { PGlite } = await import(modulePath);
const sql = readFileSync('supabase/migrations/20261029003808_tenant_integration_preparation.sql', 'utf8');
const companyA='10000000-0000-4000-8000-000000000001',companyB='10000000-0000-4000-8000-000000000002';
const adminA='20000000-0000-4000-8000-000000000001',adminB='20000000-0000-4000-8000-000000000002', master='20000000-0000-4000-8000-000000000003';
const trainer='20000000-0000-4000-8000-000000000004',coordinator='20000000-0000-4000-8000-000000000005',student='20000000-0000-4000-8000-000000000006';
const bundle={api_key:'synthetic-only-integration-key',environment:'sandbox'};
async function fixture(vault=true){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);create type public.app_role as enum('master','admin','trainer','coordinator','student');
 create table public.companies(id uuid primary key);create table public.company_members(company_id uuid,user_id uuid);
 create table public.user_roles(user_id uuid,role app_role);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create function public.has_role(uuid,app_role) returns boolean language sql stable security definer as $$select exists(select 1 from public.user_roles where user_id=$1 and role=$2)$$;
 grant usage on schema public,auth to authenticated;
 insert into companies values('${companyA}'),('${companyB}');
 insert into auth.users values('${adminA}'),('${adminB}'),('${master}'),('${trainer}'),('${coordinator}'),('${student}');
 insert into company_members values('${companyA}','${adminA}'),('${companyB}','${adminB}'),('${companyA}','${trainer}'),('${companyA}','${coordinator}'),('${companyA}','${student}');
 insert into user_roles values('${adminA}','admin'),('${adminB}','admin'),('${master}','master'),('${trainer}','trainer'),('${coordinator}','coordinator'),('${student}','student');`);
 if(vault)await db.exec(`create schema vault;
 create table vault.secrets(id uuid primary key default gen_random_uuid(), secret text not null);
 create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(text) returns uuid language plpgsql as $$declare result uuid;begin insert into vault.secrets(secret) values($1) returning id into result;return result;end$$;
 revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated;`);
 return db;
}
async function actor(db,id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('qa.uid',$1,false)",[id]);await db.exec(`set role ${role}`);}
async function status(db,c=companyA){return (await db.query('select public.get_company_integration_status($1) as value',[c])).rows[0].value;}
async function save(db,c=companyA,p='asaas',b=bundle,v=0){return (await db.query('select public.save_company_integration_credentials($1,$2,$3,$4) as value',[c,p,b,v])).rows[0].value;}
async function remove(db,c=companyA,p='asaas',v=1){return (await db.query('select public.remove_company_integration_credentials($1,$2,$3) as value',[c,p,v])).rows[0].value;}
test('Vault is mandatory and exposed Vault blocks migration, including column grants',async()=>{
 for(const mode of ['missing','table','column']){
  const db=await fixture(mode!=='missing');try{
   if(mode==='table')await db.exec('grant select on vault.decrypted_secrets to authenticated');
   if(mode==='column')await db.exec('grant select(decrypted_secret) on vault.decrypted_secrets to authenticated');
   await assert.rejects(db.exec(sql),{code:'55000'});
  }finally{await db.close();}
 }
});
test('write-only tenant lifecycle, authorization, format validation, conflicts and removal',async()=>{
 const db=await fixture();try{
  await db.exec(sql);await actor(db,adminA);
  assert.equal((await status(db))[0].version,0);
  const saved=await save(db);
  assert.deepEqual(saved[0],{provider:'asaas',configured:true,mask:'••••••••',version:1,consumer_enabled:false});
  assert.ok(!JSON.stringify(saved).includes(bundle.api_key));assert.ok(!JSON.stringify(saved).includes('sandbox'));
  await assert.rejects(save(db),{code:'PT409'});
  await assert.rejects(db.query('select * from integration_private.credentials'),{code:'42501'});
  await assert.rejects(db.query('select secret from vault.secrets'),{code:'42501'});
  await assert.rejects(db.query('select decrypted_secret from vault.decrypted_secrets'),{code:'42501'});
  await assert.rejects(db.query('select integration_private.validate_credentials($1,$2)',['asaas',bundle]),{code:'42501'});
  await assert.rejects(db.exec("select public.get_company_integration_status(null)"),{code:'42501'});
  for(const [id,target] of [[adminB,companyA],[adminA,companyB],[trainer,companyA],[coordinator,companyA],[student,companyA],['',companyA]]){
   await actor(db,id);await assert.rejects(status(db,target),{code:'42501'});
   await assert.rejects(save(db,target),{code:'42501'});await assert.rejects(remove(db,target),{code:'42501'});
  }
  await actor(db,adminA,'anon');await assert.rejects(status(db),{code:'42501'});
  await actor(db,adminA,'service_role');await assert.rejects(status(db),{code:'42501'});
  await actor(db,adminA);
  for(const [provider,value] of [['unknown',bundle],['asaas',null],['asaas',{...bundle,extra:'no'}],['asaas',{...bundle,environment:'live'}],['asaas',{...bundle,api_key:'short'}],['asaas',{...bundle,api_key:'bad key with spaces'}],['whatsapp_evolution',{api_key:bundle.api_key,base_url:'http://provider.example'}],['whatsapp_evolution',{api_key:bundle.api_key,base_url:'https://user:pass@provider.example'}],['whatsapp_evolution',{api_key:bundle.api_key,base_url:'https://127.0.0.1'}]]){
   await assert.rejects(save(db,companyA,provider,value,1),{code:'22023'});
  }
  await save(db,companyA,'asaas',{...bundle,api_key:'synthetic-only-replacement-key'},1);
  await save(db,companyA,'whatsapp_evolution',{api_key:bundle.api_key,base_url:'https://provider.example/api'},0);
  await actor(db,master);await save(db,companyB);
  await actor(db,adminB);assert.equal((await status(db,companyB))[0].configured,true);
  await actor(db,adminA);await remove(db,companyA,'asaas',2);
  const removed=(await status(db))[0];assert.equal(removed.configured,false);assert.equal(removed.version,3);assert.equal(removed.mask,null);
  await assert.rejects(save(db,companyA,'asaas',bundle,2),{code:'PT409'});
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from vault.secrets')).rows[0].n,2);
  await db.query('delete from public.companies where id=$1',[companyA]);
  assert.equal((await db.query('select count(*)::int n from vault.secrets')).rows[0].n,1);
 }finally{await db.close();}
});
test('Vault failures are generic and roll back metadata/version changes',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  await db.exec(`create or replace function vault.create_secret(text) returns uuid language plpgsql as $$begin raise exception 'sensitive-body-%',$1;end$$;`);
  await actor(db,adminA);
  await assert.rejects(save(db),error=>error.code==='55000'&&!error.message.includes(bundle.api_key));
  assert.equal((await status(db))[0].version,0);
 }finally{await db.close();}
});
test('failed secret deletion rolls back replacement and removal atomically',async()=>{
 const db=await fixture();try{
  await db.exec(sql);await actor(db,adminA);await save(db);
  await db.exec(`reset role;create function vault.fail_delete() returns trigger language plpgsql as $$begin raise exception 'sensitive-delete-body';end$$;
   create trigger fail_delete before delete on vault.secrets for each row execute function vault.fail_delete();`);
  await actor(db,adminA);
  await assert.rejects(save(db,companyA,'asaas',{...bundle,api_key:'synthetic-replacement-long-key'},1),error=>error.code==='55000'&&!error.message.includes('sensitive'));
  assert.equal((await status(db))[0].version,1);
  await assert.rejects(remove(db),error=>error.code==='55000'&&!error.message.includes('sensitive'));
  assert.equal((await status(db))[0].configured,true);assert.equal((await status(db))[0].version,1);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from vault.secrets')).rows[0].n,1);
 }finally{await db.close();}
});
