// Linha do tempo do aluno: agrega os eventos de todos os módulos num feed único e ordenado
// (anamnese, avaliação, prescrição, pagamento, treino, arquivo). Base do painel central do aluno.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listStudentFiles } from "@/lib/studentFiles";

export type TimelineKind = "anamnese" | "avaliacao" | "prescricao" | "pagamento" | "treino" | "arquivo";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  date: string;        // ISO
  title: string;
  subtitle?: string;
}

function pickDate(...vals: (string | null | undefined)[]): string {
  for (const v of vals) if (v) return v;
  return new Date(0).toISOString();
}

export function useStudentTimeline(studentId: string | null) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentId) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    const out: TimelineEvent[] = [];

    // Cada fonte é isolada — se uma tabela mudar/faltar, as outras continuam.
    const safe = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* ignore */ } };

    await Promise.all([
      safe(async () => {
        // P10 — mostra cada VERSÃO da anamnese (histórico); fallback p/ a linha única se não houver histórico.
        const { data: hist } = await (supabase as any).from("student_anamnesis_history").select("id, version, created_at, snapshot").eq("student_id", studentId);
        if (hist && hist.length) {
          hist.forEach((h: any) => out.push({ id: `anamh-${h.id}`, kind: "anamnese", date: pickDate(h.created_at), title: `Anamnese (v${h.version})`, subtitle: h.snapshot?.objective || undefined }));
          return;
        }
        const { data } = await supabase.from("student_anamneses").select("id, created_at, objective").eq("student_id", studentId);
        (data ?? []).forEach((a: any) => out.push({ id: `anam-${a.id}`, kind: "anamnese", date: pickDate(a.created_at), title: "Anamnese preenchida", subtitle: a.objective || undefined }));
      }),
      safe(async () => {
        const { data } = await supabase.from("student_evaluations").select("id, evaluation_date, created_at, type").eq("student_id", studentId);
        (data ?? []).forEach((e: any) => out.push({ id: `aval-${e.id}`, kind: "avaliacao", date: pickDate(e.evaluation_date, e.created_at), title: "Avaliação funcional", subtitle: e.type || undefined }));
      }),
      safe(async () => {
        const { data } = await supabase.from("training_cycles" as any).select("id, cycle_number, name, objective, created_at, start_date, delivery_status").eq("student_id", studentId).neq("status", "superseded");
        (data ?? []).forEach((c: any) => {
          const base = c.name || c.objective || "";
          // P6 — status de entrega visível pro professor na linha do tempo.
          const tag = c.delivery_status === "viewed" ? "✓ visto pelo aluno" : c.delivery_status === "sent" ? "aguardando o aluno abrir" : "";
          const subtitle = [base, tag].filter(Boolean).join(" · ") || undefined;
          out.push({ id: `presc-${c.id}`, kind: "prescricao", date: pickDate(c.created_at, c.start_date), title: `Prescrição — Ciclo ${c.cycle_number ?? ""}`.trim(), subtitle });
        });
      }),
      safe(async () => {
        const { data } = await supabase.from("payments").select("id, status, value, amount, paid_at, created_at, billing_type").eq("student_id", studentId);
        (data ?? []).forEach((p: any) => {
          const v = p.value ?? p.amount;
          out.push({ id: `pay-${p.id}`, kind: "pagamento", date: pickDate(p.paid_at, p.created_at), title: `Pagamento · ${p.status ?? ""}`.trim(), subtitle: v != null ? `R$ ${Number(v).toLocaleString("pt-BR")}${p.billing_type ? ` · ${p.billing_type}` : ""}` : undefined });
        });
      }),
      safe(async () => {
        const { data } = await supabase.from("workout_sessions").select("id, session_date, completed_at, status, total_volume").eq("student_id", studentId).eq("status", "completed").order("completed_at", { ascending: false }).limit(15);
        (data ?? []).forEach((s: any) => out.push({ id: `sess-${s.id}`, kind: "treino", date: pickDate(s.completed_at, s.session_date), title: "Treino realizado", subtitle: s.total_volume ? `${(Number(s.total_volume) / 1000).toFixed(1)}t de volume` : undefined }));
      }),
      safe(async () => {
        const files = await listStudentFiles(studentId);
        files.forEach((f) => out.push({ id: `file-${f.id}`, kind: "arquivo", date: pickDate(f.created_at), title: f.file_name, subtitle: "Arquivo na pasta" }));
      }),
    ]);

    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    setEvents(out);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  return { events, loading, reload: load };
}
