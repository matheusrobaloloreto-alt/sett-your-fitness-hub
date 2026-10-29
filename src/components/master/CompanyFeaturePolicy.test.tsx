import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), catalog: vi.fn() }));
vi.mock("@/lib/companyFeatureEntitlements", () => ({ fetchCompanyEntitlements: mocks.read, saveCompanyFeaturePolicy: mocks.save }));
vi.mock("@/lib/platformSettingsClient", async original => ({ ...await original<typeof import("@/lib/platformSettingsClient")>(), fetchPlatformProductSettings: mocks.catalog }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import CompanyFeaturePolicy from "./CompanyFeaturePolicy";
import { DEFAULT_PLATFORM_PRODUCT_SETTINGS } from "@/lib/platformSettingsClient";
const legacy={company_id:"a",tier:"basic",source:"legacy",version:0,catalog_version:null};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function prepare() { mocks.read.mockResolvedValue(legacy);mocks.catalog.mockResolvedValue({version:8,settings:DEFAULT_PLATFORM_PRODUCT_SETTINGS}); }
it("never adopts while loading or merely previewing; explicit confirmation sends exact versions",async()=>{
  prepare();mocks.save.mockResolvedValue({...legacy,source:"catalog",version:1,catalog_version:8});
  render(<CompanyFeaturePolicy companyId="a" name="Synthetic A"/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Revisar recursos do tier"})).toBeEnabled());
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Revisar recursos do tier"}));
  expect(screen.getByText("WhatsApp: bloqueado")).toBeVisible();expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Confirmar recursos de Synthetic A"}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith("a","catalog",0,8));
  expect(await screen.findByText(/contrato v1, catalogo v8/)).toBeVisible();
});
it("surfaces a conflict without pretending the policy was adopted",async()=>{
  prepare();mocks.save.mockRejectedValue(new Error("Catalogo mudou"));
  render(<CompanyFeaturePolicy companyId="a" name="Synthetic A"/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Revisar recursos do tier"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Revisar recursos do tier"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirmar recursos de Synthetic A"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Catalogo mudou");
  fireEvent.click(screen.getByRole("button",{name:"Close"}));
  expect(screen.getByText(/legado preservado/)).toBeVisible();
});
it("ignores adoption ACK after switching company",async()=>{
  prepare();let finish!:(value:unknown)=>void;mocks.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const {rerender}=render(<CompanyFeaturePolicy companyId="a" name="Synthetic A"/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Revisar recursos do tier"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Revisar recursos do tier"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirmar recursos de Synthetic A"}));
  mocks.read.mockResolvedValue({...legacy,company_id:"b"});
  rerender(<CompanyFeaturePolicy companyId="b" name="Synthetic B"/>);
  await act(async()=>finish({...legacy,source:"catalog",version:9,catalog_version:8}));
  await waitFor(()=>expect(screen.getByText(/legado preservado/)).toBeVisible());
  expect(screen.queryByText(/contrato v9/)).toBeNull();
});
