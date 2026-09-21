import type { MethodologyPreset, PrescriptionInput } from "./types.ts";
import { OBJECTIVE_MODIFIERS, SPLIT_TABLE } from "./methodology.ts";
import { clinicalRiskText } from "./clinicalContext.ts";

export const METHODOLOGY_PRESETS: Record<string, MethodologyPreset> = {
  hipertrofia_iniciante: {
    key: "hipertrofia_iniciante",
    label: "Hipertrofia iniciante",
    target_weekly_sets: "8-21 series efetivas por grupo prioritario, respeitando progressao semanal e recuperacao",
    reps: "8-12 nos multiarticulares, 10-15 nos acessorios",
    rir: "2-3",
    weeklySetRange: { min: 8, max: 21, beginnerMax: 21 },
    methods_by_block: {
      "1": ["base tecnica", "isometria de baixa fadiga"],
      "2": ["tempo controlado", "pico de contracao"],
      "3": ["progressao dupla", "bi-set controlado"],
      "4": ["aumento discreto de series ou carga", "metodo seletivo"],
      "5": ["agrupamento e intensidade controlada"],
      "6": ["variacao final e registro para renovacao"],
    },
  },
  hipertrofia_intermediario: {
    key: "hipertrofia_intermediario",
    label: "Hipertrofia intermediario",
    target_weekly_sets: "10-21 series efetivas por grupo prioritario com progressao semanal",
    reps: "6-12 nos multiarticulares, 10-15 nos acessorios",
    rir: "2-3",
    weeklySetRange: { min: 10, max: 21 },
    methods_by_block: {
      "1": ["volume base", "isometria tecnica"],
      "2": ["progressao dupla", "pico de contracao"],
      "3": ["pico de contracao, pico de alongamento ou isometria"],
      "4": ["bi-set, drop-set ou rest-pause com volume controlado"],
      "5": ["tri-set, serie gigante, super-set ou circuito conforme a sessao"],
      "6": ["variacao de intensidade e consolidacao"],
    },
  },
  emagrecimento: {
    key: "emagrecimento",
    label: "Emagrecimento",
    target_weekly_sets: "8-21 series por grupo, mantendo tecnica e recuperacao para aderencia",
    reps: "8-15 com descansos moderados e densidade controlada",
    rir: "2-4",
    weeklySetRange: { min: 8, max: 21, beginnerMax: 21 },
    methods_by_block: {
      "1": ["base tecnica", "densidade baixa"],
      "2": ["densidade moderada", "pico de contracao"],
      "3": ["reduzir descansos em acessorios", "bi-set controlado"],
      "4": ["circuito tecnico com volume controlado"],
      "5": ["metodo metabolico seletivo"],
      "6": ["consolidacao sem comprometer dor ou tecnica"],
    },
  },
  recomposicao: {
    key: "recomposicao",
    label: "Recomposicao corporal",
    target_weekly_sets: "10-21 series por grupo prioritario com controle de fadiga",
    reps: "6-12 forca/hipertrofia + 12-15 acessorios",
    rir: "2-3",
    weeklySetRange: { min: 10, max: 21, beginnerMax: 21 },
    methods_by_block: {
      "1": ["base tecnica a 80%"],
      "2": ["volume moderado a 90%"],
      "3": ["progressao de carga ou reps"],
      "4": ["agrupamento seletivo"],
      "5": ["bi-set, super-set, drop-set ou rest-pause"],
      "6": ["consolidacao e registro para renovacao"],
    },
  },
  forca: {
    key: "forca",
    label: "Forca",
    target_weekly_sets: "6-21 series efetivas nos padroes principais; acessorios suficientes para suporte tecnico",
    reps: "3-6 em forca global, 8-12 em suporte",
    rir: "2-3, nunca falha sistematica",
    weeklySetRange: { min: 6, max: 21, beginnerMax: 21 },
    methods_by_block: {
      "1": ["tecnica e exposicao submaxima"],
      "2": ["consolidacao da tecnica"],
      "3": ["progressao de carga"],
      "4": ["intensificacao controlada"],
      "5": ["agrupamento de baixa fadiga"],
      "6": ["cluster-set em padrao estavel ou alternativa tecnica"],
    },
  },
  retorno_lesao: {
    key: "retorno_lesao",
    label: "Retorno de lesao",
    target_weekly_sets: "6-21 series por grupo, com 50% do volume seguro quando houver dor severa",
    reps: "10-15 com amplitude livre de dor; isometria/tempo quando seguro",
    rir: "3-4",
    weeklySetRange: { min: 6, max: 21, beginnerMax: 21 },
    methods_by_block: {
      "1": ["mobilidade", "isometria tecnica"],
      "2": ["ativacao e controle motor"],
      "3": ["aumentar amplitude apenas sem dor"],
      "4": ["aumentar carga apenas sem dor"],
      "5": ["integrar padrao global conservador"],
      "6": ["consolidar tolerancia e registrar resposta"],
    },
  },
  corrida_musculacao: {
    key: "corrida_musculacao",
    label: "Corrida + musculacao",
    target_weekly_sets: "6-21 series por grupo, reduzindo 20% do volume de MMII quando endurance >= 3x/semana",
    reps: "4-8 forca global, 8-12 acessorios, foco unilateral/excentrico",
    rir: "2-3",
    weeklySetRange: { min: 6, max: 21, beginnerMax: 21 },
    methods_by_block: {
      "1": ["base tecnica anti-interferencia"],
      "2": ["controle de tensao"],
      "3": ["progressao discreta de volume"],
      "4": ["progressao sincronizada com a corrida"],
      "5": ["potencia apenas se elegivel"],
      "6": ["consolidacao fora de semana critica da corrida"],
    },
  },
};

export function normalizeText(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function selectMethodologyPreset(input: PrescriptionInput) {
  const objective = normalizeText(input.objective);
  const level = normalizeText(input.fitnessLevel);
  const risk = clinicalRiskText(input);
  const days = Number(input.daysPerWeek) || 3;
  const hasPain = /(dor|lesao|lesoes|joelho|lombar|ombro|eva\s*[4-9]|valgo|butt)/.test(risk);

  if (input.isEnduranceAthlete || input.runningDaysContext || days <= 2 && /corrida|endurance|triathlon/.test(objective)) return METHODOLOGY_PRESETS.corrida_musculacao;
  if (hasPain || /retorno|reabilit|pos[- ]?operatorio/.test(objective)) return METHODOLOGY_PRESETS.retorno_lesao;
  if (objective.includes("forca")) return METHODOLOGY_PRESETS.forca;
  if (objective.includes("emagrec")) return METHODOLOGY_PRESETS.emagrecimento;
  if (objective.includes("recomp")) return METHODOLOGY_PRESETS.recomposicao;
  if (objective.includes("hipertrof") && (level.includes("inter") || level.includes("avanc"))) return METHODOLOGY_PRESETS.hipertrofia_intermediario;
  return METHODOLOGY_PRESETS.hipertrofia_iniciante;
}

export function objectiveKey(input: PrescriptionInput) {
  const objective = normalizeText(input.objective);
  const risk = clinicalRiskText(input);
  if (/(dor|lesao|retorno|reabilit|joelho|lombar|ombro|valgo|butt)/.test(`${objective} ${risk}`)) return "retorno_gradual" as const;
  if (objective.includes("forca")) return "forca_geral" as const;
  if (objective.includes("emagrec")) return "emagrecimento" as const;
  if (objective.includes("saude")) return "saude_geral" as const;
  return "hipertrofia" as const;
}

export function objectiveModifier(input: PrescriptionInput) {
  return OBJECTIVE_MODIFIERS[objectiveKey(input)];
}

export function normalizeLevel(level: unknown): "iniciante" | "intermediario" | "avancado" {
  const text = normalizeText(level);
  if (text.includes("avanc")) return "avancado";
  if (text.includes("inter")) return "intermediario";
  return "iniciante";
}

export function resolveSplit(input: Pick<PrescriptionInput, "daysPerWeek" | "fitnessLevel" | "objective" | "restrictions" | "assessmentContext">) {
  const requested = Math.min(6, Math.max(2, Number(input.daysPerWeek) || 3)) as 2 | 3 | 4 | 5 | 6;
  const level = normalizeLevel(input.fitnessLevel);
  const split = SPLIT_TABLE[requested][level];
  return {
    requestedDays: requested,
    structuredDays: split.maxStructuredDays,
    label: split.label,
    days: [...split.days],
    downgraded: Boolean("downgrade" in split && split.downgrade),
  };
}
