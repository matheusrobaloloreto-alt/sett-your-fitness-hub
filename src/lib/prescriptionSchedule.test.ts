import { describe, expect, it } from "vitest";
import {
  daysUntilCycleEnd,
  collapseOverlappingCyclesForDisplay,
  isCycleCurrent,
  isPrescriptionHistoryBeforeTarget,
  longitudinalPhase,
  scheduleSpanWeeks,
  selectCurrentCyclePerEnrollment,
  selectDefaultPrescriptionScheduleCycle,
  selectPreferredVisibleCycle,
  selectPrescriptionEnrollment,
  selectPrescriptionTargets,
  selectPreviousPrescriptionCycle,
  selectSequentialScheduleCycles,
  selectCurrentPlanCycleWindow,
  selectCyclesForProgramHistory,
  selectStudentWorkoutCycleWindow,
  hasActivePrescriptionContent,
  isPrescriptionClearedCycle,
  isSupersededCycle,
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

const liveStudioCycles = () => [
  cycle(1, "2026-02-06", "2026-03-19", { status: "completed", has_workouts: false }),
  cycle(2, "2026-03-20", "2026-04-30", { status: "completed", has_workouts: false }),
  cycle(3, "2026-05-01", "2026-06-11", { status: "completed", has_workouts: false }),
  cycle(4, "2026-06-12", "2026-07-23", { status: "completed", has_workouts: false }),
  cycle(9, "2026-07-23", "2026-09-03", { status: "completed", has_workouts: true }),
  cycle(5, "2026-07-24", "2026-09-03", { status: "completed", has_workouts: true }),
  cycle(11, "2026-09-03", "2026-10-29", { status: "active", has_workouts: true }),
  cycle(10, "2026-10-29", "2026-12-10", { status: "pending", has_workouts: true, has_bundle: true }),
  cycle(12, "2026-12-10", "2027-01-21", { status: "pending", has_workouts: true }),
];

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

  it("mostra ao professor o mesmo ciclo materializado que o aluno vê quando o ativo está vazio", () => {
    const overlapping = [
      cycle(5, "2026-07-01", "2026-08-30", { status: "active", has_workouts: false, has_bundle: false }),
      cycle(11, "2026-07-01", "2026-08-31", { status: "pending", has_workouts: true }),
    ];

    expect(selectCurrentCyclePerEnrollment(overlapping, today).map((item) => item.id))
      .toEqual(["cycle-11"]);
  });

  it("usa uma única regra para o ciclo visível ao professor e ao aluno", () => {
    const candidates = [
      cycle(5, "2026-07-01", "2026-08-30", { status: "active", has_workouts: false }),
      cycle(11, "2026-07-01", "2026-08-31", { status: "pending", has_workouts: true }),
      cycle(12, "2026-09-01", "2026-10-12", { status: "pending", has_workouts: true }),
    ];

    expect(selectPreferredVisibleCycle(candidates, today)?.id).toBe("cycle-11");
  });

  it("mantém o ciclo atual vazio visível em vez de cair para histórico materializado", () => {
    const candidates = [
      cycle(1, "2026-05-01", "2026-06-11", { status: "completed", has_workouts: true }),
      cycle(2, "2026-06-12", "2026-07-23", { status: "active", has_workouts: false }),
    ];

    expect(selectPreferredVisibleCycle(candidates, today)?.id).toBe("cycle-2");
  });

  it("trata ciclo com prescrição removida como vazio e bloqueia fallback histórico", () => {
    const historical = cycle(1, "2026-05-01", "2026-06-11", { status: "completed", has_workouts: true });
    const clearedCurrent = cycle(2, "2026-06-12", "2026-07-23", {
      status: "active",
      has_workouts: true,
      has_bundle: true,
      prescription_cleared_at: "2026-07-18T10:00:00Z",
      prescription_cleared_event_id: "clear-event-1",
      prescription_cleared_signature: "signature-v1",
    });

    expect(isPrescriptionClearedCycle(clearedCurrent)).toBe(true);
    expect(hasActivePrescriptionContent(clearedCurrent)).toBe(false);
    expect(selectPreferredVisibleCycle([historical, clearedCurrent], today)?.id).toBe(clearedCurrent.id);
    expect(selectCurrentCyclePerEnrollment([historical, clearedCurrent], today).map((item) => item.id))
      .toEqual([clearedCurrent.id]);
    expect(selectPrescriptionTargets({ cycles: [historical, clearedCurrent], mode: "remaining", today }).map((item) => item.id))
      .toEqual([clearedCurrent.id]);
  });

  it("mantém o Studio na matrícula vigente e não mistura ciclos de matrículas antigas", () => {
    expect(selectPrescriptionEnrollment([
      { id: "inactive", status: "inactive", created_at: "2026-07-30" },
      { id: "renewal", status: "awaiting_renewal", created_at: "2026-07-31" },
      { id: "active-old", status: "active", created_at: "2026-06-01" },
      { id: "active-new", status: "active", created_at: "2026-07-01" },
    ])?.id).toBe("active-new");
  });

  it("remove ciclos legados sobrepostos sem apagar a sequência válida", () => {
    const corrupted = [
      cycle(1, "2026-06-22", "2026-07-21"),
      cycle(2, "2026-07-22", "2026-08-20"),
      cycle(3, "2026-08-21", "2026-09-19"),
      cycle(4, "2026-06-22", "2026-08-02"),
      cycle(5, "2026-07-02", "2026-08-12"),
      cycle(6, "2026-09-25", "2026-11-05"),
    ];

    const selected = selectSequentialScheduleCycles(corrupted);
    expect(selected.map((item) => item.cycle_number)).toEqual([1, 2, 3, 6]);
    expect(scheduleSpanWeeks(selected)).toBe(20);
  });

  it("mantém o ciclo vigente importado/manual mesmo quando o número é maior que ciclos futuros", () => {
    const selected = selectSequentialScheduleCycles(liveStudioCycles());

    expect(selected.map((item) => item.cycle_number)).toEqual([1, 2, 3, 4, 9, 11, 10, 12]);
    expect(selectDefaultPrescriptionScheduleCycle(selected, new Date(2026, 8, 3))?.cycle_number).toBe(11);
    expect(selectDefaultPrescriptionScheduleCycle(selected, new Date(2026, 8, 8))?.cycle_number).toBe(11);
    expect(selectDefaultPrescriptionScheduleCycle(selected, new Date(2026, 9, 29))?.cycle_number).toBe(11);
    expect(selectDefaultPrescriptionScheduleCycle(selected, new Date(2026, 9, 30))?.cycle_number).toBe(10);
  });

  it("usa cronologia, não numeração, para histórico e ciclos restantes do Studio integrado", () => {
    const selected = selectSequentialScheduleCycles(liveStudioCycles());
    const currentCycle = selected.find((item) => item.cycle_number === 11);
    expect(currentCycle).toBeDefined();
    expect(selectPreviousPrescriptionCycle(selected, currentCycle!)?.cycle_number).toBe(9);

    expect(isPrescriptionHistoryBeforeTarget({ training_cycle_id: "cycle-9" }, currentCycle!, selected)).toBe(true);
    expect(isPrescriptionHistoryBeforeTarget({ training_cycle_id: "cycle-10" }, currentCycle!, selected)).toBe(false);
    expect(isPrescriptionHistoryBeforeTarget({ training_cycle_id: "cycle-missing" }, currentCycle!, selected)).toBe(false);
    expect(isPrescriptionHistoryBeforeTarget({}, currentCycle!, selected)).toBe(false);

    expect(selectPrescriptionTargets({
      cycles: selected,
      mode: "remaining",
      today: new Date(2026, 8, 8),
      includeAlreadyPrepared: true,
    }).map((item) => item.cycle_number)).toEqual([11, 10, 12]);
  });

  it("colapsa duplicatas MFIT quase idênticas apenas na visualização do perfil", () => {
    const duplicated = [
      cycle(5, "2026-07-27", "2026-09-06", { status: "active", has_workouts: false }),
      cycle(11, "2026-07-27", "2026-09-07", { status: "pending", has_workouts: true }),
      cycle(8, "2026-11-30", "2027-01-10", { status: "pending", has_workouts: false }),
      cycle(12, "2026-11-30", "2027-12-11", { status: "pending", has_workouts: true }),
    ];

    expect(collapseOverlappingCyclesForDisplay(duplicated)).toEqual([
      expect.objectContaining({
        id: "cycle-11",
        cycle_number: 5,
        start_date: "2026-07-27",
        end_date: "2026-09-06",
        status: "active",
        has_workouts: true,
      }),
      expect.objectContaining({
        id: "cycle-12",
        cycle_number: 8,
        start_date: "2026-11-30",
        end_date: "2027-01-10",
        status: "pending",
        has_workouts: true,
      }),
    ]);
  });

  it("remove ciclos substituídos de todas as seleções sem apagar o registro", () => {
    const canonical = cycle(5, "2026-07-01", "2026-08-30", { status: "active", has_workouts: true });
    const superseded = cycle(11, "2026-07-01", "2026-08-31", {
      status: "superseded",
      superseded_by_cycle_id: canonical.id,
      has_workouts: true,
    });
    const future = cycle(6, "2026-08-31", "2026-10-11");

    expect(isSupersededCycle(superseded)).toBe(true);
    expect(scheduleSpanWeeks([canonical, superseded])).toBe(scheduleSpanWeeks([canonical]));
    expect(selectPreferredVisibleCycle([canonical, superseded], today)?.id).toBe(canonical.id);
    expect(selectCurrentCyclePerEnrollment([canonical, superseded], today).map((item) => item.id)).toEqual([canonical.id]);
    expect(collapseOverlappingCyclesForDisplay([canonical, superseded]).map((item) => item.id)).toEqual([canonical.id]);
    expect(selectSequentialScheduleCycles([canonical, superseded, future]).map((item) => item.id)).toEqual([canonical.id, future.id]);
    expect(selectPrescriptionTargets({ cycles: [canonical, superseded, future], mode: "remaining", today }).map((item) => item.id))
      .toEqual([future.id]);
  });

  it("limita a ficha principal à janela nominal do plano ancorada no ciclo ativo", () => {
    const inflated = Array.from({ length: 31 }, (_, index) => cycle(
      index + 1,
      new Date(Date.UTC(2025, 4, 23 + index * 42)).toISOString().slice(0, 10),
      new Date(Date.UTC(2025, 4, 23 + index * 42 + 41)).toISOString().slice(0, 10),
      { status: index === 11 ? "active" : index < 11 ? "completed" : "pending" },
    ));

    expect(selectCurrentPlanCycleWindow(inflated, 168, 42).map((item) => item.cycle_number))
      .toEqual([9, 10, 11, 12]);
  });

  it("mantém o treino antigo publicado até a nova matrícula ter ciclo atual materializado", () => {
    const oldPublished = cycle(4, "2026-07-01", "2026-08-11", {
      id: "old-cycle",
      enrollment_id: "old-enrollment",
      status: "active",
      has_workouts: true,
      delivery_status: "viewed",
    });
    const newEmpty = cycle(1, "2026-08-12", "2026-09-22", {
      id: "new-empty",
      enrollment_id: "new-enrollment",
      status: "active",
      has_workouts: false,
      delivery_status: null,
    });

    const selected = selectStudentWorkoutCycleWindow([newEmpty], {
      carriedOverCycle: oldPublished,
      planDurationDays: 42,
      today: new Date(2026, 7, 20),
    });

    expect(selected.cycles.map((item) => item.id)).toEqual(["old-cycle", "new-empty"]);
    expect(selected.preferredCycle?.id).toBe("old-cycle");
  });

  it("troca para o ciclo atual real assim que a nova publicação materializada existe", () => {
    const oldPublished = cycle(4, "2026-07-01", "2026-08-11", {
      id: "old-cycle",
      enrollment_id: "old-enrollment",
      status: "active",
      has_workouts: true,
      delivery_status: "viewed",
    });
    const newPublished = cycle(1, "2026-08-12", "2026-09-22", {
      id: "new-published",
      enrollment_id: "new-enrollment",
      status: "active",
      has_workouts: true,
      delivery_status: "sent",
    });

    const selected = selectStudentWorkoutCycleWindow([newPublished], {
      carriedOverCycle: oldPublished,
      planDurationDays: 42,
      today: new Date(2026, 7, 20),
    });

    expect(selected.preferredCycle?.id).toBe("new-published");
    expect(selected.cycles.map((item) => item.id)).toEqual(["new-published"]);
  });

  it("não ressuscita carryover quando a nova matrícula já teve publicação e o próximo slot está vazio", () => {
    const oldPublished = cycle(4, "2026-07-01", "2026-08-11", {
      id: "old-cycle",
      enrollment_id: "old-enrollment",
      has_workouts: true,
    });
    const newPublishedExpired = cycle(1, "2026-08-12", "2026-09-22", {
      id: "new-published-expired",
      enrollment_id: "new-enrollment",
      status: "completed",
      has_workouts: true,
    });
    const newCurrentEmpty = cycle(2, "2026-09-23", "2026-11-03", {
      id: "new-current-empty",
      enrollment_id: "new-enrollment",
      status: "active",
      has_workouts: false,
    });

    const selected = selectStudentWorkoutCycleWindow([newPublishedExpired, newCurrentEmpty], {
      carriedOverCycle: oldPublished,
      planDurationDays: 84,
      today: new Date(2026, 9, 1),
    });

    expect(selected.cycles.map((item) => item.id)).toEqual(["new-published-expired", "new-current-empty"]);
    expect(selected.preferredCycle?.id).toBe("new-published-expired");
  });

  it("usa somente o carryover explícito da matrícula vigente em renovações repetidas", () => {
    const firstHistorical = cycle(2, "2026-06-01", "2026-07-12", {
      id: "not-current-carryover",
      enrollment_id: "first-enrollment",
      has_workouts: true,
    });
    const explicitCarryover = cycle(3, "2026-07-13", "2026-08-23", {
      id: "explicit-carryover",
      enrollment_id: "second-enrollment",
      has_workouts: true,
    });
    const newEmpty = cycle(1, "2026-08-24", "2026-10-04", {
      id: "third-renewal-empty",
      enrollment_id: "third-enrollment",
      status: "active",
    });

    const selected = selectStudentWorkoutCycleWindow([newEmpty], {
      carriedOverCycle: explicitCarryover,
      planDurationDays: 42,
      today: new Date(2026, 8, 1),
    });

    expect(selected.cycles.map((item) => item.id)).toEqual(["explicit-carryover", "third-renewal-empty"]);
    expect(selected.cycles.map((item) => item.id)).not.toContain(firstHistorical.id);
    expect(selected.preferredCycle?.id).toBe("explicit-carryover");
  });

  it("mantém comportamento legado sem carryover: ciclo atual vazio não cai para histórico", () => {
    const currentEmpty = cycle(2, "2026-08-01", "2026-09-11", {
      id: "current-empty",
      status: "active",
      has_workouts: false,
    });

    const selected = selectStudentWorkoutCycleWindow([currentEmpty], {
      planDurationDays: 42,
      today: new Date(2026, 7, 20),
    });

    expect(selected.cycles.map((item) => item.id)).toEqual(["current-empty"]);
    expect(selected.preferredCycle?.id).toBe("current-empty");
  });

  it("limpeza explícita na matrícula nova bloqueia fallback para carryover", () => {
    const oldPublished = cycle(4, "2026-07-01", "2026-08-11", {
      id: "old-cycle",
      enrollment_id: "old-enrollment",
      has_workouts: true,
    });
    const clearedCurrent = cycle(1, "2026-08-12", "2026-09-22", {
      id: "cleared-current",
      enrollment_id: "new-enrollment",
      status: "active",
      has_workouts: true,
      prescription_cleared_at: "2026-08-20T12:00:00Z",
    });

    const selected = selectStudentWorkoutCycleWindow([clearedCurrent], {
      carriedOverCycle: oldPublished,
      planDurationDays: 42,
      today: new Date(2026, 7, 20),
    });

    expect(selected.preferredCycle?.id).toBe("cleared-current");
    expect(selected.cycles.map((item) => item.id)).toEqual(["cleared-current"]);
  });

  it("publicação nova posterior vence limpeza de ciclo antigo sem reabrir carryover", () => {
    const oldPublished = cycle(4, "2026-07-01", "2026-08-11", {
      id: "old-cycle",
      enrollment_id: "old-enrollment",
      has_workouts: true,
    });
    const clearedNewFirst = cycle(1, "2026-08-12", "2026-09-22", {
      id: "cleared-new-first",
      enrollment_id: "new-enrollment",
      status: "completed",
      has_workouts: true,
      prescription_cleared_at: "2026-08-20T12:00:00Z",
    });
    const publishedNewCurrent = cycle(2, "2026-09-23", "2026-11-03", {
      id: "published-new-current",
      enrollment_id: "new-enrollment",
      status: "active",
      has_workouts: true,
      delivery_status: "sent",
    });

    const selected = selectStudentWorkoutCycleWindow([clearedNewFirst, publishedNewCurrent], {
      carriedOverCycle: oldPublished,
      planDurationDays: 84,
      today: new Date(2026, 9, 1),
    });

    expect(selected.cycles.map((item) => item.id)).toEqual(["cleared-new-first", "published-new-current"]);
    expect(selected.preferredCycle?.id).toBe("published-new-current");
  });

  it("não usa carryover revogado, substituído, futuro, limpo ou de outro aluno/empresa", () => {
    const currentEmpty = cycle(1, "2026-08-12", "2026-09-22", {
      id: "new-empty",
      enrollment_id: "new-enrollment",
      status: "active",
    });
    const baseCarryover = cycle(4, "2026-07-01", "2026-08-11", {
      id: "carryover",
      enrollment_id: "old-enrollment",
      student_id: "student-1",
      company_id: "company-1",
      has_workouts: true,
    });
    const cases = [
      { ...baseCarryover, status: "superseded" },
      { ...baseCarryover, superseded_by_cycle_id: "replacement" },
      { ...baseCarryover, start_date: "2026-08-25", end_date: "2026-10-05" },
      { ...baseCarryover, prescription_cleared_at: "2026-08-20T12:00:00Z" },
    ];

    for (const carriedOverCycle of cases) {
      const selected = selectStudentWorkoutCycleWindow([currentEmpty], {
        carriedOverCycle,
        expectedStudentId: "student-1",
        expectedCompanyId: "company-1",
        planDurationDays: 42,
        today: new Date(2026, 7, 20),
      });
      expect(selected.cycles.map((item) => item.id)).toEqual(["new-empty"]);
      expect(selected.preferredCycle?.id).toBe("new-empty");
    }

    for (const carriedOverCycle of [
      { ...baseCarryover, student_id: "student-2" },
      { ...baseCarryover, company_id: "company-2" },
    ]) {
      const selected = selectStudentWorkoutCycleWindow([currentEmpty], {
        carriedOverCycle,
        expectedStudentId: "student-1",
        expectedCompanyId: "company-1",
        planDurationDays: 42,
        today: new Date(2026, 7, 20),
      });
      expect(selected.cycles.map((item) => item.id)).toEqual(["new-empty"]);
      expect(selected.preferredCycle?.id).toBe("new-empty");
    }
  });

  it("preserva dois programas materializados mesmo quando suas datas se sobrepõem", () => {
    const canonical = cycle(1, "2026-08-01", "2026-09-11", { has_workouts: true });
    const imported = cycle(9, "2026-08-02", "2026-09-12", { has_workouts: true });
    const emptyFuture = cycle(10, "2027-01-01", "2027-02-11");

    expect(selectCyclesForProgramHistory([canonical, imported, emptyFuture], 42, 42).map((item) => item.id))
      .toEqual([canonical.id, imported.id]);
  });
});
