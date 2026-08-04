import { describe, expect, it } from "vitest";
import { resolveExerciseForWeek, resolveWorkoutForCycleWeek } from "./weeklyStrengthPeriodization";

const exercise = {
  exercise_name: "Remada baixa",
  sets: "3",
  reps: "8-12",
  rest: "90s",
  notes: "Controle a volta.",
  weekly_prescription: [
    { week: 1, block: "base", sets: 2, reps: "8-12", rir: "3-4", rest_seconds: 90, tempo: "3110", instruction: "Controle a descida." },
    { week: 5, block: "intensificacao", sets: 3, reps: "8-12", rir: "2", rest_seconds: 75, tempo: "2010", method: "biset", group_id: "m_w5", instruction: "Execute o par em sequência." },
  ],
};

describe("weekly strength periodization resolver", () => {
  it("aplica os parâmetros da semana sem alterar a ordem ou o contrato base", () => {
    expect(resolveExerciseForWeek(exercise, 5)).toMatchObject({
      exercise_name: "Remada baixa",
      sets: "3",
      reps: "8-12",
      rest: "75s",
      rir: "2",
      tempo: "2010",
      method: "biset",
      group_id: "m_w5",
      weekly_instruction: "Execute o par em sequência.",
    });
  });

  it("resolve automaticamente a semana vigente pela data de início do ciclo", () => {
    const workout = { id: "workout-1", exercises: [exercise] };
    const resolved = resolveWorkoutForCycleWeek(workout, "2026-07-06", 6, new Date("2026-08-05T12:00:00"));

    expect(resolved?.weekly_context).toMatchObject({ week: 5, block: "intensificacao", methods: ["biset"] });
    expect(resolved?.exercises[0].method).toBe("biset");
  });

  it("mantém prescrições antigas intactas quando não há contrato semanal", () => {
    const legacy = { id: "legacy", exercises: [{ sets: "3", reps: "10", rest: "60s", notes: "" }] };
    expect(resolveWorkoutForCycleWeek(legacy, "2026-07-06", 6, new Date("2026-08-05T12:00:00"))).toBe(legacy);
  });
});
