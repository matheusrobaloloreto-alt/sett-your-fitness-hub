import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const container=`sett-contact-qa-${process.pid}`, host='unix:///Users/macbookpro/.colima/default/docker.sock';
const migration=new URL('../migrations/20261029200000_student_canonical_contact.sql',import.meta.url);
function query(sql){return new Promise((resolve,reject)=>{
 const p=spawn('docker',['--host',host,'exec','-i',container,'psql','-X','-h','/contact-qa','-U','postgres','-v','ON_ERROR_STOP=1','-At','-d','postgres'],{timeout:20000});
 let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>resolve({code,out,err}));p.stdin.end(sql);
});}
const student=n=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`, company=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const staff="set local role authenticated;set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';";
async function ok(sql){const r=await query(sql);assert.equal(r.code,0,r.err);return r.out;}
async function fail(sql,match){const r=await query(sql);assert.notEqual(r.code,0,'expected guarded failure');assert.match(r.err,match);}
function helper(file,name,schema='public'){
 const source=readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8');
 const escaped=(schema+'.'+name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const found=source.match(new RegExp('create (?:or replace )?function '+escaped+'\\([\\s\\S]*?\\$\\$;','i'));
 assert.ok(found,'original helper '+name);return found[0];
}
function rpc(n,contact,confirmed=true,patch="'{}'::jsonb",country="'BR'"){
 return `public.update_student_contact(s.id,s.company_id,s.updated_at,s.phone,s.whatsapp,${contact},${country},${confirmed},${patch})`;
}
before(async()=>{
 const r=spawnSync('docker',['--host',host,'run','--detach','--pull=never','--name',container,'--network','none','--label','sett.qa.owner=canonical-contact','--memory','512m','--cpus','1','--pids-limit','64','--tmpfs','/contact-qa:rw,nosuid,nodev,uid=100,gid=101,mode=0700,size=192m','--user','postgres','--entrypoint','sh','public.ecr.aws/supabase/postgres:17.6.1.106','-c','initdb -D /contact-qa/data --auth=trust --no-locale >/contact-qa/init.log && exec postgres -D /contact-qa/data -c listen_addresses= -c unix_socket_directories=/contact-qa -c shared_preload_libraries= -c max_connections=8 -c shared_buffers=32MB -c statement_timeout=10000 -c lock_timeout=5000'],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);
 let ready=false;for(let n=0;n<100;n++){if((await query('select 1')).code===0){ready=true;break;}await delay(100);}assert.ok(ready,'isolated PostgreSQL ready');
 await ok('create role anon;create role authenticated;create role service_role bypassrls;');
 const weekly='20260910103000_weekly_contact_consent_ledger.sql';
 const originals=[helper('20260810110000_whatsapp_conversation_reliability.sql','sett_phone_key'),...['weekly_contact_recipient_key','weekly_contact_stored_recipient_key','weekly_contact_current_recipient_key','track_weekly_contact_recipient_generation'].map(n=>helper(weekly,n)),helper('20261028143001_atomic_lead_conversion.sql','registration_phone_key','commercial_private'),helper('20261014194335_company_staff_student_management.sql','can_manage_staff_student'),helper('20260815062126_remove_legacy_same_company_student_leaks.sql','prevent_student_self_privilege_escalation'),helper('20260804170000_harden_whatsapp_student_phone_links.sql','link_whatsapp_chat_to_student'),helper('20260804170000_harden_whatsapp_student_phone_links.sql','link_student_to_existing_whatsapp_chats')].join('\n');
 await ok(readFileSync(new URL('./student_canonical_contact_fixture.sql',import.meta.url),'utf8').replace('-- ORIGINAL_HELPERS',()=>originals));
 if(!process.env.CONTACT_QA_BASELINE)await ok(readFileSync(migration,'utf8'));
});
after(()=>{const r=spawnSync('docker',['--host',host,'rm','-f',container],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);});

test('single-field direct writes mirror full BR9 contact and advance contact version',async()=>{
 await ok(`begin;${staff}do $$declare s students;begin select * into s from students where id='${student(2)}';update students set whatsapp='(11) 96666-5555' where id=s.id;assert (select phone='5511966665555' and whatsapp=phone and updated_at>s.updated_at from students where id=s.id),'BR9 mirror/version';end$$;rollback;`);
});
test('migration leaves every existing contact byte unchanged',async()=>{
 await ok(`do $$begin assert not exists(select 1 from students s join fixture_before b using(id) where to_jsonb(s)<>to_jsonb(b));end$$;`);
});
test('unrelated legacy edits preserve divergence, identity block and consent',async()=>{
 await ok(`begin;${staff}update students set notes='fixture metadata only' where id='${student(1)}';do $$begin assert (select phone='11911112222' and whatsapp='11933334444' and weekly_contact_recipient_key is null and weekly_contact_recipient_generation=4 and weekly_contact_enabled from students where id='${student(1)}');end$$;rollback;`);
});
test('direct legacy reconciliation and new divergence are rejected without changing history',async()=>{
 await fail(`begin;${staff}update students set phone=whatsapp where id='${student(1)}';`,/contact_reconciliation_confirmation_required/);
 await fail(`begin;${staff}update students set phone='11988887777',whatsapp='11922223333' where id='${student(2)}';`,/contact_fields_divergent/);
 await fail(`begin;${staff}insert into students(id,company_id,full_name,phone,whatsapp,country_code) values(gen_random_uuid(),'${company(1)}','Fixture divergent','11988887777','11922223333','BR');`,/contact_fields_divergent/);
});
test('RPC atomically reconciles explicit official contact plus profile and returns whitelisted ACK',async()=>{
 await ok(`begin;${staff}do $$declare s students;r jsonb;begin select * into s from students where id='${student(1)}';r:=${rpc(1,"'(11) 93333-4444'",true,"'{\"email\":\"Fixture@invalid.test\",\"notes\":\"fixture atomic\"}'")};assert r->>'phone'='5511933334444' and r->>'whatsapp'=r->>'phone';assert (r->>'updated_at')::timestamptz>s.updated_at;assert r->>'email'='Fixture@invalid.test';assert not(r?'internal_fixture_value') and not(r?'user_id');assert (select weekly_contact_recipient_generation=5 and weekly_contact_enabled from students where id=s.id);end$$;reset role;do $$begin assert (select count(*)=1 from student_contact_private.audit where student_id='${student(1)}' and explicit_confirmation and source='rpc');assert (select count(*)=0 from student_contact_private.write_context);assert not exists(select 1 from fixture_consent c join students s on s.id=c.student_id where c.generation=s.weekly_contact_recipient_generation and c.recipient_key=s.weekly_contact_recipient_key);end$$;rollback;`);
});
test('RPC metadata patch preserves divergent legacy and NULL country without inventing BR',async()=>{
 for(const n of [1,4])await ok(`begin;${staff}do $$declare s students;r jsonb;begin select * into s from students where id='${student(n)}';r:=public.update_student_contact(s.id,s.company_id,s.updated_at,s.phone,s.whatsapp,s.whatsapp,s.country_code,false,'{"notes":"fixture metadata"}');assert r->>'phone' is not distinct from s.phone and r->>'whatsapp' is not distinct from s.whatsapp and r->>'country_code' is not distinct from s.country_code;end$$;rollback;`);
});
test('wrong CAS, unconfirmed contact, forbidden profile field and invalid profile rollback all changes',async()=>{
 await fail(`begin;${staff}select public.update_student_contact(s.id,s.company_id,s.updated_at-interval '1 second',s.phone,s.whatsapp,s.whatsapp,s.country_code,true) from students s where id='${student(1)}';`,/contact_version_conflict/);
 await fail(`begin;${staff}select ${rpc(1,"'11922223333'",false)} from students s where id='${student(1)}';`,/contact_confirmation_required/);
 await fail(`begin;${staff}select ${rpc(1,'s.whatsapp',true,"'{\"user_id\":null}'")} from students s where id='${student(1)}';`,/contact_profile_patch_invalid/);
 await fail(`begin;${staff}select ${rpc(1,'s.whatsapp',true,"'{\"status\":\"invalid-fixture\"}'")} from students s where id='${student(1)}';`,/check constraint/);
 await ok(`do $$begin assert not exists(select 1 from students s join fixture_before b using(id) where to_jsonb(s)<>to_jsonb(b));assert (select count(*)=0 from student_contact_private.audit);end$$;`);
});
test('tenant authorization, student self-service and private audit permissions remain restrictive',async()=>{
 await fail(`begin;set local role authenticated;set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';select public.update_student_contact('${student(1)}','${company(1)}',now(),null,null,null,'BR',true);`,/contact_not_authorized/);
 await fail(`begin;set local role authenticated;set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';select public.update_student_contact('${student(1)}','${company(1)}',now(),null,null,null,'BR',true);`,/contact_not_authorized/);
 await fail(`begin;${staff}select * from student_contact_private.audit;`,/permission denied/);
});
test('authorized service repair has NULL actor and explicit service audit, no fabricated user',async()=>{
 await ok(`begin;set local role service_role;do $$declare s students;r jsonb;begin select * into s from students where id='${student(1)}';r:=${rpc(1,'s.whatsapp')};assert r->>'phone'=r->>'whatsapp';end$$;reset role;do $$begin assert (select count(*)=1 from student_contact_private.audit where student_id='${student(1)}' and actor_id is null and source_role='service_role' and explicit_confirmation);end$$;rollback;`);
});
test('BR national/masked/E164 and international preserve full storage rather than identity key',async()=>{
 for(const [input,country,expected] of [["'11966665555'","'BR'",'5511966665555'],["'+55 (11) 96666-5555'","'BR'",'5511966665555'],["'5511966665555'","'BR'",'5511966665555'],["'+351 912 345 678'","'PT'",'351912345678']])await ok(`begin;${staff}do $$declare s students;r jsonb;begin select * into s from students where id='${student(2)}';r:=${rpc(2,input,true,"'{}'",country)};assert r->>'phone'='${expected}' and r->>'whatsapp'='${expected}';end$$;rollback;`);
});
test('ownership conflicts are tenant-local and historical chat ownership is not reassigned',async()=>{
 await fail(`begin;${staff}select ${rpc(2,"'11933334444'")} from students s where id='${student(2)}';`,/contact_ownership_conflict/);
 await ok(`begin;${staff}select ${rpc(2,"'11977778888'")} from students s where id='${student(2)}';rollback;`);
 await ok(`begin;insert into whatsapp_chats values(gen_random_uuid(),'${company(1)}','${student(1)}','5511966665555@s.whatsapp.net','fixture');${staff}do $$declare s students;begin select * into s from students where id='${student(2)}';begin perform ${rpc(2,"'11966665555'")};raise exception 'expected ownership conflict';exception when sqlstate 'PT409' then null;end;end$$;rollback;`);
});
test('ambiguous legacy is excluded from new chat auto-links; existing links and JIDs are untouched',async()=>{
 await ok(`begin;insert into whatsapp_chats values('30000000-0000-0000-0000-000000000010','${company(1)}',null,'5511933334444@s.whatsapp.net','fixture');do $$begin assert (select student_id is null from whatsapp_chats where id='30000000-0000-0000-0000-000000000010');end$$;${staff}update students set phone=phone,notes='fixture unrelated with contact columns' where id='${student(1)}';reset role;do $$begin assert (select student_id is null from whatsapp_chats where id='30000000-0000-0000-0000-000000000002');assert (select student_id='${student(1)}' and remote_jid='5511933334444@s.whatsapp.net' from whatsapp_chats where id='30000000-0000-0000-0000-000000000001');end$$;rollback;`);
});
test('concurrent same-tenant ownership claims have exactly one winner',async()=>{
 const add=await ok(`insert into students(id,company_id,full_name,country_code) values('20000000-0000-0000-0000-000000000010','${company(1)}','Fixture concurrency','BR');`);assert.ok(add);
 const write=n=>query(`begin;${staff}update students set whatsapp='11922223333' where id='${student(n)}';select pg_sleep(0.2);commit;`);
 const results=await Promise.all([write(2),write(10)]);assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).err,/contact_ownership_conflict/);
 await ok(`do $$begin assert (select count(*)=1 from students where company_id='${company(1)}' and whatsapp='5511922223333');end$$;`);
});

test('preflight refuses unexpected live linker code before any replacement',async()=>{
 const source=readFileSync(migration,'utf8');
 const preflight=source.match(/do \$contact_preflight\$[\s\S]*?end \$contact_preflight\$;/)[0];
 await fail(`begin;create or replace function public.link_whatsapp_chat_to_student() returns trigger language plpgsql security definer set search_path=public as $$begin return new;end$$;${preflight}`,/contact_linker_baseline_changed/);
});
