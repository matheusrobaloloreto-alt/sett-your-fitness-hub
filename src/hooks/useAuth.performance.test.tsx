import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { session, rpc, membershipLimit, membershipQuery } = vi.hoisted(() => {
  const session = {
    access_token: "test-token",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  };
  const rpc = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: "admin", error: null };
  });
  const membershipLimit = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: [{ company_id: "00000000-0000-4000-8000-000000000002" }], error: null };
  });
  const membershipQuery: Record<string, unknown> = {};
  membershipQuery.select = vi.fn(() => membershipQuery);
  membershipQuery.eq = vi.fn(() => membershipQuery);
  membershipQuery.limit = membershipLimit;
  return { session, rpc, membershipLimit, membershipQuery };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    from: vi.fn(() => membershipQuery),
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        queueMicrotask(() => callback("INITIAL_SESSION", session));
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
  return <div>{auth.loading ? "loading" : `${auth.role}:${auth.companyId}`}</div>;
}

describe("AuthProvider request deduplication", () => {
  it("shares the initial role/company lookup between getSession and INITIAL_SESSION", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText("admin:00000000-0000-4000-8000-000000000002")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(membershipLimit).toHaveBeenCalledTimes(1);
  });
});
