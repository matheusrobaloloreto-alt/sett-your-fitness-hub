// Publica a prescrição de FORÇA gerada no Studio (que vive em ai_strength_plans / results.musculacao)
// para o app do ALUNO. O app do aluno lê de `workouts` via `training_cycles` de uma `enrollment` ativa —
// então gerar a prescrição NÃO basta: é preciso materializar o plano nessas tabelas. Este helper faz isso
// client-side (RLS permite insert de admin/master escopado por empresa):
//   1) acha a matrícula ATIVA do aluno (ou cria uma);
//   2) exige alvo explícito quando existe agenda; só cria o primeiro ciclo sem agenda;
//   3) materializa uma nova revisão, preservando IDs históricos quando o ciclo já começou.
import { supabase } from "@/integrations/supabase/client";
import { businessDateYmd } from "@/lib/businessDate";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { sanitizeSetTypes } from "@/lib/setTypes";
import {
  DEFAULT_INDIVIDUAL_WEEKLY_TEMPO,
  INDIVIDUAL_WEEKLY_UI_VERSION,
  weeklySetTypesForSets,
} from "@/lib/weeklyStrengthPeriodization";
import { saveCycleWorkoutRevision } from "@/lib/workoutRevision";

// Formato que o app do aluno (StudentPortal/StudentWorkout) consome em workouts.exercises[].
export interface StudentWorkoutExercise {
  exercise_id: string | null;
  exercise_name: string;
  muscle_group: string;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  set_types?: string[];
  method?: string | null;
  group_id?: string | null;
  method_seconds?: number | null;
  method_reason?: string | null;
  weekly_ui_version?: string;
  weekly_prescription?: Array<{
    week: number;
    block: string;
    sets: number;
    reps: string;
    rir: string;
    rest_seconds: number;
    tempo: string;
    method?: string | null;
    group_id?: string | null;
    method_seconds?: number | null;
    method_reason?: string | null;
    set_types?: string[];
    instruction: string;
  }>;
}

export interface StudentWorkoutRow {
  cycle_id: string;
  name: string;
  title: string;
  description: string | null;
  day_of_week: number | null;
  sort_order: number;
  company_id: string;
  exercises: StudentWorkoutExercise[];
}

export interface PublishResult {
  enrollmentId: string;
  cycleId: string;
  bundleId: string;
  workoutsCreated: number;
  createdEnrollment: boolean;
}

type PreviousWorkoutRow = {
  id: string;
  updated_at: string;
  sort_order?: number | null;
  title?: string | null;
  name?: string | null;
  exercises?: unknown;
};

// Converte um exercício do plano da IA -> formato do app do aluno (tudo string, como o app espera).
export function mapStrengthExercise(e: any): StudentWorkoutExercise {
  const restSeconds = e?.rest_seconds;
  const mapped: StudentWorkoutExercise = {
    exercise_id: e?.exercise_id ?? null,
    exercise_name: e?.exercise_name ?? e?.library_exercise_name ?? "Exercício",
    muscle_group: e?.muscle_group ?? "",
    sets: e?.sets != null ? String(e.sets) : "",
    reps: e?.reps != null ? String(e.reps) : "",
    rest: restSeconds != null && restSeconds !== "" ? `${restSeconds}s` : (e?.rest != null ? String(e.rest) : ""),
    notes: [e?.notes, (e?.cues && String(e.cues).trim()) || e?.biomechanical_note].filter(Boolean).join("\n"),
    method: e?.method ?? null,
    group_id: e?.group_id ?? null,
    method_seconds: e?.method_seconds ?? null,
  };
  const setTypes = sanitizeSetTypes(e?.set_types);
  if (setTypes) mapped.set_types = setTypes;
  if (e?.method_reason != null) mapped.method_reason = e.method_reason;
  if (Array.isArray(e?.weekly_prescription)) {
    mapped.weekly_ui_version = INDIVIDUAL_WEEKLY_UI_VERSION;
    mapped.weekly_prescription = e.weekly_prescription
      .filter((week: any) => Number(week?.week) > 0)
      .map((week: any) => {
        const sets = Math.max(1, Number(week.sets) || Number(e?.sets) || 1);
        return {
          week: Number(week.week),
          block: String(week.block || "base"),
          sets,
          reps: String(week.reps ?? e?.reps ?? ""),
          rir: String(week.rir ?? e?.rir ?? ""),
          rest_seconds: Math.max(0, Number(week.rest_seconds) || Number(restSeconds) || 0),
          tempo: String(week.tempo || e?.tempo || DEFAULT_INDIVIDUAL_WEEKLY_TEMPO),
          method: week.method ?? null,
          group_id: week.group_id ?? null,
          method_seconds: week.method_seconds ?? null,
          method_reason: week.method_reason ?? null,
          set_types: weeklySetTypesForSets(week.set_types || e?.set_types, sets),
          instruction: String(week.instruction || ""),
        };
      });
  }
  return mapped;
}

// Pure: monta as linhas de `workouts` a partir do plano. Testável sem rede.
export function buildWorkoutRows(plan: any, cycleId: string, companyId: string): StudentWorkoutRow[] {
  const workouts = Array.isArray(plan?.workouts) ? plan.workouts : [];
  return workouts.map((w: any, i: number) => {
    const exs = Array.isArray(w?.exercises) ? w.exercises : [];
    const ordered = [...exs].sort(
      (a, b) => (Number(a?.exercise_order) || 0) - (Number(b?.exercise_order) || 0),
    );
    return {
      cycle_id: cycleId,
      name: w?.name ?? `Treino ${i + 1}`,
      title: w?.name ?? `Treino ${i + 1}`,
      description: w?.notes ?? null,
      day_of_week: typeof w?.day_of_week === "number" ? w.day_of_week : null,
      sort_order: i + 1,
      company_id: companyId,
      exercises: ordered.map(mapStrengthExercise),
    };
  });
}

export function buildTrainingCycleMetadata(
  plan: any,
  durationWeeks: number,
  cycleNumber: number,
  status: string,
) {
  return {
    status,
    name: plan?.cycle_name ?? `Ciclo ${cycleNumber}`,
    objective: plan?.objective ?? null,
    duration_weeks: durationWeeks,
    delivery_status: "sent",
  };
}

export function buildPublishDecisionLog(input: {
  studentId: string;
  companyId: string;
  readiness: string | null;
  edited: boolean;
  noLibrary: number;
  workouts: number;
}) {
  const decisions: string[] = [];
  if (input.readiness && input.readiness !== "pronto") decisions.push(`prontidão: ${input.readiness}`);
  if (input.noLibrary > 0) decisions.push(`${input.noLibrary} fora da biblioteca`);
  if (input.edited) decisions.push("editado pelo professor");

  return {
    student_id: input.studentId,
    company_id: input.companyId,
    source: "prescricao" as const,
    summary: decisions.length ? decisions.join(" · ") : "publicado como a IA gerou",
    payload: {
      kind: "publish" as const,
      readiness: input.readiness,
      edited: input.edited,
      no_library: input.noLibrary,
      workouts: input.workouts,
    },
  };
}

const ymd = businessDateYmd;

export async function publishStrengthPlanToStudent(opts: {
  plan: any;
  studentId: string;
  companyId: string;
  createdBy?: string | null;
  aiOriginal?: any; // P9/P15 — plano original da IA, para versionar/diff.
  bundleId?: string | null;
  targetCycleId?: string | null;
  replaceTargetCycle?: boolean;
}): Promise<PublishResult> {
  const { plan, studentId, companyId, createdBy } = opts;
  const db = supabase as any;

  const workouts = Array.isArray(plan?.workouts) ? plan.workouts : [];
  if (workouts.length === 0) throw new Error("O plano de força não tem treinos para publicar.");
  const durationWeeks = Number(plan?.duration_weeks) > 0 ? Number(plan.duration_weeks) : 6;

  const today = new Date();
  const todayYmd = ymd(today);
  const end = new Date(today);
  end.setDate(end.getDate() + durationWeeks * 7 - 1);
  const selectCycleMessage = "Selecione o ciclo da agenda antes de publicar; confira a matrícula e a vigência.";

  // Resolve ownership, agenda and replacement consent before changing any bundle or row.
  let targetCycle: any = null;
  if (opts.targetCycleId) {
    const { data, error } = await db.from("training_cycles")
      .select("id,enrollment_id,student_id,company_id,cycle_number,start_date,end_date,status,prescribed_offline_at,prescribed_offline_by,prescribed_offline_note")
      .eq("id", opts.targetCycleId).eq("company_id", companyId).eq("student_id", studentId).maybeSingle();
    if (error) throw new Error(`Falha ao consultar ciclo agendado: ${error.message}`);
    if (!data || data.status === "superseded" || !data.enrollment_id) throw new Error(selectCycleMessage);
    targetCycle = data;
  }
  let enrollmentQuery = db.from("enrollments").select("id,company_id,student_id,status,start_date,end_date")
    .eq("student_id", studentId).eq("company_id", companyId);
  if (targetCycle) enrollmentQuery = enrollmentQuery.eq("id", targetCycle.enrollment_id);
  const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery;
  if (enrollmentError) throw new Error(`Falha ao consultar matrícula: ${enrollmentError.message}`);
  const eligible = (enrollmentRows || []).filter((row: any) =>
    ["active", "awaiting_training", "awaiting_renewal"].includes(row.status));
  const current = targetCycle ? eligible : eligible.filter((row: any) =>
    row.start_date && row.end_date && row.start_date <= todayYmd && row.end_date >= todayYmd);
  if (current.length > 1 || (targetCycle && current.length !== 1)
    || (!targetCycle && !current.length && (enrollmentRows || []).length)) throw new Error(selectCycleMessage);
  let enrollmentId: string | undefined = current[0]?.id;
  if (!targetCycle && enrollmentId) {
    const { data: agenda, error } = await db.from("training_cycles").select("id")
      .eq("enrollment_id", enrollmentId).eq("company_id", companyId).eq("student_id", studentId);
    if (error) throw new Error(`Falha ao consultar agenda: ${error.message}`);
    if (agenda?.length) throw new Error(selectCycleMessage);
  }
  let previousWorkoutList: PreviousWorkoutRow[] = [];
  if (targetCycle) {
    const { data, error } = await db.from("workouts").select("id,updated_at,sort_order,title,name,exercises")
      .eq("cycle_id", targetCycle.id).is("superseded_at", null).order("sort_order");
    if (error) throw new Error(`Falha ao consultar treinos do ciclo: ${error.message}`);
    previousWorkoutList = data || [];
    if ((filterMaterializedWorkouts(previousWorkoutList).length || targetCycle.prescribed_offline_at || targetCycle.prescribed_offline_by || targetCycle.prescribed_offline_note)
      && opts.replaceTargetCycle !== true) throw new Error("Este ciclo já tem prescrição. Confirme a substituição para publicar novamente.");
  }
  if (opts.bundleId) {
    const { data: bundle, error } = await db.from("prescription_bundles").select("id")
      .eq("id", opts.bundleId).eq("company_id", companyId).eq("student_id", studentId).maybeSingle();
    if (error || !bundle) throw new Error("O pacote não pertence a este aluno/empresa ou não está disponível.");
  }
  let createdEnrollment = false;
  let bundleId = opts.bundleId ?? null;
  if (!bundleId) {
    bundleId = crypto.randomUUID();
    const { error: bundleError } = await db.from("prescription_bundles").insert({
      id: bundleId,
      company_id: companyId,
      student_id: studentId,
      has_strength: true,
      has_cardio: false,
      has_swimming: false,
      has_cycling: false,
      has_nutrition: false,
      modalities: ["musculacao"],
      status: "generating",
      notes: "Pacote criado na publicação manual/template do Studio.",
    });
    if (bundleError) throw new Error(`Falha ao criar pacote da publicação: ${bundleError.message}`);
  } else {
    const { error: bundleStatusError } = await db.from("prescription_bundles")
      .update({ status: "generating", generation_error: null })
      .eq("id", bundleId)
      .eq("company_id", companyId)
      .eq("student_id", studentId);
    if (bundleStatusError) throw new Error(`Falha ao preparar pacote da publicação: ${bundleStatusError.message}`);
  }

  try {
  if (!enrollmentId) {
    const { data, error } = await db.from("enrollments").insert({
      company_id: companyId, student_id: studentId, status: "active", start_date: todayYmd,
      end_date: ymd(end), training_start_date: todayYmd,
      notes: "Criada automaticamente ao publicar prescrição do Studio.",
    }).select("id").single();
    if (error) throw new Error(`Falha ao criar matrícula: ${error.message}`);
    enrollmentId = data.id; createdEnrollment = true;
  }
  let cycle: any = targetCycle;
  if (!cycle) {
    // Enrollment creation may trigger agenda generation. Never append over those slots.
    const { data: generatedAgenda, error: agendaError } = await db.from("training_cycles").select("id")
      .eq("enrollment_id", enrollmentId).eq("company_id", companyId).eq("student_id", studentId);
    if (agendaError) throw new Error(`Falha ao conferir agenda: ${agendaError.message}`);
    if (generatedAgenda?.length) throw new Error(selectCycleMessage);
    // A first publication is allowed only after proving there is no existing agenda.
    const { data, error } = await db.from("training_cycles").insert({
      enrollment_id: enrollmentId, cycle_number: 1, start_date: todayYmd, end_date: ymd(end),
      company_id: companyId, student_id: studentId,
      ...buildTrainingCycleMetadata(plan, durationWeeks, 1, "pending"),
    }).select("id,enrollment_id,cycle_number,start_date,end_date,status").single();
    if (error) throw new Error(`Falha ao criar ciclo: ${error.message}`);
    cycle = data;
  }
  const rows = buildWorkoutRows(plan, cycle.id, companyId).map((row) => createdBy ? { ...row, created_by: createdBy } : row);
  await saveCycleWorkoutRevision(db, {
    cycleId: cycle.id,
    expectedRows: previousWorkoutList.map((workout) => ({
      id: workout.id,
      updated_at: workout.updated_at,
    })),
    workouts: rows.map((workout) => ({
      title: workout.title || workout.name,
      description: workout.description || null,
      day_of_week: workout.day_of_week,
      exercises: workout.exercises,
    })),
  });

  const { error: bundleLinkError } = await db.from("prescription_bundles")
    .update({ training_cycle_id: cycle.id, generation_error: null })
    .eq("id", bundleId).eq("company_id", companyId).eq("student_id", studentId);
  if (bundleLinkError) throw new Error(`Treino publicado, mas falhou ao vincular o pacote: ${bundleLinkError.message}`);

  const { error: bundleItemError } = await db.from("prescription_bundle_items").insert({
    bundle_id: bundleId,
    company_id: companyId,
    student_id: studentId,
    modality: "musculacao",
    entity_type: "training_cycle",
    entity_id: cycle.id,
  });
  if (bundleItemError && bundleItemError.code !== "23505") {
    throw new Error(`Treino publicado, mas falhou ao registrar o ciclo no pacote: ${bundleItemError.message}`);
  }

  const cycleIsCurrent = cycle.start_date <= todayYmd && cycle.end_date >= todayYmd;
  const cycleStatus = cycle.end_date < todayYmd ? "completed" : cycleIsCurrent ? "active" : "pending";
  if (cycleStatus === "active") {
    const { error: closeOldCyclesError } = await db.from("training_cycles")
      .update({ status: "completed" })
      .eq("enrollment_id", enrollmentId)
      .eq("status", "active")
      .neq("id", cycle.id);
    if (closeOldCyclesError) throw new Error(`Falha ao encerrar o ciclo anterior: ${closeOldCyclesError.message}`);
  }
  const { error: activateCycleError } = await db.from("training_cycles")
    .update(buildTrainingCycleMetadata(plan, durationWeeks, cycle.cycle_number, cycleStatus))
    .eq("id", cycle.id);
  if (activateCycleError) throw new Error(`Falha ao atualizar o ciclo: ${activateCycleError.message}`);

  const { error: bundleFinalizeError } = await db.from("prescription_bundles")
    .update({ status: cycleIsCurrent ? "active" : "scheduled", generation_error: null })
    .eq("id", bundleId).eq("company_id", companyId).eq("student_id", studentId);
  if (bundleFinalizeError) throw new Error(`Treino publicado, mas falhou ao finalizar o pacote: ${bundleFinalizeError.message}`);

  return { enrollmentId: enrollmentId!, cycleId: cycle.id, bundleId, workoutsCreated: rows.length, createdEnrollment };
  } catch (error) {
    await db.from("prescription_bundles").update({
      status: "failed",
      generation_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    }).eq("id", bundleId).eq("company_id", companyId).eq("student_id", studentId);
    throw error;
  }
}
