import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lit,qi,qual,sha,privateFile} from './commercial-complete-runtime.mjs';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const stable=v=>JSON.stringify(canonical(v));
const ordered=a=>[...(a||[])].sort((a,b)=>stable(a).localeCompare(stable(b)));
const aclExpr=(column,defaultExpr)=>`coalesce((select jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable)) from aclexplode(coalesce(${column},${defaultExpr})) x),'[]'::jsonb)`;
const compare=(actual,expected,key)=>{
 if(stable(actual)!==stable(expected)){const e=Error(`Catalog mismatch: ${key}`);e.privateCatalog={actual,expected};e.catalogDifference={key,actualHash:sha(JSON.stringify(actual)),expectedHash:sha(JSON.stringify(expected))};throw e;}
};
export function verifyCatalog(rt,c,auth,privileges,sequences,roles){
 const result={tables:0,functions:0,policies:0,triggers:0,indexes:0,columnAcls:0,sequences:0,roles:0,memberships:0,schemas:0};
 const tables=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',r.relname,'owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'forceRls',r.relforcerowsecurity,'acl',${aclExpr('r.relacl',"acldefault('r',r.relowner)")},'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),'constraints',coalesce((select jsonb_agg(jsonb_build_object('name',p.conname,'definition',pg_get_constraintdef(p.oid,true),'type',p.contype::text,'validated',p.convalidated)) from pg_constraint p where p.conrelid=r.oid),'[]'::jsonb))) from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname in ('public','private') and r.relkind='r';`));
 for(const target of c.tables){
  const a=tables.find(t=>t.schema===target.schema&&t.name===target.name);assert.ok(a,`Missing captured table ${qual(target)}`);
  for(const k of ['owner','rls','forceRls'])compare(a[k],target[k],`${qual(target)}.${k}`);
  compare(a.columns,target.columns,`${qual(target)}.columns`);compare(ordered(a.constraints),ordered(target.constraints),`${qual(target)}.constraints`);compare(ordered(a.acl),ordered(target.acl),`${qual(target)}.acl`);result.tables++;
 }
 const functions=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('oid',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',${aclExpr('p.proacl',"acldefault('f',p.proowner)")})) from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace,'auth'::regnamespace) and p.prokind='f';`));
 const identities=JSON.parse(rt.value(`select jsonb_object_agg(x,x::regprocedure::text) from unnest(array[${[...c.functions,...auth.helpers].map(f=>lit(f.signature)).join(',')}]::text[]) x`));
 for(const f of [...c.functions,...auth.helpers]){
  const identity=identities[f.signature],a=functions.find(x=>x.oid===identity);assert.ok(a,`Missing function ${f.signature}`);
  compare(a.md5,createHash('md5').update(f.definition).digest('hex'),`${f.signature}.definition-md5`);compare(a.owner,f.owner,`${f.signature}.owner`);compare(ordered(a.acl),ordered(f.acl),`${f.signature}.acl`);result.functions++;
 }
 const policies=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('name',policyname,'schema',schemaname,'table',tablename,'command',cmd,'permissive',permissive,'roles',roles,'using',qual,'check',with_check)) from pg_policies where schemaname in ('public','private');`));
 compare(ordered(policies.map(p=>({...p,roles:[...p.roles].sort()}))),ordered(c.policies.map(p=>({...p,roles:[...p.roles].sort()}))),'all-captured-policies');result.policies=policies.length;result.restrictivePolicies=policies.filter(p=>p.permissive==='RESTRICTIVE').length;
 const triggers=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('name',t.tgname,'schema',n.nspname,'table',r.relname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true))) from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where not t.tgisinternal and n.nspname in ('public','private','auth');`));
 // Provider Auth may install its own additional triggers; captured hooks must match exactly.
 for(const t of c.triggers){const a=triggers.find(x=>x.schema===t.schema&&x.table===t.table&&x.name===t.name);compare(a,t,`trigger:${t.schema}.${t.table}.${t.name}`);result.triggers++;}
 const indexes=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('name',indexname,'schema',schemaname,'table',tablename,'definition',indexdef)) from pg_indexes where schemaname in ('public','private');`));
 const backing=new Set(c.tables.flatMap(t=>t.constraints.filter(x=>['p','u','x'].includes(x.type)).map(x=>`${t.schema}.${x.name}`)));
 const standalone=indexes.filter(x=>!backing.has(`${x.schema}.${x.name}`));
 compare(ordered(standalone),ordered(c.indexes),'all-captured-standalone-indexes');
 assert.equal(indexes.length,standalone.length+backing.size,'Exact standalone plus captured constraint-backed index count');result.indexes=standalone.length;result.constraintBackedIndexes=backing.size;
 const columnAcls=JSON.parse(rt.value(`select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'column',a.attname,'acl',${aclExpr('a.attacl',"'{}'::aclitem[]")})),'[]'::jsonb) from pg_attribute a join pg_class r on r.oid=a.attrelid join pg_namespace n on n.oid=r.relnamespace where a.attacl is not null and a.attnum>0 and not a.attisdropped and n.nspname in ('public','private');`));
 compare(ordered(columnAcls.map(x=>({...x,acl:ordered(x.acl)}))),ordered(privileges.columnAcls.map(x=>({...x,acl:ordered(x.acl)}))),'all-column-acls');result.columnAcls=columnAcls.length;
 for(const s of sequences){
  const actual=JSON.parse(rt.value(`select jsonb_build_object('schema',n.nspname,'name',r.relname,'type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'owner',pg_get_userbyid(r.relowner),'acl',${aclExpr('r.relacl',"acldefault('S',r.relowner)")},'ownedBy',(select jsonb_build_object('schema',dn.nspname,'table',dr.relname,'column',da.attname) from pg_depend d join pg_class dr on dr.oid=d.refobjid join pg_namespace dn on dn.oid=dr.relnamespace join pg_attribute da on da.attrelid=dr.oid and da.attnum=d.refobjsubid where d.classid='pg_class'::regclass and d.objid=r.oid and d.deptype in ('a','i'))) from pg_sequence s join pg_class r on r.oid=s.seqrelid join pg_namespace n on n.oid=r.relnamespace where r.oid=${lit(`${s.schema}.${s.name}`)}::regclass;`));
  compare({...actual,acl:ordered(actual.acl)},{...s,acl:ordered(s.acl)},`sequence:${s.schema}.${s.name}`);result.sequences++;
 }
 const actualRoles=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypassrls',rolbypassrls,'createDb',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication,'login',rolcanlogin,'connectionLimit',rolconnlimit)) from pg_roles;`));
 for(const r of roles.roles){const actual=actualRoles.find(x=>x.name===r.name);compare(actual,r,`role:${r.name}`);result.roles++;}
 const actualMembers=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin',admin_option,'set',set_option,'inherit',inherit_option)) from pg_auth_members;`));
 for(const m of roles.roleMemberships){compare(actualMembers.find(x=>x.role===m.role&&x.member===m.member),m,`membership:${m.role}->${m.member}`);result.memberships++;}
 for(const s of [...c.schemas,auth.schema]){
  const actual=JSON.parse(rt.value(`select jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',${aclExpr('nspacl',"acldefault('n',nspowner)")}) from pg_namespace where nspname=${lit(s.name)};`));
  compare({...actual,acl:ordered(actual.acl)},{...s,acl:ordered(s.acl)},`schema:${s.name}`);result.schemas++;
 }
 privateFile(rt.dir,'catalog-verification.json',JSON.stringify(result,null,2));return result;
}

export function verifyDefaultACLs(rt,roleDetails){
 const rows=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'objectType',d.defaclobjtype,'acl',${aclExpr('d.defaclacl',"'{}'::aclitem[]")})) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where pg_get_userbyid(d.defaclrole)=any(array[${roleDetails.roles.map(r=>lit(r.name)).join(',')}]::text[])`));
 compare(ordered((rows||[]).map(x=>({...x,acl:ordered(x.acl)}))),ordered(roleDetails.defaultPrivileges.map(x=>({...x,acl:ordered(x.acl)}))),'actual-default-privileges');return {records:rows.length,matched:true};
}
