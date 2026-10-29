import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {api,credentials} from './self-service-api.mjs';
import {sql,repo,output,localEnv,privateFile} from './self-service-local.mjs';
import {captureData} from '../../qa/self-service-dispatch-snapshot.mjs';
import {assertDispatchIdle} from '../../qa/assert-dispatch-idle.mjs';

const pause=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
async function rest(endpoint,options={}){const r=await api(`/rest/v1/${endpoint}`,{admin:true,...options});assert.equal(r.ok,true,`local REST ${endpoint.split('?')[0]} HTTP${r.status} code=${r.data?.code||''}`);return r.data;}

test('actual dispatcher process death across durable claim/provider/ACK boundaries',{timeout:240000},async t=>{
  assert.equal(sql("select to_regprocedure('public.begin_automation_dispatch(text,uuid,uuid,text)') is not null;"),'t','Root must apply local recovery migration first');
  assert.equal(sql("select to_regprocedure('public.service_company_feature_allowed(uuid,text)') is not null;"),'t','Root must apply local entitlement migration first');
  assertDispatchIdle();
  const company=randomUUID(),instance=randomUUID();
  const keys=credentials(),secret=randomBytes(32).toString('hex');
  await rest('companies',{method:'POST',body:{id:company,name:'Synthetic process-kill QA',slug:`kill-${company}`}});
  await rest('whatsapp_instances',{method:'POST',body:{id:instance,company_id:company,instance_name:`kill-${company}`,status:'connected'}});
  const baseline=captureData(undefined,{company});
  const children=new Set(),exits=new Set(),forwards=new Set(),sessions=[],calls=[];
  const evidence={stage:'running',boundary:'actual native Deno -> forwarding HTTP proxy -> actual local SDK/Auth/REST/PostgreSQL; loopback provider only',cases:[]};
  let mode='',hit=pause();
  const proxy=createServer((req,res)=>{
    const work=(async()=>{
    try{
      let raw='';for await(const c of req)raw+=c;
      const response=await fetch(`http://127.0.0.1:57421${req.url}`,{method:req.method,headers:{...req.headers,host:'127.0.0.1:57421'},body:['GET','HEAD'].includes(req.method)?undefined:raw,signal:AbortSignal.timeout(25000)});
      const body=await response.text();
      const match=(mode==='claim'&&req.url==='/rest/v1/rpc/claim_automation_sessions')||(mode==='ack'&&req.url==='/rest/v1/rpc/ack_automation_dispatch');
      if(match){assert.equal(response.ok,true,'pause only after successful real DB commit');hit.resolve();return;}
      res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json'});res.end(body);
    }catch{if(!res.destroyed){res.writeHead(502);res.end('{}');}}
    })();forwards.add(work);void work.finally(()=>forwards.delete(work));
  });
  const provider=createServer(async(req,res)=>{
    let body='';for await(const c of req)body+=c;
    const parsed=JSON.parse(body);
    assert.equal(req.url,`/message/sendText/kill-${company}`);
    assert.ok(parsed.text.startsWith('Synthetic kill '),'Unexpected provider content');
    calls.push(parsed);
    if(mode==='provider'){hit.resolve();return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({key:{id:`synthetic-${randomUUID()}`}}));
  });
  const proxyPort=await listen(proxy),providerPort=await listen(provider);
  async function start(){
    assertDispatchIdle(company);
    const reservation=createServer();const port=await listen(reservation);await new Promise(r=>reservation.close(r));
    const envFile=privateFile(`kill-${company}.env.local`,[`SUPABASE_URL=http://127.0.0.1:${proxyPort}`,`SUPABASE_SERVICE_ROLE_KEY=${keys.SERVICE_ROLE_KEY}`,`AUTOMATION_CRON_SECRET=${secret}`,`EVOLUTION_API_URL=http://127.0.0.1:${providerPort}`,'EVOLUTION_API_KEY=synthetic-only'].join('\n'));
    const child=spawn('deno',['run','--no-config','--no-lock','--cached-only','--no-prompt','--node-modules-dir=none','--allow-env',`--allow-net=127.0.0.1:${proxyPort},127.0.0.1:${providerPort},127.0.0.1:${port}`,`--env-file=${envFile}`,'qa/automation-recovery-process-runner.ts',String(port)],{cwd:repo,env:{...localEnv,DENO_DIR:path.join(output,'deno-cache')},stdio:['ignore','pipe','pipe']});
    children.add(child);let logs='';const ready=pause();
    child.stdout.on('data',c=>{logs+=c;if(logs.includes('recovery-ready'))ready.resolve();});child.stderr.on('data',c=>{logs+=c;});
    const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{children.delete(child);privateFile(`kill-${company}-${child.pid}.private.log`,logs);resolve(code);});});
    exits.add(exited);void exited.finally(()=>exits.delete(exited));
    await Promise.race([ready.promise,exited.then(()=>{throw new Error('Child exited before ready');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Child startup timeout')),15000))]);
    const request=fetch(`http://127.0.0.1:${port}`,{method:'POST',headers:{'x-cron-secret':secret},signal:AbortSignal.timeout(45000)}).then(async r=>({status:r.status,data:await r.json()}),()=>null);
    return {child,exited,request};
  }
  async function terminate(run){run.child.kill('SIGKILL');await run.exited;await run.request;proxy.closeAllConnections();provider.closeAllConnections();}
  async function dispatch(){mode='';const run=await start();const r=await run.request;assert.equal(await run.exited,0);assert.equal(r?.status,200);assert.equal(r.data.intercycle.failed,0);return r.data;}
  async function fixture(){
    const ids=Object.fromEntries(['student','chat','flow','node','session'].map(k=>[k,randomUUID()]));
    const phone=`55489${String(Math.floor(Math.random()*1e8)).padStart(8,'0')}`;
    await rest('students',{method:'POST',body:{id:ids.student,company_id:company,full_name:'Synthetic kill student',phone:`+${phone}`,country_code:'BR'}});
    await rest('whatsapp_chats',{method:'POST',body:{id:ids.chat,company_id:company,instance_id:instance,student_id:ids.student,remote_jid:`${phone}@s.whatsapp.net`}});
    await rest('automation_flows',{method:'POST',body:{id:ids.flow,company_id:company,name:'Synthetic kill flow',trigger_type:'manual',is_active:true}});
    await rest('automation_flow_nodes',{method:'POST',body:{id:ids.node,flow_id:ids.flow,node_type:'content',data:{message:`Synthetic kill ${ids.session}`}}});
    await rest('flow_sessions',{method:'POST',body:{id:ids.session,flow_id:ids.flow,chat_id:ids.chat,current_node_id:ids.node,status:'active',context:{student_id:ids.student,trigger_type:'manual'}}});
    sessions.push(ids.session);return ids;
  }
  const row=async id=>(await rest(`flow_sessions?id=eq.${id}&select=*`))[0];
  try{
    for(const boundary of ['claim','provider','ack']){
      let passed=false;
      await t.test(`SIGKILL after ${boundary}; new process cannot blindly duplicate`,async()=>{
      const ids=await fixture(),before=calls.length;mode=boundary;hit=pause();
      const run=await start();await Promise.race([hit.promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`Boundary ${boundary} timeout`)),40000))]);
      const interrupted=await row(ids.session);assert.equal(interrupted.status,'processing');
      await terminate(run);
      await rest(`flow_sessions?id=eq.${ids.session}`,{method:'PATCH',body:{dispatch_lease_until:new Date(Date.now()-1000).toISOString()}});
      const result=await dispatch(),after=await row(ids.session);
      assert.equal(calls.length,before+1,'Exactly one loopback provider acceptance across interruption/recovery');
      if(boundary==='provider'){
        assert.equal(after.status,'failed');assert.equal(after.context.dispatch_error,'dispatch_uncertain');assert.equal(result.claimed,0);
      }else{
        assert.equal(after.status,'completed');assert.equal(result.completed,1);assert.notEqual(after.dispatch_lease_token,interrupted.dispatch_lease_token);
      }
      await dispatch();assert.equal(calls.length,before+1,'Repeated scan must not resend');
      evidence.cases.push({boundary,killedPid:run.child.pid,status:after.status,providerAcceptances:1});
      passed=true;
    });
      assert.ok(passed,'Stop after failed child test');
    }
    evidence.stage='passed';
  }finally{
    for(const child of children)child.kill('SIGKILL');
    await Promise.allSettled([...exits]);
    await Promise.allSettled([...forwards]);
    proxy.closeAllConnections();provider.closeAllConnections();await new Promise(r=>proxy.close(r));await new Promise(r=>provider.close(r));
    await rest(`automation_flows?company_id=eq.${company}`,{method:'PATCH',body:{is_active:false}});
    for(const id of sessions){const r=await row(id);if(['active','processing','waiting_response'].includes(r.status))await rest(`flow_sessions?id=eq.${id}`,{method:'PATCH',body:{status:'failed'}});}
    const after=captureData(baseline.spec,{company});
    privateFile(`kill-${company}-before.private.json`,JSON.stringify(baseline));privateFile(`kill-${company}-after.private.json`,JSON.stringify(after));
    assert.deepEqual(after.rows,baseline.rows,'Foreign/preexisting data must be unchanged');
    evidence.foreignDataUnchanged=true;privateFile('recovery-process-kill-evidence.private.json',JSON.stringify(evidence,null,2));
  }
});
