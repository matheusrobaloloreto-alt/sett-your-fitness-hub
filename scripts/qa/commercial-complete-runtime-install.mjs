import {restoreDatabaseContract} from './commercial-complete-runtime-database.mjs';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {output,qi,qual,lit,aclSQL,sha,configureManagedAuthorization} from './commercial-complete-runtime.mjs';

export function loadAuthCapture(){
 const p=path.join(output,'commercial-complete-auth-acl.private.json');
 if((statSync(p).mode&0o777)!==0o600)throw Error('Auth ACL capture privacy mismatch');
 const bytes=readFileSync(p),data=JSON.parse(bytes);
 if(data.schema?.name!=='auth'||!Array.isArray(data.schema.acl)||!Array.isArray(data.helpers)||data.helpers.length!==4)throw Error('Actual Auth helper/ACL capture missing');
 for(const f of data.helpers)if(!f.signature||!f.definition||!f.owner||!Array.isArray(f.acl))throw Error('Incomplete actual Auth helper ACL');
 return {data,hash:sha(bytes)};
}
const terminated=s=>s.trim().replace(/;?$/,';');
export function policySQL(p){
 if(!['PERMISSIVE','RESTRICTIVE'].includes(p.permissive))throw Error('Unknown captured policy permissiveness');
 if(!['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(p.command))throw Error('Unknown captured policy command');
 return `create policy ${qi(p.name)} on ${qi(p.schema)}.${qi(p.table)} as ${p.permissive.toLowerCase()} for ${p.command} to ${p.roles.map(r=>r==='public'?'PUBLIC':qi(r)).join(',')}${p.using?` using (${p.using})`:''}${p.check?` with check (${p.check})`:''};`;
}
export function schemaPlan(c,auth,sequences,roleDetails){
 const phases=[];const add=(phase,sql)=>phases.push({phase,sql});
 // Reproduce captured privilege attributes; no passwords are captured or imported.
 // LOGIN is transport-only and is only enabled for our local infrastructure users.
 add('roles',c.roles.filter(r=>r.name!=='postgres'&&r.name!=='supabase_auth_admin').map(r=>`create role ${qi(r.name)} ${r.inherit?'inherit':'noinherit'} ${r.bypassrls?'bypassrls':'nobypassrls'} ${r.superuser?'superuser':'nosuperuser'};`).join('\n')+'\nalter role supabase_admin login;');
 add('role-attributes',roleDetails.roles.map(r=>`alter role ${qi(r.name)} ${r.inherit?'inherit':'noinherit'} ${r.bypassrls?'bypassrls':'nobypassrls'} ${r.superuser?'superuser':'nosuperuser'} ${r.createDb?'createdb':'nocreatedb'} ${r.createRole?'createrole':'nocreaterole'} ${r.replication?'replication':'noreplication'} ${r.login?'login':'nologin'} connection limit ${r.connectionLimit};`).join('\n')+'\nalter role supabase_admin login;');
 add('memberships',roleDetails.roleMemberships.map(m=>`grant ${qi(m.role)} to ${qi(m.member)} with admin ${m.admin?'true':'false'}, inherit ${m.inherit?'true':'false'}, set ${m.set?'true':'false'};`).join('\n'));
 add('schemas',c.schemas.filter(s=>s.name!=='public').map(s=>`create schema ${qi(s.name)} authorization ${qi(s.owner)};`).join('\n'));
 for(const s of c.schemas)add(`schema-acl:${s.name}`,aclSQL('schema',qi(s.name),s.owner,s.acl,c.roles));
 add('auth-schema-acl',aclSQL('schema','auth',auth.schema.owner,auth.schema.acl,c.roles));
 for(const e of c.extensions||[]){
  if(e.name==='plpgsql'||e.name==='pgcrypto')continue;
  add(`extension:${e.name}`,`${e.schema==='pg_catalog'?'':`create schema if not exists ${qi(e.schema)}; `}create extension ${qi(e.name)} with schema ${qi(e.schema)} version ${lit(e.name==='pg_net'?'0.20.4':e.version)};`);
 }
 add('enums',c.enums.map(e=>`create type ${qual(e)} as enum (${e.labels.map(lit).join(',')});`).join('\n'));
 // Identity sequences are created by their actual table column; never duplicate them.
 const identityNames=new Set(c.tables.flatMap(t=>t.columns.filter(col=>col.identity).map(col=>`${t.schema}.${t.name}_${col.name}_seq`)));
 add('sequences',(sequences||[]).filter(s=>!identityNames.has(`${s.schema}.${s.name}`)).map(s=>{
  validateSequence(s);
  return `create sequence ${qual(s)} as ${s.type} increment ${s.increment} minvalue ${s.min} maxvalue ${s.max} start ${s.start} cache ${s.cache} ${s.cycle?'cycle':'no cycle'}; alter sequence ${qual(s)} owner to ${qi(s.owner)};`;
 }).join('\n'));
 add('tables',c.tables.map(t=>{
  if(t.kind!=='r')throw Error(`Unsupported relation kind: ${t.schema}.${t.name}`);
  return `create table ${qual(t)} (${t.columns.map(col=>{
   if(col.generated)throw Error('Generated columns require exact expression phase');
   return `${qi(col.name)} ${col.type}${col.identity?` generated ${col.identity==='a'?'always':'by default'} as identity`:''}${col.notNull?' not null':''}`;
  }).join(',\n')});`;
 }).join('\n'));
 return phases;
}
export function installSchema(rt,c,auth,privileges,sequences,roleDetails){
 const progress=[];const run=(phase,sql)=>{if(sql.trim())rt.sql(sql,{phase});progress.push(phase);console.log(`INSTALL ${phase}`);};
 const plan=schemaPlan(c,auth,sequences,roleDetails);
 // postgres becomes the actual non-superuser captured role; installer switches to
 // the captured superuser supabase_admin before applying those role attributes.
 for(const p of plan){if(p.phase==='role-attributes')rt.sqlUser='supabase_admin';if(p.phase==='schemas'){rt.databaseContract=restoreDatabaseContract(rt,c.roles);rt.managedAuthorization=configureManagedAuthorization(rt);}run(p.phase,p.sql);}
 for(const v of c.views||[])run(`view:${v.schema}.${v.name}`,`create view ${qual(v)}${v.options?.length?` with (${v.options.join(',')})`:''} as ${v.definition};\n${aclSQL('table',qual(v),v.owner,v.acl,c.roles)}`);
 const funcs=[...auth.helpers,...c.functions];let remaining=[...funcs];
 for(let pass=0;pass<12&&remaining.length;pass++){
  const chunk=remaining.map(f=>`begin execute ${lit(terminated(f.definition))}; exception when others then insert into complete_function_failures values (${lit(f.signature)},SQLSTATE);end;`).join('\n');
  const failureRows=JSON.parse(rt.value(`set search_path=public,extensions;create temporary table complete_function_failures(signature text,state text);do $complete_install$ begin ${chunk} end $complete_install$;select coalesce(jsonb_agg(jsonb_build_object('signature',signature,'state',state)),'[]'::jsonb) from complete_function_failures;`));
  const next=failureRows.map(r=>({f:remaining.find(f=>f.signature===r.signature),states:[r.state]}));
  console.log(`INSTALL functions-pass-${pass+1} remaining=${next.length}`);
  if(next.length===remaining.length){
   // Report signatures ONLY, never definitions or raw SQL diagnostics.
   const deps=next.map(x=>({signature:x.f.signature,sqlstates:x.states}));
   const error=new Error('Actual function closure did not compile');error.dependencies=deps;throw error;
  }
  remaining=next.map(x=>x.f);
 }
 if(remaining.length){const e=new Error('Actual function compile retry bound reached');e.dependencies=remaining.map(f=>({signature:f.signature}));throw e;}
 run('function-acls',funcs.map(f=>aclSQL('function',f.signature,f.owner,f.acl,c.roles)).join('\n'));
 run('defaults',c.tables.flatMap(t=>t.columns.filter(col=>col.default!==null&&!col.identity&&!col.generated).map(col=>`alter table ${qual(t)} alter column ${qi(col.name)} set default ${col.default};`)).join('\n'));
 for(const kind of ['p','u','c','x','f'])run(`constraints:${kind}`,c.tables.flatMap(t=>t.constraints.filter(x=>x.type===kind).map(x=>`alter table ${qual(t)} add constraint ${qi(x.name)} ${x.definition};`)).join('\n'));
 const constraintIndexes=new Set(c.tables.flatMap(t=>t.constraints.filter(x=>['p','u','x'].includes(x.type)).map(x=>`${t.schema}.${x.name}`)));
 run('indexes',c.indexes.filter(i=>!constraintIndexes.has(`${i.schema}.${i.name}`)).map(i=>terminated(i.definition)).join('\n'));

 run('policies',c.policies.map(policySQL).join('\n'));
 run('triggers',c.triggers.map(t=>`${terminated(t.definition)}\nalter table ${qi(t.schema)}.${qi(t.table)} ${t.enabled==='D'?'disable trigger':t.enabled==='R'?'enable replica trigger':t.enabled==='A'?'enable always trigger':'enable trigger'} ${qi(t.name)};`).join('\n'));
 run('table-acls-rls',c.tables.map(t=>aclSQL('table',qual(t),t.owner,t.acl,c.roles)+`\nalter table ${qual(t)} ${t.rls?'enable':'disable'} row level security;\nalter table ${qual(t)} ${t.forceRls?'force':'no force'} row level security;`).join('\n'));
 if(!privileges||!Array.isArray(privileges.columnAcls)||!Array.isArray(privileges.sequences))throw Error('Privilege supplement required');
 run('identity-sequence-attributes',sequences.filter(seq=>seq.ownedBy&&c.tables.find(t=>t.name===seq.ownedBy.table&&t.schema===seq.ownedBy.schema)?.columns.find(col=>col.name===seq.ownedBy.column)?.identity).map(seq=>{validateSequence(seq);return `alter sequence ${qual(seq)} as ${seq.type} increment ${seq.increment} minvalue ${seq.min} maxvalue ${seq.max} start ${seq.start} cache ${seq.cache} ${seq.cycle?'cycle':'no cycle'};`;}).join('\n'));
 run('sequence-acls',sequences.map(seq=>{
  const obj=qual(seq);const rev=['PUBLIC',...c.roles.map(r=>r.name)].map(r=>`revoke all on sequence ${obj} from ${r==='PUBLIC'?'PUBLIC':qi(r)};`);
  for(const a of seq.acl){if(!['USAGE','SELECT','UPDATE'].includes(a.privilege))throw Error('Unknown sequence privilege');rev.push(`grant ${a.privilege} on sequence ${obj} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''};`);}
  if(seq.ownedBy){const o=seq.ownedBy;const identity=c.tables.find(t=>t.schema===o.schema&&t.name===o.table)?.columns.find(col=>col.name===o.column)?.identity;if(!identity)rev.push(`alter sequence ${obj} owned by ${qi(o.schema)}.${qi(o.table)}.${qi(o.column)};`);}
  rev.push(`alter sequence ${obj} owner to ${qi(seq.owner)};`);return rev.join('\n');
 }).join('\n'));
 run('column-acls',privileges.columnAcls.map(x=>x.acl.map(a=>{if(!['SELECT','INSERT','UPDATE','REFERENCES'].includes(a.privilege))throw Error('Unknown column ACL');return `grant ${a.privilege} (${qi(x.column)}) on table ${qi(x.schema)}.${qi(x.table)} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''};`;}).join('\n')).join('\n'));
 return {databaseContract:rt.databaseContract,managedAuthorization:rt.managedAuthorization,extensionBoundary:[{name:"pg_net",target:"0.20.0",runtime:"0.20.4",reason:"Only version cached in authorized official .155 image; no extension parity claim"}],phases:progress,actualFunctions:funcs.length,actualTables:c.tables.length,actualPolicies:c.policies.length,actualTriggers:c.triggers.length,preciseSequenceContracts:sequences.length,columnAcls:privileges.columnAcls.length};
}

export function loadPrivileges(){
 const p=path.join(output,'commercial-complete-privilege-detail.private.json');if((statSync(p).mode&0o777)!==0o600)throw Error('Privilege capture privacy mismatch');
 const bytes=readFileSync(p),data=JSON.parse(bytes);return {data,hash:sha(bytes)};
}

export function validateSequence(s){
 for(const k of ['start','increment','min','max','cache'])if(typeof s[k]!=='string'||!/^[-]?[0-9]+$/.test(s[k]))throw Error('Sequence attributes require exact integer TEXT');
 const min=BigInt(s.min),max=BigInt(s.max),start=BigInt(s.start);if(min>start||start>max||BigInt(s.increment)===0n||BigInt(s.cache)<1n)throw Error('Invalid exact sequence bounds');return s;
}
export function loadSequences(){
 const p=path.join(output,'commercial-complete-sequences.private.json');if((statSync(p).mode&0o777)!==0o600)throw Error('Sequence capture privacy mismatch');const bytes=readFileSync(p),data=JSON.parse(bytes);data.forEach(validateSequence);return {data,hash:sha(bytes)};
}

export function loadRoleDefaults(){
 const p=path.join(output,'commercial-complete-role-defaults.private.json');if((statSync(p).mode&0o777)!==0o600)throw Error('Role/defaults capture privacy mismatch');const bytes=readFileSync(p),data=JSON.parse(bytes);return {data,hash:sha(bytes)};
}
export function defaultACLs(rt,c){
 const types={r:'TABLES',S:'SEQUENCES',f:'FUNCTIONS',T:'TYPES',n:'SCHEMAS'};
 for(const x of c.defaultPrivileges){const kind=types[x.objectType];if(!kind)throw Error('Unknown default privilege object type');const prefix=`alter default privileges for role ${qi(x.owner)}${x.schema?` in schema ${qi(x.schema)}`:''}`;
 const revoke=['PUBLIC',...c.roles.map(r=>r.name)].map(r=>`${prefix} revoke all on ${kind} from ${r==='PUBLIC'?'PUBLIC':qi(r)};`);
 for(const a of x.acl){if(!/^[A-Z]+$/.test(a.privilege))throw Error('Invalid default privilege');revoke.push(`${prefix} grant ${a.privilege} on ${kind} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''};`);}
 rt.sql(revoke.join('\n'),{phase:'default-privileges'});
 }
}
