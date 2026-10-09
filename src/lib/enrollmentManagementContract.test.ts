import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261009163324_guard_enrollment_overlap_and_staff_controls.sql",
  "utf8",
);
const studentDetail = readFileSync("src/pages/admin/StudentDetail.tsx", "utf8");

describe("enrollment management contract", () => {
  it("rejects a new overlapping operational term while preserving completed history", () => {
    expect(migration).toContain("other.start_date <= new.end_date");
    expect(migration).toContain("new.start_date <= other.end_date");
    expect(migration).toContain("other.status <> 'completed'");
    expect(migration).toContain("from public.students where id = new.student_id and company_id = new.company_id for update");
  });

  it("changes status atomically and does not delete an enrollment with history", () => {
    expect(migration).toContain("create or replace function public.set_student_enrollment_status");
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain("create trigger zz_guard_enrollment_delete_with_history");
    expect(migration).toContain("constraint_row.confrelid = 'public.enrollments'::regclass");
    expect(migration).toContain("public.can_manage_staff_student");
  });

  it("exposes explicit actions and never labels an inactive cycle as visible to the student", () => {
    expect(studentDetail).toContain('rpc("set_student_enrollment_status"');
    expect(studentDetail).toContain('rpc("delete_empty_student_enrollment"');
    expect(studentDetail).toContain("Ativar matrícula com treino");
    expect(studentDetail).toContain("manualPrescriptionEnrollment?.id === e.id && studentVisibleCycleForEnrollment(e)?.id === c.id");
  });
});
