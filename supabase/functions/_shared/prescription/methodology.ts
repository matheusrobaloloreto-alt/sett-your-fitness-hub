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
    iniciante: { label: "3-4 dias estruturados + extras opcionais leves", days: ["Upper A", "Lower A", "Full Body", "Mobilidade"], maxStructuredDays: 4, downgrade: true },
    intermediario: { label: "PPL x2", days: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"], maxStructuredDays: 6 },
    avancado: { label: "PPL x2", days: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"], maxStructuredDays: 6 },
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
    notes: ["full-body 2-3x", "volume MEV", "RIR 3-4", "sem método avançado", "rampa de 6 semanas"],
  },
} as const;

export const VOLUME_RULES = {
  largeGroups: {
    iniciante: { mev: 8, mavMin: 10, mavMax: 12, mrv: 12 },
    intermediario: { mev: 10, mavMin: 14, mavMax: 16, mrv: 16 },
    avancado: { mev: 12, mavMin: 16, mavMax: 16, mrv: 16 },
  },
  smallGroupFactor: 0.6,
  hardCapWithoutJustification: 16,
  hardCapsByLevel: {
    iniciante: 12,
    intermediario: 16,
    avancado: 16,
  },
  painVolumeMultiplier: {
    leve: 1,
    moderada: 0.67,
    severa: 0,
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
    action: "remover padrão problemático, adicionar bloco corretivo e alertar professor",
    volumeMultiplier: 0,
    alertTeacher: true,
  },
} as const;

export const PROGRESSION_BLOCKS = {
  base: {
    weeks: "1-2",
    stimulus: "base técnica + MEV",
    rir: "3-4",
    methods: ["dupla progressão dentro da faixa", "sem pliometria", "sem método avançado"],
  },
  accumulation: {
    weeks: "3-4",
    stimulus: "acúmulo até MAV",
    rir: "2-3",
    methods: ["adicionar reps antes de carga", "+1 série apenas em exercício estável e sem dor"],
  },
  intensification: {
    weeks: "5-6",
    stimulus: "consolidação/intensificação controlada",
    rir: "2",
    methods: ["método avançado só para intermediário/avançado", "apenas em exercício estável e sem dor"],
  },
} as const;

export const DELOAD_RULES = {
  triggers: ["fim de bloco 4-6 semanas", "fadiga acumulada", "queda de performance", "dor subindo", "antes de reavaliação"],
  volumeReduction: 0.5,
  rir: "4",
  methods: ["sem falha", "sem método avançado", "manter padrões técnicos"],
} as const;

export const EXPLANATION_CATEGORIES = ["seguranca", "priorizacao", "nivel", "volume", "substituicao", "progressao", "deload"] as const;

export const LARGE_GROUPS = ["quadriceps", "posterior", "gluteos", "costas", "peitoral"] as const;
export const SMALL_GROUPS = ["core", "ombros", "biceps", "triceps", "panturrilhas", "mobilidade"] as const;
