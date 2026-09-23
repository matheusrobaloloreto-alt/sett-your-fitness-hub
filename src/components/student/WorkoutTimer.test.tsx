import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkoutTimer } from "./WorkoutTimer";

describe("WorkoutTimer start guard", () => {
  it("hides start and exposes the safe recovery action when another active session blocks this workout", () => {
    const onStart = vi.fn();
    const onResolveBlockedStart = vi.fn();

    render(
      <WorkoutTimer
        isActive={false}
        elapsed={0}
        formatTime={(seconds) => `${seconds}s`}
        onStart={onStart}
        onFinish={vi.fn()}
        onAbandon={vi.fn()}
        workoutTitle="Treino A"
        startBlockedReason="Há uma sessão ativa que não está mais na ficha."
        onResolveBlockedStart={onResolveBlockedStart}
      />,
    );

    expect(screen.queryByText("Iniciar Treino")).not.toBeInTheDocument();
    expect(screen.getByText("Há uma sessão ativa que não está mais na ficha.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Resolver sessão ativa/i }));
    expect(onStart).not.toHaveBeenCalled();
    expect(onResolveBlockedStart).toHaveBeenCalledTimes(1);
  });

  it("disables session actions while completion is persisting", () => {
    const onFinish = vi.fn();
    const onAbandon = vi.fn();

    render(
      <WorkoutTimer
        isActive
        isFinishing
        elapsed={120}
        formatTime={(seconds) => `${seconds}s`}
        onStart={vi.fn()}
        onFinish={onFinish}
        onAbandon={onAbandon}
        workoutTitle="Treino B"
      />,
    );

    expect(screen.getByRole("button", { name: /Finalizando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Abandonar/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Finalizando/i }));
    expect(onFinish).not.toHaveBeenCalled();
    expect(onAbandon).not.toHaveBeenCalled();
  });
});
