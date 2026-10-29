import {expect,it,vi} from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
import {saveCompanyLimitSource} from "./companyAdmissionPolicy";
it("requires explicit confirmation before opting a company into future tier admissions",async()=>{
 rpc.mockReset();
 await expect(saveCompanyLimitSource("a","tier",0,false)).rejects.toThrow(/Confirme/);
 expect(rpc).not.toHaveBeenCalled();
 rpc.mockResolvedValue({data:{company_limit_source:"tier",company_limit_policy_version:1},error:null});
 await expect(saveCompanyLimitSource("a","tier",0,true)).resolves.toEqual({company_limit_source:"tier",company_limit_policy_version:1});
 expect(rpc).toHaveBeenCalledWith("set_company_limit_source",{_company_id:"a",_source:"tier",_expected_version:0,_confirm_future_admissions:true});
});
it.each(["PT409","40001"])("shows %s conflict without retrying",async code=>{
 rpc.mockReset();rpc.mockResolvedValue({data:null,error:{code}});
 await expect(saveCompanyLimitSource("a","legacy",1,false)).rejects.toThrow(/Recarregue/);
 expect(rpc).toHaveBeenCalledTimes(1);
});
