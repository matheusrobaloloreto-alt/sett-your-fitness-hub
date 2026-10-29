// Ranking mensal anônimo: pódio Top 3 (1º nome + inicial, via private_display_name) + a sua
// posição. O resto fica oculto. Consome a RPC get_monthly_leaderboard (company-scoped, Codex).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, Medal, Loader2, Trophy } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useStudentGamification } from '@/hooks/useStudentGamification';

interface LbEntry { display_name: string; xp: number; rank: number; }
interface CallerInfo { rank: number | null; xp: number; total_participantes: number; }

const PODIUM = [
  { icon: Crown, color: "text-yellow-500", ring: "border-yellow-500/50 bg-yellow-500/10", label: "1º" },
  { icon: Medal, color: "text-zinc-400", ring: "border-zinc-400/50 bg-zinc-400/10", label: "2º" },
  { icon: Medal, color: "text-amber-700", ring: "border-amber-700/50 bg-amber-700/10", label: "3º" },
];

export function MonthlyLeaderboard({ companyId }: { companyId: string | null }) {
  const { enabled } = useStudentGamification({ companyId });
  const [top3, setTop3] = useState<LbEntry[]>([]);
  const [caller, setCaller] = useState<CallerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    if (!companyId || !enabled) { setTop3([]); setCaller(null); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any).rpc("get_monthly_leaderboard", { _company_id: companyId });
      if (!on) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      setTop3((row?.top3 as LbEntry[]) ?? []);
      setCaller((row?.caller as CallerInfo) ?? null);
      setLoading(false);
    })();
    return () => { on = false; };
  }, [companyId, enabled]);

  if (!companyId || !enabled) return null;

  const monthLabel = format(new Date(), "MMMM", { locale: ptBR });
  const callerInPodium = caller?.rank != null && caller.rank <= 3;
  const noScores = top3.every((t) => !t.xp);

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-eyebrow flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Ranking de {monthLabel}
          </p>
          {caller?.total_participantes ? (
            <span className="font-mono-data text-[10px] text-muted-foreground">{caller.total_participantes} no ranking</span>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : top3.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Ranking ainda sem participantes.</p>
        ) : (
          <>
            <div className="space-y-2">
              {top3.map((e, i) => {
                const p = PODIUM[i] ?? PODIUM[2];
                const Icon = p.icon;
                return (
                  <div key={i} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", p.ring)}>
                    <div className="flex items-center gap-1.5 w-9">
                      <Icon className={cn("h-4 w-4", p.color)} />
                      <span className={cn("font-mono-data text-xs font-semibold", p.color)}>{p.label}</span>
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground truncate">{e.display_name}</span>
                    <span className="font-mono-data text-xs text-muted-foreground">{e.xp.toLocaleString("pt-BR")} XP</span>
                  </div>
                );
              })}
            </div>

            {noScores && (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Ninguém pontuou ainda este mês — bata sua meta semanal e assuma o topo. 🏆
              </p>
            )}

            {/* Sua posição (sempre visível; o resto do ranking fica oculto) */}
            <div className="mt-3 pt-3 border-t border-border">
              {caller?.rank ? (
                <div className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2",
                  callerInPodium ? "bg-primary/10 border border-primary/30" : "bg-secondary/40"
                )}>
                  <span className="font-mono-data text-sm font-bold text-primary w-9">#{caller.rank}</span>
                  <span className="flex-1 text-sm font-medium text-foreground">
                    Você {callerInPodium && "· no pódio! 🎉"}
                  </span>
                  <span className="font-mono-data text-xs text-muted-foreground">{caller.xp.toLocaleString("pt-BR")} XP</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Treine este mês para entrar no ranking.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
