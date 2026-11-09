// Painel de volume: carga externa por semana e séries por músculo principal.
// As métricas ficam separadas para não atribuir percentuais biomecânicos à carga externa.
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, PieChart as PieIcon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { effectiveCoverageWindow } from "@/lib/volumeStats";
import { summarizeRealizedTraining, type RealizedLog, type RealizedSession } from "@/lib/realizedTraining";
import { format, parseISO, startOfWeek } from "date-fns";

interface VolumeInsightsProps {
  allLogs: RealizedLog[];
  sessions: RealizedSession[];
  studentId: string;
  companyId: string;
  todayStr: string;
  className?: string;
}

const PIE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#6366f1", "#14b8a6",
  "#f59e0b", "#ec4899", "#84cc16", "#06b6d4", "#a855f7", "#ef4444", "#22c55e",
];

export function VolumeInsights({ allLogs, sessions, studentId, companyId, todayStr, className }: VolumeInsightsProps) {
  const [range, setRange] = useState<"all" | "8w" | "4w">("all");
  const realized = useMemo(() => summarizeRealizedTraining({
    sessions, logs: allLogs, studentId, companyId, end: todayStr,
    start: range === "all" ? undefined : effectiveCoverageWindow({ today: todayStr, requestedDays: range === "4w" ? 28 : 56 }).start,
  }), [allLogs, sessions, studentId, companyId, todayStr, range]);
  const weekly = useMemo(() => {
    const weeks = new Map<string, { label: string; volume: number | null; sessions: number }>();
    for (const day of realized.days) {
      const week = startOfWeek(parseISO(day.date), { weekStartsOn: 1 });
      const key = format(week, "yyyy-MM-dd");
      const total = weeks.get(key) ?? { label: format(week, "dd/MM"), volume: null, sessions: 0 };
      if (day.volume !== null) total.volume = (total.volume ?? 0) + day.volume;
      total.sessions += day.sessions;
      weeks.set(key, total);
    }
    return [...weeks.values()];
  }, [realized]);
  const byMuscle = realized.muscles;
  const totalSets = useMemo(() => byMuscle.reduce((sum, item) => sum + item.sets, 0), [byMuscle]);
  const rangeTabs = [["all", "Tudo"], ["8w", "8 sem"], ["4w", "4 sem"]] as const;

  const hasData = weekly.length > 0 || byMuscle.length > 0;

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {/* A5 — faixa de período: foca o gráfico no recorte recente ou no todo */}
      <div className="flex items-center gap-1.5">
        {rangeTabs.map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setRange(k)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-sans border transition-colors ${range === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {!hasData && (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-sans text-sm">Sem registros nesse período.</p>
          </CardContent>
        </Card>
      )}

      {realized.incompleteLoad && <p className="text-xs text-muted-foreground">Há registros sem carga ou repetições verificáveis.</p>}
      {realized.overlappingLogs > 0 && <p className="text-xs text-muted-foreground">Séries do mesmo treino e dia de uma sessão não são somadas separadamente.</p>}
      {hasData && (<>
      {/* Volume-load por semana */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-mono-data font-semibold text-muted-foreground uppercase tracking-wider">
              Volume-load por semana
            </h3>
          </div>
          <p className="text-[10px] text-muted-foreground font-sans mb-3">
            Carga × repetições das sessões concluídas e das séries legadas independentes (kg).
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={48}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, _n: any, p: any) => [
                    `${Number(v).toLocaleString("pt-BR")} kg · ${p?.payload?.sessions ?? 0} ${p?.payload?.sessions === 1 ? "sessão concluída" : "sessões concluídas"}`,
                    "Volume-load",
                  ]}
                  labelFormatter={(l: any) => `Semana de ${l}`}
                />
                <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pizza por grupamento */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-mono-data font-semibold text-muted-foreground uppercase tracking-wider">
              Séries registradas por músculo principal
            </h3>
          </div>
          {realized.incompleteMuscles && <p className="text-xs text-muted-foreground">Cobertura muscular parcial neste período.</p>}
          {byMuscle.length === 0 ? (
            <p className="text-xs text-muted-foreground font-sans">Sem dados de grupamento no período.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byMuscle}
                    dataKey="sets"
                    nameKey="group"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                  >
                    {byMuscle.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, n: any) => [
                      `${Number(v).toLocaleString("pt-BR")} séries (${totalSets > 0 ? Math.round((Number(v) / totalSets) * 100) : 0}%)`,
                      n,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      </>)}
    </div>
  );
}
