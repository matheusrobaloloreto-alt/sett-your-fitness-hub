import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("manual enrollment replacement contract", () => {
  const manualEnrollmentSources = [
    "src/pages/admin/StudentDetail.tsx",
    "src/pages/admin/StudentsManager.tsx",
    "src/pages/coordinator/CoordinatorDashboard.tsx",
  ];

  it("routes manual enrollment creation through the authenticated replacement RPC", () => {
    for (const path of manualEnrollmentSources) {
      const text = source(path);
      expect(text).toContain('rpc("replace_student_enrollment"');
      expect(text).toContain("_clear_carried_over_cycle: false");
      expect(text).not.toContain('from("enrollments").insert');
      expect(text).not.toContain("from('enrollments').insert");
    }
  });

  it("keeps activation and trainer assignment inside the replacement RPC", () => {
    const studentDetail = source("src/pages/admin/StudentDetail.tsx");
    const studentsManager = source("src/pages/admin/StudentsManager.tsx");
    const coordinatorDashboard = source("src/pages/coordinator/CoordinatorDashboard.tsx");

    expect(studentDetail).not.toContain("update({ assigned_trainer_id: selectedTrainerId })");
    expect(studentsManager).not.toContain("activated_at: new Date().toISOString()");
    expect(coordinatorDashboard).not.toContain("activated_at: new Date().toISOString()");
  });

  it("keeps the coordinator enrollment UI minimal and preserves date-only values", () => {
    const coordinatorDashboard = source("src/pages/coordinator/CoordinatorDashboard.tsx");

    expect(coordinatorDashboard).toContain('useState({ plan_id: "", start_date: format(new Date(), "yyyy-MM-dd") })');
    expect(coordinatorDashboard).toContain("_trainer_id: selectedStudent.assigned_trainer_id ?? null");
    expect(coordinatorDashboard).toContain("_start_date: enrollForm.start_date");
    expect(coordinatorDashboard).toContain("parseISO(enrollForm.start_date)");
    expect(coordinatorDashboard).not.toContain('Label className="font-sans">Treinador *');
    expect(coordinatorDashboard).not.toContain("new Date(enrollForm.start_date)");
  });
});
