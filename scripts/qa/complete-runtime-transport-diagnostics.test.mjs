import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTransport} from './complete-runtime-transport-diagnostics.mjs';

test('exit two without SQLSTATE remains an unattributed connection failure',()=>{
 const d=summarizeTransport({result:{status:2,signal:null,timedOut:false,states:[],stdout:''},state:{Running:true,OOMKilled:false,ExitCode:0},logs:'database system is ready to accept connections'});
 assert.equal(d.client.status,2);assert.equal(d.client.timedOut,false);
 assert.equal(d.server.running,true);assert.equal(d.server.readyMessage,true);
 assert.equal(d.connectionClosedMessage,false);assert.equal(d.cause,'unattributed');
});
test('only safe facts leave private diagnostics; no raw content or inferred cause',()=>{
 const secret='synthetic-local-secret-must-not-print';
 const d=summarizeTransport({result:{status:2,signal:null,timedOut:false,states:[],stdout:secret+' server closed the connection unexpectedly'},state:{Running:false,OOMKilled:false,ExitCode:1,Error:secret},logs:secret});
 assert.equal(d.connectionClosedMessage,true);assert.equal(d.server.running,false);
 assert.equal(d.cause,'unattributed');assert.equal(JSON.stringify(d).includes(secret),false);
});
test('transport timeout and server OOM are distinct observed facts',()=>{
 const d=summarizeTransport({result:{status:null,signal:'SIGTERM',timedOut:true,states:[],stdout:''},state:{Running:false,OOMKilled:true,ExitCode:137},logs:''});
 assert.equal(d.client.timedOut,true);assert.equal(d.server.oomKilled,true);
 assert.equal(d.cause,'unattributed');
});
