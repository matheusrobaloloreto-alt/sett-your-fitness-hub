// Authorization/rollback only. This Vault double deliberately does NOT encrypt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const { PGlite } = await import('/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js');
const path = 'supabase/migrations/20261029003808_tenant_integration_preparation.sql';
const sql = readFileSync(path, 'utf8');
const fingerprint = () => createHash('sha256').update(readFileSync(path)).digest('hex');
const initial = fingerprint();
const company = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const canary = 'synthetic-independent-vault-canary';
async function fixture() {
 const db = new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create type public.app_role as enum('master','admin');
 create table public.companies(id uuid primary key);
 create table public.company_members(company_id uuid,user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$select '${actor}'::uuid$$;
 create function public.has_role(uuid,public.app_role) returns boolean language sql stable as $$select $1='${actor}'::uuid and $2='admin'::public.app_role$$;
 insert into auth.users values('${actor}');insert into companies values('${company}');
 insert into company_members values('${company}','${actor}');
 create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text not null);
 create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(text,text default null,text default '',uuid default null) returns uuid
 language plpgsql security definer set search_path='' as $$declare id uuid;begin
 insert into vault.secrets(secret) values($1) returning vault.secrets.id into id;return id;end$$;
 revoke all on function vault.create_secret(text,text,text,uuid) from public,anon,authenticated,service_role;
 revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated,service_role;
 grant usage on schema public,auth,vault to authenticated,anon,service_role;
 -- Stress inherited EXECUTE defaults for every function created by the migration.
 alter default privileges grant execute on functions to anon,authenticated,service_role;`);
 await db.exec(sql);
 return db;
}
const save = (db,provider,bundle,version=0) => db.query('select public.save_company_integration_credentials($1,$2,$3,$4) as result',[company,provider,bundle,version]);
test('explicit ACLs override permissive defaults, and raw Vault definer is not callable',async()=>{
 const db=await fixture();try {
  const functions=(await db.query(`select p.oid,p.proname,n.nspname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='integration_private' or (n.nspname='public' and p.proname in ('get_company_integration_status','save_company_integration_credentials','remove_company_integration_credentials'))`)).rows;
  assert.equal(functions.length,6);
  for(const f of functions){
   for(const role of ['anon','authenticated','service_role']){
    const allowed=(await db.query('select has_function_privilege($1,$2::oid,\'EXECUTE\') as allowed',[role,f.oid])).rows[0].allowed;
    assert.equal(allowed,role==='authenticated'&&f.nspname==='public',`${role}: ${f.proname}`);
   }
   assert.equal((await db.query('select count(*)::int n from pg_proc p, lateral aclexplode(p.proacl) a where p.oid=$1 and a.grantee=0 and a.privilege_type=\'EXECUTE\'',[f.oid])).rows[0].n,0);
  }
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select vault.create_secret($1)',[canary]),{code:'42501'});
  await assert.rejects(db.query('select * from vault.decrypted_secrets'),{code:'42501'});
  const result=(await save(db,'asaas',{api_key:canary,environment:'sandbox'})).rows[0].result;
  assert.equal(result[0].consumer_enabled,false);assert.ok(!JSON.stringify(result).includes(canary));
 }finally{await db.close();}
});
test('simulated unavailable encryption key fails generically and rolls back all saved state',async()=>{
 const db=await fixture();try {
  await db.exec(`create or replace function vault.create_secret(text,text default null,text default '',uuid default null) returns uuid
  language plpgsql security definer set search_path='' as $$begin raise exception 'key-unavailable-sensitive-%',$1;end$$;set role authenticated;`);
  await assert.rejects(save(db,'asaas',{api_key:canary,environment:'sandbox'}),e=>e.code==='55000'&&!e.message.includes(canary)&&!e.message.includes('key-unavailable'));
  const status=(await db.query('select get_company_integration_status($1) as value',[company])).rows[0].value;
  assert.equal(status[0].configured,false);assert.equal(status[0].version,0);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from vault.secrets')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from integration_private.credentials')).rows[0].n,0);
 }finally{await db.close();}
});
test('URL syntax permits arbitrary DNS destinations; saved status never enables a consumer',async()=>{
 const db=await fixture();try {
  await db.exec('set role authenticated');
  const result=(await save(db,'whatsapp_evolution',{api_key:canary,base_url:'https://internal.service.local/api'})).rows[0].result;
  const row=result.find(x=>x.provider==='whatsapp_evolution');
  assert.equal(row.configured,true);assert.equal(row.consumer_enabled,false);
  assert.ok(!JSON.stringify(result).includes('internal.service.local'));
  assert.ok(!/net\.http|http_post|http_get/i.test(sql));
 }finally{await db.close();}
 assert.equal(fingerprint(),initial,'migration changed during independent review');
});
