import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, History } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// P9/P15 — histórico de versões dos planos publicados (snapshot + se o professor editou a IA).
export function PlanVersionsCard({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (supabase as any)
      .from("ai_plan_versions")
      .select("id, edited, edit_summary, created_at, plan")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }: any) => { if (alive) { setRows(data || []); setLoading(false); } });
    return () => { alive = false; };
  }, [studentId]);

  if (loading || !rows.length) return null;

  return (
    <Collapsible key={studentId} defaultOpen={false}>
    <Card className="bg-card border-border">
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
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-2">
        {rows.map((r) => {
          const nWorkouts = Array.isArray(r.plan?.workouts) ? r.plan.workouts.length : 0;
          const nEx = ((r.plan?.workouts || []) as any[]).reduce((s, w) => s + (w?.exercises?.length || 0), 0);
          let when = "";
          try { when = format(parseISO(r.created_at), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { /* ignore */ }
          return (
            <div key={r.id} className="rounded-lg border border-border bg-secondary/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono-data text-muted-foreground">{when}</span>
                {r.edited
                  ? <Badge className="bg-amber-500 text-[10px] text-white">editado pelo professor</Badge>
                  : <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/40">como a IA gerou</Badge>}
              </div>
              <p className="mt-1 text-xs text-foreground">
                {nWorkouts} treino(s) · {nEx} exercício(s){r.edited && r.edit_summary ? ` — ${r.edit_summary}` : ""}
              </p>
            </div>
          );
        })}
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}
