import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { URL as NodeURL } from "node:url";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { normalizePlatformProductSettings } from "../../supabase/functions/_shared/platform-product-settings";
import { getSubscriptionTier } from "../../supabase/functions/_shared/stripe-catalog-policy";

it("preserves the configured advanced tier through the actual subscription webhook", async () => {
  const settings = normalizePlatformProductSettings({ tiers: { advanced: { stripe_price_id: "price_syntheticCustom", monthly_price: 123 } } });
  expect(settings.tiers.advanced.stripe_price_id).toBe("price_syntheticCustom");
  const event = {
    id: "evt_synthetic_review",
    type: "customer.subscription.updated",
    data: { object: {
      metadata: { company_id: "00000000-0000-4000-8000-000000000001", tier: "advanced" },
      status: "active",
      items: { data: [{ price: { id: settings.tiers.advanced.stripe_price_id, product: "prod_synthetic_custom" } }] },
    } },
  };
  const updates: Array<{ table: string; value: unknown }> = [];
  const client = { from: (table: string) => ({
    select: () => table === "platform_product_settings_history" ? Promise.resolve({ data: [{ settings }], error: null }) : {
      eq: () => ({ maybeSingle: async () => ({ data: { settings, version: 2 }, error: null }) }),
    },
    insert: async () => ({ error: null }),
    update: (value: unknown) => {
      updates.push({ table, value });
      const query = { eq: () => query, then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve) };
      return query;
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
    exports: {}, Response, Request, console: { log: () => {} }, fetch: network,
    Deno: { env: { get: () => "synthetic-only" } },
    serve: (callback: typeof handler) => { handler = callback; },
    createClient: () => client,
    getSubscriptionTier,
    Stripe: class { webhooks = { constructEventAsync: async () => event }; },
  });
  const response = await handler(new Request("http://localhost/synthetic-webhook", { method: "POST", headers: { "stripe-signature": "synthetic" }, body: "synthetic" }));
  expect(response.status).toBe(200);
  expect(updates.find(update => update.table === "companies")?.value).toEqual({ subscription_status: "active", tier: "advanced" });
  expect(network).not.toHaveBeenCalled();
});
