import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { authState, resolveSession, rpc, session } = vi.hoisted(() => {
  const session = {
    access_token: "test-token",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  };
  let callback: ((event: string, nextSession: typeof session | null) => Promise<void>) | null = null;
  let resolveSessionPromise: ((value: { data: { session: typeof session } }) => void) | null = null;
  return {
    session,
    rpc: vi.fn(async () => ({ data: "admin", error: null })),
    authState: {
      set(next: typeof callback) { callback = next; },
      get() { return callback; },
    },
    resolveSession: {
      set(next: typeof resolveSessionPromise) { resolveSessionPromise = next; },
      run() { resolveSessionPromise?.({ data: { session } }); },
    },
  };
});

const membershipQuery: Record<string, unknown> = {};
membershipQuery.select = vi.fn(() => membershipQuery);
membershipQuery.eq = vi.fn(() => membershipQuery);
membershipQuery.limit = vi.fn(async () => ({ data: [], error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    from: vi.fn(() => membershipQuery),
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        authState.set(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn(() => new Promise((resolve) => resolveSession.set(resolve))),
      signOut: vi.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from "./useAuth";

function Probe() {
  const auth = useAuth();
  return <div>{auth.loading ? "loading" : auth.user?.id || "signed-out"}</div>;
}

describe("AuthProvider bootstrap ordering", () => {
  it("ignores a late getSession result after a newer auth event", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(authState.get()).not.toBeNull());
    await act(async () => {
      await authState.get()?.("SIGNED_OUT", null);
    });
    expect(screen.getByText("signed-out")).toBeInTheDocument();

    await act(async () => {
      resolveSession.run();
    });

    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});
