// Local readiness only. No debugger, core access, role switch, DO, fixture or remote SQL.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const image = 'sha256:21ab971149317ea9cd12a8126fe4ebb34def08c8972956b0958cba0924409dab';
const ownerKey = 'sett.pg-diagnosis-20261027';
export function assertOwned(name, token, inspection) {
  if (!/^sett-pg-diag-20261027-[a-f0-9]{12}$/.test(name) || !/^[a-f0-9]{12}$/.test(token)) throw Error('Invalid disposable identity');
  if (inspection.Name !== `/${name}` || inspection.Config?.Labels?.[ownerKey] !== token || inspection.Image !== image ||
      inspection.HostConfig?.NetworkMode !== 'none' || (inspection.HostConfig?.Binds?.length ?? 0) !== 0 ||
      (inspection.Mounts ?? []).some(m => m.Type !== 'tmpfs') ||
      Object.keys(inspection.HostConfig?.PortBindings ?? {}).length !== 0) throw Error('Disposable isolation/ownership mismatch');
}
export const readinessCases = [['',''],['supautils',''],['supautils','anon,authenticated,service_role']];
export function validateSettings(row, preload, hints, expectedSource) {
  const expected = {server_version_num:'170006',session_preload_libraries:preload,hint_roles:hints,
    statement_timeout:'3s',lock_timeout:'1s',plan_cache_mode:'force_generic_plan',jit:'on',listen_addresses:'',max_connections:'8'};
  for (const [k,v] of Object.entries(expected)) if(row?.[k] !== v) throw Error(`Effective setting mismatch: ${k}`);
  if(row?.current_user !== 'postgres' || row?.database !== 'postgres' || row?.in_recovery !== false) throw Error('SQL readiness mismatch');
  if(expectedSource && preload && (row.hint_registered!==true || row.hint_metadata?.setting!==hints || row.hint_metadata?.context!=='sighup' || row.hint_metadata?.source!==expectedSource || row.hint_metadata?.pending_restart!==false))throw Error('Hint registration/context/source mismatch');
  if(expectedSource && !preload && (row.hint_registered!==false || row.hint_metadata!==null))throw Error('Unexpected baseline extension registration');
  return row;
}
export function classify(result, logs = '') {
  return {clientTimeout:result.timedOut,clientSignal:result.signal,clientExit:result.code,
    backendSigsegv:/terminated by signal 11|Segmentation fault/.test(logs),
    backendSigkill:/terminated by signal 9/.test(logs),
    backendPanic:/PANIC:/.test(logs)};
}
export async function command(args, input, timeout=15000, executable='docker') {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,executable==='docker'?['--context','colima',...args]:args,
      {env:{PATH:process.env.PATH,HOME:process.env.HOME,DO_NOT_TRACK:'1'},stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',timedOut=false,overflow=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    const collect=key=>part=>{if((stdout.length+stderr.length+part.length)>262144){overflow=true;child.kill('SIGKILL');return;} if(key==='out')stdout+=part;else stderr+=part;};
    child.stdout.on('data',collect('out')); child.stderr.on('data',collect('err'));
    child.stdin.on('error',()=>{});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut,overflow,stdout,stderr});});
    child.stdin.end(input);
  });
}
export function launchArgs(name,token,serverConfig=null) {
  if(!/^sett-pg-diag-20261027-[a-f0-9]{12}$/.test(name)|| !/^[a-f0-9]{12}$/.test(token)) throw Error('Invalid launch identity');
  if(serverConfig && !readinessCases.some(([p,h])=>p===serverConfig.preload&&h===serverConfig.hints))throw Error('Unsupported server configuration');
  const serverOptions=serverConfig?.preload?` -c session_preload_libraries=supautils -c supautils.hint_roles=${serverConfig.hints}`:'';
  return ['run','-d','--pull','never','--name',name,'--label',`${ownerKey}=${token}`,'--network','none',
    '--memory','512m','--cpus','1','--pids-limit','64','--ulimit','core=0','--user','100:101',
    '--tmpfs','/diag:rw,nosuid,nodev,uid=100,gid=101,mode=0700,size=192m','--entrypoint','/bin/sh',image,'-ec',
    'initdb -D /diag/data -A trust --no-locale >/diag/init.log 2>&1; exec postgres -D /diag/data -k /diag -c listen_addresses= -c max_connections=8 -c shared_buffers=32MB'+serverOptions];
}
async function runConfiguration({serverConfig=null,postLoadHints=false}={}){
  const token=randomUUID().replaceAll('-','').slice(0,12),name=`sett-pg-diag-20261027-${token}`;
  const repo=fileURLToPath(new URL('../../',import.meta.url));
  const dir=path.join(repo,'output',`postgres-diagnosis-20261027-${token}`);
  mkdirSync(dir,{mode:0o700});
  const evidence={scope:'isolated-readiness-only',hintAssignment:serverConfig?'server-startup':postLoadHints?'after-session-preload':'startup-options',serverConfig,image,createdAt:new Date().toISOString(),cases:[],cleanup:false};
  let attempted=false;
  const inspected=async()=>{
    const r=await command(['inspect',name]);
    if(r.code!==0||r.timedOut||r.overflow)throw Error('Owned inspection unavailable');
    const obj=JSON.parse(r.stdout)[0]; assertOwned(name,token,obj);return obj;
  };
  try{
    attempted=true;
    const start=await command(launchArgs(name,token,serverConfig));
    if(start.code!==0||start.timedOut||start.overflow)throw Error('Disposable startup failed');
    const state=await inspected(); evidence.isolation={network:state.HostConfig.NetworkMode,binds:state.HostConfig.Binds?.length??0,ports:Object.keys(state.HostConfig.PortBindings??{}).length};
    let ready=false;
    for(let n=0;n<30;n++){
      await inspected();
      const r=await command(['exec',name,'pg_isready','-h','/diag','-U','postgres','-d','postgres'],undefined,3000);
      if(r.code===0&&!r.timedOut){ready=true;break;}
      await new Promise(r=>setTimeout(r,300));
    }
    if(!ready)throw Error('Readiness deadline exceeded');
    for(const [preload,hints] of (serverConfig?[[serverConfig.preload,serverConfig.hints]]:readinessCases)){
      await inspected();
      const options=`-c statement_timeout=3000 -c lock_timeout=1000 -c plan_cache_mode=force_generic_plan -c jit=on${preload&&!serverConfig?` -c session_preload_libraries=${preload} -c supautils.hint_roles=${hints}`:''}`;
      const sql=(postLoadHints&&hints?"set supautils.hint_roles = 'anon,authenticated,service_role';\n":'')+`select json_build_object('server_version_num',current_setting('server_version_num'),'current_user',current_user,'database',current_database(),'in_recovery',pg_is_in_recovery(),'session_preload_libraries',current_setting('session_preload_libraries'),'hint_roles',coalesce(current_setting('supautils.hint_roles',true),''),'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout'),'plan_cache_mode',current_setting('plan_cache_mode'),'jit',current_setting('jit'),'listen_addresses',current_setting('listen_addresses'),'max_connections',current_setting('max_connections'),'hint_registered',exists(select 1 from pg_settings where name='supautils.hint_roles'),'hint_metadata',(select json_build_object('setting',setting,'context',context,'source',source,'boot_val',boot_val,'reset_val',reset_val,'pending_restart',pending_restart) from pg_settings where name='supautils.hint_roles'));`;
      const r=await command(['exec','-i','-e',`PGOPTIONS=${options}`,name,'psql','-X','-qAt','-h','/diag','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],sql,7000);
      const log=await command(['logs','--tail','120',name]);
      if(log.code!==0||log.timedOut||log.overflow)throw Error('Bounded backend evidence unavailable');
      const outcome=classify(r,log.stdout+log.stderr);
      if(r.code!==0||r.timedOut||r.overflow||outcome.backendSigsegv||outcome.backendSigkill||outcome.backendPanic){
        evidence.cases.push({requested:{preload,hints},verified:false,outcome,sqlstates:[...r.stderr.matchAll(/(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5})\b/g)].map(m=>m[1])});
        throw Error('Readiness query failed; no crash attribution inferred');
      }
      const lines=r.stdout.trim().split('\n');
      if(lines.length!==1)throw Error('Expected one machine-readable settings row');
      const settings=JSON.parse(lines[0]);
      const row={requested:{preload,hints},settings,outcome,verified:false};
      evidence.cases.push(row);
      validateSettings(settings,preload,hints,serverConfig?'command line':'default');
      row.verified=true;
    }
  }catch(e){evidence.error=e.message;process.exitCode=1;}
  finally{
    if(attempted){
      try{
        await inspected();
        const removed=await command(['rm','-f',name]);
        if(removed.code!==0||removed.timedOut)throw Error('Disposable cleanup failed');
        const absent=await command(['container','ls','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']);
        evidence.cleanup=absent.code===0&&!absent.timedOut&&absent.stdout.trim()==='';
        if(!evidence.cleanup)throw Error('Cleanup read-back failed');
      }catch(e){evidence.cleanupError=e.message;process.exitCode=1;}
    }
    writeFileSync(path.join(dir,'readiness.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({directory:dir,...evidence}));
  }
}
async function main(){
  if(process.argv[2]==='--server-startup-hints' && process.argv.length===3){
    for(const [preload,hints] of readinessCases){
      await runConfiguration({serverConfig:{preload,hints}});
      if(process.exitCode)break;
    }
    return;
  }
  if(process.argv[2]!=='--readiness-only')throw Error('Only benign readiness modes are supported');
  if(process.argv.slice(3).some(x=>x!=='--post-load-hints') || process.argv.length>4)throw Error('Unsupported readiness option');
  await runConfiguration({postLoadHints:process.argv[3]==='--post-load-hints'});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
