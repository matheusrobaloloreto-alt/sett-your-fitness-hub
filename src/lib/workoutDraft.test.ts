import { describe, expect, it, vi } from "vitest";
import {
  inferExtraSetsFromPersistedLogs,
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
  reconcileWorkoutLogResponse,
  reconcileWorkoutLogBatchResponse,
  discardConflictedWorkoutLogDeletions,
  removeAndRenumberWorkoutSet,
  resolveWorkoutResumeTarget,
  workoutUiDraftKey,
  writeWorkoutUiDraft,
  workoutLogTombstoneKey,
  type MutableWorkoutSetLog,
} from "./workoutDraft";

describe("workout draft persistence", () => {
  it("restores the exact workout, open exercise and added sets", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const key = workoutUiDraftKey("student-1", "2026-08-14");

    writeWorkoutUiDraft(storage, key, {
      cycleId: "cycle-3",
      workoutId: "workout-c",
      expandedExercise: 4,
      activeView: "treino",
      extraSets: { 4: 1 },
    });

    expect(readWorkoutUiDraft(storage, key)).toEqual({
      cycleId: "cycle-3",
      workoutId: "workout-c",
      expandedExercise: 4,
      activeView: "treino",
      extraSets: { 4: 1 },
      updatedAt: 1234,
    });
  });

  it("keeps the newer local value when the server still has the old set", () => {
    expect(mergeWorkoutDraftLogs(
      {
        set1: { completed: false, weight: 20, revision: 1 },
        set2: { completed: true, weight: 10, revision: 1 },
      },
      { set1: { completed: true, weight: 22, revision: 1, dirty: true } },
    )).toEqual({
      set1: { completed: true, weight: 22, revision: 1, dirty: true },
      set2: { completed: true, weight: 10, revision: 1 },
    });
  });

  it("keeps a newer server revision instead of replaying an old local backup", () => {
    expect(mergeWorkoutDraftLogs(
      { set1: { completed: true, weight: 30, revision: 3, updated_at: "2026-08-14T12:00:00Z" } },
      { set1: { completed: false, weight: 20, revision: 2, dirty: true, client_updated_at: "2026-08-14T13:00:00Z" } },
    )).toEqual({
      set1: { completed: true, weight: 30, revision: 3, updated_at: "2026-08-14T12:00:00Z" },
    });
  });

  it("drops a clean local row that the server deleted", () => {
    expect(mergeWorkoutDraftLogs({}, {
      set1: { id: "old", revision: 2, completed: true, dirty: false },
    })).toEqual({});
  });

  it("replaces an old clean local id with the new server row for the same key", () => {
    expect(mergeWorkoutDraftLogs(
      { set1: { id: "new", revision: 1, weight: 30 } },
      { set1: { id: "old", revision: 9, weight: 20, dirty: false } },
    )).toEqual({ set1: { id: "new", revision: 1, weight: 30 } });
  });

  it("keeps an absent local row only while an edit or tombstone is pending", () => {
    expect(mergeWorkoutDraftLogs({}, {
      dirty: { id: "draft", dirty: true },
      tombstone: { id: "deleted", deleted: true, dirty: true },
      clean: { id: "old", dirty: false },
    })).toEqual({
      dirty: { id: "draft", dirty: true },
      tombstone: { id: "deleted", deleted: true, dirty: true },
    });
  });

  it("reconstructs extra sets per workout, exercise and date with a hard ceiling", () => {
    const logs = [
      { workout_id: "w1", exercise_index: 0, set_number: 5, session_date: "2026-08-14" },
      { workout_id: "w1", exercise_index: 1, set_number: 99, session_date: "2026-08-14" },
      { workout_id: "w1", exercise_index: 0, set_number: 8, session_date: "2026-08-13" },
      { workout_id: "w2", exercise_index: 0, set_number: 8, session_date: "2026-08-14" },
    ];
    expect(inferExtraSetsFromPersistedLogs(logs, "w1", [{ sets: "3" }, { sets: "4" }], "2026-08-14"))
      .toEqual({ 0: 2, 1: 5 });
  });

  it("rebases an edit made during a conflicting request and keeps it dirty for retry", () => {
    const sent = {
      id: "log-1",
      weight: 20,
      completed: true,
      revision: 1,
      client_updated_at: "2026-08-14T12:00:00Z",
      dirty: true,
    };
    const current = {
      ...sent,
      weight: 25,
      client_updated_at: "2026-08-14T12:00:02Z",
    };
    const server = {
      id: "log-1",
      weight: 30,
      completed: true,
      revision: 3,
      updated_at: "2026-08-14T12:00:01Z",
    };

    expect(reconcileWorkoutLogResponse(current, sent, server)).toEqual({
      ...server,
      ...current,
      revision: 3,
      updated_at: "2026-08-14T12:00:01Z",
      dirty: true,
    });
  });

  it("gives an active session precedence over an older draft from another workout", () => {
    expect(resolveWorkoutResumeTarget("workout-active", {
      cycleId: "cycle-old",
      workoutId: "workout-old",
      expandedExercise: 4,
      activeView: "treino",
      extraSets: { 4: 2 },
      updatedAt: 100,
    })).toEqual({
      source: "active_session",
      workoutId: "workout-active",
      cycleId: null,
      expandedExercise: null,
      extraSets: {},
    });
  });

  it("ignores corrupt or incomplete drafts", () => {
    expect(readWorkoutUiDraft({ getItem: () => "{" }, "draft")).toBeNull();
    expect(readWorkoutUiDraft({ getItem: () => JSON.stringify({ cycleId: "cycle" }) }, "draft")).toBeNull();
  });

  it("persists removal and renumbering as CAS tombstones plus clean inserts", () => {
    const logs = {
      "workout-1-0-1": { id: "one", workout_id: "workout-1", exercise_index: 0, set_number: 1, revision: 2, weight: 10 },
      "workout-1-0-4": { id: "four", workout_id: "workout-1", exercise_index: 0, set_number: 4, revision: 4, weight: 20 },
      "workout-1-0-5": { id: "five", workout_id: "workout-1", exercise_index: 0, set_number: 5, revision: 1, weight: 30 },
    };
    const next = removeAndRenumberWorkoutSet(logs, "workout-1", 0, 4, 5, "2026-08-14T12:00:00Z");
    expect(next[workoutLogTombstoneKey("workout-1-0-4")]).toMatchObject({ deleted: true, revision: 4 });
    expect(next[workoutLogTombstoneKey("workout-1-0-5")]).toMatchObject({ deleted: true, revision: 1 });
    expect(next["workout-1-0-4"]).toMatchObject({ set_number: 4, weight: 30, dirty: true, deleted: false });
    expect(next["workout-1-0-4"]).not.toHaveProperty("id");
    expect(next["workout-1-0-4"]).not.toHaveProperty("revision");
  });

  it("keeps a pending delete plus renumber transaction together after reload", () => {
    const server = {
      "workout-1-0-4": { id: "four", workout_id: "workout-1", exercise_index: 0, set_number: 4, revision: 4, weight: 20 },
      "workout-1-0-5": { id: "five", workout_id: "workout-1", exercise_index: 0, set_number: 5, revision: 1, weight: 30 },
    };
    const local = removeAndRenumberWorkoutSet(server, "workout-1", 0, 4, 5, "2026-08-14T12:00:00Z");
    const restored = mergeWorkoutDraftLogs(server, local);

    expect(restored[workoutLogTombstoneKey("workout-1-0-4")]).toMatchObject({ deleted: true, revision: 4 });
    expect(restored[workoutLogTombstoneKey("workout-1-0-5")]).toMatchObject({ deleted: true, revision: 1 });
    expect(restored["workout-1-0-4"]).toMatchObject({ weight: 30, set_number: 4, dirty: true });
  });
});

type TestSet = MutableWorkoutSetLog & { weight: number; completed?: boolean };
const setKey = (set: TestSet) => `${set.workout_id}-${set.exercise_index}-${set.set_number}`;
const fixtureSet = (setNumber: number, overrides: Partial<TestSet> = {}): TestSet => ({
  id: `row-${setNumber}`, workout_id: "workout-1", exercise_index: 0, set_number: setNumber,
  session_date: "2026-09-28", revision: 1, weight: 20,
  client_updated_at: "2026-09-28T12:00:00Z", ...overrides,
});
const removalTime = "2026-09-28T12:00:01Z";

describe("workout deletion during an in-flight save", () => {
  it("rebases the removed predecessor without resurrecting it or identifying its replacement", () => {
    const four = fixtureSet(4, { dirty: true });
    const five = fixtureSet(5, { weight: 30, dirty: true });
    const removed = removeAndRenumberWorkoutSet({ [setKey(four)]: four, [setKey(five)]: five }, "workout-1", 0, 4, 5, removalTime);
    const next = reconcileWorkoutLogBatchResponse(removed, [four, five], [
      { ...four, revision: 2 }, { ...five, revision: 2 },
    ], []);

    expect(next[setKey(five)]).toBeUndefined();
    expect(next[setKey(four)]).toMatchObject({ weight: 30, dirty: true, set_number: 4 });
    expect(next[setKey(four)]).not.toHaveProperty("id");
    expect(next[setKey(four)]).not.toHaveProperty("revision");
    for (const set of [four, five]) {
      expect(next[workoutLogTombstoneKey(setKey(set))]).toMatchObject({
        id: set.id, revision: 2, deleted: true, dirty: true, client_updated_at: removalTime,
      });
    }
  });

  it("does not rebase a tombstone whose predecessor was edited after the sent snapshot", () => {
    const sent = fixtureSet(4, { dirty: true });
    const edited = { ...sent, weight: 35, client_updated_at: "2026-09-28T12:00:00.500Z" };
    const removed = removeAndRenumberWorkoutSet({ [setKey(edited)]: edited }, "workout-1", 0, 4, 4, removalTime);
    const next = reconcileWorkoutLogBatchResponse(removed, [sent], [{ ...sent, revision: 2 }], []);
    expect(next[workoutLogTombstoneKey(setKey(sent))]).toMatchObject({ revision: 1, weight: 35 });
    expect(next[setKey(sent)]).toBeUndefined();
  });

  it("does not adopt another device's revision when the save conflicted", () => {
    const sent = fixtureSet(4, { dirty: true });
    const removed = removeAndRenumberWorkoutSet({ [setKey(sent)]: sent }, "workout-1", 0, 4, 4, removalTime);
    const next = reconcileWorkoutLogBatchResponse(removed, [sent], [], [{ ...sent, revision: 3, weight: 40 }]);
    expect(next[workoutLogTombstoneKey(setKey(sent))].revision).toBe(1);
    expect(next[setKey(sent)]).toBeUndefined();
  });

  it("gives a removed pending insert its acknowledged identity for the subsequent delete", () => {
    const sent = fixtureSet(4, { id: undefined, revision: undefined, dirty: true });
    const removed = removeAndRenumberWorkoutSet({ [setKey(sent)]: sent }, "workout-1", 0, 4, 4, removalTime);
    const next = reconcileWorkoutLogBatchResponse(removed, [sent], [{ ...sent, id: "inserted", revision: 1 }], []);
    expect(next[workoutLogTombstoneKey(setKey(sent))]).toMatchObject({ id: "inserted", revision: 1, deleted: true });
    expect(next[setKey(sent)]).toBeUndefined();
  });

  it("keeps a newer deletion when an older deletion is acknowledged", () => {
    const original = fixtureSet(4);
    const first = removeAndRenumberWorkoutSet({ [setKey(original)]: original }, "workout-1", 0, 4, 4, removalTime);
    const tombstoneKey = workoutLogTombstoneKey(setKey(original));
    const newer = { ...first, [tombstoneKey]: { ...first[tombstoneKey], client_updated_at: "2026-09-28T12:00:02Z" } };
    const next = reconcileWorkoutLogBatchResponse(newer, Object.values(first), [{ ...original, deleted: true }], []);
    expect(next[tombstoneKey]).toEqual(newer[tombstoneKey]);
    expect(reconcileWorkoutLogBatchResponse(first, Object.values(first), [{ ...original, deleted: true }], [])).toEqual({});
  });

  it("ignores yesterday's response after a new day's edit creates a fresh identity", () => {
    const sent = fixtureSet(1, { session_date: "2026-09-27" });
    const current = fixtureSet(1, { id: undefined, revision: undefined, weight: 35, dirty: true });
    const next = reconcileWorkoutLogBatchResponse({ [setKey(current)]: current }, [sent], [{ ...sent, revision: 2 }], []);
    expect(next[setKey(current)]).toEqual(current);
  });

  it("keeps a server_missing conflict pending and resets its stale identity without adopting pseudo-server values", () => {
    const sent = fixtureSet(1, { dirty: true });
    const current = { ...sent, weight: 35, client_updated_at: removalTime };
    const next = reconcileWorkoutLogBatchResponse({ [setKey(current)]: current }, [sent], [], [
      { ...sent, id: undefined, revision: undefined, weight: 20, server_missing: true },
    ]);
    expect(next[setKey(current)]).toMatchObject({ weight: 35, dirty: true, client_updated_at: removalTime });
    expect(next[setKey(current)]).not.toHaveProperty("id");
    expect(next[setKey(current)]).not.toHaveProperty("revision");
    expect(next[setKey(current)].server_missing).toBe(true);
    const confirmed = reconcileWorkoutLogBatchResponse(next, Object.values(next), [fixtureSet(1, { id: "new-row", weight: 35 })], []);
    expect(confirmed[setKey(current)]).toMatchObject({ id: "new-row", weight: 35, dirty: false });
    expect(confirmed[setKey(current)]).not.toHaveProperty("server_missing");
  });
});

describe("manual confirmation of a missing server row", () => {
  it("clears the missing marker on the shifted insert only after its own predecessor is acknowledged", () => {
    const first = fixtureSet(1, { id: undefined, revision: undefined, dirty: true, server_missing: true });
    const second = fixtureSet(2, { id: undefined, revision: undefined, dirty: true, server_missing: true, weight: 35 });
    const removed = removeAndRenumberWorkoutSet({ [setKey(first)]: first, [setKey(second)]: second }, "workout-1", 0, 1, 2, removalTime);
    const acknowledgedFirst = fixtureSet(1, { id: "confirmed-first" });
    const acknowledgedSecond = fixtureSet(2, { id: "confirmed-second", weight: 35 });
    const partial = reconcileWorkoutLogBatchResponse(removed, [first, second], [acknowledgedFirst], []);
    expect(partial[setKey(first)].server_missing).toBe(true);
    const next = reconcileWorkoutLogBatchResponse(removed, [first, second], [acknowledgedFirst, acknowledgedSecond], []);
    expect(next[setKey(first)]).toMatchObject({ weight: 35, dirty: true, deleted: false });
    expect(next[setKey(first)]).not.toHaveProperty("id");
    expect(next[setKey(first)]).not.toHaveProperty("revision");
    expect(next[setKey(first)]).not.toHaveProperty("server_missing");
    for (const set of [first, second]) expect(next[workoutLogTombstoneKey(setKey(set))]).not.toHaveProperty("server_missing");
  });

  it("allows deletion after a missing row is removed during its acknowledged manual insert", () => {
    const sent = fixtureSet(1, { id: undefined, revision: undefined, dirty: true, server_missing: true });
    const removed = removeAndRenumberWorkoutSet({ [setKey(sent)]: sent }, "workout-1", 0, 1, 1, removalTime);
    const server = fixtureSet(1, { id: "confirmed-row", revision: 1 });
    const next = reconcileWorkoutLogBatchResponse(removed, [sent], [server], []);
    const tombstone = next[workoutLogTombstoneKey(setKey(sent))];
    expect(tombstone).toMatchObject({ id: "confirmed-row", revision: 1, dirty: true, deleted: true });
    expect(tombstone).not.toHaveProperty("server_missing");
    expect(next[setKey(sent)]).toBeUndefined();
  });

  it("clears the confirmation flag while preserving an edit made during the acknowledged insert", () => {
    const sent = fixtureSet(1, { id: undefined, revision: undefined, dirty: true, server_missing: true });
    const current = { ...sent, weight: 45, client_updated_at: removalTime };
    const server = fixtureSet(1, { id: "confirmed-row", revision: 1, weight: 20 });
    const next = reconcileWorkoutLogBatchResponse({ [setKey(current)]: current }, [sent], [server], []);
    expect(next[setKey(current)]).toMatchObject({
      id: "confirmed-row", revision: 1, weight: 45, dirty: true, client_updated_at: removalTime,
    });
    expect(next[setKey(current)]).not.toHaveProperty("server_missing");
  });
});

describe("selective recovery of a conflicted deletion", () => {
  it("drops the rejected transaction before backup/reload and preserves unrelated pending work", () => {
    const four = fixtureSet(4);
    const five = fixtureSet(5, { weight: 30 });
    const local = removeAndRenumberWorkoutSet({ [setKey(four)]: four, [setKey(five)]: five }, "workout-1", 0, 4, 5, removalTime);
    const one = fixtureSet(1, { dirty: true, weight: 42 });
    const other = fixtureSet(1, { workout_id: "workout-2", dirty: true });
    const independent = fixtureSet(4, { exercise_index: 1 });
    const independentDelete = removeAndRenumberWorkoutSet({ [setKey(independent)]: independent }, "workout-1", 1, 4, 4, removalTime);
    const logs = { ...local, ...independentDelete, [setKey(one)]: one, [setKey(other)]: other };
    const next = discardConflictedWorkoutLogDeletions(logs, Object.values(logs), [{ ...four, revision: 2, requested_deleted: true }]);
    expect(next).toEqual({ ...independentDelete, [setKey(one)]: one, [setKey(other)]: other });
    const backup = JSON.parse(JSON.stringify(next));
    const reloaded = mergeWorkoutDraftLogs({ [setKey(four)]: { ...four, revision: 2 }, [setKey(five)]: five }, backup);
    expect(reloaded[setKey(four)]).toMatchObject({ id: four.id, revision: 2, weight: 20 });
    expect(reloaded[workoutLogTombstoneKey(setKey(four))]).toBeUndefined();
    expect(reloaded[setKey(one)]).toEqual(one);
    expect(reloaded[setKey(other)]).toEqual(other);
  });

  it("discards later edits on a shifted insert even when the destination had no predecessor", () => {
    const five = fixtureSet(5);
    const local = removeAndRenumberWorkoutSet({ [setKey(five)]: five }, "workout-1", 0, 4, 5, removalTime);
    const replacementKey = "workout-1-0-4";
    const edited = { ...local, [replacementKey]: { ...local[replacementKey], weight: 50, client_updated_at: "2026-09-28T12:00:02Z" } };
    expect(discardConflictedWorkoutLogDeletions(edited, Object.values(local), [{ ...five, revision: 2, requested_deleted: true }])).toEqual({});
  });

  it("preserves a new deletion transaction created while the rejected request was in flight", () => {
    const four = fixtureSet(4);
    const local = removeAndRenumberWorkoutSet({ [setKey(four)]: four }, "workout-1", 0, 4, 4, removalTime);
    const newer = removeAndRenumberWorkoutSet({ [setKey(four)]: { ...four, revision: 2 } }, "workout-1", 0, 4, 4, "2026-09-28T12:00:02Z");
    expect(discardConflictedWorkoutLogDeletions(newer, Object.values(local), [{ ...four, revision: 2, requested_deleted: true }])).toEqual(newer);
  });
});
