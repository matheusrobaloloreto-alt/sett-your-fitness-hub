import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readProjectFile = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Benito product event wiring contracts", () => {
  it("subscribes both floating assistants to audience-scoped product events", () => {
    const professor = readProjectFile("src/components/BnitoFloatingAssistant.tsx");
    const student = readProjectFile("src/components/StudentBnitoAssistant.tsx");

    expect(professor).toContain('from "@/lib/benitoProductEvents"');
    expect(professor).toContain('useBenitoProductState("professor"');
    expect(student).toContain('from "@/lib/benitoProductEvents"');
    expect(student).toContain('useBenitoProductState("student"');
  });

  it("emits professor prescription events around generation, review, bundle success, and failures", () => {
    const source = readProjectFile("src/pages/admin/UnifiedPrescriber.tsx");

    expect(source).toContain('from "@/lib/benitoProductEvents"');
    expect(source).toContain('source: "professor_prescription", action: "generation_started"');
    expect(source).toContain('source: "professor_prescription", action: "review_started"');
    expect(source).toContain('source: "professor_prescription", action: "completed"');
    expect(source).toContain('source: "professor_prescription", action: "failed"');
    expect(source).toContain('source: "professor_prescription", action: "blocked"');
    expect(source).toContain("bundleInsertError");
    expect(source).toContain("let didStartReview = false");
    expect(source.match(/action: "review_started"/g)).toHaveLength(1);

    const reviewIndex = source.indexOf('source: "professor_prescription", action: "review_started"');
    const validateIndex = source.indexOf("validateStrengthPlan(");
    const insertIndex = source.indexOf('from("prescription_bundles").insert');
    const completedIndex = source.indexOf('source: "professor_prescription", action: "completed"');
    const runningDoneIndex = source.indexOf('setStatus(s => ({ ...s, corrida: "done" }))');
    const reviewBeforeBundleIndex = source.indexOf("startPrescriptionReview();", runningDoneIndex);

    expect(reviewIndex).toBeGreaterThan(-1);
    expect(validateIndex).toBeGreaterThan(reviewIndex);
    expect(reviewBeforeBundleIndex).toBeGreaterThan(runningDoneIndex);
    expect(reviewBeforeBundleIndex).toBeLessThan(insertIndex);
    expect(completedIndex).toBeGreaterThan(insertIndex);
  });

  it("emits student workout and feedback events from real user handlers only", () => {
    const source = readProjectFile("src/pages/student/StudentPortal.tsx");

    expect(source).toContain('from "@/lib/benitoProductEvents"');
    expect(source).toContain('source: "student_workout", action: "start_blocked"');
    expect(source).toContain('source: "student_workout", action: "started"');
    expect(source).toContain('source: "student_workout", action: "completed"');
    expect(source).toContain('source: "student_feedback", action: "submitted"');
    expect(source).toContain('source: "student_feedback", action: "failed"');
    expect(source).not.toContain('action: "set_autosaved"');
  });
});
