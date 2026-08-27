export type PrescriptionScheduleMode = "single" | "remaining";

export interface PrescriptionScheduleCycle {
  id: string;
  enrollment_id: string | null;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  has_workouts?: boolean;
  has_bundle?: boolean;
}

export interface PrescriptionEnrollment {
  id: string;
  status: string;
  created_at?: string | null;
}

export type LongitudinalPhase = "base" | "acumulacao" | "intensificacao" | "consolidacao";

const DAY_MS = 86_400_000;

function utcDay(value: string | Date): number {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, Math.max(0, month - 1), day);
}

export function isCycleCurrent(
  cycle: Pick<PrescriptionScheduleCycle, "start_date" | "end_date">,
  today = new Date(),
): boolean {
  const now = utcDay(today);
  return now >= utcDay(cycle.start_date) && now <= utcDay(cycle.end_date);
}

export function isCycleFuture(cycle: PrescriptionScheduleCycle, today = new Date()): boolean {
  return utcDay(cycle.start_date) > utcDay(today);
}

export function daysUntilCycleEnd(cycle: PrescriptionScheduleCycle, today = new Date()): number {
  return Math.ceil((utcDay(cycle.end_date) - utcDay(today)) / DAY_MS);
}

/**
 * Re-publicações antigas podem deixar períodos sobrepostos. Para cada matrícula,
 * prioriza o ciclo marcado como ativo, depois o vigente materializado e, em
 * empate, o ciclo de maior número.
 */
export function selectCurrentCyclePerEnrollment(
  cycles: PrescriptionScheduleCycle[],
  today = new Date(),
): PrescriptionScheduleCycle[] {
  const grouped = new Map<string, PrescriptionScheduleCycle[]>();

  cycles.filter((cycle) => isCycleCurrent(cycle, today)).forEach((cycle) => {
    const key = cycle.enrollment_id || cycle.id;
    const group = grouped.get(key) || [];
    group.push(cycle);
    grouped.set(key, group);
  });

  return Array.from(grouped.values()).map((group) => [...group].sort((a, b) => {
    const aPrepared = Boolean(a.has_workouts || a.has_bundle);
    const bPrepared = Boolean(b.has_workouts || b.has_bundle);
    if (aPrepared !== bPrepared) return Number(bPrepared) - Number(aPrepared);
    const aActive = a.status === "active";
    const bActive = b.status === "active";
    if (aActive !== bActive) return Number(bActive) - Number(aActive);
    if (a.cycle_number !== b.cycle_number) return b.cycle_number - a.cycle_number;
    return utcDay(b.start_date) - utcDay(a.start_date);
  })[0]);
}

/**
 * Fonte única para o ciclo que deve ser aberto nas telas do professor e aluno.
 * Conteúdo materializado vence um ciclo apenas marcado como ativo mas vazio;
 * ciclos futuros nunca vazam antes da vigência.
 */
export function selectPreferredVisibleCycle<T extends {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  has_workouts?: boolean;
  has_bundle?: boolean;
}>(cycles: T[], today = new Date()): T | null {
  const prepared = (cycle: T) => Boolean(cycle.has_workouts || cycle.has_bundle);
  const started = (cycle: T) => utcDay(cycle.start_date) <= utcDay(today);
  const rank = (left: T, right: T) => {
    const statusDifference = Number(right.status === "active") - Number(left.status === "active");
    if (statusDifference !== 0) return statusDifference;
    if (left.cycle_number !== right.cycle_number) return right.cycle_number - left.cycle_number;
    return utcDay(right.start_date) - utcDay(left.start_date);
  };

  return cycles.filter((cycle) => isCycleCurrent(cycle, today) && prepared(cycle)).sort(rank)[0]
    ?? cycles.filter((cycle) => started(cycle) && prepared(cycle)).sort((left, right) =>
      utcDay(right.start_date) - utcDay(left.start_date) || rank(left, right)
    )[0]
    ?? cycles.filter((cycle) => isCycleCurrent(cycle, today)).sort(rank)[0]
    ?? null;
}

/**
 * Ciclos importados legados chegaram a ser anexados com datas um dia maiores
 * que o ciclo original. No perfil, colapsa somente sobreposições quase totais
 * da mesma matrícula; os registros continuam preservados no banco/auditoria.
 */
export function collapseOverlappingCyclesForDisplay<T extends PrescriptionScheduleCycle>(cycles: T[]): T[] {
  const overlapRatio = (left: T, right: T) => {
    if ((left.enrollment_id || "") !== (right.enrollment_id || "")) return 0;
    const leftStart = utcDay(left.start_date);
    const leftEnd = utcDay(left.end_date);
    const rightStart = utcDay(right.start_date);
    const rightEnd = utcDay(right.end_date);
    const intersection = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) + DAY_MS);
    const shorter = Math.min(leftEnd - leftStart + DAY_MS, rightEnd - rightStart + DAY_MS);
    return shorter > 0 ? intersection / shorter : 0;
  };
  const preferred = (left: T, right: T) => {
    const leftPrepared = Boolean(left.has_workouts || left.has_bundle);
    const rightPrepared = Boolean(right.has_workouts || right.has_bundle);
    if (leftPrepared !== rightPrepared) return rightPrepared ? right : left;
    if ((left.status === "active") !== (right.status === "active")) return right.status === "active" ? right : left;
    return right.cycle_number > left.cycle_number ? right : left;
  };
  const durationDays = (cycle: T) =>
    Math.max(1, Math.round((utcDay(cycle.end_date) - utcDay(cycle.start_date)) / DAY_MS) + 1);
  const canonicalSchedule = (left: T, right: T) => {
    const leftReasonable = durationDays(left) <= 16 * 7;
    const rightReasonable = durationDays(right) <= 16 * 7;
    if (leftReasonable !== rightReasonable) return leftReasonable ? left : right;
    if (left.cycle_number !== right.cycle_number) return left.cycle_number < right.cycle_number ? left : right;
    return utcDay(left.end_date) <= utcDay(right.end_date) ? left : right;
  };
  const mergeForDisplay = (left: T, right: T): T => {
    const content = preferred(left, right);
    const schedule = canonicalSchedule(left, right);
    if (content.id === schedule.id) return content;
    return {
      ...content,
      enrollment_id: schedule.enrollment_id,
      cycle_number: schedule.cycle_number,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      status: schedule.status,
    };
  };

  const selected: T[] = [];
  for (const cycle of [...cycles].sort((a, b) => utcDay(a.start_date) - utcDay(b.start_date))) {
    const duplicateIndex = selected.findIndex((candidate) => overlapRatio(candidate, cycle) >= 0.8);
    if (duplicateIndex === -1) selected.push(cycle);
    else selected[duplicateIndex] = mergeForDisplay(selected[duplicateIndex], cycle);
  }
  return selected.sort((a, b) => utcDay(a.start_date) - utcDay(b.start_date));
}

/**
 * Um aluno pode manter matrículas antigas para histórico. O Studio sempre deve
 * prescrever sobre uma única matrícula vigente, sem misturar ciclos legados.
 */
export function selectPrescriptionEnrollment<T extends PrescriptionEnrollment>(
  enrollments: T[],
): T | null {
  const statusPriority: Record<string, number> = {
    active: 0,
    awaiting_training: 1,
    awaiting_renewal: 2,
  };

  return [...enrollments]
    .filter((enrollment) => enrollment.status in statusPriority)
    .sort((a, b) => {
      const statusDifference = statusPriority[a.status] - statusPriority[b.status];
      if (statusDifference !== 0) return statusDifference;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    })[0] ?? null;
}

/**
 * Ciclos legados podem ter sido recriados com números maiores e datas
 * sobrepostas. Mantém a sequência numerada mais antiga e ignora qualquer bloco
 * que recomece antes do término do bloco anterior.
 */
export function selectSequentialScheduleCycles(
  cycles: PrescriptionScheduleCycle[],
): PrescriptionScheduleCycle[] {
  const ordered = [...cycles].sort((a, b) => {
    if (a.cycle_number !== b.cycle_number) return a.cycle_number - b.cycle_number;
    return utcDay(a.start_date) - utcDay(b.start_date);
  });
  const selected: PrescriptionScheduleCycle[] = [];

  for (const cycle of ordered) {
    const previous = selected[selected.length - 1];
    if (!previous || utcDay(cycle.start_date) > utcDay(previous.end_date)) {
      selected.push(cycle);
    }
  }

  return selected;
}

export function scheduleSpanWeeks(cycles: PrescriptionScheduleCycle[]): number {
  if (!cycles.length) return 0;
  const start = Math.min(...cycles.map((cycle) => utcDay(cycle.start_date)));
  const end = Math.max(...cycles.map((cycle) => utcDay(cycle.end_date)));
  return Math.max(1, Math.ceil((end - start + DAY_MS) / (7 * DAY_MS)));
}

export function longitudinalPhase(cycleNumber: number): LongitudinalPhase {
  const index = ((Math.max(1, cycleNumber) - 1) % 4) + 1;
  if (index === 1) return "base";
  if (index === 2) return "acumulacao";
  if (index === 3) return "intensificacao";
  return "consolidacao";
}

export function selectPrescriptionTargets(args: {
  cycles: PrescriptionScheduleCycle[];
  mode: PrescriptionScheduleMode;
  selectedCycleId?: string | null;
  today?: Date;
  includeAlreadyPrepared?: boolean;
}): PrescriptionScheduleCycle[] {
  const today = args.today ?? new Date();
  const ordered = [...args.cycles].sort((a, b) => a.cycle_number - b.cycle_number);

  if (args.mode === "single") {
    const selected = ordered.find((cycle) => cycle.id === args.selectedCycleId);
    return selected ? [selected] : [];
  }

  return ordered.filter((cycle) => {
    if (!isCycleCurrent(cycle, today) && !isCycleFuture(cycle, today)) return false;
    if (args.includeAlreadyPrepared) return true;
    return !cycle.has_workouts && !cycle.has_bundle;
  });
}

export function describeLongitudinalPhase(phase: LongitudinalPhase): string {
  if (phase === "base") return "Base técnica e calibração do novo mesociclo";
  if (phase === "acumulacao") return "Acúmulo progressivo de volume com exercícios estáveis";
  if (phase === "intensificacao") return "Intensificação controlada sem perder a técnica";
  return "Consolidação, redução de fadiga e preparação da próxima evolução";
}
