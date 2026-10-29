import {supabase} from "@/integrations/supabase/client";
import {isSettingsConflict} from "./settingsConflict";

export async function saveCompanyPublicProfile(expected:{id:string;name:string;slug:string|null},identity:{name:string;slug:string}) {
 const {error}=await supabase.rpc("update_company_public_profile" as never,{_company_id:expected.id,_name:identity.name,_slug:identity.slug,_expected_name:expected.name,_expected_slug:expected.slug} as never);
 if(error)throw new Error(isSettingsConflict(error)?"Outra pessoa alterou a identidade. Rascunho mantido. Recarregue antes de salvar.":"Não foi possível salvar. Confira o nome e o slug único.");
}
