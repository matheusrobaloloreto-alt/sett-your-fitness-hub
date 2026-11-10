import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkoutSession } from "./useWorkoutSession";

const mocks = vi.hoisted(() => ({
  updateResult: { data: null, error: new Error("offline") } as { data: { id: string } | null; error: Error | null },
  updateResults: [] as Array<{ data: { id: string } | null; error: Error | null }>,
  confirmationResult: { data: null, error: null } as { data: Record<string, unknown> | null; error: Error | null },
  updateFilters: [] as Array<[string, string]>,
  confirmationFilters: [] as Array<[string,string]>,
  readback: vi.fn(),
  reconciliationRead: vi.fn(),
  discoveryRead: vi.fn(),
  selectedColumns: null as string | null,
  startRpc: vi.fn().mockResolvedValue({data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',started_at:new Date().toISOString(),status:'in_progress'},error:null}),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const updateQuery = {
        eq: (column: string, value: string) => {
          mocks.updateFilters.push([column, value]);
          return updateQuery;
        },
        select: (columns: string) => {
          mocks.selectedColumns = columns;
          return { maybeSingle: async () => mocks.updateResults.shift() ?? mocks.updateResult };
        },
      };
      const confirmationQuery = {
        eq: (column:string,value:string) => {mocks.confirmationFilters.push([column,value]);return confirmationQuery;},
        maybeSingle: async () => mocks.readback() ?? mocks.confirmationResult,
      };
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "session-1" }, error: null }),
          }),
        }),
        update: () => updateQuery,
        select: (columns: string) => {
          if (columns === "id,student_id,company_id,workout_id,started_at,status,session_date") {
            const filters: Array<[string, string]> = [];
            const query = {
              eq: (column: string, value: string) => { filters.push([column, value]); return query; },
              limit: async (limit: number) => mocks.discoveryRead({ table, filters, limit }),
            };
            return query;
          }
          if (columns !== "id,status,session_date") return confirmationQuery;
          const query = { eq: () => query, maybeSingle: async () => mocks.reconciliationRead() };
          return query;
        },
      };
    },
    rpc: (name:string,args:unknown)=>name==='start_workout_session'?mocks.startRpc(name,args):mocks.rpc(name,args),
  },
}));

describe("useWorkoutSession", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    mocks.startRpc.mockReset().mockResolvedValue({data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',started_at:new Date().toISOString(),status:'in_progress'},error:null});
    mocks.updateResult = { data: null, error: new Error("offline") };
    mocks.updateResults = [];
    mocks.discoveryRead.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.reconciliationRead.mockReset().mockReturnValue({ data: null, error: null });
    mocks.confirmationResult = { data: null, error: null };
    mocks.updateFilters = [];
    mocks.confirmationFilters = [];
    mocks.readback.mockReset();
    mocks.selectedColumns = null;
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const activeKey = "sett_active_session_student-1";
  const pendingKey = "sett_session_start_company-1_student-1";
  const discoverOptions = { discoverRemote: true };
  const remoteRow = {
    id: "session-remote", student_id: "student-1", company_id: "company-1",
    workout_id: "workout-remote", status: "in_progress",
    started_at: "2026-11-08T23:55:00.000Z", session_date: "2026-11-08",
  };

  it("recovers the original date of a legacy session once the device reconnects", async () => {
    const saved = {
      id: remoteRow.id, workoutId: remoteRow.workout_id, companyId: remoteRow.company_id,
      startedAt: Date.parse(remoteRow.started_at), elapsedSeconds: 0,
    };
    localStorage.setItem(activeKey, JSON.stringify(saved));
    mocks.reconciliationRead.mockReturnValue({ data: null, error: new Error("offline") });
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));

    await waitFor(() => expect(mocks.reconciliationRead).toHaveBeenCalled());
    expect(result.current.activeSession).toEqual(saved);
    mocks.reconciliationRead.mockReturnValue({ data: remoteRow, error: null });
    window.dispatchEvent(new Event("online"));

    const recovered = { ...saved, sessionDate: remoteRow.session_date };
    await waitFor(() => expect(result.current.activeSession).toEqual(recovered));
    expect(JSON.parse(localStorage.getItem(activeKey)!)).toEqual(recovered);
    expect(result.current.isRemoteSession).toBe(false);
    expect(mocks.startRpc).not.toHaveBeenCalled();
    expect(mocks.updateFilters).toEqual([]);
  });

  it("recovers the confirmed date even when the device cannot update its cache", async () => {
    const saved = {
      id: remoteRow.id, workoutId: remoteRow.workout_id, companyId: remoteRow.company_id,
      startedAt: Date.parse(remoteRow.started_at), elapsedSeconds: 0,
    };
    localStorage.setItem(activeKey, JSON.stringify(saved));
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    mocks.reconciliationRead.mockReturnValue({ data: remoteRow, error: null });

    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));

    await waitFor(() => expect(result.current.activeSession?.sessionDate).toBe(remoteRow.session_date));
    expect(JSON.parse(localStorage.getItem(activeKey)!)).toEqual(saved);
    expect(mocks.updateFilters).toEqual([]);
  });

  it.each([
    { id: "another-session", session_date: remoteRow.session_date },
    { id: remoteRow.id, session_date: "2026-11-31" },
  ])("does not restore an unrelated or invalid session date from %j", async (override) => {
    const stored = JSON.stringify({
      id: remoteRow.id, workoutId: remoteRow.workout_id, companyId: remoteRow.company_id,
      startedAt: Date.parse(remoteRow.started_at), elapsedSeconds: 0,
    });
    localStorage.setItem(activeKey, stored);
    mocks.reconciliationRead.mockReturnValue({ data: { ...remoteRow, ...override }, error: null });

    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));

    await act(async () => {});
    expect(mocks.reconciliationRead).toHaveBeenCalled();
    expect(result.current.activeSession?.sessionDate).toBeUndefined();
    expect(localStorage.getItem(activeKey)).toBe(stored);
  });

  it("does not overwrite a different stored session when a legacy lookup arrives late", async () => {
    const saved = {
      id: remoteRow.id, workoutId: remoteRow.workout_id, companyId: remoteRow.company_id,
      startedAt: Date.parse(remoteRow.started_at), elapsedSeconds: 0,
    };
    localStorage.setItem(activeKey, JSON.stringify(saved));
    let resolveRead!: (result: { data: typeof remoteRow; error: null }) => void;
    mocks.reconciliationRead.mockReturnValue(new Promise(resolve => { resolveRead = resolve; }));
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    await waitFor(() => expect(mocks.reconciliationRead).toHaveBeenCalled());

    const other = JSON.stringify({ ...saved, id: "another-session" });
    localStorage.setItem(activeKey, other);
    await act(async () => { resolveRead({ data: remoteRow, error: null }); });

    expect(localStorage.getItem(activeKey)).toBe(other);
    expect(result.current.activeSession).toEqual(saved);
  });

  it("discovers a scoped active session on a fresh device without starting it", async () => {
    const pending = JSON.stringify({ requestId: "uncertain-request", workoutId: "workout-remote" });
    localStorage.setItem(pendingKey, pending);
    mocks.discoveryRead.mockResolvedValue({ data: [remoteRow], error: null });
    const { result, unmount } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));

    await waitFor(() => expect(result.current.activeSession?.id).toBe("session-remote"));
    expect(result.current.activeSession).toMatchObject({
      workoutId: "workout-remote", companyId: "company-1", sessionDate: "2026-11-08",
    });
    expect(result.current.isRemoteSession).toBe(true);
    expect(mocks.discoveryRead).toHaveBeenCalledWith({
      table: "workout_sessions",
      filters: [["student_id", "student-1"], ["company_id", "company-1"], ["status", "in_progress"]],
      limit: 2,
    });
    expect(JSON.parse(localStorage.getItem(activeKey)!)).toMatchObject({ id: "session-remote", sessionDate: "2026-11-08" });
    expect(localStorage.getItem(pendingKey)).toBe(pending);
    expect(mocks.startRpc).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.updateFilters).toEqual([]);

    unmount();
    const restored = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    expect(restored.result.current.activeSession?.id).toBe("session-remote");
    expect(restored.result.current.isRemoteSession).toBe(false);
  });

  it("discovers the other workout after a definite start conflict without a second start", async () => {
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    await waitFor(() => expect(mocks.discoveryRead).toHaveBeenCalledOnce());
    mocks.startRpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "session_already_in_progress" } });
    mocks.discoveryRead.mockResolvedValue({ data: [remoteRow], error: null });

    await act(async () => {
      expect(await result.current.startSession("workout-1")).toEqual({ ok: false, reason: "conflict" });
    });
    expect(result.current.activeSession?.id).toBe("session-remote");
    expect(result.current.isRemoteSession).toBe(true);
    expect(localStorage.getItem(pendingKey)).toBeNull();
    await act(async () => {
      expect(await result.current.startSession("workout-1")).toEqual({ ok: false, reason: "conflict" });
    });
    expect(mocks.startRpc).toHaveBeenCalledOnce();
    expect(mocks.updateFilters).toEqual([]);
  });

  it.each([
    ["zero rows", { data: [], error: null }],
    ["a read error", { data: [remoteRow], error: new Error("offline") }],
    ["multiple rows", { data: [remoteRow, { ...remoteRow, id: "other" }], error: null }],
    ["an invalid start timestamp", { data: [{ ...remoteRow, started_at: "invalid" }], error: null }],
    ["a non-active row", { data: [{ ...remoteRow, status: "completed" }], error: null }],
    ["another student's row", { data: [{ ...remoteRow, student_id: "student-2" }], error: null }],
    ["another company's row", { data: [{ ...remoteRow, company_id: "company-2" }], error: null }],
  ])("does not adopt a session after %s", async (_reason, response) => {
    mocks.discoveryRead.mockResolvedValue(response);
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    await waitFor(() => expect(mocks.discoveryRead).toHaveBeenCalledOnce());
    expect(result.current.activeSession).toBeNull();
    expect(result.current.isRemoteSession).toBe(false);
    expect(localStorage.getItem(activeKey)).toBeNull();
    expect(mocks.startRpc).not.toHaveBeenCalled();
  });

  it.each(["focus", "visibilitychange"])("discovers a new session when returning via %s", async (event) => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
      await waitFor(() => expect(mocks.discoveryRead).toHaveBeenCalledOnce());
      mocks.discoveryRead.mockResolvedValue({ data: [remoteRow], error: null });
      await act(async () => {
        (event === "focus" ? window : document).dispatchEvent(new Event(event));
      });
      expect(result.current.activeSession?.id).toBe("session-remote");
    } finally {
      visibility.mockRestore();
    }
  });

  it("keeps a restored local session when its terminal read fails", async () => {
    const stored = JSON.stringify({ id: "local-session", workoutId: "workout-1", companyId: "company-1", startedAt: 1 });
    localStorage.setItem(activeKey, stored);
    mocks.reconciliationRead.mockReturnValue({ data: null, error: new Error("offline") });
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    await waitFor(() => expect(mocks.reconciliationRead).toHaveBeenCalled());
    expect(result.current.activeSession?.id).toBe("local-session");
    expect(localStorage.getItem(activeKey)).toBe(stored);
    expect(mocks.discoveryRead).not.toHaveBeenCalled();
  });

  it("discovers a successor after the server confirms that the local session ended", async () => {
    localStorage.setItem(activeKey, JSON.stringify({
      id: "local-session", workoutId: "workout-1", companyId: "company-1", startedAt: 1,
    }));
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    expect(result.current.activeSession?.id).toBe("local-session");
    mocks.reconciliationRead.mockResolvedValue({ data: { id: "local-session", status: "completed" }, error: null });
    mocks.discoveryRead.mockResolvedValue({ data: [remoteRow], error: null });

    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(result.current.activeSession?.id).toBe("session-remote");
    expect(JSON.parse(localStorage.getItem(activeKey)!)).toMatchObject({ id: "session-remote" });
    expect(mocks.updateFilters).toEqual([]);
    expect(mocks.startRpc).not.toHaveBeenCalled();
  });

  it("does not overwrite storage changed by another tab during discovery", async () => {
    let resolveRead!: (response: unknown) => void;
    mocks.discoveryRead.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    await waitFor(() => expect(mocks.discoveryRead).toHaveBeenCalledOnce());
    const otherTab = JSON.stringify({ id: "other-tab", workoutId: "workout-1", companyId: "company-1", startedAt: 1 });
    localStorage.setItem(activeKey, otherTab);

    await act(async () => { resolveRead({ data: [remoteRow], error: null }); });
    expect(localStorage.getItem(activeKey)).toBe(otherTab);
    expect(result.current.activeSession).toBeNull();
  });

  it("ignores a discovery response from a previous student scope", async () => {
    let resolveRead!: (response: unknown) => void;
    mocks.discoveryRead.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    const { result, rerender } = renderHook(
      ({ student }) => useWorkoutSession(student, "company-1", discoverOptions),
      { initialProps: { student: "student-1" } },
    );
    await waitFor(() => expect(mocks.discoveryRead).toHaveBeenCalledOnce());
    rerender({ student: "student-2" });
    await act(async () => { resolveRead({ data: [remoteRow], error: null }); });
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem(activeKey)).toBeNull();
  });

  it("does not resurrect an in-flight discovery after a local start and finish", async () => {
    let resolveRead!: (response: unknown) => void;
    mocks.discoveryRead.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    mocks.updateResult = { data: { id: "session-1" }, error: null };
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1", discoverOptions));
    await waitFor(() => expect(mocks.discoveryRead).toHaveBeenCalledOnce());
    await act(async () => { await result.current.startSession("workout-1"); });
    await act(async () => { await result.current.finishSession({}, [], {}); });
    await act(async () => { resolveRead({ data: [remoteRow], error: null }); });
    expect(result.current.summary?.id).toBe("session-1");
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem(activeKey)).toBeNull();
  });

  it.each([["2026-11-08", "2026-11-08"], ["2026-02-30", undefined], ["2026-11-08T00:00:00Z", undefined]])(
    "exposes only a valid date-only session_date from start (%s)",
    async (session_date, sessionDate) => {
      mocks.startRpc.mockResolvedValueOnce({
        data: { ...remoteRow, id: "session-1", workout_id: "workout-1", session_date }, error: null,
      });
      const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
      await act(async () => { await result.current.startSession("workout-1"); });
      expect(result.current.activeSession?.sessionDate).toBe(sessionDate);
      expect(result.current.isRemoteSession).toBe(false);
      expect(mocks.discoveryRead).not.toHaveBeenCalled();
    },
  );

  it("clears the old timer only after the server confirms the exact duplicate", async () => {
    const key = "sett_active_session_student-1";
    localStorage.setItem(key, JSON.stringify({
      id: "old-session", workoutId: "workout-1", companyId: "company-1", startedAt: 1,
    }));
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.activeSession?.id).toBe("old-session"));
    mocks.reconciliationRead.mockReturnValue({ data: { id: "old-session", status: "reconciled" }, error: null });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(mocks.updateFilters).toEqual([]);
  });

  it('releases a definitively refused intent but reuses an intent with unknown outcome', async () => {
    const { result } = renderHook(() => useWorkoutSession('student-1', 'company-1'));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    mocks.startRpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'session_legacy_ambiguous' } });
    await act(async () => {
      expect(await result.current.startSession('legacy-workout')).toEqual({ ok: false, reason: 'duplicate_open_sessions' });
    });
    expect(localStorage.getItem('sett_session_start_company-1_student-1')).toBeNull();
    mocks.startRpc.mockResolvedValueOnce({ data: null, error: new Error('conexão perdida') });
    await act(async () => { await result.current.startSession('workout-1'); });
    const pending = JSON.parse(localStorage.getItem('sett_session_start_company-1_student-1')!);
    await act(async () => { await result.current.startSession('workout-1'); });
    expect(mocks.startRpc.mock.lastCall?.[1]).toMatchObject({ _workout_id: 'workout-1', _request_id: pending.requestId });
    expect(result.current.activeSession?.id).toBe('session-1');
  });

  it("keeps the active session locally when the guarded completion updates zero rows", async () => {
    mocks.updateResult = { data: null, error: null };
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.startSession("workout-1");
    });
    expect(result.current.activeSession?.id).toBe("session-1");
    expect(localStorage.getItem("sett_active_session_student-1")).not.toBeNull();

    let summary: Awaited<ReturnType<typeof result.current.finishSession>> = null;
    await act(async () => {
      summary = await result.current.finishSession({}, [], {});
    });

    expect(summary).toBeNull();
    expect(result.current.activeSession?.id).toBe("session-1");
    expect(localStorage.getItem("sett_active_session_student-1")).not.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the active session locally when completion returns a different session id", async () => {
    mocks.updateResult = { data: { id: "session-other" }, error: null };
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.startSession("workout-1");
    });

    let summary: Awaited<ReturnType<typeof result.current.finishSession>> = null;
    await act(async () => {
      summary = await result.current.finishSession({}, [], {});
    });

    expect(summary).toBeNull();
    expect(result.current.activeSession?.id).toBe("session-1");
    expect(localStorage.getItem("sett_active_session_student-1")).not.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("finishes only when the guarded update returns the active session id", async () => {
    mocks.updateResult = { data: { id: "session-1" }, error: null };
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.startSession("workout-1");
    });

    let summary: Awaited<ReturnType<typeof result.current.finishSession>> = null;
    await act(async () => {
      summary = await result.current.finishSession({}, [], {});
    });

    expect(summary?.id).toBe("session-1");
    expect(mocks.updateFilters).toEqual([
      ["id", "session-1"],
      ["student_id", "student-1"],
      ["company_id", "company-1"],
      ["status", "in_progress"],
    ]);
    expect(mocks.selectedColumns).toBe("id");
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem("sett_active_session_student-1")).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("retries a transient completion failure and clears the timer after server confirmation", async () => {
    mocks.updateResults = [
      { data: null, error: new Error("timeout") },
      { data: { id: "session-1" }, error: null },
    ];
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.startSession("workout-1");
    });

    let summary: Awaited<ReturnType<typeof result.current.finishSession>> = null;
    await act(async () => {
      summary = await result.current.finishSession({}, [], {});
    });

    expect(summary?.id).toBe("session-1");
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem("sett_active_session_student-1")).toBeNull();
  });

  it("stops a confirmed session without waiting for a stalled XP request", async () => {
    mocks.updateResult = { data: { id: "session-1" }, error: null };
    let releaseXp!: () => void;
    mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => {
      releaseXp = () => resolve({ data: null, error: null });
    }));
    const { result, unmount } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => { await result.current.startSession("workout-1"); });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await act(async () => {
        await Promise.race([
          result.current.finishSession({'workout-1-0-1':{workout_id:'workout-1',exercise_index:0,set_number:1,weight:20,reps_done:10,completed:true}},[{exercise_name:'Teste',muscle_group:'Pernas',sets:'1'}],{}),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Completion waited for XP")), 1000);
          }),
        ]);
      });
      expect(result.current.activeSession).toBeNull();
      expect(result.current.elapsed).toBe(0);
      expect(localStorage.getItem("sett_active_session_student-1")).toBeNull();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeout(timeout);
      await act(async () => { releaseXp(); });
      unmount();
    }
  });
  it("counts only explicitly confirmed sets, including extras, without upgrading legacy false or missing", async () => {
    mocks.updateResult = { data: { id: "session-1" }, error: null };
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await act(async () => { await result.current.startSession("workout-1"); });
    const log=(set_number:number,completed?:boolean)=>({workout_id:'workout-1',exercise_index:0,set_number,weight:20,reps_done:10,completed});
    let summary: Awaited<ReturnType<typeof result.current.finishSession>> = null;
    await act(async () => {summary=await result.current.finishSession({'workout-1-0-1':log(1,false),'workout-1-0-2':log(2,true),'workout-1-0-3':log(3),'workout-1-0-4':log(4,true)},[{exercise_name:'Teste',muscle_group:'Pernas',sets:'3'}],{});});
    expect(summary?.totalVolume).toBe(400);
    expect(summary?.totalSetsCompleted).toBe(2);
    expect(summary?.exercisesSummary[0].sets).toHaveLength(2);
  });
  it.each([new Error('offline'),null])("preserves resumption when abandonment has no acknowledged expected row (%s)", async error=>{
    mocks.updateResult={data:null,error};
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await act(async () => { await result.current.startSession("workout-1"); });
    await act(async () => { await result.current.abandonSession(); });
    expect(result.current.activeSession?.id).toBe('session-1');
    expect(localStorage.getItem('sett_active_session_student-1')).not.toBeNull();
  });

  it('does not award workout points for unconfirmed legacy/default-false sets',async()=>{
    mocks.updateResult={data:{id:'session-1'},error:null};
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    await act(async()=>{await result.current.finishSession({'workout-1-0-1':{workout_id:'workout-1',exercise_index:0,set_number:1,weight:100,reps_done:10,completed:false}},[{exercise_name:'Teste',muscle_group:'Pernas',sets:'1'}],{});});
    expect(result.current.summary).toMatchObject({totalVolume:0,totalSetsCompleted:0});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('blocks a second start synchronously before React rerenders',async()=>{
    let release!:(value:unknown)=>void;
    mocks.startRpc.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    let first!:ReturnType<typeof result.current.startSession>;
    await act(async()=>{
      first=result.current.startSession('workout-1');
      expect(await result.current.startSession('workout-1')).toEqual({ok:false,reason:'busy'});
      release({data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',status:'in_progress',started_at:new Date().toISOString()},error:null});
      expect(await first).toMatchObject({ok:true});
    });
    expect(mocks.startRpc).toHaveBeenCalledOnce();
  });
  it('retains the persistent start request after timeout and reuses it after remount',async()=>{
    mocks.startRpc.mockResolvedValueOnce({data:null,error:new Error('timeout after commit')});
    const first=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{expect(await first.result.current.startSession('workout-1')).toEqual({ok:false,reason:'unavailable'});});
    const request=mocks.startRpc.mock.calls[0][1]._request_id;
    first.unmount();
    const second=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{expect(await second.result.current.startSession('workout-1')).toMatchObject({ok:true});});
    expect(mocks.startRpc.mock.calls[1][1]._request_id).toBe(request);
    expect(localStorage.getItem('sett_session_start_company-1_student-1')).toBeNull();
  });
  it('preserves resume state when abandonment ACK names another row, and succeeds on expected ACK',async()=>{
    mocks.updateResult={data:{id:'other'},error:null};
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    await act(async()=>{expect(await result.current.abandonSession()).toEqual({ok:false,reason:'conflict'});});
    expect(result.current.activeSession?.id).toBe('session-1');
    mocks.updateResult={data:{id:'session-1'},error:null};
    await act(async()=>{expect(await result.current.abandonSession()).toEqual({ok:true,value:{id:'session-1'}});});
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem('sett_active_session_student-1')).toBeNull();
    expect(mocks.updateFilters).toContainEqual(['status','in_progress']);
    expect(mocks.updateFilters).toContainEqual(['company_id','company-1']);
  });
  it('shares the synchronous guard between completion and abandonment',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:{id:'session-1'},error:null};
    await act(async()=>{
      const finishing=result.current.finishSession({},[],{});
      expect(await result.current.abandonSession()).toEqual({ok:false,reason:'busy'});
      expect((await finishing)?.id).toBe('session-1');
    });
  });
  it('surfaces explicit completion failures and releases the guard for retry',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:null,error:null};
    await act(async()=>{expect(await result.current.finishSessionResult({},[],{})).toEqual({ok:false,reason:'conflict'});});
    mocks.updateResult={data:{id:'session-1'},error:null};
    await act(async()=>{expect(await result.current.finishSessionResult({},[],{})).toMatchObject({ok:true,value:{id:'session-1'}});});
  });

  it('uses the persisted summary after a lost ACK instead of recalculating history from the current draft',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:null,error:new Error('ACK lost')};
    mocks.confirmationResult={data:{id:'session-1',workout_id:'workout-1',status:'completed',completed_at:'2026-01-01T00:00:00Z',duration_seconds:42,total_volume:123,total_sets_completed:7,total_sets_prescribed:8,exercises_summary:[]},error:null};
    await act(async()=>{expect(await result.current.finishSession({},[],{})).toMatchObject({totalVolume:123,totalSetsCompleted:7,durationSeconds:42,completedAt:'2026-01-01T00:00:00Z'});});
  });
  it('preserves resumption and releases the latch when abandonment throws offline',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    const failure={get data():{id:string}|null{throw new Error('offline');},error:null};
    mocks.updateResult=failure;
    await act(async()=>{expect(await result.current.abandonSession()).toEqual({ok:false,reason:'unavailable'});});
    expect(result.current.activeSession?.id).toBe('session-1');
    mocks.updateResult={data:{id:'session-1'},error:null};
    await act(async()=>{expect(await result.current.abandonSession()).toMatchObject({ok:true});});
  });
  it('does not install a late start ACK into another student context',async()=>{
    let release!:(value:unknown)=>void;
    mocks.startRpc.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const {result,rerender}=renderHook(({student})=>useWorkoutSession(student,'company-1'),{initialProps:{student:'student-1'}});
    let pending!:ReturnType<typeof result.current.startSession>;
    act(()=>{pending=result.current.startSession('workout-1');});
    rerender({student:'student-2'});
    await act(async()=>{release({data:{id:'session-1',workout_id:'workout-1',student_id:'student-1',company_id:'company-1',status:'in_progress',started_at:new Date().toISOString()},error:null});expect(await pending).toEqual({ok:false,reason:'context'});});
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem('sett_active_session_student-2')).toBeNull();
  });

  it('does not erase a newer session from another tab after a delayed abandonment ACK',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    const newer={id:'session-new',workoutId:'workout-1',companyId:'company-1',startedAt:Date.now(),elapsedSeconds:0};
    const response={get data(){localStorage.setItem('sett_active_session_student-1',JSON.stringify(newer));window.dispatchEvent(new StorageEvent('storage',{key:'sett_active_session_student-1',newValue:JSON.stringify(newer)}));return {id:'session-1'};},error:null};
    mocks.updateResult=response;
    await act(async()=>{expect(await result.current.abandonSession()).toMatchObject({ok:true});});
    expect(JSON.parse(localStorage.getItem('sett_active_session_student-1')!).id).toBe('session-new');
    expect(result.current.activeSession?.id).toBe('session-new');
  });

  it.each(['finishSession','finishSessionResult'] as const)('forwards uncertain history through %s without announcing a PR',async method=>{
    mocks.updateResult={data:{id:'session-1'},error:null};
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    await act(async()=>{
      const response=await result.current[method]({'workout-1-0-1':{workout_id:'workout-1',exercise_index:0,set_number:1,weight:20,reps_done:10,completed:true}},[{exercise_name:'Teste',muscle_group:'Pernas',sets:'1'}],{'ex-0':15},new Set([0]));
      const summary=response && ('ok' in response ? (response.ok ? response.value : null) : response);
      expect(summary?.exercisesSummary[0]).toMatchObject({maxWeight:20,isPR:false,volume:200});
    });
    expect(result.current.summary?.exercisesSummary[0].isPR).toBe(false);
  });

  it.each(['error','zeroRows','throw'] as const)('reconciles abandoned after %s without another terminal write',async failure=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult=failure==='throw' ? {get data():{id:string}|null{throw new Error('ACK lost');},error:null} : {data:null,error:failure==='error'?new Error('ACK lost'):null};
    mocks.confirmationResult={data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',status:'abandoned'},error:null};
    await act(async()=>{expect(await result.current.abandonSession()).toEqual({ok:true,value:{id:'session-1'}});});
    expect(result.current.activeSession).toBeNull();
    expect(result.current.elapsed).toBe(0);
    expect(localStorage.getItem('sett_active_session_student-1')).toBeNull();
    expect(mocks.updateFilters.filter(([column])=>column==='status')).toHaveLength(1);
    expect(mocks.readback).toHaveBeenCalledOnce();
    expect(mocks.confirmationFilters).toEqual([['id','session-1'],['student_id','student-1'],['company_id','company-1'],['workout_id','workout-1']]);
  });
  it.each([
    {status:'completed'},
    {id:'another-session'},
    {student_id:'another-student'},
    {company_id:'another-company'},
    {workout_id:'another-workout'},
  ])('rejects abandonment readback with a conflicting state or identity: %j',async patch=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:null,error:null};
    mocks.confirmationResult={data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',status:'abandoned',...patch},error:null};
    await act(async()=>{expect(await result.current.abandonSession()).toEqual({ok:false,reason:'conflict'});});
    expect(mocks.readback).toHaveBeenCalledOnce();
    expect(result.current.activeSession?.id).toBe('session-1');
    expect(localStorage.getItem('sett_active_session_student-1')).not.toBeNull();
  });
  it('preserves resumption when both abandonment and readback are offline',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:null,error:new Error('offline')};
    mocks.confirmationResult={data:null,error:new Error('offline')};
    await act(async()=>{expect(await result.current.abandonSession()).toEqual({ok:false,reason:'unavailable'});});
    expect(mocks.readback).toHaveBeenCalledOnce();
    expect(result.current.activeSession?.id).toBe('session-1');
    expect(localStorage.getItem('sett_active_session_student-1')).not.toBeNull();
  });

  it('keeps a newer tab session when delayed abandoned readback confirms the previous session',async()=>{
    const {result}=renderHook(()=>useWorkoutSession('student-1','company-1'));
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:null,error:new Error('ACK lost')};
    const newer={id:'newer-session',workoutId:'workout-1',companyId:'company-1',startedAt:Date.now(),elapsedSeconds:0};
    mocks.readback.mockImplementationOnce(()=>{
      localStorage.setItem('sett_active_session_student-1',JSON.stringify(newer));
      window.dispatchEvent(new StorageEvent('storage',{key:'sett_active_session_student-1',newValue:JSON.stringify(newer)}));
    });
    mocks.confirmationResult={data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',status:'abandoned'},error:null};
    await act(async()=>{expect(await result.current.abandonSession()).toMatchObject({ok:true});});
    expect(result.current.activeSession?.id).toBe('newer-session');
    expect(JSON.parse(localStorage.getItem('sett_active_session_student-1')!).id).toBe('newer-session');
  });
  it('does not announce a reconciled abandonment in a different student context',async()=>{
    const {result,rerender}=renderHook(({student})=>useWorkoutSession(student,'company-1'),{initialProps:{student:'student-1'}});
    await act(async()=>{await result.current.startSession('workout-1');});
    mocks.updateResult={data:null,error:null};
    mocks.confirmationResult={data:{id:'session-1',student_id:'student-1',company_id:'company-1',workout_id:'workout-1',status:'abandoned'},error:null};
    let release!:(value:unknown)=>void;
    mocks.readback.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    let pending!:ReturnType<typeof result.current.abandonSession>;
    act(()=>{pending=result.current.abandonSession();});
    await waitFor(()=>expect(mocks.readback).toHaveBeenCalledOnce());
    rerender({student:'student-2'});
    await act(async()=>{release(mocks.confirmationResult);expect(await pending).toEqual({ok:false,reason:'context'});});
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem('sett_active_session_student-2')).toBeNull();
  });

});
