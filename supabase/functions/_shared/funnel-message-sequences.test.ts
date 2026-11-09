import { sendFunnelWhatsAppMessage, sendPreRegistrationConfirmation } from './sales-funnel.ts';
function assert(value: unknown, message = 'assertion failed') { if (!value) throw new Error(message); }
const company='11111111-1111-1111-1111-111111111111',jid='12025550123@s.whatsapp.net';
type Row=Record<string,any>;
function fixture(event: string) {
 const secondText=event==='assessment_onboarding'?'Segunda {{primeiro_nome}}. Prazo: {{prazo}} dias úteis, até {{data}}.':'Segunda {{primeiro_nome}}';
 const sequence=[{id:'a',type:'text',text:'Primeira {{nome}}'},{id:'b',type:'text',text:secondText}];
 let settings:Row={message_sequences:{[event]:sequence}};
 let snapshot:Row|null=null;let states:string[]=[];let status:string|null=null;let identityReads=0;let failAt=Infinity;
 const posts:Row[]=[];const writes:Row[]=[];
 const admin={
  rpc:async(name:string,args:Row)=>{
   if(name==='service_company_feature_allowed')return {data:true,error:null};
   if(name==='snapshot_company_message_sequence') {if(!snapshot){snapshot=structuredClone(args._snapshot);states=args._snapshot.parts.map(()=> 'pending');}return {data:{id:'sequence',snapshot,states:[...states]},error:null};}
   if(name==='claim_company_message_part') {const index=args._index;assert(states[index]==='pending','duplicate claim');states[index]='in_flight';return {data:{state:'in_flight',token:'token'},error:null};}
   if(name==='authorize_company_message_part')return {data:null,error:null};
   if(name==='ack_company_message_part'){states[args._index]='acked';return {data:null,error:null};}
   throw Error('unexpected RPC '+name);
  },
  from(table:string) {
   let patch:Row|null=null;let insert:Row|null=null;
   const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,update:(value:Row)=>{patch=value;return q;},insert:(value:Row)=>{insert=value;return q;},
    single:()=>resolve(),maybeSingle:()=>resolve(),then:(fn:any)=>Promise.resolve(resolve()).then(fn)};
   const resolve=():Row=>{
    if(patch){if(['student_funnel_events','lead_funnel_events'].includes(table))status=patch.status;writes.push({table,...patch});return {data:null,error:null};}
    if(insert){writes.push({table,...insert});if(['student_funnel_events','lead_funnel_events'].includes(table)){if(status)return {data:null,error:{code:'23505'}};status='processing';}return {data:null,error:null};}
    const data:Row={
     company_product_settings:{version:1,settings},company_message_sequences:snapshot?{id:'sequence'}:null,
     student_funnel_events:{status},lead_funnel_events:{status},
     whatsapp_instances:{id:'instance',instance_name:'synthetic',status:'connected'},
     whatsapp_chats:{id:'chat',student_id:event==='pre_registration_confirmation'?null:'student',remote_jid:jid,instance_id:'instance'},
     students:{phone:'+1 202 555 0123',country_code:'US'},leads:{phone:'+1 202 555 0123'},
    };
    if(table==='students'||table==='leads'){identityReads++;if(identityReads===failAt)return {data:null,error:{message:'synthetic unavailable'}};}
    assert(Object.hasOwn(data,table),'unknown table '+table);return {data:data[table],error:null};
   };
   return q;
  },
 };
 const args={admin,companyId:company,studentId:'student',leadId:'lead',fullName:'Ana Teste',phone:'+1 202 555 0123',countryCode:'US',text:'Legacy',eventType:'payment_link_sent',eventKey:'event-one',templateValues:{link:'https://example.test/payment'}};
 const invoke=()=>event==='pre_registration_confirmation'?sendPreRegistrationConfirmation(args)
   :event==='assessment_onboarding'?sendFunnelWhatsAppMessage({...args,text:undefined,eventType:'assessment_instructions_sent'})
   :sendFunnelWhatsAppMessage(args);
 return {invoke,posts,writes,states:()=>states,setFailAt:(n:number)=>failAt=n,edit:()=>settings={message_sequences:{[event]:[{id:'new',type:'text',text:'Edited'}]}}};
}
for(const event of ['payment_link','pre_registration_confirmation','assessment_onboarding'])Deno.test('funnel '+event+' snapshot/partial retry and completion after ACK only',async()=>{
 const f=fixture(event);const fetch=globalThis.fetch;const descriptor=Object.getOwnPropertyDescriptor(Deno.env,'get')!;
 try {
  Object.defineProperty(Deno.env,'get',{configurable:true,value:(key:string)=>key==='EVOLUTION_API_URL'?'https://provider.invalid':'synthetic'});
  globalThis.fetch=async(input,init)=>{assert(String(input).startsWith('https://provider.invalid/'),'external network forbidden');f.posts.push(JSON.parse(String(init?.body)));return Response.json({key:{id:'receipt'+f.posts.length}});};
  f.setFailAt(3);assert((await f.invoke()).sent===false,'pre-second failure must not complete event');
  assert(f.posts.length===1 && f.states()[0]==='acked' && f.states()[1]==='pending','first receipt not retained');
  f.edit();assert((await f.invoke()).sent,'retry failed');assert(f.posts.length===2,'ACK repeated');
  const expected=event==='assessment_onboarding'?'Segunda Ana. Prazo: 5 dias úteis, até a data definida a partir do recebimento do material.':'Segunda Ana';
  assert(f.posts[1].text===expected,'mixed configuration versions or wrong assessment timing');
  assert((await f.invoke()).sent,'completed event replay failed');assert(f.posts.length===2,'completed event called provider');
 }finally{globalThis.fetch=fetch;Object.defineProperty(Deno.env,'get',descriptor);}
});
