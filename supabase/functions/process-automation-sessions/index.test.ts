import { handleAutomationRequest, processSession } from "./index.ts";

function resultQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => result,
    maybeSingle: async () => result,
  };
  return query;
}

Deno.test("weekly automation blocks a phone-mismatched chat before provider fetch", async () => {
  const accessedTables: string[] = [];
  const admin = {
    from(table: string) {
      accessedTables.push(table);
      if (table === "whatsapp_chats") {
        return resultQuery({
          data: {
            id: "chat-corrupted",
            company_id: "company-a",
            instance_id: "instance-a",
            remote_jid: "5511999999999@s.whatsapp.net",
            student_id: "student-a",
          },
          error: null,
        });
      }
      if (table === "students") {
        return resultQuery({
          data: {
            id: "student-a",
            phone: "+55 (48) 99143-2057",
            whatsapp: null,
          },
          error: null,
        });
      }
      throw new Error(
        `unsafe query reached after recipient mismatch: ${table}`,
      );
    },
  };

  const originalFetch = globalThis.fetch;
  let providerFetches = 0;
  globalThis.fetch = (() => {
    providerFetches += 1;
    throw new Error("provider fetch must not run");
  }) as typeof fetch;

  try {
    let blocked = false;
    try {
      await processSession(
        admin,
        {
          id: "session-a",
          flow_id: "flow-a",
          chat_id: "chat-corrupted",
          current_node_id: "content-a",
          context: { student_id: "student-a", trigger_type: "weekly_contact" },
        },
        { url: "https://provider.invalid", key: "redacted" },
      );
    } catch (error) {
      blocked = error instanceof Error &&
        error.message.includes("whatsapp_stored_recipient_mismatch") &&
        error.message.includes("bloqueado para revisão");
    }
    if (!blocked) {
      throw new Error("mismatched weekly automation was not blocked");
    }
    if (providerFetches !== 0) {
      throw new Error("provider was called before identity verification");
    }
    if (accessedTables.join(",") !== "whatsapp_chats,students") {
      throw new Error(
        `unexpected queries before block: ${accessedTables.join(",")}`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("controlled weekly dispatch claims only the requested session and never scans global triggers", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    url: Deno.env.get("SUPABASE_URL"),
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    cron: Deno.env.get("AUTOMATION_CRON_SECRET"),
    test: Deno.env.get("AUTOMATION_TEST_SECRET"),
  };
  const requestedSessionId = "00000000-0000-4000-8000-000000000123";
  const rpcCalls: Array<{ path: string; body: unknown }> = [];

  Deno.env.set("SUPABASE_URL", "https://staging-project.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  Deno.env.set("AUTOMATION_CRON_SECRET", "cron-secret");
  Deno.env.set("AUTOMATION_TEST_SECRET", "test-secret");

  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    rpcCalls.push({ path: url.pathname, body });
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await handleAutomationRequest(new Request("https://edge.invalid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": "cron-secret",
        "x-test-secret": "test-secret",
      },
      body: JSON.stringify({ mode: "controlled_test", session_id: requestedSessionId }),
    }));

    if (response.status !== 404) {
      throw new Error(`expected absent controlled session to return 404, got ${response.status}`);
    }
    if (rpcCalls.length !== 1) {
      throw new Error(`expected one isolated RPC, got ${rpcCalls.length}`);
    }
    if (rpcCalls[0].path !== "/rest/v1/rpc/claim_automation_session") {
      throw new Error(`unexpected RPC path: ${rpcCalls[0].path}`);
    }
    if (JSON.stringify(rpcCalls[0].body) !== JSON.stringify({ _session_id: requestedSessionId })) {
      throw new Error(`unexpected controlled claim body: ${JSON.stringify(rpcCalls[0].body)}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      SUPABASE_URL: originalEnv.url,
      SUPABASE_SERVICE_ROLE_KEY: originalEnv.key,
      AUTOMATION_CRON_SECRET: originalEnv.cron,
      AUTOMATION_TEST_SECRET: originalEnv.test,
    })) {
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});

Deno.test("controlled weekly dispatch fails closed if the claim returns more than one session", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    url: Deno.env.get("SUPABASE_URL"),
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    cron: Deno.env.get("AUTOMATION_CRON_SECRET"),
    test: Deno.env.get("AUTOMATION_TEST_SECRET"),
  };
  const requestedSessionId = "00000000-0000-4000-8000-000000000124";
  const claimedSession = {
    id: requestedSessionId,
    flow_id: "00000000-0000-4000-8000-000000000201",
    chat_id: "00000000-0000-4000-8000-000000000301",
    current_node_id: "00000000-0000-4000-8000-000000000401",
    context: { trigger_type: "weekly_contact", controlled_test: true },
  };
  let fetchCalls = 0;

  Deno.env.set("SUPABASE_URL", "https://staging-project.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  Deno.env.set("AUTOMATION_CRON_SECRET", "cron-secret");
  Deno.env.set("AUTOMATION_TEST_SECRET", "test-secret");

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify([claimedSession, {
      ...claimedSession,
      id: "00000000-0000-4000-8000-000000000125",
    }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await handleAutomationRequest(new Request("https://edge.invalid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": "cron-secret",
        "x-test-secret": "test-secret",
      },
      body: JSON.stringify({ mode: "controlled_test", session_id: requestedSessionId }),
    }));

    if (response.status !== 409) {
      throw new Error(`expected non-unique controlled claim to return 409, got ${response.status}`);
    }
    if (fetchCalls !== 1) {
      throw new Error(`expected no downstream query after non-unique claim, got ${fetchCalls} fetches`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      SUPABASE_URL: originalEnv.url,
      SUPABASE_SERVICE_ROLE_KEY: originalEnv.key,
      AUTOMATION_CRON_SECRET: originalEnv.cron,
      AUTOMATION_TEST_SECRET: originalEnv.test,
    })) {
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
