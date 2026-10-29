import {getPlatformProductSettings,normalizePlatformProductSettings,type CompanyTier,type PlatformProductSettings,type PlatformSettingsClient,companyTiers} from "./platform-product-settings.ts";

type SubscriptionItem={price?:{id?:string;product?:unknown};quantity?:number|null};
export function resolveSubscriptionTier(items:SubscriptionItem[],catalogs:PlatformProductSettings[]):CompanyTier {
 if(items.length!==1 || (items[0].quantity!=null && items[0].quantity!==1))throw new Error("Unsupported subscription items");
 const priceId=items[0].price?.id;
 if(!priceId || !/^price_[A-Za-z0-9]+$/.test(priceId))throw new Error("Unknown subscription price");
 const matches=new Set<CompanyTier>();
 for(const catalog of catalogs)for(const tier of companyTiers)if(catalog.tiers[tier].stripe_price_id===priceId)matches.add(tier);
 if(matches.size===0)throw new Error("Unknown subscription price; reconciliation required");
 if(matches.size!==1)throw new Error("Ambiguous subscription price; reconciliation required");
 return [...matches][0];
}
interface HistoryClient {from(table:"platform_product_settings_history"):{select(columns:string):PromiseLike<{data:{settings:unknown}[]|null;error:unknown}>}}
export type StripeCatalogClient=PlatformSettingsClient & HistoryClient;
// Only service-owned catalog snapshots count. Stripe metadata is never a tier authority.
export async function getSubscriptionTier(client:StripeCatalogClient,items:SubscriptionItem[]):Promise<CompanyTier>{
 const current=await getPlatformProductSettings(client);
 const {data,error}=await client.from("platform_product_settings_history").select("settings");
 if(error)throw new Error("Billing catalog history unavailable");
 return resolveSubscriptionTier(items,[current.settings,...(data||[]).map(row=>normalizePlatformProductSettings(row.settings))]);
}
