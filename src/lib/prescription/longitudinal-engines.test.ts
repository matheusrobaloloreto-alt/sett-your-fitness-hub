import { describe, expect, it } from "vitest";
import { buildNutritionProgram } from "../../../supabase/functions/_shared/nutrition/nutritionEngine.ts";
import { buildCardioProgram } from "../../../supabase/functions/_shared/prescription/cardio/cardioEngine.ts";
import {
  applyLongitudinalProgression,
  previousExerciseIds,
} from "../../../supabase/functions/_shared/prescription/longitudinalRules.ts";
import { enforceVolumeCaps } from "../../../supabase/functions/_shared/prescription/volumeRules.ts";
import type {
  PrescriptionInput,
  TrainingWorkout,
} from "../../../supabase/functions/_shared/prescription/types.ts";

function workout(sets = 3): TrainingWorkout {
  return {
    name: "Treino A",
    day_of_week: 1,
    duration_min: 50,
    split_focus: "forca global",
    volume_load_estimate: "conservador",
    notes: "",
    exercises: [{
      phase: "forca_global",
      exercise_id: "exercise-1",
      exercise_name: "Agachamento caixa",
      library_exercise_name: "Agachamento caixa",
      muscle_group: "quadriceps",
      sets,
      reps: "8-10",
      load_percent_1rm: null,
      rir: "3",
      rest_seconds: 90,
      tempo: "3010",
      exercise_order: 1,
      cues: "Controle",
      biomechanical_note: "Base técnica.",
    }],
  };
}

function input(sequence: number, extra: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    catalog: [],
    blockNumber: sequence,
    programSequence: { sequence_number: sequence, total_cycles: 4 },
    ...extra,
  };
}

describe("progressão longitudinal determinística", () => {
  it("mantém a onda base, acúmulo, intensificação e consolidação entre ciclos", () => {
    const accumulation = [workout()];
    const intensity = [workout()];
    const consolidation = [workout(4)];

    const accumulationResult = applyLongitudinalProgression(accumulation, input(2));
    expect(accumulationResult.phase).toBe("acumulacao");
    expect(accumulationResult.workouts[0].exercises[0].sets).toBe(4);
    expect(accumulation[0].exercises[0].sets).toBe(3);

    const intensityResult = applyLongitudinalProgression(intensity, input(3));
    expect(intensityResult.phase).toBe("intensificacao");
    expect(intensityResult.workouts[0].exercises[0]).toMatchObject({ reps: "6-8", rir: "2", rest_seconds: 120 });
    expect(intensity[0].exercises[0]).toMatchObject({ reps: "8-10", rir: "3", rest_seconds: 90 });

    const consolidationResult = applyLongitudinalProgression(consolidation, input(4));
    expect(consolidationResult.phase).toBe("consolidacao");
    expect(consolidationResult.workouts[0].exercises[0]).toMatchObject({ sets: 3, rir: "3-4" });
    expect(consolidation[0].exercises[0]).toMatchObject({ sets: 4, rir: "3" });
  });

  it("retorna workouts progredidos explicitamente sem depender de mutação lateral", () => {
    const plan = [workout(2)];
    const result = applyLongitudinalProgression(plan, input(2, { fitnessLevel: "avancado", objective: "hipertrofia" }));

    expect(result.workouts[0].exercises[0]).toMatchObject({
      sets: 3,
      rir: "2-3",
    });
    expect(plan[0].exercises[0]).toMatchObject({
      sets: 2,
      rir: "3",
    });
  });

  it("usa o resultado longitudinal para preservar +1 série abaixo do cap e reduzir acima dele", () => {
    const accumulationInput = input(2, {
      fitnessLevel: "avancado",
      objective: "hipertrofia",
      daysPerWeek: 3,
    });
    const belowCap = applyLongitudinalProgression([workout(2)], accumulationInput);
    const belowCapped = enforceVolumeCaps(belowCap.workouts, accumulationInput);
    const aboveCap = applyLongitudinalProgression([workout(16)], accumulationInput);
    const aboveCapped = enforceVolumeCaps(aboveCap.workouts, accumulationInput);

    expect(belowCapped.workouts[0].exercises[0].sets).toBe(3);
    expect(aboveCap.workouts[0].exercises[0].sets).toBe(17);
    expect(aboveCapped.workouts[0].exercises[0].sets).toBe(16);
  });

  it("não progride automaticamente quando dor, baixa aderência ou técnica pedem manutenção", () => {
    const plan = [workout(4)];
    const result = applyLongitudinalProgression(plan, input(2, {
      previousPerformanceContext: { max_eva: 5, adherence_ratio: 0.4, technique_breakdown: true },
    }));

    expect(result).toMatchObject({ phase: "consolidacao", plannedPhase: "acumulacao", hold: true });
    expect(result.explanation.rule_id).toBe("BN_LONGITUDINAL_HOLD_BY_FEEDBACK");
    expect(result.workouts[0].exercises[0].sets).toBe(3);
    expect(plan[0].exercises[0].sets).toBe(4);
  });

  it("prioriza exercícios seguros já usados no bloco anterior", () => {
    const ids = previousExerciseIds(input(2, {
      previousPlanContext: {
        workouts: [{ exercises: [{ exercise_id: "exercise-1", phase: "forca_global", muscle_group: "quadriceps" }] }],
      },
    }), "forca_global", "quadriceps");

    expect([...ids]).toEqual(["exercise-1"]);
  });

  it("cardio herda o contexto anterior e periodiza o bloco seguinte sem IA", () => {
    const first = buildCardioProgram({
      sport: "corrida",
      goal: "5 km",
      duration_weeks: 6,
      days_per_week: 3,
      session_duration: 45,
      current_volume: 18,
      program_sequence: { sequence_number: 1, total_cycles: 4, phase: "base" },
    });
    const second = buildCardioProgram({
      sport: "corrida",
      goal: "5 km",
      duration_weeks: 6,
      days_per_week: 3,
      session_duration: 45,
      previous_plan_context: first,
      program_sequence: { sequence_number: 2, total_cycles: 4, phase: "acumulacao" },
    });

    expect(second.generated_by).toBe("bn_cardio_engine_v2");
    expect(second.program_sequence).toMatchObject({ sequence_number: 2, phase: "acumulacao", previous_plan_used: true });
    expect(second.coach_notes?.join(" ")).toContain("Continuidade longitudinal");
    expect(second.weeks).toHaveLength(6);
  });

  it("cardio reduz intensidade quando a integração de anamnese e avaliação pede cautela", () => {
    const plan = buildCardioProgram({
      sport: "corrida",
      goal: "10 km",
      duration_weeks: 6,
      days_per_week: 4,
      session_duration: 60,
      experience_months: 18,
      eva: { joelho: 4 },
      prescription_integration: {
        readiness: { status: "cautela" },
        risk_screening: { pain_regions: ["joelho"], red_flags: [], yellow_flags: ["valgo dinâmico"] },
        prescription_decision: { blocked_progressions: ["bloquear impacto alto enquanto houver dor"] },
      },
    });

    expect(plan.safety_check.eva_status).toBe("atencao");
    expect(plan.safety_check.restrictions.join(" ")).toContain("Avaliação integrada em cautela");
    expect(plan.weeks.flatMap((week) => week.sessions).every((session) => !/Z4|Z5/.test(session.zone))).toBe(true);
  });

  it("cardio mantém somente regeneração diante de red flag integrada", () => {
    const plan = buildCardioProgram({
      sport: "ciclismo",
      duration_weeks: 6,
      days_per_week: 3,
      prescription_integration: {
        readiness: { status: "cautela" },
        risk_screening: { pain_regions: ["joelho"], red_flags: ["dor severa"], yellow_flags: [] },
      },
    });

    expect(plan.safety_check.restrictions.join(" ")).toContain("Red flag");
    expect(plan.weeks.flatMap((week) => week.sessions).every((session) => session.zone === "Z1")).toBe(true);
  });

  it("cardio rejeita modalidade sem motor em vez de tratá-la como corrida", () => {
    expect(() => buildCardioProgram({ sport: "tênis" }))
      .toThrow("Modalidade não suportada");
  });

  it("cardio distingue horas semanais de quilômetros semanais", () => {
    const hoursPlan = buildCardioProgram({
      sport: "corrida",
      duration_weeks: 6,
      days_per_week: 4,
      session_duration: 30,
      current_volume: 4,
      current_volume_unit: "hours_week",
    });
    const kilometersPlan = buildCardioProgram({
      sport: "corrida",
      duration_weeks: 6,
      days_per_week: 4,
      session_duration: 30,
      current_volume: 4,
      current_volume_unit: "km_week",
    });

    expect(hoursPlan.weeks[0].volume_hours).toBeGreaterThan(kilometersPlan.weeks[0].volume_hours);
    expect(hoursPlan.coach_notes?.join(" ")).toContain("4 h/sem");
    expect(kilometersPlan.coach_notes?.join(" ")).toContain("4 km/sem");
  });

  it("nutrição acompanha a fase da carga mantendo proteína e continuidade", () => {
    const first = buildNutritionProgram({
      weight_kg: 75,
      height_cm: 175,
      age: 30,
      gender: "M",
      objective: "hipertrofia",
      activity_level: "moderado",
      program_sequence: { sequence_number: 1, total_cycles: 4, phase: "base" },
    });
    const third = buildNutritionProgram({
      weight_kg: 75,
      height_cm: 175,
      age: 30,
      gender: "M",
      objective: "hipertrofia",
      activity_level: "moderado",
      previous_plan_context: first,
      program_sequence: { sequence_number: 3, total_cycles: 4, phase: "intensificacao" },
    });

    expect(third.program_sequence).toMatchObject({ sequence_number: 3, phase: "intensificacao", previous_plan_used: true });
    expect(third.protein_g).toBe(first.protein_g);
    expect(third.energy_summary.protein_total_g).toBe(first.energy_summary.protein_total_g);
    expect(third.carb_cycling.high_day_carbs_g).toBeGreaterThan(first.carb_cycling.high_day_carbs_g);
    expect(third.general_notes).toContain("Continuidade longitudinal");
  });

  it("nutrição usa refeições, restrições, estrutura disponível e orçamento da anamnese", () => {
    const plan = buildNutritionProgram({
      weight_kg: 68,
      height_cm: 165,
      age: 31,
      gender: "F",
      objective: "emagrecimento",
      activity_level: "moderado",
      meals_per_day: 7,
      food_restrictions: "vegana e intolerante à lactose",
      budget: "econômico",
      has_microwave: false,
      nutrition_context: "Horários habituais: 06:30, 09:30, 12:30, 15:30, 18:00, 20:30, 22:00",
    });

    expect(plan.meals).toHaveLength(7);
    expect(plan.meals.map((meal) => meal.time)).toEqual(["06:30", "09:30", "12:30", "15:30", "18:00", "20:30", "22:00"]);
    const serialized = JSON.stringify(plan).toLowerCase();
    expect(serialized).not.toMatch(/iogurte|queijo|whey|ovos|frango|peixe|carne magra|patinho/);
    expect(serialized).toContain("leguminosas");
    expect(serialized).toContain("sanduíche");
  });

  it("nutrição não interpreta nomes de campos vazios como endurance ou baixa prontidão", () => {
    const plan = buildNutritionProgram({
      weight_kg: 80,
      height_cm: 178,
      age: 35,
      gender: "M",
      objective: "emagrecimento",
      activity_level: "moderado",
      running_plan_context: null,
      prescription_integration: { readiness: null, risk_screening: { red_flags: [], yellow_flags: [] } },
    });

    expect(plan.energy_summary.carbs_g_per_kg).toBeLessThan(3);
    expect(plan.energy_summary.deficit_surplus_percent).toBe(-20);
    expect(plan.warnings.join(" ")).not.toContain("Baixa prontidão");
  });

  it("nutrição torna energia e hidratação conservadoras quando sono, estresse e carga indicam baixa prontidão", () => {
    const baseline = buildNutritionProgram({
      weight_kg: 80,
      height_cm: 178,
      age: 35,
      gender: "M",
      objective: "emagrecimento",
      activity_level: "moderado",
    });
    const constrained = buildNutritionProgram({
      weight_kg: 80,
      height_cm: 178,
      age: 35,
      gender: "M",
      objective: "emagrecimento",
      activity_level: "moderado",
      stress_score: 9,
      sleep_quality: 4,
      training_hours_per_day: 2,
      prescription_integration: { readiness: "baixa", risk_screening: { red_flags: ["dor severa"] } },
    });

    expect(constrained.energy_summary.deficit_surplus_percent).toBe(-10);
    expect(constrained.total_calories).toBeGreaterThan(baseline.total_calories);
    expect(constrained.energy_summary.hydration_ml).toBe(baseline.energy_summary.hydration_ml + 1000);
    expect(constrained.warnings.join(" ")).toContain("estratégia calórica conservadora");
    expect(constrained.supplementation[0].dose).toContain("nutricionista ou médico");
  });
});
