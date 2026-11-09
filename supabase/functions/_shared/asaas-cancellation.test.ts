import assert from "node:assert/strict";

type Handler = (request: Request) => Response | Promise<Response>;
const paymentId = "pay_synthetic";
const checkoutToken = "00000000-0000-4000-8000-000000000001";
const webhookToken = "fixture-webhook";
const env = {
  SUPABASE_URL: "https://fixture.supabase.invalid",
  SUPABASE_ANON_KEY: "fixture-anon",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
  ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3",
  ASAAS_API_KEY: "fixture-asaas",
  ASAAS_WEBHOOK_TOKEN: webhookToken,
};

Deno.test("Asaas deletion and refund requests affect only the charge, while a full refund uses the scoped RPC", async () => {
  const handlers: Handler[] = [];
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const previousEnv = Object.keys(env).map((key) =>
    [key, Deno.env.get(key)] as const
  );
  const eventStatuses = new Map<string, string>();
  const paymentWrites: string[] = [];
  const reversals: unknown[] = [];
  const unexpected: string[] = [];
  let remote: { status: string; deleted?: boolean } = { status: "DELETED" };
  let localStatus = "PENDING";

  try {
    for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
    Object.defineProperty(Deno, "serve", {
      value: (handler: Handler) => handlers.push(handler),
    });
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (
        url.origin === "https://api-sandbox.asaas.com" &&
        url.pathname === `/v3/payments/${paymentId}` && method === "GET"
      ) {
        return Response.json({ id: paymentId, ...remote });
      }
      assert.equal(url.origin, env.SUPABASE_URL);
      const resource = url.pathname.replace("/rest/v1/", "");
      const eventId = url.searchParams.get("event_id")?.slice(3) ??
        body.event_id;
      if (resource === "integration_webhook_events" && method === "POST") {
        if (eventStatuses.has(eventId)) {
          return Response.json({ code: "23505" }, { status: 409 });
        }
        eventStatuses.set(eventId, body.status);
        return new Response(null, { status: 201 });
      }
      if (resource === "integration_webhook_events" && method === "GET") {
        return Response.json([{ status: eventStatuses.get(eventId) }]);
      }
      if (resource === "integration_webhook_events" && method === "PATCH") {
        eventStatuses.set(eventId, body.status);
        return new Response(null, { status: 204 });
      }
      if (resource === "public_payment_links" && method === "GET") {
        assert.equal(url.searchParams.get("token"), `eq.${checkoutToken}`);
        return Response.json([{
          id: "link",
          student_id: "student",
          company_id: "company",
          expires_at: "2099-01-01",
        }]);
      }
      if (resource === "public_payment_links" && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      if (resource === "payments") {
        assert.equal(
          url.searchParams.get("asaas_payment_id"),
          `eq.${paymentId}`,
        );
        if (method === "GET") return Response.json([{ id: "order" }]);
        assert.equal(method, "PATCH");
        localStatus = body.status;
        paymentWrites.push(localStatus);
        // The cancelled order never funded an enrollment. The active enrollment is separate.
        return Response.json({
          student_id: "student",
          company_id: "company",
          plan_id: "plan",
          enrollment_id: null,
          status: localStatus,
        });
      }
      if (
        resource === "rpc/apply_asaas_payment_reversal" && method === "POST"
      ) {
        reversals.push(body);
        return Response.json(null);
      }
      if (resource === "students" && method === "GET") {
        return Response.json([{ company_id: "company" }]);
      }
      unexpected.push(`${method} ${resource}`);
      throw new Error("Unexpected provider or lifecycle request");
    };

    await import("../asaas-webhook/index.ts");
    await import("../asaas-integration/index.ts");
    const [webhook, checkout] = handlers;
    const invoke = (handler: Handler, body: unknown) =>
      handler(
        new Request("https://edge.invalid", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "asaas-access-token": webhookToken,
          },
          body: JSON.stringify(body),
        }),
      );
    const deletion = {
      id: "event-delete",
      event: "PAYMENT_DELETED",
      payment: { id: paymentId, status: "PENDING" },
    };
    assert.equal((await invoke(webhook, deletion)).status, 200);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(await (await invoke(webhook, deletion)).json(), {
      received: true,
      duplicate: true,
    });
    assert.deepEqual(paymentWrites, ["DELETED"]);
    assert.equal(eventStatuses.get(deletion.id), "completed");

    remote = { status: "OVERDUE", deleted: true };
    const lookup = await invoke(checkout, {
      action: "get-payment-status",
      checkoutToken,
      paymentId,
    });
    assert.equal(lookup.status, 200);
    assert.equal((await lookup.json()).status, "DELETED");
    assert.equal(localStatus, "DELETED");
    assert.deepEqual(unexpected, []);

    // A late deletion notification must use the verified current Asaas state.
    remote = { status: "PENDING", deleted: false };
    assert.equal(
      (await invoke(webhook, { ...deletion, id: "late-deletion" })).status,
      200,
    );
    assert.equal(localStatus, "PENDING");
    assert.deepEqual(reversals, []);

    remote = { status: "REFUND_REQUESTED" };
    assert.equal(
      (await invoke(webhook, {
        ...deletion,
        id: "refund-request",
        event: "PAYMENT_UPDATED",
      })).status,
      200,
    );
    assert.equal(localStatus, "REFUND_REQUESTED");
    assert.deepEqual(reversals, []);

    remote = { status: "REFUNDED", deleted: true };
    const refund = {
      ...deletion,
      id: "refund-complete",
      event: "PAYMENT_REFUNDED",
    };
    assert.equal((await invoke(webhook, refund)).status, 200);
    assert.deepEqual(await (await invoke(webhook, refund)).json(), {
      received: true,
      duplicate: true,
    });
    assert.equal(localStatus, "REFUNDED");
    assert.deepEqual(reversals, [{
      _asaas_payment_id: paymentId,
      _company_id: "company",
      _expected_status: "REFUNDED",
    }]);
    assert.deepEqual(unexpected, []);
  } finally {
    Object.defineProperty(Deno, "serve", { value: originalServe });
    globalThis.fetch = originalFetch;
    for (const [key, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
