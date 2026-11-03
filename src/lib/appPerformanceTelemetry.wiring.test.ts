import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const studentSource = readFileSync(resolve(process.cwd(), "src/pages/student/StudentWorkout.tsx"), "utf8");
const studentPortalSource = readFileSync(resolve(process.cwd(), "src/pages/student/StudentPortal.tsx"), "utf8");
const trainerSource = readFileSync(resolve(process.cwd(), "src/pages/admin/WhatsAppChat.tsx"), "utf8");
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260827170000_app_performance_telemetry.sql",
);

describe("app performance telemetry wiring", () => {
  it("records shell and content readiness on the student workout without entity identifiers", () => {
    expect(studentSource).toContain("recordAppPerformanceSample");
    const ast = ts.createSourceFile("StudentWorkout.tsx", studentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "recordAppPerformanceSample") calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(calls).toHaveLength(1);
    expect(calls[0].arguments).toHaveLength(1);
    const payload = calls[0].arguments[0];
    expect(ts.isObjectLiteralExpression(payload)).toBe(true);
    if (!ts.isObjectLiteralExpression(payload)) throw new Error("Telemetry must use an explicit object payload");
    expect(payload.properties.every(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && ts.isIdentifier(property.name))).toBe(true);
    const properties = payload.properties.filter((property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property));
    expect(properties.map(property => property.name.getText(ast)).sort()).toEqual(["companyId", "durationMs", "metric", "routeGroup"]);
    const values = new Map(properties.map(property => [property.name.getText(ast), ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer]));
    expect(values.get("routeGroup")?.getText(ast)).toBe('"student_workout"');
    expect(values.get("metric")?.getText(ast)).toBe("metric");
    expect(values.get("durationMs")?.getText(ast)).toBe("performance.now() - performanceStartedAt.current");
    expect(values.get("companyId")?.getText(ast)).toBe("performanceCompanyId.current");
    expect(studentSource).toContain('routeGroup: "student_workout"');
    expect(studentSource).toContain("companyId: performanceCompanyId.current");
    expect(studentSource).toContain('recordLoadPerformance("shell_ready")');
    expect(studentSource).toContain('recordLoadPerformance("content_ready")');
  });

  it("records the real /aluno portal shell and content milestones", () => {
    expect(studentPortalSource).toContain("recordAppPerformanceSample");
    expect(studentPortalSource).toContain('routeGroup: "student_workout"');
    expect(studentPortalSource).toContain("companyId: performanceCompanyId.current");
    expect(studentPortalSource).toContain('recordLoadPerformance("shell_ready")');
    expect(studentPortalSource).toContain('recordLoadPerformance("content_ready")');
    expect(studentPortalSource).toContain("setLoading(false);");
    expect(studentPortalSource).toContain("Carregando seu treino…");
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
