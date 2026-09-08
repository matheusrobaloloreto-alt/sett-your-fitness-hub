import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDENT_PROGRAM_PRIMARY_TABS, resolveStudentProgramHandoff } from "./studentProgramSections";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("student profile program reorganization contract", () => {
  const studentDetail = source("src/pages/admin/StudentDetail.tsx");
  const sidebar = source("src/components/AppSidebar.tsx");
  const app = source("src/App.tsx");
  const studio = source("src/pages/admin/PrescriptionStudio.tsx");
  const prescriber = source("src/pages/admin/UnifiedPrescriber.tsx");

  it("exposes exactly the four requested primary tabs and resolves prescription handoffs behaviorally", () => {
    expect(STUDENT_PROGRAM_PRIMARY_TABS).toEqual([
      { value: "overview", label: "Visão geral" },
      { value: "program", label: "Programa" },
      { value: "analytics", label: "Análise" },
      { value: "evaluations", label: "Avaliação" },
    ]);
    expect(resolveStudentProgramHandoff("prescricao")).toEqual({
      activeTab: "program",
      prescriptionPanel: "prescricao",
    });
    expect(resolveStudentProgramHandoff("integrada")).toEqual({
      activeTab: "program",
      prescriptionPanel: "integrada",
    });
    expect(resolveStudentProgramHandoff("analytics")).toEqual({
      activeTab: "analytics",
      prescriptionPanel: null,
    });
    expect(resolveStudentProgramHandoff("financial")).toEqual({
      activeTab: null,
      prescriptionPanel: null,
    });
  });

  it("keeps legacy prescription routes but removes the standalone prescription/studio sidebar shortcuts", () => {
    for (const route of ["/admin/prescricao", "/admin/studio", "/coordinator/prescricao", "/coordinator/studio", "/trainer/prescricao", "/trainer/studio"]) {
      expect(app).toContain(`path="${route}"`);
    }

    expect(sidebar).not.toContain("<span>Prescrição</span>");
    expect(sidebar).not.toContain("<span>Studio Integrado</span>");
    expect(sidebar).not.toContain('to={`${exercisePrefix}/prescriptions`}');
    expect(sidebar).not.toContain('to={`${exercisePrefix}/studio`}');
  });

  it("keeps manual prescription on WorkoutBuilder and integrated prescription on PrescriptionStudio", () => {
    const dashboard = source("src/pages/admin/AdminDashboard.tsx");

    expect(dashboard).toContain('state: { studentId: m.student_id, tab: "prescricao" }');
    expect(dashboard).toContain("`/${routePrefix}/students/${m.student_id}`");
    expect(studentDetail).toContain("EmbeddedPrescriptionStudio");
    expect(studentDetail).not.toContain("EmbeddedUnifiedPrescriber");
    expect(studentDetail).not.toContain("@/pages/admin/UnifiedPrescriber");
    expect(studentDetail).toContain("ManualPrescriptionPanel");
    expect(studentDetail).toContain("openManualPrescriptionBuilder");
    expect(studentDetail).toContain("workoutBuilderUrl({ role, studentId: id, cycleId: targetCycle.id })");
    expect(studentDetail).toContain("resolveManualPrescriptionTargetCycle");
    expect(studentDetail).toContain("EmbeddedPrescriptionStudio embeddedStudentId={id}");
    expect(studentDetail).toContain("resolveStudentProgramHandoff");
    expect(studentDetail).toContain("activePrescriptionPanel === \"prescricao\"");
    expect(studentDetail).toContain("activePrescriptionPanel === \"integrada\"");
    expect(prescriber).toContain("embeddedStudentId?: string");
    expect(prescriber).toContain("const isEmbedded = Boolean(embeddedStudentId)");
    expect(prescriber).toContain("if (embeddedStudentId) setStudentId(embeddedStudentId)");
    expect(prescriber).toContain("{!isEmbedded &&");
    expect(studio).toContain("embeddedStudentId?: string");
    expect(studio).toContain("const isEmbedded = Boolean(embeddedStudentId)");
    expect(studio).toContain("if (embeddedStudentId) setStudentId(embeddedStudentId)");
    expect(studio).toContain("{!isEmbedded &&");
    expect(studio).toContain("Prescrição Integrada");
  });

  it("moves cycle calendar and finance to overview, anamnesis to program, workouts to analysis, and progress photos to evaluation", () => {
    expect(studentDetail).toContain("renderCycleCalendar()");
    expect(studentDetail.indexOf("renderCycleCalendar()")).toBeLessThan(studentDetail.indexOf('value="program"'));
    expect(studentDetail).not.toContain('TabsContent value="anamnesis"');
    expect(studentDetail).not.toContain('TabsContent value="financial"');
    expect(studentDetail.indexOf('title="FINANCEIRO"')).toBeLessThan(studentDetail.indexOf('value="program"'));
    expect(studentDetail.indexOf('title="ANAMNESE"')).toBeGreaterThan(studentDetail.indexOf('value="program"'));
    expect(studentDetail.indexOf('title="ANAMNESE"')).toBeLessThan(studentDetail.indexOf('value="analytics"'));
    expect(studentDetail.indexOf("renderWorkoutCycles()")).toBeGreaterThan(studentDetail.indexOf('value="analytics"'));
    expect(studentDetail.indexOf("<ProgressPhotosPanel")).toBeGreaterThan(studentDetail.indexOf('value="evaluations"'));
    expect(studentDetail).toContain("PROVAS E METAS");
    expect(studentDetail).toContain("<CollapsibleCard title=\"PROVAS E METAS\"");
  });

  it("summarizes volume alerts behind an explicit see-more control", () => {
    const analysis = source("src/components/trainer/WorkoutAnalysis.tsx");

    expect(analysis).toContain("showAllVolumeAlerts");
    expect(analysis).toContain("visibleVolumeAlerts");
    expect(analysis).toContain("Ver mais alertas");
    expect(analysis).toContain("Ocultar alertas");
  });
});
