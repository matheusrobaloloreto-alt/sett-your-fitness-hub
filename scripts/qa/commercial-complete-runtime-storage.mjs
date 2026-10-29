import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {output,lit,sha,privateFile,command} from './commercial-complete-runtime.mjs';
import {signLocal} from './commercial-complete-runtime-business.mjs';
import {policySQL} from './commercial-complete-runtime-install.mjs';

export function loadStorageBoundary(){
 const p=path.join(output,'commercial-complete-storage-boundary.private.json');if((statSync(p).mode&0o777)!==0o600)throw Error('Storage capture privacy mismatch');const bytes=readFileSync(p);return {data:JSON.parse(bytes),hash:sha(bytes)};
}
export async function bootstrapStorage(rt,auth,boundary){
 rt.sql(`create schema storage authorization supabase_storage_admin;alter role supabase_storage_admin password ${lit(auth.password)};alter role supabase_storage_admin set search_path=storage,public,extensions;`,{phase:'official-storage-bootstrap'});
 const svc=rt.startService('storage','public.ecr.aws/supabase/storage-api:v1.71.0',{
  ANON_KEY:signLocal(auth.jwtSecret,'anon'),SERVICE_KEY:signLocal(auth.jwtSecret,'service_role'),AUTH_JWT_SECRET:auth.jwtSecret,
  DATABASE_URL:`postgres://supabase_storage_admin:${auth.password}@${rt.name}:5432/postgres`,POSTGREST_URL:`http://${rt.name}-rest:3000`,
  STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/tmp/storage',TENANT_ID:rt.token,REGION:'local',GLOBAL_S3_BUCKET:'synthetic-local',ENABLE_IMAGE_TRANSFORMATION:'false',FILE_SIZE_LIMIT:'1048576',DB_INSTALL_ROLES:'false',
 });
 let ready=false;
 for(let n=0;n<90;n++){
  if(!rt.inspectService(svc).State.Running)break;
  if(rt.http(`http://${svc.name}:5000/status`).status===200){ready=true;break;}
  await new Promise(r=>setTimeout(r,300));
 }
 if(!ready){const r=command(['logs',svc.name]);privateFile(rt.dir,'storage-failure.private.log',r.stdout+r.stderr);throw Error('Actual official Storage bootstrap failed');}
 const rows=JSON.parse(rt.value("select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod))) from pg_attribute a where a.attrelid='storage.objects'::regclass and a.attnum>0 and not a.attisdropped"));
 for(const col of boundary.objectColumns)assert.deepEqual(rows.find(x=>x.name===col.name),col,`Actual Storage column contract ${col.name}`);
 const helpers=[];
 for(const f of boundary.helperContracts){
  const v=JSON.parse(rt.value(`select jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'result',pg_get_function_result(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='storage' and p.proname=${lit(f.name)} and pg_get_function_arguments(p.oid)=${lit(f.signature)}`));
  assert.equal(v.result,f.result,`Actual Storage helper result ${f.name}`);assert.equal(v.md5,f.definition_md5,`Actual Storage helper definition ${f.name}`);helpers.push({name:f.name,matched:true});
 }
 // Default provider policies are not the application's actual authorization.
 rt.sql("do $drop$ declare p record;begin for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop execute format('drop policy %I on storage.objects',p.policyname);end loop;end $drop$;\n"+boundary.objectPolicies.map(policySQL).join('\n'),{phase:'actual-storage-object-policies'});
 const installedPolicies=JSON.parse(rt.value("select jsonb_agg(jsonb_build_object('name',policyname,'schema',schemaname,'table',tablename,'command',cmd,'permissive',permissive,'roles',roles,'using',qual,'check',with_check)) from pg_policies where schemaname='storage' and tablename='objects'"));
 const sorted=items=>[...items].map(p=>({...p,roles:[...p.roles].sort()})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(sorted(installedPolicies),sorted(boundary.objectPolicies),'Exact Storage object policy predicates, modes, command and roles');
 return {image:svc.imageId,version:'1.71.0',targetInternalVersionNotCloned:true,columnContracts:boundary.objectColumns.length,helpers,objectPolicies:installedPolicies.length,limits:['Hosted Storage internals and provider data not cloned','Schema/object ACL supplement required for Storage HTTP authorization claim']};
}
