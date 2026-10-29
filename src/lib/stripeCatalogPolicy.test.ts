import {describe,expect,it} from "vitest";
import {normalizePlatformProductSettings} from "../../supabase/functions/_shared/platform-product-settings";
import {resolveSubscriptionTier} from "../../supabase/functions/_shared/stripe-catalog-policy";

describe("verified Stripe price resolution",()=>{
 const current=normalizePlatformProductSettings({tiers:{advanced:{stripe_price_id:"price_customAdvanced"}}});
 it("uses the authoritative price, never the metadata tier or product fallback",()=>{
  expect(resolveSubscriptionTier([{price:{id:"price_customAdvanced"}}],[current])).toBe("advanced");
  expect(()=>resolveSubscriptionTier([{price:{id:"price_unknown",product:"prod_U76LIOQ0o1AQKR"}}],[current])).toThrow(/Unknown/);
 });
 it("preserves old subscriptions via server-stored catalog snapshots",()=>{
  const old=normalizePlatformProductSettings({tiers:{advanced:{stripe_price_id:"price_historicalAdvanced"}}});
  expect(resolveSubscriptionTier([{price:{id:"price_historicalAdvanced"}}],[current,old])).toBe("advanced");
 });
 it("rejects ambiguous catalogs, multiple items and missing prices without a downgrade",()=>{
  const conflict=normalizePlatformProductSettings({tiers:{basic:{stripe_price_id:"price_customAdvanced"}}});
  expect(()=>resolveSubscriptionTier([{price:{id:"price_customAdvanced"}}],[current,conflict])).toThrow(/Ambiguous/);
  expect(()=>resolveSubscriptionTier([],[current])).toThrow();
  expect(()=>resolveSubscriptionTier([{price:{id:"price_customAdvanced"}},{price:{id:"price_customAdvanced"}}],[current])).toThrow();
 });
});
