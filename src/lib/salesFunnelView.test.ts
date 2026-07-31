import { describe, expect, it } from "vitest";
import { funnelStageProgress, normalizeSalesStage, stageNextAction } from "./salesFunnelView";

describe("salesFunnelView", () => {
  it("prioritizes explicit sales_stage over legacy student status", () => {
    expect(normalizeSalesStage({ status: "pending", sales_stage: "fiscal_registration_pending" })).toBe("fiscal_registration_pending");
    expect(normalizeSalesStage({ status: "active", sales_stage: "active_onboarding" })).toBe("active_onboarding");
  });

  it("maps legacy status to the current sales funnel", () => {
    expect(normalizeSalesStage({ status: "interested" })).toBe("interested");
    expect(normalizeSalesStage({ status: "pending" })).toBe("payment_pending");
    expect(normalizeSalesStage({ status: "active" })).toBe("active");
    expect(normalizeSalesStage({ status: "inactive" })).toBe("lost");
  });

  it("returns operational next actions for each registration phase", () => {
    expect(stageNextAction({ sales_stage: "interested" })).toBe("Registrar contato");
    expect(stageNextAction({ sales_stage: "contacted" })).toBe("Enviar cadastro fiscal + plano");
    expect(stageNextAction({ sales_stage: "payment_pending" })).toBe("Enviar checkout Asaas");
    expect(stageNextAction({ sales_stage: "payment_pending", payment_link_sent_at: "2026-07-31T10:00:00Z" })).toBe("Aguardar Pix Asaas");
    expect(stageNextAction({ sales_stage: "active_onboarding", onboarding_instructions_sent_at: "2026-07-31T10:00:00Z" }, { hasAnamnesis: true, hasAssessment: false })).toBe("Aguardar avaliacao de movimento");
  });

  it("keeps progress monotonic through the active funnel", () => {
    expect(funnelStageProgress("interested")).toBeLessThan(funnelStageProgress("fiscal_registration_pending"));
    expect(funnelStageProgress("interested")).toBeLessThan(funnelStageProgress("contacted"));
    expect(funnelStageProgress("contacted")).toBeLessThan(funnelStageProgress("fiscal_registration_pending"));
    expect(funnelStageProgress("payment_pending")).toBeLessThan(funnelStageProgress("active_onboarding"));
    expect(funnelStageProgress("active")).toBe(100);
  });
});
