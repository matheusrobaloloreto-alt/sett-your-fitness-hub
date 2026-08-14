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
