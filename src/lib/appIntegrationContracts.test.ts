import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

describe("SETT integration contracts", () => {
  it("sends verified company and student context from the professor BNITO", () => {
    const provider = source("src/components/BnitoFloatingAssistant.tsx");
    expect(provider).toMatch(/student_id:\s*activeStudentId/);
    expect(provider).toMatch(/company_id:\s*effectiveCompanyId/);
    expect(provider).toContain("function getStudentId(pathname: string)");
    expect(provider).toContain("routeStudentId");
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

  it("derives WhatsApp audiences and current cycle from canonical helpers", () => {
    const whatsapp = source("src/pages/admin/WhatsAppChat.tsx");
    expect(whatsapp).toContain("matchesWhatsAppStatusFilter");
    expect(whatsapp).toContain("selectCurrentCycle");
    expect(whatsapp).toContain("enrollmentEndDate");
  });

  it("normalizes legacy anamnesis additively and keeps its source", () => {
    const migration = source("supabase/migrations/20260731201000_normalize_legacy_anamneses.sql");
    expect(migration).toContain("legacy_anamnesis_id");
    expect(migration).toContain("on conflict (student_id) do nothing");
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from\s+public\.anamnesis/);
  });
});
