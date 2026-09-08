export type IntercycleStatus = "disabled" | "opted_in" | "scheduled" | "sending" | "sent" | "responded" | "failed" | "cancelled";
export type DeliveryIntercycleStatus = Exclude<IntercycleStatus, "disabled" | "opted_in">;

export function intercycleAnamnesisPath(token: string) {
  return `/anamnese-interciclos/${encodeURIComponent(token.trim())}`;
}

export function intercycleStatusLabel(status: IntercycleStatus) {
  return ({ disabled: "Desativado", opted_in: "Opt-in ativo", scheduled: "Envio agendado", sending: "Enviando", sent: "Enviado", responded: "Respondido", failed: "Falhou", cancelled: "Cancelado" } as const)[status];
}

export function isIntercycleWindow(startDate?: string | null, now = new Date()) {
  if (!startDate) return false;
  const start = new Date(`${startDate}T00:00:00`);
  const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
  return day >= 29 && day <= 42;
}

export function canManuallyScheduleIntercycle(status?: DeliveryIntercycleStatus | null) {
  return !status || status === "scheduled" || status === "failed" || status === "cancelled";
}

export function canManuallyCancelIntercycle(status?: DeliveryIntercycleStatus | null) {
  return status === "scheduled" || status === "failed";
}
