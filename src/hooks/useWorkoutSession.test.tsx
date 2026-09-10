import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkoutSession } from "./useWorkoutSession";

const mocks = vi.hoisted(() => ({
  updateResult: { data: null, error: new Error("offline") } as { data: unknown; error: Error | null },
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "session-1" }, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => mocks.updateResult,
      }),
    }),
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
    mocks.rpc.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the active session locally when remote completion fails", async () => {
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

    mocks.updateResult = { data: null, error: null };
    await act(async () => {
      summary = await result.current.finishSession({}, [], {});
    });

    expect(summary?.id).toBe("session-1");
    expect(result.current.activeSession).toBeNull();
    expect(localStorage.getItem("sett_active_session_student-1")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalled();
  });
});
