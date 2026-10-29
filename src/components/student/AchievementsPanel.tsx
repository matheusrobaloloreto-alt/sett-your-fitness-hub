import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useStudentGamification } from '@/hooks/useStudentGamification';
import { fetchStudentAchievementCatalog } from '@/lib/gamification';
import {
  Trophy, Flame, Dumbbell, Medal, Bike, Route, CheckCircle, Crown, Lock,
} from "lucide-react";

interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string | null;
  xp_reward: number;
  criteria_type: string;
  criteria_value: number;
}

interface Props {
  studentId: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  flame: Flame,
  dumbbell: Dumbbell,
  medal: Medal,
  bike: Bike,
  route: Route,
  "check-circle": CheckCircle,
  crown: Crown,
};

export function AchievementsPanel({ studentId }: Props) {
  const { enabled } = useStudentGamification({ studentId });
  const [xp, setXp] = useState(0);
  const [rank, setRank] = useState<{ rank_position: number; total_students: number } | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!enabled) { setXp(0); setRank(null); setAchievements([]); setUnlocked(new Set()); return; }
    setLoading(true);
    setLoadError(false);
    (async () => {
      const [xpRes, rankRes, achRes, unlockedRes] = await Promise.all([
        supabase.from("xp_events").select("xp_amount").eq("student_id", studentId),
        supabase.rpc("get_student_rank", { _student_id: studentId }),
        fetchStudentAchievementCatalog(studentId),
        supabase.from("student_achievements").select("achievement_id").eq("student_id", studentId),
      ]);

      if (!alive) return;
      if (xpRes.error || rankRes.error || unlockedRes.error) throw new Error('Historico de conquistas indisponivel.');

      const total = (xpRes.data ?? []).reduce((s, e: { xp_amount: number }) => s + (e.xp_amount ?? 0), 0);
      setXp(total);

      const r = Array.isArray(rankRes.data) ? rankRes.data[0] : null;
      if (r) setRank({ rank_position: Number(r.rank_position), total_students: Number(r.total_students) });

      setAchievements(achRes as Achievement[]);
      setUnlocked(new Set((unlockedRes.data ?? []).map((u: { achievement_id: string }) => u.achievement_id)));
      setLoading(false);
    })().catch(() => { if (alive) { setAchievements([]); setLoading(false); setLoadError(true); } });
    return () => { alive = false; };
  }, [studentId, enabled]);

  if (!enabled || loading || loadError) return null;

  // Compacto: uma linha só — XP + contagem + rank + faixa de ícones de desbloqueio (rolável).
  return (
    <Card className="bg-card border-border">
      <CardContent className="flex items-center gap-2 overflow-x-auto p-3">
        <Trophy className="h-4 w-4 shrink-0 text-primary" />
        <span className="shrink-0 font-mono-data text-sm font-bold text-primary">{xp.toLocaleString("pt-BR")}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">XP · {unlocked.size}/{achievements.length}</span>
        {rank && rank.total_students > 1 && (
          <span className="shrink-0 text-[11px] text-muted-foreground">· #{rank.rank_position}/{rank.total_students}</span>
        )}
        {achievements.length > 0 && <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />}
        <div className="flex items-center gap-1.5">
          {achievements.map(a => {
            const Icon = ICONS[a.icon ?? "trophy"] ?? Trophy;
            const isUnlocked = unlocked.has(a.id);
            return (
              <span
                key={a.id}
                title={`${a.title} — ${a.description ?? ""} (+${a.xp_reward} XP)`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                  isUnlocked
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground/50"
                }`}
              >
                {isUnlocked ? <Icon className="h-3.5 w-3.5" /> : <Lock className="h-3 w-3" />}
              </span>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
