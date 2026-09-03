// Envia um treino da BIBLIOTECA (workout_templates) para um ALUNO: materializa o template
// no ciclo vigente sem abrir uma segunda janela sobreposta.
// Preserva os exercícios VERBATIM (group_id, method, vídeo, set_types) — diferente do
// publishStrengthPlan que remapeia do formato da IA.
import { supabase } from "@/integrations/supabase/client";
import { sanitizeSetTypes } from "@/lib/setTypes";

export function sanitizeTemplateExercise(exercise: any) {
  const normalized = { ...exercise };
  const setTypes = sanitizeSetTypes(exercise?.set_types);
  normalized.set_types = setTypes;
  if (Array.isArray(exercise?.weekly_prescription)) {
    normalized.weekly_prescription = exercise.weekly_prescription.map((week: any) => ({
      ...week,
      set_types: sanitizeSetTypes(week?.set_types),
    }));
  }
  return normalized;
}

export interface TemplateForSend {
  id: string;
  name: string;
  description?: string | null;
  workouts: Array<{ title?: string; description?: string | null; exercises?: any[] }>;
}

export interface SendResult { enrollmentId: string; cycleId: string; workoutsCreated: number; createdEnrollment: boolean; }

function templateDeliveryError(message?: string) {
  const raw = String(message || "");
  if (raw.includes("template_cycle_overlap_ambiguous")) {
    return "Esta matrícula tem ciclos sobrepostos. O envio foi bloqueado sem alterar dados; corrija a duplicidade no perfil do aluno.";
  }
  if (raw.includes("template_cycle_already_has_workouts")) {
    return "O ciclo vigente já tem musculação. Edite o treino existente para não duplicar a prescrição.";
  }
  if (raw.includes("template_cycle_duration_mismatch")) {
    return "A duração do ciclo vigente é diferente da duração deste treino. Ajuste as datas do ciclo antes de enviar.";
  }
  if (raw.includes("template_cycle_no_current")) {
    return "Não existe um ciclo vigente hoje. Ajuste a data do ciclo no perfil do aluno antes de enviar.";
  }
  if (raw.includes("template_cycle_enrollment_not_found")) {
    return "O aluno não possui uma matrícula ativa pronta para receber este treino.";
  }
  return raw || "Falha ao enviar o treino da biblioteca.";
}

export async function sendTemplateToStudent(opts: {
  template: TemplateForSend;
  studentId: string;
  companyId: string;
  createdBy?: string | null;
  durationWeeks?: number;
}): Promise<SendResult> {
  const { template, studentId, companyId, createdBy } = opts;
  const db = supabase as any;
  const workouts = Array.isArray(template?.workouts) ? template.workouts : [];
  if (workouts.length === 0) throw new Error("Este treino da biblioteca não tem sessões para enviar.");
  const durationWeeks = Number(opts.durationWeeks) > 0 ? Number(opts.durationWeeks) : 6;
  const { data, error } = await db.rpc("apply_workout_template_to_current_cycle", {
    p_template_id: template.id,
    p_student_id: studentId,
    p_company_id: companyId,
    p_duration_weeks: durationWeeks,
    p_created_by: createdBy || null,
  });
  if (error) throw new Error(templateDeliveryError(error.message));
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.cycle_id || !result?.enrollment_id) throw new Error("O treino foi processado sem confirmar o ciclo de destino.");
  return {
    enrollmentId: result.enrollment_id,
    cycleId: result.cycle_id,
    workoutsCreated: Number(result.workouts_created) || workouts.length,
    createdEnrollment: false,
  };
}
