import { describe, expect, it } from "vitest";
import {
  canMoveOperationalStudentToStage,
  canReconcileActiveStage,
  canTransformRegistrationToLead,
  FUNNEL_STAGE_META,
  FUNNEL_STAGE_ORDER,
  funnelStageProgress,
  normalizeLeadSalesStage,
  normalizeSalesStage,
  stageActionLabel,
  stageNextAction,
  isOpenFunnelStage,
} from "./salesFunnelView";

describe("salesFunnelView", () => {
  it("permite corrigir no kanban um aluno operacionalmente ativo sem liberar um pendente", () => {
    expect(canReconcileActiveStage("active")).toBe(true);
    expect(canReconcileActiveStage("awaiting_renewal")).toBe(true);
    expect(canReconcileActiveStage("pending")).toBe(false);
  });

  it("não deixa o Kanban rebaixar uma matrícula operacionalmente ativa", () => {
    expect(canMoveOperationalStudentToStage("active", "active")).toBe(true);
    expect(canMoveOperationalStudentToStage("active", "active_onboarding")).toBe(true);
    expect(canMoveOperationalStudentToStage("active", "payment_pending")).toBe(false);
    expect(canMoveOperationalStudentToStage("awaiting_renewal", "interested")).toBe(false);
    expect(canMoveOperationalStudentToStage("pending", "payment_pending")).toBe(true);
  });
  it("keeps explicit pre-active stages for non-active students", () => {
    expect(normalizeSalesStage({ status: "pending", sales_stage: "fiscal_registration_pending" })).toBe("fiscal_registration_pending");
    expect(normalizeSalesStage({ status: "active", sales_stage: "active_onboarding" })).toBe("active_onboarding");
  });

  it("does not show an active student in a stale pre-registration stage", () => {
    expect(normalizeSalesStage({ status: "active", sales_stage: "payment_pending" })).toBe("active");
    expect(normalizeSalesStage({ status: "awaiting_renewal", sales_stage: "contacted" })).toBe("active");
  });

  it("maps legacy status to the current sales funnel", () => {
    expect(normalizeSalesStage({ status: "interested" })).toBe("interested");
    expect(normalizeSalesStage({ status: "pending" })).toBe("payment_pending");
    expect(normalizeSalesStage({ status: "active" })).toBe("active");
    expect(normalizeSalesStage({ status: "inactive" })).toBe("lost");
  });

  it("keeps manually moved leads visible in every pre-payment Kanban stage", () => {
    expect(normalizeLeadSalesStage("interested")).toBe("interested");
    expect(normalizeLeadSalesStage("contacted")).toBe("contacted");
    expect(normalizeLeadSalesStage("fiscal_registration_pending")).toBe("fiscal_registration_pending");
    expect(normalizeLeadSalesStage("fiscal_registration")).toBe("fiscal_registration_pending");
  });

  it("separa novos cadastros dos leads preservados sem reabrir a venda", () => {
    expect(FUNNEL_STAGE_META.interested.shortLabel).toBe("Novos");
    expect(FUNNEL_STAGE_META.lost.shortLabel).toBe("Leads");
    expect(FUNNEL_STAGE_ORDER).toContain("lost");
    expect(normalizeLeadSalesStage("lost")).toBe("lost");
    expect(normalizeSalesStage({ status: "pending", sales_stage: "lost" })).toBe("lost");
    expect(normalizeSalesStage({ status: "inactive", sales_stage: "lost" })).toBe("lost");
    expect(isOpenFunnelStage("lost")).toBe(false);
    expect(stageNextAction({ sales_stage: "lost" })).toBe("Retomar contato");
    expect(stageActionLabel("lost")).toBe("Retomar contato");
  });

  it.each(["active", "awaiting_training", "awaiting_renewal", "trial"])(
    "protege perfis operacionais %s contra transformação em lead",
    (status) => {
      expect(canTransformRegistrationToLead({ status, sales_stage: "interested" })).toBe(false);
      expect(canMoveOperationalStudentToStage(status, "lost")).toBe(false);
    },
  );

  it("protege onboarding pago mesmo com status desatualizado", () => {
    expect(canTransformRegistrationToLead({ status: "pending", sales_stage: "active_onboarding" })).toBe(false);
    expect(canTransformRegistrationToLead({ status: "pending", sales_stage: "active" })).toBe(false);
  });

  it.each(["interested", "pending", "inactive"])("permite preservar cadastro %s", (status) => {
    expect(canTransformRegistrationToLead({ status, sales_stage: "contacted" })).toBe(true);
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
    expect(funnelStageProgress("lost")).toBe(0);
  });

  it("uses explicit action labels that remain clear on narrow funnel cards", () => {
    expect(stageActionLabel("interested")).toBe("Registrar contato");
    expect(stageActionLabel("contacted")).toBe("Enviar cadastro fiscal");
    expect(stageActionLabel("fiscal_registration_pending")).toBe("Reenviar cadastro");
    expect(stageActionLabel("payment_pending")).toBe("Enviar checkout");
  });
});
