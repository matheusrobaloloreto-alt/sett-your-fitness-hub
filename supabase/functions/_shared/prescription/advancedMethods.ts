// advancedMethods.ts — Sistemas de treinamento avançados aplicados AO LONGO DA PERIODIZAÇÃO.
// Espelha EXATAMENTE os ids de src/lib/workoutMethods.ts, então o app já renderiza os blocos/badges
// (MethodBadge + groupWorkoutExercises) sem mudança no front. O fallback determinístico de força
// chama planAdvancedMethods() por semana e os exercícios saem com method/group_id/method_seconds.
//
// DOUTRINA (não usar sempre — só quando faz sentido):
//   - iniciante                         → NUNCA método avançado (técnica + progressão simples).
//   - microciclo regenerativo (deload)  → NUNCA (semana de recuperação).
//   - mesociclo BASE                    → NUNCA (adaptação/técnica).
//   - dor / exercício instável          → NUNCA naquele exercício.
//   - acumulação (ordinário)            → leve: 1 técnica de intensidade (rest-pause/drop-set) na
//                                         última série de 1 isolador estável.
//   - intensificação / choque           → pode agrupar (bi-set; tri-set/giant só avançado) e/ou
//                                         drop-set/cluster; aplica a no MÁXIMO 1–2 exercícios da sessão.
//   - troca de estímulo a cada 2 semanas → o método rotaciona por bloco (semanas 1-2 / 3-4 / 5-6),
//                                         pra variar o estímulo dentro da fase.
// Os compostos pesados (agachamento/terra/supino) ficam RETOS; os métodos vão nos acessórios/isoladores.

export type MethodId =
  | "biset" | "triset" | "superset" | "giantset" | "circuito"
  | "dropset" | "restpause" | "cluster"
  | "isometria" | "pico_contracao" | "pico_alongamento";

export const GROUPING_METHODS: MethodId[] = ["biset", "triset", "superset", "giantset", "circuito"];
export const SINGLE_METHODS: MethodId[] = ["dropset", "restpause", "cluster", "isometria", "pico_contracao", "pico_alongamento"];

export interface MethodAwareExercise {
  exercise_id?: string | null;
  exercise_name?: string | null;
  muscle_group?: string | null;
  phase?: string | null;
  is_isolation?: boolean;      // isolador (preferível p/ métodos) vs composto pesado
  painful?: boolean;           // dor/restrição → nunca aplicar
  // saída:
  method?: MethodId | null;
  group_id?: string | null;
  method_seconds?: number | null;
}

export interface AdvancedMethodCtx {
  // O motor JÁ tem estes hoje (mapear presetKey/stimulus → mesocycle; fitnessLevel → level):
  mesocycle: "base" | "acumulacao" | "intensificacao" | "polimento";
  level: "iniciante" | "intermediario" | "avancado";
  // OPCIONAIS para compatibilidade com chamadas antigas. O BN Engine passa todos estes campos.
  microcycle?: "ordinario" | "choque" | "regenerativo"; // default "ordinario"
  week?: number;                                         // 1-based; default 1 (bloco 0)
  hasPain?: boolean;                                     // dor relevante → conservador (nenhum método)
  sessionKey?: string;                                   // ex.: workout_id/dia — evita colisão de group_id entre sessões
  groupIdFor?: (i: number) => string;                    // override do gerador de id (sem random)
}

// Heurística simples de isolador quando o motor não marca is_isolation.
const COMPOUND_RE = /(agachamento|terra|levantamento|supino|desenvolvimento|remada|barra fixa|leg press|stiff|avanço|afundo|clean|snatch|push press|thruster)/i;
const HEAVY_COMPOUND_RE = /(agachamento|terra|levantamento|leg press|hack|stiff|clean|snatch|push press|thruster)/i;
function isIsolation(ex: MethodAwareExercise): boolean {
  if (typeof ex.is_isolation === "boolean") return ex.is_isolation;
  return !COMPOUND_RE.test(ex.exercise_name || "");
}

function isStableSingleCandidate(ex: MethodAwareExercise): boolean {
  const phase = String(ex.phase || "").toLowerCase();
  if (phase) return phase === "forca_especifica" || phase === "acessorio" || phase === "isolado";
  return isIsolation(ex);
}

function isSafeGroupingCandidate(ex: MethodAwareExercise): boolean {
  const phase = String(ex.phase || "").toLowerCase();
  if (/mobilidade|ativacao_core/.test(phase)) return false;
  if (HEAVY_COMPOUND_RE.test(ex.exercise_name || "")) return false;
  return isStableSingleCandidate(ex) || phase === "controle_motor" || phase === "forca_global";
}

function lastConsecutivePair(indexes: number[]): number[] {
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    if (indexes[index] === indexes[index - 1] + 1) return [indexes[index - 1], indexes[index]];
  }
  return [];
}

/**
 * Aplica sistemas avançados aos exercícios da sessão conforme a fase/microciclo/nível.
 * Não muta a entrada — retorna uma nova lista. Determinístico (sem random).
 */
export function planAdvancedMethods<T extends MethodAwareExercise>(exercises: T[], ctx: AdvancedMethodCtx): T[] {
  const out = (exercises || []).map((e) => ({ ...e }));
  const micro = ctx.microcycle ?? "ordinario";   // motor ainda não rastreia microciclo → ordinário
  const week = ctx.week ?? 1;                     // nem semana → bloco 0 (sem rotação) até passarem
  // group_id único DENTRO da lista da sessão (o app só agrupa consecutivos numa lista).
  // sessionKey (ex.: workout_id) evita colisão se o motor combinar sessões da mesma semana.
  const gid = ctx.groupIdFor || ((i: number) => `m${ctx.sessionKey ? ctx.sessionKey + "_" : ""}${week}_${i}`);

  // Bloqueios duros: nada de método avançado.
  if (ctx.level === "iniciante" || micro === "regenerativo" || ctx.mesocycle === "base" || ctx.hasPain) {
    return out;
  }

  // Técnicas de intensidade ficam em acessórios estáveis. Agrupamentos também aceitam
  // controle motor/compostos leves, mas nunca os padrões axiais pesados.
  const singleIdxs = out
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.painful && isStableSingleCandidate(e))
    .map(({ i }) => i);
  const groupingIdxs = out
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.painful && isSafeGroupingCandidate(e))
    .map(({ i }) => i);
  if (singleIdxs.length === 0 && groupingIdxs.length < 2) return out;

  const adv = ctx.level === "avancado";
  const choque = micro === "choque" || ctx.mesocycle === "intensificacao";

  if (choque) {
    // Semana ímpar do bloco final: bi-set seguro. Semana par: técnica de intensidade
    // em um único acessório. Assim a sessão nunca acumula técnicas demais.
    if (week % 2 === 1) {
      const pair = lastConsecutivePair(groupingIdxs);
      if (pair.length === 2) {
        const group = gid(pair[0]);
        for (const index of pair) {
          out[index].method = "biset";
          out[index].group_id = group;
        }
        return out;
      }
    }
    if (singleIdxs.length) {
      const target = singleIdxs[singleIdxs.length - 1];
      out[target].method = adv && week % 2 === 0 ? "cluster" : week % 2 === 0 ? "dropset" : "restpause";
      out[target].method_seconds = out[target].method === "cluster" ? 15 : out[target].method === "restpause" ? 20 : null;
    }
  } else {
    // Acumulação: uma única técnica simples na última série de um acessório.
    if (singleIdxs.length) {
      const target = singleIdxs[singleIdxs.length - 1];
      out[target].method = week % 2 === 1 ? "restpause" : "dropset";
      out[target].method_seconds = out[target].method === "restpause" ? 20 : null;
    }
  }

  return out;
}
