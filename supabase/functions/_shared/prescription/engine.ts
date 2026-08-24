import { pickCatalogExercise } from "./exerciseScoring.ts";
import { correctionsToExplanations, deloadExplanation, enduranceExplanation, explanationsFromRestrictions, frequencyDowngradeExplanation, progressionExplanation } from "./explanations.ts";
import { normalizeText, objectiveModifier, resolveSplit, selectMethodologyPreset } from "./presets.ts";
import { allocateDeloadSetCounts, buildPeriodizationBlocks, progressionProtocol, resolveDurationWeeks, shouldHoldProgression } from "./progressionRules.ts";
import { applyLongitudinalProgression, previousExerciseIds, resolveSequenceNumber } from "./longitudinalRules.ts";
import { applyRestrictionRules, deriveRestrictionRules } from "./restrictionRules.ts";
import { validateTrainingProgram } from "./validator.ts";
import { enforceVolumeCaps } from "./volumeRules.ts";
import { buildWeeklyPeriodization } from "./weeklyPeriodization.ts";
import { DELOAD_RULES } from "./methodology.ts";
import type {
  ExerciseCatalogEntry,
  PrescriptionInput,
  TrainingExercise,
  TrainingProgram,
  TrainingWorkout,
  ValidationCorrection,
} from "./types.ts";
import { prescriptionRiskText } from "./clinicalContext.ts";

type ExerciseSpec = {
  phase: string;
  keywords: string[];
  sets: number;
  reps: string;
  rest: number;
  rir: string;
  cue: string;
  note: string;
  tempo?: string;
  preferredMuscleGroup?: string;
  preferredPattern?: string;
  required?: boolean;
  reportGap?: boolean;
};

const PHASE_ORDER: Record<string, number> = {
  mobilidade: 10,
  autoliberacao: 20,
  alongamento: 30,
  fisioterapia: 40,
  controle_motor: 50,
  ativacao_core: 60,
  ativacao_especifica: 70,
  pliometria: 80,
  forca_global: 90,
  forca_especifica: 100,
};

function isHypertrophyObjective(input: PrescriptionInput) {
  return /(hipertrof|massa|estetica|recompos)/.test(normalizeText(input.objective));
}

function isPerformanceObjective(input: PrescriptionInput) {
  return /(performance|potencia|velocidade|esporte)/.test(normalizeText(input.objective));
}

function canUsePlyometrics(input: PrescriptionInput) {
  return resolveSequenceNumber(input) > 1 &&
    isPerformanceObjective(input) &&
    !normalizeText(input.fitnessLevel).includes("inic") &&
    !shouldHoldProgression(input) &&
    !input.deload;
}

function applyObjectiveProportions(input: PrescriptionInput, specs: ExerciseSpec[]) {
  const hypertrophy = isHypertrophyObjective(input);
  const performance = isPerformanceObjective(input);
  return specs
    .map((spec) => {
      if (hypertrophy && spec.phase === "forca_especifica") return { ...spec, sets: Math.max(3, spec.sets) };
      if (performance && ["controle_motor", "ativacao_core", "ativacao_especifica", "pliometria"].includes(spec.phase)) {
        return { ...spec, sets: Math.max(2, spec.sets) };
      }
      if (performance && spec.phase === "forca_especifica") return { ...spec, sets: Math.min(2, spec.sets) };
      return spec;
    })
    .sort((a, b) => (PHASE_ORDER[a.phase] ?? 999) - (PHASE_ORDER[b.phase] ?? 999));
}

function clean(value: unknown) {
  return String(value || "").replace(/[^\x20-\x7E\u00C0-\u017F]/g, "");
}

function clampDays(days: unknown) {
  return Math.min(6, Math.max(2, Number(days) || 3));
}

function normalizeCatalog(catalog: ExerciseCatalogEntry[] = []) {
  return catalog.filter((exercise) => exercise?.id && exercise?.name).map((exercise) => ({
    ...exercise,
    contraindications: exercise.contraindications || [],
    regressions: exercise.regressions || [],
    progressions: exercise.progressions || [],
    equivalent_substitutes: exercise.equivalent_substitutes || [],
    pain_limitation_tags: exercise.pain_limitation_tags || [],
    targets: exercise.targets || [],
  }));
}

function riskText(input: PrescriptionInput) {
  return prescriptionRiskText(input);
}

function distributeDays(count: number) {
  if (count <= 2) return [1, 4];
  if (count === 3) return [1, 3, 5];
  if (count === 4) return [1, 2, 4, 5];
  if (count === 5) return [1, 2, 3, 5, 6];
  return [1, 2, 3, 4, 5, 6];
}

function exerciseToTrainingExercise(exercise: ExerciseCatalogEntry, spec: ExerciseSpec, order: number, input: PrescriptionInput): TrainingExercise {
  const modifier = objectiveModifier(input);
  const isMain = spec.phase === "forca_global" || spec.phase === "controle_motor";
  return {
    phase: spec.phase,
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    library_exercise_name: exercise.name,
    muscle_group: exercise.muscle_group || exercise.targets?.[0]?.muscle_group || spec.preferredMuscleGroup || "geral",
    targets: (exercise.targets || []).map((target) => ({ ...target })),
    sets: spec.sets,
    reps: spec.reps || (isMain ? modifier.mainReps : modifier.accessoryReps),
    load_percent_1rm: null,
    rir: input.deload ? DELOAD_RULES.rir : spec.rir,
    rest_seconds: input.deload ? Math.max(90, spec.rest) : spec.rest,
    tempo: spec.tempo || "3010",
    exercise_order: order,
    cues: spec.cue,
    biomechanical_note: spec.note,
    regression: exercise.regressions?.[0] || "Reduzir amplitude/carga e manter dor <= 3.",
    progression: input.deload
      ? `Manter carga e repetições, encerrando cada série com RIR ${DELOAD_RULES.rir}.`
      : exercise.progressions?.[0] || "Progredir reps antes de carga, mantendo técnica.",
    set_types: Array.from({ length: Math.max(1, spec.sets) }, () => "normal" as const),
  };
}

function hasSessionExcludedEligibleAlternative(args: {
  catalog: ExerciseCatalogEntry[];
  spec: ExerciseSpec;
  programUsedIds: Set<string>;
  sessionUsedIds: Set<string>;
  restrictions: ReturnType<typeof deriveRestrictionRules>;
  input: PrescriptionInput;
}) {
  if (args.sessionUsedIds.size === 0) return false;
  return Boolean(pickCatalogExercise({
    catalog: args.catalog,
    keywords: args.spec.keywords,
    usedIds: args.programUsedIds,
    restrictions: args.restrictions,
    equipment: args.input.equipment,
    fitnessLevel: args.input.fitnessLevel,
    preferredMuscleGroup: args.spec.preferredMuscleGroup,
    preferredPattern: args.spec.preferredPattern,
    preferredExerciseIds: previousExerciseIds(args.input, args.spec.phase, args.spec.preferredMuscleGroup),
  }));
}

function selectExercises(input: PrescriptionInput, specs: ExerciseSpec[], programUsedIds: Set<string>) {
  const catalog = normalizeCatalog(input.catalog);
  const restrictions = deriveRestrictionRules(input);
  const sessionUsedIds = new Set<string>();
  const gaps: string[] = [];
  const pickedExercises: Array<{ specIndex: number; exercise: TrainingExercise }> = [];

  const orderedSpecs = specs
    .map((spec, index) => ({ spec, index }))
    .sort((left, right) => Number(left.spec.required === false) - Number(right.spec.required === false) || left.index - right.index);

  orderedSpecs.forEach(({ spec, index }) => {
    const exercise = pickCatalogExercise({
      catalog,
      keywords: spec.keywords,
      usedIds: programUsedIds,
      hardExcludedIds: sessionUsedIds,
      restrictions,
      equipment: input.equipment,
      fitnessLevel: input.fitnessLevel,
      preferredMuscleGroup: spec.preferredMuscleGroup,
      preferredPattern: spec.preferredPattern,
      preferredExerciseIds: previousExerciseIds(input, spec.phase, spec.preferredMuscleGroup),
    });
    if (!exercise) {
      if (spec.reportGap !== false) {
        const gapCode = hasSessionExcludedEligibleAlternative({
          catalog,
          spec,
          programUsedIds,
          sessionUsedIds,
          restrictions,
          input,
        }) ? "session_unique_exhausted" : "safe_alternative_unavailable";
        gaps.push(`${spec.required === false ? "WARNING" : "BLOCKER"}:${gapCode}:${spec.phase}:${spec.keywords.join("/")}`);
      }
      return;
    }
    if (programUsedIds.has(exercise.id)) {
      gaps.push(`WARNING:cross_session_reuse:${spec.phase}:${exercise.id}:${exercise.name}`);
    }
    sessionUsedIds.add(exercise.id);
    programUsedIds.add(exercise.id);
    pickedExercises.push({ specIndex: index, exercise: exerciseToTrainingExercise(exercise, spec, index + 1, input) });
  });

  const exercises = pickedExercises
    .sort((left, right) => left.specIndex - right.specIndex)
    .map(({ exercise }, index) => ({ ...exercise, exercise_order: index + 1 }));

  return { exercises, gaps };
}

function lowerWorkoutSpecs(input: PrescriptionInput): ExerciseSpec[] {
  const text = riskText(input);
  const knee = /joelho|valgo/.test(text);
  const back = /lombar|butt|retrovers/.test(text);
  const sets = input.isEnduranceAthlete || input.runningDaysContext ? 2 : 3;
  const specs: ExerciseSpec[] = [
    { phase: "mobilidade", keywords: ["mobilidade tornozelo quadril", "tornozelo", "quadril", "alongamento"], preferredMuscleGroup: "mobilidade", preferredPattern: "isolado_acessorio", required: false, sets: 2, reps: "8-10", rest: 30, rir: "4", cue: "Amplitude sem dor e respiração calma.", note: knee ? "Preparar tornozelo/quadril para reduzir estresse no joelho." : "Preparar amplitude antes da força." },
    { phase: "autoliberacao", keywords: ["auto liberacao", "liberacao miofascial", "rolo", "foam roller", "mobilidade"], preferredMuscleGroup: "mobilidade", preferredPattern: "isolado_acessorio", required: false, reportGap: false, sets: 1, reps: "30-45s", rest: 15, rir: "4", cue: "Pressão tolerável, sem insistir em dor aguda.", note: "Preparação opcional em circuito, sem gerar fadiga." },
    { phase: "ativacao_core", keywords: back ? ["pallof", "bird dog", "dead bug", "core"] : ["prancha", "dead bug", "core", "pallof"], preferredMuscleGroup: "core", preferredPattern: "core", sets: 2, reps: "20-30s", rest: 45, rir: input.deload ? "4" : "3-4", cue: "Trave costelas e pelve, sem prender o ar.", note: back ? "Core anti-extensão/anti-rotação para proteger lombar." : "Aumenta estabilidade lombo-pélvica antes da carga." },
    { phase: "ativacao_especifica", keywords: ["gluteo medio", "gluteo", "abducao", "mini band"], preferredMuscleGroup: "gluteos", preferredPattern: "isolado_acessorio", sets: 2, reps: "12-15", rest: 45, rir: input.deload ? "4" : "3", cue: "Joelho alinhado ao pé, sem colapsar.", note: knee ? "Prioriza controle de valgo dinâmico." : "Ativa quadril para padrões de agachar." },
    { phase: "controle_motor", keywords: knee ? ["leg press", "agachamento caixa", "caixa", "rom parcial"] : ["agachamento", "goblet", "squat", "caixa"], preferredMuscleGroup: "quadriceps", preferredPattern: "joelho_dominante", sets: knee ? 1 : 2, reps: "8-10", rest: 60, rir: input.deload ? "4" : "3-4", cue: "Desça até onde mantém pelve e joelho alinhados.", note: back ? "Limitar amplitude para manter coluna neutra." : "Reforça padrão técnico antes de carga." },
    { phase: "forca_global", keywords: back ? ["leg press", "hack", "maquina", "agachamento"] : knee ? ["leg press", "agachamento caixa", "caixa", "rom parcial"] : ["agachamento", "leg press", "goblet", "squat"], preferredMuscleGroup: "quadriceps", preferredPattern: "joelho_dominante", sets: knee ? Math.max(1, sets - 1) : sets, reps: "8-10", rest: 90, rir: input.deload ? "4" : "2-3", cue: "Empurre o chão sem perder alinhamento.", note: "Força global com margem de segurança." },
    { phase: "forca_especifica", keywords: ["posterior", "mesa flexora", "isquiotibiais", "gluteo"], preferredMuscleGroup: "posterior", preferredPattern: "quadril_dominante", required: false, sets: 2, reps: "10-12", rest: 75, rir: input.deload ? "4" : "2-3", cue: "Controle a volta e evite compensar lombar.", note: "Equilibra cadeia posterior para proteger joelho/quadril." },
  ];
  if (canUsePlyometrics(input)) {
    specs.push({ phase: "pliometria", keywords: ["salto baixo", "pogo", "hop", "pliometria", "med ball"], preferredMuscleGroup: "pernas", preferredPattern: "pliometria", required: false, reportGap: false, sets: 2, reps: "3-5", rest: 75, rir: "4", cue: "Poucas repetições, aterrissagem silenciosa e técnica limpa.", note: "Potência técnica antes da força; interromper na primeira perda de qualidade." });
  }
  if (isHypertrophyObjective(input)) {
    specs.push({ phase: "forca_especifica", keywords: ["cadeira extensora", "mesa flexora", "maquina", "isolado"], preferredMuscleGroup: "quadriceps", preferredPattern: "isolado_acessorio", required: false, reportGap: false, sets: 3, reps: "10-15", rest: 60, rir: input.deload ? "4" : "2-3", cue: "Controle a amplitude e mantenha tensão no músculo-alvo.", note: "Maior proporção de força isolada e máquinas para hipertrofia." });
  }
  return applyObjectiveProportions(input, specs);
}

function upperWorkoutSpecs(input: PrescriptionInput): ExerciseSpec[] {
  const shoulder = /ombro|overhead|cifose|protrus/.test(riskText(input));
  const specs: ExerciseSpec[] = [
    { phase: "mobilidade", keywords: ["mobilidade toracica", "ombro", "shoulder", "toracica"], preferredMuscleGroup: "ombros", preferredPattern: "isolado_acessorio", required: false, sets: 2, reps: "8-10", rest: 30, rir: input.deload ? "4-5" : "4", cue: "Movimento suave, sem forçar amplitude.", note: "Prepara ombro e coluna torácica para membros superiores." },
    { phase: "fisioterapia", keywords: ["fisioterapia ombro", "manguito", "rotacao externa", "escapula"], preferredMuscleGroup: "ombros", preferredPattern: "isolado_acessorio", required: false, reportGap: false, sets: 1, reps: "10-12", rest: 20, rir: "4-5", cue: "Baixa resistência e controle total.", note: "Preparação opcional agrupada, sem substituir atendimento clínico." },
    { phase: "ativacao_core", keywords: ["pallof", "prancha", "core", "dead bug"], preferredMuscleGroup: "core", preferredPattern: "core", sets: 2, reps: "20-30s", rest: 45, rir: input.deload ? "4-5" : "3-4", cue: "Mantenha tronco estável.", note: "Estabilidade para puxadas e empurradas." },
    { phase: "ativacao_especifica", keywords: shoulder ? ["face pull", "rotacao externa", "rotador", "manguito"] : ["escapula", "face pull", "rotador", "manguito"], preferredMuscleGroup: "ombros", preferredPattern: "isolado_acessorio", sets: 2, reps: "12-15", rest: 45, rir: input.deload ? "4-5" : "3", cue: "Ombros longe das orelhas.", note: shoulder ? "Prioriza controle escapular antes de empurrar." : "Melhora controle escapular." },
    { phase: "controle_motor", keywords: ["remada", "row", "puxada"], preferredMuscleGroup: "costas", preferredPattern: "puxar_horizontal", sets: 2, reps: "10", rest: 60, rir: input.deload ? "4-5" : "3", cue: "Puxe com cotovelos, sem jogar tronco.", note: "Ensina trajetória e controle escapular." },
    { phase: "forca_global", keywords: shoulder ? ["landmine", "supino maquina", "pegada neutra", "supino inclinado"] : ["supino", "press", "empurrar", "chest"], preferredMuscleGroup: "peitoral", preferredPattern: "empurrar_horizontal", sets: 3, reps: "8-10", rest: 90, rir: input.deload ? "4-5" : "2-3", cue: "Escápulas firmes e punho neutro.", note: shoulder ? "ROM indolor e controle escapular." : "Empurrar global com controle." },
    { phase: "forca_especifica", keywords: ["remada", "puxada", "costas", "dorsal"], preferredMuscleGroup: "costas", preferredPattern: "puxar_vertical", required: false, sets: 3, reps: "8-12", rest: 90, rir: input.deload ? "4-5" : "2-3", cue: "Controle a volta sem perder postura.", note: "Equilibra ombro e postura." },
  ];
  if (canUsePlyometrics(input)) {
    specs.push({ phase: "pliometria", keywords: ["med ball chest throw", "arremesso medicine ball", "potencia superior", "pliometria"], preferredMuscleGroup: "peitoral", preferredPattern: "pliometria", required: false, reportGap: false, sets: 2, reps: "3-5", rest: 75, rir: "4", cue: "Acelere sem perder o controle do tronco.", note: "Potência técnica de membros superiores antes da força." });
  }
  if (isHypertrophyObjective(input)) {
    specs.push({ phase: "forca_especifica", keywords: ["crucifixo maquina", "voador", "crossover", "maquina peitoral"], preferredMuscleGroup: "peitoral", preferredPattern: "isolado_acessorio", required: false, reportGap: false, sets: 3, reps: "10-15", rest: 60, rir: input.deload ? "4-5" : "2-3", cue: "Mantenha tensão contínua e amplitude confortável.", note: "Acessório em máquina priorizado pelo objetivo de hipertrofia." });
  }
  return applyObjectiveProportions(input, specs);
}

function fullBodySpecs(input: PrescriptionInput): ExerciseSpec[] {
  const text = riskText(input);
  const knee = /joelho|valgo/.test(text);
  const back = /lombar|butt|retrovers/.test(text);
  const beginner = normalizeText(input.fitnessLevel).includes("inic");
  const specs: ExerciseSpec[] = [
    { phase: "mobilidade", keywords: ["mobilidade quadril", "tornozelo", "alongamento"], preferredMuscleGroup: "mobilidade", preferredPattern: "isolado_acessorio", required: false, sets: 2, reps: "8-10", rest: 30, rir: input.deload ? "4-5" : "4", cue: "Busque amplitude confortável.", note: "Abre movimento antes do unilateral." },
    { phase: "alongamento", keywords: ["alongamento dinamico", "mobilidade", "cadeia posterior", "quadril"], preferredMuscleGroup: "mobilidade", preferredPattern: "isolado_acessorio", required: false, reportGap: false, sets: 1, reps: "30s", rest: 15, rir: "4-5", cue: "Sem rebotes e sem dor.", note: "Preparação curta agrupada com mobilidade e ativação." },
    { phase: "ativacao_core", keywords: back ? ["bird dog", "pallof", "dead bug", "core"] : ["bird dog", "perdigueiro", "core", "prancha"], preferredMuscleGroup: "core", preferredPattern: "core", sets: 2, reps: "8-10 por lado", rest: 45, rir: input.deload ? "4-5" : "3-4", cue: "Quadril parado e coluna neutra.", note: "Controle anti-rotação." },
    { phase: "controle_motor", keywords: knee ? ["step", "unilateral", "rom parcial", "gluteo"] : ["afundo", "lunge", "step", "unilateral"], preferredMuscleGroup: "gluteos", preferredPattern: "unilateral", sets: knee ? 1 : 2, reps: "8 por lado", rest: 60, rir: input.deload ? "4-5" : "3-4", cue: "Joelho acompanha o pé.", note: knee ? "Usar amplitude curta e sem dor." : "Integra equilíbrio e controle." },
    { phase: "forca_global", keywords: back ? ["hip thrust", "gluteo", "ponte"] : ["terra romeno", "rdl", "levantamento", "hip hinge"], preferredMuscleGroup: "posterior", preferredPattern: "quadril_dominante", sets: back ? 2 : 3, reps: "8-10", rest: 90, rir: input.deload ? "4-5" : "2-3", cue: "Dobre quadril sem arredondar lombar.", note: back ? "Preferir hinge leve ou hip thrust apoiado." : "Fortalece cadeia posterior com controle." },
    { phase: "forca_global", keywords: back ? ["remada apoiada", "remada maquina", "costas"] : ["remada", "puxada", "costas"], preferredMuscleGroup: "costas", preferredPattern: "puxar_horizontal", sets: 3, reps: "10-12", rest: 75, rir: input.deload ? "4-5" : "2-3", cue: "Postura alta e controle de escápulas.", note: "Complementa postura e tronco." },
    { phase: "forca_especifica", keywords: ["panturrilha", "calf", "abdomen", "core"], preferredMuscleGroup: "core", preferredPattern: "isolado_acessorio", required: false, sets: beginner ? 1 : 2, reps: "12-15", rest: 60, rir: input.deload ? "4-5" : "2-3", cue: "Controle total da fase excêntrica.", note: "Acessório leve para suporte do ciclo." },
  ];
  if (canUsePlyometrics(input)) {
    specs.push({ phase: "pliometria", keywords: ["salto baixo", "pogo", "hop", "med ball", "pliometria"], preferredMuscleGroup: "pernas", preferredPattern: "pliometria", required: false, reportGap: false, sets: 2, reps: "3-5", rest: 75, rir: "4", cue: "Qualidade máxima e aterrissagem controlada.", note: "Baixo volume de potência antes da força global." });
  }
  if (isHypertrophyObjective(input)) {
    specs.push({ phase: "forca_especifica", keywords: ["maquina", "isolado", "extensora", "flexora", "crossover"], preferredMuscleGroup: "quadriceps", preferredPattern: "isolado_acessorio", required: false, reportGap: false, sets: 3, reps: "10-15", rest: 60, rir: input.deload ? "4-5" : "2-3", cue: "Tensão contínua sem compensar.", note: "Volume isolado adicional para hipertrofia." });
  }
  return applyObjectiveProportions(input, specs);
}

function splitTemplates(input: PrescriptionInput): Array<{ name: string; focus: string; specs: ExerciseSpec[] }> {
  const split = resolveSplit(input);
  const beginner = normalizeText(input.fitnessLevel).includes("inic");
  const extraCap = beginner ? 1 : 2;
  const base = [
    { name: "Treino A - Base tecnica de membros inferiores", focus: "mobilidade, core, controle de quadril e força global leve", specs: lowerWorkoutSpecs(input) },
    { name: "Treino B - Postura, puxar e empurrar", focus: "mobilidade torácica, escápula, puxar e empurrar técnico", specs: upperWorkoutSpecs(input) },
    { name: "Treino C - Corpo inteiro e unilateral leve", focus: "integração full body, unilateral e acessórios", specs: fullBodySpecs(input) },
    { name: "Treino D - Superior e core complementar", focus: "costas, peitoral técnico, ombro saudável e core", specs: upperWorkoutSpecs(input).map((spec) => ({ ...spec, sets: Math.min(spec.sets, extraCap) })) },
    { name: "Treino E - Inferior posterior leve", focus: "cadeia posterior, glúteos e estabilidade", specs: fullBodySpecs(input).map((spec) => ({ ...spec, sets: Math.min(spec.sets, extraCap) })) },
  ];
  return base.slice(0, split.structuredDays);
}

function buildWorkouts(input: PrescriptionInput) {
  const usedIds = new Set<string>();
  const split = resolveSplit(input);
  const daySlots = distributeDays(split.structuredDays);
  const gaps: string[] = [];
  const workouts: TrainingWorkout[] = splitTemplates(input).map((template, index) => {
    const picked = selectExercises(input, template.specs, usedIds);
    gaps.push(...picked.gaps);
    return {
      name: template.name,
      day_of_week: daySlots[index] || index + 1,
      duration_min: 50,
      split_focus: template.focus,
      exercises: picked.exercises,
      volume_load_estimate: input.deload
        ? `Deload regenerativo; volume global reduzido; usar RIR ${DELOAD_RULES.rir}.`
        : input.isEnduranceAthlete || input.runningDaysContext
        ? "Conservador; volume de MMII reduzido por endurance; usar RIR 2-3."
        : "Conservador; usar RIR 2-4 e dor <= 3.",
      notes: "Gerado pelo BN Prescription Engine v1. Revisar casos clínicos complexos antes de publicar.",
    };
  });
  return { workouts, gaps };
}

function applyDeloadVolumeBudget(workouts: TrainingWorkout[], input: PrescriptionInput) {
  if (!input.deload) return { workouts, allocation: null };
  const allocation = allocateDeloadSetCounts(
    workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.sets)),
  );
  let allocationIndex = 0;
  return {
    allocation,
    workouts: workouts.map((workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise) => {
        const sets = allocation.sets[allocationIndex++] ?? 1;
        return {
          ...exercise,
          sets,
          set_types: Array.from({ length: sets }, () => "normal" as const),
        };
      }),
    })),
  };
}

function applySimpleCorrections(program: TrainingProgram, input: PrescriptionInput) {
  const corrections: ValidationCorrection[] = [];
  const level = normalizeText(input.fitnessLevel);
  if (shouldHoldProgression(input) || level.includes("inic")) {
    const before = JSON.stringify(program.periodization_blocks);
    program.periodization_blocks = program.periodization_blocks.map((block) => ({
      ...block,
      methods: block.methods.filter((method) => !/(drop|cluster|piramide|up-set|rest)/.test(normalizeText(method))).concat(block.methods.some((method) => /avancado|piramide|up-set|drop|cluster/.test(normalizeText(method))) ? ["sem metodos avancados"] : []),
    }));
    if (before !== JSON.stringify(program.periodization_blocks)) {
      corrections.push({
        code: "removed_advanced_methods",
        message: "Removi métodos avançados por nível iniciante ou contexto de dor/restrição.",
        applied: true,
        source: "nivel",
      });
    }
  }
  return corrections;
}

export function generateTrainingProgram(input: PrescriptionInput): TrainingProgram {
  const normalizedInput: PrescriptionInput = {
    ...input,
    catalog: normalizeCatalog(input.catalog),
    daysPerWeek: clampDays(input.daysPerWeek),
    durationWeeks: resolveDurationWeeks(input),
  };
  const preset = selectMethodologyPreset(normalizedInput);
  const restrictions = deriveRestrictionRules(normalizedInput);
  const durationWeeks = resolveDurationWeeks(normalizedInput);
  const built = buildWorkouts(normalizedInput);
  const capped = enforceVolumeCaps(built.workouts, normalizedInput);
  const deloadBudget = applyDeloadVolumeBudget(capped.workouts, normalizedInput);
  const gaps = built.gaps;
  const workouts = deloadBudget.workouts;
  const longitudinal = applyLongitudinalProgression(workouts, normalizedInput);
  const weekly = buildWeeklyPeriodization(workouts, normalizedInput);
  const periodization = buildPeriodizationBlocks(normalizedInput);
  const split = resolveSplit(normalizedInput);
  const advancedAllowed = !normalizedInput.deload && !shouldHoldProgression(normalizedInput) && !normalizeText(normalizedInput.fitnessLevel).includes("inic");
  const explanations = [
    ...explanationsFromRestrictions(restrictions),
    ...enduranceExplanation(Boolean(normalizedInput.isEnduranceAthlete || normalizedInput.runningDaysContext)),
    ...frequencyDowngradeExplanation(split.downgraded, split.requestedDays, split.structuredDays),
    ...deloadExplanation(Boolean(normalizedInput.deload)),
    ...(!normalizedInput.deload ? [progressionExplanation(advancedAllowed)] : []),
    longitudinal.explanation,
    {
      rule_id: "BN_WEEKLY_PERIODIZATION_EXECUTABLE",
      category: "progressao" as const,
      source: "objetivo" as const,
      target: "ciclo_semanal",
      action: "Aplicar automaticamente séries, repetições, RIR, cadência e método correspondentes à semana vigente.",
      reason: "O ciclo precisa evoluir em blocos de duas semanas sem reiniciar o treino nem depender de texto interpretativo.",
      severity: "leve" as const,
    },
    {
      rule_id: "BN_SESSION_PHASE_ORDER",
      category: "priorizacao" as const,
      source: "objetivo" as const,
      target: "ordem_da_sessao",
      action: "Ordenar a sessão em preparação, controle motor, ativações, potência elegível, força global e força específica.",
      reason: "A sequência reduz interferência da fadiga na aprendizagem motora e mantém os exercícios isolados depois dos padrões globais.",
      severity: "leve" as const,
    },
    ...(isHypertrophyObjective(normalizedInput)
      ? [{
          rule_id: "BN_HYPERTROPHY_EXERCISE_PROPORTION",
          category: "priorizacao" as const,
          source: "objetivo" as const,
          target: "forca_especifica_e_maquinas",
          action: "Aumentar a participação de exercícios isolados e máquinas depois da base global.",
          reason: "O objetivo de hipertrofia pede mais volume local sem abandonar mobilidade, controle e força global.",
          severity: "leve" as const,
        }]
      : []),
    ...(isPerformanceObjective(normalizedInput)
      ? [{
          rule_id: "BN_PERFORMANCE_EXERCISE_PROPORTION",
          category: "priorizacao" as const,
          source: "objetivo" as const,
          target: "controle_ativacao_e_potencia",
          action: "Aumentar controle motor, ativações e potência técnica antes da força global.",
          reason: "O objetivo de performance exige qualidade de movimento, produção de força e baixa fadiga antes do bloco principal.",
          severity: "leve" as const,
        }]
      : []),
    ...capped.adjustments.map((adjustment) => ({
      rule_id: `BN_VOLUME_CAP_${adjustment.muscle_group.toUpperCase()}`,
      category: "volume" as const,
      source: "validador" as const,
      target: adjustment.muscle_group,
      action: `Reduzir de ${adjustment.before} para ${adjustment.after} séries semanais (teto ${adjustment.cap}).`,
      reason: "O motor aplica o teto conservador da metodologia antes de validar e publicar o plano.",
      severity: "leve" as const,
    })),
  ];
  const usesIntensityMethod = weekly.weeks.some((week) =>
    week.methods.some((method) => /(rest-pause|drop-set|cluster|piramide|up-set)/i.test(method))
  );
  if (usesIntensityMethod) {
    explanations.push({
      rule_id: "BN_ADVANCED_METHODS_STABLE_ACCESSORIES",
      category: "progressao",
      source: "nivel",
      target: "acessorios_estaveis",
      action: "Rotacionar rest-pause, drop-set, bi-set e cluster-set conforme nível e semana.",
      reason: "A variação aumenta densidade e interesse sem expor exercícios pesados, dolorosos ou instáveis a fadiga desnecessária.",
      severity: "leve",
    });
  }

  const outputPreset = normalizedInput.deload
    ? {
        ...preset,
        target_weekly_sets: "50% do volume global de referência, com mínimo de 1 série por exercício",
        rir: DELOAD_RULES.rir,
        methods_by_block: { deload: [...DELOAD_RULES.methods] },
      }
    : preset;

  const program: TrainingProgram = {
    schemaVersion: "bn-prescription-v1",
    engineMeta: {
      version: "v1",
      generated_at: new Date().toISOString(),
      requested_days: split.requestedDays,
      structured_days: split.structuredDays,
      split: split.label,
      library_only: true,
      sequence_number: longitudinal.sequenceNumber,
      total_cycles: normalizedInput.programSequence?.total_cycles ? Number(normalizedInput.programSequence.total_cycles) : null,
      sequence_phase: longitudinal.phase,
      previous_plan_used: Boolean(normalizedInput.previousPlanContext),
    },
    cycle_name: `Plano BN Engine - ${clean(normalizedInput.studentName || "Aluno")} - Ciclo ${longitudinal.sequenceNumber}`,
    objective: clean(normalizedInput.objective || "base tecnica e consistencia"),
    duration_weeks: durationWeeks,
    block: String(resolveSequenceNumber(normalizedInput)),
    program_sequence: {
      sequence_number: longitudinal.sequenceNumber,
      total_cycles: normalizedInput.programSequence?.total_cycles ? Number(normalizedInput.programSequence.total_cycles) : null,
      phase: longitudinal.phase,
      start_date: normalizedInput.programSequence?.start_date || null,
      end_date: normalizedInput.programSequence?.end_date || null,
      previous_plan_used: Boolean(normalizedInput.previousPlanContext),
    },
    methodology_preset: {
      key: preset.key,
      label: preset.label,
      why_selected: "Selecionado por objetivo, nível, dias disponíveis, restrições e contexto de endurance.",
      rules: outputPreset,
    },
    generated_by: "bn_prescription_engine_v1",
    biomechanical_notes: restrictions.length
      ? restrictions.map((rule) => rule.recommendation).join(" ")
      : "Plano técnico conservador com mobilidade, ativação, controle motor e força antes de métodos avançados.",
    workouts: weekly.workouts,
    library_policy: {
      only_library_exercises: true,
      catalog_count: normalizedInput.catalog.length,
      gaps,
    },
    periodization_blocks: periodization,
    weekly_periodization: weekly.weeks,
    weekly_structure: `${workouts.length} sessões/semana (${split.label}) distribuídas em dias alternados quando possível.`,
    progression_protocol: `${progressionProtocol(normalizedInput)} Continuidade entre ciclos: ${longitudinal.phase}; o próximo bloco deve partir deste resultado e do feedback real do aluno.`,
    warnings: [
      ...(gaps.length ? ["Biblioteca incompleta para alguns padrões; nenhum exercício foi inventado."] : []),
      ...(deloadBudget.allocation?.constrainedByMinimum
        ? [`Deload limitado pelo mínimo de uma série por exercício; redução global possível: ${Math.round(deloadBudget.allocation.reductionRatio * 100)}%.`]
        : []),
    ],
    validator: {
      pre_save: {
        status: "ok",
        warnings: [],
        corrections: [],
        blockers: [],
        volume_review: [],
      },
    },
    validation: {
      status: "ok",
      warnings: [],
      corrections: [],
      blockers: [],
      volume_review: [],
    },
    explanations,
    bnito_after_generation: {
      intent: "notify_student_prescription_ready",
      question_to_teacher: "Quer que eu avise o aluno que a prescrição foi feita?",
      suggested_message: "Sua prescrição nova já está pronta no app. Comece leve, priorize técnica e me chame se quiser tirar dúvida de execução.",
    },
  };

  const corrections = [
    ...applyRestrictionRules(program, restrictions),
    ...applySimpleCorrections(program, normalizedInput),
  ];
  program.explanations.push(...correctionsToExplanations(corrections));
  program.validator.pre_save = validateTrainingProgram({
    program,
    input: normalizedInput,
    preset,
    catalog: normalizedInput.catalog,
    corrections,
  });
  program.validation = program.validator.pre_save;
  program.explanations.push(...program.validator.pre_save.blockers.map((blocker) => ({
    rule_id: blocker.code,
    category: "seguranca" as const,
    source: "validador" as const,
    target: blocker.source,
    action: blocker.recommendation,
    reason: blocker.message,
    severity: "severa" as const,
  })));
  program.explanations.push(...program.validator.pre_save.warnings
    .filter((warning) => /endurance|hard_volume_cap|no_optional_accessory|high_pain/.test(warning.code))
    .map((warning) => ({
      rule_id: warning.code,
      category: warning.source === "volume" ? "volume" as const : "seguranca" as const,
      source: "validador" as const,
      target: warning.source,
      action: warning.recommendation,
      reason: warning.message,
      severity: warning.severity === "warning" ? "moderada" as const : "leve" as const,
    })));
  program.library_policy.validation = {
    valid: program.validator.pre_save.blockers.length === 0,
  };
  return program;
}
