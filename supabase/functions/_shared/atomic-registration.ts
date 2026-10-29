import { HttpError, isUuid } from './tenant-auth.ts';
interface RpcClient { rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string}|null}> }
export interface AtomicRegistration {
 id:string;token:string;company_id:string;expires_at:string;student:{id:string;[key:string]:unknown};leadId?:string;studentId?:string;messageSent?:false;confirmedPhone?:string;
}
export async function atomicRegistration(client:RpcClient,name:'convert_lead_to_fiscal_atomic'|'prepare_registration_link_atomic',args:Record<string,unknown>,companyId:string):Promise<AtomicRegistration>{
 const {data,error}=await client.rpc(name,args);
 if(error){
  if(error.code==='42501')throw new HttpError(403,'Acesso ou transição indisponível. Confira a política da empresa.');
  if(error.code==='PT409')throw new HttpError(409,'O cadastro mudou ou existe mais de um perfil compatível. Recarregue e revise antes de continuar.');
  if(error.code==='PT422'||error.code==='22023')throw new HttpError(422,'Confira os dados e o telefone do pré-cadastro.');
  throw new HttpError(503,'Não foi possível confirmar o cadastro. Recarregue antes de tentar novamente.');
 }
 const result=data as AtomicRegistration|null;
 if(!result||result.company_id!==companyId||!isUuid(result.id)||!isUuid(result.token)||!result.student||!isUuid(result.student.id)||!Number.isFinite(Date.parse(result.expires_at)))throw new HttpError(503,'Resposta do cadastro não confirmada.');
 if(name==='prepare_registration_link_atomic'&&result.student.id!==args._student_id)throw new HttpError(503,'Perfil do cadastro não confirmado.');
 if(name==='convert_lead_to_fiscal_atomic'&&(result.leadId!==args._lead_id||result.studentId!==result.student.id||result.messageSent!==false||!(/^[1-9]\d{7,14}$/).test(String(result.confirmedPhone||''))||result.confirmedPhone!==args._confirmed_phone))throw new HttpError(503,'Conversão não confirmada pelo servidor.');
 return result;
}
