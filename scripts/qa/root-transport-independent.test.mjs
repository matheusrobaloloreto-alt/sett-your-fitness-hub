import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {summarizeTransport} from './complete-runtime-transport-diagnostics.mjs';

// Evaluate only the wrapper against inert doubles; never import its main entry point.
const source=readFileSync(new URL('./complete-runtime-root-rerun.mjs',import.meta.url),'utf8');
assert.equal((source.match(/^await main\(\);$/gm)||[]).length,1);
const wrapper=source.replace(/^import .*;\n/gm,'').replace(/^await main\(\);$/m,'');
function harness(result,{sqlError,diagnosticError}={}){
 const calls=[],writes=[],commands=[];
 class Runtime{
  constructor(){this.name='owned-synthetic';this.dir='private-synthetic';}
  sql(input,options){calls.push({receiver:this,input,options});if(sqlError)throw sqlError;return result;}
  inspect(){if(diagnosticError)throw diagnosticError;return {State:{Running:true,OOMKilled:false,ExitCode:0}};}
 }
 vm.runInNewContext(wrapper,{Runtime,summarizeTransport,
  command:(...args)=>{commands.push(args);return {stdout:'synthetic-secret',stderr:'synthetic-secret'};},
  privateFile:(...args)=>writes.push(args)});
 return {rt:new Runtime(),calls,writes,commands};
}
const ok={status:0,signal:null,timedOut:false,stdout:'synthetic-secret',states:[]};
test('success and deliberate allowError return the original result, with one unchanged SQL input',()=>{
 for(const result of [ok,{...ok,status:2}]){
  const h=harness(result),input='synthetic mutation;';
  const options=result.status===0?{phase:'fixture',custom:17}:{allowError:true,phase:'fixture',custom:17};
  assert.equal(h.rt.sql(input,options),result);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].receiver,h.rt);
  assert.equal(h.calls[0].input,input);
  assert.deepEqual({...h.calls[0].options},{...options,allowError:true});
  assert.equal(h.commands.length,0);assert.equal(h.writes.length,0);
 }
});
test('nonzero/null exit, signal, and timeout retain the original failure gate without SQL replay',()=>{
 for(const delta of [{status:2},{status:null},{signal:'SIGTERM'},{timedOut:true}]){
  const result={...ok,...delta},h=harness(result);
  assert.throws(()=>h.rt.sql('synthetic mutation;',{phase:'fixture'}),e=>{
   const d=JSON.parse(e.message);
   assert.equal(d.status,result.status);assert.equal(d.signal,result.signal);
   assert.equal(d.timedOut,result.timedOut);assert.equal(d.phase,'fixture');
   assert.equal(d.diagnostic.cause,'unattributed');
   assert.equal(e.message.includes('synthetic-secret'),false);return true;
  });
  assert.equal(h.calls.length,1);
  assert.deepEqual([...h.commands[0][0]],['logs','--tail','120','owned-synthetic']);
  assert.equal(h.commands[0][2],10000);
  assert.equal(h.writes.length,3);
  assert.ok(h.writes.every(([dir])=>dir==='private-synthetic'));
 }
});
test('capture failure cannot convert SQL failure into success or retry the mutation',()=>{
 const h=harness({...ok,status:2},{diagnosticError:new Error('synthetic-secret')});
 assert.throws(()=>h.rt.sql('synthetic mutation;'),e=>{
  const d=JSON.parse(e.message);
  assert.equal(d.status,2);assert.equal(d.phase,'sql');
  assert.deepEqual(d.diagnostic,{captureUnavailable:true,cause:'unattributed'});
  assert.equal(e.message.includes('synthetic-secret'),false);return true;
 });
 assert.equal(h.calls.length,1);assert.equal(h.commands.length,0);
});
test('original ownership/SQL exceptions propagate unchanged before diagnostic collection',()=>{
 const sqlError=new Error('original failure'),h=harness(null,{sqlError});
 assert.throws(()=>h.rt.sql('synthetic input'),e=>e===sqlError);
 assert.equal(h.calls.length,1);assert.equal(h.commands.length,0);assert.equal(h.writes.length,0);
});
