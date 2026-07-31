// Status único do aluno — máquina de estados central para todos os módulos lerem o aluno
// do mesmo jeito (evita cada tela interpretar diferente).
// Fluxo: lead -> anamnese pendente -> avaliação pendente -> aguardando prescrição -> ativo -> risco -> renovação.

export type StudentStatus =
  | "lead"
  | "anamnese_pendente"
  | "avaliacao_pendente"
  | "aguardando_prescricao"
  | "ativo"
  | "risco"
  | "renovacao"
  | "inativo";

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  lead: "Lead",
  anamnese_pendente: "Anamnese pendente",
  avaliacao_pendente: "Avaliação pendente",
  aguardando_prescricao: "Aguardando prescrição",
  ativo: "Ativo",
  risco: "Em risco",
  renovacao: "Renovação",
  inativo: "Inativo",
};

export const STUDENT_STATUS_COLORS: Record<StudentStatus, string> = {
  lead: "bg-muted text-muted-foreground",
  anamnese_pendente: "bg-amber-500/15 text-amber-600",
  avaliacao_pendente: "bg-amber-500/15 text-amber-600",
  aguardando_prescricao: "bg-blue-500/15 text-blue-600",
  ativo: "bg-emerald-500/15 text-emerald-600",
  risco: "bg-destructive/15 text-destructive",
  renovacao: "bg-orange-500/15 text-orange-600",
  inativo: "bg-muted text-muted-foreground",
};

export interface StudentSignals {
  baseStatus?: string | null;        // students.status do banco (active/awaiting_renewal/inactive...)
  hasAnamnesis?: boolean;
  hasAssessment?: boolean;            // avaliação funcional concluída
  hasActiveWorkout?: boolean;         // prescrição ativa
  daysSinceLastTraining?: number | null;
  paymentOverdue?: boolean;
  cycleEndsInDays?: number | null;    // dias até o fim do ciclo (negativo = vencido)
}

/**
 * Deriva o status canônico a partir dos sinais. Ordem de prioridade pensada para o
 * painel do professor: bloqueios de cadastro primeiro, depois risco/renovação, depois ativo.
 */
export function deriveStudentStatus(s: StudentSignals): StudentStatus {
  if (s.baseStatus === "inactive") return "inativo";
  if (s.baseStatus === "interested") return "lead";

  if (!s.hasAnamnesis) return "anamnese_pendente";
  if (!s.hasAssessment) return "avaliacao_pendente";
  if (!s.hasActiveWorkout) return "aguardando_prescricao";

  // Já ativo — checa sinais de risco / renovação.
  if (s.baseStatus === "awaiting_renewal") return "renovacao";
  if (typeof s.cycleEndsInDays === "number" && s.cycleEndsInDays <= 0) return "renovacao";

  if (s.paymentOverdue) return "risco";
  if (typeof s.daysSinceLastTraining === "number" && s.daysSinceLastTraining >= 10) return "risco";

  return "ativo";
}

/** Lista os motivos que levaram ao status de risco/renovação (para o dashboard de evasão). */
export function riskReasons(s: StudentSignals): string[] {
  const reasons: string[] = [];
  if (s.paymentOverdue) reasons.push("Pagamento em atraso");
  if (typeof s.daysSinceLastTraining === "number" && s.daysSinceLastTraining >= 10)
    reasons.push(`Sem treinar há ${s.daysSinceLastTraining} dias`);
  if (typeof s.cycleEndsInDays === "number" && s.cycleEndsInDays <= 7)
    reasons.push(s.cycleEndsInDays <= 0 ? "Ciclo vencido" : `Ciclo vence em ${s.cycleEndsInDays} dias`);
  if (!s.hasActiveWorkout) reasons.push("Sem treino ativo");
  return reasons;
}
