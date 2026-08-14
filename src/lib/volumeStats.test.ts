import { describe, it, expect } from "vitest";
import { buildExerciseMeta, fractionalSetsByMuscleGroup, normalizeTargetWeight, volumeLoadByWeek } from "./volumeStats";

const cycles = [
  {
    workouts: [
      { id: "w1", exercises: [
        { exercise_id: "ex-supino", exercise_name: "Supino", muscle_group: "peitoral" },
        { exercise_id: "ex-agacho", exercise_name: "Agacho", muscle_group: "quadríceps" },
      ] },
    ],
  },
];

describe("volumeLoadByWeek", () => {
  it("soma volume-load por semana ISO e conta dias treinados", () => {
    const logs = [
      // semana de 2026-06-08 (seg) a 14 — duas datas distintas
      { weight: 100, reps_done: 10, session_date: "2026-06-08", workout_id: "w1", exercise_index: 0 },
      { weight: 50, reps_done: 10, session_date: "2026-06-10", workout_id: "w1", exercise_index: 1 },
      // semana seguinte
      { weight: 80, reps_done: 5, session_date: "2026-06-15", workout_id: "w1", exercise_index: 0 },
    ];
    const out = volumeLoadByWeek(logs);
    expect(out).toHaveLength(2);
    expect(out[0].weekStart).toBe("2026-06-08");
    expect(out[0].volume).toBe(1500); // 100*10 + 50*10
    expect(out[0].sessions).toBe(2);
    expect(out[1].volume).toBe(400); // 80*5
  });

  it("ignora logs sem data ou inválidos sem quebrar", () => {
    const out = volumeLoadByWeek([
      { weight: 10, reps_done: 10, session_date: null, workout_id: "w1", exercise_index: 0 },
      { weight: 10, reps_done: 10, session_date: "lixo", workout_id: "w1", exercise_index: 0 },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("fractionalSetsByMuscleGroup", () => {
  it("conta séries fracionárias para múltiplos alvos sem repartir LOAD", () => {
    const meta = buildExerciseMeta(cycles);
    const logs = [
      { weight: 100, reps_done: 10, session_date: "2026-06-08", workout_id: "w1", exercise_index: 0 },
    ];
    const out = fractionalSetsByMuscleGroup(logs, meta, [
      { exerciseId: "ex-supino", muscleGroup: "Peitoral", role: "primary", volumePercentage: 1 },
      { exerciseId: "ex-supino", muscleGroup: "Tríceps", role: "secondary", volumePercentage: 50 },
    ]);
    expect(out).toEqual([
      { group: "Peitoral", sets: 1 },
      { group: "Tríceps", sets: 0.5 },
    ]);
  });
});

describe("normalizeTargetWeight", () => {
  it.each([
    [1, 1],
    [100, 1],
    [0.5, 0.5],
    [50, 0.5],
    [20, 0.2],
  ])("normaliza %s para %s", (volumePercentage, expected) => {
    expect(normalizeTargetWeight({ volumePercentage })).toBe(expected);
  });

  it("usa defaults explícitos apenas quando o percentual está ausente", () => {
    expect(normalizeTargetWeight({ role: "primary", volumePercentage: null })).toBe(1);
    expect(normalizeTargetWeight({ role: "secondary", volumePercentage: null })).toBe(0.5);
  });

  it("rejeita papel ausente ou conflitante quando não há percentual", () => {
    expect(() => normalizeTargetWeight({ volumePercentage: null })).toThrow(TypeError);
    expect(() => normalizeTargetWeight({ role: "primary", isPrimary: false, volumePercentage: null })).toThrow(TypeError);
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])("rejeita percentual inválido %s", (volumePercentage) => {
    expect(() => normalizeTargetWeight({ volumePercentage })).toThrow(RangeError);
  });
});
