import { describe, it, expect } from "vitest";
import {
  buildPublishDecisionLog,
  mapStrengthExercise,
  buildTrainingCycleMetadata,
  buildWorkoutRows,
} from "./publishStrengthPlan";

describe("buildPublishDecisionLog", () => {
  it("uses the existing prescricao source and classifies publish in the payload", () => {
    expect(buildPublishDecisionLog({
      studentId: "student-1",
      companyId: "company-1",
      readiness: "incompleto",
      edited: true,
      noLibrary: 2,
      workouts: 3,
    })).toEqual({
      student_id: "student-1",
      company_id: "company-1",
      source: "prescricao",
      summary: "prontidão: incompleto · 2 fora da biblioteca · editado pelo professor",
      payload: {
        kind: "publish",
        readiness: "incompleto",
        edited: true,
        no_library: 2,
        workouts: 3,
      },
    });
  });
});

describe("buildTrainingCycleMetadata", () => {
  it("usa apenas colunas reais de training_cycles; o vínculo do pacote fica na tabela de bundles", () => {
    const patch = buildTrainingCycleMetadata({ cycle_name: "Ciclo seguro", objective: "hipertrofia" }, 6, 2, "active");

    expect(patch).toEqual({
      status: "active",
      name: "Ciclo seguro",
      objective: "hipertrofia",
      duration_weeks: 6,
      delivery_status: "sent",
    });
    expect(patch).not.toHaveProperty("bundle_id");
  });
});

describe("mapStrengthExercise", () => {
  it("converte o exercício da IA para o formato do app do aluno (tudo string)", () => {
    const out = mapStrengthExercise({
      exercise_id: "abc",
      exercise_name: "Prancha Frontal",
      muscle_group: "Abdominais",
      sets: 3,
      reps: "20s",
      rest_seconds: 30,
      cues: "Glúteo contraído",
      biomechanical_note: "Estabilizadores",
    });
    expect(out).toEqual({
      exercise_id: "abc",
      exercise_name: "Prancha Frontal",
      muscle_group: "Abdominais",
      sets: "3",
      reps: "20s",
      rest: "30s",
      notes: "Glúteo contraído",
      // Campos de método/sistema de treino carregados pro app do aluno (badge explicado).
      method: null,
      group_id: null,
      method_seconds: null,
    });
  });

  it("usa fallbacks: library_exercise_name, biomechanical_note e campos vazios", () => {
    const out = mapStrengthExercise({
      library_exercise_name: "Agachamento",
      biomechanical_note: "Joelho alinhado",
    });
    expect(out.exercise_name).toBe("Agachamento");
    expect(out.exercise_id).toBeNull();
    expect(out.sets).toBe("");
    expect(out.reps).toBe("");
    expect(out.rest).toBe("");
    expect(out.notes).toBe("Joelho alinhado");
  });

  it("preserva a prescrição semanal que o app do aluno executa", () => {
    const out = mapStrengthExercise({
      exercise_id: "abc",
      exercise_name: "Remada Baixa",
      sets: 3,
      reps: "10-12",
      rest_seconds: 60,
      weekly_prescription: [
        {
          week: 5,
          block: "intensificacao",
          sets: 3,
          reps: "10-12",
          rir: "2",
          rest_seconds: 45,
          tempo: "2010",
          method: "biset",
          group_id: "m5_1",
          method_seconds: null,
          method_reason: "selected_safe_pair",
          set_types: ["normal", "normal", "normal"],
          instruction: "Execute o par em sequência.",
        },
      ],
    });

    expect(out.weekly_prescription).toEqual([
      expect.objectContaining({
        week: 5,
        block: "intensificacao",
        tempo: "2010",
        method: "biset",
        group_id: "m5_1",
        method_reason: "selected_safe_pair",
        set_types: ["normal", "normal", "normal"],
      }),
    ]);
  });

  it("normaliza payload legado e nunca publica drop como tipo de série", () => {
    const out = mapStrengthExercise({
      exercise_id: "legacy",
      exercise_name: "Cadeira Extensora",
      sets: 3,
      reps: "12",
      set_types: ["warmup", "normal", "drop"],
      method: "dropset",
      weekly_prescription: [{
        week: 4,
        block: "acumulacao",
        sets: 3,
        reps: "12",
        rir: "2",
        rest_seconds: 60,
        tempo: "2010",
        method: "dropset",
        set_types: ["normal", "normal", "drop"],
        instruction: "Drop-set na última série.",
      }],
    });
    expect(out.method).toBe("dropset");
    expect(out.set_types).toEqual(["warmup", "normal", "normal"]);
    expect(out.weekly_prescription?.[0].set_types).toEqual(["normal", "normal", "normal"]);
  });
});

describe("buildWorkoutRows", () => {
  const plan = {
    cycle_name: "Ciclo X",
    workouts: [
      {
        name: "Treino A",
        notes: "Foco core",
        day_of_week: 1,
        exercises: [
          { exercise_id: "e2", exercise_name: "B", exercise_order: 2, sets: 3, reps: "10" },
          { exercise_id: "e1", exercise_name: "A", exercise_order: 1, sets: 4, reps: "8" },
        ],
      },
      { name: "Treino B", day_of_week: 3, exercises: [] },
    ],
  };

  it("cria uma linha por sessão, com cycle_id/company_id e sort_order", () => {
    const rows = buildWorkoutRows(plan, "cyc-1", "co-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cycle_id: "cyc-1", company_id: "co-1", title: "Treino A", day_of_week: 1, sort_order: 1, description: "Foco core" });
    expect(rows[1]).toMatchObject({ name: "Treino B", sort_order: 2, day_of_week: 3 });
  });

  it("ordena exercícios por exercise_order", () => {
    const rows = buildWorkoutRows(plan, "cyc-1", "co-1");
    expect(rows[0].exercises.map((e) => e.exercise_name)).toEqual(["A", "B"]);
  });

  it("retorna [] quando o plano não tem workouts", () => {
    expect(buildWorkoutRows({}, "c", "co")).toEqual([]);
  });
});
