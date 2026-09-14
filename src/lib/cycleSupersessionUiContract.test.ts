import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cycle supersession UI contract", () => {
  it.each([
    "src/pages/admin/WorkoutPrescriptions.tsx",
    "src/pages/admin/AdminDashboard.tsx",
    "src/pages/admin/WhatsAppChat.tsx",
    "src/hooks/useStudentTimeline.ts",
    "src/components/trainer/TrainerWeeklyBar.tsx",
  ])("não carrega ciclos substituídos em %s", (path) => {
    expect(source(path)).toContain('.neq("status", "superseded")');
  });

  it("mantém o dashboard do treinador delegado para o dashboard completo sem perder o filtro de superseded", () => {
    const trainerDashboard = source("src/pages/trainer/TrainerDashboard.tsx");
    const adminDashboard = source("src/pages/admin/AdminDashboard.tsx");
    expect(trainerDashboard).toContain("<AdminDashboard");
    expect(trainerDashboard).toContain("readOnly");
    expect(adminDashboard).toContain('.neq("status", "superseded")');
  });

  it("bloqueia edição direta de um ciclo substituído", () => {
    const builder = source("src/pages/admin/WorkoutBuilder.tsx");
    expect(builder).toContain('data.status === "superseded"');
    expect(builder).toContain("Este ciclo foi substituido por uma prescricao mais recente.");
  });
});
