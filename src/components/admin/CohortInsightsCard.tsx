import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { useDashboardSnapshot } from "@/contexts/DashboardSnapshotContext";

// G2/T6 — leitura de coorte: distribuição de NPS do feedback de fim de ciclo + % que pede ajuste.
export function CohortInsightsCard({ companyId, readOnly = false }: { companyId: string | null | undefined; readOnly?: boolean }) {
  const snapshot = useDashboardSnapshot();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (readOnly) {
      setRows(snapshot?.cohortFeedback || []);
      setLoading(false);
      return;
    }
    if (!companyId) { setRows([]); setLoading(false); return; }
    let alive = true;
    (supabase as any).rpc("cohort_feedback_summary", { _company_id: companyId })
      .then(({ data }: any) => { if (alive) { setRows(data || []); setLoading(false); } });
    return () => { alive = false; };
  }, [companyId, readOnly, snapshot]);

  if (loading || !rows.length) return null;
  const total = rows.reduce((s, r) => s + (Number(r.alunos) || 0), 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary text-lg">
          <Users className="h-5 w-5" /> Coorte — satisfação (NPS)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.bucket} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 border border-border p-2 text-sm">
            <span className="font-medium text-foreground">{r.bucket}</span>
            <span className="text-muted-foreground font-mono-data text-xs">
              {r.alunos} aluno(s){r.media_nps != null ? ` · NPS ${r.media_nps}` : ""}{r.pct_ajuste != null ? ` · ${r.pct_ajuste}% pedem ajuste` : ""}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          Base: feedback de fim de ciclo ({total} respostas). Detratores que pedem ajuste = prioridade de revisão.
        </p>
      </CardContent>
    </Card>
  );
}
