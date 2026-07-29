// Cadência de Contatos — formatação do tempo desde a última mensagem RECEBIDA.
// "5h" até 23h; a partir de 24h vira dias: "1 dia", "7 dias".

export type CadenceTone = "ok" | "warn" | "late";

export function formatCadence(hoursSince: number): string {
  const h = Math.max(0, Math.floor(hoursSince));
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** Tom do alerta: verde <24h · âmbar 1–3 dias · vermelho >3 dias. */
export function cadenceTone(hoursSince: number): CadenceTone {
  if (hoursSince < 24) return "ok";
  if (hoursSince < 72) return "warn";
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
