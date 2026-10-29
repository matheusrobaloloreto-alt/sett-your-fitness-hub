// SQL contract only: PGlite memory, synthetic Auth/Storage primitives. No native Storage or remote I/O.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.SETT_TEST_PGLITE_MODULE || '@electric-sql/pglite');
const read = name => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8');
const company = '11111111-1111-1111-1111-111111111111', other = '22222222-2222-2222-2222-222222222222', actor = '33333333-3333-3333-3333-333333333333', chat = '44444444-4444-4444-4444-444444444444';
const media = { bucket:'whatsapp-media', path:`${company}/message-settings/55555555-5555-5555-5555-555555555555.png`, mimeType:'image/png', fileName:'image.png' };
const part = { id:'one', type:'text', text:'Oi, {{nome}}' };
const json = x => `'${JSON.stringify(x).replaceAll("'", "''")}'::jsonb`;

test('sequence SQL validation, tenant media guard, CAS/history and ordered durable receipt', async t => {
 const db = new PGlite();
 try {
  const prefix = readFileSync(new URL('./company_product_settings_fixture.sql',import.meta.url),'utf8').split('\\ir')[0];
  await db.exec(prefix);
  await db.exec(read('20261026092601_company_product_settings.sql'));
  await db.exec(read('20261028090117_company_prescription_methodology.sql'));
  await db.exec(`create schema storage; create table storage.buckets(id text primary key,public boolean); create table storage.objects(bucket_id text,name text,metadata jsonb); alter table storage.objects enable row level security;
   create function public.is_company_staff(uuid,uuid) returns boolean language sql as $$select true$$;
   create function public.try_uuid(text) returns uuid language sql as $$select $1::uuid$$;
   create table public.whatsapp_chats(id uuid primary key,company_id uuid);
   create table public.automation_flows(id uuid primary key,company_id uuid); create table public.automation_flow_edges(id uuid primary key,flow_id uuid,source_node_id text,target_node_id text);
   create table public.flow_sessions(id uuid primary key,chat_id uuid,flow_id uuid,current_node_id text,status text,context jsonb default '{}',created_at timestamptz default now(),last_activity_at timestamptz,updated_at timestamptz default now());
   create table public.intercycle_anamnesis_deliveries(id uuid primary key,company_id uuid,status text,sent_at timestamptz,last_error_code text,next_attempt_at timestamptz,updated_at timestamptz,scheduled_for timestamptz default now(),cancelled_at timestamptz,retry_count integer default 0);
   insert into companies values('${company}'),('${other}'); insert into company_members values('${actor}','${company}'); insert into user_roles values('${actor}','admin');
   insert into whatsapp_chats values('${chat}','${company}'); insert into storage.buckets values('whatsapp-media',false);
   insert into storage.objects values('whatsapp-media','${media.path}','{"size":8,"mimetype":"image/png"}');`);
  await db.exec(read('20261026174533_automation_dispatch_recovery.sql'));
  await db.exec(read('20261029122806_company_whatsapp_message_sequences.sql'));
  await db.exec('commit');
  const validate = input => db.query(`select validate_company_product_settings(${json(input)}) as settings`);
  await t.test('old fields intact, all ten events accept ten parts, push rejected', async()=>{
   const legacy = (await validate({})).rows[0].settings;
   assert.equal(legacy.message_sequences,undefined);
   for (const event of ['weekly_contact','pre_registration_confirmation','fiscal_invite','payment_link','assessment_onboarding','anamnesis_invite','renewal_due','renewal_overdue','intercycle_invite','first_contact']) {
    const parts = Array.from({length:10},(_,i)=>({...part,id:'p'+i}));
    const result = (await validate({message_sequences:{[event]:parts}})).rows[0].settings;
    assert.deepEqual(result.messages,legacy.messages); assert.equal(result.message_sequences[event].length,10);
   }
   for (const input of [null, [], {weekly_contact:[]}, {daily_reminder_title:[part]}, {weekly_contact:[part,part]}, {weekly_contact:[{...part,text:'  '}]}, {weekly_contact:[{...part,text:'{{link}}'}]}, {weekly_contact:[{...part,type:'unknown'}]}, {weekly_contact:Array.from({length:11},(_,i)=>({...part,id:'p'+i}))}, {weekly_contact:[{...part,extra:true}]}, {weekly_contact:[{...part,media}]}]) await assert.rejects(validate({message_sequences:input}));
   assert.equal((await validate({message_sequences:{weekly_contact:[{id:'media',type:'image',text:'',media}]}})).rows[0].settings.message_sequences.weekly_contact[0].text,'');
   for (const patch of [{bucket:'public'}, {path:company+'/message-settings/../x.png'}, {mimeType:'image/svg+xml'}, {fileName:'../x.png'}, {extra:true}]) await assert.rejects(validate({message_sequences:{weekly_contact:[{id:'media',type:'image',text:'',media:{...media,...patch}}]}}));
  });
  await t.test('CAS/history and media tenant are atomic; original validator OID still used', async()=>{
   const save = (tenant,input,version)=>db.query(`select save_company_product_settings('${tenant}',${json(input)},${version}) as envelope`);
   await db.exec(`set test.auth_uid='${actor}'`);
   const payload={message_sequences:{weekly_contact:[{id:'image',type:'image',text:'',media}]}};
   await save(company,payload,0);
   await assert.rejects(save(company,payload,0),/Settings version conflict/);
   await assert.rejects(save(company,{message_sequences:{weekly_contact:[]}},1));
   await assert.rejects(save(company,{message_sequences:{weekly_contact:[{id:'image',type:'image',text:'',media:{...media,path:media.path.replace(company,other)}}]}},1));
   const h=await db.query(`select count(*)::int n,max(version)::int v from company_product_settings_history where company_id='${company}'`);
   assert.deepEqual(h.rows[0],{n:1,v:1});
  });
  await t.test('snapshot wins, ordered claim, ambiguous stops, ACK replay and grants',async()=>{
   const snapshot={parts:[{id:'a',type:'text',text:'original'},{id:'b',type:'text',text:'second'}],recipient:'5548999999999@s.whatsapp.net',instanceName:'synthetic',metadata:{settingsVersion:1}};
   const snap=async value=>(await db.query(`select snapshot_company_message_sequence('${company}','${chat}','${'a'.repeat(64)}',${json(value)}) as value`)).rows[0].value;
   const first=await snap(snapshot); const replay=await snap({...snapshot,parts:[{id:'changed',type:'text',text:'new'}]});
   assert.deepEqual(replay.snapshot,first.snapshot);
   await assert.rejects(db.query(`select claim_company_message_part('${first.id}',1)`),/dispatch_uncertain/);
   const claim=(await db.query(`select claim_company_message_part('${first.id}',0) as c`)).rows[0].c;
   await assert.rejects(db.query(`select claim_company_message_part('${first.id}',0)`),/dispatch_uncertain/);
   await db.query(`select ack_company_message_part('${first.id}',0,'${claim.token}','receipt-one')`);
   assert.equal((await db.query(`select claim_company_message_part('${first.id}',0) as c`)).rows[0].c.state,'acked');
   assert.equal((await snap(snapshot)).states[0],'acked');
   await assert.rejects(db.query(`select ack_company_message_part('${first.id}',1,'${claim.token}','fake')`));
   const permissions=(await db.query(`select has_function_privilege('authenticated','public.claim_company_message_part(uuid,integer,jsonb)','execute') as client,has_function_privilege('service_role','public.claim_company_message_part(uuid,integer,jsonb)','execute') as service`)).rows[0];
   assert.deepEqual(permissions,{client:false,service:true});
  });


  await t.test('real recovery claim retains confirmed parts, rotates lease, fences stale owner and parks ambiguous',async()=>{
   const flow='66666666-6666-6666-6666-666666666666', owner='77777777-7777-7777-7777-777777777777';
   await db.exec(`insert into automation_flows values('${flow}','${company}'); insert into flow_sessions(id,chat_id,flow_id,current_node_id,status) values('${owner}','${chat}','${flow}','content','active');`);
   const first=(await db.query('select * from claim_automation_sessions(1)')).rows[0];assert.equal(first.id,owner);
   const scope={kind:'flow',ownerId:owner,leaseToken:first.dispatch_lease_token};
   const data={parts:[{id:'a',type:'text',text:'first'},{id:'b',type:'text',text:'second'}],recipient:'5548999999999@s.whatsapp.net',instanceName:'synthetic',metadata:{settingsVersion:1}};
   const snap=(await db.query(`select snapshot_company_message_sequence('${company}','${chat}','${'b'.repeat(64)}',${json(data)},${json(scope)}) as value`)).rows[0].value;
   const one=(await db.query(`select claim_company_message_part('${snap.id}',0,${json(scope)}) as value`)).rows[0].value;
   await db.query(`select ack_company_message_part('${snap.id}',0,'${one.token}','receipt')`);
   await db.exec(`update flow_sessions set dispatch_lease_until=now()-interval '1 second' where id='${owner}'`);
   const next=(await db.query('select * from claim_automation_sessions(1)')).rows[0];assert.equal(next.id,owner);assert.notEqual(next.dispatch_lease_token,first.dispatch_lease_token);
   await assert.rejects(db.query(`select claim_company_message_part('${snap.id}',1,${json(scope)})`),/dispatch_lease_lost/);
   const newer={...scope,leaseToken:next.dispatch_lease_token};
   const two=(await db.query(`select claim_company_message_part('${snap.id}',1,${json(newer)}) as value`)).rows[0].value;
   assert.equal(two.state,'in_flight');
   await db.exec(`update flow_sessions set dispatch_lease_until=now()-interval '1 second' where id='${owner}'`);
   assert.equal((await db.query('select * from claim_automation_sessions(1)')).rows.length,0);
   const parked=(await db.query(`select status,context->>'dispatch_error' as error from flow_sessions where id='${owner}'`)).rows[0];
   assert.deepEqual(parked,{status:'failed',error:'dispatch_uncertain'});
   assert.equal((await db.query(`select count(*)::int n from automation_dispatch_attempts where owner_id='${owner}'`)).rows[0].n,0,'Known sequence is not adopted as unknown legacy');
  });

 } finally {await db.close();}
});
