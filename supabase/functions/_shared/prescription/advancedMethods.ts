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
export const ALL_METHOD_IDS: MethodId[] = [...GROUPING_METHODS, ...SINGLE_METHODS];

export interface MethodAwareExercise {
  exercise_id?: string | null;
  exercise_name?: string | null;
  muscle_group?: string | null;
  phase?: string | null;
  equipment?: string | null;
  is_isolation?: boolean;      // isolador (preferível p/ métodos) vs composto pesado
  painful?: boolean;           // dor/restrição → nunca aplicar
  // saída:
  method?: MethodId | null;
  group_id?: string | null;
  method_seconds?: number | null;
  method_reason?: string | null;
}

export interface AdvancedMethodCtx {
  // O motor JÁ tem estes hoje (mapear presetKey/stimulus → mesocycle; fitnessLevel → level):
  mesocycle: "base" | "acumulacao" | "intensificacao" | "polimento";
  level: "iniciante" | "intermediario" | "avancado";
  // OPCIONAIS para compatibilidade com chamadas antigas. O BN Engine passa todos estes campos.
  microcycle?: "ordinario" | "choque" | "regenerativo"; // default "ordinario"
  week?: number;                                         // 1-based; default 1 (bloco 0)
  hasPain?: boolean;                                     // dor relevante → conservador (nenhum método)
  hasRedFlags?: boolean;
  fatigueHigh?: boolean;
  isEnduranceAthlete?: boolean;
  objective?: string | null;
  sequenceNumber?: number | string | null;
  sessionIndex?: number | string | null;
  equipment?: string | null;
  sessionKey?: string;                                   // ex.: workout_id/dia — evita colisão de group_id entre sessões
  groupIdFor?: (i: number) => string;                    // override do gerador de id (sem random)
}

// Heurística simples de isolador quando o motor não marca is_isolation.
const COMPOUND_RE = /(agachamento|terra|levantamento|supino|desenvolvimento|remada|barra fixa|leg press|stiff|avanço|afundo|clean|snatch|push press|thruster)/i;
const HIGH_RISK_RE = /(agachamento|terra|levantamento|good morning|clean|snatch|push press|thruster|stiff pesado|livre profundo)/i;
const UNSTABLE_EQUIPMENT_RE = /(bosu|bola|instavel|instável|suspensao|suspensão)/i;
function normalizeGroup(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function groupFamily(ex: MethodAwareExercise): string | null {
  const group = normalizeGroup(ex.muscle_group);
  const name = normalizeGroup(ex.exercise_name);
  const classify = (text: string) => {
    if (/peitoral|chest|supino|crucifixo|crossover/.test(text)) return "peitoral";
    if (/costas|dorsal|remada|puxada|barra fixa|latissim/.test(text)) return "costas";
    if (/biceps|rosca/.test(text)) return "biceps";
    if (/triceps|testa|corda|paralela/.test(text)) return "triceps";
    if (/quadriceps|quadric|extensora|leg press|agachamento/.test(text)) return "quadriceps";
    if (/posterior|isquio|flexora|mesa flexora|stiff|terra romeno/.test(text)) return "posterior";
    return null;
  };
  const explicitGroup = classify(group);
  if (explicitGroup) return explicitGroup;
  const inferredName = classify(name);
  if (inferredName) return inferredName;
  return null;
}

function isAntagonistPair(a: MethodAwareExercise, b: MethodAwareExercise): boolean {
  const left = groupFamily(a);
  const right = groupFamily(b);
  if (!left || !right) return false;
  return (
    (left === "peitoral" && right === "costas") ||
    (left === "costas" && right === "peitoral") ||
    (left === "biceps" && right === "triceps") ||
    (left === "triceps" && right === "biceps") ||
    (left === "quadriceps" && right === "posterior") ||
    (left === "posterior" && right === "quadriceps")
  );
}

function isIsolation(ex: MethodAwareExercise): boolean {
  if (typeof ex.is_isolation === "boolean") return ex.is_isolation;
  return !COMPOUND_RE.test(ex.exercise_name || "");
}

function isStableSingleCandidate(ex: MethodAwareExercise): boolean {
  const phase = String(ex.phase || "").toLowerCase();
  if (HIGH_RISK_RE.test(ex.exercise_name || "")) return false;
  if (UNSTABLE_EQUIPMENT_RE.test(`${ex.exercise_name || ""} ${ex.equipment || ""}`)) return false;
  if (phase && !["forca_especifica", "acessorio", "isolado"].includes(phase)) return false;
  return phase ? true : isIsolation(ex);
}

function isStableClusterCandidate(ex: MethodAwareExercise): boolean {
  const phase = String(ex.phase || "").toLowerCase();
  const equipment = normalizeGroup(`${ex.equipment || ""} ${ex.exercise_name || ""}`);
  if (phase !== "forca_global") return false;
  if (HIGH_RISK_RE.test(ex.exercise_name || "")) return false;
  if (UNSTABLE_EQUIPMENT_RE.test(`${ex.exercise_name || ""} ${ex.equipment || ""}`)) return false;
  return /(maquina|smith|guiad|chest press|leg press)/.test(equipment);
}

function isSafeGroupingCandidate(ex: MethodAwareExercise): boolean {
  return isStableSingleCandidate(ex);
}

function lastConsecutivePair(indexes: number[]): number[] {
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    if (indexes[index] === indexes[index - 1] + 1) return [indexes[index - 1], indexes[index]];
  }
  return [];
}

function lastConsecutiveAntagonistPair(indexes: number[], exercises: MethodAwareExercise[]): number[] {
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const left = indexes[index - 1];
    const right = indexes[index];
    if (right === left + 1 && isAntagonistPair(exercises[left], exercises[right])) return [left, right];
  }
  return [];
}

function normalizedObjective(ctx: AdvancedMethodCtx) {
  return String(ctx.objective || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolvedSequence(ctx: AdvancedMethodCtx) {
  const sequence = Number(ctx.sequenceNumber);
  return Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 0;
}

function resolvedSession(ctx: AdvancedMethodCtx) {
  const session = Number(ctx.sessionIndex);
  return Number.isFinite(session) && session > 0 ? Math.floor(session) : 0;
}

function rotate<T>(items: readonly T[], offset: number): T[] {
  if (!items.length) return [];
  const normalized = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function selectMethod(ctx: AdvancedMethodCtx): MethodId | null {
  const objective = normalizedObjective(ctx);
  const sequence = resolvedSequence(ctx);
  const session = resolvedSession(ctx);
  const week = ctx.week ?? 1;
  const hypertrophy = /hipertrof|massa|recompos|estetica/.test(objective) || !objective;
  const fatLoss = /emagrec|perda|condicion/.test(objective);
  const strength = /forca|força|performance|potencia/.test(objective);

  if (ctx.mesocycle === "acumulacao") {
    if (!hypertrophy && !strength) return null;
    if (ctx.isEnduranceAthlete) return week % 2 === 1 ? "isometria" : "pico_contracao";
    if (week % 2 === 1) {
      if (session) return rotate<MethodId>(["pico_contracao", "pico_alongamento", "isometria", "restpause"], sequence - 1)[(session - 1) % 4];
      if (sequence === 1) return "pico_contracao";
      if (sequence === 2) return "pico_alongamento";
      if (sequence === 3) return "isometria";
      return "restpause";
    }
    if (session) return rotate<MethodId>(["dropset", "restpause", "pico_contracao", "pico_alongamento"], sequence - 1)[(session - 1) % 4];
    if (sequence === 2 && ctx.level === "avancado") return "restpause";
    return "dropset";
  }

  if (ctx.mesocycle === "intensificacao") {
    if (ctx.isEnduranceAthlete) return null;
    if (!sequence && week % 2 === 1) return "superset";
    if (fatLoss) return "circuito";
    if (strength && ctx.level === "avancado" && week >= 6) return "cluster";
    if (session && week >= 6) {
      const pool: MethodId[] = ctx.level === "avancado"
        ? ["cluster", "restpause", "dropset", "pico_contracao"]
        : ["dropset", "restpause"];
      return rotate(pool, sequence - 1)[(session - 1) % pool.length];
    }
    if (hypertrophy && ctx.level === "avancado" && week >= 6 && sequence === 1) return "cluster";
    if (hypertrophy && week >= 6) return ctx.level === "avancado" ? "restpause" : "dropset";
    if (session && hypertrophy) {
      const pool: MethodId[] = ctx.level === "avancado"
        ? ["triset", "giantset", "superset", "biset"]
        : ["superset", "biset"];
      return rotate(pool, sequence - 1)[(session - 1) % pool.length];
    }
    if (hypertrophy && ctx.level === "avancado" && sequence === 1) return "triset";
    if (hypertrophy && ctx.level === "avancado" && sequence === 2) return "giantset";
    if (hypertrophy && sequence === 3) return "superset";
    return "biset";
  }

  return null;
}

function methodReason(method: MethodId): string {
  if (["triset", "giantset", "circuito"].includes(method)) return "selected_metabolic_density";
  if (method === "superset") return "selected_antagonist_pair";
  if (method === "biset") return "selected_safe_pair";
  if (method === "cluster") return "selected_strength_quality";
  if (["pico_contracao", "pico_alongamento", "isometria"].includes(method)) return "selected_tension_control";
  return "selected_accessory_intensity";
}

function requiredGroupSize(method: MethodId) {
  if (method === "giantset") return 4;
  if (method === "triset") return 3;
  if (method === "circuito") return 3;
  if (method === "biset" || method === "superset") return 2;
  return 1;
}

function lastConsecutiveIndexes(indexes: number[], count: number): number[] {
  for (let end = indexes.length - 1; end >= count - 1; end -= 1) {
    const slice = indexes.slice(end - count + 1, end + 1);
    if (slice.every((value, index) => index === 0 || value === slice[index - 1] + 1)) return slice;
  }
  return [];
}

function lastConsecutiveSameFamily(
  indexes: number[],
  exercises: MethodAwareExercise[],
  count: number,
): number[] {
  for (let end = indexes.length - 1; end >= count - 1; end -= 1) {
    const slice = indexes.slice(end - count + 1, end + 1);
    const family = groupFamily(exercises[slice[0]]);
    if (family && slice.every((value, index) =>
      (index === 0 || value === slice[index - 1] + 1) && groupFamily(exercises[value]) === family
    )) return slice;
  }
  return [];
}

function applyMethod<T extends MethodAwareExercise>(
  out: Array<T & { method_reason?: string | null }>,
  indexes: number[],
  method: MethodId,
  gid: (i: number) => string,
) {
  if (!indexes.length) return false;
  const group = requiredGroupSize(method) > 1 ? gid(indexes[0]) : null;
  const reason = methodReason(method);
  for (const index of indexes) {
    out[index].method = method;
    out[index].group_id = group;
    out[index].method_reason = reason;
    out[index].method_seconds = method === "cluster"
      ? 15
      : method === "restpause"
        ? 20
        : method === "isometria"
          ? 20
          : ["pico_contracao", "pico_alongamento"].includes(method)
            ? 2
          : null;
  }
  return true;
}

/**
 * Aplica sistemas avançados aos exercícios da sessão conforme a fase/microciclo/nível.
 * Não muta a entrada — retorna uma nova lista. Determinístico (sem random).
 */
export function planAdvancedMethods<T extends MethodAwareExercise>(
  exercises: T[],
  ctx: AdvancedMethodCtx,
): Array<T & MethodAwareExercise> {
  const out: Array<T & MethodAwareExercise> = (exercises || []).map((e) => ({ ...e }));
  const micro = ctx.microcycle ?? "ordinario";   // motor ainda não rastreia microciclo → ordinário
  const week = ctx.week ?? 1;                     // nem semana → bloco 0 (sem rotação) até passarem
  // group_id único DENTRO da lista da sessão (o app só agrupa consecutivos numa lista).
  // sessionKey (ex.: workout_id) evita colisão se o motor combinar sessões da mesma semana.
  const gid = ctx.groupIdFor || ((i: number) => `m${ctx.sessionKey ? ctx.sessionKey + "_" : ""}${week}_${i}`);

  // Bloqueios duros: nada de método avançado.
  if (ctx.level === "iniciante" || micro === "regenerativo" || ctx.mesocycle === "base" || ctx.hasPain || ctx.hasRedFlags || ctx.fatigueHigh) {
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
  const clusterIdxs = out
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.painful && isStableClusterCandidate(e))
    .map(({ i }) => i);
  if (singleIdxs.length === 0 && groupingIdxs.length < 2 && clusterIdxs.length === 0) return out;

  const method = selectMethod(ctx);
  if (!method) return out;

  if (method === "cluster") {
    if (clusterIdxs.length) applyMethod(out, [clusterIdxs[clusterIdxs.length - 1]], method, gid);
    return out;
  }

  if (method === "superset") {
    const pair = lastConsecutiveAntagonistPair(groupingIdxs, out);
    if (pair.length === 2) applyMethod(out, pair, method, gid);
    return out;
  }

  if (GROUPING_METHODS.includes(method)) {
    const count = requiredGroupSize(method);
    const group = method === "triset" || method === "giantset"
      ? lastConsecutiveSameFamily(groupingIdxs, out, count)
      : lastConsecutiveIndexes(groupingIdxs, count);
    const fallbackPair = method === "biset" ? lastConsecutivePair(groupingIdxs) : [];
    applyMethod(out, group.length ? group : fallbackPair, method, gid);
    return out;
  }

  if (singleIdxs.length) applyMethod(out, [singleIdxs[singleIdxs.length - 1]], method, gid);

  return out;
}
