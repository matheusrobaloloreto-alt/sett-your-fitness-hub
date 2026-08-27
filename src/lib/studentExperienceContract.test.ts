import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync("src/components/student/StudentHome.tsx", "utf8");
const checkinSource = readFileSync("src/components/student/CheckinCard.tsx", "utf8");
const portalSource = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
const announcementsBellSource = readFileSync("src/components/student/AnnouncementsBell.tsx", "utf8");
const bnitoSource = readFileSync("src/components/StudentBnitoAssistant.tsx", "utf8");
const workoutSessionSource = readFileSync("src/hooks/useWorkoutSession.ts", "utf8");

describe("student-first experience contract", () => {
  it("makes the active workout the dominant resumable action and explains its purpose", () => {
    expect(homeSource).toContain('workoutTarget?.kind === "active" ? "Treino em andamento" : "Treino de hoje"');
    expect(homeSource).toContain('workoutTarget?.kind === "active" ? "Retomar de onde parei" : "Iniciar treino"');
    expect(homeSource).toContain('onNavigate("treino", primaryWorkout?.id ?? null)');
    expect(homeSource).toContain("progressionHighlight.body");
    expect(portalSource).toContain("activeWorkoutId={session.activeSession?.workoutId ?? null}");
    expect(portalSource).toContain("setSelectedWorkoutId(workoutId)");
  });

  it("blocks starting another workout when the active session is no longer in any hydrated cycle", () => {
    expect(portalSource).toContain("resolveActiveWorkoutInCycles(cycles, session.activeSession?.workoutId ?? null)");
    expect(portalSource).toContain('activeWorkoutResolution.kind === "stale"');
    expect(portalSource).toContain("setSelectedWorkoutId(null)");
    expect(portalSource).toContain("startBlockedReason");
    expect(portalSource).toContain("Encerrar sessão ativa");
    expect(workoutSessionSource).toContain("if (!studentId || activeSession) return;");
  });

  it("keeps empty gamification away from the home and reveals it only after real sessions", () => {
    expect(homeSource).not.toContain("achievementsPanel");
    expect(portalSource).toContain("studentId && totalSessions > 0");
    expect(portalSource).toContain("<MonthlyLeaderboard companyId={companyId} />");
  });

  it("keeps removed history code out of the portal and defers the announcement feed", () => {
    expect(portalSource).not.toContain('activeView === "historico"');
    expect(portalSource).not.toContain("const StudentHistory = lazy");
    expect(announcementsBellSource).toContain('lazy(() => import("./AnnouncementsFeed")');
    expect(announcementsBellSource).not.toContain('import { AnnouncementsFeed, getUnreadAnnouncementCount }');
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
});
