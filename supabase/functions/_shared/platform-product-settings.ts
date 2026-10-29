export const companyFeatureKeys = ["hasPrescription", "hasDashboard", "hasRegistration", "hasAnamnesis", "hasStudents", "hasAgenda", "hasTeam", "hasPlans", "hasAppearance", "hasFinancial", "hasWhatsApp", "hasAutomation"] as const;
export type CompanyFeatureKey = typeof companyFeatureKeys[number];
export const companyTiers = ["basic", "intermediate", "advanced"] as const;
export type CompanyTier = typeof companyTiers[number];
export type TierDefinition = {
  name: string; monthly_price: number; stripe_price_id: string; description: string;
  features: Record<CompanyFeatureKey, boolean>;
  active_student_limit:number;
  limits_enabled:boolean;
};
export interface PlatformProductSettings {
  tiers: Record<CompanyTier, TierDefinition>;
  editorial: { brand_name: string; audience: string; tone: string; context: string };
  visual:{navy:string;ink:string;paper:string;sand:string;logo_url:string;handle:string};
}
function features(tier: CompanyTier): TierDefinition["features"] {
  return Object.fromEntries(companyFeatureKeys.map(key => [key, !(["hasTeam", "hasAppearance", "hasFinancial", "hasWhatsApp", "hasAutomation"] as string[]).includes(key) || (tier !== "basic" && !["hasWhatsApp", "hasAutomation"].includes(key)) || tier === "advanced"])) as TierDefinition["features"];
}
export const DEFAULT_PLATFORM_PRODUCT_SETTINGS: PlatformProductSettings = {
  tiers: {
    basic: { name: "Básico", monthly_price: 49.9, stripe_price_id: "price_1T8s8n0JX9nASSiUNWHuxTYM", description: "Prescrição e gestão individual", features: features("basic"),active_student_limit:30,limits_enabled:false },
    intermediate: { name: "Intermediário", monthly_price: 400, stripe_price_id: "price_1T8s9P0JX9nASSiUERk7XYh2", description: "Gestão de equipe e financeiro", features: features("intermediate"),active_student_limit:0,limits_enabled:false },
    advanced: { name: "Avançado", monthly_price: 799, stripe_price_id: "price_1T8s9k0JX9nASSiUC8Fx1K2K", description: "Gestão, CRM e automação", features: features("advanced"),active_student_limit:0,limits_enabled:false },
  },
  editorial: { brand_name: "BN Performance Training", audience: "Alunos e profissionais de treinamento", tone: "Técnico, objetivo e acessível", context: "" },
  visual:{navy:"#0D1B3E",ink:"#111214",paper:"#F4F2ED",sand:"#C8A876",logo_url:"",handle:"@bnperformancetraining"},
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function reject(path: string): never { throw new Error(`Invalid platform setting: ${path}`); }
function keys(value: Record<string, unknown>, allowed: readonly string[], path: string) { if (Object.keys(value).some(key => !allowed.includes(key))) reject(path); }
function text(value: unknown, max: number, path: string): string {
  if (typeof value !== "string" || value.length > max || Array.from(value).some(character=>character.charCodeAt(0)<=8)) reject(path);
  return value.trim();
}
export function normalizePlatformProductSettings(input: unknown): PlatformProductSettings {
  if (!record(input)) reject("settings");
  keys(input, ["tiers", "editorial","visual"], "settings");
  const result: PlatformProductSettings = JSON.parse(JSON.stringify(DEFAULT_PLATFORM_PRODUCT_SETTINGS));
  if (input.tiers !== undefined) {
    if (!record(input.tiers)) reject("tiers");
    keys(input.tiers, companyTiers, "tiers");
    for (const tier of companyTiers) {
      const patch = input.tiers[tier];
      if (patch === undefined) continue;
      if (!record(patch)) reject(tier);
      keys(patch, ["name", "monthly_price", "stripe_price_id", "description", "features","active_student_limit","limits_enabled"], tier);
      const dest = result.tiers[tier];
      if(patch.limits_enabled!==undefined){if(typeof patch.limits_enabled!=="boolean")reject("limits_enabled");dest.limits_enabled=patch.limits_enabled;}
      if(patch.active_student_limit!==undefined){const cap=patch.active_student_limit;if(typeof cap!=="number"||!Number.isInteger(cap)||cap<0||cap>100000)reject("active_student_limit");dest.active_student_limit=cap;}
      if (patch.name !== undefined) { dest.name = text(patch.name, 80, "name"); if (!dest.name) reject("name"); }
      if (patch.description !== undefined) dest.description = text(patch.description, 500, "description");
      if (patch.monthly_price !== undefined) {
        const price = patch.monthly_price;
        if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 100000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) reject("monthly_price");
        dest.monthly_price = price;
      }
      if (patch.stripe_price_id !== undefined) {
        dest.stripe_price_id = text(patch.stripe_price_id, 100, "stripe_price_id");
        if (!/^price_[A-Za-z0-9]+$/.test(dest.stripe_price_id)) reject("stripe_price_id");
      }
      if (patch.features !== undefined) {
        if (!record(patch.features)) reject("features");
        keys(patch.features, companyFeatureKeys, "features");
        for (const [key, val] of Object.entries(patch.features)) {
          if (typeof val !== "boolean") reject(`features.${key}`);
          dest.features[key as CompanyFeatureKey] = val;
        }
      }
    }
  }
  if (input.editorial !== undefined) {
    if (!record(input.editorial)) reject("editorial");
    keys(input.editorial, ["brand_name", "audience", "tone", "context"], "editorial");
    for (const key of Object.keys(result.editorial) as (keyof PlatformProductSettings["editorial"])[]) {
      if (input.editorial[key] !== undefined) result.editorial[key] = text(input.editorial[key], key === "context" ? 4000 : 200, `editorial.${key}`);
    }
    if (!result.editorial.brand_name) reject("editorial.brand_name");
  }
  if(input.visual!==undefined){
    if(!record(input.visual))reject("visual");keys(input.visual,Object.keys(result.visual),"visual");
    for(const key of Object.keys(result.visual) as (keyof PlatformProductSettings["visual"])[]){
      if(input.visual[key]===undefined)continue;const value=text(input.visual[key],key==="logo_url"?2000:80,`visual.${key}`);
      if(key==="logo_url" ? value!=="" && !safePublicUrl(value) : key==="handle" ? value!=="" && !/^@[A-Za-z0-9_.]{1,30}$/.test(value) : !/^#[0-9a-f]{6}$/i.test(value))reject(`visual.${key}`);
      result.visual[key]=value;
    }
  }
  return result;
}
export function publicPlatformCatalog(settings: PlatformProductSettings) {
  return { tiers: Object.fromEntries(companyTiers.map(tier => {
    const { stripe_price_id: _privateId, ...publicTier } = settings.tiers[tier];
    return [tier, publicTier];
  })) as Record<CompanyTier, Omit<TierDefinition, "stripe_price_id">> };
}
export function safePublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://") || /\s/.test(value)) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export interface PlatformSettingsClient {
  from(table: "platform_product_settings"): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: { settings: unknown; version: number } | null; error: { code?: string } | null }> } } };
}
export async function getPlatformProductSettings(client: PlatformSettingsClient) {
  const { data, error } = await client.from("platform_product_settings").select("settings,version").eq("id", "default").maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code || "")) throw new Error("Platform catalog unavailable");
  return { settings: normalizePlatformProductSettings(data?.settings ?? {}), version: data?.version ?? 0 };
}
