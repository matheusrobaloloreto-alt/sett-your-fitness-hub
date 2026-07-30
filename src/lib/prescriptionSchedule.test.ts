import { describe, expect, it } from "vitest";
import {
  daysUntilCycleEnd,
  isCycleCurrent,
  longitudinalPhase,
  selectCurrentCyclePerEnrollment,
  selectPrescriptionTargets,
  type PrescriptionScheduleCycle,
} from "./prescriptionSchedule";

const cycle = (number: number, start: string, end: string, extra: Partial<PrescriptionScheduleCycle> = {}): PrescriptionScheduleCycle => ({
  id: `cycle-${number}`,
  enrollment_id: "enrollment-1",
  cycle_number: number,
  start_date: start,
  end_date: end,
  status: number === 1 ? "active" : "pending",
  ...extra,
});

describe("prescriptionSchedule", () => {
  const today = new Date(2026, 6, 18);
  const cycles = [
    cycle(1, "2026-06-08", "2026-07-19", { has_workouts: true }),
    cycle(2, "2026-07-20", "2026-08-30"),
    cycle(3, "2026-08-31", "2026-10-11"),
    cycle(4, "2026-10-12", "2026-11-22"),
  ];

  it("identifica o bloco vigente por data, não apenas pelo status", () => {
    expect(isCycleCurrent(cycles[0], today)).toBe(true);
    expect(isCycleCurrent(cycles[1], today)).toBe(false);
    expect(daysUntilCycleEnd(cycles[0], today)).toBe(1);
  });

  it("agenda somente os blocos restantes ainda não preparados", () => {
    expect(selectPrescriptionTargets({ cycles, mode: "remaining", today }).map((item) => item.id))
      .toEqual(["cycle-2", "cycle-3", "cycle-4"]);
  });

  it("não regenera blocos já preparados sem uma substituição explícita", () => {
    const prepared = cycles.map((item) => ({ ...item, has_bundle: true }));
    expect(selectPrescriptionTargets({ cycles: prepared, mode: "remaining", today })).toEqual([]);
    expect(selectPrescriptionTargets({
      cycles: prepared,
      mode: "remaining",
      today,
      includeAlreadyPrepared: true,
    })).toHaveLength(4);
  });

  it("mantém a seleção de um único bloco quando solicitado", () => {
    expect(selectPrescriptionTargets({ cycles, mode: "single", selectedCycleId: "cycle-3", today }))
      .toEqual([cycles[2]]);
  });

  it("repete a onda BN base/acúmulo/intensificação/consolidação", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(longitudinalPhase)).toEqual([
      "base", "acumulacao", "intensificacao", "consolidacao",
      "base", "acumulacao", "intensificacao", "consolidacao",
    ]);
  });

  it("deduplica ciclos vigentes sobrepostos e prioriza o ciclo ativo materializado", () => {
    const overlapping = [
      cycle(4, "2026-06-22", "2026-08-02", { status: "completed", has_workouts: true }),
      cycle(5, "2026-06-22", "2026-08-02", { status: "completed" }),
      cycle(6, "2026-06-22", "2026-08-02", { status: "active", has_bundle: true }),
      cycle(7, "2026-07-02", "2026-08-12", { status: "completed", has_workouts: true }),
      cycle(1, "2026-07-01", "2026-08-01", { enrollment_id: "enrollment-2", has_workouts: true }),
    ];

    expect(selectCurrentCyclePerEnrollment(overlapping, today).map((item) => item.id))
      .toEqual(["cycle-6", "cycle-1"]);
  });
});
