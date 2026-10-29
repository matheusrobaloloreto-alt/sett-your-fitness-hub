import {supabase} from '@/integrations/supabase/client';
import {fetchCompanyCommercialSettings,renderPreRegistrationInvite} from './companyCommercialSettings';
import {fetchCompanyProductSettings} from './companyProductSettings';
import {preRegistrationUrl} from './publicFlowLinks';

export async function prepareCompanyPreRegistrationDraft(companyId:string,link:string):Promise<string>{
 const [commercial,product,company]=await Promise.all([
  fetchCompanyCommercialSettings(companyId),fetchCompanyProductSettings(companyId),
  supabase.from('companies').select('name, slug').eq('id',companyId).single(),
 ]);
 if(company.error||!company.data?.name||!company.data.slug)throw new Error('Não foi possível confirmar a identidade da empresa.');
 if(preRegistrationUrl(new URL(link).origin,company.data.slug)!==link)throw new Error('A empresa do convite mudou. Recarregue antes de continuar.');
 return renderPreRegistrationInvite(commercial.settings,product.settings.brand.company_name||company.data.name,link);
}
