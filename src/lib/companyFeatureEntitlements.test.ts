import { describe, expect, it, vi, beforeEach } from "vitest";
import { requireCompanyFeature } from "../../supabase/functions/_shared/company-feature-entitlements";
import { HttpError } from "../../supabase/functions/_shared/tenant-auth";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { fetchCompanyEntitlements, parseCompanyEntitlements, saveCompanyFeaturePolicy, unrestrictedMasterFeatures } from "./companyFeatureEntitlements";
const policy = { company_id: "a", tier: "basic", source: "legacy", version: 0, catalog_version: null, adopted_tier: null, features: unrestrictedMasterFeatures };
beforeEach(() => { vi.clearAllMocks(); });
describe("company effective commercial policy", () => {
  it("uses authoritative legacy flags even when public catalog basic denies WhatsApp", async () => {
    mocks.rpc.mockResolvedValue({ data: policy, error: null });
    expect((await fetchCompanyEntitlements("a")).features.hasWhatsApp).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("get_company_feature_entitlements", { _company_id: "a" });
  });
  it.each([null, { ...policy, company_id: "b" }, { ...policy, features: {} }, { ...policy, features: { ...policy.features, hasWhatsApp: "true" } }, { ...policy, tier: "invented" }])("rejects malformed or other-tenant readback: %j", value => {
    expect(() => parseCompanyEntitlements(value, "a")).toThrow();
  });
  it("conflicts never masquerade as adoption success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409" } });
    await expect(saveCompanyFeaturePolicy("a", "catalog", 0, 9)).rejects.toThrow(/mudou/);
  });
  it("sends explicit confirmation and exact versions, then validates returned tenant", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...policy, source: "catalog", version: 1, catalog_version: 9 }, error: null });
    expect((await saveCompanyFeaturePolicy("a", "catalog", 0, 9)).version).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith("set_company_feature_policy", { _company_id: "a", _source: "catalog", _expected_version: 0, _catalog_version: 9, _confirm: true });
  });
});
describe("Edge feature gate", () => {
  it.each([false, null, "true", { allowed: true }])("rejects anything except boolean true: %j", async data => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(requireCompanyFeature({ rpc }, "a", "hasWhatsApp")).rejects.toMatchObject({ status: 403 });
  });
  it("blocks lookup failure instead of invoking a provider", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: { code: "PGRST202" } });
    await expect(requireCompanyFeature({ rpc }, "a", "hasPrescription")).rejects.toMatchObject({ status: 503 });
  });
  it("uses a tenant bound service RPC, with no network or provider dependency", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(requireCompanyFeature({ rpc }, "a", "hasFinancial")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("service_company_feature_allowed", { _company_id: "a", _feature: "hasFinancial" });
    expect(new HttpError(403, "test").status).toBe(403);
  });
});
