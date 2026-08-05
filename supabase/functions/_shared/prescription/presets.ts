import type { MethodologyPreset, PrescriptionInput } from "./types.ts";
import { OBJECTIVE_MODIFIERS, SPLIT_TABLE } from "./methodology.ts";
import { clinicalRiskText } from "./clinicalContext.ts";

export const METHODOLOGY_PRESETS: Record<string, MethodologyPreset> = {
  hipertrofia_iniciante: {
    key: "hipertrofia_iniciante",
    label: "Hipertrofia iniciante",
    target_weekly_sets: "8-12 series efetivas por grupo prioritario (teto ativo v1 iniciante = 12 series/semana por grupo grande)",
    reps: "8-12 nos multiarticulares, 10-15 nos acessorios",
    rir: "2-3",
    weeklySetRange: { min: 8, max: 12, beginnerMax: 16 },
    methods_by_block: {
      "1-2": ["base tecnica", "tempo controlado"],
      "3-4": ["aumento discreto de series ou carga", "progressao dupla"],
      "5-6": ["up-set leve apenas em exercicio estavel"],
    },
  },
  hipertrofia_intermediario: {
    key: "hipertrofia_intermediario",
    label: "Hipertrofia intermediario",
    target_weekly_sets: "10-16 series efetivas por grupo prioritario (teto ativo v1 = 16; faixa 18-20 fica fora da v1)",
    reps: "6-12 nos multiarticulares, 10-15 nos acessorios",
    rir: "1-3",
    weeklySetRange: { min: 10, max: 16 },
    methods_by_block: {
      "1-2": ["volume base", "progressao dupla"],
      "3-4": ["piramide ou up-set em padroes estaveis"],
      "5-6": ["drop-set seletivo em isoladores seguros"],
    },
  },
  emagrecimento: {
    key: "emagrecimento",
    label: "Emagrecimento",
    target_weekly_sets: "8-14 series por grupo, mantendo tecnica e recuperacao para aderencia",
    reps: "8-15 com descansos moderados e densidade controlada",
    rir: "2-4",
    weeklySetRange: { min: 8, max: 14, beginnerMax: 14 },
    methods_by_block: {
      "1-2": ["base tecnica", "densidade baixa/moderada"],
      "3-4": ["reduzir descansos em acessorios", "circuito tecnico sem falha"],
      "5-6": ["metodo metabolico seletivo sem comprometer dor/tecnica"],
    },
  },
  recomposicao: {
    key: "recomposicao",
    label: "Recomposicao corporal",
    target_weekly_sets: "10-16 series por grupo prioritario com controle de fadiga",
    reps: "6-12 forca/hipertrofia + 12-15 acessorios",
    rir: "2-3",
    weeklySetRange: { min: 10, max: 16, beginnerMax: 14 },
    methods_by_block: {
      "1-2": ["base tecnica e volume moderado"],
      "3-4": ["progressao de carga ou reps"],
      "5-6": ["piramide/up-set em exercicios estaveis"],
    },
  },
  forca: {
    key: "forca",
    label: "Forca",
    target_weekly_sets: "6-12 series efetivas nos padroes principais; acessorios suficientes para suporte tecnico",
    reps: "3-6 em forca global, 8-12 em suporte",
    rir: "1-3, nunca falha sistematica",
    weeklySetRange: { min: 6, max: 12, beginnerMax: 10 },
    methods_by_block: {
      "1-2": ["tecnica e exposicao submaxima"],
      "3-4": ["intensificacao controlada"],
      "5-6": ["cluster-set apenas se nivel e avaliacao permitirem"],
    },
  },
  retorno_lesao: {
    key: "retorno_lesao",
    label: "Retorno de lesao",
    target_weekly_sets: "6-10 series por grupo afetado, progressao por tolerancia e dor <= 3",
    reps: "10-15 com amplitude livre de dor; isometria/tempo quando seguro",
    rir: "3-4",
    weeklySetRange: { min: 6, max: 10, beginnerMax: 10 },
    methods_by_block: {
      "1-2": ["mobilidade", "ativacao", "controle motor"],
      "3-4": ["aumentar amplitude/carga apenas sem dor"],
      "5-6": ["integrar padrao global conservador"],
    },
  },
  corrida_musculacao: {
    key: "corrida_musculacao",
    label: "Corrida + musculacao",
    target_weekly_sets: "6-12 series MMII, 8-14 MMSS/core, reduzindo 20% vs nao corredor",
    reps: "4-8 forca global, 8-12 acessorios, foco unilateral/excentrico",
    rir: "2-3",
    weeklySetRange: { min: 6, max: 12, beginnerMax: 12 },
    methods_by_block: {
      "1-2": ["base tecnica anti-interferencia"],
      "3-4": ["progressao discreta com deload sincronizado"],
      "5-6": ["potencia apenas se liberado e fora de semana critica da corrida"],
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
