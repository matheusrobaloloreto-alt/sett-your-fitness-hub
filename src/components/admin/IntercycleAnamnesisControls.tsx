import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ClipboardList, Copy, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {usePublishedInstrument} from '@/hooks/usePublishedInstrument';
import {intercycleScheduleDate,canIssueManualIntercycle} from '@/lib/formInstrumentPolicy';
import {businessDateYmd} from '@/lib/businessDate';
import {
  canManuallyCancelIntercycle,
  canManuallyScheduleIntercycle,
  intercycleStatusLabel,
  intercycleAnamnesisPath,
  type DeliveryIntercycleStatus,
  type IntercycleStatus,
} from "@/lib/intercycleAnamnesis";

type Cycle = { id: string; start_date: string | null; cycle_number: number | null };
type Delivery = { id: string; status: DeliveryIntercycleStatus; scheduled_for: string; training_cycle_id: string; retry_count: number; last_error_code: string | null };
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
  const definition=usePublishedInstrument(companyId,'intercycle');
  const scheduledDay=definition?.definition.policy.intercycle_day??29;
  const [enabled, setEnabled] = useState(!!initial); const [saving, setSaving] = useState(false); const [cycle, setCycle] = useState<Cycle | null>(null); const [delivery, setDelivery] = useState<Delivery | null>(null);
  const load = useCallback(async () => { const cycles = await db.from<Cycle>("training_cycles").select("id,start_date,cycle_number").eq("student_id", studentId).eq("company_id", companyId).is("superseded_at", null).or("status.is.null,status.not.in.(cancelled,superseded)").order("start_date", { ascending: false }).limit(1); const next = cycles.data?.[0] || null; setCycle(next); if (!next) { setDelivery(null); return; } const result = await db.from<Delivery>("intercycle_anamnesis_deliveries").select("id,status,scheduled_for,training_cycle_id,retry_count,last_error_code").eq("training_cycle_id", next.id).maybeSingle(); setDelivery(result.data || null); }, [studentId, companyId]);
  useEffect(() => { setEnabled(!!initial); void load(); }, [initial, load]);
  const invoke = async (body: Record<string, unknown>) => { const { error } = await supabase.functions.invoke("intercycle-anamnesis", { body: { company_id: companyId, student_id: studentId, ...body } }); if (error) throw error; await load(); };
  const toggle = async (next: boolean) => { setSaving(true); try { await invoke({ action: "opt-in", enabled: next }); setEnabled(next); toast.success(next ? "Anamnese interciclos agendada para todos os ciclos" : "Agendamento interciclos desativado"); } catch { toast.error("Não foi possível atualizar o agendamento"); } finally { setSaving(false); } };
  const nextDate = cycle?.start_date ? new Date(`${intercycleScheduleDate(cycle.start_date,scheduledDay)}T12:00:00`).getTime() : null;
  const status: IntercycleStatus = enabled ? (delivery?.status || "opted_in") : "disabled";
  const uncertain = delivery?.last_error_code === 'dispatch_uncertain';
  const canScheduleNow = !uncertain && enabled && cycle?.start_date && businessDateYmd()>=intercycleScheduleDate(cycle.start_date,scheduledDay) && canManuallyScheduleIntercycle(delivery?.status);
  const canCancel = !uncertain && delivery && canManuallyCancelIntercycle(delivery.status);
  const canCreateLink=!uncertain && canIssueManualIntercycle(cycle?.start_date??null,businessDateYmd(),!['sending','responded'].includes(delivery?.status??''));
  const copyManualLink=async()=>{setSaving(true);try{const {data,error}=await supabase.functions.invoke('intercycle-anamnesis',{body:{action:'create-link',company_id:companyId,student_id:studentId}});if(error||!data?.token)throw error??new Error('Link indisponivel');await navigator.clipboard.writeText(`${window.location.origin}${intercycleAnamnesisPath(data.token)}`);toast.success('Link interciclos copiado');await load();}catch{toast.error('Nao foi possivel gerar e copiar o link.');}finally{setSaving(false);}};
  return <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><label htmlFor={`intercycle-${studentId}`} className="text-sm font-medium">Anamnese interciclos</label><Switch id={`intercycle-${studentId}`} checked={enabled} disabled={saving} onCheckedChange={toggle} /></div><p className="mt-0.5 text-xs text-muted-foreground">Opt-in para ciclos futuros. Um delivery real só nasce na janela operacional do ciclo, conforme a politica da empresa; o botão manual só agenda quando essa janela já abriu.</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline">{intercycleStatusLabel(status)}</Badge>{cycle && <span>Ciclo {cycle.cycle_number || "—"}</span>}{nextDate && <span>Janela prevista: {format(new Date(nextDate), "dd/MM", { locale: ptBR })}</span>}{uncertain && <span role="status" className="text-destructive">Entrega não confirmada; reenvio suspenso para revisão técnica.</span>}{delivery?.status === "failed" && <span className="text-destructive">Tentativas: {delivery.retry_count}</span>}{delivery?.status === "sending" && <span className="text-amber-700">Envio assumido; aguarde confirmação.</span>}{canCreateLink && <Button size="sm" variant="outline" disabled={saving} onClick={()=>void copyManualLink()}><Copy className="mr-1 h-3.5 w-3.5" />Gerar e copiar link</Button>}{canScheduleNow && <Button size="sm" variant="outline" onClick={() => void invoke({ action: "schedule-now", training_cycle_id: cycle.id }).catch(() => toast.error("Não foi possível agendar"))}><ClipboardList className="mr-1 h-3.5 w-3.5" /> {delivery?.status === "cancelled" ? "Reabrir nesta janela" : "Agendar nesta janela"}</Button>}{canCancel && <Button size="sm" variant="ghost" onClick={() => void invoke({ action: "cancel", delivery_id: delivery.id }).catch(() => toast.error("Não foi possível cancelar"))}><XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>}</div></div></div>;
}

export function IntercycleAnamnesisTimeline({ studentId, companyId }: { studentId: string; companyId: string }) {
  const [result, setResult] = useState<{ studentId: string; companyId: string; rows: IntercycleAnswerRow[] | null }>();
  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const { data, error } = await db.from<IntercycleAnswerRow>("intercycle_anamneses")
          .select("id,submitted_at,prescription_evaluation,goals_continue,availability_changed,pain_present,pain_eva,additional_information,training_cycles(cycle_number)")
          .eq("student_id", studentId).eq("company_id", companyId).order("submitted_at", { ascending: false });
        if (active) setResult({ studentId, companyId, rows: error ? null : data ?? [] });
      } catch {
        if (active) setResult({ studentId, companyId, rows: null });
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [studentId, companyId]);

  if (result?.studentId !== studentId || result.companyId !== companyId) {
    return <p role="status">Carregando histórico de anamnese interciclos…</p>;
  }
  const { rows } = result;
  if (!rows) return <p role="alert">Não foi possível carregar o histórico de anamnese interciclos.</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nenhuma Anamnese interciclos respondida ainda.</p>;
  const latest = rows[0]; return <div className="space-y-3"><div className="rounded-lg bg-secondary/50 p-3 text-sm"><p className="font-medium">Última resposta interciclos</p><p className="mt-1 text-muted-foreground">Metas: {latest.goals_continue ? "continuam" : "atualizadas"} · Disponibilidade: {latest.availability_changed ? "mudou" : "sem mudança"} · Dor: {latest.pain_present ? (latest.pain_eva == null ? "relatada" : `relatada (EVA ${latest.pain_eva})`) : "não relatada"}</p></div>{rows.map((row) => <div key={row.id} className="border-l-2 border-primary/30 pl-3 text-sm"><p className="font-medium">Ciclo {row.training_cycles?.cycle_number || "—"} · {format(new Date(row.submitted_at), "dd/MM/yyyy", { locale: ptBR })}</p><p className="text-muted-foreground">Última prescrição: {row.prescription_evaluation} · {row.additional_information || "Sem informação adicional."}</p></div>)}</div>;
}
