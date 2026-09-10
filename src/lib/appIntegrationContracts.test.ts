import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

describe("SETT integration contracts", () => {
  it("sends verified company and student context from the professor BNITO", () => {
    const provider = source("src/components/BnitoFloatingAssistant.tsx");
    const builder = source("src/pages/admin/WorkoutBuilder.tsx");
    expect(provider).toMatch(/student_id:\s*activeStudentId/);
    expect(provider).toMatch(/company_id:\s*effectiveCompanyId/);
    expect(provider).toContain("function getStudentId(pathname: string)");
    expect(provider).toContain("routeStudentId");
    expect(provider).toContain("setPageContext");
    expect(provider).toMatch(/workouts:\s*activeContext\?\.workouts/);
    expect(provider).toMatch(/volume_summary:\s*activeContext\?\.volumeSummary/);
    expect(builder).toContain("useBnitoAssistant");
    expect(builder).toContain("setBnitoPageContext");
  });

  it("loads the complete student record and tenant-checks professor BNITO", () => {
    const edge = source("supabase/functions/ai-bnito-coach/index.ts");
    expect(edge).toMatch(/assertTenantAccess/);
    for (const table of [
      "student_anamneses",
      "anamnesis",
      "functional_assessments",
      "student_checkins",
      "workout_feedback",
      "ai_strength_plans",
      "running_plans",
      "nutrition_plans",
      "workouts",
    ]) {
      expect(edge).toContain(`.from("${table}")`);
    }
  });

  it("keeps the student BNITO aware of cardio, nutrition and readiness", () => {
    const edge = source("supabase/functions/ai-student-bnito/index.ts");
    expect(edge).toContain('.from("student_checkins")');
    expect(edge).toContain('.from("running_plans")');
    expect(edge).toContain('.from("nutrition_plans")');
    expect(edge.indexOf("isDateInside(todayIso")).toBeLessThan(edge.indexOf('cycle.status === "active"'));
  });

  it("passes anamnesis and functional assessment into integrated prescription", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");
    const preRegistrationData = source("src/lib/preRegistrationData.ts");
    expect(studio).toContain("resolveStudioAnamnesis");
    expect(studio).toContain("studioAnamnesisGenerationBlockReason");
    expect(studio).toContain("if (anamneseGenerationBlockReason)");
    expect(studio).toContain("Boolean(anamneseGenerationBlockReason)");
    expect(preRegistrationData).toMatch(/from\("student_anamneses"\)/);
    expect(preRegistrationData).toContain("loadStudentPreRegistration");
    expect(preRegistrationData).toContain("preRegistrationToStudioAnamnesis");
    expect(studio).toMatch(/from\("functional_assessments"\)/);
    expect(studio).toContain("assessmentContext");
    expect(studio).toMatch(/anamnese[,:]/);
  });

  it("keeps integrated generation bound to the selected persisted cycle without rewriting cycle dates", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");
    expect(studio).toContain("selectDefaultPrescriptionScheduleCycle(rows)");
    expect(studio).toContain("setSelectedCycleId(preferred?.id || \"\")");
    expect(studio).toContain("selectPreviousPrescriptionCycle(scheduleCycles, cycle)");
    expect(studio).toContain("isPrescriptionHistoryBeforeTarget(row, firstTarget, scheduleCycles)");
    expect(studio).toContain("training_cycle_id: cycle.id");
    expect(studio).toContain("targetCycleId: cycle.id");
    expect(studio).toContain("start_date: cycle.start_date");
    expect(studio).toContain("end_date: cycle.end_date");
    expect(studio).not.toMatch(/from\("training_cycles"\)[\s\S]{0,160}\.update\(/);
  });

  it("loads integrated prescription schedule read-only from persisted cycles", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");
    expect(studio).not.toContain('rpc("sync_prescription_cycles"');
    expect(studio).toContain('.from("enrollments")');
    expect(studio).toContain('.from("training_cycles")');
    expect(studio).toContain('.from("workouts")');
    expect(studio).toContain('.from("prescription_bundles")');
    expect(studio).toContain('.is("superseded_at", null)');
    expect(studio).toContain('.in("status", ["active", "scheduled"])');
    expect(studio).toContain('workoutQuery = workoutQuery.eq("company_id", companyId)');
    expect(studio).toContain('bundleQuery = bundleQuery.eq("company_id", companyId)');
    expect(studio).toContain("filterMaterializedWorkouts(workoutRows || [])");
    expect(studio).toContain("has_workouts: workoutCycleIds.has(cycle.id)");
    expect(studio).toContain("has_bundle: bundleCycleIds.has(cycle.id)");
    expect(studio).toContain("setScheduleCycles([])");
    expect(studio).toContain("Boolean(scheduleLoadError)");
    expect(studio).toContain("A matrícula vigente ainda não possui ciclos persistidos");
    expect(studio).toContain("PrescriptionStudio schedule load failed");
  });

  it("does not link cardio bundle items or bundle summaries without a persisted running plan id", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");
    expect(studio).toContain('throw new Error(`A prescrição de ${modality} foi gerada sem ID persistido.`)');
    expect(studio).toMatch(/await linkBundleItem\(modality, "running_plan", data\.id\)/);
    expect(studio).toContain("const { error: runningLinkError } = await db.from(\"prescription_bundles\")");
    expect(studio).toContain("if (runningLinkError) throw new Error(`Falha ao ligar cardio: ${runningLinkError.message}`);");
  });

  it("clears Studio anamnesis on student changes and separates loading, error, and unanswered states", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");
    expect(studio).toContain("const [anamneseLoading, setAnamneseLoading]");
    expect(studio).toContain("const [anamneseLoadError, setAnamneseLoadError]");
    expect(studio).toMatch(/setAnamnese\(null\);\s*setAnamneseLoading\(true\);\s*setAnamneseLoadError\(""\)/);
    expect(studio).toContain("catch (error)");
    expect(studio).toContain('console.error("PrescriptionStudio anamnesis load failed"');
    expect(studio).toContain("Falha ao carregar a anamnese. Tente novamente antes de prescrever.");
    expect(studio).toContain("if (!active) return;");
    expect(studio).toContain("Carregando anamnese deste aluno");
    expect(studio).toContain("Não foi possível carregar a anamnese");
    expect(studio).toContain("Este aluno ainda não respondeu a anamnese");
  });

  it("derives WhatsApp workout badges from the canonical prepared cycle and refreshes stale status", () => {
    const whatsapp = source("src/pages/admin/WhatsAppChat.tsx");
    expect(whatsapp).toContain("matchesWhatsAppStatusFilter");
    expect(whatsapp).toContain("selectPrescriptionEnrollment");
    expect(whatsapp).toContain("selectStudentWorkoutCycleWindow");
    expect(whatsapp).toContain("carried_over_cycle_id");
    expect(whatsapp).toContain("scheduleStudentDataRefresh");
    expect(whatsapp).toContain('document.addEventListener("visibilitychange"');
    expect(whatsapp).toMatch(/if \(requestId === studentDataRequestRef\.current\) \{\s*setStudentContexts\(\{\}\);\s*setChatLabels\(\{\}\);/);
    expect(whatsapp).toContain("enrollmentEndDate");
  });

  it("normalizes legacy anamnesis additively and keeps its source", () => {
    const migration = source("supabase/migrations/20260731201000_normalize_legacy_anamneses.sql");
    expect(migration).toContain("legacy_anamnesis_id");
    expect(migration).toContain("on conflict (student_id) do nothing");
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from\s+public\.anamnesis/);
  });
});
