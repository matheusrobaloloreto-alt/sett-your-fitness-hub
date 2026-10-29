// Explicit opt-in native staging journal/Storage acceptance. Provider transport alone is simulated.
import { test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { dispatchMessageSequence } from '../supabase/functions/_shared/message-sequence';
import type { MessagePart } from '../supabase/functions/_shared/company-product-settings';
const project='ifymocggowdlqqcxugko', upstream=`https://${project}.supabase.co`, provider='https://sequence-provider.invalid';
const fixtureRoot='output/hosted-staging-preflight-20261028/';
const output='output/message-sequences-20261029.private/';
function receipt(name:string,value:unknown){const file=output+name;writeFileSync(file,JSON.stringify(value,null,2));chmodSync(file,0o600);}
test('native journal resumes confirmed parts against frozen settings and fences uncertain/concurrent dispatch',async()=>{
 if(process.env.SETT_NATIVE_SEQUENCE_TEST!=='owned-staging-only')throw Error('Explicit native staging opt-in required');
 const runId=randomUUID(), candidateHashes=Object.fromEntries(['supabase/functions/_shared/message-sequence.ts','supabase/migrations/20261029122806_company_whatsapp_message_sequences.sql'].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
 receipt('runtime-acceptance.private.json',{runId,candidateHashes,passed:false,status:'running',project});
 const own=JSON.parse(readFileSync(fixtureRoot+'fixture-identities.private.json','utf8'));
 expect(own.projectRef).toBe(project);expect(own.run).toBe('20261028-c9ede238');
 const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}));
 const key=keys.find((v:{name:string})=>v.name==='service_role')?.api_key;expect(typeof key).toBe('string');
 const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());expect(claims.ref).toBe(project);expect(claims.role).toBe('service_role');
 const nativeFetch=globalThis.fetch,posts:Array<{endpoint:string,body:Record<string,unknown>}>=[];let mode:'ok'|'timeout'='ok';let hold:Promise<void>|null=null;let reached:(()=>void)|null=null;
 const transport:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.toString():input.url);
  if(url.origin===provider){
   posts.push({endpoint:url.pathname,body:JSON.parse(String(init?.body))});if(hold){reached?.();await hold;}
   if(mode==='timeout')throw Error('synthetic provider transport ambiguity');
   return Response.json({key:{id:'SYNTHETIC-NATIVE-JOURNAL-'+posts.length}});
  }
  if(![upstream,`https://${project}.storage.supabase.co`].includes(url.origin))throw Error('Unexpected native test destination');
  return nativeFetch(input,init);
 };
 const admin=createClient(upstream,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const mediaManifest=JSON.parse(readFileSync(output+'fixture-manifest.private.json','utf8'));expect(mediaManifest.projectRef).toBe(project);expect(mediaManifest.ownedCompany).toBe(own.companyA);expect(typeof mediaManifest.runId).toBe('string');
 const chatId=randomUUID();const inserted=await admin.from('whatsapp_chats').insert({id:chatId,company_id:own.companyA,remote_jid:'14155550198@s.whatsapp.net',contact_name:'Synthetic sequence runtime QA'});expect(inserted.error).toBeNull();
 receipt('runtime-fixture.private.json',{project,companyId:own.companyA,chatId,providerRealCalls:0});
 const kinds=[['image','.png','image/png'],['audio','.mp3','audio/mpeg'],['video','.mp4','video/mp4']] as const;
 const parts:MessagePart[]=[{id:'text',type:'text',text:'Frozen original'}];
 for(const [type,suffix,mimeType] of kinds){const path=mediaManifest.files.find((p:string)=>p.endsWith(suffix));expect(typeof path).toBe('string');parts.push({id:type,type,text:'',media:{bucket:'whatsapp-media',path,mimeType,fileName:type==='image'?'fixture.png':type==='audio'?'qa-audio.mp3':'qa-video.mp4'}});}
 let checks=0;let failAt=3;
 const args={admin,companyId:own.companyA,chatId,occurrence:'native-'+randomUUID(),parts,recipient:'14155550198@s.whatsapp.net',instanceName:'synthetic-never-contact-provider',evoUrl:provider,evoKey:'SYNTHETIC-NO-PROVIDER-CREDENTIAL',beforeSend:async()=>{checks++;if(checks===failAt)throw Error('synthetic failure before next claim');}};
 globalThis.fetch=transport;
 try{
  await expect(dispatchMessageSequence(args)).rejects.toThrow('synthetic failure before next claim');expect(posts).toHaveLength(1);
  args.parts=[{id:'changed',type:'text',text:'Must never replace frozen original'}];failAt=Infinity;
  await dispatchMessageSequence(args);expect(posts).toHaveLength(4);
  expect(posts.map(x=>x.body.mediatype??'text')).toEqual(['text','image','audio','video']);
  await dispatchMessageSequence(args);expect(posts).toHaveLength(4);
  const ambiguous={...args,occurrence:'native-ambiguous-'+randomUUID(),parts:[{id:'one',type:'text' as const,text:'Ambiguous controlled fixture'}]};mode='timeout';
  await expect(dispatchMessageSequence(ambiguous)).rejects.toThrow('dispatch_uncertain');expect(posts).toHaveLength(5);
  mode='ok';await expect(dispatchMessageSequence(ambiguous)).rejects.toThrow('dispatch_uncertain');expect(posts).toHaveLength(5);
  const parallel={...args,occurrence:'native-concurrent-'+randomUUID(),parts:[{id:'one',type:'text' as const,text:'Concurrent controlled fixture'}]};
  let release!:()=>void;hold=new Promise<void>(resolve=>{release=resolve});const hit=new Promise<void>(resolve=>{reached=resolve});
  const first=dispatchMessageSequence(parallel);const firstResult=first.then(()=>({ok:true}),()=>({ok:false}));
  try { await Promise.race([hit,new Promise((_,reject)=>setTimeout(()=>reject(Error('Concurrent provider barrier not reached')),20000))]);await expect(dispatchMessageSequence(parallel)).rejects.toThrow('dispatch_uncertain'); }
  finally {release();hold=null;reached=null;}
  expect((await firstResult).ok).toBe(true);expect(posts).toHaveLength(6);
  const rows=await admin.from('company_message_sequences').select('id,snapshot').eq('company_id',own.companyA).eq('chat_id',chatId);expect(rows.error).toBeNull();expect(rows.data).toHaveLength(3);
  receipt('runtime-acceptance.private.json',{runId,candidateHashes,mediaRunId:mediaManifest.runId,project,passed:true,status:'passed',nativeJournal:true,nativeStorage:true,simulatedProviderPosts:posts.length,realProviderCalls:0,productionWrites:0,tests:['partial_resume','all_three_media','frozen_snapshot','acked_replay','ambiguous_stop','concurrent_single_send'],sequenceIds:rows.data?.map(x=>x.id)});
 }catch(error){receipt('runtime-acceptance.private.json',{runId,candidateHashes,project,passed:false,status:'failed',error:error instanceof Error?error.message:'Native runtime failure'});throw error;}finally{globalThis.fetch=nativeFetch;}
},180000);
