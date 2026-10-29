import { supabase } from "@/integrations/supabase/client";
import { companyFeatureKeys, companyTiers, type CompanyFeatureKey, type CompanyTier } from "../../supabase/functions/_shared/platform-product-settings";

export type EffectiveCompanyFeatures = {
  company_id: string; tier: CompanyTier; source: "legacy" | "catalog";
  version: number; catalog_version: number | null; adopted_tier: CompanyTier | null;
  features: Record<CompanyFeatureKey, boolean>;
};
export const deniedCompanyFeatures = Object.fromEntries(companyFeatureKeys.map(key => [key, false])) as EffectiveCompanyFeatures["features"];
export const unrestrictedMasterFeatures = Object.fromEntries(companyFeatureKeys.map(key => [key, true])) as EffectiveCompanyFeatures["features"];

export function parseCompanyEntitlements(value: unknown, companyId: string): EffectiveCompanyFeatures {
  const data = value as EffectiveCompanyFeatures | null;
  if (!data || data.company_id !== companyId || !companyTiers.includes(data.tier) ||
    !["legacy", "catalog"].includes(data.source) || !Number.isInteger(data.version) || data.version < 0 ||
    !data.features || companyFeatureKeys.some(key => typeof data.features[key] !== "boolean") ||
    (data.source === "catalog" && (!Number.isInteger(data.catalog_version) || (data.catalog_version ?? 0) < 1))) {
    throw new Error("Permissoes comerciais indisponiveis.");
  }
  return data;
}

// Generated DB types are intentionally not edited in this shared worktree.
type FeatureRpc = (
  name: string, args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
const rpc: FeatureRpc = (name, args) => (supabase.rpc as unknown as FeatureRpc)(name, args);

export async function fetchCompanyEntitlements(companyId: string) {
  const { data, error } = await rpc("get_company_feature_entitlements", { _company_id: companyId });
  if (error) throw new Error("Permissoes comerciais indisponiveis.");
  return parseCompanyEntitlements(data, companyId);
}

export async function saveCompanyFeaturePolicy(companyId: string, source: "legacy" | "catalog", version: number, catalogVersion: number | null) {
  const { data, error } = await rpc("set_company_feature_policy", {
    _company_id: companyId, _source: source, _expected_version: version,
    _catalog_version: catalogVersion, _confirm: true,
  });
  if (error) throw new Error(error.code === "PT409" ? "A politica ou o catalogo mudou. Recarregue antes de confirmar." : "Nao foi possivel salvar as permissoes.");
  const result = parseCompanyEntitlements(data, companyId);
  if (result.version !== version + 1 || result.source !== source) throw new Error("Resposta comercial desatualizada.");
  window.dispatchEvent(new CustomEvent("company-feature-policy-changed", { detail: companyId }));
  return result;
}
