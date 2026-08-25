// Metodologias avançadas de treino + agrupamento visual.
// Persistidas em cada exercício do jsonb (workouts.exercises): group_id + method + method_seconds.
// - Métodos de AGRUPAMENTO (grouping): juntam vários exercícios num bloco (bi-set, tri-set…).
// - Técnicas de INTENSIDADE (single): tag num exercício só (drop-set, isometria, pico de contração…).
//   Algumas técnicas pedem um tempo de sustentação (needsSeconds) → method_seconds.

export type MethodId =
  | "biset" | "triset" | "superset" | "giantset" | "circuito"
  | "dropset" | "restpause" | "cluster"
  | "isometria" | "pico_contracao" | "pico_alongamento";

export interface WorkoutMethodMeta {
  label: string;
  short: string;
  grouping: boolean;
  minItems: number;
  needsSeconds?: boolean;
  holdHint?: string;
  hint: string;        // resumo de uma linha
  description: string; // explicação completa ("o que fazer") mostrada ao tocar no card
}

export const WORKOUT_METHODS: Record<MethodId, WorkoutMethodMeta> = {
  biset: {
    label: "Bi-set", short: "BI-SET", grouping: true, minItems: 2,
    hint: "2 exercícios em sequência, sem descanso entre eles.",
    description: "Faça os 2 exercícios um logo após o outro, SEM descanso entre eles. Só descanse depois de terminar a dupla. Aumenta a densidade do treino e o estímulo metabólico.",
  },
  triset: {
    label: "Tri-set", short: "TRI-SET", grouping: true, minItems: 3,
    hint: "3 exercícios em sequência, sem descanso entre eles.",
    description: "3 exercícios em sequência direta, sem pausa entre eles. Descanse só ao terminar os três. Ótimo para intensificar um mesmo grupo muscular.",
  },
  superset: {
    label: "Super-set", short: "SUPER-SET", grouping: true, minItems: 2,
    hint: "Pares antagonistas em sequência, sem descanso.",
    description: "Dois exercícios de músculos opostos (ex.: bíceps e tríceps, peito e costas) em sequência, sem descanso. Enquanto um trabalha, o outro recupera.",
  },
  giantset: {
    label: "Série gigante", short: "GIANT-SET", grouping: true, minItems: 4,
    hint: "4+ exercícios em sequência, sem descanso.",
    description: "4 ou mais exercícios em sequência, sem descanso entre eles. Alto volume e intensidade — descanse só ao fim da série gigante.",
  },
  circuito: {
    label: "Circuito", short: "CIRCUITO", grouping: true, minItems: 3,
    hint: "Estações em sequência; descanso só ao fim da volta.",
    description: "Passe por todas as estações em sequência, com pouco ou nenhum descanso entre elas. Descanse só ao terminar a volta completa; depois repita o circuito quantas voltas forem pedidas.",
  },
  dropset: {
    label: "Drop-set", short: "DROP-SET", grouping: false, minItems: 1,
    hint: "Ao falhar, reduza a carga e continue sem descanso.",
    description: "Leve a série até a falha (ou perto dela), reduza a carga na hora (cerca de 20-30%) e continue repetindo SEM descanso. Pode repetir a redução mais de uma vez.",
  },
  restpause: {
    label: "Rest-pause", short: "REST-PAUSE", grouping: false, minItems: 1,
    hint: "Falhou? 10-15s de pausa e mais reps com a mesma carga.",
    description: "Leve a série à falha, descanse apenas 10-15 segundos e faça mais algumas repetições com a MESMA carga. Repita esse mini-descanso 1 a 2 vezes.",
  },
  cluster: {
    label: "Cluster-set", short: "CLUSTER", grouping: false, minItems: 1,
    hint: "Mini-pausas (10-20s) dentro da mesma série.",
    description: "Divida a série em mini-blocos com pequenas pausas (10-20s) entre eles, mantendo a mesma carga. Permite acumular mais repetições de qualidade com carga alta.",
  },
  isometria: {
    label: "Isometria", short: "ISOMETRIA", grouping: false, minItems: 1,
    needsSeconds: true, holdHint: "parado na posição, mantendo a contração",
    hint: "Segure parado, sem movimento, pelo tempo indicado.",
    description: "Segure a posição PARADO, sem movimento, contraindo o músculo pelo tempo indicado. Mantenha a tensão e a respiração controlada durante toda a sustentação.",
  },
  pico_contracao: {
    label: "Pico de contração", short: "PICO CONTR.", grouping: false, minItems: 1,
    needsSeconds: true, holdHint: "no ponto de maior contração (músculo encurtado), apertando bem",
    hint: "Segure X segundos no ponto de maior contração.",
    description: "Ao chegar no ponto de MAIOR contração do músculo (encurtamento máximo), segure parado pelo tempo indicado, apertando bem o músculo, antes de voltar. Melhora a conexão mente-músculo.",
  },
  pico_alongamento: {
    label: "Pico de alongamento", short: "PICO ALONG.", grouping: false, minItems: 1,
    needsSeconds: true, holdHint: "no ponto de maior alongamento (fase esticada), mantendo a tensão",
    hint: "Segure X segundos no ponto de maior alongamento.",
    description: "No ponto de MAIOR alongamento do músculo (fase esticada/excêntrica), segure parado pelo tempo indicado mantendo a tensão, antes de voltar a subir. Potencializa o estímulo de hipertrofia no alongamento.",
  },
};

export const GROUPING_METHODS: MethodId[] = ["biset", "triset", "superset", "giantset", "circuito"];
export const SINGLE_METHODS: MethodId[] = ["dropset", "restpause", "cluster", "isometria", "pico_contracao", "pico_alongamento"];

export function isGroupingMethod(m?: string | null): boolean {
  return !!m && GROUPING_METHODS.includes(m as MethodId);
}

export function methodNeedsSeconds(m?: string | null): boolean {
  return !!m && !!WORKOUT_METHODS[m as MethodId]?.needsSeconds;
}

/** Rótulo curto pronto p/ badge, incl. o tempo de sustentação quando aplicável. Ex.: "ISOMETRIA 30s". */
export function methodShortLabel(m?: string | null, seconds?: number | null): string | null {
  if (!m) return null;
  const meta = WORKOUT_METHODS[m as MethodId];
  if (!meta) return null;
  return meta.needsSeconds && seconds ? `${meta.short} ${seconds}s` : meta.short;
}

export interface MethodAware {
  group_id?: string | null;
  method?: string | null;
  method_seconds?: number | null;
}

export interface ExGroup<T> {
  key: string;
  method: string | null;
  grouping: boolean;
  items: Array<{ ex: T; idx: number }>;
}

/** Agrupa exercícios consecutivos que compartilham group_id (método de agrupamento). */
export function groupWorkoutExercises<T extends MethodAware>(exs: T[]): ExGroup<T>[] {
  const out: ExGroup<T>[] = [];
  (exs || []).forEach((ex, idx) => {
    const gid = ex.group_id || null;
    const m = (ex.method || null) as MethodId | null;
    const grouping = isGroupingMethod(m) && !!gid;
    const last = out[out.length - 1];
    const lastGid = last && last.items.length ? (last.items[0].ex.group_id || null) : null;
    if (grouping && last && last.grouping && last.method === m && lastGid === gid) {
      last.items.push({ ex, idx });
    } else {
      out.push({ key: `g${idx}`, method: m, grouping, items: [{ ex, idx }] });
    }
  });
  return out;
}
