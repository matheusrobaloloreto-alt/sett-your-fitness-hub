import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,statSync,realpathSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const repo=fileURLToPath(new URL('../../',import.meta.url));
export const output=path.join(repo,'output/self-service-local-20261026');
export const capturePath=path.join(output,'commercial-complete-schema.private.json');
export const image='public.ecr.aws/supabase/postgres:17.6.1.155';
export const ownerKey='sett.commercial-complete-runtime';
export const sha=s=>createHash('sha256').update(s).digest('hex');
export const qi=s=>'"'+String(s).replaceAll('"','""')+'"';
export const lit=s=>"'"+String(s).replaceAll("'","''")+"'";
export const qual=o=>`${qi(o.schema)}.${qi(o.name)}`;
export const allowlist=Object.freeze([
'20261026092601_company_product_settings.sql',
'20261026093003_company_form_definitions.sql',
'20261026093035_platform_product_catalog_self_service.sql',
'20261026093137_company_communication_cadence.sql',
'20261026093532_company_owned_exercise_metadata_policy.sql',
'20261026093918_company_experience_gamification.sql',
'20261026095657_company_ai_whatsapp_admin_toggle.sql',
'20261026101425_atomic_company_automation_graph.sql',
'20261026101523_company_commercial_content_limits.sql',
'20261026102254_workout_feedback_form_definition.sql',
'20261026102744_company_assessment_protocol_versions.sql',
'20261026105211_workout_feedback_form_definition_guards.sql',
'20261026110017_commercial_explicit_limits_opt_in.sql',
'20261026111335_commercial_plan_kind_admission_guard.sql',
'20261026112230_company_explicit_tier_admission_opt_in.sql',
'20261026114923_versioned_intercycle_consent_provenance.sql',
'20261026174533_automation_dispatch_recovery.sql',
'20261026174537_company_feature_entitlements.sql',
'20261026180257_automation_dispatch_status.sql',
'20261026181830_commercial_settings_upsert_entitlement_baseline.sql',
'20261027095055_commercial_whatsapp_auxiliary_permissions.sql',
'20261027095814_commercial_whatsapp_auxiliary_cleanup.sql',
'20261027095104_commercial_storage_entitlements.sql',
'20261027110658_commercial_target_original_oid_guards.sql',
'20261027111459_commercial_target_agenda_reschedule_context.sql',
]);

// No imports from the shared self-service helpers: those can connect to DB57422.
export function command(args,input,timeout=30000){
 const r=spawnSync('docker',['--context','colima',...args],{input,encoding:'utf8',timeout,maxBuffer:32*1024*1024,
  env:{PATH:process.env.PATH,HOME:process.env.HOME,DO_NOT_TRACK:'1'}});
 return {status:r.status,signal:r.signal,stdout:r.stdout||'',stderr:r.stderr||'',timedOut:r.error?.code==='ETIMEDOUT'};
}
export function checked(args,input,phase='docker',timeout){
 const r=command(args,input,timeout);if(r.status!==0||r.signal||r.timedOut)throw Error(`${phase}: command failed (exit=${r.status},signal=${r.signal||'none'})`);return r.stdout;
}
export function privateFile(dir,name,data){
 if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('Unsafe private filename');
 mkdirSync(dir,{mode:0o700,recursive:true});
 if((statSync(dir).mode&0o777)!==0o700)throw Error('Private directory must have mode 0700');
 const p=path.join(dir,name);if(existsSync(p))throw Error('Refuse private output overwrite');
 writeFileSync(p,data,{mode:0o600,flag:'wx'});return p;
}
export function readCapture(filename=capturePath){
 if(path.resolve(filename)!==capturePath||realpathSync(path.dirname(filename))!==output)throw Error('Unexpected capture location');
 if((statSync(filename).mode&0o777)!==0o600||(statSync(output).mode&0o777)!==0o700)throw Error('Capture privacy mode mismatch');
 const ignored=spawnSync('git',['check-ignore','--quiet',filename],{cwd:repo});if(ignored.status!==0)throw Error('Capture is not ignored');
 const bytes=readFileSync(filename);const data=JSON.parse(bytes);validateCapture(data);return {data,hash:sha(bytes)};
}
export const snapshotContract=Object.freeze({version:'2026-10-27-root-full-catalog-v1',logicalSha256:'155b019983bd3e464f537d5980abd5b044d2b6a65cb69bd2170565bf0e6de34b'});
export function validateCapture(c){
 if(c?.project!=='zshrcgbyhzxpnlccssyz'||!Number.isFinite(Date.parse(c.capturedAt)))throw Error('Capture project/timestamp mismatch');
 for(const k of ['enums','tables','indexes','policies','triggers','functions','roles','schemas','roleMemberships','omittedFunctions'])if(!Array.isArray(c[k]))throw Error(`Capture lacks ${k}`);
 if(!c.tables.length||!c.functions.length)throw Error('Empty catalog is not a baseline');
 for(const k of ['policies','triggers','roles','schemas','roleMemberships'])if(!c[k].length)throw Error(`Empty security catalog: ${k}`);
 if(c.omittedFunctions.length)throw Error('Omitted actual functions block baseline');
 if(sha(JSON.stringify(c))!==snapshotContract.logicalSha256)throw Error('Root versioned catalog integrity mismatch');
 for(const t of c.tables){
  if(!t.schema||!t.name||!Array.isArray(t.columns)||!Array.isArray(t.constraints)||!Array.isArray(t.acl)||typeof t.rls!=='boolean'||typeof t.forceRls!=='boolean'||!t.owner)throw Error('Incomplete table catalog');
  for(const col of t.columns)if(!col.name||!col.type||typeof col.notNull!=='boolean'||!Object.hasOwn(col,'default')||!Object.hasOwn(col,'identity')||!Object.hasOwn(col,'generated'))throw Error('Incomplete column catalog');
 }
 for(const f of c.functions)if(!f.signature||!f.definition||!f.owner||!Array.isArray(f.acl))throw Error('Incomplete function catalog');
 const required=['get_company_dashboard_snapshot','reassign_student_trainer','set_registration_lead_stage','reschedule_training_cycles_from','can_manage_staff_student','has_staff_permission','is_company_staff','has_role','current_business_date'];
 for(const n of required)if(!c.functions.some(f=>new RegExp(`(?:public\\.)?${n}\\(`).test(f.signature)))throw Error(`Missing actual function: ${n}`);
}
export function assertOwned(name,token,network,net,object,imageId){
 if(!/^sett-complete-[a-f0-9]{16}$/.test(name)||name!==`sett-complete-${token}`||network!==`${name}-internal`)throw Error('Disposable identity mismatch');
 if(net.Name!==network||net.Internal!==true||net.Labels?.[ownerKey]!==token||net.EnableIPv6)throw Error('Network ownership/isolation mismatch');
 if(object.Name!==`/${name}`||object.Config?.Labels?.[ownerKey]!==token||object.Image!==imageId)throw Error('Container ownership/image mismatch');
 if(object.HostConfig?.NetworkMode!==network||Object.keys(object.NetworkSettings?.Networks||{}).join()!==network||Object.keys(object.HostConfig?.PortBindings||{}).length||(object.HostConfig?.Binds||[]).length||(object.Mounts||[]).some(m=>m.Type!=='tmpfs'))throw Error('Container isolation mismatch');
}
export class Runtime{
 constructor(){this.token=randomBytes(8).toString('hex');this.name=`sett-complete-${this.token}`;this.network=`${this.name}-internal`;this.dir=path.join(output,`${this.name}.private`);this.events=[];this.services=[];this.sqlUser='complete_installer';this.created=false;this.networkCreated=false;this.volumes=[];}
 inspect(){
  const n=JSON.parse(checked(['network','inspect',this.network]))[0],c=JSON.parse(checked(['inspect',this.name]))[0];
  assertOwned(this.name,this.token,this.network,n,c,this.imageId);return c;
 }
 async start(){
  this.imageId=checked(['image','inspect',image,'--format','{{.Id}}']).trim();
  privateFile(this.dir,'.gitignore','*\n');
  checked(['network','create','--internal','--label',`${ownerKey}=${this.token}`,this.network]);this.networkCreated=true;
  checked(['run','-d','--pull=never','--name',this.name,'--label',`${ownerKey}=${this.token}`,'--network',this.network,
   '--memory','768m','--cpus','1','--pids-limit','128','--ulimit','core=0','--user','100:101',
   '--tmpfs','/complete:rw,nosuid,nodev,uid=100,gid=101,mode=0700,size=384m','--entrypoint','/bin/sh',image,'-ec',
   'initdb -U complete_installer -D /complete/data -A trust --locale=en_US.UTF-8 --encoding=UTF8 >/complete/init.log 2>&1; echo "host all all 0.0.0.0/0 scram-sha-256" >> /complete/data/pg_hba.conf; exec postgres -D /complete/data -k /complete -c listen_addresses=* -c shared_buffers=64MB -c max_connections=24 -c track_functions=all -c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse']);this.created=true;
  const c=this.inspect();this.volumes=(c.Mounts||[]).filter(m=>m.Type==='volume').map(m=>m.Name);
  for(let n=0;n<100;n++){
   if(command(['exec',this.name,'pg_isready','-h','/complete','-U','complete_installer'],undefined,3000).status===0){this.events.push('ready');return;}
   await new Promise(r=>setTimeout(r,250));
  }throw Error('Owned PostgreSQL readiness deadline');
 }
 sql(input,{allowError=false,phase='sql'}={}){
  this.inspect();
  const r=command(['exec','-i','-e','PGOPTIONS=-c statement_timeout=20000 -c lock_timeout=3000',this.name,'psql','-X','-qAt','-h','/complete','-U',this.sqlUser||'postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input);
  // Discard ALL SQL stderr: even the first line may contain a private definition.
  const states=[...r.stderr.matchAll(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/g)].map(m=>m[1]);
  const safe={status:r.status,signal:r.signal,timedOut:r.timedOut,stdout:r.stdout,states};
  if(r.status!==0||r.signal||r.timedOut)privateFile(this.dir,`sql-diagnostic-${randomBytes(6).toString('hex')}.private.log`,r.stderr);
  if(!allowError&&(r.status!==0||r.signal||r.timedOut))throw Error(`${phase}: SQL failed [${states.join(',')||'no-sqlstate'}]`);
  return safe;
 }
 value(q){return this.sql(q).stdout.trim();}
 egressProof(){
  this.inspect();
  const route=checked(['exec',this.name,'cat','/proc/net/route']);
  const defaultRoutes=route.split('\n').filter(l=>/^\S+\s+00000000\s/.test(l)).length;
  if(defaultRoutes)throw Error('Unexpected IPv4 default route');
  const probe=command(['exec',this.name,'/bin/bash','-c','timeout 2 bash -c "echo > /dev/tcp/192.0.2.1/443" >/dev/null 2>&1'],undefined,5000);
  if(probe.status===0)throw Error('Documentation-address egress unexpectedly succeeded');
  return {internal:true,hostPorts:0,binds:0,defaultRoutes,documentationAddressConnectExit:probe.status,providerContacted:false};
 }
 cleanup(){
  const evidence={containerAbsent:!this.created,networkAbsent:!this.networkCreated,services:[],volumes:[],cleanup:true};
  for(const svc of [...this.services].reverse()){this.inspectService(svc);checked(['rm','-f','-v',svc.name]);const absent=checked(['ps','-a','--filter',`name=^/${svc.name}$`,'--format','{{.Names}}']).trim()==='';evidence.services.push({name:svc.name,kind:svc.kind,image:svc.imageId,absent});if(!absent)throw Error('Service cleanup read-back failed');}
  if(this.created){this.inspect();checked(['rm','-f','-v',this.name]);evidence.containerAbsent=checked(['ps','-a','--filter',`name=^/${this.name}$`,'--format','{{.Names}}']).trim()==='';
   for(const v of this.volumes)evidence.volumes.push({name:v,absent:command(['volume','inspect',v]).status!==0});
  }
  if(this.networkCreated){const net=JSON.parse(checked(['network','inspect',this.network]))[0];if(net.Labels?.[ownerKey]!==this.token||Object.keys(net.Containers||{}).length)throw Error('Refuse network cleanup ownership mismatch');checked(['network','rm',this.network]);evidence.networkAbsent=command(['network','inspect',this.network]).status!==0;}
  evidence.cleanup=evidence.containerAbsent&&evidence.networkAbsent&&evidence.services.every(s=>s.absent)&&evidence.volumes.every(v=>v.absent);if(!evidence.cleanup)throw Error('Cleanup read-back failed');return evidence;
 }
}

const privilege=(p,kind)=>{
 const allowed=kind==='function'?['EXECUTE']:kind==='schema'?['USAGE','CREATE']:kind==='sequence'?['USAGE','SELECT','UPDATE']:kind==='database'?['CREATE','CONNECT','TEMPORARY']:['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
 const v=String(p).toUpperCase();if(!allowed.includes(v))throw Error('Unrecognized captured privilege');return v;
};
export function aclSQL(kind,object,owner,acl,roles){
 const targets=new Set(['PUBLIC',...roles.map(r=>typeof r==='string'?r:r.name).filter(Boolean)]);
 const statements=[`alter ${kind} ${object} owner to ${qi(owner)};`,...[...targets].map(r=>`revoke all on ${kind} ${object} from ${r==='PUBLIC'?'PUBLIC':qi(r)};`)];
 for(const a of acl){if(typeof a.grantable!=='boolean')throw Error('Missing captured grant option');statements.push(`grant ${privilege(a.privilege,kind)} on ${kind} ${object} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''};`);}
 return statements.join('\n');
}
export function freezeMigrations(){
 return allowlist.map(name=>{const p=path.join(repo,'supabase/migrations',name);const bytes=readFileSync(p);return {name,bytes,hash:sha(bytes)};});
}
export function assertFrozen(items){for(const x of items)if(sha(readFileSync(path.join(repo,'supabase/migrations',x.name)))!==x.hash)throw Error(`Source drift: ${x.name}`);}

Runtime.prototype.inspectService=function(svc){
 this.inspect();const c=JSON.parse(checked(['inspect',svc.name]))[0];
 if(c.Name!==`/${svc.name}`||c.Config?.Labels?.[ownerKey]!==this.token||c.Image!==svc.imageId||c.HostConfig.NetworkMode!==this.network||Object.keys(c.NetworkSettings.Networks).join()!==this.network||Object.keys(c.HostConfig.PortBindings||{}).length||(c.HostConfig.Binds||[]).length||(c.Mounts||[]).some(m=>m.Type!=='tmpfs'))throw Error('Service isolation/ownership mismatch');return c;
};
Runtime.prototype.startService=function(kind,serviceImage,config){
 if(!['auth','rest','storage'].includes(kind))throw Error('Unsupported local service');
 const imageId=checked(['image','inspect',serviceImage,'--format','{{.Id}}']).trim();
 const name=`${this.name}-${kind}`,envFile=privateFile(this.dir,`${kind}.env`,Object.entries(config).map(([k,v])=>`${k}=${v}`).join('\n'));
 checked(['run','-d','--pull=never','--name',name,'--label',`${ownerKey}=${this.token}`,'--network',this.network,'--env-file',envFile,'--memory','256m','--pids-limit','100','--ulimit','core=0',serviceImage]);
 const svc={name,imageId,kind};this.services.push(svc);this.inspectService(svc);return svc;
};
Runtime.prototype.http=function(url,{method='GET',headers={},body=null}={}){
 if(!new RegExp(`^http://${this.name}-(?:auth:9999|rest:3000|storage:5000)/`).test(url))throw Error('HTTP target is not our internal service');
 this.inspect();
 const esc=s=>String(s).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r');
 const config=[`url = "${esc(url)}"`,`request = "${method}"`,'silent','show-error','max-time = 8','write-out = "\\n%{http_code}"',...Object.entries(headers).map(([k,v])=>`header = "${esc(k+': '+v)}"`),...(body===null?[]:[`data = "${esc(JSON.stringify(body))}"`])].join('\n');
 // Tokens travel through stdin; never command arguments or tool output.
 const r=command(['exec','-i',this.name,'curl','--config','-'],config,12000);
 if(r.status!==0)return {status:0,body:null};const split=r.stdout.lastIndexOf('\n');
 let parsed=null;try{parsed=JSON.parse(r.stdout.slice(0,split));}catch{}
 return {status:Number(r.stdout.slice(split+1)),body:parsed};
};
export async function bootstrapAuth(rt){
 const jwtSecret=randomBytes(48).toString('hex'),password=randomBytes(32).toString('hex');
 privateFile(rt.dir,'credentials.json',JSON.stringify({jwtSecret,password}));
 rt.sql(`create role postgres nologin nosuperuser bypassrls; create role supabase_auth_admin login password ${lit(password)} noinherit; create schema auth authorization supabase_auth_admin; alter role supabase_auth_admin set search_path=auth,public,extensions; create schema extensions; create extension pgcrypto with schema extensions; grant usage on schema extensions to supabase_auth_admin;`);
 const svc=rt.startService('auth','public.ecr.aws/supabase/gotrue:v2.197.0',{
  GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:`http://${rt.name}-auth:9999`,GOTRUE_SITE_URL:'http://synthetic.invalid',GOTRUE_DB_DRIVER:'postgres',
  GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@${rt.name}:5432/postgres?sslmode=disable`,GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',
  GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'1',GOTRUE_RATE_LIMIT_EMAIL_SENT:'1000',GOTRUE_LOG_LEVEL:'error',GOTRUE_TRACING_ENABLED:'false',GOTRUE_METRICS_ENABLED:'false',
 });
 for(let i=0;i<90;i++){
  const running=rt.inspectService(svc).State.Running;if(!running)break;const r=rt.http(`http://${svc.name}:9999/health`);
  if(r.status===200)return {svc,jwtSecret,password};
  await new Promise(r=>setTimeout(r,300));
 }
 privateFile(rt.dir,'auth-failure.log',command(['logs',svc.name]).stdout+command(['logs',svc.name]).stderr);
 throw Error('Actual GoTrue readiness failed; inspect only owned private logs offline');
}

export function configureManagedAuthorization(rt){
 const filename=path.join(output,'commercial-complete-managed-gucs.private.json');if((statSync(filename).mode&0o777)!==0o600)throw Error('Managed authorization capture privacy mismatch');
 const bytes=readFileSync(filename),data=JSON.parse(bytes);
 const permitted=new Set(['session_preload_libraries','supautils.policy_grants','supautils.privileged_role','supautils.privileged_role_allowed_configs','supautils.reserved_memberships','supautils.reserved_roles','supautils.superuser']);
 if(!Array.isArray(data)||data.length!==permitted.size||data.some(x=>!permitted.has(x.name)||typeof x.setting!=='string'))throw Error('Managed authorization contract mismatch');
 const configQuote=s=>"'"+s.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
 const capturedSuperuser=data.find(x=>x.name==='supautils.superuser').setting;
 const config='\n'+data.map(x=>`${x.name} = ${configQuote(x.setting)}`).join('\n')+`\nsupautils.privileged_extensions_superuser = ${configQuote(capturedSuperuser)}\n`;
 rt.inspect();checked(['exec','-i',rt.name,'/bin/sh','-c','cat >> /complete/data/postgresql.conf'],config,'owned-managed-authorization-config');
 rt.sql('select pg_reload_conf();');
 const effective=JSON.parse(rt.value(`select jsonb_agg(jsonb_build_object('name',name,'setting',setting,'pendingRestart',pending_restart)) from pg_settings where name=any(array[${data.map(x=>lit(x.name)).join(',')}]::text[])`));
 privateFile(rt.dir,'managed-authorization-effective.private.json',JSON.stringify(effective));
 for(const row of data){const got=effective.find(x=>x.name===row.name);if(!got||got.setting!==row.setting||got.pendingRestart)throw Error(`Managed authorization effective mismatch: ${row.name}; actual=${got?.setting??'unregistered'}; pending=${got?.pendingRestart??'unknown'}`);}
 const alias=rt.value("select current_setting('supautils.privileged_extensions_superuser')");if(alias!==capturedSuperuser)throw Error('Managed compatibility alias mismatch');
 return {hash:sha(bytes),names:data.map(x=>x.name),compatibilityAlias:{name:'supautils.privileged_extensions_superuser',matchesCapturedCurrentValue:true},effectiveVerified:true,source:'configuration file on owned new candidate only',crashRepairClaim:false};
}

export function verifyCaptureManifest(expectedHash=null){
 const manifestName='commercial-complete-capture-manifest.private.json',filename=path.join(output,manifestName);
 if((statSync(output).mode&0o777)!==0o700||(statSync(filename).mode&0o777)!==0o600||realpathSync(filename)!==filename)throw Error('Root manifest privacy/path mismatch');
 const bytes=readFileSync(filename),hash=sha(bytes);if(expectedHash&&expectedHash!==hash)throw Error('Root manifest changed during acceptance');
 const manifest=JSON.parse(bytes);if(manifest.project!=='zshrcgbyhzxpnlccssyz'||!Array.isArray(manifest.files)||manifest.files.length<7)throw Error('Root manifest project/file contract mismatch');
 const required=['schema','auth-acl','auth-tables-acl','database','privilege-detail','sequences','role-defaults','managed-gucs','storage-boundary'].map(s=>`commercial-complete-${s}.private.json`);
 if(new Set(manifest.files.map(f=>f.name)).size!==manifest.files.length||manifest.files.some(f=>!/^commercial-complete-[a-z-]+\.private\.json$/.test(f.name))||required.some(n=>!manifest.files.some(f=>f.name===n)))throw Error('Root manifest capture set mismatch');
 for(const f of manifest.files){const p=path.join(output,f.name);if(realpathSync(p)!==p||(statSync(p).mode&0o777)!==0o600)throw Error(`Capture privacy/path mismatch: ${f.name}`);const content=readFileSync(p);if(content.length!==f.bytes||sha(content)!==f.sha256)throw Error(`Root capture digest mismatch: ${f.name}`);}
 return {hash,project:manifest.project,files:manifest.files,counts:manifest.counts,verified:true};
}
