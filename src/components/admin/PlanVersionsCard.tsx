import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Eye, History } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PlanVersionViewer, type HistoricalPlanVersion } from "./PlanVersionViewer";
import { readPlanVersionWorkouts } from "@/lib/planVersionSnapshot";

type Props = { studentId: string; companyId: string | null; studentName: string; createdBy: string | null };
const PAGE_SIZE = 20;

export function PlanVersionsCard(props: Props) {
  if (!props.companyId) return null;
  return <ScopedPlanVersionsCard key={`${props.companyId}:${props.studentId}`} {...props} companyId={props.companyId} />;
}

function ScopedPlanVersionsCard({ studentId, companyId, studentName, createdBy }: Props & { companyId: string }) {
  const [rows, setRows] = useState<HistoricalPlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<HistoricalPlanVersion | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const result = await supabase.from("ai_plan_versions")
          .select("id, edited, edit_summary, created_at, plan")
          .eq("company_id", companyId).eq("student_id", studentId)
          .order("created_at", { ascending: false }).order("id", { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (!alive) return;
        if (result.error) throw result.error;
        const data = (result.data || []) as HistoricalPlanVersion[];
        setRows(previous => page === 0 ? data : [...previous, ...data.filter(row => !previous.some(old => old.id === row.id))]);
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [studentId, companyId, page, retry]);

  if (!rows.length && !error) return null;
  const retryButton = <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button>;
  return <>
    <Collapsible defaultOpen={false}>
      <Card className="bg-card border-border min-w-0">
        <CardHeader>
          <CardTitle className="text-primary text-base">
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <History className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Versões do plano</span>
                <Badge variant="outline" className="ml-auto">{rows.length}</Badge>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </button>
            </CollapsibleTrigger>
          </CardTitle>
          {error && !rows.length && <div role="alert" className="space-y-2 text-sm"><p>Não foi possível carregar o histórico.</p>{retryButton}</div>}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-2">
            {rows.map(row => {
              const snapshot = readPlanVersionWorkouts(row.plan);
              const nEx = snapshot.workouts.reduce((sum, workout) => sum + workout.exercises.length, 0);
              let when = "Data não informada";
              try { when = format(parseISO(row.created_at), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { /* Invalid legacy dates remain readable. */ }
              return <div key={row.id} className="rounded-lg border border-border bg-secondary/40 p-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono-data text-muted-foreground">{when}</span>
                  {row.edited ? <Badge className="bg-amber-500 text-[10px] text-white">editado pelo professor</Badge> : <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/40">como a IA gerou</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-xs text-foreground">{snapshot.error ? "Conteúdo histórico indisponível" : `${snapshot.workouts.length} treino(s) · ${nEx} exercício(s)`}{row.edited && row.edit_summary ? ` — ${row.edit_summary}` : ""}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelected(row)}><Eye className="mr-2 h-4 w-4" />Abrir versão</Button>
                </div>
              </div>;
            })}
            {error && rows.length > 0 && <div role="alert" className="space-y-2 text-sm"><p>Não foi possível carregar mais versões.</p>{retryButton}</div>}
            {hasMore && !error && <Button type="button" variant="outline" disabled={loading} onClick={() => setPage(value => value + 1)}>{loading ? "Carregando..." : "Carregar mais versões"}</Button>}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
    {selected && <PlanVersionViewer key={selected.id} version={selected} companyId={companyId} studentName={studentName} createdBy={createdBy} onClose={() => setSelected(null)} />}
  </>;
}
