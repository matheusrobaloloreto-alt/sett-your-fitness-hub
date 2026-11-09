import { dispatchMessageSequence, messageMediaSignatureMatches } from './message-sequence.ts';
import { normalizeCompanyProductSettings, validateMessageSequences, WHATSAPP_EVENTS, validateRenderedMessageParts, type MessagePart } from './company-product-settings.ts';
import { eventMessageSequence } from './communication-policy.ts';
function assert(value: unknown, message = 'assertion failed') { if (!value) throw new Error(message); }
async function rejects(fn: () => unknown, code = '') { try { await fn(); } catch (e) { assert(!code || (e instanceof Error && e.message.includes(code)), String(e)); return; } throw new Error('expected rejection'); }
const company = '11111111-1111-1111-1111-111111111111';
const media = { bucket:'whatsapp-media', path:`${company}/message-settings/22222222-2222-2222-2222-222222222222.png`, mimeType:'image/png', fileName:'image.png' };
Deno.test('contract: ten events/max10, strict shapes, empty media caption and legacy absence', async()=>{
 const baseline = normalizeCompanyProductSettings({}); assert(!('message_sequences' in baseline));
 for(const event of WHATSAPP_EVENTS) {
  const parts = Array.from({length:10},(_,i)=>({id:'p'+i,type:'text',text:'{{nome}}'}));
  assert(validateMessageSequences({[event]:parts})[event]?.length===10);
  await rejects(()=>validateMessageSequences({[event]:[...parts,{id:'extra',type:'text',text:'x'}]}));
 }
 for (const parts of [[],null,[{id:'a',type:'text',text:' '}],[{id:'a',type:'text',text:'{{link}}'}],[{id:'a',type:'image',text:''}],[{id:'a',type:'text',text:'x',media}],[{id:'a',type:'audio',text:'',media}],[{id:'a',type:'text',text:'x',extra:true}]]) await rejects(()=>validateMessageSequences({weekly_contact:parts}));
 await rejects(()=>validateMessageSequences({new_workout_push_body:[{id:'a',type:'text',text:'x'}]}));
 assert(validateMessageSequences({weekly_contact:[{id:'a',type:'image',text:'',media}]}).weekly_contact?.[0].text==='');
 assert(eventMessageSequence(baseline,'weekly_contact',{primeiro_nome:'Ana'},'fallback')[0].text.includes('Ana'));
});

function fixture(parts: MessagePart[]) {
 let saved: any; const posts: any[]=[]; let before=0; let failBefore=Infinity; let ackFailure=false; let providerMode='ok'; let projectionFailure=false;
 const states: string[]=[]; const receipts: string[]=[];
 const admin:any={
  rpc:async(name:string,args:any)=>{
   if(name==='service_company_feature_allowed') return {data:true,error:null};
   if(name==='snapshot_company_message_sequence') {
    if(!saved){saved=structuredClone(args._snapshot); states.push(...saved.parts.map(()=> 'pending'));}
    return {data:{id:'snapshot',snapshot:structuredClone(saved),states:[...states]},error:null};
   }
   if(name==='claim_company_message_part') {
    const i=args._index;
    if(states[i]==='acked') return {data:{state:'acked'},error:null};
    if(states[i]!=='pending'||states.slice(0,i).some(x=>x!=='acked')) return {data:null,error:{message:'dispatch_uncertain'}};
    states[i]='in_flight';return {data:{state:'in_flight',token:'token'+i},error:null};
   }
   if(name==='authorize_company_message_part') return {data:null,error:null};
   if(name==='ack_company_message_part') {if(ackFailure)return {data:null,error:{message:'lost'}};states[args._index]='acked';receipts.push(args._receipt);return {data:null,error:null};}
   throw Error('unexpected RPC '+name);
  },
  from:(table:string)=>{
   if(table==='companies')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:company,has_whatsapp:true},error:null})})})};
   if(table==='company_commercial_settings')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})};
   if(table==='whatsapp_messages')return {insert:async()=>{if(projectionFailure)throw Error('projection'); return {error:null}}};
   throw Error('unexpected table '+table);
  },
  storage:{getBucket:async()=>({data:{public:false},error:null}),from:()=>({list:async()=>({data:[{name:media.path.split('/').pop(),metadata:{mimetype:'image/png',size:8}}],error:null}),download:async()=>({data:new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]),error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://synthetic.invalid/private'},error:null})})},
 };
 const args={admin,companyId:company,chatId:'chat',occurrence:'stable-request',parts,recipient:'5548999999999@s.whatsapp.net',instanceName:'instance',evoUrl:'https://synthetic.invalid',evoKey:'fake',beforeSend:async()=>{before++;if(before===failBefore)throw Error('revoked');}};
 const fetcher=async (_url:unknown,init:any)=>{posts.push(JSON.parse(init.body));if(providerMode==='timeout')throw Error('timeout');if(providerMode==='503')return new Response('',{status:503});return Response.json(providerMode==='missing'?{}:{key:{id:'receipt'+posts.length}});};
 return {args,posts,states,receipts,fetcher,setFailBefore:(n:number)=>failBefore=n,setAckFailure:()=>ackFailure=true,setProviderMode:(m:string)=>providerMode=m,setProjectionFailure:()=>projectionFailure=true};
}
async function runFixture(f:ReturnType<typeof fixture>,run:()=>Promise<void>){ const original=globalThis.fetch;globalThis.fetch=f.fetcher as typeof fetch;try{await run();}finally{globalThis.fetch=original;}}
Deno.test('ordered media only + text; projection failure does not resend ACK',async()=>{
 const f=fixture([{id:'a',type:'image',text:'',media},{id:'b',type:'text',text:'second'}]);f.setProjectionFailure();
 await runFixture(f,async()=>{await dispatchMessageSequence(f.args);await dispatchMessageSequence(f.args);});
 assert(f.posts.length===2);assert(f.posts[0].mediatype==='image');assert(f.posts[1].text==='second');assert(f.states.every(x=>x==='acked'));
});
Deno.test('resume pending part after pre-send failure uses snapshot even when settings edited',async()=>{
 const f=fixture([{id:'a',type:'text',text:'original1'},{id:'b',type:'text',text:'original2'}]);f.setFailBefore(3);
 await runFixture(f,async()=>{
  await rejects(()=>dispatchMessageSequence(f.args),'revoked'); assert(f.posts.length===1 && f.states[0]==='acked' && f.states[1]==='pending');
  f.args.parts=[{id:'new',type:'text',text:'edited'}]; await dispatchMessageSequence(f.args);
 });assert(f.posts.length===2 && f.posts[1].text==='original2');
});
for(const mode of ['timeout','503','missing','ack-failure'])Deno.test('ambiguous '+mode+' pauses and never repeats provider',async()=>{
 const f=fixture([{id:'a',type:'text',text:'first'},{id:'b',type:'text',text:'second'}]);if(mode==='ack-failure')f.setAckFailure();else f.setProviderMode(mode);
 await runFixture(f,async()=>{await rejects(()=>dispatchMessageSequence(f.args),'dispatch_uncertain');await rejects(()=>dispatchMessageSequence(f.args),'dispatch_uncertain');});
 assert(f.posts.length===1 && f.states[0]==='in_flight' && f.states[1]==='pending');
});
Deno.test('private ref, MIME and byte signature validation rejects obvious mismatches',()=>{
 assert(messageMediaSignatureMatches(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'));
 assert(!messageMediaSignatureMatches(new TextEncoder().encode('<svg>fake</svg>'),'image/png'));
});

Deno.test('rendered manual output preserves literal braces while templates remain strict; type arrays rejected', async()=>{
 const literal = [{id:'a',type:'text',text:'Olá {Ana}, https://example.test/{id}?q={{raw}}'}];
 assert(validateRenderedMessageParts(literal)[0].text===literal[0].text);
 await rejects(()=>validateMessageSequences({first_contact:literal}));
 for(const type of [['text'],['image'],{},true,1,null]) await rejects(()=>validateRenderedMessageParts([{id:'a',type,text:'x'}]));
});

Deno.test('audio caption/signature has independent ordered receipt after media and replay skips both',async()=>{
 const audio={bucket:'whatsapp-media',path:`${company}/message-settings/22222222-2222-2222-2222-222222222222.ogg`,mimeType:'audio/ogg',fileName:'audio.ogg'};
 const f=fixture([{id:'audio',type:'audio',text:'*Operator*\nCaption',media:audio}]);
 f.args.admin.storage={getBucket:async()=>({data:{public:false},error:null}),from:()=>({list:async()=>({data:[{name:audio.path.split('/').pop(),metadata:{mimetype:'audio/ogg',size:4}}],error:null}),download:async()=>({data:new Blob(['OggS']),error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://synthetic.invalid/private'},error:null})})};
 await runFixture(f,async()=>{await dispatchMessageSequence(f.args);await dispatchMessageSequence(f.args);});
 assert(f.posts.length===2 && f.posts[0].mediatype==='audio' && f.posts[0].caption==='' && f.posts[1].text==='*Operator*\nCaption');
 assert(f.states.length===2 && f.states.every(x=>x==='acked'));
});
Deno.test('missing, foreign and public media fail before part claim and provider I/O',async()=>{
 const missing=fixture([{id:'a',type:'image',text:'',media}]);missing.args.admin.storage.getBucket=async()=>({data:{public:true},error:null});
 await runFixture(missing,async()=>{await rejects(()=>dispatchMessageSequence(missing.args),'sequence_media_not_private');});
 assert(missing.posts.length===0 && missing.states[0]==='pending');
 const foreign=fixture([{id:'a',type:'image',text:'',media:{...media,path:media.path.replace(company,'99999999-9999-9999-9999-999999999999')}}]);
 await runFixture(foreign,async()=>{await rejects(()=>dispatchMessageSequence(foreign.args),'sequence_media_scope_invalid');});
 assert(foreign.posts.length===0 && foreign.states[0]==='pending');
});
Deno.test('access revoked before part claim leaves the part pending for safe retry', async () => {
 const f=fixture([{id:'a',type:'text',text:'first'}]);f.setFailBefore(2);
 await runFixture(f,async()=>{
  await rejects(()=>dispatchMessageSequence(f.args),'revoked');
  assert(f.posts.length===0 && f.states[0]==='pending');
  await dispatchMessageSequence(f.args);
 });
 assert(f.posts.length===1 && f.states[0]==='acked');
});
