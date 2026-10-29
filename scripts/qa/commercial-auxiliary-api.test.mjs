import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {api,login} from './self-service-api.mjs';
import {sql} from './self-service-local.mjs';

// Explicit root-only serial Auth/REST window, synthetic tenants, no dispatcher.
const q=v=>`'${String(v).replaceAll("'","''")}'`;
async function checked(path,options={}){
  const r=await api(path,options);
  assert.equal(r.ok,true,`${path.split('?')[0]} HTTP${r.status} ${r.data?.code||''}`);
  return r.data;
}
const insert=async(table,body)=>(await checked(`/rest/v1/${table}`,{method:'POST',admin:true,body}))[0];
test('actual local Auth/REST: auxiliary commercial adoption and authorized cleanup',{timeout:180000},async t=>{
  // This shared local fixture intentionally omitted the historical permissive
  // auxiliary table ACLs/policies. Never add grants to make a test pass. Positive
  // direct-table behavior is covered on isolated historical-policy fixtures.
  const rawReadable=sql("select has_table_privilege('authenticated','public.whatsapp_chat_labels','SELECT')") === 't';
  const company=randomUUID(),foreign=randomUUID(),people={};
  await checked('/rest/v1/companies',{method:'POST',admin:true,body:[
    {id:company,name:'Synthetic commercial auxiliary',slug:`aux-${company}`,tier:'basic'},
    {id:foreign,name:'Synthetic auxiliary foreign',slug:`aux-${foreign}`,tier:'basic'},
  ]});
  for(const role of ['admin','master','student','foreign']){
    const email=`aux-${role}-${randomUUID()}@self-service.invalid`;
    const user=await checked('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,email_confirm:true}});
    sql(`insert into user_roles(user_id,role) values(${q(user.id)},${q(role==='foreign'?'admin':role)});
      insert into company_members(company_id,user_id) values(${q(role==='foreign'?foreign:company)},${q(user.id)});`);
    people[role]={token:(await login({id:user.id,email})).access_token};
  }
  const flow=await insert('automation_flows',{company_id:company,name:'Synthetic auxiliary flow',trigger_type:'manual',is_active:false});
  const chat=await insert('whatsapp_chats',{company_id:company,remote_jid:`synthetic-${randomUUID()}@s.whatsapp.net`});
  const label=await insert('whatsapp_labels',{company_id:company,name:'Synthetic auxiliary label'});
  const pair=await insert('whatsapp_chat_labels',{chat_id:chat.id,label_id:label.id});
  const session=await insert('flow_sessions',{flow_id:flow.id,chat_id:chat.id,status:'failed',context:{dispatch_error:'dispatch_uncertain'}});
  const rpc=(name,body,actor='admin')=>api(`/rest/v1/rpc/${name}`,{method:'POST',token:people[actor]?.token,body});
  await t.test('legacy safe status readable by own staff; baseline table ACL retained',async()=>{
    const rows=await api(`/rest/v1/whatsapp_chat_labels?id=eq.${pair.id}`,{token:people.admin.token});
    if(rawReadable){assert.equal(rows.ok,true);assert.equal(rows.data.length,1);}
    else assert.equal(rows.status,403,'preserve absent baseline table grant');
    const status=await rpc('get_company_dispatch_uncertainties',{_company_id:company});
    assert.equal(status.ok,true);assert.equal(status.data.length,1);
    assert.deepEqual(Object.keys(status.data[0]).sort(),['id','name','source','updated_at']);
    for(const actor of ['student','foreign','anonymous'])assert.equal((await rpc('get_company_dispatch_uncertainties',{_company_id:company},actor)).ok,false);
  });
  await t.test('explicit Master adoption denies direct read/write/status without hiding history globally',async()=>{
    const catalog=await checked('/rest/v1/platform_product_settings?id=eq.default&select=version,settings',{token:people.master.token});
    assert.equal(catalog[0].settings.tiers.basic.features.hasWhatsApp,false);
    assert.equal(catalog[0].settings.tiers.basic.features.hasAutomation,false);
    const adopted=await rpc('set_company_feature_policy',{_company_id:company,_source:'catalog',_expected_version:0,_catalog_version:catalog[0].version,_confirm:true},'master');
    assert.equal(adopted.ok,true);
    for(const [table,id] of [['whatsapp_chat_labels',pair.id],['flow_sessions',session.id]]){
      const rows=await api(`/rest/v1/${table}?id=eq.${id}`,{token:people.admin.token});
      if(rawReadable){assert.equal(rows.ok,true);assert.deepEqual(rows.data,[]);}
      else assert.equal(rows.status,403,'preserve absent baseline table grant');
    }
    assert.equal((await rpc('get_company_dispatch_uncertainties',{_company_id:company})).ok,false);
    assert.equal((await api('/rest/v1/flow_sessions',{method:'POST',token:people.admin.token,body:{flow_id:flow.id,chat_id:chat.id,status:'failed'}})).ok,false);
    assert.equal((await api('/rest/v1/whatsapp_jid_aliases?select=*',{token:people.admin.token})).ok,false);
  });
  await t.test('cleanup RPC denies foreign/student and removes only exact own rows',async()=>{
    const body={_company_id:company,_kind:'labels',_row_id:pair.id};
    for(const actor of ['student','foreign','anonymous'])assert.equal((await rpc('delete_company_whatsapp_auxiliary',body,actor)).ok,false);
    assert.equal((await rpc('delete_company_whatsapp_auxiliary',body)).data,1);
    assert.equal((await rpc('delete_company_whatsapp_auxiliary',body)).data,0);
    assert.equal((await rpc('delete_company_whatsapp_auxiliary',{...body,_kind:'sessions',_row_id:session.id})).data,1);
    for(const [table,id] of [['whatsapp_chat_labels',pair.id],['flow_sessions',session.id]]){
      assert.deepEqual(await checked(`/rest/v1/${table}?id=eq.${id}`,{admin:true}),[]);
    }
    assert.equal((await checked(`/rest/v1/automation_flows?id=eq.${flow.id}`,{admin:true})).length,1);
    assert.equal((await checked(`/rest/v1/whatsapp_chats?id=eq.${chat.id}`,{admin:true})).length,1);
  });
  await t.test('trusted ingress and private ACL/OID readback preserved after adoption',async()=>{
    const inbound=await insert('flow_sessions',{flow_id:flow.id,chat_id:chat.id,status:'failed',context:{source:'synthetic ingress'}});
    assert.ok(inbound.id);
    const scope=sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='commercial_private' and
        (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'));`);
    assert.equal(scope,'0');
    assert.match(sql(`select prosrc from pg_proc where oid='commercial_private.get_company_dispatch_uncertainties(uuid)'::regprocedure`),/require_dispatch_status/);
  });
});
