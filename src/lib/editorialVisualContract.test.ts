import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studentDetailSource = readFileSync("src/pages/admin/StudentDetail.tsx", "utf8");
const studentPortalSource = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");

describe("editorial visual contract", () => {
  it("uses shared editorial primitives in professor and student headers", () => {
    expect(studentDetailSource).toContain("EditorialPageHeader");
    expect(studentDetailSource).toContain("EditorialTabStrip");
    expect(studentPortalSource).toContain("EditorialPageHeader");
  });

  it("does not truncate the professor student name in the page header", () => {
    expect(studentDetailSource).toContain("student.full_name.toUpperCase()");
    expect(studentDetailSource).not.toContain('text-primary truncate">{student.full_name.toUpperCase()}');
  });

  it("keeps professor tabs complete, focusable, and horizontally scrollable on mobile", () => {
    expect(studentDetailSource).toContain('ariaLabel="Seções do aluno"');
    expect(studentDetailSource).not.toContain("rounded-full border border-transparent px-3 py-1.5");
  });
});
