import {supabase} from "@/integrations/supabase/client";
import {isSettingsConflict} from "./settingsConflict";
export type CompanyLimitSource="legacy"|"tier";
export async function saveCompanyLimitSource(companyId:string,source:CompanyLimitSource,version:number,confirmed:boolean):Promise<{company_limit_source:CompanyLimitSource;company_limit_policy_version:number}>{
 if(!companyId || !Number.isSafeInteger(version) || version<0)throw new Error("Empresa ou versão inválida.");
 if(source==="tier" && !confirmed)throw new Error("Confirme a aplicação às futuras admissões.");
 const {data,error}=await supabase.rpc("set_company_limit_source" as never,{_company_id:companyId,_source:source,_expected_version:version,_confirm_future_admissions:confirmed} as never);
 if(error)throw new Error(isSettingsConflict(error)?"Política alterada por outro master. Recarregue antes de salvar.":"Não foi possível alterar a política de admissão.");
 const value=data as unknown as {company_limit_source:CompanyLimitSource;company_limit_policy_version:number};
 if(!value || value.company_limit_source!==source || value.company_limit_policy_version!==version+1)throw new Error("Resposta de política inválida.");
 return value;
}
