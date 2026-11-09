import { executeFlow, sendText } from './index.ts';
import { webhookOccurrence } from '../_shared/dispatch-reconciliation-webhook.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const jid='5548999999999@s.whatsapp.net';
type Row=Record<string,any>;
function fixture(options: {mode?:'content'|'menu';failAck?:boolean;recipient?:string;revoked?:boolean;consent?:boolean}={}) {
  const ledger=new Map<string,string>();
  const claims=new Map<string,string>();
  const calls:string[]=[];
  const writes:Row[]=[];
  let checks=0;
  const admin={
    rpc(name:string,args:Row={}) {
      calls.push(name);
      if(name==='service_company_feature_allowed') {checks++;return Promise.resolve({data:!(options.revoked && checks>=5),error:null});}
      if(name==='weekly_contact_consent_is_current')return Promise.resolve({data:options.consent!==false,error:null});
      if(name==='claim_webhook_dispatch') {
        const id=args._occurrence;
        const state=ledger.get(id);
        if(state==='acked')return Promise.resolve({data:{state:'acked'},error:null});
        if(state)return Promise.resolve({data:{state:'pending'},error:null});
        claims.set(id,id);return Promise.resolve({data:{id,token:`lease:${id}`,state:'claimed'},error:null});
      }
      if(name==='begin_automation_dispatch') {ledger.set(args._owner_id,'in_flight');return Promise.resolve({data:'in_flight',error:null});}
      if(name==='authorize_automation_dispatch' || name==='park_webhook_dispatch')return Promise.resolve({data:null,error:null});
      if(name==='ack_automation_dispatch') {
        if(options.failAck)return Promise.resolve({data:null,error:{message:'synthetic write failure'}});
        ledger.set(args._owner_id,'acked');return Promise.resolve({data:null,error:null});
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from(table:string) {
      const filters:Row={};let mutation:Row|null=null;
      const result=()=>{
        if(mutation){writes.push({table,...mutation});return {data:null,error:null};}
        const data:Row={
          automation_flows:{id:filters.id,company_id:'company',is_active:true},
          automation_flow_nodes:[{id:'node',node_type:options.mode==='menu'?'menu':'content',data:options.mode==='menu'?{prompt:'Escolha',options:[{number:'1',text:'Continuar'}]}:{message:'Roteiro {{nome}}',use_company_template:'weekly_contact'}}],
          automation_flow_edges:[],
          company_message_sequences:null,
          company_product_settings:{settings:{messages:{weekly_contact:'Central {{primeiro_nome}}'}},version:1},
          whatsapp_chats:{id:'chat',company_id:'company',student_id:'student',remote_jid:options.recipient||jid,instance_id:'instance'},
          whatsapp_instances:{id:'instance',instance_name:'synthetic',status:'connected'},
          whatsapp_labels:{id:'label'},whatsapp_chat_labels:{id:'link'},
          students:{id:'student',phone:'+55 48 99999-9999',whatsapp:null,country_code:'BR'},
        };
        assert(table in data,`Unexpected table ${table}`);
        return {data:data[table],error:null};
      };
      const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},
        update:(v:Row)=>{mutation=v;return q;},insert:(v:Row)=>{mutation=v;return q;},
        maybeSingle:async()=>result(),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
      return q;
    },
  };
  return {admin,calls,writes,ledger};
}
async function capture(run:(out:string[])=>Promise<void>,response:()=>Response=()=>new Response(JSON.stringify({key:{id:'synthetic-receipt'}}))) {
  const original=globalThis.fetch;const out:string[]=[];
  globalThis.fetch=((url:unknown,init?:RequestInit)=>{
    assert(String(url)==='https://provider.invalid/message/sendText/synthetic','unexpected network destination');
    out.push(JSON.parse(String(init?.body)).text);return Promise.resolve(response());
  }) as typeof fetch;
  try {await run(out);}finally {globalThis.fetch=original;}
}
const ctx={nome:'Ana',_dispatch_student_id:'student',_dispatch_inbound_event:'synthetic-event',trigger_type:'weekly_contact',recipient_candidate:jid,recipient_generation:1};
const runFlow=(f:ReturnType<typeof fixture>)=>executeFlow(f.admin,'company',jid,'chat','synthetic','https://provider.invalid',{apikey:'synthetic'},'flow','node',{...ctx},true);

for(const mode of ['content','menu'] as const) Deno.test(`communications webhook ${mode}: actual send boundary, configured text, durable receipt replay`,async()=>{
  const f=fixture({mode});
  await capture(async out=>{
    await runFlow(f);await runFlow(f);
    assert(out.length===1,'durable replay resent the message');
    assert(out[0]===(mode==='content'?'Central Ana':'Escolha\n\n1. Continuar'),'configured copy/menu ignored');
  });
  assert(f.calls.includes('authorize_automation_dispatch')&&f.calls.includes('ack_automation_dispatch'),'ledger boundary bypassed');
});
for(const problem of ['503','missing_receipt','lost_ack'] as const) Deno.test(`communications webhook ${problem}: parks and never sends on another attempt`,async()=>{
  const f=fixture({failAck:problem==='lost_ack'});
  await capture(async out=>{
    for(let i=0;i<2;i++) {
      let failed=false;try {await runFlow(f);}catch {failed=true;}
      assert(failed,'uncertainty was swallowed');
    }
    assert(out.length===1,'uncertain send repeated');
    assert(f.writes.length===0,'flow/history advanced without durable receipt');
  },()=>problem==='503'?new Response('synthetic provider private error',{status:503}):new Response(JSON.stringify({key:problem==='missing_receipt'?{}:{id:'synthetic-receipt'}})));
});
for(const options of [{recipient:'5548888888888@s.whatsapp.net'},{consent:false},{revoked:true}]) Deno.test(`communications webhook changed identity/consent/feature ${JSON.stringify(options)} stops I/O`,async()=>{
  const f=fixture(options);
  await capture(async out=>{
    let failed=false;try{await runFlow(f);}catch{failed=true;}
    assert(failed&&out.length===0,'revoked recipient/permission still sent');
  });
});
Deno.test('communications BNITO uses same actual sender/receipt boundary without model I/O',async()=>{
  const f=fixture();const occurrence=()=>webhookOccurrence('synthetic-event','bnito');
  await capture(async out=>{
    for(let i=0;i<2;i++) await sendText('https://provider.invalid','synthetic',{apikey:'synthetic'},'company',jid,'Resposta revisada',f.admin,'chat',occurrence,'student');
    assert(out.length===1,'BNITO send replay duplicated');
  });
});
Deno.test('communications webhook missing event is refused before any provider request',async()=>{
  const f=fixture();
  await capture(async out=>{
    let failed=false;
    try {await sendText('https://provider.invalid','synthetic',{apikey:'synthetic'},'company',jid,'Roteiro',f.admin,'chat',()=>webhookOccurrence(null,'bnito'),'student');}catch{failed=true;}
    assert(failed&&out.length===0,'missing identity reached provider');
    assert(!f.calls.includes('claim_webhook_dispatch'),'missing identity created a claim');
  });
});
