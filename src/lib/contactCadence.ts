// Cadência de Contatos — formatação do tempo desde a última mensagem RECEBIDA.
// "5h" até 23h; a partir de 24h vira dias: "1 dia", "7 dias".

import { DEFAULT_COMPANY_PRODUCT_SETTINGS, type CompanyProductSettings } from '../../supabase/functions/_shared/company-product-settings';
export type CadenceTone = "ok" | "warn" | "late";

export function formatCadence(hoursSince: number): string {
  const h = Math.max(0, Math.floor(Number.isFinite(hoursSince) ? hoursSince : 0));
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** Tom do alerta: verde <24h · âmbar 1–3 dias · vermelho >3 dias. */
export function cadenceTone(hoursSince: number, policy: Pick<CompanyProductSettings['experience'], 'cadence_warning_hours' | 'cadence_critical_hours'> = DEFAULT_COMPANY_PRODUCT_SETTINGS.experience): CadenceTone {
  const safeHours = Math.max(0, Number.isFinite(hoursSince) ? hoursSince : 0);
  if (safeHours < policy.cadence_warning_hours) return "ok";
  if (safeHours < policy.cadence_critical_hours) return "warn";
  return "late";
}

export interface CadenceRow {
  chat_id: string;
  contact_name: string | null;
  student_id: string | null;
  student_name: string | null;
  student_status: string | null;
  kind: "lead" | "aluno";
  last_inbound_at: string;
  hours_since: number;
}

export function cadenceDisplayName(row: CadenceRow): string {
  return row.student_name || row.contact_name || "Contato sem nome";
}

export type CadenceWindowDays = 7 | 14 | 30 | 90;

export function filterCadenceByWindow(rows: CadenceRow[], days: CadenceWindowDays, now = Date.now()): CadenceRow[] {
  const oldestInbound = now - days * 86_400_000;
  return rows.filter((row) => {
    const inbound = Date.parse(row.last_inbound_at);
    return Number.isFinite(row.hours_since) && inbound >= oldestInbound && inbound <= now;
  });
}
