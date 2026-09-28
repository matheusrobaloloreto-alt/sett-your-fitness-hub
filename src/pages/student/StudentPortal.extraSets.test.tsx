import { readFileSync } from "node:fs";
import { useEffect, useRef, useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudentPortalExtraSetReconciliation } from "./StudentPortal";
import {
  discardConflictedWorkoutLogDeletions,
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
  reconcileWorkoutLogBatchResponse,
  removeAndRenumberWorkoutSet,
  workoutUiDraftKey,
  workoutLogTombstoneKey,
  writeWorkoutUiDraft,
  type MutableWorkoutSetLog,
} from "@/lib/workoutDraft";
import { saveWorkoutLogBatchIfCurrent } from "@/lib/workoutLogPersistence";

type Log = MutableWorkoutSetLog & { session_date: string; weight: number; reps_done: number };
const today = "2026-09-28";
const workout = { id: "workout-1", exercises: [{ sets: "3" }] };
const uiKey = workoutUiDraftKey("student-1", today);
const logKey = `sett_logs_student-1_${today}`;
const keyOf = (log: Log) => `${log.workout_id}-${log.exercise_index}-${log.set_number}`;
const identityOf = (log: Log) => `${keyOf(log)}-${log.session_date}`;
const initialRows: Log[] = Array.from({ length: 5 }, (_, index) => ({
  id: `row-${index + 1}`,
  workout_id: workout.id,
  exercise_index: 0,
  set_number: index + 1,
  session_date: today,
  weight: (index + 1) * 10,
  reps_done: 8,
  revision: 1,
  dirty: true,
  client_updated_at: "2026-09-28T12:00:00Z",
}));

function useCountIntegration(serverRows: Log[]) {
  const restored = readWorkoutUiDraft(localStorage, uiKey);
  const [extraSets, setExtraSets] = useState<Record<number, number>>(restored?.extraSets ?? {});
  const extraSetsWorkoutRef = useRef<string | null>(restored?.workoutId ?? null);
  const extraSetsByWorkoutRef = useRef<Record<string, Record<number, number>>>(
    restored ? { [restored.workoutId!]: restored.extraSets } : {},
  );
  const [persistedLogs, setPersistedLogs] = useState(serverRows);
  const [logs, setLogs] = useState<Record<string, Log>>(() => Object.fromEntries(serverRows.map(log => [keyOf(log), log])));
  const [draftReady, setDraftReady] = useState(false);
  const logsRef = useRef(logs);
  const commit = (next: Record<string, Log>) => {
    logsRef.current = next;
    setLogs(next);
  };

  useStudentPortalExtraSetReconciliation({
    selectedWorkout: workout,
    persistedLogs,
    draftLogs: logs,
    draftReady,
    todayStr: today,
    setExtraSets,
    extraSetsWorkoutRef,
    extraSetsByWorkoutRef,
  });

  useEffect(() => {
    const raw = localStorage.getItem(logKey);
    if (raw) commit(mergeWorkoutDraftLogs(logsRef.current, JSON.parse(raw)));
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    writeWorkoutUiDraft(localStorage, uiKey, {
      cycleId: "cycle-1", workoutId: workout.id, expandedExercise: 0,
      activeView: "treino", extraSets,
    });
    localStorage.setItem(logKey, JSON.stringify(logs));
  }, [draftReady, extraSets, logs]);

  return {
    count: 3 + (extraSets[0] || 0),
    logs,
    persistedLogs,
    snapshot: () => Object.values(logsRef.current),
    removeFour: () => {
      commit(removeAndRenumberWorkoutSet(logsRef.current, workout.id, 0, 4, 5, "2026-09-28T12:00:01Z"));
      setExtraSets(current => {
        const next = { ...current, 0: (current[0] || 0) - 1 };
        extraSetsByWorkoutRef.current[workout.id] = next;
        return next;
      });
    },
    acknowledge: (sent: Log[], saved: Log[]) => {
      commit(reconcileWorkoutLogBatchResponse(logsRef.current, sent, saved, []));
      setPersistedLogs(current => {
        const rows = new Map(current.map(log => [identityOf(log), log]));
        for (const log of saved.filter(row => row.deleted)) rows.delete(identityOf(log));
        for (const log of saved.filter(row => !row.deleted)) rows.set(identityOf(log), log);
        return [...rows.values()];
      });
    },
    rejectDeletion: (sent: Log[], server: Log[]) => {
      const recovered = discardConflictedWorkoutLogDeletions(logsRef.current, sent,
        server.filter(log => log.set_number >= 4).map(log => ({ ...log, requested_deleted: true })));
      commit(mergeWorkoutDraftLogs(Object.fromEntries(server.map(log => [keyOf(log), log])), recovered));
      setPersistedLogs(server);
    },
  };
}

describe("StudentPortal extra-set React reconciliation", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps four visible sets through an old ACK, deletion ACK and reopening", () => {
    const view = renderHook(() => useCountIntegration(initialRows));
    expect(view.result.current.count).toBe(5);
    const inFlight = view.result.current.snapshot();

    act(() => view.result.current.removeFour());
    expect(view.result.current.count).toBe(4);
    act(() => view.result.current.acknowledge(inFlight, inFlight.map(log => ({ ...log, revision: 2 }))));
    expect(view.result.current.count).toBe(4);
    expect(view.result.current.logs["workout-1-0-5"]).toBeUndefined();
    expect(view.result.current.logs["workout-1-0-4"]).not.toHaveProperty("id");
    expect(readWorkoutUiDraft(localStorage, uiKey)?.extraSets).toEqual({ 0: 1 });

    const deletion = view.result.current.snapshot();
    const shifted = deletion.find(log => log.set_number === 4 && !log.deleted)!;
    const saved = [
      ...deletion.filter(log => log.deleted),
      { ...shifted, id: "replacement-4", revision: 3, dirty: false },
    ];
    act(() => view.result.current.acknowledge(deletion, saved));
    expect(view.result.current.count).toBe(4);
    expect(Object.values(view.result.current.logs).some(log => log.deleted)).toBe(false);
    const server = view.result.current.persistedLogs;
    expect(server.map(log => log.set_number)).toEqual([1, 2, 3, 4]);
    view.unmount();

    const reopened = renderHook(() => useCountIntegration(server));
    expect(reopened.result.current.count).toBe(4);
    expect(reopened.result.current.logs["workout-1-0-4"]).toMatchObject({ id: "replacement-4", weight: 50 });
  });

  it("restores the authoritative five sets when deletion loses CAS, including after reopening", () => {
    const view = renderHook(() => useCountIntegration(initialRows));
    act(() => view.result.current.removeFour());
    const deletion = view.result.current.snapshot();
    const server = initialRows.map(log => ({ ...log, revision: 2, dirty: false }));
    act(() => view.result.current.rejectDeletion(deletion, server));
    expect(view.result.current.count).toBe(5);
    expect(view.result.current.persistedLogs).toEqual(server);
    expect(view.result.current.logs["workout-1-0-5"]).toMatchObject({ id: "row-5", revision: 2 });
    view.unmount();
    const reopened = renderHook(() => useCountIntegration(server));
    expect(reopened.result.current.count).toBe(5);
  });

  it("keeps a failed transport deletion pending without erasing the authoritative rows", async () => {
    const view = renderHook(() => useCountIntegration(initialRows));
    act(() => view.result.current.removeFour());
    const result = await saveWorkoutLogBatchIfCurrent({
      rows: view.result.current.snapshot(),
      save: async () => { throw new TypeError("offline"); },
      wait: async () => undefined,
    });
    expect(result).toMatchObject({ ok: false, reason: "rpc_error" });
    expect(view.result.current.count).toBe(4);
    expect(view.result.current.persistedLogs).toEqual(initialRows);
    expect(Object.values(view.result.current.logs).filter(log => log.deleted)).toHaveLength(2);
    view.unmount();
    const reopened = renderHook(() => useCountIntegration(initialRows));
    expect(reopened.result.current.count).toBe(4);
    expect(reopened.result.current.persistedLogs).toHaveLength(5);
  });

  it("does not hide a newer server generation behind an obsolete tombstone", () => {
    const old = initialRows[4];
    localStorage.setItem(logKey, JSON.stringify({
      [workoutLogTombstoneKey(keyOf(old))]: { ...old, deleted: true, dirty: true },
    }));
    writeWorkoutUiDraft(localStorage, uiKey, {
      cycleId: "cycle-1", workoutId: workout.id, expandedExercise: 0,
      activeView: "treino", extraSets: { 0: 1 },
    });
    const server = initialRows.map(log => log.set_number === 5
      ? { ...log, id: "new-generation-5", revision: 9, dirty: false }
      : log);
    const view = renderHook(() => useCountIntegration(server));
    expect(view.result.current.count).toBe(5);
    expect(view.result.current.persistedLogs).toEqual(server);
    expect(view.result.current.logs["workout-1-0-5"].id).toBe("new-generation-5");
  });

  it("uses the tested React effect with both persisted and draft state in the portal", () => {
    const source = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
    expect(source).toMatch(/useStudentPortalExtraSetReconciliation\(\{\s*selectedWorkout,\s*persistedLogs: allLogs,\s*draftLogs: logs,/);
    expect(source).toContain("draftReady: !!logsBackupKey && logsRestoredKey === logsBackupKey");
  });
});
