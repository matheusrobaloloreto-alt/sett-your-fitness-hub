import { processIntercycleAnamnesisDeliveries, processSession } from "./index.ts";

const directDigits = (area: string, digit: string) => ["55", area, "9", digit.repeat(8)].join("");
const directJid = (area: string, digit: string) => `${directDigits(area, digit)}@s.whatsapp.net`;
const formattedMobile = (area: string, digit: string) => `+55 (${area}) 9${digit.repeat(4)}-${digit.repeat(4)}`;
const verifiedJid = directJid("48", "7");

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
    rpc: (name: string) => {
      if (name === "weekly_contact_consent_is_current") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
    from(table: string) {
      accessedTables.push(table);
      if (table === "whatsapp_chats") {
        return resultQuery({
          data: {
            id: "chat-corrupted",
            company_id: "company-a",
            instance_id: "instance-a",
            remote_jid: directJid("11", "8"),
            student_id: "student-a",
          },
          error: null,
        });
      }
      if (table === "students") {
        return resultQuery({
          data: {
            id: "student-a",
            phone: formattedMobile("48", "7"),
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
          context: {
            student_id: "student-a",
            trigger_type: "weekly_contact",
            recipient_candidate: directJid("11", "8"),
          },
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
    rpc: (name: string) => {
      if (name === "weekly_contact_consent_is_current") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
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
                remote_jid: verifiedJid,
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
              data: { id: "student-a", phone: formattedMobile("48", "7"), whatsapp: null },
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
    `phone ${verifiedJid} token=raw-token secret=provider-secret`;
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
          context: {
            student_id: "student-a",
            trigger_type: "weekly_contact",
            recipient_candidate: verifiedJid,
          },
        },
        { url: "https://provider.invalid", key: "redacted" },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (!message.includes("provider_status_502:whatsapp_provider_failure")) {
      throw new Error(`missing sanitized provider status: ${message}`);
    }
    for (const leaked of [verifiedJid.slice(4, 9), "@s.whatsapp.net", "raw-token", "secret"]) {
      if (message.toLowerCase().includes(leaked)) throw new Error(`leaked ${leaked}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("weekly automation blocks a revocation that lands after claim but before provider send", async () => {
  const accessedTables: string[] = [];
  let consentChecks = 0;
  let providerFetches = 0;
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name !== "weekly_contact_consent_is_current") throw new Error(`unexpected rpc ${name}`);
      if (
        args._student_id !== "student-a" ||
        args._company_id !== "company-a" ||
        args._recipient_candidate !== verifiedJid
      ) {
        throw new Error("consent lookup lost student/company/recipient binding");
      }
      consentChecks += 1;
      return Promise.resolve({ data: consentChecks === 1, error: null });
    },
    from(table: string) {
      accessedTables.push(table);
      if (table === "whatsapp_chats") {
        return resultQuery({
          data: {
            id: "chat-a",
            company_id: "company-a",
            instance_id: "instance-a",
            remote_jid: verifiedJid,
            student_id: "student-a",
          },
          error: null,
        });
      }
      if (table === "students") {
        return resultQuery({
          data: {
            id: "student-a",
            phone: formattedMobile("48", "7"),
            whatsapp: null,
            country_code: "BR",
          },
          error: null,
        });
      }
      if (table === "whatsapp_instances") {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: { instance_name: "instance-a", status: "connected" },
            error: null,
          }),
        };
        return query;
      }
      if (table === "automation_flow_nodes") {
        const query = {
          select: () => query,
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
        return query;
      }
      if (table === "automation_flow_edges") {
        const query = {
          select: () => query,
          eq: () => Promise.resolve({ data: [], error: null }),
        };
        return query;
      }
      throw new Error(`late revocation reached unsafe table ${table}`);
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    providerFetches += 1;
    throw new Error("provider must not run without current consent");
  }) as typeof fetch;

  try {
    let code = "";
    try {
      await processSession(
        admin,
        {
          id: "session-a",
          flow_id: "flow-a",
          chat_id: "chat-a",
          current_node_id: "content-a",
          context: {
            student_id: "student-a",
            trigger_type: "weekly_contact",
            recipient_candidate: verifiedJid,
          },
        },
        { url: "https://provider.invalid", key: "redacted" },
      );
    } catch (error) {
      code = error instanceof Error ? error.message : String(error);
    }
    if (code !== "weekly_contact_consent_missing") throw new Error(`unexpected block code ${code}`);
    if (consentChecks !== 2) throw new Error(`expected two consent checks, got ${consentChecks}`);
    if (providerFetches !== 0) throw new Error("provider was called after late revocation");
    for (const unsafeTable of ["whatsapp_messages", "flow_sessions"]) {
      if (accessedTables.includes(unsafeTable)) throw new Error(`late revocation wrote ${unsafeTable}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("weekly automation re-resolves and blocks a recipient change immediately before send", async () => {
  const queuedJid = verifiedJid;
  const changedJid = directJid("48", "8");
  let chatReads = 0;
  let studentReads = 0;
  let consentChecks = 0;
  let providerFetches = 0;
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name !== "weekly_contact_consent_is_current") throw new Error(`unexpected rpc ${name}`);
      consentChecks += 1;
      if (args._recipient_candidate !== queuedJid) throw new Error("initial consent used the wrong recipient");
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) {
      if (table === "whatsapp_chats") {
        const query = {
          select: () => query,
          eq: () => query,
          single: async () => {
            chatReads += 1;
            return {
              data: {
                id: "chat-a",
                company_id: "company-a",
                instance_id: "instance-a",
                remote_jid: chatReads === 1 ? queuedJid : changedJid,
                student_id: "student-a",
              },
              error: null,
            };
          },
        };
        return query;
      }
      if (table === "students") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => {
            studentReads += 1;
            const digit = studentReads === 1 ? "7" : "8";
            return {
              data: {
                id: "student-a",
                phone: formattedMobile("48", digit),
                whatsapp: null,
                country_code: "BR",
              },
              error: null,
            };
          },
        };
        return query;
      }
      if (table === "whatsapp_instances") {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: { instance_name: "instance-a", status: "connected" },
            error: null,
          }),
        };
        return query;
      }
      if (table === "automation_flow_nodes") {
        const query = {
          select: () => query,
          eq: () => Promise.resolve({
            data: [{
              id: "content-a",
              flow_id: "flow-a",
              node_type: "content",
              data: { message: "Mensagem segura", wait_for_reply: false },
            }],
            error: null,
          }),
        };
        return query;
      }
      if (table === "automation_flow_edges") {
        const query = {
          select: () => query,
          eq: () => Promise.resolve({ data: [], error: null }),
        };
        return query;
      }
      throw new Error(`recipient race reached unexpected table ${table}`);
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    providerFetches += 1;
    throw new Error("provider must not run after recipient change");
  }) as typeof fetch;

  try {
    let code = "";
    try {
      await processSession(
        admin,
        {
          id: "session-a",
          flow_id: "flow-a",
          chat_id: "chat-a",
          current_node_id: "content-a",
          context: {
            student_id: "student-a",
            trigger_type: "weekly_contact",
            recipient_candidate: queuedJid,
          },
        },
        { url: "https://provider.invalid", key: "redacted" },
      );
    } catch (error) {
      code = error instanceof Error ? error.message : String(error);
    }
    if (code !== "weekly_contact_recipient_changed") throw new Error(`unexpected block code ${code}`);
    if (chatReads !== 2 || studentReads !== 2) throw new Error("recipient was not re-read immediately before send");
    if (consentChecks !== 1) throw new Error("stale recipient reached the second consent check");
    if (providerFetches !== 0) throw new Error("provider was called after recipient change");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("intercycle dispatcher audits provider-off deliveries without exposing recipients", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: (name: string) => {
      if (name === "process_intercycle_anamnesis_schedule") return Promise.resolve({ data: 0, error: null });
      if (name === "claim_intercycle_anamnesis_deliveries") {
        return Promise.resolve({
          data: [{
            id: "delivery-a",
            company_id: "company-a",
            student_id: "student-a",
            enrollment_id: "enrollment-a",
            training_cycle_id: "cycle-a",
            retry_count: 0,
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
    from(table: string) {
      if (table !== "intercycle_anamnesis_deliveries") throw new Error(`provider-off should only update delivery, reached ${table}`);
      const query = {
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
      };
      return query;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("provider must not be called when config is missing");
  }) as typeof fetch;

  try {
    const result = await processIntercycleAnamnesisDeliveries({ admin });
    if (result.failed !== 1 || result.sent !== 0) throw new Error(`unexpected result ${JSON.stringify(result)}`);
    if (updates[0]?.last_error_code !== "intercycle_provider_not_configured") throw new Error("missing provider-off audit code");
    const serialized = JSON.stringify(updates);
    for (const leaked of ["student-a", "5511", "@s.whatsapp.net"]) {
      if (serialized.includes(leaked)) throw new Error(`leaked ${leaked}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("intercycle dispatcher cancels a rescoped cycle before token creation or provider send", async () => {
  const visitedTables: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: (name: string) => {
      if (name === "process_intercycle_anamnesis_schedule") return Promise.resolve({ data: 0, error: null });
      if (name === "claim_intercycle_anamnesis_deliveries") {
        return Promise.resolve({
          data: [{
            id: "delivery-a",
            company_id: "company-a",
            student_id: "student-a",
            enrollment_id: "enrollment-a",
            training_cycle_id: "cycle-a",
            retry_count: 0,
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
    from(table: string) {
      visitedTables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
        maybeSingle: async () => {
          if (table === "students") {
            return {
              data: {
                id: "student-a",
                full_name: "Aluno Seguro",
                phone: formattedMobile("48", "9"),
                whatsapp: null,
                country_code: "BR",
                intercycle_anamnesis_enabled: true,
              },
              error: null,
            };
          }
          if (table === "training_cycles") {
            return {
              data: {
                id: "cycle-a",
                student_id: "student-a",
                company_id: "company-a",
                enrollment_id: "enrollment-a",
                status: "cancelled",
                superseded_at: null,
              },
              error: null,
            };
          }
          throw new Error(`unexpected read ${table}`);
        },
      };
      return query;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("provider must not be called for cancelled cycle");
  }) as typeof fetch;

  try {
    const result = await processIntercycleAnamnesisDeliveries({
      admin,
      provider: { url: "https://provider.invalid", key: "redacted" },
    });
    if (result.failed !== 1 || result.sent !== 0) throw new Error(`unexpected result ${JSON.stringify(result)}`);
    if (updates[0]?.status !== "cancelled" || updates[0]?.last_error_code !== "intercycle_cycle_cancelled_or_rescoped") {
      throw new Error(`missing terminal cancellation audit ${JSON.stringify(updates)}`);
    }
    if (visitedTables.includes("intercycle_anamnesis_invites") || visitedTables.includes("whatsapp_chats")) {
      throw new Error(`token/chat path was reached: ${visitedTables.join(",")}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("intercycle dispatcher cancels completed renewal-history enrollment before token creation or provider send", async () => {
  const visitedTables: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: (name: string) => {
      if (name === "process_intercycle_anamnesis_schedule") return Promise.resolve({ data: 0, error: null });
      if (name === "claim_intercycle_anamnesis_deliveries") {
        return Promise.resolve({
          data: [{
            id: "delivery-a",
            company_id: "company-a",
            student_id: "student-a",
            enrollment_id: "enrollment-old",
            training_cycle_id: "cycle-old",
            retry_count: 0,
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
    from(table: string) {
      visitedTables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
        maybeSingle: async () => {
          if (table === "students") {
            return {
              data: {
                id: "student-a",
                full_name: "Aluno Seguro",
                phone: formattedMobile("48", "9"),
                whatsapp: null,
                country_code: "BR",
                intercycle_anamnesis_enabled: true,
              },
              error: null,
            };
          }
          if (table === "training_cycles") {
            return {
              data: {
                id: "cycle-old",
                student_id: "student-a",
                company_id: "company-a",
                enrollment_id: "enrollment-old",
                status: "active",
                superseded_at: null,
              },
              error: null,
            };
          }
          if (table === "enrollments") {
            return { data: { id: "enrollment-old", status: "completed" }, error: null };
          }
          throw new Error(`unexpected read ${table}`);
        },
      };
      return query;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("provider must not be called for completed enrollment");
  }) as typeof fetch;

  try {
    const result = await processIntercycleAnamnesisDeliveries({
      admin,
      provider: { url: "https://provider.invalid", key: "redacted" },
    });
    if (result.failed !== 1 || result.sent !== 0) throw new Error(`unexpected result ${JSON.stringify(result)}`);
    if (updates[0]?.status !== "cancelled" || updates[0]?.last_error_code !== "intercycle_enrollment_completed_or_missing") {
      throw new Error(`missing completed-enrollment cancellation audit ${JSON.stringify(updates)}`);
    }
    if (visitedTables.includes("intercycle_anamnesis_invites") || visitedTables.includes("whatsapp_chats")) {
      throw new Error(`token/chat path was reached: ${visitedTables.join(",")}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("intercycle dispatcher retries enrollment lookup errors instead of cancelling delivery", async () => {
  const visitedTables: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: (name: string) => {
      if (name === "process_intercycle_anamnesis_schedule") return Promise.resolve({ data: 0, error: null });
      if (name === "claim_intercycle_anamnesis_deliveries") {
        return Promise.resolve({
          data: [{
            id: "delivery-a",
            company_id: "company-a",
            student_id: "student-a",
            enrollment_id: "enrollment-a",
            training_cycle_id: "cycle-a",
            retry_count: 0,
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
    from(table: string) {
      visitedTables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
        maybeSingle: async () => {
          if (table === "students") {
            return {
              data: {
                id: "student-a",
                full_name: "Aluno Seguro",
                phone: formattedMobile("48", "9"),
                whatsapp: null,
                country_code: "55",
                intercycle_anamnesis_enabled: true,
              },
              error: null,
            };
          }
          if (table === "training_cycles") {
            return {
              data: {
                id: "cycle-a",
                student_id: "student-a",
                company_id: "company-a",
                enrollment_id: "enrollment-a",
                status: "active",
                superseded_at: null,
              },
              error: null,
            };
          }
          if (table === "enrollments") {
            return { data: null, error: new Error("temporary db outage") };
          }
          throw new Error(`unexpected read ${table}`);
        },
      };
      return query;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("provider must not be called when enrollment lookup fails");
  }) as typeof fetch;

  try {
    const result = await processIntercycleAnamnesisDeliveries({
      admin,
      provider: { url: "https://provider.invalid", key: "redacted" },
    });
    if (result.failed !== 1 || result.sent !== 0) throw new Error(`unexpected result ${JSON.stringify(result)}`);
    if (updates[0]?.status !== "failed" || updates[0]?.last_error_code !== "intercycle_enrollment_lookup_failed") {
      throw new Error(`missing retryable enrollment lookup audit ${JSON.stringify(updates)}`);
    }
    if (updates[0]?.retry_count !== 1 || !updates[0]?.next_attempt_at) {
      throw new Error(`missing retry scheduling ${JSON.stringify(updates)}`);
    }
    if (visitedTables.includes("intercycle_anamnesis_invites") || visitedTables.includes("whatsapp_chats")) {
      throw new Error(`token/chat path was reached: ${visitedTables.join(",")}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
