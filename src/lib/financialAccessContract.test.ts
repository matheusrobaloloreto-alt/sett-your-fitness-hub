import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canRoleUseModule } from "./rolePermissionPolicy";

const appSource = readFileSync("src/App.tsx", "utf8");
const sidebarSource = readFileSync("src/components/AppSidebar.tsx", "utf8");
const permissionSource = readFileSync("src/hooks/useRolePermissions.tsx", "utf8");
const teamManagerSource = readFileSync("src/pages/admin/TeamManager.tsx", "utf8");
const edgeSource = readFileSync("supabase/functions/asaas-integration/index.ts", "utf8");

describe("financial access contract", () => {
  it("keeps financial access available to coordinators but unavailable to trainers", () => {
    expect(canRoleUseModule("coordinator", "financial")).toBe(true);
    expect(canRoleUseModule("trainer", "financial")).toBe(false);
    expect(permissionSource).toContain("if (!canRoleUseModule(r, module)) continue;");
    expect(teamManagerSource).toContain("canRoleUseModule(r.key, mod.key)");
  });

  it("does not expose a trainer financial dashboard route or sidebar destination", () => {
    expect(appSource).toContain('<Route path="/trainer/financial" element={<Navigate to="/trainer" replace />} />');
    expect(appSource).not.toContain(
      'path="/trainer/financial" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasFinancial" requiredModule="financial"><FinancialDashboard /></FeatureRoute>}',
    );
    expect(sidebarSource).not.toContain('{ title: "Financeiro", url: "/trainer/financial", icon: DollarSign }');
  });

  it("keeps provider-backed financial actions limited to authorized roles and the same tenant", () => {
    expect(edgeSource).toContain('_role: "master"');
    expect(edgeSource).toContain('_role: "admin"');
    expect(edgeSource).toContain('_role: "coordinator"');
    expect(edgeSource).not.toContain('_role: "trainer"');
    expect(edgeSource).toContain('if (!hasMaster && targetCompanyId !== userCompanyId)');
    expect(edgeSource).toContain('Forbidden: company mismatch.');
    expect(edgeSource).toContain('Forbidden: student/company mismatch.');
    expect(edgeSource).toContain('Forbidden: payment/company mismatch.');
  });
});
