import { processIntercycleAnamnesisDeliveries } from './index.ts';
function assert(value: unknown, message = 'assertion failed') { if (!value) throw new Error(message); }
type Row=Record<string,any>;
Deno.test('intercycle partial resume freezes original invitation hash/link and completes only after every ACK',async()=>{
 const company='11111111-1111-1111-1111-111111111111',jid='12025550123@s.whatsapp.net';
 const delivery={id:'delivery',student_id:'student',company_id:company,training_cycle_id:'cycle',enrollment_id:'enrollment',dispatch_lease_token:'lease'};
 let snapshot:Row|null=null;let states:string[]=[];let studentReads=0;let edit=false;let completed=false;
 const posts:Row[]=[];const invites:Row[]=[];
 const admin={rpc:async(name:string,args:Row={})=>{
  if(name==='process_intercycle_anamnesis_schedule')return {data:0,error:null};
  if(name==='claim_intercycle_anamnesis_deliveries')return {data:completed?[]:[delivery],error:null};
  if(name==='service_company_feature_allowed')return {data:true,error:null};
  if(name==='snapshot_company_message_sequence'){if(!snapshot){snapshot=structuredClone(args._snapshot);states=args._snapshot.parts.map(()=> 'pending');}return {data:{id:'sequence',snapshot,states:[...states]},error:null};}
  if(name==='claim_company_message_part'){assert(states[args._index]==='pending','duplicate');states[args._index]='in_flight';return {data:{state:'in_flight',token:'token'},error:null};}
  if(name==='authorize_company_message_part'||name==='checkpoint_automation_dispatch')return {data:null,error:null};
  if(name==='ack_company_message_part'){states[args._index]='acked';return {data:null,error:null};}
  if(name==='complete_intercycle_message_sequence'){assert(states.every(x=>x==='acked'),'premature completion');completed=true;return {data:null,error:null};}
  throw Error('unexpected RPC '+name);
 },from(table:string){
  let upsert:Row|null=null;
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,upsert:(row:Row)=>{upsert=row;return q;},maybeSingle:()=>resolve(),then:(fn:any)=>Promise.resolve(resolve()).then(fn)};
  const resolve=():Row=>{
   if(upsert){invites.push(upsert);return {data:null,error:null};}
   if(table==='students'){studentReads++;if(studentReads===4)return {data:null,error:{message:'pre-second-part-failure'}};return {data:{id:'student',full_name:'Ana',phone:'+1 202 555 0123',country_code:'US',intercycle_anamnesis_enabled:true},error:null};}
   const data:Row={training_cycles:{id:'cycle',status:'active',superseded_at:null},enrollments:{id:'enrollment',status:'active'},whatsapp_chats:{id:'chat',remote_jid:jid,student_id:'student',instance_id:'instance'},whatsapp_instances:{instance_name:'synthetic',status:'connected'},company_product_settings:{version:edit?2:1,settings:{message_sequences:{intercycle_invite:edit?[{id:'new',type:'text',text:'Edited'}]:[{id:'one',type:'text',text:'Convite {{link}}'},{id:'two',type:'text',text:'Link original {{link}}'}]}}},company_message_sequences:snapshot?{id:'sequence'}:null};
   if(table==='whatsapp_messages'||table==='whatsapp_chats')return {data:data[table],error:null};
   assert(Object.hasOwn(data,table),'unexpected '+table);return {data:data[table],error:null};
  };return q;
 }};
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{assert(String(input).startsWith('https://provider.invalid/'),'external calls forbidden');posts.push(JSON.parse(String(init?.body)));return Response.json({key:{id:'receipt'+posts.length}});};
 try {
  const args={admin,provider:{url:'https://provider.invalid',key:'synthetic'}};
  const first=await processIntercycleAnamnesisDeliveries(args);assert(first.failed===1 && first.sent===0);assert(posts.length===1 && states[0]==='acked' && states[1]==='pending');
  edit=true;const next=await processIntercycleAnamnesisDeliveries(args);assert(next.sent===1 && completed);assert(posts.length===2);
  assert(posts[0].text.replace('Convite ','')===posts[1].text.replace('Link original ',''),'original token/link replaced');
  assert(new Set(invites.map(x=>x.token_sha256)).size===1,'invite hash changed on recovery');
 }finally{globalThis.fetch=original;}
});
