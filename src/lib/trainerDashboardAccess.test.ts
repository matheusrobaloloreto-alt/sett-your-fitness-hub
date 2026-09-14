import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/App.tsx", "utf8");
const permissionSource = readFileSync("src/hooks/useRolePermissions.tsx", "utf8");
const staffPermissionSource = readFileSync("src/hooks/useStaffPermission.ts", "utf8");
const trainerDashboardSource = readFileSync("src/pages/trainer/TrainerDashboard.tsx", "utf8");
const renewalsPanelSource = readFileSync("src/components/dashboard/RenewalsAndCyclesPanel.tsx", "utf8");
const teamManagerSource = readFileSync("src/pages/admin/TeamManager.tsx", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260820113000_add_explicit_staff_permissions.sql", "utf8");
const trainerDashboardMigrationSource = readFileSync("supabase/migrations/20260914152000_trainer_company_dashboard_read_access.sql", "utf8");
const adminDashboardSource = readFileSync("src/pages/admin/AdminDashboard.tsx", "utf8");
const dashboardAlertsSource = readFileSync("src/components/DashboardAlerts.tsx", "utf8");
const databaseExtensionSource = readFileSync("src/integrations/supabase/database.ts", "utf8");
const supabaseTypesSource = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("trainer dashboard access contract", () => {
  it("grants trainers the dashboard module by default and gates the route", () => {
    expect(permissionSource).toContain('trainer: ["dashboard"');
    expect(appSource).toContain(
      'path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><TrainerDashboard /></FeatureRoute>}',
    );
  });

  it("uses the full company dashboard for trainers in read-only mode", () => {
    expect(staffPermissionSource).toContain('"company_dashboard_full"');
    expect(staffPermissionSource).toContain("companyId");
    expect(staffPermissionSource).toContain('rpc("has_staff_permission"');
    expect(staffPermissionSource).not.toContain('role === "trainer" && permission === "company_dashboard_full"');
    expect(trainerDashboardSource).toContain("<AdminDashboard");
    expect(trainerDashboardSource).toContain("readOnly");
    expect(trainerDashboardSource).toContain('routePrefixOverride="trainer"');
    expect(trainerDashboardSource).toContain("includeCoordinatorPanels");
    expect(adminDashboardSource).toContain("readOnly?: boolean");
    expect(adminDashboardSource).toContain('rpc("get_company_dashboard_snapshot"');
    expect(adminDashboardSource).toContain("parseCompanyDashboardSnapshot");
    expect(adminDashboardSource).toContain("DashboardSnapshotContext.Provider");
    expect(adminDashboardSource).toContain("<DashboardAlerts readOnly={readOnly} />");
    expect(adminDashboardSource).toContain("enabled: !readOnly");
    expect(adminDashboardSource).not.toContain("useStaffPermission");
    expect(teamManagerSource).toContain("Dashboard da empresa");
    expect(teamManagerSource).toContain("Disponível automaticamente para treinadores como visualização");
    expect(teamManagerSource).not.toContain('_permission: "company_dashboard_full"');
    expect(teamManagerSource).not.toContain('rpc("set_staff_permission"');
    expect(teamManagerSource).toContain("aria-readonly");
    expect(staffPermissionSource).not.toContain('rpc("has_staff_permission" as any');
    expect(teamManagerSource).not.toContain('rpc("set_staff_permission" as any');
  });

  it("keeps historical grants while using a dedicated read-model RPC for trainer dashboard data", () => {
    expect(migrationSource).toContain("unique (company_id, user_id, permission)");
    expect(migrationSource).toContain("public.can_read_staff_student");
    expect(migrationSource).toContain("public.can_manage_staff_student");
    expect(migrationSource).toContain("has_role(auth.uid(), 'admin'::public.app_role)");
    expect(trainerDashboardMigrationSource).toContain("create or replace function public.get_company_dashboard_snapshot");
    expect(trainerDashboardMigrationSource).toContain("security definer");
    expect(trainerDashboardMigrationSource).toContain("ur.role = 'trainer'::public.app_role");
    expect(trainerDashboardMigrationSource).toContain("drop policy if exists staff_leads on public.leads");
    expect(trainerDashboardMigrationSource).toContain("grant execute on function public.get_company_dashboard_snapshot");
    expect(trainerDashboardMigrationSource).not.toContain("create or replace function public.has_staff_permission");
    expect(trainerDashboardMigrationSource).not.toContain("create or replace function public.can_read_staff_student");
    expect(trainerDashboardMigrationSource).not.toContain("create or replace function public.can_manage_staff_student");
    expect(trainerDashboardMigrationSource).not.toContain("create or replace function public.set_staff_permission");
    expect(trainerDashboardMigrationSource).not.toContain("create or replace function public.count_company_trainers");
    expect(trainerDashboardMigrationSource).not.toContain("admin alerts staff update");
    expect(migrationSource).toContain("revoke all on table public.staff_permissions from public, anon, authenticated");
    expect(migrationSource).toContain("grant select on table public.staff_permissions to authenticated");
    expect(migrationSource).not.toContain("grant select, insert, update on public.staff_permissions to authenticated");
    expect(permissionSource).toContain('trainer: ["dashboard"');
    expect(permissionSource).not.toContain("company_dashboard_full");
    for (const rpc of [
      "can_manage_staff_student",
      "can_read_staff_student",
      "has_staff_permission",
      "set_staff_permission",
    ]) {
      expect(supabaseTypesSource).toContain(`${rpc}: {`);
    }
    expect(databaseExtensionSource).toContain("get_company_dashboard_snapshot");
  });

  it("refreshes grants when the tab becomes active so revocation is not stale", () => {
    expect(staffPermissionSource).toContain('document.addEventListener("visibilitychange"');
    expect(staffPermissionSource).toContain('window.addEventListener("focus"');
  });

  it("leaves enrollment lifecycle mutation exclusively to the server", () => {
    expect(trainerDashboardSource).not.toContain("process_enrollment_lifecycle");
    expect(renewalsPanelSource).not.toContain("process_enrollment_lifecycle");
  });

  it("hides administrative actions from the read-only company dashboard", () => {
    expect(adminDashboardSource).toContain("if (readOnly) return");
    expect(adminDashboardSource).toContain("{!readOnly && (");
    expect(adminDashboardSource).toContain("navigateWhenInteractive");
    expect(dashboardAlertsSource).toContain("readOnly?: boolean");
    expect(dashboardAlertsSource).toContain("enabled: !readOnly");
    expect(dashboardAlertsSource).toContain("item.resolveId && !readOnly");
    expect(dashboardAlertsSource).toContain("item.birthday && !readOnly");
    expect(readFileSync("src/components/admin/ContactCadenceCard.tsx", "utf8")).toContain("snapshot?.contactCadence");
    expect(readFileSync("src/components/admin/MonthlyPrescriptionsCard.tsx", "utf8")).toContain("snapshot?.monthlyPrescriptions");
    expect(readFileSync("src/components/admin/PendingFeedbackCard.tsx", "utf8")).toContain("snapshot?.pendingFeedback");
    expect(readFileSync("src/components/admin/CohortInsightsCard.tsx", "utf8")).toContain("snapshot?.cohortFeedback");
    expect(readFileSync("src/components/admin/AtRiskStudents.tsx", "utf8")).toContain("snapshot?.atRiskStudents");
    expect(readFileSync("src/components/dashboard/RenewalsAndCyclesPanel.tsx", "utf8")).toContain("enabled: !readOnly");
    expect(dashboardAlertsSource).toContain("enabled: !readOnly");
    expect(trainerDashboardSource).not.toContain("Renovar agora");
    expect(trainerDashboardSource).not.toContain("Prescrever");
  });
});
