import assert from "node:assert/strict";
import { foreignAsaasBillingProfile, effectiveBillingCountryCode, ForeignBillingError } from "../_shared/fiscal-registration.ts";

const student = { country_code: "GB", full_name: "Synthetic Foreign", email: "fake@example.invalid", cpf: "AB123456", cep: "SW1A 1AA" };
Deno.test("foreign profile only emits documented customer fields, preserving domestic fiscal isolation", () => {
  assert.deepEqual(foreignAsaasBillingProfile(student, "true", "sandbox"), {
    name: student.full_name, email: student.email, foreignCustomer: true, notificationDisabled: true,
  });
  assert.equal(effectiveBillingCountryCode({ ...student, billing_country_code: "Portugal" }), "");
  for (const request of [{ installments: 2 }, { installmentCount: "1" }, { billingType: "PIX" }, { billingType: "BOLETO" }, { currency: "USD" }, { creditCard: {} }, { creditCardHolderInfo: {} }, { creditCardToken: "token" }]) {
    assert.throws(() => foreignAsaasBillingProfile(student, "true", "sandbox", request), ForeignBillingError);
  }
  assert.throws(() => foreignAsaasBillingProfile({ ...student, billing_country_code: "PT" }, "true", "sandbox"), /nome e e-mail/);
  for (const capability of [undefined, "false", "TRUE", "1"]) {
    assert.throws(() => foreignAsaasBillingProfile(student, capability, "sandbox"), /indisponível/);
  }
  assert.deepEqual(foreignAsaasBillingProfile(student, "true", "production"), foreignAsaasBillingProfile(student, "true", "sandbox"));
  assert.throws(() => foreignAsaasBillingProfile(student, "false", "production"), /indisponível/);
  assert.throws(() => foreignAsaasBillingProfile(student, "true", "unknown"), /indisponível/);
});

type Handler = (r: Request) => Promise<Response>;
Deno.test("actual hosted foreign checkout gates, reserves, recovers customers, reconciles retries and scopes renewal", async () => {
  const originalFetch = globalThis.fetch, originalServe = Deno.serve;
  const env = { SUPABASE_URL: "https://fixture.supabase.invalid", SUPABASE_ANON_KEY: "fake", SUPABASE_SERVICE_ROLE_KEY: "fake", ASAAS_API_KEY: "fake", ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3", ASAAS_FOREIGN_CUSTOMERS_ENABLED: "false" };
  const previous = Object.keys(env).map(k => [k, Deno.env.get(k)]);
  let handler!: Handler;
  let profile: any = { ...student, company_id: "company", selected_plan_id: "plan", asaas_customer_id: null };
  let order: any = null, customer: any = null, payment: any = null;
  let renewal: string | null = null, insertConflict = false, timeout = false, customerWriteFailure = false;
  let providerError = false, customerTimeout = false, customerClaimed = false;
  const traffic: { method: string; path: string; body: any }[] = [];
  const writes: string[] = [];
  try {
    for (const [k,v] of Object.entries(env)) Deno.env.set(k,v);
    Object.defineProperty(Deno, "serve", { value: (h: Handler) => { handler = h; } });
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method || "GET", body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.origin === "https://api-sandbox.asaas.com") {
        traffic.push({ method, path: url.pathname, body });
        assert.ok(order, "unique order must be reserved before provider side effects");
        if (url.pathname === "/v3/customers" && method === "GET") return Response.json({ data: customer ? [customer] : [] });
        if (url.pathname === "/v3/customers" && method === "POST") {
          customer = { ...body, id: "cus_fake" };
          if (customerTimeout) throw new TypeError("ambiguous customer timeout");
          return Response.json(customer);
        }
        if (url.pathname === "/v3/customers/cus_fake") return Response.json(customer);
        if (url.pathname === "/v3/payments" && method === "POST") {
          if (providerError) return Response.json({ errors: [{ code: "invalid_action", description: "Rejected fixture" }] }, { status: 400 });
          payment = { id: "pay_fake", customer: "cus_fake", status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/fake" };
          if (timeout) throw new TypeError("simulated ambiguous provider timeout");
          return Response.json(payment);
        }
        if (url.pathname === "/v3/payments/pay_fake") return Response.json(payment);
        if (url.pathname === "/v3/payments" && method === "GET") return Response.json({ data: payment ? [payment] : [] });
        throw new Error("Unexpected provider path");
      }
      assert.equal(url.origin, env.SUPABASE_URL, "no real network allowed");
      const table = url.pathname.replace("/rest/v1/", "");
      if (table === "public_payment_links") return method === "GET" ? Response.json([{ id: "link", student_id: "student", company_id: "company", expires_at: "2099-01-01", renewal_of_enrollment_id: renewal }]) : new Response(null, { status: 204 });
      if (table === "student_funnel_events") {
        if (method === "PATCH") return new Response(null, { status: 204 });
        assert.equal(body.event_key, "sett-foreign:company:student");
        if (customerClaimed) return Response.json({ code: "23505" }, { status: 409 });
        customerClaimed = true; return new Response(null, { status: 201 });
      }
      if (table === "students") {
        if (method === "GET") return Response.json(new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object") ? profile : [profile]);
        if (customerWriteFailure) return Response.json({ code: "fixture_failure", message: "failed" }, { status: 500 });
        Object.assign(profile, body); return new Response(null, { status: 204 });
      }
      if (table === "plans") return Response.json([{ id: "plan", company_id: "company", name: "Synthetic", price: 99, duration_weeks: 6, is_active: true, plan_kind: "standard" }]);
      if (table === "enrollments") return Response.json([{ id: renewal }]);
      if (table === "payments") {
        if (method === "POST") {
          writes.push("reserve");
          if (insertConflict) return Response.json({ code: "23505" }, { status: 409 });
          order = { ...body, id: "order", invoice_url: null }; return Response.json(order);
        }
        if (method === "PATCH") { Object.assign(order, body); return Response.json(order); }
        if (url.searchParams.has("or") || url.searchParams.has("status")) return Response.json([]);
        return Response.json(order ? [order] : []);
      }
      throw new Error(`Unexpected DB call: ${table}`);
    };
    await import("./index.ts");
    const invoke = (extra = {}) => handler(new Request("https://edge.invalid", { method: "POST", body: JSON.stringify({ action: "create-foreign-card-payment", checkoutToken: "00000000-0000-4000-8000-000000000001", planId: "plan", installmentCount: 1, ...extra }) }));
    const gated = await invoke(); assert.equal(gated.status, 503, JSON.stringify(await gated.json())); assert.equal(traffic.length, 0);
    Deno.env.set("ASAAS_FOREIGN_CUSTOMERS_ENABLED", "true");
    assert.equal((await invoke({ installmentCount: 2 })).status, 422);
    assert.equal((await invoke({ creditCard: { number: "never-forward" } })).status, 422);
    assert.equal(traffic.length, 0);
    const first = await invoke({ value: 0.01 }); assert.equal(first.status, 200);
    assert.equal((await first.json()).status, "PENDING");
    assert.deepEqual(traffic.find(t => t.method === "POST" && t.path.endsWith("customers"))?.body, { name: student.full_name, email: student.email, foreignCustomer: true, notificationDisabled: true, externalReference: "sett-foreign:company:student" });
    const charge = traffic.find(t => t.method === "POST" && t.path.endsWith("payments"))!.body;
    assert.equal(charge.value, 99); assert.equal(charge.billingType, "CREDIT_CARD");
    for (const key of ["creditCard", "creditCardHolderInfo", "cpfCnpj", "installmentCount", "remoteIp"]) assert.equal(key in charge, false);
    assert.equal(order.checkout_request_key.endsWith(":CREDIT_CARD:1"), true);
    assert.equal((await (await invoke()).json()).reused, true);
    assert.equal(traffic.filter(t => t.method === "POST" && t.path.endsWith("payments")).length, 1);
    // Recover provider-created charge after an ambiguous POST without another attempt.
    order = null; traffic.length = 0; timeout = true;
    assert.equal((await invoke()).status, 400);
    assert.equal(order.status, "RECONCILIATION_PENDING");
    assert.equal((await (await invoke()).json()).reconciled, true);
    assert.equal(traffic.filter(t => t.method === "POST" && t.path.endsWith("payments")).length, 1);
    // A previously created customer with a lost student link is found by scoped reference.
    timeout = false; order = null; payment = null; profile.asaas_customer_id = null; traffic.length = 0;
    assert.equal((await invoke()).status, 200);
    assert.equal(traffic.filter(t => t.method === "POST" && t.path.endsWith("customers")).length, 0);
    // A country/customer identity change cannot reuse the existing domestic invoice.
    customer.foreignCustomer = false;
    assert.equal((await invoke()).status, 409);
    customer.foreignCustomer = true;
    profile.asaas_customer_id = null;
    assert.equal((await invoke()).status, 409);
    profile.asaas_customer_id = "cus_fake";
    // Ambiguous CUSTOMER creation and failed local persist remain reserved for manual
    // reconciliation: automatic retries must never create another customer or charge.
    for (const failure of ["timeout", "persist"]) {
      order = null; payment = null; customer = null; profile.asaas_customer_id = null; traffic.length = 0;
      customerClaimed = false; customerTimeout = failure === "timeout"; customerWriteFailure = failure === "persist";
      const failed = await invoke(); assert.equal(failed.status, failure === "timeout" ? 400 : 500);
      assert.equal(order.status, "RECONCILIATION_PENDING");
      customerTimeout = false; customerWriteFailure = false;
      assert.equal((await invoke()).status, 409);
      assert.equal(traffic.filter(t => t.method === "POST" && t.path.endsWith("customers")).length, 1);
      assert.equal(traffic.filter(t => t.method === "POST" && t.path.endsWith("payments")).length, 0);
    }
    profile.asaas_customer_id = "cus_fake";
    // Lost unique reservation never calls the provider, including customer creation.
    order = null; insertConflict = true; traffic.length = 0;
    assert.equal((await invoke()).status, 409); assert.equal(traffic.length, 0); insertConflict = false;
    // A different checkout can reserve its order, but loses the per-student customer
    // claim and must not POST another customer even if provider lookup is still empty.
    order = null; customer = null; profile.asaas_customer_id = null; customerClaimed = true; traffic.length = 0;
    assert.equal((await invoke()).status, 409);
    assert.equal(traffic.some(t => t.method === "POST"), false);
    customer = { id: "cus_fake", name: student.full_name, email: student.email, foreignCustomer: true, externalReference: "sett-foreign:company:student" };
    profile.asaas_customer_id = "cus_fake";
    // Existing domestic or mismatched customer cannot be silently converted.
    customer.foreignCustomer = false; order = null; traffic.length = 0;
    assert.equal((await invoke()).status, 409);
    assert.equal(traffic.some(t => t.method === "POST" && t.path.endsWith("payments")), false);
    customer.foreignCustomer = true;
    // Renewal persists origin and uses one key independent of method choice.
    renewal = "enrollment"; order = null; traffic.length = 0;
    assert.equal((await invoke()).status, 200);
    assert.equal(order.renewal_of_enrollment_id, "enrollment"); assert.ok(order.checkout_request_key.endsWith(":renewal"));
    order.installment_count = 2;
    assert.equal((await invoke()).status, 409);
    // Definitive provider rejection is local fixture evidence only, not external canary proof.
    renewal = null; order = null; providerError = true;
    assert.equal((await invoke()).status, 422); assert.equal(order.status, "FAILED");
    assert.equal(order.checkout_request_key, null);
    // Production stays blocked while its explicit capability remains off.
    Deno.env.set("ASAAS_BASE_URL", "https://api.asaas.com/v3"); Deno.env.set("ASAAS_FOREIGN_CUSTOMERS_ENABLED", "false"); traffic.length = 0;
    assert.equal((await invoke()).status, 503); assert.equal(traffic.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(Deno, "serve", { value: originalServe });
    for (const [k,v] of previous) { if (v === undefined) Deno.env.delete(k!); else Deno.env.set(k!,v); }
  }
});
