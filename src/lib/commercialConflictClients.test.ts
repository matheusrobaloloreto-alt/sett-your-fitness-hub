import {expect,it,vi} from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
import {normalizeCompanyCommercialSettings,saveCompanyCommercialSettings,publishCompanyPage} from "./companyCommercialSettings";
import {saveCompanyPublicProfile} from "./companyPublicProfile";

it.each(["PT409","40001"])("surfaces %s conflicts without retries or owner mutation",async code=>{
 rpc.mockReset();rpc.mockResolvedValue({data:null,error:{code}});
 await expect(saveCompanyCommercialSettings("a",normalizeCompanyCommercialSettings({}),1)).rejects.toThrow(/Recarregue/);
 expect(rpc).toHaveBeenCalledTimes(1);
 await expect(publishCompanyPage("a","sobre",1)).rejects.toThrow(/Recarregue/);
 expect(rpc).toHaveBeenCalledTimes(2);
 await expect(saveCompanyPublicProfile({id:"a",name:"Old",slug:"old"},{name:"New",slug:"new"})).rejects.toThrow(/Recarregue/);
 expect(rpc).toHaveBeenCalledTimes(3);
 expect(rpc.mock.calls[2]).toEqual(["update_company_public_profile",{_company_id:"a",_name:"New",_slug:"new",_expected_name:"Old",_expected_slug:"old"}]);
});
