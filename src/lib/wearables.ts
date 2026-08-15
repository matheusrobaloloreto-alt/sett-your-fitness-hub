export interface DisplayMetric {
  metric: string;
  value: number | null;
  unit: string | null;
  score_state: string | null;
}

export function wearableMetricDisplay(metric: DisplayMetric) {
  if (metric.score_state !== "SCORED" || metric.value === null || !Number.isFinite(metric.value)) {
    return { value: "—", unit: "aguardando cálculo" };
  }
  const rounded = Math.round(metric.value * 10) / 10;
  if (metric.unit === "whoop_0_21") return { value: String(rounded), unit: "/21" };
  if (metric.unit === "percent") return { value: String(Math.round(metric.value)), unit: "/100" };
  if (metric.unit === "hours") return { value: String(rounded), unit: "h" };
  return { value: String(rounded), unit: metric.unit || "" };
}

export const WEARABLE_STATUS_LABELS: Record<string, string> = {
  connected: "Conectado",
  syncing: "Sincronizando",
  stale: "Dados desatualizados",
  error: "Erro de sincronização",
  revoked: "Desconectado",
  revocation_pending: "Revogação pendente",
  config_required: "Configuração pendente",
  partial_scope: "Permissões incompletas",
};
