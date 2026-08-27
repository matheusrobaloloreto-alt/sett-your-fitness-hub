import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addBusinessDays,
  buildAssessmentOnboardingMessage,
  buildPaymentLinkMessage,
  isoDate,
  sendFunnelWhatsAppMessage,
} from "../../supabase/functions/_shared/sales-funnel.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sales funnel", () => {
  it("counts five business days without Saturday and Sunday", () => {
    const thursday = new Date("2026-07-30T12:00:00.000Z");
    expect(isoDate(addBusinessDays(thursday, 5))).toBe("2026-08-06");
  });

  it("builds a distinct Asaas payment-link message with the first name", () => {
    const message = buildPaymentLinkMessage("Matheus Loreto", "https://www.settapp.com.br/pagamento/token");
    expect(message).toContain("Matheus");
    expect(message).toContain("Asaas");
    expect(message).toContain("/pagamento/token");
  });

  it("states the movement-assessment deadline without requesting anamnesis again", () => {
    const message = buildAssessmentOnboardingMessage({
      fullName: "Matheus Loreto",
      dueDate: "06/08/2026",
      hasAnamnesis: true,
    });
    expect(message).toContain("avaliação de movimento");
    expect(message).toContain("5 dias úteis");
    expect(message).toContain("não precisa responder novamente");
  });

  it("fails closed before provider delivery when the phone chat belongs to another student", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("Deno", { env: { get: () => "configured" } });

    const failedEvents: unknown[] = [];
    const eventUpdate = {
      eq: () => eventUpdate,
    };
    const admin = {
      from(table: string) {
        if (table === "student_funnel_events") {
          return {
            insert: async () => ({ error: null }),
            update: (payload: unknown) => {
              failedEvents.push(payload);
              return eventUpdate;
            },
          };
        }
        const result = table === "whatsapp_instances"
          ? { data: { id: "instance-1", instance_name: "bn", status: "connected" }, error: null }
          : { data: { id: "chat-1", student_id: "student-other" }, error: null };
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => result,
          update: () => query,
        };
        return query;
      },
    };

    const result = await sendFunnelWhatsAppMessage({
      admin,
      studentId: "student-target",
      companyId: "company-1",
      fullName: "Aluna Correta",
      phone: "+55 11 99999-9999",
      text: "Follow-up",
      eventType: "follow_up",
      eventKey: "follow-up-1",
    });

    expect(result).toEqual({
      sent: false,
      reason: "Conversa vinculada a outro aluno. Envio bloqueado para revisão.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(failedEvents).toContainEqual(expect.objectContaining({ status: "failed" }));
  });

  it("does not persist the provider response body when WhatsApp delivery fails", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "configured" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Authorization: Bearer provider-secret; phone=5511999999999",
    }));

    const failedEvents: Array<Record<string, unknown>> = [];
    const eventUpdate = { eq: () => eventUpdate };
    const admin = {
      from(table: string) {
        if (table === "student_funnel_events") {
          return {
            insert: async () => ({ error: null }),
            update: (payload: Record<string, unknown>) => {
              failedEvents.push(payload);
              return eventUpdate;
            },
          };
        }
        const result = table === "whatsapp_instances"
          ? { data: { id: "instance-1", instance_name: "bn", status: "connected" }, error: null }
          : { data: { id: "chat-1", student_id: "student-target" }, error: null };
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => result,
          update: () => query,
        };
        return query;
      },
    };

    const result = await sendFunnelWhatsAppMessage({
      admin,
      studentId: "student-target",
      companyId: "company-1",
      fullName: "Aluna Correta",
      phone: "+55 11 99999-9999",
      text: "Follow-up",
      eventType: "follow_up",
      eventKey: "follow-up-provider-error",
    });

    expect(result).toEqual({ sent: false, reason: "Falha no provedor WhatsApp (status 500)." });
    expect(JSON.stringify(failedEvents)).not.toContain("provider-secret");
    expect(JSON.stringify(failedEvents)).not.toContain("5511999999999");
  });

  it("allows delivery when an existing phone chat is not linked to a student yet", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "configured" } });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: "provider-message-1" } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const eventUpdate = { eq: () => eventUpdate };
    const chatUpdate = { eq: () => chatUpdate };
    const admin = {
      from(table: string) {
        if (table === "student_funnel_events") {
          return {
            insert: async () => ({ error: null }),
            update: () => eventUpdate,
          };
        }
        if (table === "whatsapp_messages") {
          return { insert: async () => ({ error: null }) };
        }
        const result = table === "whatsapp_instances"
          ? { data: { id: "instance-1", instance_name: "bn", status: "connected" }, error: null }
          : { data: { id: "chat-1", student_id: null }, error: null };
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => result,
          update: () => chatUpdate,
        };
        return query;
      },
    };

    const result = await sendFunnelWhatsAppMessage({
      admin,
      studentId: "student-target",
      companyId: "company-1",
      fullName: "Aluna Correta",
      phone: "+55 11 99999-9999",
      text: "Follow-up",
      eventType: "follow_up",
      eventKey: "follow-up-unlinked-chat",
    });

    expect(result).toEqual({ sent: true, chatId: "chat-1" });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
