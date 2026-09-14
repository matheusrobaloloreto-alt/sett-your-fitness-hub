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

const mobile = (digit: string) => `(48) 9${digit.repeat(4)}-${digit.repeat(4)}`;
const canonicalMobile = (digit: string) => `55${mobile(digit).replace(/\D/g, "")}`;
const recipientA = mobile("7");
const recipientB = mobile("8");

const validRecipientProps = {
  phone: recipientA,
  countryCode: "BR",
};

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

    render(<WeeklyContactToggle studentId="student-a" {...validRecipientProps} />);
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
        _recipient_key: canonicalMobile("7"),
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

    render(<WeeklyContactToggle studentId="student-a" {...validRecipientProps} />);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({ _event_type: "revoked", _recipient_key: null }),
    ));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resets attestation and loads the new policy when the student changes", async () => {
    mocks.rpc.mockImplementation((name: string, args: { _student_id?: string }) => {
      if (name === "weekly_contact_consent_status") {
        return Promise.resolve({
          data: {
            eligible: false,
            policy_version: args._student_id === "student-a" ? "policy-a" : "policy-b",
          },
          error: null,
        });
      }
      if (name === "record_weekly_contact_consent") {
        return Promise.resolve({ data: {}, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const { rerender } = render(<WeeklyContactToggle studentId="student-a" {...validRecipientProps} />);
    let toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByLabelText(/Confirmo que o aluno autorizou/i));
    expect(screen.getByRole("button", { name: "Registrar autorização" })).toBeEnabled();
    expect(screen.getByText(`+${canonicalMobile("7")}`)).toBeInTheDocument();

    rerender(<WeeklyContactToggle studentId="student-b" {...validRecipientProps} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({ _student_id: "student-b" }),
    );

    fireEvent.click(toggle);
    const confirm = await screen.findByRole("button", { name: "Registrar autorização" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confirmo que o aluno autorizou/i));
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({
        _student_id: "student-b",
        _policy_version: "policy-b",
      }),
    ));
  });

  it("ignores an in-flight grant completion after switching students", async () => {
    let resolveGrant: ((value: { data: object; error: null }) => void) | undefined;
    mocks.rpc.mockImplementation((name: string, args: { _student_id?: string }) => {
      if (name === "weekly_contact_consent_status") {
        return Promise.resolve({
          data: {
            eligible: false,
            policy_version: args._student_id === "student-a" ? "policy-a" : "policy-b",
          },
          error: null,
        });
      }
      if (name === "record_weekly_contact_consent") {
        return new Promise((resolve) => { resolveGrant = resolve; });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const { rerender } = render(<WeeklyContactToggle studentId="student-a" {...validRecipientProps} />);
    let toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByLabelText(/Confirmo que o aluno autorizou/i));
    fireEvent.click(screen.getByRole("button", { name: "Registrar autorização" }));
    await waitFor(() => expect(resolveGrant).toBeTypeOf("function"));

    rerender(<WeeklyContactToggle studentId="student-b" {...validRecipientProps} />);
    toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    resolveGrant?.({ data: {}, error: null });
    await Promise.resolve();

    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({ _student_id: "student-b" }),
    );
  });

  it("keeps grant disabled when the student has no reliable WhatsApp recipient", async () => {
    mocks.rpc.mockResolvedValue({
      data: { eligible: false, policy_version: "current-policy" },
      error: null,
    });

    render(
      <WeeklyContactToggle
        studentId="student-a"
        phone={["420", "777", "07180"].join("")}
        countryCode="BR"
      />,
    );

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(screen.getByText(/Sem WhatsApp confiável/)).toBeInTheDocument());
    expect(toggle).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.anything(),
    );
  });

  it("closes an open grant dialog when the same student's recipient becomes unreliable", async () => {
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

    const { rerender } = render(
      <WeeklyContactToggle studentId="student-a" {...validRecipientProps} />,
    );
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByLabelText(/Confirmo que o aluno autorizou/i));
    expect(screen.getByRole("button", { name: "Registrar autorização" })).toBeEnabled();

    rerender(
      <WeeklyContactToggle studentId="student-a" phone={["420", "777", "07180"].join("")} countryCode="BR" />,
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.anything(),
    );
  });

  it("requires a new attestation when the normalized recipient changes between valid numbers", async () => {
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

    const { rerender } = render(
      <WeeklyContactToggle
        studentId="student-a"
        phone={recipientA}
        countryCode="BR"
      />,
    );
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByLabelText(/Confirmo que o aluno autorizou/i));
    expect(screen.getByRole("button", { name: "Registrar autorização" })).toBeEnabled();

    rerender(
      <WeeklyContactToggle
        studentId="student-a"
        phone={recipientB}
        countryCode="BR"
      />,
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("switch"));
    const confirm = await screen.findByRole("button", { name: "Registrar autorização" });
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText(/Confirmo que o aluno autorizou/i)).not.toBeChecked();
    expect(screen.getByText(`+${canonicalMobile("8")}`)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.anything(),
    );

    fireEvent.click(screen.getByLabelText(/Confirmo que o aluno autorizou/i));
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({
        _student_id: "student-a",
        _event_type: "granted",
        _recipient_key: canonicalMobile("8"),
      }),
    ));
  });

  it("clears an optimistic in-flight grant when the normalized recipient changes", async () => {
    let resolveGrant: ((value: { data: object; error: null }) => void) | undefined;
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "weekly_contact_consent_status") {
        return Promise.resolve({
          data: { eligible: false, policy_version: "current-policy" },
          error: null,
        });
      }
      if (name === "record_weekly_contact_consent") {
        return new Promise((resolve) => { resolveGrant = resolve; });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const { rerender } = render(
      <WeeklyContactToggle
        studentId="student-a"
        phone={recipientA}
        countryCode="BR"
      />,
    );
    let toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByLabelText(/Confirmo que o aluno autorizou/i));
    fireEvent.click(screen.getByRole("button", { name: "Registrar autorização" }));
    await waitFor(() => expect(resolveGrant).toBeTypeOf("function"));

    rerender(
      <WeeklyContactToggle
        studentId="student-a"
        phone={recipientB}
        countryCode="BR"
      />,
    );

    toggle = screen.getByRole("switch");
    await waitFor(() => {
      expect(toggle).toBeEnabled();
      expect(toggle).not.toBeChecked();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    resolveGrant?.({ data: {}, error: null });
    await Promise.resolve();

    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(await screen.findByRole("button", { name: "Registrar autorização" })).toBeDisabled();
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === "record_weekly_contact_consent"),
    ).toHaveLength(1);
  });

  it("ignores a deferred status for valid recipient A after valid recipient B becomes active", async () => {
    let resolveStatusA: ((value: { data: object; error: null }) => void) | undefined;
    mocks.rpc.mockImplementation((name: string, args: { _recipient_key?: string }) => {
      if (name === "weekly_contact_consent_status" && args._recipient_key === canonicalMobile("7")) {
        return new Promise((resolve) => { resolveStatusA = resolve; });
      }
      if (name === "weekly_contact_consent_status" && args._recipient_key === canonicalMobile("8")) {
        return Promise.resolve({
          data: { eligible: false, policy_version: "policy-b" },
          error: null,
        });
      }
      if (name === "record_weekly_contact_consent") {
        return Promise.resolve({ data: {}, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const { rerender } = render(
      <WeeklyContactToggle studentId="student-a" phone={recipientA} countryCode="BR" />,
    );
    await waitFor(() => expect(resolveStatusA).toBeTypeOf("function"));

    rerender(<WeeklyContactToggle studentId="student-a" phone={recipientB} countryCode="BR" />);
    const toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();

    resolveStatusA?.({ data: { eligible: true, policy_version: "policy-a" }, error: null });
    await Promise.resolve();
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    fireEvent.click(await screen.findByLabelText(/Confirmo que o aluno autorizou/i));
    fireEvent.click(screen.getByRole("button", { name: "Registrar autorização" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "record_weekly_contact_consent",
      expect.objectContaining({
        _policy_version: "policy-b",
        _recipient_key: canonicalMobile("8"),
      }),
    ));
  });
});
