import { executeFlow } from "./index.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

for (const lookupError of [false, true]) {
  Deno.test(`webhook flow rejects ${lookupError ? "unavailable" : "denied"} entitlement before reading flow`, async () => {
    let reads = 0;
    const admin = {
      rpc: () => Promise.resolve({ data: false, error: lookupError ? { code: "unavailable" } : null }),
      from: () => { reads++; throw new Error("flow must not be read"); },
    };
    let rejected = false;
    try {
      await executeFlow(admin, "company-a", "synthetic@s.whatsapp.net", "chat-a", "instance-a",
        "http://127.0.0.1:1", {}, "flow-a", "node-a", { _dispatch_student_id: null }, false);
    } catch (error) {
      rejected = error instanceof Error && error.message ===
        (lookupError ? "company_feature_unavailable" : "company_feature_denied");
    }
    assert(rejected, "flow was not denied with the authoritative policy error");
    assert(reads === 0, "policy denial must precede flow business reads");
  });
}

Deno.test("webhook rechecks revoked commercial permission immediately before outbound I/O", async () => {
  let checks = 0;
  let providerCalls = 0;
  let writes = 0;
  const admin = {
    rpc: (_name: string, args: { _company_id: string; _feature: string }) => {
      assert(args._company_id === "company-a", "tenant must be resolved by caller");
      checks++;
      return Promise.resolve({ data: checks <= 2, error: null });
    },
    from: (table: string) => {
      const result = { data: table === "automation_flows" ? { id: "flow-a" }
        : table === "automation_flow_nodes" ? [{ id: "node-a", node_type: "content", data: { message: "Synthetic only" } }]
        : [], error: null };
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        insert: () => { writes++; throw new Error("no writes after revocation"); },
      };
      return query;
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (() => { providerCalls++; throw new Error("no external I/O authorized"); }) as typeof fetch;
  let rejected = false;
  try {
    await executeFlow(admin, "company-a", "synthetic@s.whatsapp.net", "chat-a", "instance-a",
      "http://127.0.0.1:1", {}, "flow-a", "node-a", { _dispatch_student_id: null }, false);
  } catch (error) {
    rejected = error instanceof Error && error.message === "company_feature_denied";
  } finally {
    globalThis.fetch = original;
  }
  assert(rejected, "revoked policy must terminate flow rather than continue after swallowed send error");
  assert(checks === 3 && providerCalls === 0 && writes === 0, "revocation must prevent provider request and completion writes");
});
