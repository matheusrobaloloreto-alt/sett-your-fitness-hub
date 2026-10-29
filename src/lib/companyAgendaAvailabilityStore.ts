import { supabase } from '@/integrations/supabase/client';
import { isSettingsConflict } from './settingsConflict';
import { validateAgendaAvailability, type AgendaAvailability } from './companyAgendaAvailability';
export type AvailabilityEnvelope={settings:AgendaAvailability;version:number};
interface AvailabilityClient{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string}|null}>}
const client=supabase as unknown as AvailabilityClient;
function envelope(value:unknown):AvailabilityEnvelope{
 const row=value as AvailabilityEnvelope;
 if(!row||!Number.isSafeInteger(row.version)||row.version<0)throw new Error('Versão de disponibilidade inválida.');
 return {settings:validateAgendaAvailability(row.settings),version:row.version};
}
export async function fetchAgendaAvailability(companyId:string):Promise<AvailabilityEnvelope>{
 if(!companyId)throw new Error('Empresa obrigatória.');
 const {data,error}=await client.rpc('get_company_agenda_availability',{_company_id:companyId});
 if(error)throw new Error('Disponibilidade indisponível. Confira acesso e migração.');
 return envelope(data);
}
export async function saveAgendaAvailability(companyId:string,settings:AgendaAvailability,version:number):Promise<AvailabilityEnvelope>{
 if(!companyId||!Number.isSafeInteger(version)||version<0)throw new Error('Empresa ou versão inválida.');
 const {data,error}=await client.rpc('save_company_agenda_availability',{_company_id:companyId,_settings:validateAgendaAvailability(settings),_expected_version:version});
 if(error)throw new Error(isSettingsConflict(error)?'Outra pessoa alterou a disponibilidade. Recarregue antes de salvar.':'Não foi possível salvar a disponibilidade.');
 const result=envelope(data);
 if(result.version!==version+1)throw new Error('Versão de disponibilidade inesperada.');
 return result;
}
