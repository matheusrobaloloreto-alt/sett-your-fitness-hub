import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildWorkoutFeedbackRecord,
  deliverWorkoutFeedbackToWhatsapp,
  normalizeWorkoutFeedbackPayload,
  persistWorkoutFeedbackOnce,
} from "../../supabase/functions/_shared/student-workout-feedback";
import { normalizeWhatsAppPhoneKey } from "../../supabase/functions/_shared/whatsappIdentity";

const MIGRATION = "supabase/migrations/20260824120000_workout_feedback_trainer_replies.sql";
const EDGE = "supabase/functions/student-workout-feedback/index.ts";
const SHARED = "supabase/functions/_shared/student-workout-feedback.ts";
const IDEMPOTENCY_MIGRATION = "supabase/migrations/20260825150000_workout_feedback_session_idempotency.sql";

const read = (path: string) => readFileSync(path, "utf8");

describe("student workout feedback edge payload", () => {
  it("normalizes legacy and new payloads without accepting emoji-only feedback", () => {
    expect(() => normalizeWorkoutFeedbackPayload({ feedback: "🔥🔥" })).toThrow(/texto/i);

    expect(normalizeWorkoutFeedbackPayload({
      perception: "Difícil",
      reflection: "Senti a lombar no final.",
      workout_title: "Treino A - Inferiores <script>",
      workout_session_id: "session-1",
    })).toEqual({
      perception: "Difícil",
      reflection: "Senti a lombar no final.",
      workoutTitle: "Treino A - Inferiores",
      workoutSessionId: "session-1",
    });

    expect(normalizeWorkoutFeedbackPayload({
      rating: "Bom",
      feedback: "Foi controlado.",
    })).toMatchObject({
      perception: "Bom",
      reflection: "Foi controlado.",
    });
  });

  it("builds the persisted row with a sanitized workout title and no WhatsApp dependency", () => {
    const row = buildWorkoutFeedbackRecord({
      studentId: "student-1",
      companyId: "company-1",
      payload: normalizeWorkoutFeedbackPayload({
        perception: "Ótimo",
        reflection: "Sem dor hoje.",
        workout_title: " Treino B  ",
        workout_session_id: "session-1",
      }),
    });

    expect(row).toMatchObject({
      student_id: "student-1",
      company_id: "company-1",
      workout_session_id: "session-1",
      workout_title: "Treino B",
      difficulty: 3,
      notes: "Percepção: Ótimo\nSem dor hoje.",
      pain_areas: [],
    });
  });
});

function createWhatsappDeliveryDb({
  messageError = null,
  chatUpdateError = null,
}: {
  messageError?: { message: string } | null;
  chatUpdateError?: { message: string } | null;
}) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        insert: () => {
          if (table === "whatsapp_messages") {
            return Promise.resolve({ error: messageError });
          }
          return query;
        },
        update: () => ({
          eq: () => Promise.resolve({ error: chatUpdateError }),
        }),
        maybeSingle: () => {
          if (table === "whatsapp_chats") {
            return Promise.resolve({ data: { id: "chat-1", unread_count: 2 }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return query;
    },
  };
}

describe("optional workout feedback WhatsApp delivery", () => {
  const baseArgs = {
    studentId: "student-1",
    student: {
      company_id: "company-1",
      full_name: "Aluno Teste",
      whatsapp: "48999999999",
      phone: null,
    },
    content: "Feedback de treino - Aluno",
    nowIso: () => "2026-08-24T10:00:00.000Z",
    log: () => undefined,
  };

  it("returns delivered false instead of throwing when the WhatsApp message mirror fails", async () => {
    const result = await deliverWorkoutFeedbackToWhatsapp({
      ...baseArgs,
      db: createWhatsappDeliveryDb({ messageError: { message: "provider down" } }),
    });

    expect(result).toEqual({ delivered: false });
  });

  it("returns delivered false instead of throwing when the chat update mirror fails", async () => {
    const result = await deliverWorkoutFeedbackToWhatsapp({
      ...baseArgs,
      db: createWhatsappDeliveryDb({ chatUpdateError: { message: "stale chat" } }),
    });

    expect(result).toEqual({ delivered: false });
  });

  it("rejects a legacy 11-digit Brazilian number whose subscriber does not start with 9", () => {
    expect(normalizeWhatsAppPhoneKey("42077707180")).toBeNull();
  });

  it("keeps trunk-prefixed Brazilian landlines while rejecting malformed mobile-shaped values", () => {
    expect(normalizeWhatsAppPhoneKey("01134567890")).toBe("1134567890");
    expect(normalizeWhatsAppPhoneKey("0151134567890")).toBe("1134567890");
    expect(normalizeWhatsAppPhoneKey("42077707180")).toBeNull();
  });

  it("reuses one unlinked direct chat in the same tenant and instance instead of creating a feedback-only duplicate", async () => {
    const chatInserts: Array<Record<string, unknown>> = [];
    const messageInserts: Array<Record<string, unknown>> = [];

    const db = {
      from(table: string) {
        const filters = new Map<string, unknown>();
        let remoteJids: string[] | null = null;
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          in: (column: string, values: string[]) => {
            if (column === "remote_jid") remoteJids = values;
            return query;
          },
          order: () => query,
          limit: () => query,
          insert: (row: Record<string, unknown>) => {
            if (table === "whatsapp_chats") {
              chatInserts.push(row);
              return query;
            }
            if (table === "whatsapp_messages") {
              messageInserts.push(row);
              return Promise.resolve({ error: null });
            }
            return query;
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          maybeSingle: () => {
            if (table === "whatsapp_instances") {
              return Promise.resolve({ data: { id: "instance-1" }, error: null });
            }
            if (table === "whatsapp_chats" && filters.has("student_id")) {
              return Promise.resolve({ data: null, error: null });
            }
            if (table === "whatsapp_chats" && remoteJids?.includes("5548991432057@s.whatsapp.net")) {
              return Promise.resolve({
                data: { id: "historical-chat", unread_count: 4, student_id: null },
                error: null,
              });
            }
            if (table === "whatsapp_chats") {
              return Promise.resolve({ data: { id: "new-chat", unread_count: 0 }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const result = await deliverWorkoutFeedbackToWhatsapp({
      ...baseArgs,
      db,
      student: { ...baseArgs.student, whatsapp: "(48) 99143-2057" },
    });

    expect(result).toEqual({ delivered: true });
    expect(chatInserts).toEqual([]);
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0]).toMatchObject({ chat_id: "historical-chat", company_id: "company-1" });
  });

  it("does not create a chat or mirror a message from an invalid legacy student phone", async () => {
    const writes: Array<{ table: string; row: Record<string, unknown> }> = [];
    const db = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          order: () => query,
          limit: () => query,
          insert: (row: Record<string, unknown>) => {
            writes.push({ table, row });
            return table === "whatsapp_messages" ? Promise.resolve({ error: null }) : query;
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          maybeSingle: () => table === "whatsapp_instances"
            ? Promise.resolve({ data: { id: "instance-1" }, error: null })
            : Promise.resolve({ data: null, error: null }),
        };
        return query;
      },
    };

    const result = await deliverWorkoutFeedbackToWhatsapp({
      ...baseArgs,
      db,
      student: { ...baseArgs.student, whatsapp: "42077707180" },
    });

    expect(result).toEqual({ delivered: false });
    expect(writes).toEqual([]);
  });

  it("never reuses a same-student chat unless the tenant binding also matches", async () => {
    const messageInserts: Array<Record<string, unknown>> = [];
    const db = {
      from(table: string) {
        const filters = new Map<string, unknown>();
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          in: () => query,
          order: () => query,
          limit: () => query,
          insert: (row: Record<string, unknown>) => {
            if (table === "whatsapp_messages") {
              messageInserts.push(row);
              return Promise.resolve({ error: null });
            }
            return query;
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          maybeSingle: () => {
            if (table === "whatsapp_instances") {
              return Promise.resolve({ data: { id: "instance-1" }, error: null });
            }
            if (table === "whatsapp_chats" && filters.has("student_id") && !filters.has("company_id")) {
              return Promise.resolve({ data: { id: "cross-tenant-chat", unread_count: 1 }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const result = await deliverWorkoutFeedbackToWhatsapp({ ...baseArgs, db });

    expect(result).toEqual({ delivered: false });
    expect(messageInserts).toEqual([]);
  });

  it("fails closed instead of creating a duplicate when the linked chat JID disagrees with the student phone", async () => {
    const chatInserts: Array<Record<string, unknown>> = [];
    const messageInserts: Array<Record<string, unknown>> = [];
    const db = {
      from(table: string) {
        const filters = new Map<string, unknown>();
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          in: () => query,
          order: () => query,
          limit: () => query,
          insert: (row: Record<string, unknown>) => {
            if (table === "whatsapp_chats") chatInserts.push(row);
            if (table === "whatsapp_messages") {
              messageInserts.push(row);
              return Promise.resolve({ error: null });
            }
            return query;
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          maybeSingle: () => {
            if (table === "whatsapp_instances") {
              return Promise.resolve({ data: { id: "instance-1" }, error: null });
            }
            if (table === "whatsapp_chats" && filters.has("student_id")) {
              return Promise.resolve({
                data: {
                  id: "corrupted-linked-chat",
                  unread_count: 1,
                  student_id: "student-1",
                  remote_jid: "5511999999999@s.whatsapp.net",
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const result = await deliverWorkoutFeedbackToWhatsapp({ ...baseArgs, db });

    expect(result).toEqual({ delivered: false });
    expect(chatInserts).toEqual([]);
    expect(messageInserts).toEqual([]);
  });

  it("requires a connected instance and binds an existing chat to its own instance", async () => {
    const instanceFilters = new Map<string, unknown>();
    const db = {
      from(table: string) {
        const filters = table === "whatsapp_instances" ? instanceFilters : new Map<string, unknown>();
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          in: () => query,
          order: () => query,
          limit: () => query,
          insert: () => query,
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          maybeSingle: () => {
            if (table === "whatsapp_chats" && filters.has("student_id")) {
              return Promise.resolve({
                data: {
                  id: "linked-chat",
                  instance_id: "bound-instance",
                  student_id: "student-1",
                  remote_jid: "5548999999999@s.whatsapp.net",
                  unread_count: 0,
                },
                error: null,
              });
            }
            if (table === "whatsapp_instances") {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const result = await deliverWorkoutFeedbackToWhatsapp({ ...baseArgs, db });

    expect(result).toEqual({ delivered: false });
    expect(instanceFilters.get("id")).toBe("bound-instance");
    expect(instanceFilters.get("company_id")).toBe("company-1");
    expect(instanceFilters.get("status")).toBe("connected");
  });
});

describe("workout feedback idempotency", () => {
  it("recovers the existing feedback after a concurrent duplicate session insert", async () => {
    const db = {
      from() {
        const filters = new Map<string, unknown>();
        const query = {
          insert: () => query,
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          single: () => filters.has("workout_session_id")
            ? Promise.resolve({ data: { id: "feedback-existing" }, error: null })
            : Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } }),
        };
        return query;
      },
    };

    const result = await persistWorkoutFeedbackOnce({
      db,
      record: {
        student_id: "student-1",
        company_id: "company-1",
        workout_session_id: "session-1",
      },
    });

    expect(result).toEqual({ id: "feedback-existing", duplicate: true });
  });

  it("defines a fail-closed unique session contract without deleting or merging feedback", () => {
    const migration = read(IDEMPOTENCY_MIGRATION);
    expect(migration).toContain("workout_feedback_student_session_key");
    expect(migration).toContain("student_id, workout_session_id");
    expect(migration).toContain("where workout_session_id is not null");
    expect(migration).not.toMatch(/^\s*(delete|merge)\b/im);
  });
});

describe("workout feedback trainer reply migration contract", () => {
  it("adds nullable reply columns, size/coherence checks, and no speculative index", () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("add column if not exists workout_title text");
    expect(migration).toContain("add column if not exists trainer_reply text");
    expect(migration).toContain("add column if not exists trainer_replied_at timestamptz");
    expect(migration).toContain("add column if not exists trainer_replied_by uuid");
    expect(migration).toContain("add column if not exists trainer_reply_author_name text");
    expect(migration).toContain("workout_feedback_workout_title_length");
    expect(migration).toContain("workout_feedback_trainer_reply_length");
    expect(migration).toContain("workout_feedback_trainer_reply_complete");
    expect(migration).toContain("columns are nullable and have no backfill");
    expect(migration).not.toMatch(/create\s+index/i);
    expect(migration).not.toMatch(/not\s+valid/i);
  });

  it("uses a fail-closed RPC so staff cannot forge reply authorship or cross tenants", () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("create or replace function public.reply_to_workout_feedback");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("public.is_company_staff(v_actor, v_feedback.company_id)");
    expect(migration).toContain("trainer_replied_by = v_actor");
    expect(migration).toContain("trainer_reply_author_name = v_author_name");
    expect(migration).toContain("drop policy if exists \"Company staff update workout feedback\"");
    expect(migration).toContain("revoke update on public.workout_feedback from authenticated");
    expect(migration).toContain("revoke all on function public.reply_to_workout_feedback(uuid, text) from public");
    expect(migration).toContain("grant execute on function public.reply_to_workout_feedback(uuid, text) to authenticated");
    expect(migration).toContain("revoke all on function public.guard_workout_feedback_reply_columns() from public");
  });

  it("keeps the edge on the app database record before optional WhatsApp delivery", () => {
    const edge = read(EDGE);
    const shared = read(SHARED);

    expect(edge).toContain("normalizeWorkoutFeedbackPayload");
    expect(edge).toContain("buildWorkoutFeedbackRecord");
    expect(edge).toContain("deliverWorkoutFeedbackToWhatsapp");
    expect(edge.indexOf(".from(\"workout_feedback\").insert")).toBeLessThan(edge.indexOf("const delivery = await deliverWorkoutFeedbackToWhatsapp"));
    expect(edge).not.toContain("Feedback salvo, mas falhou");
    expect(shared).toContain(".from(\"whatsapp_messages\").insert");
    expect(shared).toContain("return { delivered: false }");
  });
});
