import { describe, expect, it } from "vitest";
import {
  buildStudentProgressionHighlight,
  copyWeeklyPrescriptionMetrics,
  DEFAULT_INDIVIDUAL_WEEKLY_TEMPO,
  defaultWeeklyTempoForUiVersion,
  formatBiweeklyProgressionForDisplay,
  hasIndividualWeeklyPrescription,
  individualWeeklyUiVersionForLoadedWorkouts,
  INDIVIDUAL_WEEKLY_UI_VERSION,
  LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION,
  resolveActiveWorkoutInCycles,
  resolveStudentHomeWorkoutTarget,
  resolveExerciseForWeek,
  resolveWorkoutForCycleWeek,
  studentWeekBlockOptions,
  summarizeExerciseWeeklyProgression,
  STUDENT_EFFORT_HELP_TEXT,
  studentFacingEffortText,
  studentEffortLabel,
  weeklyMethodLabel,
  weeklyPrescriptionModeForLoadedWorkouts,
  weeklySetTypesForSets,
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
  it("mantém prescrições existentes sem contrato semanal no modo legado", () => {
    expect(weeklyPrescriptionModeForLoadedWorkouts([
      { exercises: [{ weekly_prescription: [] }] },
    ])).toBe("legacy");
    expect(weeklyPrescriptionModeForLoadedWorkouts([
      { exercises: [{ sets: "3" } as never] },
    ])).toBe("legacy");
    expect(weeklyPrescriptionModeForLoadedWorkouts([
      { exercises: [{ weekly_prescription: [{ week: 1 }] }] },
    ])).toBe("legacy");
  });

  it("habilita o novo modelo apenas para prescrições novas ou já semanais", () => {
    expect(weeklyPrescriptionModeForLoadedWorkouts([{ exercises: [] }])).toBe("weekly");
    expect(weeklyPrescriptionModeForLoadedWorkouts([
      { exercises: [{ weekly_prescription: [{ week: 1 }], weekly_ui_version: INDIVIDUAL_WEEKLY_UI_VERSION }] },
    ])).toBe("weekly");
    expect(hasIndividualWeeklyPrescription([
      { weekly_prescription: [{ week: 1 }], weekly_ui_version: INDIVIDUAL_WEEKLY_UI_VERSION },
    ])).toBe(true);
  });

  it("preserva a versão semanal antiga e reserva a v2 para novas prescrições", () => {
    const legacyWeekly = [{
      exercises: [{
        weekly_prescription: [{ week: 1 }],
        weekly_ui_version: LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION,
      }],
    }];
    const currentWeekly = [{
      exercises: [{
        weekly_prescription: [{ week: 1 }],
        weekly_ui_version: INDIVIDUAL_WEEKLY_UI_VERSION,
      }],
    }];

    expect(individualWeeklyUiVersionForLoadedWorkouts(legacyWeekly)).toBe(LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION);
    expect(weeklyPrescriptionModeForLoadedWorkouts(legacyWeekly)).toBe("weekly");
    expect(individualWeeklyUiVersionForLoadedWorkouts(currentWeekly)).toBe(INDIVIDUAL_WEEKLY_UI_VERSION);
    expect(individualWeeklyUiVersionForLoadedWorkouts([{ exercises: [] }])).toBe(INDIVIDUAL_WEEKLY_UI_VERSION);
    expect(defaultWeeklyTempoForUiVersion(LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION)).toBe("");
    expect(defaultWeeklyTempoForUiVersion(INDIVIDUAL_WEEKLY_UI_VERSION)).toBe(DEFAULT_INDIVIDUAL_WEEKLY_TEMPO);
  });

  it("alinha os tipos de série à quantidade prescrita na semana", () => {
    expect(weeklySetTypesForSets(["warmup", "failure"], 4)).toEqual([
      "warmup",
      "failure",
      "normal",
      "normal",
    ]);
    expect(weeklySetTypesForSets(["warmup", "normal", "failure"], 2)).toEqual(["warmup", "normal"]);
  });

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
    const workout = { id: "workout-1", title: "Treino A", exercises: [exercise] };
    const resolved = resolveWorkoutForCycleWeek(workout, "2026-07-06", 6, new Date("2026-08-05T12:00:00"));

    expect(resolved?.id).toBe("workout-1");
    expect(resolved?.title).toBe("Treino A");
    expect(resolved?.weekly_context).toMatchObject({ week: 5, block: "intensificacao", methods: ["biset"] });
    expect(resolved?.exercises[0].method).toBe("biset");
  });

  it("permite visualizar uma semana anterior sem liberar semanas futuras", () => {
    const workout = { id: "workout-1", title: "Treino A", exercises: [exercise] };
    const resolved = resolveWorkoutForCycleWeek(workout, "2026-07-06", 6, undefined, 1);

    expect(resolved?.weekly_context).toMatchObject({ week: 1, block: "base" });
    expect(resolved?.exercises[0]).toMatchObject({ sets: "2", rest: "90s", rir: "3-4" });

    expect(studentWeekBlockOptions({ currentWeek: 3, durationWeeks: 6, selectedStartWeek: 3 })).toEqual([
      expect.objectContaining({ label: "Semana 1", available: true, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 2", available: true, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 3", available: true, current: true, hasNewContent: true }),
      expect.objectContaining({ label: "Semana 4", available: false, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 5", available: false, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 6", available: false, hasNewContent: false }),
    ]);
  });

  it("mantém blocos futuros bloqueados mesmo em ciclos legados sem prescrição semanal", () => {
    expect(studentWeekBlockOptions({
      currentWeek: 1,
      durationWeeks: 6,
      hasWeeklyPrescriptions: false,
      selectedStartWeek: 1,
    })).toEqual([
      expect.objectContaining({ label: "Semana 1", available: true, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 2", available: false, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 3", available: false, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 4", available: false, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 5", available: false, hasNewContent: false }),
      expect.objectContaining({ label: "Semana 6", available: false, hasNewContent: false }),
    ]);
  });

  it("copia as métricas de um exercício somente para as semanas selecionadas", () => {
    const weekly = Array.from({ length: 6 }, (_, index) => ({
      week: index + 1,
      block: index < 2 ? "base" : index < 4 ? "acumulacao" : "intensificacao",
      sets: index + 1,
      reps: `${8 + index}`,
      rir: `${4 - Math.min(index, 3)}`,
      rest_seconds: 90 - index * 5,
      tempo: `30${index}0`,
      set_types: index === 1 ? ["warmup", "failure"] : ["normal"],
      instruction: `Semana ${index + 1}`,
    }));

    const copied = copyWeeklyPrescriptionMetrics(weekly, 2, [3, 6]);

    expect(copied.find((item) => item.week === 1)?.sets).toBe(1);
    expect(copied.find((item) => item.week === 3)).toMatchObject({
      week: 3,
      block: "acumulacao",
      sets: 2,
      reps: "9",
      tempo: "3010",
      set_types: ["warmup", "failure"],
      instruction: "Semana 2",
    });
    expect(copied.find((item) => item.week === 6)).toMatchObject({
      week: 6,
      block: "intensificacao",
      sets: 2,
      reps: "9",
      tempo: "3010",
      set_types: ["warmup", "failure"],
      instruction: "Semana 2",
    });
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

  it("formata a progressão quinzenal para os consumidores exibirem sem estado duplicado", () => {
    const display = formatBiweeklyProgressionForDisplay([
      { week: 1, block: "base", sets: 2, reps: "10-12", rir: "3-4", rest_seconds: 75, tempo: "3110", instruction: "Base técnica." },
      { week: 2, block: "base", sets: 2, reps: "10-12", rir: "3", rest_seconds: 75, tempo: "3011", instruction: "Consolidar." },
      { week: 3, block: "acumulacao", sets: 3, reps: "8-12", rir: "2-3", rest_seconds: 60, tempo: "3010", method: "restpause", method_seconds: 20, instruction: "Rest-pause na última série." },
      { week: 4, block: "acumulacao", sets: 3, reps: "8-12", rir: "2-3", rest_seconds: 60, tempo: "2110", method: "dropset", instruction: "Um drop na última série." },
    ]);

    expect(display).toEqual([
      expect.stringContaining("Semanas 1-2"),
      expect.stringContaining("Semanas 3-4"),
    ]);
    expect(display[0]).toContain("Séries retas");
    expect(display[0]).toContain("Repetições restantes: 3-4 → 3");
    expect(display.join(" ")).not.toMatch(/\bRIR\b/);
    expect(display[1]).toContain("Rest-pause (20s)");
    expect(display[1]).toContain("Drop-set");
  });

  it("traduz o esforço para o label principal, versão compacta e ajuda leiga", () => {
    expect(studentEffortLabel("RIR 2-3")).toBe("Repetições que ainda conseguiria fazer: 2-3");
    expect(studentEffortLabel("RIR 2–3")).toBe("Repetições que ainda conseguiria fazer: 2-3");
    expect(studentEffortLabel("RIR 2-3", { compact: true })).toBe("Repetições restantes: 2-3");
    expect(STUDENT_EFFORT_HELP_TEXT).toBe("Quantas repetições você ainda conseguiria fazer mantendo a técnica.");
  });

  it("traduz a sigla quando ela chega dentro de instruções dinâmicas", () => {
    expect(studentFacingEffortText("Encerre com RIR 4-5 e técnica limpa.")).toBe(
      "Encerre com Repetições restantes: 4-5 e técnica limpa.",
    );
    expect(studentFacingEffortText("Sem referência de esforço.")).toBe("Sem referência de esforço.");
    expect(studentFacingEffortText("Use RIR como referência.")).toBe("Use repetições restantes como referência.");
    expect(studentFacingEffortText("Encerre com RIR 2–3.")).toBe("Encerre com Repetições restantes: 2-3.");
    expect(studentFacingEffortText("Prefira repetir com técnica.")).toBe("Prefira repetir com técnica.");
  });

  it("prioriza a prescrição semanal autoritativa no resumo aluno-first da quinzena atual", () => {
    const highlight = buildStudentProgressionHighlight({
      prescribedWeek: {
        week: 5,
        block: "intensificacao",
        rir: "2",
        tempo: "2010",
        methods: ["biset"],
        instruction: "Execute o par em sequência, sem correr a técnica.",
      },
      durationWeeks: 6,
    });

    expect(highlight).toEqual({
      source: "prescribed_week",
      eyebrow: "Semana 5",
      title: "O que muda agora",
      body: "Esta semana fica mais intensa com Bi-set. Termine as séries com cerca de 2 repetições ainda possíveis mantendo a técnica. Execute o par em sequência, sem correr a técnica.",
    });
    expect(highlight?.body).not.toContain("RIR");
    expect(highlight?.body).not.toContain("weekly_context");
  });

  it("gera um fallback determinístico para ciclos legados sem prometer método avançado inexistente", () => {
    const highlight = buildStudentProgressionHighlight({
      objective: "Hipertrofia",
      startDate: "2026-07-06",
      endDate: "2026-08-17",
      today: new Date("2026-08-05T12:00:00"),
    });

    expect(highlight).toEqual({
      source: "periodization_fallback",
      eyebrow: "Semana 5",
      title: "O que muda agora",
      body: "Esta semana entra em intensificação: mais intensidade e proximidade da falha, mantendo a execução controlada. Sem técnica especial publicada para esta semana; siga as séries do treino.",
    });
    expect(highlight?.body).not.toMatch(/Bi-set|Drop-set|Cluster|Rest-pause/);
  });

  it("resolve explicitamente o treino que o hero deve abrir", () => {
    const workouts = [
      { id: "lower", title: "Treino A", day_of_week: 2 },
      { id: "upper", title: "Treino B", day_of_week: 4 },
    ];

    expect(resolveStudentHomeWorkoutTarget(workouts, 4, "lower")).toEqual({
      kind: "active",
      workout: workouts[0],
    });
    expect(resolveStudentHomeWorkoutTarget(workouts, 4, null)).toEqual({
      kind: "today",
      workout: workouts[1],
    });
  });

  it("normaliza RIR textual e usa copy segura quando o esforço vem vazio", () => {
    expect(buildStudentProgressionHighlight({
      prescribedWeek: {
        week: 5,
        block: "intensificacao",
        rir: "RIR 2",
        tempo: "2010",
        methods: [],
        instruction: "Mantenha controle em todas as séries.",
      },
      durationWeeks: 6,
    }).body).toBe("Esta semana fica mais intensa com séries retas. Termine as séries com cerca de 2 repetições ainda possíveis mantendo a técnica. Mantenha controle em todas as séries.");

    expect(buildStudentProgressionHighlight({
      prescribedWeek: {
        week: 3,
        block: "acumulacao",
        rir: "",
        tempo: "3010",
        methods: [],
        instruction: "Aumente volume sem acelerar a execução.",
      },
      durationWeeks: 6,
    }).body).toBe("Esta semana aumenta o volume com séries retas. Mantenha esforço controlado conforme as séries do treino. Aumente volume sem acelerar a execução.");
  });

  it("falha fechado quando existe sessão ativa para treino que não está mais na lista", () => {
    const workouts = [
      { id: "upper", title: "Treino B", day_of_week: 4 },
    ];

    expect(resolveStudentHomeWorkoutTarget(workouts, 4, "stale-active")).toEqual({
      kind: "stale_active",
      workout: null,
    });
  });

  it("resolve sessão ativa contra todos os ciclos antes de deixar outro treino iniciar", () => {
    const cycles = [
      { id: "cycle-1", workouts: [{ id: "lower", title: "Treino A", day_of_week: 2 }] },
      { id: "cycle-2", workouts: [{ id: "upper", title: "Treino B", day_of_week: 4 }] },
    ];

    expect(resolveActiveWorkoutInCycles(cycles, "upper")).toEqual({
      kind: "resolved",
      cycle: cycles[1],
      workout: cycles[1].workouts[0],
    });
    expect(resolveActiveWorkoutInCycles(cycles, null)).toEqual({ kind: "none" });
    expect(resolveActiveWorkoutInCycles(cycles, "removed-workout")).toEqual({
      kind: "stale",
      workoutId: "removed-workout",
    });
  });
});
