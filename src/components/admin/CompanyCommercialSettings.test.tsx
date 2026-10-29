import { act,cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({fetch:vi.fn(),save:vi.fn()}));
vi.mock("@/lib/companyCommercialSettings",async()=>({...await vi.importActual("@/lib/companyCommercialSettings"),fetchCompanyCommercialSettings:mocks.fetch,saveCompanyCommercialSettings:mocks.save}));
import CompanyCommercialSettings from "./CompanyCommercialSettings";
import { normalizeCompanyCommercialSettings } from "@/lib/companyCommercialSettings";
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("preserves the draft and shows the conflict without retrying",async()=>{
 mocks.fetch.mockResolvedValue({settings:normalizeCompanyCommercialSettings({}),version:1});
 mocks.save.mockRejectedValue(new Error("Outra pessoa alterou a configuração. Recarregue antes de salvar."));
 render(<CompanyCommercialSettings companyId="a"/>);
 fireEvent.change(await screen.findByLabelText("Novos cadastros"),{target:{value:"Draft retained"}});
 fireEvent.click(screen.getByRole("button",{name:"Salvar comercial"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Recarregue");
 expect(screen.getByLabelText("Novos cadastros")).toHaveValue("Draft retained");
 expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("keeps tenant B's draft when tenant A's save acknowledges late",async()=>{
 const a={settings:normalizeCompanyCommercialSettings({funnel_labels:{interested:"Synthetic A"}}),version:1};
 const b={settings:normalizeCompanyCommercialSettings({funnel_labels:{interested:"Synthetic B"}}),version:1};
 mocks.fetch.mockImplementation((id:string)=>Promise.resolve(id==="a"?a:b));
 let resolve!:(value:unknown)=>void;mocks.save.mockReturnValue(new Promise(done=>{resolve=done;}));
 const {rerender}=render(<CompanyCommercialSettings companyId="a"/>);
 const label=await screen.findByLabelText("Novos cadastros");fireEvent.change(label,{target:{value:"Unsaved A"}});
 fireEvent.click(screen.getByRole("button",{name:"Salvar comercial"}));rerender(<CompanyCommercialSettings companyId="b"/>);
 await act(async()=>resolve({...a,version:2}));
 expect(await screen.findByLabelText("Novos cadastros")).toHaveValue("Synthetic B");
 expect(screen.queryByText(/Configuração comercial salva/)).toBeNull();
});
