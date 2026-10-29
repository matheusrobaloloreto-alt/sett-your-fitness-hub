import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {stopOwnedChildren} from '../scripts/qa/owned-child-cleanup.mjs';
class Child extends EventEmitter {
 pid=12345;exitCode:number|null=null;signalCode:string|null=null;signals:string[]=[];
 behavior:'term'|'kill'|'never'|'done';
 constructor(behavior:'term'|'kill'|'never'|'done'='term'){super();this.behavior=behavior;if(behavior==='done')this.exitCode=0;}
 kill(signal:string){this.signals.push(signal);if(this.behavior==='term'||(this.behavior==='kill'&&signal==='SIGKILL'))queueMicrotask(()=>{this.signalCode=signal;this.emit('exit',null,signal);});return true;}
}
test('exited child is preserved without sending signals',async()=>{const child=new Child('done');const result=await stopOwnedChildren([child],10);assert.equal(result[0].stopped,true);assert.deepEqual(child.signals,[]);});
test('waits for graceful exit of the exact provided child',async()=>{const child=new Child();const unrelated=new Child();const result=await stopOwnedChildren([child],10);assert.equal(result[0].stopped,true);assert.deepEqual(child.signals,['SIGTERM']);assert.deepEqual(unrelated.signals,[]);});
test('escalates only its own unresponsive child and confirms exit',async()=>{const child=new Child('kill');const result=await stopOwnedChildren([child],10);assert.equal(result[0].stopped,true);assert.equal(result[0].escalated,true);assert.deepEqual(child.signals,['SIGTERM','SIGKILL']);});
test('unconfirmed termination is reported false within the bounded wait',async()=>{const child=new Child('never');const result=await stopOwnedChildren([child],10);assert.equal(result[0].stopped,false);assert.equal(result[0].escalated,true);});
