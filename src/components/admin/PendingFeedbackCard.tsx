import { useEffect, useState } from "react";
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

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      if (readOnly) {
        setRows(snapshot?.pendingFeedback || []);
        setLoading(false);
        return;
      }
      let q = (supabase as any)
        .from("cycle_feedback")
        .select("id, student_id, nps, wants_adjustment, adjustment_notes, created_at")
        .eq("applied", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      const fbs = data || [];
      const ids = [...new Set(fbs.map((b: any) => b.student_id).filter(Boolean))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: studs } = await (supabase as any).from("students").select("id, full_name").in("id", ids);
        names = Object.fromEntries((studs || []).map((s: any) => [s.id, s.full_name]));
      }
      if (!alive) return;
      setRows(fbs.map((b: any) => ({ ...b, name: names[b.student_id] || "Aluno" })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId, readOnly, snapshot]);

  const markApplied = async (id: string) => {
    if (readOnly) return;
    const { error } = await (supabase as any).from("cycle_feedback").update({ applied: true }).eq("id", id);
    if (!error) setRows((prev) => prev.filter((r) => r.id !== id));
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
        {loading ? (
          <p className="text-sm text-muted-foreground font-sans">Carregando...</p>
        ) : rows.length === 0 ? (
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
                  {r.wants_adjustment && r.adjustment_notes && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.adjustment_notes}</p>
                  )}
                  <p className="mt-1 text-[11px] text-primary">{recoFor(r)}</p>
                  {!readOnly && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => goStudent(r.student_id)}>Abrir aluno</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markApplied(r.id)}>
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
