import { processSession } from "./index.ts";

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

Deno.test("weekly automation provider errors do not expose raw provider bodies", async () => {
  const queries: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        order: () => query,
        limit: () => query,
        insert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        single: async () => {
          queries.push({ table, filters: { ...filters } });
          if (table === "whatsapp_chats") {
            return {
              data: {
                id: "chat-safe",
                company_id: "company-a",
                instance_id: "instance-a",
                remote_jid: "5548991432057@s.whatsapp.net",
                student_id: "student-a",
              },
              error: null,
            };
          }
          return { data: null, error: new Error(`unexpected single ${table}`) };
        },
        maybeSingle: async () => {
          queries.push({ table, filters: { ...filters } });
          if (table === "students") {
            return {
              data: { id: "student-a", phone: "+55 (48) 99143-2057", whatsapp: null },
              error: null,
            };
          }
          if (table === "whatsapp_instances") {
            return {
              data: { instance_name: "instance-a", status: "connected" },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      if (table === "automation_flow_nodes") {
        const nodesQuery = {
          select: () => nodesQuery,
          eq: () => Promise.resolve({
            data: [{
              id: "content-a",
              flow_id: "flow-a",
              node_type: "content",
              data: { message: "Olá {{primeiro_nome}}", wait_for_reply: false },
            }],
            error: null,
          }),
        };
        return nodesQuery;
      }
      if (table === "automation_flow_edges") {
        const edgesQuery = {
          select: () => edgesQuery,
          eq: () => Promise.resolve({ data: [], error: null }),
        };
        return edgesQuery;
      }
      return query;
    },
  };

  const unsafeProviderBody =
    "phone 5548991432057@s.whatsapp.net token=raw-token secret=provider-secret";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(unsafeProviderBody, { status: 502 }))) as typeof fetch;

  try {
    let message = "";
    try {
      await processSession(
        admin,
        {
          id: "session-a",
          flow_id: "flow-a",
          chat_id: "chat-safe",
          current_node_id: "content-a",
          context: { student_id: "student-a", trigger_type: "weekly_contact" },
        },
        { url: "https://provider.invalid", key: "redacted" },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (!message.includes("provider_status_502:whatsapp_provider_failure")) {
      throw new Error(`missing sanitized provider status: ${message}`);
    }
    for (const leaked of ["99143", "@s.whatsapp.net", "raw-token", "secret"]) {
      if (message.toLowerCase().includes(leaked)) throw new Error(`leaked ${leaked}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
