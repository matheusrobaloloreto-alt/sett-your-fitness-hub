import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { authState, resolveRole, session } = vi.hoisted(() => {
  const session = {
    access_token: "test-token",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  };
  let authState: ((event: string, nextSession: typeof session | null) => Promise<void>) | null = null;
  let resolveRole: ((value: { data: string; error: null }) => void) | null = null;
  return {
    session,
    authState: {
      set(callback: typeof authState) { authState = callback; },
      get() { return authState; },
    },
    resolveRole: {
      set(callback: typeof resolveRole) { resolveRole = callback; },
      run(value: { data: string; error: null }) { resolveRole?.(value); },
    },
  };
});

const membershipQuery: Record<string, unknown> = {};
membershipQuery.select = vi.fn(() => membershipQuery);
membershipQuery.eq = vi.fn(() => membershipQuery);
membershipQuery.limit = vi.fn(async () => ({
  data: [{ company_id: "00000000-0000-4000-8000-000000000002" }],
  error: null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => new Promise((resolve) => resolveRole.set(resolve))),
    from: vi.fn(() => membershipQuery),
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        authState.set(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn(async () => ({ data: { session } })),
      signOut: vi.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from "./useAuth";

function Probe() {
  const auth = useAuth();
  return <div>{auth.loading ? "loading" : `${auth.user?.id || "signed-out"}:${auth.role || "no-role"}:${auth.companyId || "no-company"}`}</div>;
}

describe("AuthProvider stale request protection", () => {
  it("does not restore role or company after sign-out while the initial lookup is pending", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(authState.get()).not.toBeNull());
    await act(async () => {
      await authState.get()?.("SIGNED_OUT", null);
    });
    expect(screen.getByText("signed-out:no-role:no-company")).toBeInTheDocument();

    await act(async () => {
      resolveRole.run({ data: "admin", error: null });
    });

    expect(screen.getByText("signed-out:no-role:no-company")).toBeInTheDocument();
  });
});
