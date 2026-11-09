import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDENT_PROGRAM_PRIMARY_TABS, resolveStudentProgramHandoff, resolveStudentProgramReturnTo } from "./studentProgramSections";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("student profile program reorganization contract", () => {
  const studentDetail = source("src/pages/admin/StudentDetail.tsx");
  const sidebar = source("src/components/AppSidebar.tsx");
  const app = source("src/App.tsx");
  const studio = source("src/pages/admin/PrescriptionStudio.tsx");
  const prescriber = source("src/pages/admin/UnifiedPrescriber.tsx");

  it("exposes the requested primary tabs and resolves prescription handoffs behaviorally", () => {
    expect(STUDENT_PROGRAM_PRIMARY_TABS).toEqual([
      { value: "overview", label: "Visão geral" },
      { value: "program", label: "Treino" },
      { value: "evaluations", label: "Avaliação e anamnese" },
      { value: "analytics", label: "Acompanhamento" },
      { value: "registration", label: "Cadastro" },
      { value: "enrollments", label: "Matrículas" },
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

    expect(dashboard).toContain("?tab=prescricao");
    expect(dashboard).toContain("`/${routePrefix}/students/${m.student_id}`");
    expect(studentDetail).toContain("EmbeddedPrescriptionStudio");
    expect(studentDetail).not.toContain("EmbeddedUnifiedPrescriber");
    expect(studentDetail).not.toContain("@/pages/admin/UnifiedPrescriber");
    expect(studentDetail).toContain("ManualPrescriptionPanel");
    expect(studentDetail).toContain("openManualPrescriptionBuilder");
    expect(studentDetail).toContain("workoutBuilderUrl({ role, studentId: id, cycleId: targetCycle.id, returnTab: activeTab })");
    expect(studentDetail).toContain("resolveManualPrescriptionTargetCycle");
    expect(studentDetail).toContain("embeddedStudentId={id}");
    expect(studentDetail).toContain("resolveStudentProgramHandoff");
    expect(studentDetail).toContain('new URLSearchParams(location.search).get("tab")');
    expect(studentDetail).toContain("activePrescriptionPanel === \"prescricao\"");
    expect(studentDetail).toContain("activePrescriptionPanel === \"integrada\"");
    expect(studentDetail).toContain("resolveStudentProgramReturnTo");
    expect(studentDetail).toContain('new URLSearchParams(location.search).get("returnTo")');
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

  it("resolves safe return targets for profile handoffs", () => {
    const fallbackPath = "/admin/students";

    expect(resolveStudentProgramReturnTo({
      stateReturnTo: "/admin/whatsapp-chat",
      queryReturnTo: "/admin/students",
      fallbackPath,
    })).toBe("/admin/whatsapp-chat");

    expect(resolveStudentProgramReturnTo({
      queryReturnTo: "/admin/whatsapp-chat?chatId=chat-1",
      fallbackPath,
    })).toBe("/admin/whatsapp-chat?chatId=chat-1");

    expect(resolveStudentProgramReturnTo({ queryReturnTo: "https://example.com", fallbackPath })).toBe(fallbackPath);
    expect(resolveStudentProgramReturnTo({ queryReturnTo: "//example.com", fallbackPath })).toBe(fallbackPath);
  });

  it("groups the existing flows by the approved profile tabs", () => {
    const tab = (value: string) => studentDetail.split(`<TabsContent value="${value}"`)[1]?.split("</TabsContent>")[0];
    expect(tab("overview")).toContain("<WeeklyContactToggle");
    expect(tab("overview")).toContain("<IntercycleAnamnesisControls");
    expect(tab("program")).toContain("renderCycleCalendar()");
    expect(tab("program")).toContain("<PlanVersionsCard");
    expect(tab("analytics")).toContain("renderWorkoutCycles()");
    expect(tab("analytics")).toContain("PROVAS E METAS");
    expect(tab("evaluations")).toContain('title="ANAMNESE"');
    expect(tab("evaluations")).toContain("<StudentBodyMap");
    expect(tab("evaluations")).toContain("<ProgressPhotosPanel");
    expect(tab("registration")).toContain('title="FINANCEIRO"');
    expect(tab("enrollments")).toContain("MATRÍCULAS");
  });

  it("summarizes volume alerts behind an explicit see-more control", () => {
    const analysis = source("src/components/trainer/WorkoutAnalysis.tsx");

    expect(analysis).toContain("showAllVolumeAlerts");
    expect(analysis).toContain("visibleVolumeAlerts");
    expect(analysis).toContain("Ver mais alertas");
    expect(analysis).toContain("Ocultar alertas");
  });
});
