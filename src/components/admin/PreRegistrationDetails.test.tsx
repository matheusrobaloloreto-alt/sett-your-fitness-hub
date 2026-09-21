import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreRegistrationDetails } from "./PreRegistrationDetails";
import type { PreRegistrationData } from "@/lib/preRegistration";

const data: PreRegistrationData = {
  recordId: "lead-1",
  source: "lead",
  submittedAt: "2026-09-21T12:00:00.000Z",
  budgetRange: "200_300",
  preferredContactPeriod: "morning",
  manualNotes: "Acompanhar desconforto no joelho.",
  answers: {
    objective: "saude",
    goals: "Voltar a treinar com segurança.",
    training_days: "Segunda, quarta e sexta",
    days_strength: 3,
    current_pain: "Joelho direito",
    profession: "Professora",
  },
};

describe("PreRegistrationDetails", () => {
  it("keeps the original answer code while editing and saves staff notes", async () => {
    const onSave = vi.fn(async (next: PreRegistrationData) => next);
    render(<PreRegistrationDetails data={data} onSave={onSave} />);

    expect(screen.getByText("Saúde e bem-estar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acompanhar desconforto no joelho.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar anamnese" }));
    expect(screen.getByLabelText("Editar Objetivo principal")).toHaveValue("saude");

    fireEvent.change(screen.getByLabelText("Editar Metas com os treinos"), {
      target: { value: "Retomar corrida sem dor." },
    });
    fireEvent.change(screen.getByPlaceholderText("Anotações internas sobre o aluno..."), {
      target: { value: "Reavaliar joelho em duas semanas." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      manualNotes: "Reavaliar joelho em duas semanas.",
      answers: expect.objectContaining({
        objective: "saude",
        goals: "Retomar corrida sem dor.",
      }),
    }));
  });

  it("keeps the requested priority fields above additional answers", () => {
    const { container } = render(<PreRegistrationDetails data={data} />);
    const text = container.textContent || "";

    expect(text.indexOf("Objetivo principal")).toBeLessThan(text.indexOf("Metas com os treinos"));
    expect(text.indexOf("Metas com os treinos")).toBeLessThan(text.indexOf("Semana de treinos"));
    expect(text.indexOf("Dor atual")).toBeLessThan(text.indexOf("Profissão"));
  });
});
