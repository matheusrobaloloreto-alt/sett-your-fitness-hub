import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { URL as NodeURL } from "node:url";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { normalizePlatformProductSettings } from "../../supabase/functions/_shared/platform-product-settings";
import { getSubscriptionTier } from "../../supabase/functions/_shared/stripe-catalog-policy";
import { claimStripeEventV2, applyStripeEventV2, failStripeEventV2 } from "../../supabase/functions/_shared/stripe-event-ledger";

it("preserves the configured advanced tier through the actual subscription webhook", async () => {
  const settings = normalizePlatformProductSettings({ tiers: { advanced: { stripe_price_id: "price_syntheticCustom", monthly_price: 123 } } });
  expect(settings.tiers.advanced.stripe_price_id).toBe("price_syntheticCustom");
  const event = {
    id: "evt_synthetic_review",
    type: "customer.subscription.updated",
    created: 1_790_000_000,
    data: { object: {
      id: "sub_synthetic_review",
      metadata: { company_id: "00000000-0000-4000-8000-000000000001", tier: "advanced" },
      status: "active",
      items: { data: [{ price: { id: settings.tiers.advanced.stripe_price_id, product: "prod_synthetic_custom" } }] },
    } },
  };
  const durableCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = { rpc: async (name: string, args: Record<string, unknown>) => {
    durableCalls.push({ name, args });
    if (name === "stripe_claim_event_v2") return { data: "claimed", error: null };
    if (name === "stripe_apply_event_v2") return { data: "applied", error: null };
    throw new Error(`Unexpected durable operation ${name}`);
  }, from: (table: string) => ({
    select: () => table === "platform_product_settings_history" ? Promise.resolve({ data: [{ settings }], error: null }) : {
      eq: () => ({ maybeSingle: async () => ({ data: { settings, version: 2 }, error: null }) }),
    },
  }) };
  let handler!: (request: Request) => Promise<Response>;
  const network = vi.fn(() => { throw new Error("Network forbidden in independent QA"); });
  const source = readFileSync(new NodeURL("../../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("stripe-webhook.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isolated = ts.factory.updateSourceFile(parsed, parsed.statements.filter(statement => !ts.isImportDeclaration(statement)));
  const javascript = ts.transpileModule(ts.createPrinter().printFile(isolated), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(javascript, {
    exports: {}, Response, Request, crypto: webcrypto, console: { log: () => {} }, fetch: network,
    Deno: { env: { get: () => "synthetic-only" } },
    serve: (callback: typeof handler) => { handler = callback; },
    createClient: () => client,
    getSubscriptionTier,
    claimStripeEventV2, applyStripeEventV2, failStripeEventV2,
    Stripe: class { webhooks = { constructEventAsync: async () => event }; },
  });
  const response = await handler(new Request("http://localhost/synthetic-webhook", { method: "POST", headers: { "stripe-signature": "synthetic" }, body: "synthetic" }));
  expect(response.status).toBe(200);
  expect(durableCalls.map(call => call.name)).toEqual(["stripe_claim_event_v2", "stripe_apply_event_v2"]);
  expect(durableCalls[1].args).toMatchObject({ p_company_id: event.data.object.metadata.company_id, p_subscription_id: "sub_synthetic_review", p_status: "active", p_tier: "advanced" });
  expect(durableCalls[1].args.p_owner).toBe(durableCalls[0].args.p_owner);
  expect(network).not.toHaveBeenCalled();
});
