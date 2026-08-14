import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/App.tsx", "utf8");
const permissionSource = readFileSync("src/hooks/useRolePermissions.tsx", "utf8");
const trainerDashboardSource = readFileSync("src/pages/trainer/TrainerDashboard.tsx", "utf8");

describe("trainer dashboard access contract", () => {
  it("grants trainers the dashboard module by default and gates the route", () => {
    expect(permissionSource).toContain('trainer: ["dashboard"');
    expect(appSource).toContain(
      'path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><TrainerDashboard /></FeatureRoute>}',
    );
  });

  it("keeps the trainer dashboard scoped to the authenticated trainer's enrollments", () => {
    expect(trainerDashboardSource).toContain('.eq("trainer_id", user!.id)');
    expect(trainerDashboardSource).toContain('<DashboardAlerts trainerId={user?.id} />');
  });

  it("does not expose the company-wide admin dashboard on the trainer route", () => {
    expect(appSource).not.toContain(
      'path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><AdminDashboard /></FeatureRoute>}',
    );
  });
});
