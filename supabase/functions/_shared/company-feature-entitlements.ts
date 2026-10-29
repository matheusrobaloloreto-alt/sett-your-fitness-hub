import { type CompanyFeatureKey } from "./platform-product-settings.ts";
import { HttpError } from "./tenant-auth.ts";

export interface FeatureEntitlementClient {
  rpc(name: "service_company_feature_allowed", args: {
    _company_id: string; _feature: CompanyFeatureKey;
  }): PromiseLike<{ data: unknown; error: unknown }>;
}

// Call only after existing authentication and tenant/recipient resolution.
export async function requireCompanyFeature(
  client: FeatureEntitlementClient, companyId: string, feature: CompanyFeatureKey,
): Promise<void> {
  if (!companyId) throw new HttpError(403, "company_feature_denied");
  const { data, error } = await client.rpc("service_company_feature_allowed", {
    _company_id: companyId, _feature: feature,
  });
  if (error) throw new HttpError(503, "company_feature_unavailable");
  if (data !== true) throw new HttpError(403, "company_feature_denied");
}
