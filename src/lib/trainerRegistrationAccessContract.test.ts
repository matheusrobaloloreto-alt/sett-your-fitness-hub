import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/App.tsx", "utf8");
const sidebarSource = readFileSync("src/components/AppSidebar.tsx", "utf8");
const registrationManagerSource = readFileSync("src/pages/admin/RegistrationManager.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Contrato não encontrado: ${start}`);
  return source.slice(startIndex, endIndex);
}

describe("trainer registration and appearance access contract", () => {
  it("keeps trainer direct routes available while preserving role and feature gates", () => {
    expect(appSource).toContain(
      'path="/trainer/registration" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasRegistration"><RegistrationManager /></FeatureRoute>}',
    );
    expect(appSource).toContain(
      'path="/trainer/anamnesis" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAnamnesis"><AnamnesisManager /></FeatureRoute>}',
    );
    expect(appSource).toContain(
      'path="/trainer/appearance" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAppearance"><AppearanceSettings /></FeatureRoute>}',
    );
    expect(appSource).toContain('<Route path="/trainer/financial" element={<Navigate to="/trainer" replace />} />');
  });

  it("keeps admin and coordinator registration routes module-gated", () => {
    expect(appSource).toContain(
      'path="/admin/registration" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasRegistration"><RegistrationManager /></FeatureRoute>}',
    );
    expect(appSource).toContain(
      'path="/admin/appearance" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAppearance"><AppearanceSettings /></FeatureRoute>}',
    );
    expect(appSource).toContain(
      'path="/coordinator/registration" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasRegistration" requiredModule="registration"><RegistrationManager /></FeatureRoute>}',
    );
    expect(appSource).toContain(
      'path="/coordinator/anamnesis" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAnamnesis" requiredModule="anamnesis"><AnamnesisManager /></FeatureRoute>}',
    );
    expect(appSource).toContain(
      'path="/coordinator/appearance" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAppearance" requiredModule="appearance"><AppearanceSettings /></FeatureRoute>}',
    );
  });

  it("shows trainer sidebar destinations that match the available direct routes", () => {
    const trainerItems = sourceBetween(sidebarSource, "const trainerAllItems = [", "];");
    expect(trainerItems).toContain('{ title: "Interessados", url: "/trainer/registration", icon: UserPlus }');
    expect(trainerItems).toContain('{ title: "Anamnese", url: "/trainer/anamnesis", icon: FileText }');
    expect(trainerItems).toContain('{ title: "Aparência", url: "/trainer/appearance", icon: Palette }');
    expect(trainerItems).not.toContain('/trainer/financial');
    expect(sidebarSource).toContain('const trainerAlwaysAvailableModules = new Set<PermissionModule>([');
    expect(sidebarSource).toContain('"registration"');
    expect(sidebarSource).toContain('"anamnesis"');
    expect(sidebarSource).toContain('"appearance"');
  });

  it("exposes the complete interested and closing workflow to trainers", () => {
    expect(registrationManagerSource).not.toContain('const isTrainerView = role === "trainer";');
    expect(registrationManagerSource).toContain("Cadastro fiscal, escolha do plano e pagamento");
    expect(registrationManagerSource).toContain("Link de renovação");
    expect(registrationManagerSource).toContain("Esteira de fechamento");
    expect(registrationManagerSource).toContain("Regra operacional");
    expect(registrationManagerSource).not.toContain("{!isTrainerView && (");
  });
});
