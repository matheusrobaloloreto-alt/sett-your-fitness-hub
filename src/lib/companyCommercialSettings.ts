import { supabase } from "@/integrations/supabase/client";
import {isSettingsConflict} from "./settingsConflict";
import { normalizeCompanyCommercialSettings, type CompanyCommercialSettings } from "../../supabase/functions/_shared/company-commercial-settings";
export * from "../../supabase/functions/_shared/company-commercial-settings";
export type CommercialEnvelope={settings:CompanyCommercialSettings;version:number};
interface CommercialClient {
  from(table:string):{select(columns:string):{eq(column:string,value:string):{maybeSingle():PromiseLike<{data:{settings:unknown;version:number}|null;error:{code?:string}|null}>}}};
  rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string}|null}>;
}
const client=supabase as unknown as CommercialClient;
export async function fetchCompanyCommercialSettings(companyId:string):Promise<CommercialEnvelope> {
  if (!companyId) throw new Error("Empresa obrigatória.");
  const {data,error}=await client.from("company_commercial_settings").select("settings,version").eq("company_id",companyId).maybeSingle();
  if (error && !["42P01","PGRST205"].includes(error.code || "")) throw new Error("Configuração comercial indisponível.");
  return {settings:normalizeCompanyCommercialSettings(data?.settings || {}),version:data?.version || 0};
}
export async function saveCompanyCommercialSettings(companyId:string,settings:CompanyCommercialSettings,version:number):Promise<CommercialEnvelope> {
  if (!companyId || !Number.isSafeInteger(version) || version<0) throw new Error("Empresa ou versão inválida.");
  const {data,error}=await client.rpc("save_company_commercial_settings",{_company_id:companyId,_settings:normalizeCompanyCommercialSettings(settings),_expected_version:version});
  if (error) throw new Error(isSettingsConflict(error) ? "Outra pessoa alterou a configuração. Recarregue antes de salvar." : "Não foi possível salvar a configuração comercial.");
  const value=data as CommercialEnvelope;
  if (!value || value.version!==version+1) throw new Error("Versão comercial inesperada.");
  return {settings:normalizeCompanyCommercialSettings(value.settings),version:value.version};
}
export async function publishCompanyPage(companyId:string,page:string,settingsVersion:number) {
  const {data,error}=await client.rpc("publish_company_public_page",{_company_id:companyId,_page:page,_settings_version:settingsVersion});
  if (error) throw new Error(isSettingsConflict(error)?"Outra pessoa alterou a configuração. Recarregue e confira o documento antes de publicar.":"Publicação não concluída. Salve a configuração e confira o conteúdo antes de publicar.");
  return data;
}
