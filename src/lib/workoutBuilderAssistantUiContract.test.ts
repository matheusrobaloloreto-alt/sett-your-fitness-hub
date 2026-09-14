import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workoutBuilder = readFileSync(
  `${process.cwd()}/src/pages/admin/WorkoutBuilder.tsx`,
  "utf8",
);
const appLayout = readFileSync(
  `${process.cwd()}/src/components/AppLayout.tsx`,
  "utf8",
);

describe("WorkoutBuilder assistant and header UX contract", () => {
  it("keeps the dedicated audit without duplicating the floating assistant", () => {
    expect(workoutBuilder).toContain("Auditar treino");
    expect(workoutBuilder).toMatch(/<BenitoSprite\s+state=\{bnitoLoading === "review" \? "processing" : "review"\}/);
    expect(workoutBuilder).not.toContain("Pergunta técnica");
    expect(workoutBuilder).not.toContain("Perguntar ao {assistantName}");
    expect(workoutBuilder).not.toContain('onClick={() => callBnito("ask")}');
  });

  it("does not render a second named assistant action in the page header", () => {
    expect(workoutBuilder).not.toContain('onClick={() => callBnito("review")}');
    expect(appLayout).toContain("isWorkoutBuilder");
    expect(appLayout).toMatch(/!isWorkoutBuilder\s*&&/);
  });

  it("uses a responsive full-width header layout with unclipped identity and actions", () => {
    expect(workoutBuilder).toContain('data-testid="workout-builder-header"');
    expect(workoutBuilder).toContain('data-testid="workout-builder-header-actions"');
    expect(workoutBuilder).toContain("min-w-0");
    expect(workoutBuilder).toContain("justify-self-end");
  });

  it("surfaces save blockers in the page before the atomic workout revision RPC", () => {
    expect(workoutBuilder).toContain("resolveWorkoutSaveDraft");
    expect(workoutBuilder).toContain("issuesFromPrescriptionValidation");
    expect(workoutBuilder).toContain('data-testid="workout-save-gate-panel"');
    expect(workoutBuilder).toContain("focusSaveIssue");
    expect(workoutBuilder).toContain("saveCycleWorkoutRevision(supabase as any");
    expect(workoutBuilder.indexOf("resolveWorkoutSaveDraft")).toBeLessThan(workoutBuilder.indexOf("saveCycleWorkoutRevision(supabase as any"));
  });

  it("keeps the workout editor locked during the async save window", () => {
    expect(workoutBuilder).toContain("workoutRevisionPayload(draftWorkouts)");
    expect(workoutBuilder).toContain("workoutsWithSavedRows(draftWorkouts, saved)");
    expect(workoutBuilder).not.toContain("setWorkouts(draftWorkouts.map");
    expect(workoutBuilder).toContain("disabled={saving || workouts.length === 0}");
    expect(workoutBuilder).toContain("onClick={addWorkout} disabled={saving}");
    expect(workoutBuilder).toContain("onClick={() => setLibraryOpen(true)} disabled={saving}");
    expect(workoutBuilder).toContain("disabled={saving || exIdx === 0}");
    expect(workoutBuilder).toContain("disabled={saving || alreadyAdded}");
  });
});
