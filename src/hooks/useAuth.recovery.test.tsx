import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";

const state = vi.hoisted(() => ({ callback: (_event: string, _session: null) => {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    onAuthStateChange: vi.fn(callback => {
      state.callback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    getSession: vi.fn(async () => ({ data: { session: null } })),
    signOut: vi.fn(),
  },
} }));

function Probe() {
  const auth = useAuth();
  return <>
    <output>{auth.passwordRecovery ? "recovery" : "normal"}</output>
    <button onClick={auth.completePasswordRecovery}>Complete</button>
  </>;
}

describe("AuthProvider recovery lifecycle", () => {
  beforeEach(() => window.history.replaceState({}, "", "/"));

  it("captures a recovery callback and clears it only on completion or signout", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => state.callback("PASSWORD_RECOVERY", null));
    expect(screen.getByRole("status")).toHaveTextContent("recovery");
    await act(async () => state.callback("USER_UPDATED", null));
    expect(screen.getByRole("status")).toHaveTextContent("recovery");
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(screen.getByRole("status")).toHaveTextContent("normal");
    await act(async () => state.callback("PASSWORD_RECOVERY", null));
    await act(async () => state.callback("SIGNED_OUT", null));
    expect(screen.getByRole("status")).toHaveTextContent("normal");
  });

  it("recognizes a recovery fragment before the first normal route render", async () => {
    window.history.replaceState({}, "", "/#type=recovery");
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("recovery");
    await act(async () => {});
  });
});
