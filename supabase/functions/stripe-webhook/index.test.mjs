import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
export function harness(
  {
    type = "customer.subscription.deleted",
    rpcError = false,
    claim = "claimed",
    invalidSignature = false,
    rows = [],
    catalogError = false,
    claimError = false,
    applyResult = "applied",
    failError = false,
  } = {},
) {
  let handler;
  const calls = [];
  let providerCalls = 0;
  const subscription = {
    id: "sub_synthetic",
    metadata: { company_id: "00000000-0000-4000-8000-000000000001" },
    status: "active",
    items: { data: [{ price: { id: "price_synthetic" } }] },
  };
  const event = {
    id: "evt_synthetic",
    created: 1800000000,
    type,
    data: {
      object: type === "checkout.session.completed"
        ? { metadata: subscription.metadata, subscription: "sub_synthetic" }
        : type === "invoice.payment_failed"
        ? { subscription: "sub_synthetic" }
        : subscription,
    },
  };
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        name,
        error: (rpcError && name.includes("apply")) ||
            (claimError && name.includes("claim")) ||
            (failError && name.includes("fail"))
          ? { message: "synthetic failure" }
          : null,
        data: name.includes("claim")
          ? claim
          : name.includes("apply")
          ? applyResult
          : true,
      };
    },
    from: (table) => ({
      insert: async () => ({ error: null }),
      update: () => {
        const q = {
          eq: () => q,
          then: (resolve) =>
            Promise.resolve({
              error: rpcError ? { message: "synthetic failure" } : null,
            }).then(resolve),
        };
        return q;
      },
      select: () => {
        const q = {
          eq: () => q,
          then: (resolve) =>
            Promise.resolve({
              data: rows,
              error: rpcError ? { message: "synthetic failure" } : null,
            }).then(resolve),
        };
        return q;
      },
    }),
  };
  const stubs = {
    serve: (callback) => handler = callback,
    Stripe: class {
      webhooks = {
        constructEventAsync: async () => {
          if (invalidSignature) throw Error("signature");
          return event;
        },
      };
      subscriptions = {
        retrieve: async () => {
          providerCalls++;
          return subscription;
        },
      };
    },
    createClient: () => client,
    getSubscriptionTier: async () => {
      if (catalogError) throw Error("catalog");
      return "advanced";
    },
  };
  function load(path) {
    const source = readFileSync(path, "utf8");
    const javascript = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const exports = {};
    vm.runInNewContext(javascript, {
      exports,
      require: (specifier) =>
        specifier.includes("stripe-catalog-policy")
          ? stubs
          : specifier.startsWith(".")
          ? load(new URL(specifier, path))
          : { ...stubs, default: stubs.Stripe },
      Response,
      Request,
      crypto: webcrypto,
      console: { log() {} },
      Deno: { env: { get: () => "synthetic-only" } },
      fetch: () => {
        throw Error("network forbidden");
      },
    });
    return exports;
  }
  load(new URL("./index.ts", import.meta.url));
  return {
    event,
    calls,
    providerCalls: () => providerCalls,
    run: () =>
      handler(
        new Request("http://localhost/synthetic", {
          method: "POST",
          headers: { "stripe-signature": "synthetic" },
          body: "synthetic",
        }),
      ),
  };
}
test("cancel persistence error must never return 200", async () => {
  const h = harness({ rpcError: true });
  assert.equal((await h.run()).status, 500);
});
test("claim busy is retryable, completed duplicate is acknowledged", async () => {
  for (
    const [claim, status] of [["busy", 503], ["completed", 200], [
      "reconcile",
      503,
    ]]
  ) {
    const h = harness({ claim });
    assert.equal((await h.run()).status, status);
    assert.ok(!h.calls.some((c) => c.name.includes("apply")));
  }
});
test("signature failure cannot claim, mutate or fail a ledger row", async () => {
  const h = harness({ invalidSignature: true });
  assert.equal((await h.run()).status, 400);
  assert.equal(h.calls.length, 0);
});
test("completion RPC contains tenant, subscription and owner; no separate completion write", async () => {
  const h = harness();
  assert.equal((await h.run()).status, 200);
  const claim = h.calls.find((c) => c.name.includes("claim")),
    apply = h.calls.find((c) => c.name.includes("apply"));
  assert.ok(claim);
  assert.equal(apply.args.p_owner, claim.args.p_owner);
  assert.equal(
    apply.args.p_company_id,
    h.event.data.object.metadata.company_id,
  );
  assert.equal(apply.args.p_subscription_id, "sub_synthetic");
  assert.equal(apply.args.p_status, "canceled");
  assert.equal(apply.args.p_tier, "basic");
  assert.equal(h.providerCalls(), 0);
});
test("invoice must resolve exactly one billing tenant; lookup failure is retryable", async () => {
  for (const rows of [[], [{ company_id: "a" }, { company_id: "b" }]]) {
    const h = harness({ type: "invoice.payment_failed", rows });
    assert.equal((await h.run()).status, 500);
    assert.ok(!h.calls.some((c) => c.name.includes("apply")));
  }
});
test("failure release stays owner fenced and stores no provider error details", async () => {
  const h = harness({ catalogError: true });
  assert.equal((await h.run()).status, 500);
  const claim = h.calls.find((c) => c.name.includes("claim")),
    failed = h.calls.find((c) => c.name.includes("fail"));
  assert.ok(failed);
  assert.equal(failed.args.p_owner, claim.args.p_owner);
  assert.deepEqual(Object.keys(failed.args).sort(), ["p_event_id", "p_owner"]);
});

test("claim DB failure cannot release another worker or perform effects", async () => {
  const h = harness({ claimError: true });
  assert.equal((await h.run()).status, 500);
  assert.equal(h.calls.length, 1);
});
test("malformed atomic ACK is never accepted", async () => {
  for (const applyResult of [null, [], {}, false]) {
    const h = harness({ applyResult });
    assert.equal((await h.run()).status, 500);
  }
});
test("failed release is surfaced as failure and leaves durable recovery to lease", async () => {
  const h = harness({ catalogError: true, failError: true });
  assert.equal((await h.run()).status, 500);
  assert.ok(h.calls.some((c) => c.name.includes("fail")));
});
test("new and expanded invoice references resolve one tenant without provider calls", async () => {
  for (const reference of ["sub_synthetic", { id: "sub_synthetic" }]) {
    const h = harness({
      type: "invoice.payment_failed",
      rows: [{ company_id: "00000000-0000-4000-8000-000000000001" }],
    });
    h.event.data.object = {
      parent: { subscription_details: { subscription: reference } },
    };
    assert.equal((await h.run()).status, 200);
    const apply = h.calls.find((c) => c.name.includes("apply"));
    assert.equal(apply.args.p_status, "past_due");
    assert.equal(apply.args.p_tier, null);
    assert.equal(h.providerCalls(), 0);
  }
});
