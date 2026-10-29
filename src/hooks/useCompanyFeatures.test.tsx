import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { user: { id: "staff" }, role: "admin", companyId: "a" }, master: { viewingCompany: null as null | { id: string }, contextLoading: false }, fetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => mocks.master }));
vi.mock("@/lib/companyFeatureEntitlements", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/companyFeatureEntitlements")>(), fetchCompanyEntitlements: mocks.fetch }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { useCompanyFeatures } from "./useCompanyFeatures";
import { deniedCompanyFeatures, unrestrictedMasterFeatures } from "@/lib/companyFeatureEntitlements";
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.auth.role="admin"; mocks.auth.companyId="a"; mocks.master.viewingCompany=null; });
it("shows grandfathered backend flags rather than the live basic catalog", async () => {
  mocks.fetch.mockResolvedValue({ tier: "basic", features: unrestrictedMasterFeatures });
  const { result }=renderHook(useCompanyFeatures);
  await waitFor(()=>expect(result.current.loading).toBe(false));
  expect(result.current.hasWhatsApp).toBe(true);
});
it("denies lookup failures", async () => {
  mocks.fetch.mockRejectedValue(new Error("missing RPC"));
  const { result }=renderHook(useCompanyFeatures);
  await waitFor(()=>expect(result.current.loading).toBe(false));
  expect(result.current.hasPrescription).toBe(false);
});
it("never exposes previous company's flags while switching, including delayed old ACK", async () => {
  let finish!: (value: unknown)=>void;
  mocks.fetch.mockImplementation((id: string)=>id==="a" ? new Promise(resolve=>{finish=resolve;}) : Promise.resolve({tier:"basic",features:deniedCompanyFeatures}));
  const { result, rerender }=renderHook(useCompanyFeatures);
  mocks.auth.companyId="b";rerender();
  expect(result.current.hasWhatsApp).toBe(false);
  await waitFor(()=>expect(result.current.loading).toBe(false));
  await act(async()=>finish({tier:"advanced",features:unrestrictedMasterFeatures}));
  expect(result.current.hasWhatsApp).toBe(false);
});
it("master company view uses the selected company's effective policy", async () => {
  mocks.auth.role="master";mocks.master.viewingCompany={id:"b"};
  mocks.fetch.mockResolvedValue({tier:"basic",features:deniedCompanyFeatures});
  const { result }=renderHook(useCompanyFeatures);
  await waitFor(()=>expect(result.current.loading).toBe(false));
  expect(mocks.fetch).toHaveBeenCalledWith("b");expect(result.current.hasFinancial).toBe(false);
});
it("policy event refresh ignores an older in-flight result for the same company", async () => {
  let first!: (value: unknown)=>void;
  mocks.fetch.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockResolvedValue({tier:"basic",features:deniedCompanyFeatures});
  const { result }=renderHook(useCompanyFeatures);
  act(()=>window.dispatchEvent(new Event("company-feature-policy-changed")));
  await waitFor(()=>expect(result.current.loading).toBe(false));
  await act(async()=>first({tier:"advanced",features:unrestrictedMasterFeatures}));
  expect(result.current.hasWhatsApp).toBe(false);
});
