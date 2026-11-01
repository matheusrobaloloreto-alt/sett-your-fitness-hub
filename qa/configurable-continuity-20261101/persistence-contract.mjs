import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
let PGlite;
for(const entry of await readdir(`${homedir()}/.npm/_npx`)){try{({PGlite}=await import(pathToFileURL(`${homedir()}/.npm/_npx/${entry}/node_modules/@electric-sql/pglite/dist/index.js`).href));break;}catch{}}
if(!PGlite)throw Error('Existing local PGlite unavailable; no installation performed');
const old={};vm.runInNewContext(ts.transpileModule(execFileSync('git',['show','61ab2c8:supabase/functions/_shared/company-product-settings.ts'],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:old,Intl,Date,JSON},{timeout:1000});
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const company=id(1),foreign=id(2),admin=id(3),student=id(4),outsider=id(5);const checks=[];
const q=async(sql,args=[])=>db.query(sql,args);const check=(name)=>{checks.push(name);console.log('PASS '+name)};
async function actor(user,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${role}`);}
async function save(settings,version,tenant=company){return (await q('select public.save_company_product_settings($1::uuid,$2::jsonb,$3::integer) as value',[tenant,JSON.stringify(settings),version])).rows[0].value;}
async function snapshot(){await db.exec('reset role');return (await q('select settings,version,expired_workout_behavior from company_product_settings where company_id=$1',[company])).rows[0];}
try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
 create type public.app_role as enum('master','admin','trainer','student');
 create table companies(id uuid primary key);create table company_members(company_id uuid,user_id uuid);create table students(id uuid primary key,company_id uuid,user_id uuid,status text);create table fixture_roles(user_id uuid,role public.app_role);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.has_role(u uuid,r public.app_role) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.fixture_roles where user_id=u and role=r)$$;
 create function public.is_company_staff(u uuid,c uuid) returns boolean language sql stable as $$select exists(select 1 from public.company_members where user_id=u and company_id=c)$$;
 create function public.company_feature_allowed(uuid,text) returns boolean language sql stable as $$select coalesce(nullif(current_setting('fixture.feature',true),''),'on')='on'$$;
 insert into companies values('${company}'),('${foreign}');insert into company_members values('${company}','${admin}');insert into fixture_roles values('${admin}','admin');insert into students values('${id(6)}','${company}','${student}','active');
 grant usage on schema public,auth to authenticated,anon;grant select on company_members,students to authenticated;`);
 await db.exec(await readFile('supabase/migrations/20261026092601_company_product_settings.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261028090117_company_prescription_methodology.sql','utf8'));
 const seq=await readFile('supabase/migrations/20261029122806_company_whatsapp_message_sequences.sql','utf8');await db.exec(seq.split('-- Validate tenant + real private Storage reference')[0]);
 await actor(admin);const initial=await save({messages:{weekly_contact:'Olá, {{primeiro_nome}}!'}},0);assert.equal(initial.version,1);await db.exec('reset role');
 const before=(await q('select settings from company_product_settings where company_id=$1',[company])).rows[0].settings;
 const migration=await readFile('supabase/migrations/20261101223102_company_expired_workout_behavior.sql','utf8');console.log('DDL_SHA256 '+createHash('sha256').update(migration).digest('hex'));await db.exec(migration);
 const migrated=await snapshot();assert.deepEqual(migrated.settings,before);assert.equal(migrated.expired_workout_behavior,'keep_until_replaced');check('migration preserves exact legacy JSON and initializes dedicated column only');
 await actor(admin);const hidden=await save({prescription:{expired_workout_behavior:'hide_on_expiry'}},1);assert.equal(hidden.version,2);assert.equal(hidden.expired_workout_behavior,'hide_on_expiry');
 const row=await snapshot();assert.equal(row.version,2);assert.equal(row.expired_workout_behavior,'hide_on_expiry');assert.equal(Object.hasOwn(row.settings.prescription,'expired_workout_behavior'),false);old.parseSettingsRecord(row);check('new writer persists hide outside JSON and old 61ab reader accepts REST envelope');
 const history=(await q('select settings,expired_workout_behavior from company_product_settings_history where company_id=$1 and version=2',[company])).rows[0];assert.equal(history.expired_workout_behavior,'hide_on_expiry');assert.equal(Object.hasOwn(history.settings.prescription,'expired_workout_behavior'),false);check('same-version audit stores policy column without virtual key in JSON');
 await actor(admin);const legacy=await save({brand:{company_name:'Synthetic QA'}},2);assert.equal(legacy.version,3);assert.equal(legacy.expired_workout_behavior,'hide_on_expiry');old.parseSettingsRecord(legacy);const legacyHist=(await db.query('select expired_workout_behavior from company_product_settings_history where company_id=$1 and version=3',[company])).rows[0];assert.equal(legacyHist.expired_workout_behavior,'hide_on_expiry');check('old writer omitting the key preserves existing hide and matching audit');
 for(const value of ['invalid',null,true,2,{}]){await actor(admin);await assert.rejects(()=>save({prescription:{expired_workout_behavior:value}},3));assert.equal((await snapshot()).version,3);}check('invalid enums roll back the inner write, version and audit');
 await actor(admin);await assert.rejects(()=>save({prescription:{expired_workout_behavior:'keep_until_replaced'}},2),e=>e.code==='PT409');assert.equal((await snapshot()).version,3);check('stale expected version cannot overwrite policy');
 await actor(admin);await assert.rejects(()=>save({},0,foreign),e=>e.code==='42501');await actor(student);await assert.rejects(()=>save({},3),e=>e.code==='42501');check('foreign tenant and own-student writes denied');
 await actor(student);await assert.rejects(()=>q("update company_product_settings set expired_workout_behavior='keep_until_replaced' where company_id=$1",[company]));await assert.rejects(()=>q('select settings_private.save_company_product_settings($1::uuid,$2::jsonb,3)',[company,'{}']));check('direct writes and private bypass RPC denied');
 await db.exec('reset role');await db.exec("select set_config('fixture.feature','off',false)");await actor(admin);await assert.rejects(()=>save({prescription:{expired_workout_behavior:'keep_until_replaced'}},3),e=>e.code==='42501');assert.equal((await snapshot()).version,3);await db.exec("select set_config('fixture.feature','on',false)");check('feature denial rolls back attempted policy change');
 const exists=(await q("select to_regprocedure('public.get_company_workout_expiry_policy(uuid)')::text as name")).rows[0].name;assert.ok(exists,'Minimal read RPC is required before gate');
 await actor(student);assert.equal((await q('select count(*)::int as n from company_product_settings where company_id=$1',[company])).rows[0].n,0);
 const read=(await q('select public.get_company_workout_expiry_policy($1::uuid) as value',[company])).rows[0].value;assert.equal(read.company_id,company);assert.equal(read.expired_workout_behavior,'hide_on_expiry');assert.equal(read.version,3);assert.deepEqual(Object.keys(read).sort(),['company_id','expired_workout_behavior','version']);check('student without membership sees hide through minimal RPC while full JSON remains RLS hidden');
 await actor(outsider);await assert.rejects(()=>q('select public.get_company_workout_expiry_policy($1::uuid)',[company]),e=>e.code==='42501');await actor(student);await assert.rejects(()=>q('select public.get_company_workout_expiry_policy($1::uuid)',[foreign]),e=>e.code==='42501');await actor('', 'anon');await assert.rejects(()=>q('select public.get_company_workout_expiry_policy($1::uuid)',[company]),e=>e.code==='42501');check('minimal read denies outsider, foreign tenant and anonymous role');
 await db.exec('reset role');const records=(await q('select count(*)::int as n from company_product_settings_history where company_id=$1',[company])).rows[0].n;assert.equal(records,3);check('failed operations created no extra audit versions');
 await db.exec(`create function public.fixture_cached_oid_caller(u uuid,p jsonb,v integer) returns jsonb language sql security definer set search_path='' as $$select settings_private.save_company_product_settings(u,p,v)$$;grant execute on function public.fixture_cached_oid_caller(uuid,jsonb,integer) to authenticated;`);
 await actor(admin);await q('select public.fixture_cached_oid_caller($1::uuid,$2::jsonb,3)',[company,JSON.stringify({brand:{company_name:'Synthetic legacy SQL caller'}})]);await db.exec('reset role');
 const cached=(await q('select expired_workout_behavior,settings from company_product_settings_history where company_id=$1 and version=4',[company])).rows[0];assert.equal(cached.expired_workout_behavior,'hide_on_expiry');assert.equal(Object.hasOwn(cached.settings.prescription,'expired_workout_behavior'),false);check('legacy SQL caller reaching moved helper still audits hide via capture trigger');
 console.log(JSON.stringify({checks:checks.length,pass:true,scope:'LOCAL synthetic PostgreSQL; migrations executed in memory only; role helpers synthetic; no hosted RLS claim'}));
}finally{await db.close();}
