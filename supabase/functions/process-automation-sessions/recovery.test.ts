import { sendText } from "./index.ts";
import { fencedDispatchUpdate } from "../_shared/automation-recovery.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function fixture(kind: "flow" | "intercycle" = "flow") {
  let state: string | null = null;
  let features = true;
  let featureError = false;
  let lease = true;
  let ackFailure = false;
  let projections = 0;
  let beginCalls = 0;
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "service_company_feature_allowed") {
        equal(args._company_id, "company");
        return { data: features, error: featureError ? { message: "synthetic unavailable" } : null };
      }
      equal(args._kind, kind); equal(args._owner_id, "owner"); equal(args._lease_token, "lease");
      if (name === "prepare_automation_dispatch") {
        beginCalls++;
        if (!lease) return { error: { message: "dispatch_lease_lost" } };
        if (state === "in_flight") return { error: { message: "dispatch_uncertain" } };
        if (state === "acked") return { data: "acked", error: null };
        state = "prepared";
        return { data: state, error: null };
      }
      if (name === "authorize_automation_dispatch") {
        if (!lease) return { error: { message: "dispatch_lease_lost" } };
        state = "in_flight";
        return { error: null };
      }
      if (name === "ack_automation_dispatch") {
        if (!lease || ackFailure) return { error: { message: "synthetic checkpoint failure" } };
        equal(args._provider_message_id, "valid-receipt"); state = "acked";
        return { error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from() { return { insert() { projections++; throw new Error("synthetic projection outage"); } }; },
  };
  const args = {
    admin, evoUrl: "https://provider.invalid", evoKey: "synthetic", instanceName: "synthetic",
    remoteJid: "5548999999999@s.whatsapp.net", chatId: "chat", companyId: "company", text: "Synthetic",
    attempt: { kind, owner: { id: "owner", dispatch_lease_token: "lease" }, key: "node" },
  };
  return { args, state: () => state, projections: () => projections, begins: () => beginCalls,
    deny: () => { features = false; }, unavailable: () => { featureError = true; },
    expire: () => { lease = false; }, failAck: () => { ackFailure = true; } };
}
async function code(run: () => Promise<unknown>) {
  try { await run(); return "success"; } catch (error) { return (error as Error).message; }
}

for (const kind of ["flow", "intercycle"] as const) {
  for (const outcome of ["503", "timeout", "malformed", "no-receipt", "blank-receipt", "ack-write-fails"]) {
    Deno.test(`${kind}: ${outcome} parks the attempt and a retry cannot call provider`, async () => {
      const f = fixture(kind); let calls = 0;
      if (outcome === "ack-write-fails") f.failAck();
      const original = globalThis.fetch;
      globalThis.fetch = (async () => {
        calls++;
        if (outcome === "timeout") throw new DOMException("synthetic", "TimeoutError");
        if (outcome === "503") return new Response("provider accepted before 503", { status: 503 });
        if (outcome === "malformed") return new Response("{bad");
        return Response.json(outcome === "no-receipt" ? {} : { key: { id: outcome === "blank-receipt" ? " " : "valid-receipt" } });
      }) as typeof fetch;
      try {
        equal(await code(() => sendText(f.args)), "dispatch_uncertain");
        equal(f.state(), "in_flight");
        equal(await code(() => sendText(f.args)), "dispatch_uncertain");
        equal(calls, 1); equal(f.projections(), 0);
      } finally { globalThis.fetch = original; }
    });
  }
  Deno.test(`${kind}: projection fails after durable ACK; replay skips provider and projection`, async () => {
    const f = fixture(kind); let calls = 0; const original = globalThis.fetch;
    globalThis.fetch = (() => { calls++; return Promise.resolve(Response.json({ key: { id: "valid-receipt" } })); }) as typeof fetch;
    try {
      await sendText(f.args); equal(f.state(), "acked"); equal(f.projections(), 1);
      await sendText(f.args); equal(calls, 1); equal(f.projections(), 1);
    } finally { globalThis.fetch = original; }
  });
  for (const unavailable of [false,true]) Deno.test(`${kind}: feature ${unavailable ? 'lookup failure' : 'denial'} blocks before attempt/provider`, async () => {
    const f = fixture(kind);
    if (unavailable) f.unavailable(); else f.deny();
    const original = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("provider must not run"); }) as typeof fetch;
    try {
      equal(await code(() => sendText(f.args)), unavailable ? "company_feature_unavailable" : "company_feature_denied");
      equal(f.begins(), 0); equal(f.state(), null);
    } finally { globalThis.fetch = original; }
  });
  Deno.test(`${kind}: lease expires during preparation; immediate authorization prevents request`, async () => {
    const f = fixture(kind); let calls = 0; const original = globalThis.fetch;
    globalThis.fetch = (() => { calls++; throw new Error("stale worker sent"); }) as typeof fetch;
    try {
      equal(await code(() => sendText({ ...f.args, prepare: async () => { f.expire(); } })), "dispatch_lease_lost");
      equal(calls, 0); equal(f.state(), "prepared");
    } finally { globalThis.fetch = original; }
  });
}
Deno.test("failed preparation can retry without a provider call before authorization", async () => {
  const f = fixture(); let calls = 0; const original = globalThis.fetch;
  globalThis.fetch = (() => { calls++; return Promise.resolve(Response.json({ key: { id: "valid-receipt" } })); }) as typeof fetch;
  try {
    equal(await code(() => sendText({ ...f.args, prepare: async () => { throw new Error("synthetic_preflight"); } })), "synthetic_preflight");
    equal(calls, 0); equal(f.state(), "prepared");
    await sendText(f.args);
    equal(calls, 1); equal(f.state(), "acked");
  } finally { globalThis.fetch = original; }
});
Deno.test('fenced checkpoint delegates to authoritative DB clock and fails closed on refusal', async () => {
  let request: unknown;
  const admin={rpc:(name:string,args:unknown)=>{
    equal(name,'checkpoint_automation_dispatch'); request=args;
    return Promise.resolve({data:null,error:{message:'dispatch_lease_lost'}});
  }};
  equal(await code(() => fencedDispatchUpdate(admin, 'flow', { id:'owner',dispatch_lease_token:'lease' }, { status:'completed' })), 'dispatch_lease_lost');
  equal(request, {_kind:'flow',_owner_id:'owner',_lease_token:'lease',_patch:{status:'completed'}});
});
