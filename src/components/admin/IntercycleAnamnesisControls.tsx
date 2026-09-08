import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ClipboardList, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  canManuallyCancelIntercycle,
  canManuallyScheduleIntercycle,
  intercycleStatusLabel,
  isIntercycleWindow,
  type IntercycleStatus,
} from "@/lib/intercycleAnamnesis";

type Cycle = { id: string; start_date: string | null; cycle_number: number | null };
type Delivery = { id: string; status: IntercycleStatus; scheduled_for: string; training_cycle_id: string; retry_count: number; last_error_code: string | null };
type IntercycleAnswerRow = {
  id: string;
  submitted_at: string;
  prescription_evaluation: string;
  goals_continue: boolean;
  availability_changed: boolean;
  pain_present: boolean;
  pain_eva: number | null;
  additional_information: string | null;
  training_cycles?: { cycle_number?: number | null } | null;
};
type DbError = { message?: string } | null;
type QueryResult<Row> = { data: Row[] | null; error?: DbError };
type MaybeSingleResult<Row> = { data: Row | null; error?: DbError };
type TypedQuery<Row> = PromiseLike<QueryResult<Row>> & {
  select: (columns: string) => TypedQuery<Row>;
  eq: (column: string, value: string) => TypedQuery<Row>;
  is: (column: string, value: null) => TypedQuery<Row>;
  or: (filters: string) => TypedQuery<Row>;
  order: (column: string, options: { ascending: boolean }) => TypedQuery<Row>;
  limit: (count: number) => TypedQuery<Row>;
  maybeSingle: () => Promise<MaybeSingleResult<Row>>;
};
const db = supabase as unknown as { from: <Row>(table: string) => TypedQuery<Row> };

export function IntercycleAnamnesisControls({ studentId, companyId, initial }: { studentId: string; companyId: string; initial?: boolean }) {
  const [enabled, setEnabled] = useState(!!initial); const [saving, setSaving] = useState(false); const [cycle, setCycle] = useState<Cycle | null>(null); const [delivery, setDelivery] = useState<Delivery | null>(null);
  const load = useCallback(async () => { const cycles = await db.from<Cycle>("training_cycles").select("id,start_date,cycle_number").eq("student_id", studentId).eq("company_id", companyId).is("superseded_at", null).or("status.is.null,status.not.in.(cancelled,superseded)").order("start_date", { ascending: false }).limit(1); const next = cycles.data?.[0] || null; setCycle(next); if (!next) { setDelivery(null); return; } const result = await db.from<Delivery>("intercycle_anamnesis_deliveries").select("id,status,scheduled_for,training_cycle_id,retry_count,last_error_code").eq("training_cycle_id", next.id).maybeSingle(); setDelivery(result.data || null); }, [studentId, companyId]);
  useEffect(() => { setEnabled(!!initial); void load(); }, [initial, load]);
  const invoke = async (body: Record<string, unknown>) => { const { error } = await supabase.functions.invoke("intercycle-anamnesis", { body: { company_id: companyId, student_id: studentId, ...body } }); if (error) throw error; await load(); };
  const toggle = async (next: boolean) => { setSaving(true); try { await invoke({ action: "opt-in", enabled: next }); setEnabled(next); toast.success(next ? "Anamnese interciclos agendada para todos os ciclos" : "Agendamento interciclos desativado"); } catch { toast.error("Não foi possível atualizar o agendamento"); } finally { setSaving(false); } };
  const nextDate = cycle?.start_date ? new Date(`${cycle.start_date}T00:00:00`).getTime() + 28 * 86_400_000 : null;
  const status: IntercycleStatus = enabled ? (delivery?.status || "opted_in") : "disabled";
  const canScheduleNow = enabled && cycle && isIntercycleWindow(cycle.start_date) && canManuallyScheduleIntercycle(delivery?.status);
  const canCancel = delivery && canManuallyCancelIntercycle(delivery.status);
  return <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><label htmlFor={`intercycle-${studentId}`} className="text-sm font-medium">Anamnese interciclos</label><Switch id={`intercycle-${studentId}`} checked={enabled} disabled={saving} onCheckedChange={toggle} /></div><p className="mt-0.5 text-xs text-muted-foreground">Opt-in para ciclos futuros. Um delivery real só nasce na janela operacional do ciclo, a partir do dia 29; o botão manual só agenda quando essa janela já abriu.</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline">{intercycleStatusLabel(status)}</Badge>{cycle && <span>Ciclo {cycle.cycle_number || "—"}</span>}{nextDate && <span>Janela prevista: {format(new Date(nextDate), "dd/MM", { locale: ptBR })}</span>}{delivery?.status === "failed" && <span className="text-destructive">Tentativas: {delivery.retry_count}</span>}{delivery?.status === "sending" && <span className="text-amber-700">Envio assumido; aguarde confirmação.</span>}{canScheduleNow && <Button size="sm" variant="outline" onClick={() => void invoke({ action: "schedule-now", training_cycle_id: cycle.id }).catch(() => toast.error("Não foi possível agendar"))}><ClipboardList className="mr-1 h-3.5 w-3.5" /> {delivery?.status === "cancelled" ? "Reabrir nesta janela" : "Agendar nesta janela"}</Button>}{canCancel && <Button size="sm" variant="ghost" onClick={() => void invoke({ action: "cancel", delivery_id: delivery.id }).catch(() => toast.error("Não foi possível cancelar"))}><XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>}</div></div></div>;
}

export function IntercycleAnamnesisTimeline({ studentId, companyId }: { studentId: string; companyId: string }) {
  const [rows, setRows] = useState<IntercycleAnswerRow[]>([]);
  useEffect(() => { void db.from<IntercycleAnswerRow>("intercycle_anamneses").select("id,submitted_at,prescription_evaluation,goals_continue,availability_changed,pain_present,pain_eva,additional_information,training_cycles(cycle_number)").eq("student_id", studentId).eq("company_id", companyId).order("submitted_at", { ascending: false }).then(({ data }) => setRows(data || [])); }, [studentId, companyId]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nenhuma Anamnese interciclos respondida ainda.</p>;
  const latest = rows[0]; return <div className="space-y-3"><div className="rounded-lg bg-secondary/50 p-3 text-sm"><p className="font-medium">Visão consolidada atual</p><p className="mt-1 text-muted-foreground">Metas: {latest.goals_continue ? "continuam" : "atualizadas"} · Disponibilidade: {latest.availability_changed ? "mudou" : "sem mudança"} · Dor: {latest.pain_present ? `relatada (EVA ${latest.pain_eva})` : "não relatada"}</p></div>{rows.map((row) => <div key={row.id} className="border-l-2 border-primary/30 pl-3 text-sm"><p className="font-medium">Ciclo {row.training_cycles?.cycle_number || "—"} · {format(new Date(row.submitted_at), "dd/MM/yyyy", { locale: ptBR })}</p><p className="text-muted-foreground">Última prescrição: {row.prescription_evaluation} · {row.additional_information || "Sem informação adicional."}</p></div>)}</div>;
}
