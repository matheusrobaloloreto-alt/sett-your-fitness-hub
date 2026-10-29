export type OperationalStage='interested'|'contacted'|'fiscal_registration_pending'|'lost';
interface OperationClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
export function operationalStage(value:unknown,status?:unknown):OperationalStage|null {
 const implicit=status==='inactive'?'lost':status==='pending'?'payment_pending':['active','awaiting_renewal'].includes(String(status))?'active':'interested';
 const stage=value==null||value===''?implicit:value==='fiscal_registration'?'fiscal_registration_pending':value;
 return ['interested','contacted','fiscal_registration_pending','lost'].includes(String(stage))?stage as OperationalStage:null;
}
// Caller must resolve company/source from the authorized database record.
// Financial lifecycle is governed by its existing verified handlers.
export async function companyOperationTransitionAllowed(client:OperationClient,companyId:string,source:unknown,target:OperationalStage,status?:unknown):Promise<boolean>{
 const from=operationalStage(source,status);
 if(from===null||from===target)return true;
 try{
  const {data,error}=await client.rpc('assert_company_operation_transition',{_company_id:companyId,_source:from,_target:target});
  return !error&&data===true;
 }catch{return false;}
}
