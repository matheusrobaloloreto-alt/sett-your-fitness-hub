// Native SQL contracts in a disposable in-memory DB. No network/credentials/hosted writes.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=process.cwd();
let PGlite;
for(const p of await readdir(`${homedir()}/.npm/_npx`))try{({PGlite}=await import(pathToFileURL(`${homedir()}/.npm/_npx/${p}/node_modules/@electric-sql/pglite/dist/index.js`).href));break;}catch{}
if(!PGlite)throw Error('Existing PGlite required; no install performed');
const codecPath='supabase/functions/_shared/company-product-settings.ts';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const legacy=await load(execFileSync('git',['show',`61ab2c848982feb89a741d258b48596b5b58d4b6:${codecPath}`],{encoding:'utf8'}));
const current=await load(await readFile(codecPath,'utf8'));
const db=new PGlite();const checks=[];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(10),B=id(20);
const readMigration=async p=>readFile(`supabase/migrations/${p}`,'utf8');
async function actor(n){await db.exec(`reset role;select set_config('test.auth_uid','${n===null?'':id(n)}',false);set role authenticated;`);}
async function save(company,settings,version){return(await db.query('select public.save_company_product_settings($1,$2::jsonb,$3) value',[company,JSON.stringify(settings),version])).rows[0].value;}
async function policy(company){return(await db.query('select public.get_company_workout_expiry_policy($1) value',[company])).rows[0].value;}
async function state(){await db.exec('reset role');return(await db.query("select jsonb_build_object('settings',(select jsonb_agg(to_jsonb(s) order by company_id) from company_product_settings s where company_id='00000000-0000-4000-8000-000000000010'),'history',(select jsonb_agg(to_jsonb(h) order by company_id,version) from company_product_settings_history h where company_id='00000000-0000-4000-8000-000000000010')) value")).rows[0].value;}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create type public.app_role as enum('master','admin','coordinator','trainer','student');
 create table companies(id uuid primary key);create table company_members(user_id uuid,company_id uuid);create table user_roles(user_id uuid,role public.app_role);create table students(id uuid primary key,user_id uuid,company_id uuid);
 create table feature_access(company_id uuid primary key,allowed boolean);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.auth_uid',true),'')::uuid$$;
 create function has_role(actor uuid,requested public.app_role) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from user_roles where user_id=actor and role=requested)$$;
 create function is_company_staff(actor uuid,company uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from company_members cm join user_roles ur on ur.user_id=cm.user_id where cm.user_id=actor and cm.company_id=company and ur.role in ('admin','coordinator','trainer'))$$;
 create function company_feature_allowed(company uuid,feature text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select coalesce((select allowed from feature_access where company_id=company),false)$$;
 grant usage on schema public,auth to authenticated;grant select on company_members,user_roles to authenticated;
 insert into companies values('${A}'),('${B}');insert into feature_access values('${A}',true),('${B}',true);
 insert into company_members values('${id(1)}','${A}'),('${id(2)}','${A}'),('${id(3)}','${B}');
 insert into user_roles values('${id(1)}','admin'),('${id(2)}','trainer'),('${id(3)}','admin'),('${id(4)}','master'),('${id(5)}','student'),('${id(6)}','student');
 insert into students values('${id(50)}','${id(5)}','${A}'),('${id(60)}','${id(6)}','${B}');`);
 await db.exec(await readMigration('20261026092601_company_product_settings.sql'));
 await db.exec(await readMigration('20261028090117_company_prescription_methodology.sql'));
 const seq=await readMigration('20261029122806_company_whatsapp_message_sequences.sql');
 await db.exec(seq.slice(0,seq.indexOf('create function public.check_company_message_media')));
 // Warm a SQL consumer before moving the function, like platform adoption.
 await db.exec(`create function public.fixture_adopt_defaults(company uuid,expected integer) returns jsonb language plpgsql security definer set search_path='' as $$declare payload jsonb;begin select settings into payload from public.company_product_settings where company_id=company;return public.save_company_product_settings(company,coalesce(payload,public.company_product_settings_defaults()),expected);end$$;
 insert into companies values('${id(30)}');insert into feature_access values('${id(30)}',true);insert into company_members values('${id(8)}','${id(30)}');insert into user_roles values('${id(8)}','admin');`);
 await actor(8);await db.query('select public.fixture_adopt_defaults($1,0)',[id(30)]);await db.exec('reset role');
 await db.exec(await readMigration('20261101223102_company_expired_workout_behavior.sql'));
 await actor(8);await save(id(30),current.normalizeCompanyProductSettings({prescription:{expired_workout_behavior:'hide_on_expiry'}}),1);
 await db.query('select public.fixture_adopt_defaults($1,2)',[id(30)]);
 await db.exec('reset role');
 assert.equal((await db.query('select expired_workout_behavior from company_product_settings_history where company_id=$1 and version=3',[id(30)])).rows[0].expired_workout_behavior,'hide_on_expiry');
 // Also exercise the preserved OID/helper directly as its trusted owner.
 await db.query('select settings_private.save_company_product_settings($1,public.company_product_settings_defaults(),3)',[id(30)]);
 assert.equal((await db.query('select expired_workout_behavior from company_product_settings_history where company_id=$1 and version=4',[id(30)])).rows[0].expired_workout_behavior,'hide_on_expiry');
 checks.push('pre-migration warmed adoption caller AND direct legacy helper preserve hide history after function move');
 await actor(1);
 const defaults=legacy.normalizeCompanyProductSettings({});
 let result=await save(A,defaults,0);
 assert.equal(result.version,1);assert.equal(result.expired_workout_behavior,'keep_until_replaced');
 assert.deepEqual(legacy.parseSettingsRecord(result).settings,defaults);checks.push('version0/default first save remains parseable by exact old browser/Edge codec');
 assert.equal(current.parseSettingsRecord(result).settings.prescription.expired_workout_behavior,'keep_until_replaced');checks.push('new parser projects dedicated column; old envelope missing column defaults keep');
 assert.equal(current.parseSettingsRecord({settings:defaults,version:0}).settings.prescription.expired_workout_behavior,'keep_until_replaced');
 result=await save(A,current.normalizeCompanyProductSettings({prescription:{expired_workout_behavior:'hide_on_expiry'}}),1);
 assert.equal(result.version,2);assert.equal(result.expired_workout_behavior,'hide_on_expiry');
 assert.ok(!Object.hasOwn(result.settings.prescription,'expired_workout_behavior'));legacy.parseSettingsRecord(result);checks.push('new hide save strips virtual key before strict SQL validator; response legacy-compatible');
 let snapshot=await state();assert.equal(snapshot.settings[0].expired_workout_behavior,'hide_on_expiry');assert.equal(snapshot.history[1].expired_workout_behavior,'hide_on_expiry');checks.push('policy and same CAS history version persist atomically');
 await actor(1);result=await save(A,defaults,2);assert.equal(result.version,3);assert.equal(result.expired_workout_behavior,'hide_on_expiry');
 snapshot=await state();assert.equal(snapshot.history[2].expired_workout_behavior,'hide_on_expiry');checks.push('old-client save omitting policy preserves hide in current row AND audit');
 for(const value of [null,true,0,'','invalid',[],{}]){
  const before=await state();await actor(1);
  await assert.rejects(()=>save(A,{prescription:{expired_workout_behavior:value}},3),/Invalid expired workout behavior/);
  assert.deepEqual(await state(),before);
 }checks.push('invalid enum/types roll back base settings version/history and column');
 await actor(1);await assert.rejects(()=>save(A,defaults,1),e=>e.code==='PT409');checks.push('stale CAS still fails');
 for(const n of [2,3,5]){await actor(n);await assert.rejects(()=>save(A,defaults,3),e=>e.code==='42501');}checks.push('trainer, foreign-company admin and student cannot save');
 await actor(1);await assert.rejects(()=>db.query("update company_product_settings set expired_workout_behavior='keep_until_replaced' where company_id=$1",[A]),/permission denied/);await assert.rejects(()=>db.query('select settings_private.save_company_product_settings($1,$2::jsonb,$3)',[A,JSON.stringify(defaults),3]),/permission denied/);checks.push('no direct table writes or private-helper EXECUTE granted');
 await actor(5);assert.equal((await db.query('select count(*)::int n from company_product_settings')).rows[0].n,0);
 assert.deepEqual(await policy(A),{company_id:A,expired_workout_behavior:'hide_on_expiry',version:3});
 await assert.rejects(()=>policy(B),e=>e.code==='42501');checks.push('native SQL/RLS: student WITHOUT company_members cannot read settings JSON but reads only own company policy');
 await actor(6);assert.deepEqual(await policy(B),{company_id:B,expired_workout_behavior:'keep_until_replaced',version:0});checks.push('authorized student gets version0/default only for genuinely absent settings');
 await actor(null);await assert.rejects(()=>policy(A),e=>e.code==='42501');checks.push('missing authenticated identity cannot receive policy/default');
 await actor(2);assert.equal((await policy(A)).version,3);await actor(4);assert.equal((await policy(A)).version,3);checks.push('staff/master minimal reads work');
 await db.exec(`reset role;update feature_access set allowed=false where company_id='00000000-0000-4000-8000-000000000010';`);await actor(1);
 await assert.rejects(()=>save(A,current.normalizeCompanyProductSettings({}),3),e=>e.code==='42501');
 snapshot=await state();assert.equal(snapshot.settings[0].version,3);checks.push('dedicated-column change still requires prescription entitlement, failure rolls back');
 for(const table of ['settings','history'])for(const row of snapshot[table])assert.ok(!Object.hasOwn(row.settings.prescription,'expired_workout_behavior'));
 checks.push('NO current/history settings JSON ever contains the new key');
 console.log(JSON.stringify({ok:true,checks,limits:'in-memory native SQL+RLS fixtures, exact old codec, no hosted writes; commercial shared triggers/media config not mirrored'},null,2));
}catch(error){console.error(JSON.stringify({ok:false,message:error.message,code:error.code,checks},null,2));process.exitCode=1;}finally{await db.close();}
