import { act,cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),read:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq:mocks.read})})}}));
import CompanyOperatorConsole from "./CompanyOperatorConsole";
afterEach(()=>{cleanup();vi.clearAllMocks();});
function deferred(){let resolve!:(value:unknown)=>void;const promise=new Promise(resolveValue=>{resolve=resolveValue;});return{promise,resolve};}
it("blocks grants until current-company access has loaded",async()=>{
 const response=deferred();mocks.read.mockReturnValue(response.promise);
 render(<CompanyOperatorConsole companyId="company-a" canManage members={[{user_id:"member-a",full_name:"Synthetic A"}]}/>);
 expect(screen.getByRole("switch",{name:"Diagnóstico para Synthetic A"})).toBeDisabled();
 fireEvent.click(screen.getByRole("switch",{name:"Diagnóstico para Synthetic A"}));expect(mocks.rpc).not.toHaveBeenCalled();
 await act(async()=>response.resolve({data:[],error:null}));expect(screen.getByRole("switch",{name:"Diagnóstico para Synthetic A"})).not.toBeDisabled();
});
it("ignores a late tenant A status after switching to B",async()=>{
 const response=deferred();mocks.rpc.mockReturnValue(response.promise);
 const {rerender}=render(<CompanyOperatorConsole companyId="company-a" canManage={false}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar status"}));
 rerender(<CompanyOperatorConsole companyId="company-b" canManage={false}/>);
 await act(async()=>response.resolve({data:{company_active:true,settings_version:777,settings_updated_at:null},error:null}));
 expect(screen.queryByText("777")).toBeNull();
});
it("ignores late grant acknowledgements and does not query old-company access into B",async()=>{
 mocks.read.mockResolvedValue({data:[],error:null});const response=deferred();mocks.rpc.mockReturnValue(response.promise);
 const {rerender}=render(<CompanyOperatorConsole companyId="company-a" canManage members={[{user_id:"member-a",full_name:"Synthetic A"}]}/>);
 await screen.findByRole("switch",{name:"Diagnóstico para Synthetic A"});
 await act(async()=>{});fireEvent.click(screen.getByRole("switch",{name:"Diagnóstico para Synthetic A"}));
 rerender(<CompanyOperatorConsole companyId="company-b" canManage members={[]}/>);
 await act(async()=>response.resolve({data:null,error:null}));
 expect(mocks.read.mock.calls.filter(call=>call[1]==="company-a")).toHaveLength(1);
 expect(screen.queryByText("Synthetic A")).toBeNull();
});
