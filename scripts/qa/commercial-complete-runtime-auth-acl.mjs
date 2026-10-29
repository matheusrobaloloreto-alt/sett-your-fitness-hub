import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {output,qi,qual,lit,sha,aclSQL} from './commercial-complete-runtime.mjs';

export function loadAuthTableACLs(){
 const filename=path.join(output,'commercial-complete-auth-tables-acl.private.json');if((statSync(filename).mode&0o777)!==0o600)throw Error('Actual Auth table capture privacy mismatch');
 const bytes=readFileSync(filename),data=JSON.parse(bytes);
 if(!Array.isArray(data)||data.length!==2||!data.every(t=>t.schema==='auth'&&['users','sessions'].includes(t.name)&&t.owner&&Array.isArray(t.acl)&&typeof t.rls==='boolean'&&typeof t.forceRls==='boolean'))throw Error('Actual Auth table ACL contract missing');return {data,hash:sha(bytes)};
}
export function restoreAuthTableACLs(rt,tables,roles){
 for(const t of tables){
  rt.sql(aclSQL('table',qual(t),t.owner,t.acl,roles)+`\nalter table ${qual(t)} ${t.rls?'enable':'disable'} row level security;alter table ${qual(t)} ${t.forceRls?'force':'no force'} row level security;`,{phase:`auth-table-acl:${t.name}`});
  if((t.columnAcls||[]).length)throw Error('Captured Auth column ACLs require explicit supported shape');
 }
 return verifyAuthTableACLs(rt,tables);
}
const sort=a=>a.map(x=>`${x.grantee}|${x.privilege}|${x.grantable}`).sort();
export function verifyAuthTableACLs(rt,tables){
 for(const t of tables){
  const a=JSON.parse(rt.value(`select jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),'columnAcls',(select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and a.attacl is not null)) from pg_class c where c.oid=${lit(`${t.schema}.${t.name}`)}::regclass;`));
  if(a.owner!==t.owner||a.rls!==t.rls||a.forceRls!==t.forceRls||JSON.stringify(sort(a.acl))!==JSON.stringify(sort(t.acl))||a.columnAcls!==(t.columnAcls||[]).length)throw Error(`Actual Auth table catalog mismatch: ${t.name}`);
 }
 return {tables:tables.length,ownerAclRlsMatched:true,source:'Read-only target metadata; official GoTrue implementation; no Auth rows cloned'};
}
