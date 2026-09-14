import { describe, it, expect } from "vitest";
import { buildExerciseMeta, effectiveCoverageWindow, fractionalSetsByMuscleGroup, normalizeTargetWeight, volumeLoadByWeek } from "./volumeStats";

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

describe("effectiveCoverageWindow", () => {
  it("uses the newer cycle start instead of a full 30-day denominator", () => {
    expect(effectiveCoverageWindow({
      today: "2026-08-14",
      requestedDays: 30,
      cycleStart: "2026-08-10",
    })).toEqual({
      start: "2026-08-10",
      end: "2026-08-14",
      coveredDays: 5,
      coveredWeeks: 5 / 7,
    });
  });

  it("keeps the requested window when the cycle is older", () => {
    expect(effectiveCoverageWindow({
      today: "2026-08-14",
      requestedDays: 7,
      cycleStart: "2026-01-01",
    }).coveredDays).toBe(7);
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
      { group: "Triceps", sets: 0.5 },
    ]);
  });

  it("ignora targets contaminados e agrega apenas grupos anatômicos", () => {
    const meta = buildExerciseMeta(cycles);
    const logs = [
      { session_date: "2026-06-08", workout_id: "w1", exercise_index: 0 },
    ];
    const out = fractionalSetsByMuscleGroup(logs, meta, [
      { exerciseId: "ex-supino", muscleGroup: "Performance", role: "primary", volumePercentage: 100 },
      { exerciseId: "ex-supino", muscleGroup: "Core", role: "secondary", volumePercentage: 50 },
      { exerciseId: "ex-supino", muscleGroup: "Peito", role: "primary", volumePercentage: 100 },
    ]);
    expect(out).toEqual([{ group: "Peitoral", sets: 1 }]);
  });

  it("só aceita fallback de muscle_group quando ele é anatômico", () => {
    const logs = [
      { session_date: "2026-06-08", workout_id: "w2", exercise_index: 0 },
      { session_date: "2026-06-08", workout_id: "w2", exercise_index: 1 },
    ];
    const meta = buildExerciseMeta([{ workouts: [{ id: "w2", exercises: [
      { exercise_name: "Prancha", muscle_group: "Core" },
      { exercise_name: "Remada", muscle_group: "Costas" },
    ] }] }]);
    expect(fractionalSetsByMuscleGroup(logs, meta)).toEqual([{ group: "Dorsal", sets: 1 }]);
  });
});

describe("normalizeTargetWeight", () => {
  it.each([0, 1, 100, 0.5, 50, 20, -1, 101, Number.NaN, null])("ignora o percentual histórico %s", (volumePercentage) => {
    expect(normalizeTargetWeight({ role: "primary", volumePercentage })).toBe(1);
    expect(normalizeTargetWeight({ role: "secondary", volumePercentage })).toBe(0.5);
  });

  it("usa defaults explícitos apenas quando o percentual está ausente", () => {
    expect(normalizeTargetWeight({ role: "primary", volumePercentage: null })).toBe(1);
    expect(normalizeTargetWeight({ role: "secondary", volumePercentage: null })).toBe(0.5);
  });

  it("rejeita papel ausente ou conflitante quando não há percentual", () => {
    expect(() => normalizeTargetWeight({ volumePercentage: null })).toThrow(TypeError);
    expect(() => normalizeTargetWeight({ role: "primary", isPrimary: false, volumePercentage: null })).toThrow(TypeError);
  });

  it("aceita is_primary legado sem deixar percentual determinar papel", () => {
    expect(normalizeTargetWeight({ isPrimary: true, volumePercentage: 20 })).toBe(1);
    expect(normalizeTargetWeight({ isPrimary: false, volumePercentage: 100 })).toBe(0.5);
    expect(() => normalizeTargetWeight({ volumePercentage: 100 })).toThrow(TypeError);
  });

  it("não duplica aliases e mantém deltoides separados", () => {
    const logs = [{ workout_id: "w1", exercise_index: 0 }];
    const meta = buildExerciseMeta(cycles);
    const targets = [
      { exerciseId: "ex-supino", muscleGroup: "Peito", role: "primary", volumePercentage: 30 },
      { exerciseId: "ex-supino", muscleGroup: "Peitoral", role: "secondary", volumePercentage: 100 },
      { exerciseId: "ex-supino", muscleGroup: "Deltoide Anterior", role: "secondary" },
      { exerciseId: "ex-supino", muscleGroup: "Deltoide Posterior", role: "primary" },
      { exerciseId: "ex-supino", muscleGroup: "Core", role: "primary" },
    ];
    expect(Object.fromEntries(fractionalSetsByMuscleGroup(logs, meta, targets).map((item) => [item.group, item.sets]))).toEqual({
      Peitoral: 1, "Deltoide Anterior": 0.5, "Deltoide Posterior": 1,
    });
  });
});
