// Envia um treino da BIBLIOTECA (workout_templates) para um ALUNO: materializa o template
// numa matrícula ativa + novo ciclo ativo + linhas em `workouts` (que o app do aluno lê).
// Preserva os exercícios VERBATIM (group_id, method, vídeo, set_types) — diferente do
// publishStrengthPlan que remapeia do formato da IA.
import { supabase } from "@/integrations/supabase/client";
import { businessDateYmd } from "@/lib/businessDate";
import { sanitizeSetTypes } from "@/lib/setTypes";

const ymd = businessDateYmd;

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
  name: string;
  description?: string | null;
  workouts: Array<{ title?: string; description?: string | null; exercises?: any[] }>;
}

export interface SendResult { enrollmentId: string; cycleId: string; workoutsCreated: number; createdEnrollment: boolean; }

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

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + durationWeeks * 7 - 1);

  // 1) Matrícula ativa (ou cria).
  const { data: enr } = await db
    .from("enrollments").select("id").eq("student_id", studentId).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let enrollmentId: string | undefined = enr?.id;
  let createdEnrollment = false;
  if (!enrollmentId) {
    const { data: createdEnr, error: enrErr } = await db
      .from("enrollments")
      .insert({
        company_id: companyId, student_id: studentId, status: "active",
        start_date: ymd(today), end_date: ymd(end), training_start_date: ymd(today),
        notes: "Criada automaticamente ao enviar treino da biblioteca.",
      })
      .select("id").single();
    if (enrErr) throw new Error(`Falha ao criar matrícula: ${enrErr.message}`);
    enrollmentId = createdEnr.id; createdEnrollment = true;
  }

  // 2) Encerra ciclos ativos e cria o novo.
  await db.from("training_cycles").update({ status: "completed" }).eq("enrollment_id", enrollmentId).eq("status", "active");
  const { data: maxc } = await db
    .from("training_cycles").select("cycle_number").eq("enrollment_id", enrollmentId)
    .neq("status", "superseded")
    .order("cycle_number", { ascending: false }).limit(1).maybeSingle();
  const cycleNumber = (Number(maxc?.cycle_number) || 0) + 1;
  const { data: cycle, error: cycErr } = await db
    .from("training_cycles")
    .insert({
      enrollment_id: enrollmentId, cycle_number: cycleNumber, start_date: ymd(today), end_date: ymd(end),
      status: "active", company_id: companyId, student_id: studentId,
      name: template.name || "Treino", duration_weeks: durationWeeks,
    })
    .select("id").single();
  if (cycErr) throw new Error(`Falha ao criar ciclo: ${cycErr.message}`);

  // 3) Treinos — exercícios VERBATIM (mantém bi-set/drop-set/capas).
  const rows = workouts.map((w, i) => ({
    cycle_id: cycle.id,
    name: w?.title || `Treino ${String.fromCharCode(65 + i)}`,
    title: w?.title || `Treino ${String.fromCharCode(65 + i)}`,
    description: w?.description || null,
    day_of_week: null,
    sort_order: i + 1,
    company_id: companyId,
    exercises: Array.isArray(w?.exercises) ? w.exercises.map(sanitizeTemplateExercise) : [],
    created_by: createdBy || null,
  }));
  const { error: wErr } = await db.from("workouts").insert(rows);
  if (wErr) throw new Error(`Falha ao criar treinos: ${wErr.message}`);

  return { enrollmentId: enrollmentId!, cycleId: cycle.id, workoutsCreated: rows.length, createdEnrollment };
}
