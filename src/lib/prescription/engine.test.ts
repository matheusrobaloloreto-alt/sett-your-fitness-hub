import { describe, expect, it } from "vitest";
import { buildWorkoutRows } from "@/lib/publishStrengthPlan";
import { resolveWorkoutForCycleWeek } from "@/lib/weeklyStrengthPeriodization";
import { groupWorkoutExercises } from "@/lib/workoutMethods";
import { generateTrainingProgram } from "./engine";
import { allocateDeloadSetCounts } from "./progressionRules";
import { validateTrainingProgram } from "./validator";
import { getVolumeRangeForGroup } from "./volumeRules";
import type { ExerciseCatalogEntry, PrescriptionInput } from "./types";

const catalog: ExerciseCatalogEntry[] = [
  { id: "mob-ankle", name: "Mobilidade de Tornozelo e Quadril", muscle_group: "mobilidade", equipment: "livre", targets: [{ muscle_group: "mobilidade" }] },
  { id: "plank", name: "Prancha Frontal", muscle_group: "core", equipment: "livre", targets: [{ muscle_group: "core" }] },
  { id: "dead-bug", name: "Dead Bug", muscle_group: "core", equipment: "livre", targets: [{ muscle_group: "core" }] },
  { id: "glute-band", name: "Abdução de Quadril Mini Band", muscle_group: "glúteos", equipment: "mini band", targets: [{ muscle_group: "glúteos" }] },
  { id: "box-squat", name: "Agachamento na Caixa", muscle_group: "quadríceps", equipment: "livre", pain_limitation_tags: ["joelho"], regressions: ["Reduzir amplitude"], targets: [{ muscle_group: "quadríceps" }] },
  { id: "leg-press", name: "Leg Press", muscle_group: "quadríceps", equipment: "máquina", targets: [{ muscle_group: "quadríceps" }] },
  { id: "leg-curl", name: "Mesa Flexora", muscle_group: "posterior", equipment: "máquina", targets: [{ muscle_group: "posterior" }] },
  { id: "thoracic-mob", name: "Mobilidade Torácica", muscle_group: "ombros", equipment: "livre", targets: [{ muscle_group: "ombros" }] },
  { id: "face-pull", name: "Face Pull", muscle_group: "ombros", equipment: "cabo", targets: [{ muscle_group: "ombros" }, { muscle_group: "costas" }] },
  { id: "row", name: "Remada Baixa", muscle_group: "costas", equipment: "máquina", targets: [{ muscle_group: "costas" }] },
  { id: "machine-press", name: "Supino Máquina Pegada Neutra", muscle_group: "peitoral", equipment: "máquina", targets: [{ muscle_group: "peitoral" }] },
  { id: "lat-pulldown", name: "Puxada Frente", muscle_group: "costas", equipment: "máquina", targets: [{ muscle_group: "costas" }] },
  { id: "step-up", name: "Step Up Baixo", muscle_group: "glúteos", equipment: "livre", targets: [{ muscle_group: "glúteos" }] },
  { id: "hip-thrust", name: "Hip Thrust", muscle_group: "glúteos", equipment: "máquina", targets: [{ muscle_group: "glúteos" }] },
  { id: "rdl", name: "Terra Romeno", muscle_group: "posterior", equipment: "halteres", contraindications: ["lombar"], targets: [{ muscle_group: "posterior" }] },
  { id: "calf-core", name: "Panturrilha em Pé + Core", muscle_group: "core", equipment: "livre", targets: [{ muscle_group: "panturrilhas" }, { muscle_group: "core" }] },
];

function baseInput(overrides: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    studentName: "Aluno Teste",
    objective: "hipertrofia",
    fitnessLevel: "iniciante",
    daysPerWeek: 3,
    durationWeeks: 6,
    equipment: "academia completa",
    restrictions: "",
    catalog,
    ...overrides,
  };
}

function allExerciseIds(program: ReturnType<typeof generateTrainingProgram>) {
  return program.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.exercise_id));
}

function prescribedExerciseText(program: ReturnType<typeof generateTrainingProgram>) {
  return program.workouts
    .flatMap((workout) => workout.exercises)
    .map((exercise) => `${exercise.exercise_name} ${exercise.cues} ${exercise.biomechanical_note}`)
    .join(" ")
    .toLowerCase();
}

function weeklySetsByGroup(program: ReturnType<typeof generateTrainingProgram>) {
  const out = new Map<string, number>();
  for (const exercise of program.workouts.flatMap((workout) => workout.exercises)) {
    const group = exercise.muscle_group.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    out.set(group, (out.get(group) || 0) + exercise.sets);
  }
  return out;
}

function weeklySets(program: ReturnType<typeof generateTrainingProgram>, group: string) {
  return program.validator.pre_save.volume_review.find((item) => item.muscle_group === group)?.weekly_sets || 0;
}

function hasWarning(program: ReturnType<typeof generateTrainingProgram>, code: string) {
  return program.validator.pre_save.warnings.some((warning) => warning.code === code);
}

function hasBlocker(program: ReturnType<typeof generateTrainingProgram>, code: string) {
  return program.validator.pre_save.blockers.some((blocker) => blocker.code === code);
}

function explanationIds(program: ReturnType<typeof generateTrainingProgram>) {
  return program.explanations.map((explanation) => explanation.rule_id);
}

describe("BN Prescription Engine v1", () => {
  it("nunca repete exercise_id dentro da mesma sessão e bloqueia gap quando o catálogo elegível acaba", () => {
    const narrowCatalog: ExerciseCatalogEntry[] = [
      {
        id: "only-safe",
        name: "Mobilidade Prancha Agachamento Leg Press Remada Supino Mesa Flexora Hip Thrust Panturrilha",
        muscle_group: "geral",
        equipment: "livre",
        targets: [{ muscle_group: "geral" }],
      },
    ];
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      daysPerWeek: 2,
      catalog: narrowCatalog,
    }));

    for (const workout of program.workouts) {
      const ids = workout.exercises.map((exercise) => exercise.exercise_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(program.library_policy.gaps.some((gap) => gap.includes("session_unique_exhausted"))).toBe(true);
    expect(hasBlocker(program, "library_session_unique_exhausted")).toBe(true);
  });

  it("permite reuso entre sessões apenas como penalidade rastreável, sem duplicar na sessão", () => {
    const limitedCatalog = catalog.slice(0, 7);
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      daysPerWeek: 3,
      isEnduranceAthlete: true,
      runningDaysContext: { days_per_week: 3, sport: "corrida" },
      catalog: limitedCatalog,
    }));
    const idsByWorkout = program.workouts.map((workout) => workout.exercises.map((exercise) => exercise.exercise_id));
    const reuseWarnings = program.validator.pre_save.warnings.filter((warning) => warning.code === "cross_session_reuse");

    expect(idsByWorkout.every((ids) => new Set(ids).size === ids.length)).toBe(true);
    expect(program.library_policy.gaps.some((gap) => gap.includes("cross_session_reuse"))).toBe(true);
    expect(reuseWarnings).toHaveLength(1);
    expect(reuseWarnings[0]).toMatchObject({
      severity: "warning",
      source: "biblioteca",
    });
    expect(program.validator.pre_save.blockers.some((blocker) => blocker.code === "cross_session_reuse")).toBe(false);
    expect(hasWarning(program, "endurance_agenda_missing")).toBe(true);
  });

  it("não transforma nomes de campos ou respostas clínicas negativas em dor", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      objective: "hipertrofia",
      daysPerWeek: 4,
      anamneseContext: {
        current_pain: "Não possuo dor",
        injuries: "Nenhuma lesão",
        pain_eva: 0,
        medical_conditions: "Nenhuma",
      },
      assessmentContext: {
        ohs_compensations: [{ key: "dynamic_valgus", presente: true, severidade: "leve" }],
      },
    }));

    expect(program.methodology_preset.key).toBe("hipertrofia_intermediario");
    expect(program.weekly_periodization[2].methods).toContain("Rest-pause");
    expect(program.weekly_periodization[4].methods).toContain("Bi-set");
    expect(program.validator.pre_save.blockers).toEqual([]);
    expect(program.validator.pre_save.corrections.some((item) => item.code === "removed_advanced_methods")).toBe(false);
  });

  it("ignora pain report regional com EVA zero ao decidir métodos avançados", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      painReports: [{ region: "joelho", eva: 0 }],
    }));

    expect(program.weekly_periodization[2].methods).toContain("Rest-pause");
    expect(program.progression_protocol.toLowerCase()).not.toContain("hold/regress");
  });

  it("gera periodização semanal executável com cadência, rest-pause, drop-set e bi-set", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      objective: "hipertrofia",
      daysPerWeek: 4,
    }));
    const methods = program.weekly_periodization.map((week) => week.methods);
    const exercises = program.workouts.flatMap((workout) => workout.exercises);

    expect(program.weekly_periodization).toHaveLength(6);
    expect(program.weekly_periodization.map((week) => week.tempo_focus)).toEqual([
      "3-1-1-0",
      "3-0-1-1",
      "3-0-1-0",
      "2-1-1-0",
      "2-0-1-0",
      "2-0-1-0",
    ]);
    const intensityMethod = /rest-pause|drop-set|cluster-set|pir[aâ]mide|up-set/i;
    expect(methods[0].every((method) => !intensityMethod.test(method))).toBe(true);
    expect(methods[1].every((method) => !intensityMethod.test(method))).toBe(true);
    expect(methods[2]).toContain("Rest-pause");
    expect(methods[3]).toContain("Drop-set");
    expect(methods[4]).toContain("Bi-set");
    expect(methods[5]).toContain("Drop-set");
    expect(exercises.every((exercise) => exercise.weekly_prescription?.length === 6)).toBe(true);
    expect(exercises.every((exercise) => exercise.weekly_prescription?.slice(0, 2)
      .every((week) => !week.method || !intensityMethod.test(week.method)))).toBe(true);
  });

  it("preserva e ativa a periodização do motor até o contrato exibido ao aluno", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      objective: "hipertrofia",
      daysPerWeek: 4,
    }));
    const rows = buildWorkoutRows(program, "cycle-1", "company-1");

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.flatMap((row) => row.exercises)
      .every((exercise) => exercise.weekly_prescription?.length === 6)).toBe(true);

    const week3Rows = rows.map((row) => resolveWorkoutForCycleWeek(
      row,
      "2026-07-20",
      6,
      new Date("2026-08-05T12:00:00-03:00"),
    ));
    expect(week3Rows.some((row) => row?.weekly_context?.methods.includes("restpause"))).toBe(true);
    expect(week3Rows.flatMap((row) => row?.exercises || [])
      .some((exercise) => exercise.method === "restpause" && exercise.set_types?.includes("failure"))).toBe(true);

    const week5Rows = rows.map((row) => resolveWorkoutForCycleWeek(
      row,
      "2026-07-06",
      6,
      new Date("2026-08-05T12:00:00-03:00"),
    ));
    const visibleGroups = week5Rows.flatMap((row) => groupWorkoutExercises(row?.exercises || []));
    expect(visibleGroups.some((group) =>
      group.grouping && group.items.length >= 2 && ["biset", "triset", "circuito"].includes(group.method || "")
    )).toBe(true);
  });

  it("reserva cluster-set para avançado sem dor na semana final", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "avancado",
      objective: "hipertrofia",
      daysPerWeek: 5,
    }));

    expect(program.weekly_periodization[5].methods).toContain("Cluster-set");
    expect(program.workouts.flatMap((workout) => workout.exercises)
      .some((exercise) => exercise.weekly_prescription?.some((week) => week.week === 6 && week.method === "cluster"))).toBe(true);
  });

  it("bloqueia todos os métodos avançados quando há dor ou aluno iniciante", () => {
    const beginner = generateTrainingProgram(baseInput({ fitnessLevel: "iniciante" }));
    const pain = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      painEva: 4,
      restrictions: "dor no joelho EVA 4",
    }));

    const intensityMethod = /rest-pause|drop-set|cluster-set|pir[aâ]mide|up-set/i;
    for (const program of [beginner, pain]) {
      expect(program.weekly_periodization.every((week) => week.methods.every((method) => !intensityMethod.test(method)))).toBe(true);
      expect(program.workouts.flatMap((workout) => workout.exercises)
        .every((exercise) => exercise.weekly_prescription?.every((week) => !week.method || !intensityMethod.test(week.method)))).toBe(true);
      expect(program.workouts.flatMap((workout) => workout.exercises)
        .every((exercise) => exercise.weekly_prescription?.every((week) =>
          !week.set_types?.some((setType) => setType === "failure" || setType === "drop")))).toBe(true);
    }
  });

  it("mantém métodos em acessórios seguros quando a dor é leve e localizada", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      painEva: 2,
      painReports: [{ region: "joelho", eva: 2 }],
      restrictions: "dor leve no joelho EVA 2",
    }));
    const exercises = program.workouts.flatMap((workout) => workout.exercises);
    const kneePattern = /agachamento|leg press|afundo|avanço|step up/i;
    const loadedKneePhases = new Set(["controle_motor", "forca_global", "forca_especifica"]);
    const kneeExercises = exercises.filter((exercise) =>
      kneePattern.test(exercise.exercise_name) && loadedKneePhases.has(exercise.phase));
    const intensityMethod = /rest-pause|drop-set|cluster-set|pir[aâ]mide|up-set/i;

    expect(program.weekly_periodization.slice(2).some((week) => week.methods.length > 0)).toBe(true);
    expect(exercises.some((exercise) => exercise.weekly_prescription?.some((week) => Boolean(week.method)))).toBe(true);
    expect(kneeExercises.every((exercise) => exercise.weekly_prescription?.every((week) =>
      !week.method || !intensityMethod.test(week.method)))).toBe(true);
    expect(program.progression_protocol.toLowerCase()).toContain("progressao por tolerancia");
  });

  it("gera quatro semanas quando o ciclo pede quatro, sem fabricar semanas extras", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      durationWeeks: 4,
    }));

    expect(program.weekly_periodization).toHaveLength(4);
    expect(program.workouts.flatMap((workout) => workout.exercises)
      .every((exercise) => exercise.weekly_prescription?.length === 4)).toBe(true);
  });

  it("gera plano para iniciante com dor no joelho priorizando glúteo/controle e sem inventar exercício", () => {
    const program = generateTrainingProgram(baseInput({
      restrictions: "dor no joelho e valgo dinâmico",
      assessmentContext: { ohs_compensations: [{ key: "dynamic_valgus", presente: true }] },
    }));

    expect(program.generated_by).toBe("bn_prescription_engine_v1");
    expect(program.methodology_preset.key).toBe("retorno_lesao");
    expect(program.explanations.some((e) => e.rule_id.includes("valgo") || e.rule_id.includes("joelho"))).toBe(true);
    expect(program.biomechanical_notes.toLowerCase()).toContain("joelho");
    expect(allExerciseIds(program).every((id) => catalog.some((exercise) => exercise.id === id))).toBe(true);
    expect(prescribedExerciseText(program)).not.toMatch(/pliometr|salto|atg/);
    expect(JSON.stringify(program).toLowerCase()).toContain("glute");
  });

  it("reduz carga axial quando há dor lombar", () => {
    const program = generateTrainingProgram(baseInput({
      restrictions: "dor lombar ao agachar",
      assessmentContext: { ohs_compensations: [{ key: "butt_wink", presente: true }] },
    }));

    expect(program.explanations.some((e) => e.rule_id.includes("lombar") || e.rule_id.includes("butt"))).toBe(true);
    expect(JSON.stringify(program).toLowerCase()).toContain("lombar");
    expect(JSON.stringify(program).toLowerCase()).toContain("anti-rotação");
    expect(prescribedExerciseText(program)).not.toMatch(/good morning|terra convencional pesado|flexão espinhal carregada/);
    expect(program.validator.pre_save.status).not.toBe("blocked");
  });

  it("aplica restrição de ombro e prioriza estabilidade escapular", () => {
    const program = generateTrainingProgram(baseInput({
      restrictions: "dor no ombro em movimentos overhead",
      assessmentContext: { ohs_compensations: [{ key: "shoulder_protraction_kyphosis", presente: true }] },
    }));

    expect(program.explanations.some((e) => e.rule_id.includes("ombro"))).toBe(true);
    expect(program.workouts.flatMap((w) => w.exercises).some((e) => /face pull|remada/i.test(e.exercise_name))).toBe(true);
    expect(JSON.stringify(program).toLowerCase()).not.toMatch(/atrás da nuca|remada alta|dips/);
  });

  it("ajusta musculação quando há corrida/endurance junto", () => {
    const program = generateTrainingProgram(baseInput({
      isEnduranceAthlete: true,
      runningDaysContext: { days_per_week: 3, sport: "corrida" },
    }));

    expect(program.methodology_preset.key).toBe("corrida_musculacao");
    expect(program.explanations.some((e) => e.rule_id === "reduzi_mmii_por_corrida")).toBe(true);
    expect(program.validator.pre_save.warnings.some((w) => w.code === "endurance_agenda_missing")).toBe(true);
    expect(program.weekly_structure).toContain("sessões/semana");
  });

  it("rebaixa iniciante com 6 dias para 3-4 dias estruturados e explica a decisão", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "iniciante", daysPerWeek: 6 }));

    expect(program.workouts.length).toBeLessThanOrEqual(4);
    expect(program.weekly_structure).toContain("3-4 dias estruturados");
    expect(program.explanations.some((e) => e.rule_id === "rebaixei_frequencia_iniciante_6_dias")).toBe(true);
  });

  it("não inventa exercícios quando a biblioteca está vazia", () => {
    const program = generateTrainingProgram(baseInput({ catalog: [] }));

    expect(program.workouts.flatMap((w) => w.exercises)).toEqual([]);
    expect(program.library_policy.gaps.length).toBeGreaterThan(0);
    expect(program.validator.pre_save.status).toBe("blocked");
    expect(program.validator.pre_save.blockers.some((b) => b.code === "empty_exercise_library")).toBe(true);
  });

  it("funciona com biblioteca incompleta sem criar IDs falsos", () => {
    const partialCatalog = catalog.slice(0, 3);
    const program = generateTrainingProgram(baseInput({ catalog: partialCatalog }));

    expect(allExerciseIds(program).every((id) => partialCatalog.some((exercise) => exercise.id === id))).toBe(true);
    expect(program.library_policy.catalog_count).toBe(3);
  });

  it("protege volume de iniciante de excesso grosseiro", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "iniciante", daysPerWeek: 5 }));
    const highVolume = program.validator.pre_save.volume_review.filter((item) => item.status === "alto");
    const largeGroups = program.validator.pre_save.volume_review.filter((item) => ["quadriceps", "posterior", "gluteos", "costas", "peitoral"].includes(item.muscle_group));
    const smallGroups = program.validator.pre_save.volume_review.filter((item) => ["core", "ombros", "panturrilhas"].includes(item.muscle_group));

    expect(highVolume.every((item) => item.weekly_sets <= 16)).toBe(true);
    expect(largeGroups.every((item) => item.weekly_sets <= 12)).toBe(true);
    expect(smallGroups.every((item) => item.weekly_sets <= 8)).toBe(true);
    expect(program.progression_protocol.toLowerCase()).toContain("reps");
  });

  it("aplica progressão BN de 6 semanas e trava quando há dor/técnica quebrada", () => {
    const program = generateTrainingProgram(baseInput({ techniqueBreakdown: true, restrictions: "dor EVA 4 no joelho" }));
    const blocks = JSON.stringify(program.periodization_blocks).toLowerCase();

    expect(blocks).toContain("1-2");
    expect(blocks).toContain("rir 3-4");
    expect(blocks).toContain("2-3");
    expect(blocks).toContain("rir 2");
    expect(program.progression_protocol.toLowerCase()).toContain("hold/regress");
    expect(blocks).toContain("sem metodos avancados");
  });

  it("aplica deload reduzindo volume, usando RIR 4-5 e removendo métodos avançados", () => {
    const normal = generateTrainingProgram(baseInput());
    const deload = generateTrainingProgram(baseInput({ deload: true }));
    const normalSets = normal.workouts.flatMap((w) => w.exercises).reduce((sum, e) => sum + e.sets, 0);
    const deloadExercises = deload.workouts.flatMap((w) => w.exercises);
    const deloadSets = deloadExercises.reduce((sum, e) => sum + e.sets, 0);
    const reductionRatio = (normalSets - deloadSets) / normalSets;

    expect(normalSets).toBe(52);
    expect(deloadSets).toBe(26);
    expect(reductionRatio).toBeGreaterThanOrEqual(0.4);
    expect(reductionRatio).toBeLessThanOrEqual(0.5);
    expect(deloadSets).toBeLessThan(normalSets);
    expect(deloadExercises.every((exercise) => exercise.rir === "4-5")).toBe(true);
    expect(deloadExercises.every((exercise) =>
      !/progred|aument|subir|intensific/i.test(exercise.progression || "")
    )).toBe(true);
    expect(deloadExercises.every((exercise) => exercise.method === null)).toBe(true);
    expect(deloadExercises.every((exercise) => exercise.weekly_prescription?.every((week) => week.rir === "4-5"))).toBe(true);
    expect(deloadExercises.every((exercise) => exercise.weekly_prescription?.every((week) => week.sets === exercise.sets))).toBe(true);
    expect(deloadExercises.every((exercise) => exercise.weekly_prescription?.every((week) => week.method === null))).toBe(true);
    expect(deloadExercises.every((exercise) => exercise.weekly_prescription?.every((week) =>
      week.set_types?.every((setType) => setType !== "failure" && setType !== "drop")
    ))).toBe(true);
    expect(deload.weekly_periodization.every((week) =>
      week.block === "deload" && week.rir === "4-5" && week.volume_percent === 50 && week.methods.length === 0
    )).toBe(true);
    expect(JSON.stringify(deload.weekly_periodization).toLowerCase()).not.toMatch(/alcan[cç]ar|aument|progred|acumulacao|intensificacao/);
    expect(deload.workouts.every((workout) =>
      workout.volume_load_estimate.includes("RIR 4-5") && !/RIR 2(?:-|\b)/.test(workout.volume_load_estimate)
    )).toBe(true);
    expect(JSON.stringify(deload.periodization_blocks).toLowerCase()).not.toMatch(/drop|cluster|rest-pause|up-set|piramide/);
    expect(deload.periodization_blocks.every((block) => block.progression_rule.includes("RIR 4-5"))).toBe(true);
    expect(deload.progression_protocol.toLowerCase()).toContain("deload");
    expect(deload.explanations.some((e) => e.category === "deload")).toBe(true);
    expect(deload.explanations.some((e) => e.rule_id === "metodo_avancado_controlado")).toBe(false);
    expect(deload.validator.pre_save.warnings.some((warning) => warning.code === "deload_with_advanced_method")).toBe(false);
  });

  it("deload prevalece sobre uma fase longitudinal de intensificação", () => {
    const deload = generateTrainingProgram(baseInput({
      deload: true,
      fitnessLevel: "avancado",
      programSequence: { sequence_number: 3, total_cycles: 4, phase: "intensificacao" },
    }));
    const exercises = deload.workouts.flatMap((workout) => workout.exercises);

    expect(deload.engineMeta.sequence_phase).toBe("consolidacao");
    expect(exercises.every((exercise) => exercise.rir === "4-5")).toBe(true);
    expect(exercises.every((exercise) =>
      !/progress[aã]o longitudinal|maior intensidade|mais uma s[eé]rie/i.test(exercise.biomechanical_note)
    )).toBe(true);
    expect(deload.weekly_periodization.every((week) => week.block === "deload" && week.rir === "4-5")).toBe(true);
    expect(deload.methodology_preset.rules.rir).toBe("4-5");
    expect(deload.methodology_preset.rules.target_weekly_sets).toContain("50%");
    expect(deload.methodology_preset.rules.methods_by_block).toEqual({
      deload: ["sem falha", "sem método avançado", "manter padrões técnicos"],
    });
    expect(deload.explanations.some((explanation) => explanation.rule_id === "BN_LONGITUDINAL_DELOAD")).toBe(true);
  });

  it("aloca o orçamento global de deload deterministicamente e sinaliza mínimos impossíveis", () => {
    const balanced = allocateDeloadSetCounts([3, 3]);
    const exactMinimum = allocateDeloadSetCounts([4, 1, 1]);
    const constrained = allocateDeloadSetCounts([2, 1]);
    const allMinimum = allocateDeloadSetCounts([1, 1, 1]);
    const monotonic = allocateDeloadSetCounts([5, 4, 3, 2, 1]);
    const empty = allocateDeloadSetCounts([]);

    expect(balanced).toMatchObject({
      sets: [2, 1],
      originalTotal: 6,
      targetTotal: 3,
      allocatedTotal: 3,
      reductionRatio: 0.5,
      constrainedByMinimum: false,
    });
    expect(exactMinimum).toMatchObject({
      sets: [1, 1, 1],
      originalTotal: 6,
      targetTotal: 3,
      allocatedTotal: 3,
      reductionRatio: 0.5,
      constrainedByMinimum: false,
    });
    expect(constrained.sets).toEqual([1, 1]);
    expect(constrained.reductionRatio).toBeCloseTo(1 / 3);
    expect(constrained.constrainedByMinimum).toBe(false);
    expect(allMinimum).toMatchObject({
      sets: [1, 1, 1],
      targetTotal: 2,
      allocatedTotal: 3,
      reductionRatio: 0,
      constrainedByMinimum: true,
    });
    expect(allocateDeloadSetCounts([5, 4, 3, 2, 1])).toEqual(monotonic);
    expect(monotonic.allocatedTotal).toBe(monotonic.targetTotal);
    expect(monotonic.sets.every((sets, index) => sets >= 1 && sets <= [5, 4, 3, 2, 1][index])).toBe(true);
    expect(monotonic.sets.every((sets, index) => index === 0 || monotonic.sets[index - 1] >= sets)).toBe(true);
    expect(empty).toMatchObject({ sets: [], originalTotal: 0, allocatedTotal: 0, constrainedByMinimum: false });
  });

  it("valida métodos de deload pelo contrato estruturado, não por frases negadas", () => {
    const input = baseInput({ deload: true });
    const clean = generateTrainingProgram(input);
    expect(clean.progression_protocol.toLowerCase()).toContain("sem falha");
    expect(clean.validator.pre_save.warnings.some((warning) => warning.code === "deload_with_advanced_method")).toBe(false);

    const contaminated = structuredClone(clean);
    const firstWeek = contaminated.workouts[0].exercises[0].weekly_prescription?.[0];
    expect(firstWeek).toBeDefined();
    if (firstWeek) firstWeek.method = "dropset";
    const validation = validateTrainingProgram({
      program: contaminated,
      input,
      preset: contaminated.methodology_preset.rules,
      catalog,
    });

    expect(validation.warnings.some((warning) => warning.code === "deload_with_advanced_method")).toBe(true);
  });

  it("retorna contrato de saída compatível com Studio/PDF/publicação", () => {
    const program = generateTrainingProgram(baseInput());

    expect(program).toMatchObject({
      schemaVersion: "bn-prescription-v1",
      engineMeta: {
        version: "v1",
        library_only: true,
        requested_days: 3,
        structured_days: 3,
      },
      cycle_name: expect.any(String),
      objective: expect.any(String),
      duration_weeks: 6,
      generated_by: "bn_prescription_engine_v1",
      library_policy: { only_library_exercises: true, catalog_count: catalog.length },
      validator: { pre_save: expect.any(Object) },
      validation: expect.any(Object),
      bnito_after_generation: { intent: "notify_student_prescription_ready" },
    });
    expect(program.workouts.length).toBe(3);
    expect(program.explanations[0]).toMatchObject({
      rule_id: expect.any(String),
      category: expect.any(String),
      source: expect.any(String),
      target: expect.any(String),
      action: expect.any(String),
      reason: expect.any(String),
    });
    expect(program.workouts[0].exercises[0]).toMatchObject({
      phase: expect.any(String),
      exercise_id: expect.any(String),
      exercise_name: expect.any(String),
      sets: expect.any(Number),
      reps: expect.any(String),
      rest_seconds: expect.any(Number),
      exercise_order: expect.any(Number),
    });
  });

  it("seleciona preset de emagrecimento para iniciante sem subir volume agressivo", () => {
    const program = generateTrainingProgram(baseInput({ objective: "emagrecimento", fitnessLevel: "iniciante", daysPerWeek: 3 }));

    expect(program.methodology_preset.key).toBe("emagrecimento");
    expect(program.periodization_blocks.flatMap((block) => block.methods).join(" ").toLowerCase()).not.toMatch(/drop|cluster|rest-pause/);
    expect(program.validator.pre_save.volume_review.filter((item) => ["quadriceps", "posterior", "gluteos", "costas", "peitoral"].includes(item.muscle_group)).every((item) => item.weekly_sets <= 12)).toBe(true);
  });

  it("limita avançado em hipertrofia ao teto duro v1 de 16 séries por grupo grande", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "avancado", objective: "hipertrofia", daysPerWeek: 5 }));

    expect(program.methodology_preset.key).toBe("hipertrofia_intermediario");
    expect(program.validator.pre_save.volume_review
      .filter((item) => ["quadriceps", "posterior", "gluteos", "costas", "peitoral"].includes(item.muscle_group))
      .every((item) => item.weekly_sets <= 16)).toBe(true);
  });

  it("usa retorno gradual com rampa conservadora quando objetivo pede retorno", () => {
    const program = generateTrainingProgram(baseInput({
      objective: "retorno gradual",
      restrictions: "retornando após lesão leve, sem dor atual",
      painEva: 2,
    }));

    expect(program.methodology_preset.key).toBe("retorno_lesao");
    expect(program.progression_protocol.toLowerCase()).toContain("progressao por tolerancia");
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).toContain("sem metodos avancados");
  });

  it("respeita equipamento limitado quando há alternativas reais na biblioteca", () => {
    const limitedCatalog: ExerciseCatalogEntry[] = [
      { id: "mob", name: "Mobilidade de Quadril Livre", muscle_group: "mobilidade", equipment: "livre" },
      { id: "dead-bug-livre", name: "Dead Bug Livre", muscle_group: "core", equipment: "livre" },
      { id: "glute-band-livre", name: "Abdução de Quadril com Mini Band", muscle_group: "glúteos", equipment: "mini band" },
      { id: "goblet", name: "Agachamento Goblet com Halteres", muscle_group: "quadríceps", equipment: "halteres" },
      { id: "rdl-halteres", name: "Terra Romeno com Halteres", muscle_group: "posterior", equipment: "halteres" },
      { id: "thoracic", name: "Mobilidade Torácica Livre", muscle_group: "ombros", equipment: "livre" },
      { id: "face-band", name: "Face Pull com Elástico", muscle_group: "ombros", equipment: "elástico" },
      { id: "row-db", name: "Remada Unilateral com Halteres", muscle_group: "costas", equipment: "halteres" },
      { id: "pushup", name: "Flexão de Braços", muscle_group: "peitoral", equipment: "livre" },
      { id: "db-press", name: "Supino com Halteres Pegada Neutra", muscle_group: "peitoral", equipment: "halteres" },
      { id: "floor-press", name: "Floor Press com Halteres", muscle_group: "peitoral", equipment: "halteres" },
      { id: "band-pulldown", name: "Puxada com Elástico", muscle_group: "costas", equipment: "elástico" },
      { id: "step-livre", name: "Step Up Baixo Livre", muscle_group: "glúteos", equipment: "livre" },
      { id: "bridge", name: "Ponte de Glúteos Livre", muscle_group: "glúteos", equipment: "livre" },
      { id: "calf", name: "Panturrilha em Pé Livre + Core", muscle_group: "core", equipment: "livre" },
    ];
    const program = generateTrainingProgram(baseInput({ catalog: limitedCatalog, equipment: "halteres elástico livre", daysPerWeek: 3 }));

    expect(allExerciseIds(program).every((id) => limitedCatalog.some((exercise) => exercise.id === id))).toBe(true);
    expect(program.workouts.flatMap((w) => w.exercises).every((exercise) => !/máquina|maquina/i.test(exercise.exercise_name))).toBe(true);
  });

  it("bloqueia quando o catálogo existe mas não há substituto seguro para padrão necessário", () => {
    const unsafeCatalog: ExerciseCatalogEntry[] = [
      {
        id: "unsafe-squat",
        name: "Agachamento Livre Profundo ATG",
        muscle_group: "quadríceps",
        equipment: "barra",
        contraindications: ["joelho"],
        pain_limitation_tags: ["joelho"],
      },
    ];
    const program = generateTrainingProgram(baseInput({
      catalog: unsafeCatalog,
      restrictions: "dor no joelho EVA 4 e valgo dinâmico",
      painEva: 4,
      assessmentContext: { ohs_compensations: [{ key: "dynamic_valgus", presente: true, severidade: "moderada" }] },
    }));

    expect(program.validator.pre_save.status).toBe("blocked");
    expect(program.validator.pre_save.blockers.some((blocker) => blocker.code === "safe_alternative_unavailable")).toBe(true);
    expect(allExerciseIds(program).every((id) => unsafeCatalog.some((exercise) => exercise.id === id))).toBe(true);
    expect(allExerciseIds(program)).not.toContain("unsafe-squat");
  });

  it("bloqueia EVA maior que 5 e registra handoff obrigatório ao professor", () => {
    const program = generateTrainingProgram(baseInput({
      restrictions: "dor no joelho forte",
      painEva: 7,
      painReports: [{ region: "joelho", eva: 7 }],
    }));

    expect(program.validator.pre_save.status).toBe("blocked");
    expect(program.validator.pre_save.blockers.some((blocker) => blocker.code === "high_pain_requires_professional_review")).toBe(true);
    expect(program.validator.pre_save.corrections.some((correction) => correction.code.includes("teacher_alert"))).toBe(true);
  });

  it("não confunde compensação severa da avaliação com dor severa", () => {
    const program = generateTrainingProgram(baseInput({
      restrictions: "dor articular no joelho EVA 2",
      painEva: 2,
      painReports: [{ region: "joelho", eva: 2 }],
      assessmentContext: {
        ohs_compensations: [
          { key: "trunk_forward_lean", presente: true, severidade: "severa" },
          { key: "butt_wink", presente: true, severidade: "severa" },
          { key: "shoulder_protraction_kyphosis", presente: true, severidade: "severa" },
        ],
      },
    }));

    expect(program.validator.pre_save.status).not.toBe("blocked");
    expect(hasBlocker(program, "high_pain_requires_professional_review")).toBe(false);
    expect(hasWarning(program, "trunk_forward_lean_severe_assessment_requires_teacher_review")).toBe(true);
    expect(hasWarning(program, "butt_wink_severe_assessment_requires_teacher_review")).toBe(true);
    expect(hasWarning(program, "shoulder_protraction_kyphosis_severe_assessment_requires_teacher_review")).toBe(true);
    expect(program.validator.pre_save.corrections.some((correction) => correction.code.includes("teacher_alert"))).toBe(true);
    expect(prescribedExerciseText(program)).not.toMatch(/good morning|terra convencional pesado|overhead pesado|barra nuca|dips/);
  });

  it("gera hipertrofia padrão 4 dias para intermediário sem dor", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "intermediario", objective: "hipertrofia", daysPerWeek: 4 }));

    expect(program.methodology_preset.key).toBe("hipertrofia_intermediario");
    expect(program.workouts.length).toBe(4);
    expect(program.validator.pre_save.blockers).toEqual([]);
    expect(program.periodization_blocks).toHaveLength(3);
  });

  it("mantém 100% das explicações BNITO rastreáveis por rule_id", () => {
    const program = generateTrainingProgram(baseInput({ restrictions: "dor lombar EVA 4", painEva: 4 }));

    expect(program.explanations.length).toBeGreaterThan(0);
    expect(program.explanations.every((explanation) => Boolean(explanation.rule_id && explanation.category && explanation.source && explanation.target && explanation.action && explanation.reason))).toBe(true);
  });

  it("nunca retorna exercício fora da biblioteca quando catálogo existe", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "intermediario", daysPerWeek: 4 }));
    const validIds = new Set(catalog.map((exercise) => exercise.id));

    expect(allExerciseIds(program).every((id) => validIds.has(id))).toBe(true);
  });

  it("não aplica volume de grupo grande a grupos pequenos", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "intermediario", daysPerWeek: 4 }));
    const sets = weeklySetsByGroup(program);

    expect((sets.get("core") || 0)).toBeLessThanOrEqual(10);
    expect((sets.get("ombros") || 0)).toBeLessThanOrEqual(10);
  });
});

describe("BN Prescription Engine v1 — Golden Test Cases GC-01..GC-12", () => {
  it("GC-01 PASS — iniciante com dor no joelho + valgo dinâmico", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "iniciante",
      objective: "hipertrofia",
      daysPerWeek: 3,
      injuries: ["joelho"],
      painEva: 3,
      painReports: [{ region: "joelho", eva: 3 }],
      restrictions: "dor no joelho e valgo dinâmico",
      assessmentContext: { ohs_compensations: [{ key: "dynamic_valgus", presente: true, severidade: "moderada" }] },
    }));
    const firstLower = program.workouts[0].exercises.map((exercise) => exercise.exercise_name.toLowerCase());
    const gluteIndex = firstLower.findIndex((name) => /abdu|glut/.test(name));
    const kneeIndex = firstLower.findIndex((name) => /agachamento|leg press/.test(name));

    expect(program.workouts.length).toBe(3);
    expect(weeklySets(program, "quadriceps")).toBeLessThanOrEqual(10);
    expect(gluteIndex).toBeGreaterThanOrEqual(0);
    expect(kneeIndex === -1 || gluteIndex < kneeIndex).toBe(true);
    expect(prescribedExerciseText(program)).not.toMatch(/agachamento livre profundo|atg|afundo alto|pliometr|salto/);
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).toContain("rir 3-4");
    expect(explanationIds(program)).toEqual(expect.arrayContaining(["reduzi_quadriceps_por_dor_joelho", "priorizei_gluteo_medio_por_valgo", "evitei_metodo_avancado_por_dor_ou_nivel"]));
    expect(hasWarning(program, "pain_or_injury_requires_conservative_progression")).toBe(true);
    expect(program.validator.pre_save.blockers).toEqual([]);
    expect(allExerciseIds(program).every((id) => catalog.some((exercise) => exercise.id === id))).toBe(true);
  });

  it("GC-02 PASS — intermediário com dor lombar + butt wink", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      daysPerWeek: 4,
      injuries: ["lombar"],
      painEva: 4,
      restrictions: "dor lombar EVA 4 ao agachar",
      assessmentContext: { ohs_compensations: [{ key: "butt_wink", presente: true, severidade: "moderada" }] },
    }));
    const text = prescribedExerciseText(program);

    expect(program.workouts.length).toBe(4);
    expect(program.weekly_structure).toContain("Upper/Lower");
    expect(weeklySets(program, "posterior")).toBeLessThanOrEqual(10);
    expect(text).toContain("anti-rotação");
    expect(text).not.toMatch(/terra convencional|good morning|flexão espinhal carregada|agachamento livre pesado/);
    expect(program.progression_protocol.toLowerCase()).toContain("hold/regress");
    expect(explanationIds(program)).toEqual(expect.arrayContaining(["reduzi_carga_axial_por_queixa_lombar", "limitei_amplitude_por_butt_wink"]));
    expect(hasWarning(program, "pain_or_injury_requires_conservative_progression")).toBe(true);
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-03 PASS — dor no ombro + cifose/protração", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      daysPerWeek: 4,
      injuries: ["ombro"],
      painEva: 4,
      restrictions: "dor no ombro em overhead",
      assessmentContext: { ohs_compensations: [{ key: "shoulder_protraction_kyphosis", presente: true, severidade: "moderada" }] },
    }));
    const text = prescribedExerciseText(program);

    expect(program.workouts.length).toBe(4);
    expect(weeklySets(program, "ombros")).toBeLessThanOrEqual(10);
    expect(text).toMatch(/face pull|remada/);
    expect(text).not.toMatch(/desenvolvimento atras da nuca|remada alta|dips|barra nuca|overhead pesado/);
    expect(program.progression_protocol.toLowerCase()).toContain("hold/regress");
    expect(explanationIds(program)).toEqual(expect.arrayContaining(["troquei_supino_por_rom_indolor", "priorizei_controle_escapular_por_ombro"]));
    expect(hasWarning(program, "pain_or_injury_requires_conservative_progression")).toBe(true);
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-04 PASS — iniciante pedindo 6x/semana é rebaixado com flag", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "iniciante", daysPerWeek: 6 }));

    expect(program.workouts.length).toBeLessThanOrEqual(4);
    expect(program.weekly_structure).toContain("3-4 dias estruturados");
    expect(weeklySets(program, "quadriceps")).toBeLessThanOrEqual(12);
    expect(weeklySets(program, "costas")).toBeLessThanOrEqual(12);
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).not.toMatch(/drop|cluster|rest-pause/);
    expect(explanationIds(program)).toContain("rebaixei_frequencia_iniciante_6_dias");
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-05 PASS — corrida 3x/semana + hipertrofia aciona anti-interferência", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario",
      objective: "hipertrofia",
      daysPerWeek: 4,
      isEnduranceAthlete: true,
      runningDaysContext: { days_per_week: 3, sport: "corrida" },
    }));

    expect(program.methodology_preset.key).toBe("corrida_musculacao");
    expect(weeklySets(program, "quadriceps")).toBeLessThanOrEqual(12);
    expect(weeklySets(program, "posterior")).toBeLessThanOrEqual(12);
    expect(explanationIds(program)).toContain("reduzi_mmii_por_corrida");
    expect(hasWarning(program, "endurance_agenda_missing")).toBe(true);
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-06 PASS — emagrecimento iniciante preserva força sem método avançado", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "iniciante", objective: "emagrecimento", daysPerWeek: 3 }));

    expect(program.methodology_preset.key).toBe("emagrecimento");
    expect(program.workouts.length).toBe(3);
    expect(weeklySets(program, "quadriceps")).toBeLessThanOrEqual(12);
    expect(weeklySets(program, "costas")).toBeLessThanOrEqual(12);
    expect(prescribedExerciseText(program)).toMatch(/agachamento|leg press|remada|supino|puxada/);
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).not.toMatch(/drop|cluster|rest-pause/);
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-07 PASS — avançado sem dor hipertrofia permite intensificação só no bloco final", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "avancado", objective: "hipertrofia", daysPerWeek: 5 }));
    const blockOne = JSON.stringify(program.periodization_blocks[0]).toLowerCase();
    const finalBlock = JSON.stringify(program.periodization_blocks[2]).toLowerCase();

    expect(program.workouts.length).toBe(5);
    expect(program.validator.pre_save.volume_review
      .filter((item) => ["quadriceps", "posterior", "gluteos", "costas", "peitoral"].includes(item.muscle_group))
      .every((item) => item.weekly_sets <= 16)).toBe(true);
    expect(blockOne).not.toMatch(/up-set|piramide|drop|cluster/);
    expect(finalBlock).toMatch(/up-set|piramide|método avançado|metodo avancado/);
    expect(explanationIds(program)).toContain("metodo_avancado_controlado");
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-08 PASS — retorno gradual pós-dor começa em MEV e progride por tolerância", () => {
    const program = generateTrainingProgram(baseInput({
      objective: "retorno_gradual",
      fitnessLevel: "iniciante",
      daysPerWeek: 3,
      painEva: 2,
      restrictions: "retorno gradual pós-dor, EVA 2",
    }));

    expect(program.methodology_preset.key).toBe("retorno_lesao");
    expect(weeklySets(program, "quadriceps")).toBeLessThanOrEqual(8);
    expect(program.workouts.flatMap((w) => w.exercises).every((exercise) => /3|4|5/.test(exercise.rir))).toBe(true);
    expect(program.progression_protocol.toLowerCase()).toContain("progressao por tolerancia");
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).toContain("sem metodos avancados");
    expect(hasWarning(program, "pain_or_injury_requires_conservative_progression")).toBe(true);
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-09 PASS — equipamento limitado usa somente alternativas disponíveis", () => {
    const limitedCatalog: ExerciseCatalogEntry[] = [
      { id: "mob", name: "Mobilidade de Quadril Livre", muscle_group: "mobilidade", equipment: "livre" },
      { id: "dead-bug-livre", name: "Dead Bug Livre", muscle_group: "core", equipment: "livre" },
      { id: "glute-band-livre", name: "Abdução de Quadril com Mini Band", muscle_group: "glúteos", equipment: "mini band" },
      { id: "goblet", name: "Agachamento Goblet com Halteres", muscle_group: "quadríceps", equipment: "halteres" },
      { id: "rdl-halteres", name: "Terra Romeno com Halteres", muscle_group: "posterior", equipment: "halteres" },
      { id: "thoracic", name: "Mobilidade Torácica Livre", muscle_group: "ombros", equipment: "livre" },
      { id: "face-band", name: "Face Pull com Elástico", muscle_group: "ombros", equipment: "elástico" },
      { id: "row-db", name: "Remada Unilateral com Halteres", muscle_group: "costas", equipment: "halteres" },
      { id: "pushup", name: "Flexão de Braços", muscle_group: "peitoral", equipment: "livre" },
      { id: "db-press", name: "Supino com Halteres Pegada Neutra", muscle_group: "peitoral", equipment: "halteres" },
      { id: "floor-press", name: "Floor Press com Halteres", muscle_group: "peitoral", equipment: "halteres" },
      { id: "band-pulldown", name: "Puxada com Elástico", muscle_group: "costas", equipment: "elástico" },
      { id: "step-livre", name: "Step Up Baixo Livre", muscle_group: "glúteos", equipment: "livre" },
      { id: "bridge", name: "Ponte de Glúteos Livre", muscle_group: "glúteos", equipment: "livre" },
      { id: "calf", name: "Panturrilha em Pé Livre + Core", muscle_group: "core", equipment: "livre" },
    ];
    const program = generateTrainingProgram(baseInput({
      catalog: limitedCatalog,
      fitnessLevel: "intermediario",
      daysPerWeek: 4,
      equipment: "casa_minimo halteres peso corporal elástico",
    }));

    expect(allExerciseIds(program).every((id) => limitedCatalog.some((exercise) => exercise.id === id))).toBe(true);
    expect(program.workouts.flatMap((w) => w.exercises).every((exercise) => !/máquina|maquina|barra/i.test(exercise.exercise_name))).toBe(true);
    expect(program.validator.pre_save.blockers).toEqual([]);
  });

  it("GC-10 PASS — biblioteca sem substituto seguro bloqueia sem inventar exercício", () => {
    const unsafeCatalog: ExerciseCatalogEntry[] = [
      {
        id: "unsafe-squat",
        name: "Agachamento Livre Profundo ATG",
        muscle_group: "quadríceps",
        equipment: "barra",
        contraindications: ["joelho"],
        pain_limitation_tags: ["joelho"],
      },
    ];
    const program = generateTrainingProgram(baseInput({
      catalog: unsafeCatalog,
      restrictions: "dor no joelho EVA 4 e valgo dinâmico",
      painEva: 4,
      assessmentContext: { ohs_compensations: [{ key: "dynamic_valgus", presente: true, severidade: "moderada" }] },
    }));

    expect(allExerciseIds(program).every((id) => unsafeCatalog.some((exercise) => exercise.id === id))).toBe(true);
    expect(allExerciseIds(program)).not.toContain("unsafe-squat");
    expect(hasBlocker(program, "safe_alternative_unavailable")).toBe(true);
    expect(program.library_policy.validation).toMatchObject({ valid: false });
  });

  it("GC-11 PASS — EVA > 5 gera blocker, handoff e remove padrão afetado", () => {
    const program = generateTrainingProgram(baseInput({
      restrictions: "dor severa no joelho",
      painEva: 7,
      painReports: [{ region: "joelho", eva: 7 }],
    }));
    const text = prescribedExerciseText(program);

    expect(hasBlocker(program, "high_pain_requires_professional_review")).toBe(true);
    expect(program.validator.pre_save.corrections.some((correction) => correction.code.includes("teacher_alert"))).toBe(true);
    expect(text).not.toMatch(/agachamento|leg press|quadríceps|quadriceps/);
    expect(program.progression_protocol.toLowerCase()).toContain("hold/regress");
    expect(JSON.stringify(program).toLowerCase()).not.toMatch(/diagn[oó]stico|tratamento cl[ií]nico|reabilita[cç][aã]o cl[ií]nica/);
  });

  it("GC-12 PASS — intermediário sem dor 4 dias hipertrofia baseline feliz", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "intermediario", objective: "hipertrofia", daysPerWeek: 4 }));
    const blocks = JSON.stringify(program.periodization_blocks).toLowerCase();

    expect(program.methodology_preset.key).toBe("hipertrofia_intermediario");
    expect(program.workouts.length).toBe(4);
    expect(program.weekly_structure).toContain("Upper/Lower");
    expect(program.validator.pre_save.warnings.filter((warning) => warning.code !== "cross_session_reuse")).toEqual([]);
    expect(program.validator.pre_save.blockers).toEqual([]);
    expect(weeklySets(program, "costas")).toBeGreaterThanOrEqual(10);
    expect(weeklySets(program, "costas")).toBeLessThanOrEqual(16);
    expect(weeklySets(program, "core")).toBeLessThanOrEqual(10);
    expect(blocks).toContain("1-2");
    expect(blocks).toContain("3-4");
    expect(blocks).toContain("5-6");
    expect(blocks).toContain("rir 3-4");
    expect(blocks).toContain("rir 2");
  });
});

describe("BN Prescription Engine v1 — regras inegociáveis", () => {
  it("PASS — R1..R10 são provadas objetivamente no contrato do engine", () => {
    const painProgram = generateTrainingProgram(baseInput({ restrictions: "dor EVA 4 no joelho", painEva: 4 }));
    const severeProgram = generateTrainingProgram(baseInput({ restrictions: "dor forte no joelho", painEva: 7 }));
    const baseline = generateTrainingProgram(baseInput({ fitnessLevel: "intermediario", daysPerWeek: 4 }));
    const validIds = new Set(catalog.map((exercise) => exercise.id));

    expect(painProgram.progression_protocol.toLowerCase()).toContain("hold/regress");
    expect(hasBlocker(severeProgram, "high_pain_requires_professional_review")).toBe(true);
    expect(severeProgram.validator.pre_save.corrections.some((correction) => correction.code.includes("teacher_alert"))).toBe(true);
    expect(JSON.stringify(severeProgram).toLowerCase()).not.toMatch(/diagn[oó]stico|tratamento cl[ií]nico/);
    expect(allExerciseIds(baseline).every((id) => validIds.has(id))).toBe(true);
    expect(JSON.stringify(generateTrainingProgram(baseInput({ fitnessLevel: "iniciante" })).periodization_blocks).toLowerCase()).not.toMatch(/drop|cluster|rest-pause|piramide/);
    expect(JSON.stringify(painProgram.periodization_blocks).toLowerCase()).not.toMatch(/drop|cluster|rest-pause|piramide/);
    expect(prescribedExerciseText(baseline)).not.toMatch(/pliometr|salto/);
    expect(baseline.validator.pre_save.volume_review.filter((item) => ["core", "ombros", "panturrilhas"].includes(item.muscle_group)).every((item) => item.weekly_sets <= 10)).toBe(true);
    expect(generateTrainingProgram(baseInput({
      catalog: [{ id: "unsafe", name: "Agachamento Livre Profundo ATG", muscle_group: "quadríceps", contraindications: ["joelho"], pain_limitation_tags: ["joelho"] }],
      restrictions: "dor no joelho EVA 4",
      painEva: 4,
    })).validator.pre_save.blockers.some((blocker) => blocker.code === "safe_alternative_unavailable")).toBe(true);
  });
});

describe("BN Prescription Engine v1 — hotfix F1..F4", () => {
  // F1 — dor estruturada (painReports/painEva) sem texto deve travar progressão e bloquear avançado.
  it("F1 — painReports EVA>3 sem texto trava progressão e bloqueia método avançado (falharia antes do fix)", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "avancado",
      objective: "hipertrofia",
      daysPerWeek: 5,
      restrictions: "",
      painReports: [{ region: "joelho", eva: 4 }],
    }));
    const blocks = JSON.stringify(program.periodization_blocks).toLowerCase();
    expect(program.progression_protocol.toLowerCase()).toContain("hold/regress");
    expect(blocks).not.toMatch(/up-set|piramide|drop|cluster|rest-pause/);
    expect(blocks).toContain("sem metodos avancados");
    expect(hasWarning(program, "pain_or_injury_requires_conservative_progression")).toBe(true);
  });

  it("F1 — painEva estruturado também conta (sem texto)", () => {
    const program = generateTrainingProgram(baseInput({
      fitnessLevel: "intermediario", objective: "hipertrofia", daysPerWeek: 4, restrictions: "", painEva: 5,
    }));
    expect(program.progression_protocol.toLowerCase()).toMatch(/hold\/regress|tolerancia/);
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).not.toMatch(/up-set|piramide|drop|cluster/);
  });

  it("F1 — sem dor (clean) NÃO trava nem bloqueia avançado (sem falso positivo)", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "avancado", objective: "hipertrofia", daysPerWeek: 5 }));
    expect(program.progression_protocol.toLowerCase()).not.toContain("hold/regress");
    expect(JSON.stringify(program.periodization_blocks).toLowerCase()).toMatch(/up-set|piramide/);
  });

  // F2 — endurance só reduz com freq >=3x e só em MMII; superiores preservados.
  it("F2 — endurance >=3x reduz teto de MMII (~20-30%) e preserva membros superiores", () => {
    const end = baseInput({ fitnessLevel: "intermediario", isEnduranceAthlete: true, runningDaysContext: { days_per_week: 3 } });
    const noEnd = baseInput({ fitnessLevel: "intermediario" });
    const quadEnd = getVolumeRangeForGroup("quadriceps", "intermediario", end).mrv;
    const quadNo = getVolumeRangeForGroup("quadriceps", "intermediario", noEnd).mrv;
    const chestEnd = getVolumeRangeForGroup("peitoral", "intermediario", end).mrv;
    const chestNo = getVolumeRangeForGroup("peitoral", "intermediario", noEnd).mrv;
    expect(quadEnd).toBeLessThan(quadNo);
    expect(quadEnd).toBeLessThanOrEqual(Math.round(quadNo * 0.8));
    expect(chestEnd).toBe(chestNo);
  });

  it("F2 — endurance <3x NÃO corta MMII", () => {
    const low = baseInput({ fitnessLevel: "intermediario", runningDaysContext: { days_per_week: 2 } });
    const noEnd = baseInput({ fitnessLevel: "intermediario" });
    expect(getVolumeRangeForGroup("quadriceps", "intermediario", low).mrv)
      .toBe(getVolumeRangeForGroup("quadriceps", "intermediario", noEnd).mrv);
  });

  it("F2 — endurance sem frequência emite warning de agenda insuficiente", () => {
    const program = generateTrainingProgram(baseInput({ fitnessLevel: "intermediario", isEnduranceAthlete: true }));
    expect(hasWarning(program, "endurance_agenda_missing")).toBe(true);
  });

  // F4 — teto duro no OUTPUT final: iniciante <=12 (grupo grande), interm/avançado <=16 (qualquer grupo).
  it("F4 — teto de volume garantido no output por perfil", () => {
    const large = ["quadriceps", "posterior", "gluteos", "costas", "peitoral"];
    const iniProfiles = [
      baseInput({ fitnessLevel: "iniciante", daysPerWeek: 6 }),
      baseInput({ fitnessLevel: "iniciante", objective: "emagrecimento", daysPerWeek: 5 }),
    ];
    const advProfiles = [
      baseInput({ fitnessLevel: "intermediario", daysPerWeek: 5 }),
      baseInput({ fitnessLevel: "avancado", objective: "hipertrofia", daysPerWeek: 6 }),
    ];
    for (const input of iniProfiles) {
      const sets = weeklySetsByGroup(generateTrainingProgram(input));
      for (const g of large) expect(sets.get(g) || 0).toBeLessThanOrEqual(12);
    }
    for (const input of advProfiles) {
      const sets = weeklySetsByGroup(generateTrainingProgram(input));
      for (const [, n] of sets) expect(n).toBeLessThanOrEqual(16);
    }
  });
});
