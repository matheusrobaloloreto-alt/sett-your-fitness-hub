import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { WeeklyContactToggle } from "./WeeklyContactToggle";

describe("WeeklyContactToggle", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("does not grant from the switch until staff explicitly attests authorization", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "weekly_contact_consent_status") {
        return Promise.resolve({
          data: { eligible: false, policy_version: "current-policy" },
          error: null,
        });
      }
      if (name === "record_weekly_contact_consent") {
        return Promise.resolve({ data: {}, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    render(<WeeklyContactToggle studentId="student-a" />);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Registrar autorização" });
    expect(confirm).toBeDisabled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText(/Confirmo que o aluno autorizou/i));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      {
        _student_id: "student-a",
        _event_type: "granted",
        _policy_version: "current-policy",
        _source: "staff_confirmed_student",
      },
    ));
  });

  it("revokes immediately without requiring an attestation dialog", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "weekly_contact_consent_status") {
        return Promise.resolve({
          data: { eligible: true, policy_version: "current-policy" },
          error: null,
        });
      }
      if (name === "record_weekly_contact_consent") {
        return Promise.resolve({ data: {}, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    render(<WeeklyContactToggle studentId="student-a" />);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({ _event_type: "revoked" }),
    ));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
