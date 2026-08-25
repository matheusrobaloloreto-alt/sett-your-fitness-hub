import { describe, expect, it } from "vitest";
import {
  ALL_METHOD_IDS,
  planAdvancedMethods,
  type MethodId,
} from "../../../supabase/functions/_shared/prescription/advancedMethods.ts";

const SAFE_ACCESSORIES = [
  { exercise_id: "fly", exercise_name: "Crucifixo Máquina", muscle_group: "peitoral", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
  { exercise_id: "row", exercise_name: "Remada Máquina Apoiada", muscle_group: "costas", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
  { exercise_id: "curl", exercise_name: "Rosca no Cabo", muscle_group: "biceps", phase: "forca_especifica", equipment: "cabo", is_isolation: true },
  { exercise_id: "pressdown", exercise_name: "Tríceps Corda", muscle_group: "triceps", phase: "forca_especifica", equipment: "cabo", is_isolation: true },
];

const SAME_GROUP_ACCESSORIES = [
  { exercise_id: "ext", exercise_name: "Cadeira Extensora", muscle_group: "quadriceps", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
  { exercise_id: "sissy", exercise_name: "Sissy Squat Assistido", muscle_group: "quadriceps", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
  { exercise_id: "leg", exercise_name: "Leg Press Unilateral Leve", muscle_group: "quadriceps", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
  { exercise_id: "step", exercise_name: "Extensão de Joelho no Cabo", muscle_group: "quadriceps", phase: "forca_especifica", equipment: "cabo", is_isolation: true },
];

const STABLE_CLUSTER_EXERCISES = [
  { exercise_id: "press", exercise_name: "Chest Press Máquina", muscle_group: "peitoral", phase: "forca_global", equipment: "máquina", is_isolation: false },
  { exercise_id: "fly", exercise_name: "Crucifixo Máquina", muscle_group: "peitoral", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
];

function emittedMethod(
  ctx: Parameters<typeof planAdvancedMethods>[1],
  exercises = SAFE_ACCESSORIES,
): MethodId | undefined {
  return planAdvancedMethods(exercises, ctx).find((exercise) => exercise.method)?.method || undefined;
}

describe("advanced training methods", () => {
  it("emits a real antagonist superset, distinct from a biset", () => {
    const planned = planAdvancedMethods([
      { exercise_id: "press", exercise_name: "Supino Maquina", muscle_group: "peitoral", phase: "forca_especifica" },
      { exercise_id: "row", exercise_name: "Remada Baixa", muscle_group: "costas", phase: "forca_especifica" },
      { exercise_id: "curl", exercise_name: "Rosca Direta", muscle_group: "biceps", phase: "forca_especifica" },
    ], {
      mesocycle: "intensificacao",
      microcycle: "choque",
      level: "intermediario",
      week: 5,
      sessionKey: "a",
    });

    expect(planned[0].method).toBe("superset");
    expect(planned[1].method).toBe("superset");
    expect(planned[0].group_id).toBe(planned[1].group_id);
    expect(planned[0].method).not.toBe("biset");
  });

  it("does not invent an antagonist superset when muscle groups are missing or incompatible", () => {
    const planned = planAdvancedMethods([
      { exercise_id: "face", exercise_name: "Face Pull", muscle_group: "ombros", phase: "forca_especifica" },
      { exercise_id: "lat", exercise_name: "Puxada Frente", muscle_group: "costas", phase: "forca_especifica" },
    ], {
      mesocycle: "intensificacao",
      microcycle: "choque",
      level: "intermediario",
      week: 5,
      sessionKey: "b",
    });

    expect(planned.some((exercise) => exercise.method === "superset")).toBe(false);
  });

  it.each([
    ["pico_contracao", { mesocycle: "acumulacao", level: "avancado", week: 3, sequenceNumber: 1, objective: "hipertrofia" }, SAFE_ACCESSORIES],
    ["pico_alongamento", { mesocycle: "acumulacao", level: "avancado", week: 3, sequenceNumber: 2, objective: "hipertrofia" }, SAFE_ACCESSORIES],
    ["isometria", { mesocycle: "acumulacao", level: "avancado", week: 3, sequenceNumber: 3, objective: "hipertrofia" }, SAFE_ACCESSORIES],
    ["dropset", { mesocycle: "acumulacao", level: "intermediario", week: 4, sequenceNumber: 1, objective: "hipertrofia" }, SAFE_ACCESSORIES],
    ["restpause", { mesocycle: "acumulacao", level: "avancado", week: 4, sequenceNumber: 2, objective: "hipertrofia" }, SAFE_ACCESSORIES],
    ["triset", { mesocycle: "intensificacao", level: "avancado", week: 5, sequenceNumber: 1, objective: "hipertrofia" }, SAME_GROUP_ACCESSORIES],
    ["giantset", { mesocycle: "intensificacao", level: "avancado", week: 5, sequenceNumber: 2, objective: "hipertrofia" }, SAME_GROUP_ACCESSORIES],
    ["superset", { mesocycle: "intensificacao", level: "intermediario", week: 5, sequenceNumber: 3, objective: "hipertrofia" }, SAFE_ACCESSORIES],
    ["circuito", { mesocycle: "intensificacao", level: "intermediario", week: 5, sequenceNumber: 1, objective: "emagrecimento" }, SAFE_ACCESSORIES],
    ["cluster", { mesocycle: "intensificacao", level: "avancado", week: 6, sequenceNumber: 1, objective: "forca" }, STABLE_CLUSTER_EXERCISES],
  ] as const)("emits %s from deterministic level/objective/week/sequence policy", (expected, ctx, exercises) => {
    expect(emittedMethod(ctx, exercises)).toBe(expected);
  });

  it("emits a bi-set fallback for a safe non-antagonist pair", () => {
    expect(emittedMethod({
      mesocycle: "intensificacao",
      level: "intermediario",
      week: 5,
      sequenceNumber: 4,
      objective: "hipertrofia",
    }, [
      { exercise_name: "Elevação Lateral Máquina", muscle_group: "ombros", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
      { exercise_name: "Panturrilha Sentada", muscle_group: "panturrilhas", phase: "forca_especifica", equipment: "máquina", is_isolation: true },
    ])).toBe("biset");
  });

  it("keeps all eleven declared methods actually reachable", () => {
    const covered = new Set<MethodId>([
      "pico_contracao", "pico_alongamento", "isometria", "dropset", "restpause",
      "triset", "giantset", "superset", "biset", "circuito", "cluster",
    ]);
    expect([...ALL_METHOD_IDS].sort()).toEqual([...covered].sort());
  });

  it("records a reason without stacking duplicate methods in one session", () => {
    const planned = planAdvancedMethods(SAME_GROUP_ACCESSORIES, {
      mesocycle: "intensificacao",
      level: "avancado",
      week: 5,
      sequenceNumber: 2,
      objective: "hipertrofia",
      sessionKey: "audit",
    });
    const selected = planned.filter((exercise) => exercise.method);
    expect(new Set(selected.map((exercise) => exercise.method))).toEqual(new Set(["giantset"]));
    expect(selected.every((exercise) => exercise.method_reason === "selected_metabolic_density")).toBe(true);
    expect(new Set(selected.map((exercise) => exercise.group_id)).size).toBe(1);
  });

  it("covers all methods across eligible plan cycles/sessions with valid arity and one method per session", () => {
    const emitted = new Set<MethodId>();
    const sessions = [SAFE_ACCESSORIES, SAME_GROUP_ACCESSORIES, STABLE_CLUSTER_EXERCISES];
    for (const sequenceNumber of [1, 2, 3, 4]) {
      for (const week of [3, 4, 5, 6]) {
        for (const objective of ["hipertrofia", "emagrecimento", "forca"]) {
          for (let sessionIndex = 1; sessionIndex <= 4; sessionIndex += 1) {
            for (const exercises of sessions) {
              const mesocycle = week < 5 ? "acumulacao" : "intensificacao";
              const planned = planAdvancedMethods(exercises, {
                mesocycle,
                microcycle: mesocycle === "intensificacao" ? "choque" : "ordinario",
                level: "avancado",
                week,
                objective,
                sequenceNumber,
                sessionIndex,
              });
              const methods = new Set(planned.flatMap((exercise) => exercise.method ? [exercise.method] : []));
              expect(methods.size).toBeLessThanOrEqual(1);
              for (const method of methods) {
                emitted.add(method);
                const selected = planned.filter((exercise) => exercise.method === method);
                const expectedArity: Partial<Record<MethodId, number>> = { biset: 2, superset: 2, triset: 3, giantset: 4, circuito: 3 };
                if (expectedArity[method]) expect(selected).toHaveLength(expectedArity[method]);
                expect(selected.every((exercise) => !/agachamento livre|levantamento terra|good morning/i.test(exercise.exercise_name || ""))).toBe(true);
              }
            }
          }
        }
      }
    }
    expect([...emitted].sort()).toEqual([...ALL_METHOD_IDS].sort());
  });

  it("does not compensate limited unstable equipment with an advanced method", () => {
    expect(emittedMethod({
      mesocycle: "intensificacao",
      level: "avancado",
      week: 6,
      sequenceNumber: 1,
      objective: "forca",
      equipment: "peso corporal",
    }, [
      { exercise_name: "Agachamento no BOSU", muscle_group: "quadriceps", phase: "forca_especifica", equipment: "bosu" },
    ])).toBeUndefined();
  });

  it("applies cluster only to a stable machine strength pattern, never to an accessory isolation", () => {
    const planned = planAdvancedMethods(STABLE_CLUSTER_EXERCISES, {
      mesocycle: "intensificacao",
      level: "avancado",
      week: 6,
      sequenceNumber: 1,
      objective: "forca",
    });

    expect(planned[0]).toMatchObject({ method: "cluster", method_reason: "selected_strength_quality" });
    expect(planned[1].method).toBeUndefined();
    expect(emittedMethod({
      mesocycle: "intensificacao",
      level: "avancado",
      week: 6,
      sequenceNumber: 1,
      objective: "forca",
    }, SAFE_ACCESSORIES)).toBeUndefined();
  });

  it("blocks beginner, pain, red flags, fatigue and unstable/high-risk candidates", () => {
    const unsafe = [
      { exercise_name: "Agachamento Livre", muscle_group: "quadriceps", phase: "forca_global", equipment: "barra" },
      { exercise_name: "Levantamento Terra", muscle_group: "posterior", phase: "forca_global", equipment: "barra" },
    ];
    const contexts = [
      { mesocycle: "intensificacao", level: "iniciante", week: 5, objective: "hipertrofia" },
      { mesocycle: "intensificacao", level: "avancado", week: 5, objective: "hipertrofia", hasPain: true },
      { mesocycle: "intensificacao", level: "avancado", week: 5, objective: "hipertrofia", hasRedFlags: true },
      { mesocycle: "intensificacao", level: "avancado", week: 5, objective: "hipertrofia", fatigueHigh: true },
    ] as const;
    for (const ctx of contexts) expect(emittedMethod(ctx, SAFE_ACCESSORIES)).toBeUndefined();
    expect(emittedMethod({ mesocycle: "intensificacao", level: "avancado", week: 5, objective: "hipertrofia" }, unsafe)).toBeUndefined();
  });
});
