import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeeklyContactToggle } from "./WeeklyContactToggle";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("WeeklyContactToggle", () => {
  it("blocks activation and explains the repair when the student has no reliable WhatsApp", () => {
    render(
      <WeeklyContactToggle
        studentId="student-1"
        initial={false}
        phone="42077707180"
        countryCode="BR"
      />,
    );

    expect(screen.getByRole("switch", { name: "Contato semanal" })).toBeDisabled();
    expect(screen.getByText(/Sem WhatsApp confiável/)).toBeInTheDocument();
    expect(screen.getByText(/Corrija o número no perfil antes de ativar/)).toBeInTheDocument();
  });

  it("makes consent and cadence explicit for an eligible student", () => {
    render(
      <WeeklyContactToggle
        studentId="student-1"
        initial={false}
        phone="(48) 99999-1234"
        countryCode="BR"
      />,
    );

    expect(screen.getByRole("switch", { name: "Contato semanal" })).toBeEnabled();
    expect(screen.getByText(/Ative somente após o aluno concordar/)).toBeInTheDocument();
    expect(screen.getByText(/nenhuma mensagem é enviada agora/)).toBeInTheDocument();
  });
});
