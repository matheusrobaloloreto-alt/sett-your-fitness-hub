import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentHome } from "@/components/student/StudentHome";
import { resolveActiveWorkoutInCycles, resolveStudentHomeWorkoutTarget } from "./weeklyStrengthPeriodization";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { StudentHistory } from "@/components/student/StudentHistory";
const sessionMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: sessionMocks }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-10T12:00:00-03:00"));
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  });
  sessionMocks.rpc.mockReset(); sessionMocks.from.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const homeSource = readFileSync("src/components/student/StudentHome.tsx", "utf8");
const checkinSource = readFileSync("src/components/student/CheckinCard.tsx", "utf8");
const portalSource = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
const announcementsBellSource = readFileSync("src/components/student/AnnouncementsBell.tsx", "utf8");
const bnitoSource = readFileSync("src/components/StudentBnitoAssistant.tsx", "utf8");
const weekSelectorSource = readFileSync("src/components/student/StudentWeekSelector.tsx", "utf8");

describe("student-first experience contract", () => {
  it("makes the active workout the dominant resumable action and explains its purpose", () => {
    const workouts = [
      { id: "today", title: "Treino do dia", day_of_week: 1 },
      { id: "active", title: "Treino já iniciado", day_of_week: 2 },
    ];
    expect(resolveStudentHomeWorkoutTarget(workouts, 1, "active")).toEqual({ kind: "active", workout: workouts[1] });
    const onNavigate = vi.fn();
    render(createElement(StudentHome, { studentName: "Aluno Teste", enrollmentInfo: null, overallProgress: 0,
      selectedCycle: { id: "cycle-1", cycle_number: 1, start_date: "2026-08-01", end_date: "2026-09-30", status: "active", workouts },
      cycleProgress: 0, workoutCount: 2, weeklySessionCount: 0, trainedDays: new Set<number>(), currentDayOfWeek: 1,
      totalSessions: 0, weeklyGoal: 3, streak: 0, activeWorkoutId: "active", onNavigate }));
    expect(screen.getByText("Treino em andamento")).toBeInTheDocument();
    expect(screen.getByText("O que muda agora")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retomar de onde parei").closest("button")!);
    expect(onNavigate).toHaveBeenCalledWith("treino", "active");
  });

  it("blocks starting another workout when the active session is no longer in any hydrated cycle", async () => {
    const stored = { id: "session-1", workoutId: "removed-workout", companyId: "company-1", startedAt: Date.now(), elapsedSeconds: 0 };
    localStorage.setItem("sett_active_session_student-1", JSON.stringify(stored));
    const { result } = renderHook(() => useWorkoutSession("student-1", "company-1"));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(resolveActiveWorkoutInCycles([{ id: "cycle-1", workouts: [{ id: "another-workout" }] }], result.current.activeSession?.workoutId))
      .toEqual({ kind: "stale", workoutId: "removed-workout" });
    expect(resolveStudentHomeWorkoutTarget([{ id: "another-workout", title: "Outro treino", day_of_week: 1 }], 1, "removed-workout"))
      .toEqual({ kind: "stale_active", workout: null });
    const terminalChecks = sessionMocks.from.mock.calls.length;
    await act(async () => { expect(await result.current.startSession("another-workout")).toEqual({ ok: false, reason: "conflict" }); });
    expect(sessionMocks.rpc).not.toHaveBeenCalled();
    expect(sessionMocks.from).toHaveBeenCalledTimes(terminalChecks);
    expect(result.current.activeSession?.id).toBe("session-1");
    expect(JSON.parse(localStorage.getItem("sett_active_session_student-1")!)).toEqual(stored);
  });

  it("keeps empty gamification away from the home and reveals it only after real sessions", () => {
    expect(homeSource).not.toContain("achievementsPanel");
    expect(portalSource).toContain("studentId && totalSessions > 0");
    expect(portalSource).toContain("<MonthlyLeaderboard companyId={companyId} />");
  });

  it("keeps history available without a redundant history route and defers the announcement feed", () => {
    expect(portalSource).not.toContain('activeView === "historico"');
    expect(portalSource).not.toContain("const StudentHistory = lazy");
    expect(announcementsBellSource).toContain('lazy(() => import("./AnnouncementsFeed")');
    expect(announcementsBellSource).not.toContain('import { AnnouncementsFeed, getUnreadAnnouncementCount }');
    // History remains functional inside the calendar, including acknowledged sessions.
    render(createElement(StudentHistory, { allLogs: [], workouts: [{ id: "history-workout", title: "Treino histórico" }],
      sessions: [{ id: "history-session", workout_id: "history-workout", session_date: "2026-08-12", status: "completed", total_volume: 1000, total_sets_completed: 3, duration_seconds: 120 }] }));
    expect(screen.getByText("Treino histórico")).toBeInTheDocument();
    expect(screen.getByText("2min")).toBeInTheDocument();
    expect(screen.getByText("1.0t")).toBeInTheDocument();
  });

  it("uses explicit readiness labels instead of emoji-only scales", () => {
    expect(checkinSource).toContain('[["Péssimo", 1]');
    expect(checkinSource).toContain('[["Muito baixo", 1]');
    expect(checkinSource).not.toMatch(/[😴🥱🙂😌⚡😐😖🤯]/u);
    expect(checkinSource).toContain("aria-pressed");
    expect(checkinSource).toContain('aria-label={`Dor ${v} de 8`}');
  });

  it("does not let the proactive BNITO card block the workout and remembers dismissal", () => {
    expect(bnitoSource).toContain("pointer-events-none fixed");
    expect(bnitoSource).toContain("pointer-events-auto rounded-full");
    expect(bnitoSource).toContain('sessionStorage.setItem(missionDismissedKey, "1")');
    expect(bnitoSource).toContain('sessionStorage.getItem(missionDismissedKey) === "1"');
  });

  it("keeps the workout screen focused by removing warmup and duplicated guidance", () => {
    expect(portalSource).not.toContain("<WarmupGuide");
    expect(portalSource).not.toContain("<WhySafetyCard");
    expect(portalSource).not.toContain(">Aquecer<");
    expect(portalSource).not.toContain("setWarmupOpen(true)");
    expect(portalSource).toContain("<StudentWeekSelector");
    expect(portalSource).toContain("{hasWeeklyPrescriptions && (");
    expect(weekSelectorSource).toContain("if (!hasWeeklyPrescriptions) return null;");
    expect(portalSource).toContain("Salvar");
    expect(portalSource).not.toContain("<WorkoutHeader");
  });
});
