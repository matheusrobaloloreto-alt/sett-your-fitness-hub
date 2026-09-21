export const MOVEMENT_PATTERNS = {
  joelho_dominante: ["agachamento", "leg press", "hack", "step", "afundo", "extensora"],
  quadril_dominante: ["terra", "rdl", "romeno", "hip thrust", "ponte", "posterior", "flexora"],
  empurrar_horizontal: ["supino", "chest press", "flexao", "peitoral"],
  empurrar_vertical: ["desenvolvimento", "overhead", "landmine", "ombro"],
  puxar_horizontal: ["remada", "row"],
  puxar_vertical: ["puxada", "barra", "pulldown"],
  core: ["prancha", "dead bug", "pallof", "bird dog", "core"],
  unilateral: ["unilateral", "step", "afundo", "lunge"],
  isolado_acessorio: ["abducao", "face pull", "rotacao", "panturrilha", "extensora", "flexora"],
} as const;

export type MovementPattern = keyof typeof MOVEMENT_PATTERNS;
export type ExplanationCategory = "seguranca" | "priorizacao" | "nivel" | "volume" | "substituicao" | "progressao" | "deload";
export type ExplanationSource = "anamnese" | "avaliacao_funcional" | "biblioteca" | "nivel" | "objetivo" | "feedback_aluno" | "validador";

export const SPLIT_TABLE = {
  2: {
    iniciante: { label: "Full Body A/B", days: ["Full Body A", "Full Body B"], maxStructuredDays: 2 },
    intermediario: { label: "Full Body A/B", days: ["Full Body A", "Full Body B"], maxStructuredDays: 2 },
    avancado: { label: "Upper/Lower", days: ["Upper", "Lower"], maxStructuredDays: 2 },
  },
  3: {
    iniciante: { label: "Full Body A/B/C", days: ["Full Body A", "Full Body B", "Full Body C"], maxStructuredDays: 3 },
    intermediario: { label: "Upper/Lower/Full", days: ["Upper", "Lower", "Full Body"], maxStructuredDays: 3 },
    avancado: { label: "Push/Pull/Legs", days: ["Push", "Pull", "Legs"], maxStructuredDays: 3 },
  },
  4: {
    iniciante: { label: "Upper/Lower x2", days: ["Upper A", "Lower A", "Upper B", "Lower B"], maxStructuredDays: 4 },
    intermediario: { label: "Upper/Lower x2", days: ["Upper A", "Lower A", "Upper B", "Lower B"], maxStructuredDays: 4 },
    avancado: { label: "Upper/Lower x2 ou ULPP", days: ["Upper A", "Lower A", "Push/Pull", "Lower B"], maxStructuredDays: 4 },
  },
  5: {
    iniciante: { label: "Upper/Lower + Full com extras leves", days: ["Upper A", "Lower A", "Full Body", "Extra tecnico", "Mobilidade"], maxStructuredDays: 4 },
    intermediario: { label: "PPL + Upper/Lower", days: ["Push", "Pull", "Legs", "Upper", "Lower"], maxStructuredDays: 5 },
    avancado: { label: "PPL + Upper/Lower", days: ["Push", "Pull", "Legs", "Upper", "Lower"], maxStructuredDays: 5 },
  },
  6: {
    iniciante: { label: "Upper/Lower/Full + tecnicos + Extra", days: ["Upper A", "Lower A", "Full Body", "Upper tecnico", "Lower tecnico", "Extra mobilidade + core"], maxStructuredDays: 6 },
    intermediario: { label: "PPL + Upper/Lower + Extra", days: ["Push", "Pull", "Legs", "Upper", "Lower", "Extra mobilidade + core"], maxStructuredDays: 6 },
    avancado: { label: "PPL + Upper/Lower + Extra", days: ["Push", "Pull", "Legs", "Upper", "Lower", "Extra mobilidade + core"], maxStructuredDays: 6 },
  },
} as const;

export const OBJECTIVE_MODIFIERS = {
  forca_geral: {
    label: "Força geral",
    volumeMultiplier: 0.7,
    mainReps: "3-6",
    accessoryReps: "8-12",
    restSeconds: 150,
    notes: ["menos exercícios por sessão", "foco em compostos", "descanso 2-3 min"],
  },
  hipertrofia: {
    label: "Hipertrofia",
    volumeMultiplier: 1,
    mainReps: "6-12",
    accessoryReps: "10-15",
    restSeconds: 90,
    notes: ["6-15 reps", "descanso 60-120s"],
  },
  emagrecimento: {
    label: "Emagrecimento",
    volumeMultiplier: 0.9,
    mainReps: "8-12",
    accessoryReps: "10-15",
    restSeconds: 75,
    notes: ["preservar estímulo de força", "densidade/pareamento antagonista", "full-body se <=3 dias"],
  },
  saude_geral: {
    label: "Saúde geral",
    volumeMultiplier: 0.7,
    mainReps: "8-12",
    accessoryReps: "10-15",
    restSeconds: 90,
    notes: ["full-body/upper-lower", "8-15 reps", "articular-friendly"],
  },
  retorno_gradual: {
    label: "Retorno gradual",
    volumeMultiplier: 0.5,
    mainReps: "10-15",
    accessoryReps: "12-15",
    restSeconds: 75,
    notes: ["full-body 2-3x", "volume MEV", "RIR 3-4", "métodos técnicos de baixa fadiga", "rampa de 6 semanas"],
  },
} as const;

export const VOLUME_RULES = {
  largeGroups: {
    iniciante: { mev: 8, mavMin: 12, mavMax: 18, mrv: 21 },
    intermediario: { mev: 10, mavMin: 14, mavMax: 18, mrv: 21 },
    avancado: { mev: 12, mavMin: 16, mavMax: 21, mrv: 21 },
  },
  smallGroupFactor: 0.6,
  hardCapWithoutJustification: 21,
  hardCapsByLevel: {
    iniciante: 21,
    intermediario: 21,
    avancado: 21,
  },
  painVolumeMultiplier: {
    leve: 1,
    moderada: 0.67,
    severa: 0.5,
  },
} as const;

export const PAIN_AND_SAFETY_RULES = {
  leve: {
    action: "manter padrão com cue técnico e ROM confortável",
    volumeMultiplier: 1,
    alertTeacher: false,
  },
  moderada: {
    action: "substituir por variação amigável e reduzir cerca de 1/3 do volume",
    volumeMultiplier: 0.67,
    alertTeacher: false,
  },
  severa: {
    action: "remover o padrão problemático, manter 50% do volume seguro e alertar o professor",
    volumeMultiplier: 0.5,
    alertTeacher: true,
  },
} as const;

export const PROGRESSION_BLOCKS = {
  week1: { weeks: "1", stimulus: "base técnica a 80%", rir: "3-4", methods: ["isometria técnica", "W/Normal/F sinalizadas"] },
  week2: { weeks: "2", stimulus: "base técnica a 90%", rir: "3-4", methods: ["pico de contração", "progressão de repetições"] },
  week3: { weeks: "3", stimulus: "acúmulo a 100%", rir: "2-3", methods: ["tensão controlada", "agrupamento"] },
  week4: { weeks: "4", stimulus: "acúmulo a 105%", rir: "2-3", methods: ["agrupamento", "intensidade seletiva"] },
  week5: { weeks: "5", stimulus: "intensificação a 105%", rir: "2", methods: ["métodos variados", "falha apenas sinalizada"] },
  week6: { weeks: "6", stimulus: "consolidação a 100%", rir: "2", methods: ["variação final", "registro para renovação"] },
} as const;

export const DELOAD_RULES = {
  triggers: ["fim de bloco 4-6 semanas", "fadiga acumulada", "queda de performance", "dor subindo", "antes de reavaliação"],
  volumeReduction: 0.5,
  rir: "4",
  methods: ["isometria técnica", "pico de contração controlado", "manter séries W/Normal/F sinalizadas"],
} as const;

export const EXPLANATION_CATEGORIES = ["seguranca", "priorizacao", "nivel", "volume", "substituicao", "progressao", "deload"] as const;

export const LARGE_GROUPS = ["quadriceps", "posterior_de_coxa", "gluteos", "dorsal", "peitoral"] as const;
export const SMALL_GROUPS = ["abdomen", "deltoide_anterior", "deltoide_lateral", "deltoide_posterior", "biceps", "triceps", "panturrilha", "antebraco", "trapezio", "adutores"] as const;
