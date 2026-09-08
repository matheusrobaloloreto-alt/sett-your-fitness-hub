import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManualPrescriptionPanel } from "./ManualPrescriptionPanel";

const emptyCycle = {
  id: "cycle-empty",
  cycle_number: 1,
  start_date: "2026-09-01",
  end_date: "2026-10-12",
  has_workout: false,
};

const workoutCycle = {
  id: "cycle-workout",
  cycle_number: 2,
  start_date: "2026-10-13",
  end_date: "2026-11-23",
  has_workout: true,
};

describe("ManualPrescriptionPanel", () => {
  it("opens the selected empty cycle through the manual editor action", () => {
    const onOpenCycle = vi.fn();
    render(
      <ManualPrescriptionPanel
        cycles={[emptyCycle]}
        selectedCycle={emptyCycle}
        onCycleChange={vi.fn()}
        onOpenCycle={onOpenCycle}
      />,
    );

    expect(screen.getByText("Prescrição manual")).toBeInTheDocument();
    expect(screen.getByText(/Monte o treino escolhendo exercícios, séries e repetições/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar treino manual" }));
    expect(onOpenCycle).toHaveBeenCalledWith(emptyCycle);
  });

  it("uses the edit action when the selected cycle already has a workout", () => {
    const onOpenCycle = vi.fn();
    render(
      <ManualPrescriptionPanel
        cycles={[workoutCycle]}
        selectedCycle={workoutCycle}
        onCycleChange={vi.fn()}
        onOpenCycle={onOpenCycle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar treino" }));
    expect(onOpenCycle).toHaveBeenCalledWith(workoutCycle);
  });

  it("does not expose any automatic generation action when there are no existing cycles", () => {
    render(
      <ManualPrescriptionPanel
        cycles={[]}
        selectedCycle={null}
        onCycleChange={vi.fn()}
        onOpenCycle={vi.fn()}
      />,
    );

    expect(screen.getByText(/não cria ciclos automaticamente/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /gerar/i })).not.toBeInTheDocument();
  });
});
