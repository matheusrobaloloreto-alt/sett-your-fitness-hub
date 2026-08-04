import { describe, it, expect } from "vitest";
import { mapStrengthExercise, buildWorkoutRows } from "./publishStrengthPlan";

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
      }),
    ]);
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
