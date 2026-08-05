import { describe, expect, it } from "vitest";
import {
  resolveExerciseForWeek,
  resolveWorkoutForCycleWeek,
  summarizeExerciseWeeklyProgression,
  weeklyMethodLabel,
} from "./weeklyStrengthPeriodization";

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

  it("traduz os métodos avançados e resume os três blocos de duas semanas", () => {
    expect(weeklyMethodLabel("restpause", 20)).toBe("Rest-pause (20s)");
    expect(weeklyMethodLabel("dropset")).toBe("Drop-set");
    expect(weeklyMethodLabel("biset")).toBe("Bi-set");
    expect(weeklyMethodLabel("cluster", 15)).toBe("Cluster-set (15s)");

    const summary = summarizeExerciseWeeklyProgression([
      { week: 1, block: "base", sets: 2, reps: "10-12", rir: "3-4", rest_seconds: 75, tempo: "3110", instruction: "Base técnica." },
      { week: 2, block: "base", sets: 2, reps: "10-12", rir: "3", rest_seconds: 75, tempo: "3011", instruction: "Consolidar." },
      { week: 3, block: "acumulacao", sets: 3, reps: "8-12", rir: "2-3", rest_seconds: 60, tempo: "3010", method: "restpause", method_seconds: 20, instruction: "Rest-pause na última série." },
      { week: 4, block: "acumulacao", sets: 3, reps: "8-12", rir: "2-3", rest_seconds: 60, tempo: "2110", method: "dropset", instruction: "Um drop na última série." },
      { week: 5, block: "intensificacao", sets: 3, reps: "8-10", rir: "2", rest_seconds: 60, tempo: "2010", method: "biset", group_id: "m_w5", instruction: "Executar o par." },
      { week: 6, block: "intensificacao", sets: 3, reps: "6-8", rir: "2", rest_seconds: 75, tempo: "2010", method: "cluster", method_seconds: 15, instruction: "Blocos curtos." },
    ]);

    expect(summary.map((block) => block.weeks)).toEqual(["1-2", "3-4", "5-6"]);
    expect(summary[0].method).toBeNull();
    expect(summary[1].method).toContain("Rest-pause (20s)");
    expect(summary[1].method).toContain("Drop-set");
    expect(summary[2].method).toContain("Bi-set");
    expect(summary[2].method).toContain("Cluster-set (15s)");
  });
});
