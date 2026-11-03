import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquareHeart, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardSnapshot } from "@/contexts/DashboardSnapshotContext";

// Q1/P1 — fecha o loop do feedback de fim de ciclo: lista os que ainda não foram revisados,
// com ação de abrir o aluno (re-prescrever) ou marcar como revisado.
export function PendingFeedbackCard({ companyId, routePrefix, readOnly = false }: { companyId: string | null | undefined; routePrefix?: string; readOnly?: boolean }) {
  const navigate = useNavigate();
  const snapshot = useDashboardSnapshot();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const scope = useRef({ companyId, readOnly, generation: 0, reviewing: false });
  if (scope.current.companyId !== companyId || scope.current.readOnly !== readOnly) {
    scope.current = { companyId, readOnly, generation: scope.current.generation + 1, reviewing: false };
  }

  useEffect(() => {
    let alive = true;
    const requestScope = scope.current;
    (async () => {
      setLoading(true);
      setError(""); setRows([]); setReviewing(null);
      if (!companyId) { setLoading(false); return; }
      if (readOnly) {
        setRows(snapshot?.pendingFeedback || []);
        setLoading(false);
        return;
      }
      try {
      const q = (supabase as any)
        .from("cycle_feedback")
        .select("id, student_id, nps, wants_adjustment, adjustment_notes, created_at")
        .eq("applied", false)
        .order("created_at", { ascending: false })
        .limit(50).eq("company_id", companyId);
      const { data, error: readError } = await q;
      if (readError || !Array.isArray(data)) throw new Error('feedback_read_failed');
      const fbs = data || [];
      const ids = [...new Set(fbs.map((b: any) => b.student_id).filter(Boolean))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: studs, error: namesError } = await (supabase as any).from("students").select("id, full_name").eq("company_id", companyId).in("id", ids);
        if (namesError || !Array.isArray(studs)) throw new Error('feedback_names_failed');
        names = Object.fromEntries((studs || []).map((s: any) => [s.id, s.full_name]));
      }
      if (!alive || scope.current !== requestScope) return;
      setRows(fbs.map((b: any) => ({ ...b, name: names[b.student_id] || "Aluno" })));
      } catch {
        if (alive && scope.current === requestScope) setError("Não foi possível consultar os feedbacks. Tente novamente.");
      } finally { if (alive && scope.current === requestScope) setLoading(false); }
    })();
    return () => {
      alive = false;
      if (scope.current === requestScope) scope.current = { ...requestScope, generation: requestScope.generation + 1, reviewing: false };
    };
  }, [companyId, readOnly, snapshot, reload]);

  const markApplied = async (id: string) => {
    if (readOnly || !companyId || scope.current.reviewing) return;
    const requestScope = scope.current;
    requestScope.reviewing = true;
    setReviewing(id); setError("");
    try {
      const { data, error: writeError } = await (supabase as any).from("cycle_feedback").update({ applied: true }).eq("id", id).eq("company_id", companyId).select("id");
      if (scope.current !== requestScope) return;
      if (writeError || !Array.isArray(data) || data.length !== 1 || data[0].id !== id) throw new Error('feedback_review_unconfirmed');
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch { if (scope.current === requestScope) setError("Não foi possível confirmar a revisão. O feedback continua pendente; atualize antes de tentar novamente."); }
    finally { if (scope.current === requestScope) { requestScope.reviewing = false; setReviewing(null); } }
  };

  const goStudent = (sid: string) => {
    if (readOnly) return;
    navigate(`/${routePrefix || "admin"}/students/${sid}`);
  };

  // G1 — sugestão de ajuste do próximo ciclo a partir do feedback (mesma lógica do RPC next_cycle_recommendation).
  const recoFor = (r: any) => {
    if (r.nps != null && r.nps <= 6) return "Sugestão: reduzir volume/intensidade e alinhar expectativa.";
    if (r.wants_adjustment) return "Sugestão: aplicar o ajuste pedido no próximo ciclo.";
    return "Sugestão: pode progredir o estímulo.";
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary text-lg">
          <MessageSquareHeart className="h-5 w-5" /> Feedback de ciclo pendente
          <Badge variant="outline" className="ml-auto">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && <div role="alert" className="mb-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" className="ml-2" onClick={() => setReload(value => value + 1)}>Tentar novamente</Button></div>}
        {!companyId ? <p>Selecione uma empresa para consultar os feedbacks.</p> : loading ? (
          <p className="text-sm text-muted-foreground font-sans">Carregando...</p>
        ) : rows.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground font-sans">Nenhum feedback aguardando revisão. 👏</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {rows.map((r) => {
              const npsColor = r.nps == null ? "text-muted-foreground" : r.nps >= 9 ? "text-green-600" : r.nps >= 7 ? "text-amber-600" : "text-red-600";
              return (
                <div key={r.id} className="rounded-lg bg-secondary/40 border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    {readOnly ? (
                      <p className="text-sm font-sans font-medium text-foreground truncate text-left">{r.name}</p>
                    ) : (
                      <button type="button" onClick={() => goStudent(r.student_id)} className="text-sm font-sans font-medium text-foreground truncate text-left hover:underline">
                        {r.name}
                      </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-sans text-muted-foreground">NPS <span className={`font-mono-data font-bold ${npsColor}`}>{r.nps ?? "—"}</span></span>
                      {r.wants_adjustment && <Badge className="bg-amber-500 text-[10px] text-white">ajuste</Badge>}
                    </div>
                  </div>
                  {r.created_at && <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('pt-BR')}</p>}
                  {r.wants_adjustment && r.adjustment_notes && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.adjustment_notes}</p>
                  )}
                  <p className="mt-1 text-[11px] text-primary">{recoFor(r)}</p>
                  {!readOnly && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => goStudent(r.student_id)}>Abrir aluno</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={Boolean(reviewing)} onClick={() => markApplied(r.id)}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Revisado
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
