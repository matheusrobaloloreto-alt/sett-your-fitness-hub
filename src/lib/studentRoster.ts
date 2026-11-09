// These are registration statuses (students.status), separate from onboarding or risk signals.
export const STUDENT_RECORD_STATUS_FILTERS = [
  { id: "interested", label: "Interessado", plural: "Interessados" },
  { id: "active", label: "Ativo", plural: "Ativos" },
  { id: "pending", label: "Pendente", plural: "Pendentes" },
  { id: "awaiting_renewal", label: "Aguardando renovação", plural: "Aguardando renovação" },
  { id: "inactive", label: "Inativo", plural: "Inativos" },
] as const;

export function studentRecordStatusLabel(status: string) {
  return STUDENT_RECORD_STATUS_FILTERS.find(option => option.id === status)?.label ?? status;
}

export function countStudentRecords(students: readonly { status: string }[]) {
  const byStatus = new Map<string, number>();
  for (const { status } of students) byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  return { total: students.length, byStatus };
}

// Portfolio ownership is the current student assignment. Enrollment and historical
// performance attribution have their own trainer fields and answer different questions.
export const PORTFOLIO_TRAINER_COLUMN = "assigned_trainer_id";
export const PORTFOLIO_TRAINER_LABEL = "Professor da carteira";
export const OPEN_ENROLLMENT_STATUSES = ["active", "awaiting_training", "awaiting_renewal"];

export interface StudentContractSummary {
  planId: string | null;
  planName: string | null;
}

export function studentContractLabel(contract: StudentContractSummary | null | undefined) {
  if (contract === undefined) return "Contrato indisponível: falha de leitura";
  if (contract === null) return "Sem plano contratado vigente";
  if (!contract.planId) return "Matrícula vigente sem plano vinculado";
  return `Plano contratado vigente: ${contract.planName ?? "nome indisponível"}`;
}
