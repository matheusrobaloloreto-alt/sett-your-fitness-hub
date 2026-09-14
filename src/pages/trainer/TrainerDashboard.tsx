import AdminDashboard from "@/pages/admin/AdminDashboard";

export default function TrainerDashboard() {
  return (
    <AdminDashboard
      readOnly
      routePrefixOverride="trainer"
      title="PAINEL DA EMPRESA"
      subtitle="Mesmos indicadores, alertas, renovações, aniversários e análises do painel administrativo."
      includeCoordinatorPanels
    />
  );
}
