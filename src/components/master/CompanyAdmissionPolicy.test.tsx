import {cleanup,fireEvent,render,screen,act} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const save=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/companyAdmissionPolicy",()=>({saveCompanyLimitSource:save}));
import CompanyAdmissionPolicy from "./CompanyAdmissionPolicy";
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("requires a separate confirmation before submitting a per-company opt-in",async()=>{
 const onSaved=vi.fn();save.mockResolvedValue({company_limit_source:"tier",company_limit_policy_version:1});
 render(<CompanyAdmissionPolicy companyId="a" name="Synthetic A" source="legacy" version={0} onSaved={onSaved}/>);
 const control=screen.getByRole("switch");fireEvent.click(control);expect(save).not.toHaveBeenCalled();expect(control).not.toBeChecked();
 fireEvent.click(screen.getByRole("button",{name:"Confirmar política de admissão"}));
 await act(async()=>{});expect(save).toHaveBeenCalledWith("a","tier",0,true);expect(onSaved).toHaveBeenCalledTimes(1);
});
it("ignores a late company A acknowledgement after switching to company B",async()=>{
 let resolve!:(value:unknown)=>void;save.mockReturnValue(new Promise(done=>{resolve=done;}));const onSaved=vi.fn();
 const {rerender}=render(<CompanyAdmissionPolicy companyId="a" name="A" source="legacy" version={0} onSaved={onSaved}/>);
 fireEvent.click(screen.getByRole("switch"));fireEvent.click(screen.getByRole("button",{name:"Confirmar política de admissão"}));
 rerender(<CompanyAdmissionPolicy companyId="b" name="B" source="legacy" version={0} onSaved={onSaved}/>);
 await act(async()=>resolve({company_limit_source:"tier",company_limit_policy_version:1}));
 expect(onSaved).not.toHaveBeenCalled();expect(screen.getByRole("switch")).not.toBeChecked();
});
