import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Prescrições feitas no mês corrente, na ordem em que foram feitas (mais recente primeiro).
export function MonthlyPrescriptionsCard({ companyId, routePrefix }: { companyId: string | null | undefined; routePrefix?: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      let q = (supabase as any)
        .from("prescription_bundles")
        .select("id, student_id, created_at, status, has_strength, has_cardio, has_nutrition, has_swimming, has_cycling")
        .gte("created_at", start.toISOString())
        .in("status", ["active", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(80);
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      const bundles = data || [];
      const bundleIds = bundles.map((bundle: any) => bundle.id).filter(Boolean);
      const completedModalities = new Map<string, Set<string>>();
      if (bundleIds.length) {
        let itemQuery = (supabase as any)
          .from("prescription_bundle_items")
          .select("bundle_id, modality, entity_type, entity_id")
          .in("bundle_id", bundleIds);
        if (companyId) itemQuery = itemQuery.eq("company_id", companyId);
        const { data: items } = await itemQuery;
        for (const item of items || []) {
          if (!item.bundle_id || !item.entity_id) continue;
          const modalities = completedModalities.get(item.bundle_id) || new Set<string>();
          modalities.add(String(item.modality || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
          completedModalities.set(item.bundle_id, modalities);
        }
      }
      const ids = [...new Set(bundles.map((b: any) => b.student_id).filter(Boolean))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: studs } = await (supabase as any).from("students").select("id, full_name").in("id", ids);
        names = Object.fromEntries((studs || []).map((s: any) => [s.id, s.full_name]));
      }
      if (!alive) return;
      setRows(bundles.map((b: any) => ({
        ...b,
        completedModalities: completedModalities.get(b.id) || new Set<string>(),
        name: names[b.student_id] || "Aluno",
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary text-lg">
          <ClipboardList className="h-5 w-5" /> Prescrições do mês
          <Badge variant="outline" className="ml-auto">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground font-sans">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground font-sans">Nenhuma prescrição feita este mês ainda.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {rows.map((r: any) => (
              <button key={r.id} type="button" onClick={() => navigate(`/${routePrefix || "admin"}/students/${r.student_id}`)} className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/40 border border-border hover:border-primary/40 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-sans font-medium text-foreground truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground font-sans">
                    {new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{" "}
                    {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {r.has_strength && r.completedModalities.has("musculacao") && <Badge variant="outline" className="text-[10px]">Força</Badge>}
                  {r.has_cardio && r.completedModalities.has("corrida") && <Badge variant="outline" className="text-[10px]">Cardio</Badge>}
                  {r.has_swimming && r.completedModalities.has("natacao") && <Badge variant="outline" className="text-[10px]">Natação</Badge>}
                  {r.has_cycling && r.completedModalities.has("ciclismo") && <Badge variant="outline" className="text-[10px]">Ciclismo</Badge>}
                  {r.has_nutrition && r.completedModalities.has("nutricao") && <Badge variant="outline" className="text-[10px]">Nutrição</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
