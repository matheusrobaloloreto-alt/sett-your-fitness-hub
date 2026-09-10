import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkoutSession } from "./useWorkoutSession";

const mocks = vi.hoisted(() => ({
  updateResult: { data: null, error: new Error("offline") } as { data: { id: string } | null; error: Error | null },
  completionFilters: [] as Array<[string, string]>,
  selectedColumns: null as string | null,
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const completionQuery = {
        eq: (column: string, value: string) => {
          mocks.completionFilters.push([column, value]);
          return completionQuery;
        },
        select: (columns: string) => {
          mocks.selectedColumns = columns;
          return { single: async () => mocks.updateResult };
        },
      };
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "session-1" }, error: null }),
          }),
        }),
        update: () => completionQuery,
      };
    },
    rpc: mocks.rpc,
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
    mocks.updateResult = { data: null, error: new Error("offline") };
    mocks.completionFilters = [];
    mocks.selectedColumns = null;
    mocks.rpc.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(mocks.completionFilters).toEqual([
      ["id", "session-1"],
      ["student_id", "student-1"],
      ["status", "in_progress"],
    ]);
    expect(mocks.selectedColumns).toBe("id");
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem("sett_active_session_student-1")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalled();
  });
});
