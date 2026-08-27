import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const studentSource = readFileSync(resolve(process.cwd(), "src/pages/student/StudentWorkout.tsx"), "utf8");
const trainerSource = readFileSync(resolve(process.cwd(), "src/pages/admin/WhatsAppChat.tsx"), "utf8");
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260827170000_app_performance_telemetry.sql",
);

describe("app performance telemetry wiring", () => {
  it("records shell and content readiness on the student workout without entity identifiers", () => {
    expect(studentSource).toContain("recordAppPerformanceSample");
    expect(studentSource).toContain('.select("full_name, company_id")');
    expect(studentSource).toContain('routeGroup: "student_workout"');
    expect(studentSource).toContain("companyId: performanceCompanyId.current");
    expect(studentSource).toContain('recordLoadPerformance("shell_ready")');
    expect(studentSource).toContain('recordLoadPerformance("content_ready")');
  });

  it("records trainer chat readiness after the first successful chat list", () => {
    expect(trainerSource).toContain("recordAppPerformanceSample");
    expect(trainerSource).toContain('routeGroup: "trainer_whatsapp"');
    expect(trainerSource).toContain('metric: "content_ready"');
    expect(trainerSource).toContain("companyId: effectiveCompanyId");
    expect(trainerSource).toContain("recordedChatPerformance.current = false");
  });

  it("uses a private append-only table and a tenant-derived RPC", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("create table if not exists public.app_performance_samples");
    expect(sql).toContain("revoke all on public.app_performance_samples from public, anon, authenticated");
    expect(sql).toContain("security definer");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("from public.students");
    expect(sql).toContain("record_app_performance_sample");
    expect(sql).toContain("get_app_performance_percentiles");
    const recordFunction = sql.split("create or replace function public.record_app_performance_sample")[1]
      ?.split("revoke all on function public.record_app_performance_sample")[0] || "";
    expect(recordFunction).toContain("if p_route_group = 'trainer_whatsapp' then");
    expect(recordFunction).toContain("p_company_id uuid");
    expect(recordFunction).toContain("public.is_company_staff(v_actor, p_company_id)");
    expect(recordFunction).toContain("s.company_id = p_company_id");
    expect(recordFunction).not.toContain("order by cm.created_at");
    expect(sql).not.toContain("student_id");
    expect(sql).not.toContain("message_id");
    expect(sql).not.toContain("workout_id");
  });
});
