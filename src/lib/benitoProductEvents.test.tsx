import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BENITO_PRODUCT_EVENT_NAME,
  emitBenitoProductEvent,
  getBenitoEventSpec,
  resolveBenitoProductState,
  useBenitoProductState,
  type BenitoProductEvent,
  type BenitoProductEventCandidate,
} from "./benitoProductEvents";

function StateHarness({
  audience,
  fallback = "idle",
}: {
  audience: "professor" | "student";
  fallback?: "idle" | "waiting" | "processing" | "alert";
}) {
  const state = useBenitoProductState(audience, fallback);
  return <div data-testid={`${audience}-state`} data-benito-state={state} />;
}

describe("Benito product event map", () => {
  it("maps professor prescription generation events to explicit sticky and ttl states", () => {
    expect(getBenitoEventSpec({ source: "professor_prescription", action: "generation_started" })).toMatchObject({
      audience: "professor",
      state: "processing",
      sticky: true,
      ttlMs: null,
      priority: 80,
      fallback: "idle",
    });
    expect(getBenitoEventSpec({ source: "professor_prescription", action: "review_started" })).toMatchObject({
      audience: "professor",
      state: "review",
      sticky: true,
      ttlMs: null,
      priority: 60,
    });
    expect(getBenitoEventSpec({ source: "professor_prescription", action: "completed" })).toMatchObject({
      audience: "professor",
      state: "success",
      sticky: false,
      ttlMs: 1800,
      priority: 40,
    });
    expect(getBenitoEventSpec({ source: "professor_prescription", action: "failed" })).toMatchObject({
      audience: "professor",
      state: "error",
      sticky: false,
      ttlMs: 2200,
      priority: 70,
    });
    expect(getBenitoEventSpec({ source: "professor_prescription", action: "blocked" })).toMatchObject({
      audience: "professor",
      state: "alert",
      sticky: false,
      ttlMs: 2400,
      priority: 70,
    });
  });

  it("maps student workout and feedback events without animating per-set autosaves", () => {
    const expected: Array<[BenitoProductEvent, string]> = [
      [{ source: "student_workout", action: "start_blocked" }, "waiting"],
      [{ source: "student_workout", action: "started" }, "greeting"],
      [{ source: "student_workout", action: "completed" }, "celebration"],
      [{ source: "student_feedback", action: "submitted" }, "success"],
      [{ source: "student_feedback", action: "failed" }, "error"],
    ];

    for (const [event, state] of expected) {
      expect(getBenitoEventSpec(event)).toMatchObject({
        audience: "student",
        state,
        sticky: false,
        fallback: "idle",
      });
    }
    expect(
      getBenitoEventSpec({ source: "student_workout", action: "set_autosaved" } as unknown as BenitoProductEvent),
    ).toBeNull();
  });
});

describe("Benito product state resolver", () => {
  it("keeps drag direction above active product reactions", () => {
    const candidates: BenitoProductEventCandidate[] = [
      { state: "processing", priority: 80, fallback: "idle", expiresAt: null },
      { state: "error", priority: 70, fallback: "idle", expiresAt: 10_000 },
    ];

    expect(resolveBenitoProductState({
      fallback: "idle",
      dragDirection: "running-left",
      candidates,
      now: 1_000,
    })).toBe("running-left");
  });

  it("resolves processing before urgent alert and then returns to the real fallback after ttl", () => {
    const candidates: BenitoProductEventCandidate[] = [
      { state: "alert", priority: 70, fallback: "idle", expiresAt: 4_000 },
      { state: "processing", priority: 80, fallback: "idle", expiresAt: null },
      { state: "success", priority: 40, fallback: "idle", expiresAt: 4_000 },
    ];

    expect(resolveBenitoProductState({ fallback: "idle", candidates, now: 1_500 })).toBe("processing");
    expect(resolveBenitoProductState({ fallback: "waiting", candidates: [candidates[0]], now: 5_000 })).toBe("waiting");
  });

  it("keeps local high-priority states above lower-priority product reactions", () => {
    const success: BenitoProductEventCandidate = {
      state: "success",
      priority: 40,
      fallback: "idle",
      expiresAt: 4_000,
    };

    expect(resolveBenitoProductState({ fallback: "processing", candidates: [success], now: 1_000 })).toBe("processing");
    expect(resolveBenitoProductState({ fallback: "alert", candidates: [success], now: 1_000 })).toBe("alert");
    expect(resolveBenitoProductState({ fallback: "waiting", candidates: [success], now: 1_000 })).toBe("success");
    expect(resolveBenitoProductState({ fallback: "idle", candidates: [success], now: 1_000 })).toBe("success");
  });
});

describe("useBenitoProductState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("subscribes to real CustomEvents, filters audience, and clears short ttl reactions", () => {
    render(
      <>
        <StateHarness audience="professor" />
        <StateHarness audience="student" />
      </>,
    );

    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "idle");
    expect(screen.getByTestId("student-state")).toHaveAttribute("data-benito-state", "idle");

    act(() => emitBenitoProductEvent({ source: "professor_prescription", action: "generation_started" }));
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "processing");
    expect(screen.getByTestId("student-state")).toHaveAttribute("data-benito-state", "idle");

    act(() => emitBenitoProductEvent({ source: "student_workout", action: "completed" }));
    expect(screen.getByTestId("student-state")).toHaveAttribute("data-benito-state", "celebration");

    act(() => vi.advanceTimersByTime(1801));
    expect(screen.getByTestId("student-state")).toHaveAttribute("data-benito-state", "idle");
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "processing");
  });

  it("replaces sticky reactions with the next event and removes timers on cleanup", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(<StateHarness audience="professor" fallback="idle" />);

    act(() => {
      window.dispatchEvent(new CustomEvent(BENITO_PRODUCT_EVENT_NAME, {
        detail: { source: "professor_prescription", action: "generation_started" },
      }));
    });
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "processing");

    act(() => emitBenitoProductEvent({ source: "professor_prescription", action: "completed" }));
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "success");

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("lets local processing and alert states win until they clear", () => {
    const { rerender } = render(<StateHarness audience="professor" fallback="processing" />);

    act(() => emitBenitoProductEvent({ source: "professor_prescription", action: "completed" }));
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "processing");

    rerender(<StateHarness audience="professor" fallback="alert" />);
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "alert");

    rerender(<StateHarness audience="professor" fallback="waiting" />);
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "success");

    act(() => vi.advanceTimersByTime(1801));
    expect(screen.getByTestId("professor-state")).toHaveAttribute("data-benito-state", "waiting");
  });
});
