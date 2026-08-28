import { describe, expect, it } from "vitest";
import { matchesWhatsAppStatusFilter, selectCurrentCycle } from "./whatsappAudience";

const NOW = new Date("2026-07-31T12:00:00Z");

describe("WhatsApp audience integration", () => {
  it("inclui interessado e contato feito no filtro Leads", () => {
    expect(matchesWhatsAppStatusFilter({ status: "interested", sales_stage: "interested" }, "leads")).toBe(true);
    expect(matchesWhatsAppStatusFilter({ status: "interested", sales_stage: "contacted" }, "leads")).toBe(true);
  });

  it("considera renovacao pelo status ou pelo fim da matricula em ate sete dias", () => {
    expect(matchesWhatsAppStatusFilter({ status: "awaiting_renewal" }, "renewal", { now: NOW })).toBe(true);
    expect(matchesWhatsAppStatusFilter({ status: "active", sales_stage: "active" }, "renewal", {
      enrollmentEndDate: "2026-08-06",
      now: NOW,
    })).toBe(true);
  });

  it("nao mistura renovacao proxima com ativos regulares", () => {
    expect(matchesWhatsAppStatusFilter({ status: "active", sales_stage: "active" }, "active", {
      enrollmentEndDate: "2026-08-06",
      now: NOW,
    })).toBe(false);
    expect(matchesWhatsAppStatusFilter({ status: "active", sales_stage: "active" }, "active", {
      enrollmentEndDate: "2026-09-30",
      now: NOW,
    })).toBe(true);
  });

  it("separa pendentes e avaliacao pelo funil canonico", () => {
    expect(matchesWhatsAppStatusFilter({ status: "interested", sales_stage: "fiscal_registration_pending" }, "pending")).toBe(true);
    expect(matchesWhatsAppStatusFilter({ status: "pending", sales_stage: "payment_pending" }, "pending")).toBe(true);
    expect(matchesWhatsAppStatusFilter({ status: "active", sales_stage: "active_onboarding" }, "assessment")).toBe(true);
  });

  it("seleciona o ciclo que contem a data atual em vez do primeiro status active", () => {
    const selected = selectCurrentCycle([
      { id: "old", start_date: "2026-06-01", end_date: "2026-07-12", status: "active" },
      { id: "current", start_date: "2026-07-13", end_date: "2026-08-23", status: "active" },
      { id: "future", start_date: "2026-08-24", end_date: "2026-10-04", status: "active" },
    ], "2026-07-31");
    expect(selected?.id).toBe("current");
  });

  it("nunca usa um ciclo MFIT substituído como contexto da conversa", () => {
    const selected = selectCurrentCycle([
      { id: "mfit", start_date: "2026-07-27", end_date: "2026-09-07", status: "superseded" },
      { id: "studio", start_date: "2026-07-27", end_date: "2026-09-06", status: "active" },
    ], "2026-08-27");
    expect(selected?.id).toBe("studio");
  });
});
