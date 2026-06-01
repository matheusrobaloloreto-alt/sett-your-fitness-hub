import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const [xp, setXp] = useState(0);
  const [rank, setRank] = useState<{ rank_position: number; total_students: number } | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [xpRes, rankRes, achRes, unlockedRes] = await Promise.all([
        supabase.from("xp_events").select("xp_amount").eq("student_id", studentId),
        supabase.rpc("get_student_rank", { _student_id: studentId }),
        supabase.from("achievements").select("*").eq("is_active", true).order("criteria_value"),
        supabase.from("student_achievements").select("achievement_id").eq("student_id", studentId),
      ]);

      if (!alive) return;

      const total = (xpRes.data ?? []).reduce((s, e: { xp_amount: number }) => s + (e.xp_amount ?? 0), 0);
      setXp(total);

      const r = Array.isArray(rankRes.data) ? rankRes.data[0] : null;
      if (r) setRank({ rank_position: Number(r.rank_position), total_students: Number(r.total_students) });

      setAchievements((achRes.data as Achievement[]) ?? []);
      setUnlocked(new Set((unlockedRes.data ?? []).map((u: { achievement_id: string }) => u.achievement_id)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [studentId]);

  if (loading) return null;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {xp.toLocaleString("pt-BR")}
              </span>
              <span className="text-xs text-muted-foreground font-sans">XP</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
              {unlocked.size} de {achievements.length} conquistas
            </p>
          </div>
          {rank && rank.total_students > 1 && (
            <div className="text-right">
              <div className="text-lg font-bold text-foreground font-sans">
                #{rank.rank_position}
                <span className="text-xs text-muted-foreground font-normal"> / {rank.total_students}</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-sans">na sua empresa</p>
            </div>
          )}
        </div>

        {achievements.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {achievements.map(a => {
              const Icon = ICONS[a.icon ?? "trophy"] ?? Trophy;
              const isUnlocked = unlocked.has(a.id);
              return (
                <div
                  key={a.id}
                  title={`${a.title} — ${a.description ?? ""} (+${a.xp_reward} XP)`}
                  className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-1 p-1 transition-all ${
                    isUnlocked
                      ? "border-primary/50 bg-primary/5 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {isUnlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  <span className="text-[8px] font-sans leading-tight text-center line-clamp-2">{a.title}</span>
                </div>
              );
            })}
          </div>
        )}

        {unlocked.size > 0 && (
          <div className="flex flex-wrap gap-1">
            {achievements.filter(a => unlocked.has(a.id)).slice(-3).map(a => (
              <Badge key={a.id} variant="outline" className="border-primary/40 text-primary text-[10px]">
                +{a.xp_reward} {a.title}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
