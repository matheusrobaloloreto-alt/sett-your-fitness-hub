export type SalesStage =
  | "interested"
  | "contacted"
  | "fiscal_registration_pending"
  | "payment_pending"
  | "active_onboarding"
  | "active"
  | "lost";

export type FunnelStageKey =
  | "interested"
  | "contacted"
  | "fiscal_registration_pending"
  | "payment_pending"
  | "active_onboarding"
  | "active"
  | "lost";

export interface FunnelStageStudent {
  status?: string | null;
  sales_stage?: string | null;
  fiscal_completed_at?: string | null;
  payment_link_sent_at?: string | null;
  activated_at?: string | null;
  assessment_due_at?: string | null;
  onboarding_instructions_sent_at?: string | null;
}

export const FUNNEL_STAGE_ORDER: FunnelStageKey[] = [
  "interested",
  "contacted",
  "fiscal_registration_pending",
  "payment_pending",
  "active_onboarding",
  "active",
  "lost",
];

export const FUNNEL_STAGE_META: Record<FunnelStageKey, {
  label: string;
  shortLabel: string;
  description: string;
}> = {
  interested: {
    label: "Interessado",
    shortLabel: "Lead",
    description: "Pré-cadastro recebido; precisa do primeiro contato humano.",
  },
  contacted: {
    label: "Contato feito",
    shortLabel: "Contato",
    description: "A equipe ja chamou; aguardando envio do cadastro fiscal e escolha do plano.",
  },
  fiscal_registration_pending: {
    label: "Cadastro + plano",
    shortLabel: "Fiscal",
    description: "Link enviado; aguardando dados fiscais para liberar pagamento Asaas.",
  },
  payment_pending: {
    label: "Pagamento Asaas",
    shortLabel: "Pagamento",
    description: "Cadastro completo; aguardando escolha do plano e Pix pelo Asaas.",
  },
  active_onboarding: {
    label: "Avaliacao e onboarding",
    shortLabel: "Onboarding",
    description: "Pagamento confirmado; aguardando avaliacao de movimento e liberacao do treino.",
  },
  active: {
    label: "Aluno ativo",
    shortLabel: "Ativo",
    description: "Fechamento concluido.",
  },
  lost: {
    label: "Pausado ou perdido",
    shortLabel: "Pausado",
    description: "Sem avanco operacional no funil.",
  },
};

export function canReconcileActiveStage(status?: string | null): boolean {
  return status === "active" || status === "awaiting_renewal";
}

export function canMoveOperationalStudentToStage(
  status: string | null | undefined,
  targetStage: FunnelStageKey,
): boolean {
  if (!canReconcileActiveStage(status)) return true;
  return targetStage === "active" || targetStage === "active_onboarding";
}

export function normalizeSalesStage(student: FunnelStageStudent): FunnelStageKey {
  const stage = student.sales_stage as FunnelStageKey | null | undefined;
  if (student.status === "active" || student.status === "awaiting_renewal") {
    if (stage === "active_onboarding") return "active_onboarding";
    return "active";
  }
  if (stage && FUNNEL_STAGE_ORDER.includes(stage)) return stage;

  if (student.status === "inactive") return "lost";
  if (student.status === "pending") return "payment_pending";
  return "interested";
}

export function normalizeLeadSalesStage(stage?: string | null): FunnelStageKey {
  if (stage === "contacted") return "contacted";
  if (stage === "fiscal_registration" || stage === "fiscal_registration_pending") {
    return "fiscal_registration_pending";
  }
  return "interested";
}

export function funnelStageProgress(stage: FunnelStageKey): number {
  if (stage === "lost") return 0;
  const activeOrder = FUNNEL_STAGE_ORDER.filter((key) => key !== "lost");
  const idx = Math.max(0, activeOrder.indexOf(stage));
  return Math.round((idx / Math.max(1, activeOrder.length - 1)) * 100);
}

export function stageNextAction(
  student: FunnelStageStudent,
  opts: { hasAnamnesis?: boolean; hasAssessment?: boolean } = {},
): string {
  const stage = normalizeSalesStage(student);
  if (stage === "interested") return "Registrar contato";
  if (stage === "contacted") return "Enviar cadastro fiscal + plano";
  if (stage === "fiscal_registration_pending") return "Aguardar ou reenviar cadastro";
  if (stage === "payment_pending") {
    return student.payment_link_sent_at ? "Aguardar Pix Asaas" : "Enviar checkout Asaas";
  }
  if (stage === "active_onboarding") {
    if (!student.onboarding_instructions_sent_at) return "Enviar instrucoes de avaliacao";
    if (!opts.hasAnamnesis) return "Conferir anamnese";
    if (!opts.hasAssessment) return "Aguardar avaliacao de movimento";
    return "Liberar primeira prescricao";
  }
  if (stage === "active") return "Acompanhar execucao";
  return "Reativar ou arquivar";
}

export function stageActionLabel(stage: FunnelStageKey): string {
  if (stage === "interested") return "Registrar contato";
  if (stage === "contacted") return "Enviar cadastro fiscal";
  if (stage === "fiscal_registration_pending") return "Reenviar cadastro";
  if (stage === "payment_pending") return "Enviar checkout";
  if (stage === "active_onboarding") return "Enviar instruções";
  if (stage === "active") return "Abrir aluno";
  return "Revisar";
}

export function isOpenFunnelStage(stage: FunnelStageKey): boolean {
  return stage !== "active" && stage !== "lost";
}
