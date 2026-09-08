export type StudentProgramPrimaryTabValue = "overview" | "program" | "analytics" | "evaluations";

export type StudentProgramHandoffTab =
  | StudentProgramPrimaryTabValue
  | "prescricao"
  | "integrada"
  | string
  | null
  | undefined;

export type StudentPrescriptionPanel = "prescricao" | "integrada";

export const STUDENT_PROGRAM_PRIMARY_TABS: ReadonlyArray<{
  value: StudentProgramPrimaryTabValue;
  label: string;
}> = [
  { value: "overview", label: "Visão geral" },
  { value: "program", label: "Programa" },
  { value: "analytics", label: "Análise" },
  { value: "evaluations", label: "Avaliação" },
] as const;

export function isStudentProgramPrimaryTab(value: unknown): value is StudentProgramPrimaryTabValue {
  return STUDENT_PROGRAM_PRIMARY_TABS.some((tab) => tab.value === value);
}

export function resolveStudentProgramHandoff(tab: StudentProgramHandoffTab): {
  activeTab: StudentProgramPrimaryTabValue | null;
  prescriptionPanel: StudentPrescriptionPanel | null;
} {
  if (tab === "prescricao") {
    return { activeTab: "program", prescriptionPanel: "prescricao" };
  }
  if (tab === "integrada") {
    return { activeTab: "program", prescriptionPanel: "integrada" };
  }
  if (isStudentProgramPrimaryTab(tab)) {
    return { activeTab: tab, prescriptionPanel: null };
  }
  return { activeTab: null, prescriptionPanel: null };
}
