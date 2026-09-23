import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  "supabase/migrations/20260922110000_trainer_company_student_read_access.sql",
  "utf8",
);
const portfolioSource = readFileSync("src/pages/admin/Portfolio.tsx", "utf8");
const studentsManagerSource = readFileSync("src/pages/admin/StudentsManager.tsx", "utf8");

describe("trainer company student access", () => {
  it("grants company-wide reads without changing the management helper", () => {
    expect(migrationSource).toContain("create or replace function public.can_read_staff_student");
    expect(migrationSource).toContain("public.is_company_staff(auth.uid(), _company_id)");
    expect(migrationSource).not.toContain("create or replace function public.can_manage_staff_student");
    expect(migrationSource).toContain("public.can_manage_staff_student(company_id, student_id)");
    expect(migrationSource).toContain("weekly_contact_consent_events_staff_read");
    expect(migrationSource).toContain('"intercycle answers company staff read"');
    expect(migrationSource).toContain("as restrictive for update");
    expect(migrationSource).toContain("as restrictive for delete");
    expect(migrationSource).toContain("as restrictive for insert");
  });

  it("shows every company student by default and keeps trainer mutations scoped", () => {
    expect(portfolioSource).toContain('const ALL_STUDENTS = "all"');
    expect(portfolioSource).toContain("selectedIdAtRequest !== ALL_STUDENTS");
    expect(portfolioSource).toContain("<SelectItem value={ALL_STUDENTS}>Todos os alunos</SelectItem>");
    expect(portfolioSource).toContain("const canManageStudent = useCallback");
    expect(studentsManagerSource).toContain("const canManageStudent = (student: Student)");
    expect(studentsManagerSource).toContain("student.enrollment_trainer_id === session?.user?.id");
  });
});
