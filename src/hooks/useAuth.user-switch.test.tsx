import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { authState, resolveSecondRole, rpc, sessionA, sessionB } = vi.hoisted(() => {
  const sessionA = {
    access_token: "token-a",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  };
  const sessionB = {
    access_token: "token-b",
    user: { id: "00000000-0000-4000-8000-000000000002" },
  };
  let callback: ((event: string, nextSession: typeof sessionA | null) => Promise<void>) | null = null;
  let resolveRole: ((value: { data: string; error: null }) => void) | null = null;
  const rpc = vi.fn((_functionName: string, { _user_id }: { _user_id: string }) => {
    if (_user_id === sessionA.user.id) return Promise.resolve({ data: "admin", error: null });
    return new Promise((resolve) => { resolveRole = resolve; });
  });
  return {
    sessionA,
    sessionB,
    rpc,
    authState: {
      set(next: typeof callback) { callback = next; },
      get() { return callback; },
    },
    resolveSecondRole: {
      run() { resolveRole?.({ data: "trainer", error: null }); },
    },
  };
});

let selectedUserId = sessionA.user.id;
const membershipQuery: Record<string, unknown> = {};
membershipQuery.select = vi.fn(() => membershipQuery);
membershipQuery.eq = vi.fn((_column: string, userId: string) => {
  selectedUserId = userId;
  return membershipQuery;
});
membershipQuery.limit = vi.fn(async () => ({
  data: [{ company_id: selectedUserId === sessionA.user.id
    ? "10000000-0000-4000-8000-000000000001"
    : "20000000-0000-4000-8000-000000000002" }],
  error: null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    from: vi.fn(() => membershipQuery),
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        authState.set(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn(async () => ({ data: { session: sessionA } })),
      signOut: vi.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from "./useAuth";

function Probe() {
  const auth = useAuth();
  if (auth.loading) return <div>loading</div>;
  return <div>{`${auth.user?.id}:${auth.role}:${auth.companyId}`}</div>;
}

describe("AuthProvider direct user switch", () => {
  it("clears the previous authorization before resolving the next user", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText(`${sessionA.user.id}:admin:10000000-0000-4000-8000-000000000001`)).toBeInTheDocument();
    await act(async () => {
      await authState.get()?.("SIGNED_IN", sessionB);
    });

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByText(/:admin:/)).not.toBeInTheDocument();

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveSecondRole.run();
    });

    expect(await screen.findByText(`${sessionB.user.id}:trainer:20000000-0000-4000-8000-000000000002`)).toBeInTheDocument();
  });
});
