import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/App.tsx", "utf8");
const permissionSource = readFileSync("src/hooks/useRolePermissions.tsx", "utf8");
const staffPermissionSource = readFileSync("src/hooks/useStaffPermission.ts", "utf8");
const trainerDashboardSource = readFileSync("src/pages/trainer/TrainerDashboard.tsx", "utf8");
const renewalsPanelSource = readFileSync("src/components/dashboard/RenewalsAndCyclesPanel.tsx", "utf8");
const teamManagerSource = readFileSync("src/pages/admin/TeamManager.tsx", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260820113000_add_explicit_staff_permissions.sql", "utf8");

describe("trainer dashboard access contract", () => {
  it("grants trainers the dashboard module by default and gates the route", () => {
    expect(permissionSource).toContain('trainer: ["dashboard"');
    expect(appSource).toContain(
      'path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><TrainerDashboard /></FeatureRoute>}',
    );
  });

  it("keeps the dashboard scoped unless that exact trainer has an explicit company grant", () => {
    expect(staffPermissionSource).toContain('"company_dashboard_full"');
    expect(staffPermissionSource).toContain("companyId");
    expect(staffPermissionSource).toContain('rpc("has_staff_permission"');
    expect(trainerDashboardSource).toContain('if (!canViewCompanyDashboard) enrollQuery = enrollQuery.eq("trainer_id", user.id)');
    expect(trainerDashboardSource).toContain('.eq("company_id", companyId)');
    expect(trainerDashboardSource).toContain('trainerId={canViewCompanyDashboard ? undefined : user?.id}');
    expect(teamManagerSource).toContain("Concessão individual");
    expect(teamManagerSource).toContain('_permission: "company_dashboard_full"');
    expect(teamManagerSource).toContain('rpc("set_staff_permission"');
  });

  it("stores the grant per company and user without changing the trainer role defaults", () => {
    expect(migrationSource).toContain("unique (company_id, user_id, permission)");
    expect(migrationSource).toContain("public.can_read_staff_student");
    expect(migrationSource).toContain("public.can_manage_staff_student");
    expect(migrationSource).toContain("has_role(auth.uid(), 'admin'::public.app_role)");
    expect(migrationSource).toContain("revoke all on table public.staff_permissions from public, anon, authenticated");
    expect(migrationSource).toContain("grant select on table public.staff_permissions to authenticated");
    expect(migrationSource).not.toContain("grant select, insert, update on public.staff_permissions to authenticated");
    expect(permissionSource).toContain('trainer: ["dashboard"');
    expect(permissionSource).not.toContain("company_dashboard_full");
  });

  it("refreshes grants when the tab becomes active so revocation is not stale", () => {
    expect(staffPermissionSource).toContain('document.addEventListener("visibilitychange"');
    expect(staffPermissionSource).toContain('window.addEventListener("focus"');
  });

  it("leaves enrollment lifecycle mutation exclusively to the server", () => {
    expect(trainerDashboardSource).not.toContain("process_enrollment_lifecycle");
    expect(renewalsPanelSource).not.toContain("process_enrollment_lifecycle");
  });

  it("does not expose the company-wide admin dashboard on the trainer route", () => {
    expect(appSource).not.toContain(
      'path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><AdminDashboard /></FeatureRoute>}',
    );
  });
});
