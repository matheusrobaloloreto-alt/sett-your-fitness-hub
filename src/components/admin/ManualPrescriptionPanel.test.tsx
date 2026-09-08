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

const clearedCycle = {
  ...workoutCycle,
  id: "cycle-cleared",
  prescription_cleared_at: "2026-10-14T10:00:00Z",
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

  it("exposes the cycle-level clear action only when the selected cycle is clearable", () => {
    const onClearCycle = vi.fn();
    render(
      <ManualPrescriptionPanel
        cycles={[workoutCycle]}
        selectedCycle={workoutCycle}
        onCycleChange={vi.fn()}
        onOpenCycle={vi.fn()}
        onClearCycle={onClearCycle}
        canClearSelectedCycle
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir prescrição do ciclo" }));
    expect(onClearCycle).toHaveBeenCalledWith(workoutCycle);
  });

  it("lets a cleared cycle be restored and opened as an empty manual draft", () => {
    const onOpenCycle = vi.fn();
    const onRestoreCycle = vi.fn();
    render(
      <ManualPrescriptionPanel
        cycles={[clearedCycle]}
        selectedCycle={clearedCycle}
        onCycleChange={vi.fn()}
        onOpenCycle={onOpenCycle}
        onRestoreCycle={onRestoreCycle}
        canClearSelectedCycle
      />,
    );

    expect(screen.getByText("Prescrição removida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar treino manual" }));
    expect(onOpenCycle).toHaveBeenCalledWith(clearedCycle);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar prescrição" }));
    expect(onRestoreCycle).toHaveBeenCalledWith(clearedCycle);
    expect(screen.queryByRole("button", { name: "Excluir prescrição do ciclo" })).not.toBeInTheDocument();
  });

  it("transitions from clearable prescription to recoverable cleared state without reopening archive", () => {
    const onClearCycle = vi.fn();
    const onRestoreCycle = vi.fn();
    const onOpenCycle = vi.fn();
    const { rerender } = render(
      <ManualPrescriptionPanel
        cycles={[workoutCycle]}
        selectedCycle={workoutCycle}
        onCycleChange={vi.fn()}
        onOpenCycle={onOpenCycle}
        onClearCycle={onClearCycle}
        onRestoreCycle={onRestoreCycle}
        canClearSelectedCycle
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir prescrição do ciclo" }));
    expect(onClearCycle).toHaveBeenCalledWith(workoutCycle);

    rerender(
      <ManualPrescriptionPanel
        cycles={[clearedCycle]}
        selectedCycle={clearedCycle}
        onCycleChange={vi.fn()}
        onOpenCycle={onOpenCycle}
        onClearCycle={onClearCycle}
        onRestoreCycle={onRestoreCycle}
        canClearSelectedCycle={false}
      />,
    );

    expect(screen.getByText("Prescrição removida")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir prescrição do ciclo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar prescrição" }));
    expect(onRestoreCycle).toHaveBeenCalledWith(clearedCycle);
    expect(onOpenCycle).not.toHaveBeenCalled();
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
