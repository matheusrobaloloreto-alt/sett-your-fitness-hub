import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260901140000_influencer_plan_classification.sql", "utf8");
const studentsManager = readFileSync("src/pages/admin/StudentsManager.tsx", "utf8");
const studentDetail = readFileSync("src/pages/admin/StudentDetail.tsx", "utf8");
const dashboardAlerts = readFileSync("src/components/DashboardAlerts.tsx", "utf8");
const paymentContext = readFileSync("supabase/functions/public-payment-context/index.ts", "utf8");
const asaasIntegration = readFileSync("supabase/functions/asaas-integration/index.ts", "utf8");

describe("Influenciador(a) plan contract", () => {
  it("defines an idempotent tenant-scoped plan and category", () => {
    expect(migration).toContain("add column if not exists plan_kind");
    expect(migration).toContain("'Influenciador(a)'");
    expect(migration).toContain("not exists (");
    expect(migration).toContain("plans_one_influencer_per_company_uidx");
    expect(migration).toContain("company.slug = 'bn-performance-training'");
    expect(migration).toContain("'plano influ'");
    expect(migration).not.toContain("from public.companies company\nwhere not exists");
  });

  it("activates and classifies atomically without fabricating enrollment or payment", () => {
    const start = migration.indexOf("create or replace function public.classify_influencer_student");
    const body = migration.slice(start);
    expect(body).toContain("public.is_company_staff(auth.uid(), v_student.company_id)");
    expect(body).toContain("v_plan.company_id is distinct from v_student.company_id");
    expect(body).toContain("v_plan.plan_kind <> 'influencer'");
    expect(body).toContain("selected_plan_id = v_plan.id");
    expect(body).toContain("category_id = v_category_id");
    expect(body).toContain("status = 'active'");
    expect(body).not.toContain("insert into public.enrollments");
    expect(body).not.toContain("insert into public.payments");
  });

  it("uses the protected classifier from both staff selection surfaces", () => {
    expect(studentsManager).toContain('rpc("classify_influencer_student"');
    expect(studentDetail).toContain('rpc("classify_influencer_student"');
    expect(studentDetail).toContain("planOperationalRequirements");
  });

  it("keeps influencer plans outside every payment path", () => {
    expect(paymentContext).toContain('.eq("plan_kind", "standard")');
    expect(asaasIntegration).toContain('plan.plan_kind !== "standard"');
  });

  it("does not raise enrollment, billing, trainer or date alerts for influencer classifications", () => {
    expect(dashboardAlerts).toContain('.eq("plan_kind", "influencer")');
    expect(dashboardAlerts.match(/!influencerPlanIds\.has\(s\.selected_plan_id\)/g)).toHaveLength(2);
    expect(dashboardAlerts.match(/!influencerPlanIds\.has\(e\.students\?\.selected_plan_id\)/g)).toHaveLength(2);
    expect(dashboardAlerts.match(/students\(full_name, selected_plan_id\)/g)).toHaveLength(2);
  });
});
