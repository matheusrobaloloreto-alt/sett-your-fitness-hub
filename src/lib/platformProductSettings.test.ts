import { describe, expect, it } from "vitest";
import { DEFAULT_PLATFORM_PRODUCT_SETTINGS, normalizePlatformProductSettings, publicPlatformCatalog, companyFeatureKeys, safePublicUrl } from "../../supabase/functions/_shared/platform-product-settings";

describe("platform catalog", () => {
  it("requires explicit per-tier opt-in, never an editorial-only save, to enable limits",()=>{
    expect(normalizePlatformProductSettings({editorial:{tone:"New tone"}}).tiers.basic.limits_enabled).toBe(false);
    expect(normalizePlatformProductSettings({tiers:{basic:{active_student_limit:1}}}).tiers.basic.limits_enabled).toBe(false);
    expect(normalizePlatformProductSettings({tiers:{basic:{limits_enabled:true}}}).tiers.basic.limits_enabled).toBe(true);
    expect(()=>normalizePlatformProductSettings({tiers:{basic:{limits_enabled:"true"}}})).toThrow();
  });
  it("validates quantitative active-student limits without changing default entitlements",()=>{
    const value=normalizePlatformProductSettings({tiers:{basic:{active_student_limit:42}}});
    expect(value.tiers.basic.active_student_limit).toBe(42);
    expect(value.tiers.intermediate.active_student_limit).toBe(0);
    expect(()=>normalizePlatformProductSettings({tiers:{basic:{active_student_limit:-1}}})).toThrow();
  });
  it("keeps legacy entitlements and one consistent display price", () => {
    const value = normalizePlatformProductSettings({});
    expect(value.tiers.basic.monthly_price).toBe(49.9);
    expect(value.tiers.basic.features.hasFinancial).toBe(false);
    expect(value.tiers.advanced.features.hasAutomation).toBe(true);
    expect(Object.keys(value.tiers.basic.features)).toEqual([...companyFeatureKeys]);
  });
  it("validates identifiers and prices before checkout can consume them", () => {
    const value = structuredClone(DEFAULT_PLATFORM_PRODUCT_SETTINGS);
    value.tiers.basic.stripe_price_id = "arbitrary";
    expect(() => normalizePlatformProductSettings(value)).toThrow(/price/i);
    value.tiers.basic.stripe_price_id = "price_valid123";
    value.tiers.basic.monthly_price = -1;
    expect(() => normalizePlatformProductSettings(value)).toThrow(/price/i);
  });
  it("never exposes billing IDs or editorial configuration in the public projection", () => {
    const result = publicPlatformCatalog(DEFAULT_PLATFORM_PRODUCT_SETTINGS);
    expect(JSON.stringify(result)).not.toContain("price_1");
    expect(result.tiers.basic).not.toHaveProperty("stripe_price_id");
    expect(result).not.toHaveProperty("editorial");
  });
  it("rejects unsupported feature keys and unsafe URLs", () => {
    expect(() => normalizePlatformProductSettings({ tiers: { basic: { features: { isMaster: true } } } })).toThrow();
    for (const url of ["javascript:alert(1)", "data:text/html,evil", "https://user:pass@example.org", "//evil.example", "http://example.org"]) expect(safePublicUrl(url)).toBeNull();
    expect(safePublicUrl("https://example.org/support")).toBe("https://example.org/support");
  });
  it("keeps editable editorial data bounded and rejects arbitrary settings", () => {
    const value = normalizePlatformProductSettings({ editorial: { brand_name: "Synthetic Studio", audience: "Adults", tone: "Objective", context: "Evidence only" } });
    expect(value.editorial.brand_name).toBe("Synthetic Studio");
    expect(() => normalizePlatformProductSettings({ editorial: { secret: "no" } })).toThrow();
    expect(() => normalizePlatformProductSettings({ tiers: { basic: { monthly_price: 1.111 } } })).toThrow();
  });
});
