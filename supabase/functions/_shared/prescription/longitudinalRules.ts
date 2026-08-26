import { normalizeText } from "./presets.ts";
import { DELOAD_RULES } from "./methodology.ts";
import type { PrescriptionExplanation, PrescriptionInput, TrainingWorkout } from "./types.ts";

export type LongitudinalPhase = "base" | "acumulacao" | "intensificacao" | "consolidacao";

function numeric(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSequenceNumber(input: PrescriptionInput): number {
  return Math.max(1, Math.round(numeric(input.programSequence?.sequence_number ?? input.blockNumber, 1)));
}

export function resolveLongitudinalPhase(input: PrescriptionInput): LongitudinalPhase {
  const requested = normalizeText(input.programSequence?.phase);
  if (requested.includes("acumul")) return "acumulacao";
  if (requested.includes("intens")) return "intensificacao";
  if (requested.includes("consol") || requested.includes("deload") || requested.includes("regener")) return "consolidacao";
  if (requested.includes("base")) return "base";

  const position = ((resolveSequenceNumber(input) - 1) % 4) + 1;
  if (position === 2) return "acumulacao";
  if (position === 3) return "intensificacao";
  if (position === 4) return "consolidacao";
  return "base";
}

function performanceRequiresHold(input: PrescriptionInput): boolean {
  const context = input.previousPerformanceContext as Record<string, unknown> | null;
  if (!context || typeof context !== "object") return false;
  const eva = Number(context.max_eva ?? context.pain_eva ?? context.eva ?? 0);
  const adherence = Number(context.adherence_ratio ?? context.adherence ?? 1);
  return eva > 3 || (Number.isFinite(adherence) && adherence >= 0 && adherence < 0.65) || Boolean(context.technique_breakdown);
}

function cloneWorkouts(workouts: TrainingWorkout[]): TrainingWorkout[] {
  return workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      set_types: exercise.set_types ? [...exercise.set_types] : undefined,
      weekly_prescription: exercise.weekly_prescription?.map((week) => ({
        ...week,
        set_types: week.set_types ? [...week.set_types] : undefined,
      })),
    })),
  }));
}

export function applyLongitudinalProgression(workouts: TrainingWorkout[], input: PrescriptionInput) {
  const sequenceNumber = resolveSequenceNumber(input);
  const plannedPhase = resolveLongitudinalPhase(input);
  const hold = performanceRequiresHold(input);
  const phase: LongitudinalPhase = input.deload || hold ? "consolidacao" : plannedPhase;
  const nextWorkouts = cloneWorkouts(workouts);

  for (const workout of nextWorkouts) {
    for (const exercise of workout.exercises) {
      const main = exercise.phase === "forca_global" || exercise.phase === "forca_especifica";
      if (input.deload) {
        exercise.rir = DELOAD_RULES.rir;
        exercise.biomechanical_note = `${exercise.biomechanical_note} Deload: manter o orçamento reduzido e a execução técnica.`;
      } else if (phase === "acumulacao" && main) {
        exercise.sets += 1;
        exercise.rir = "2-3";
        exercise.biomechanical_note = `${exercise.biomechanical_note} Progressão longitudinal: mais uma série, preservando técnica e EVA <= 3.`;
      } else if (phase === "intensificacao" && main) {
        exercise.reps = exercise.phase === "forca_global" ? "6-8" : "8-10";
        exercise.rir = "2";
        exercise.rest_seconds = Math.max(exercise.rest_seconds, exercise.phase === "forca_global" ? 120 : 90);
        exercise.biomechanical_note = `${exercise.biomechanical_note} Progressão longitudinal: maior intensidade sem falha concêntrica.`;
      } else if (phase === "consolidacao") {
        exercise.sets = Math.max(1, Math.ceil(exercise.sets * 0.75));
        exercise.rir = "3-4";
        exercise.biomechanical_note = `${exercise.biomechanical_note} Consolidação: reduzir fadiga e colher feedback antes do próximo bloco.`;
      }
    }
  }

  const ruleId = input.deload
    ? "BN_LONGITUDINAL_DELOAD"
    : hold
      ? "BN_LONGITUDINAL_HOLD_BY_FEEDBACK"
      : `BN_LONGITUDINAL_${phase.toUpperCase()}`;
  const explanation: PrescriptionExplanation = {
    rule_id: ruleId,
    category: phase === "consolidacao" ? "deload" : "progressao",
    source: hold ? "feedback_aluno" : "objetivo",
    target: `ciclo_${sequenceNumber}`,
    action: input.deload
      ? `Manter o orçamento global reduzido e RIR ${DELOAD_RULES.rir} em todo o ciclo.`
      : phase === "base"
      ? "Manter exercícios-chave e recalibrar a execução para o novo mesociclo."
      : phase === "acumulacao"
        ? "Preservar exercícios estáveis e elevar o volume de forma limitada."
        : phase === "intensificacao"
          ? "Preservar os padrões principais e elevar a intensidade com margem técnica."
          : "Reduzir fadiga, manter competência técnica e preparar a próxima evolução.",
    reason: input.deload
      ? "O deload solicitado prevalece sobre a fase longitudinal para reduzir fadiga sem elevar volume ou intensidade."
      : hold
      ? "Dor, baixa aderência ou quebra técnica no ciclo anterior impedem progressão automática."
      : `O ciclo ${sequenceNumber} segue a onda longitudinal BN base -> acúmulo -> intensificação -> consolidação.`,
    severity: hold ? "moderada" : "leve",
  };

  return { sequenceNumber, phase, plannedPhase, hold, explanation, workouts: nextWorkouts };
}

export function previousExerciseIds(input: PrescriptionInput, phase?: string, muscleGroup?: string): Set<string> {
  const previous = input.previousPlanContext as { workouts?: Array<{ exercises?: Array<Record<string, unknown>> }> } | null;
  const ids = new Set<string>();
  if (!previous?.workouts) return ids;
  const wantedPhase = normalizeText(phase);
  const wantedGroup = normalizeText(muscleGroup);
  for (const workout of previous.workouts) {
    for (const exercise of workout.exercises || []) {
      const id = typeof exercise.exercise_id === "string" ? exercise.exercise_id : "";
      if (!id) continue;
      const exercisePhase = normalizeText(exercise.phase);
      const exerciseGroup = normalizeText(exercise.muscle_group);
      if ((wantedPhase && exercisePhase === wantedPhase) || (wantedGroup && exerciseGroup.includes(wantedGroup))) ids.add(id);
    }
  }
  return ids;
}
