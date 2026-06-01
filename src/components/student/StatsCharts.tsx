import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TrendingUp, BarChart3, Activity, Trophy, Flame, Gauge } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Area, Legend, Cell,
} from "recharts";
import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BodyMap } from "./BodyMap";

interface StatsChartsProps {
  allLogs: any[];
  cycles: { id: string; cycle_number: number; workouts: { id: string; exercises: { exercise_name: string; muscle_group: string; sets: string }[] }[] }[];
  todayStr: string;
}

type Period = "7" | "30" | "90" | "all";

// Epley 1RM: peso * (1 + reps/30)
const epley = (weight: number, reps: number) => (reps > 0 ? weight * (1 + reps / 30) : weight);

export function StatsCharts({ allLogs, cycles, todayStr }: StatsChartsProps) {
  const [selectedExercise, setSelectedExercise] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [show1RM, setShow1RM] = useState<boolean>(false);
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // Meta dos exercícios
  const allExercisesMeta = useMemo(() => {
    const meta: { workoutId: string; index: number; name: string; muscleGroup: string }[] = [];
    cycles.forEach(c => c.workouts.forEach(w => w.exercises.forEach((ex, idx) => {
      meta.push({ workoutId: w.id, index: idx, name: ex.exercise_name, muscleGroup: ex.muscle_group });
    })));
    return meta;
  }, [cycles]);

  const allExercises = useMemo(() => Array.from(new Set(allExercisesMeta.map(m => m.name))).sort(), [allExercisesMeta]);

  const findMeta = (workoutId: string, idx: number) => allExercisesMeta.find(m => m.workoutId === workoutId && m.index === idx);

  // Filtro de período
  const periodCutoff = useMemo(() => {
    if (period === "all") return null;
    return subDays(parseISO(todayStr), Number(period));
  }, [period, todayStr]);

  const filteredLogs = useMemo(() => {
    if (!periodCutoff) return allLogs;
    return allLogs.filter((l: any) => parseISO(l.session_date) >= periodCutoff);
  }, [allLogs, periodCutoff]);

  // Volume por grupamento (BodyMap)
  const muscleVolumes = useMemo(() => {
    const v: Record<string, number> = {};
    filteredLogs.forEach((l: any) => {
      const meta = findMeta(l.workout_id, l.exercise_index);
      if (!meta?.muscleGroup) return;
      const t = (Number(l.weight) || 0) * (Number(l.reps_done) || 0);
      if (t > 0) v[meta.muscleGroup] = (v[meta.muscleGroup] || 0) + t;
    });
    return Object.entries(v).map(([muscleGroup, volume]) => ({ muscleGroup, volume }));
  }, [filteredLogs, allExercisesMeta]);

  const sessionDates = useMemo(
    () => Array.from(new Set(filteredLogs.map((l: any) => l.session_date))).sort() as string[],
    [filteredLogs]
  );

  const topExercises = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    filteredLogs.forEach((l: any) => {
      const meta = findMeta(l.workout_id, l.exercise_index);
      if (!meta) return;
      if (!counts[meta.name]) counts[meta.name] = new Set();
      counts[meta.name].add(l.session_date);
    });
    return Object.entries(counts).sort(([, a], [, b]) => b.size - a.size).slice(0, 5).map(([n]) => n);
  }, [filteredLogs, allExercisesMeta]);

  // Evolução por SESSÃO: top set + 1RM estimado
  const evolutionData = useMemo(() => {
    const exercisesToShow = selectedExercise === "all" ? topExercises : [selectedExercise];
    return sessionDates.map(date => {
      const point: any = { name: format(parseISO(date), "dd/MM"), date };
      exercisesToShow.forEach(exName => {
        const logs = filteredLogs.filter((l: any) => {
          if (l.session_date !== date) return false;
          const meta = findMeta(l.workout_id, l.exercise_index);
          return meta?.name === exName;
        });
        let topW = 0, top1RM = 0;
        logs.forEach((l: any) => {
          const w = Number(l.weight) || 0;
          const r = Number(l.reps_done) || 0;
          if (w > topW) topW = w;
          const e = epley(w, r);
          if (e > top1RM) top1RM = e;
        });
        if (topW > 0) {
          point[exName] = topW;
          point[`${exName}__1RM`] = Math.round(top1RM * 10) / 10;
        }
      });
      return point;
    }).filter(p => Object.keys(p).length > 2);
  }, [sessionDates, filteredLogs, allExercisesMeta, selectedExercise, topExercises]);

  // Volume + Intensidade média por sessão
  const volumeData = useMemo(() => {
    return sessionDates.map(date => {
      const logs = filteredLogs.filter((l: any) => l.session_date === date);
      let tonnage = 0, totalReps = 0;
      logs.forEach((l: any) => {
        const w = Number(l.weight) || 0;
        const r = Number(l.reps_done) || 0;
        tonnage += w * r;
        totalReps += r;
      });
      return {
        name: format(parseISO(date), "dd/MM"),
        date,
        total: Math.round(tonnage),
        intensity: totalReps > 0 ? Math.round((tonnage / totalReps) * 10) / 10 : 0,
      };
    });
  }, [sessionDates, filteredLogs]);

  // Distribuição de RPE
  const rpeDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    filteredLogs.forEach((l: any) => {
      const rpe = Number(l.rpe);
      if (!rpe || rpe < 1) return;
      const k = String(Math.round(rpe));
      buckets[k] = (buckets[k] || 0) + 1;
    });
    return Object.entries(buckets)
      .map(([rpe, count]) => ({ rpe: `RPE ${rpe}`, count, raw: Number(rpe) }))
      .sort((a, b) => a.raw - b.raw);
  }, [filteredLogs]);

  const avgRpe = useMemo(() => {
    const vals = filteredLogs.map((l: any) => Number(l.rpe)).filter((v: number) => v > 0);
    if (!vals.length) return 0;
    return Math.round((vals.reduce((s: number, v: number) => s + v, 0) / vals.length) * 10) / 10;
  }, [filteredLogs]);

  // Frequência por grupamento (nº de sessões em que o grupo apareceu)
  const muscleFrequency = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    filteredLogs.forEach((l: any) => {
      const meta = findMeta(l.workout_id, l.exercise_index);
      if (!meta?.muscleGroup) return;
      if (!map[meta.muscleGroup]) map[meta.muscleGroup] = new Set();
      map[meta.muscleGroup].add(l.session_date);
    });
    return Object.entries(map)
      .map(([muscle, dates]) => ({ muscle, sessions: dates.size }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [filteredLogs, allExercisesMeta]);

  const maxFreq = Math.max(1, ...muscleFrequency.map(m => m.sessions));

  // Comparativo período-a-período (últimos N vs N anteriores)
  const comparison = useMemo(() => {
    const days = period === "all" ? 30 : Number(period);
    const today = parseISO(todayStr);
    const cutoffA = subDays(today, days);
    const cutoffB = subDays(today, days * 2);

    let tonnageA = 0, tonnageB = 0;
    let sessionsA = new Set<string>(), sessionsB = new Set<string>();
    let prsA = 0, prsB = 0;
    const bestBefore: Record<string, number> = {};
    const sortedAll = [...allLogs].sort((a, b) => a.session_date.localeCompare(b.session_date));
    sortedAll.forEach((l: any) => {
      const meta = findMeta(l.workout_id, l.exercise_index);
      if (!meta) return;
      const w = Number(l.weight) || 0;
      const r = Number(l.reps_done) || 0;
      const t = w * r;
      const d = parseISO(l.session_date);
      const isA = d >= cutoffA;
      const isB = d >= cutoffB && d < cutoffA;
      if (isA) { tonnageA += t; sessionsA.add(l.session_date); }
      if (isB) { tonnageB += t; sessionsB.add(l.session_date); }
      const prev = bestBefore[meta.name] || 0;
      if (w > prev) {
        if (isA) prsA++;
        else if (isB) prsB++;
        bestBefore[meta.name] = w;
      }
    });

    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100));
    return {
      days,
      tonnageA: Math.round(tonnageA), tonnageB: Math.round(tonnageB), tonnagePct: pct(tonnageA, tonnageB),
      sessionsA: sessionsA.size, sessionsB: sessionsB.size, sessionsPct: pct(sessionsA.size, sessionsB.size),
      prsA, prsB, prsPct: pct(prsA, prsB),
    };
  }, [allLogs, allExercisesMeta, period, todayStr]);

  // PRs gerais
  const personalRecords = useMemo(() => {
    const best: Record<string, { weight: number; date: string; reps: number; e1rm: number }> = {};
    filteredLogs.forEach((l: any) => {
      const meta = findMeta(l.workout_id, l.exercise_index);
      if (!meta) return;
      const w = Number(l.weight) || 0;
      const r = Number(l.reps_done) || 0;
      if (w <= 0) return;
      const e = epley(w, r);
      if (!best[meta.name] || w > best[meta.name].weight) {
        best[meta.name] = { weight: w, date: l.session_date, reps: r, e1rm: Math.round(e * 10) / 10 };
      }
    });
    return Object.entries(best).map(([exercise, v]) => ({ exercise, ...v })).sort((a, b) => b.weight - a.weight);
  }, [filteredLogs, allExercisesMeta]);

  const totalSessions = sessionDates.length;
  const totalTonnage = useMemo(() => volumeData.reduce((s, v) => s + v.total, 0), [volumeData]);
  const avgTonnage = totalSessions > 0 ? Math.round(totalTonnage / totalSessions) : 0;
  const topPR = personalRecords[0];

  const exerciseColors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
  const filteredExerciseNames = selectedExercise === "all" ? topExercises : [selectedExercise];

  if (allLogs.length === 0) {
    return (
      <Card className="bg-card border-border border-dashed">
        <CardContent className="p-8 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-sans">Registre suas cargas para ver estatísticas.</p>
        </CardContent>
      </Card>
    );
  }

  const PeriodToggle = () => (
    <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1">
      {(["7", "30", "90", "all"] as Period[]).map(p => (
        <Button
          key={p}
          size="sm"
          variant={period === p ? "default" : "ghost"}
          className="h-7 px-2.5 text-[11px] font-sans"
          onClick={() => setPeriod(p)}
        >
          {p === "all" ? "Tudo" : `${p}d`}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-sans text-muted-foreground uppercase tracking-wider">Período</span>
        <PeriodToggle />
      </div>

      <Tabs defaultValue="bodymap" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="bodymap" className="font-sans text-[11px] gap-1">
            <Activity className="h-3.5 w-3.5" />
            Body Map
          </TabsTrigger>
          <TabsTrigger value="evolucao" className="font-sans text-[11px] gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Carga
          </TabsTrigger>
          <TabsTrigger value="volume" className="font-sans text-[11px] gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Volume
          </TabsTrigger>
          <TabsTrigger value="intensidade" className="font-sans text-[11px] gap-1">
            <Gauge className="h-3.5 w-3.5" />
            Intensidade
          </TabsTrigger>
        </TabsList>

        {/* Body Map + Frequência */}
        <TabsContent value="bodymap" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-4">Volume por Grupamento</h3>
              <BodyMap muscleVolumes={muscleVolumes} />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider">Frequência por Grupamento</h3>
              </div>
              {muscleFrequency.length === 0 ? (
                <p className="text-xs text-muted-foreground font-sans">Sem dados no período.</p>
              ) : (
                <div className="space-y-2">
                  {muscleFrequency.map(m => {
                    const pct = (m.sessions / maxFreq) * 100;
                    return (
                      <div key={m.muscle} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-sans">
                          <span className="text-foreground">{m.muscle}</span>
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                            {m.sessions} {m.sessions === 1 ? "sessão" : "sessões"}
                          </Badge>
                        </div>
                        <div className="h-2 bg-secondary/40 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: `linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--chart-3)) 100%)` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Carga: top set + 1RM estimado */}
        <TabsContent value="evolucao" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedExercise} onValueChange={setSelectedExercise}>
              <SelectTrigger className="h-8 text-xs font-sans flex-1 min-w-[180px]">
                <SelectValue placeholder="Todos exercícios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Top 5 exercícios</SelectItem>
                {allExercises.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 h-8">
              <Switch id="show-1rm" checked={show1RM} onCheckedChange={setShow1RM} className="scale-75" />
              <Label htmlFor="show-1rm" className="text-[11px] font-sans cursor-pointer">1RM est.</Label>
            </div>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider">
                  {selectedExercise === "all" ? "Carga (kg) — top 5 exercícios" : `Carga (kg) — ${selectedExercise}`}
                </h3>
              </div>
              <p className="text-[10px] text-muted-foreground font-sans mb-3">
                {selectedExercise === "all"
                  ? "Passe o cursor sobre uma linha para destacá-la. Clique na legenda para isolar."
                  : "Linha sólida = peso real (top set). " + (show1RM ? "Linha tracejada = 1RM projetado (Epley). Área = potencial." : "Ative \"1RM est.\" para ver projeção de força.")}
              </p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolutionData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      {filteredExerciseNames.map((name, i) => (
                        <linearGradient key={name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={exerciseColors[i % exerciseColors.length]} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={exerciseColors[i % exerciseColors.length]} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={40} unit=" kg" />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        // Agrupa por exercício: { name, top, e1rm, color }
                        const grouped: Record<string, { top?: number; e1rm?: number; color: string }> = {};
                        payload.forEach((p: any) => {
                          const isE = String(p.dataKey).endsWith("__1RM");
                          const baseName = isE ? String(p.dataKey).replace("__1RM", "") : String(p.dataKey);
                          if (!grouped[baseName]) grouped[baseName] = { color: p.stroke };
                          if (isE) grouped[baseName].e1rm = p.value;
                          else grouped[baseName].top = p.value;
                        });
                        const rows = Object.entries(grouped)
                          .filter(([, v]) => v.top != null || v.e1rm != null)
                          .sort(([, a], [, b]) => (b.top ?? b.e1rm ?? 0) - (a.top ?? a.e1rm ?? 0));
                        return (
                          <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-xl text-xs font-sans min-w-[200px]">
                            <p className="font-semibold text-foreground mb-1.5">{label}</p>
                            <div className="space-y-1">
                              {rows.map(([name, v]) => (
                                <div key={name} className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: v.color }} />
                                    <span className="text-foreground truncate">{name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 font-mono shrink-0">
                                    {v.top != null && <span className="text-foreground">{v.top}kg</span>}
                                    {v.e1rm != null && <span className="text-muted-foreground">~{v.e1rm}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {show1RM && (
                              <p className="text-[9px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
                                kg = top set · ~ = 1RM estimado
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(v: any) => String(v).replace("__1RM", " (1RM)")}
                      onMouseEnter={(o: any) => setHoveredLine(String(o.dataKey).replace("__1RM", ""))}
                      onMouseLeave={() => setHoveredLine(null)}
                    />
                    {/* Área entre top set e 1RM apenas quando 1 exercício isolado e 1RM ativo */}
                    {show1RM && selectedExercise !== "all" && filteredExerciseNames.map((name, i) => (
                      <Area
                        key={`area-${name}`}
                        type="monotone"
                        dataKey={`${name}__1RM`}
                        stroke="none"
                        fill={`url(#grad-${i})`}
                        legendType="none"
                        connectNulls
                      />
                    ))}
                    {/* Top set — linhas sólidas */}
                    {filteredExerciseNames.map((name, i) => {
                      const dim = hoveredLine && hoveredLine !== name;
                      return (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={exerciseColors[i % exerciseColors.length]}
                          strokeWidth={hoveredLine === name ? 3.5 : 2.5}
                          strokeOpacity={dim ? 0.18 : 1}
                          dot={{ r: 3, strokeWidth: 1.5, fill: "hsl(var(--background))" }}
                          activeDot={{ r: 5 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      );
                    })}
                    {/* 1RM tracejado — só quando ativo */}
                    {show1RM && filteredExerciseNames.map((name, i) => {
                      const dim = hoveredLine && hoveredLine !== name;
                      return (
                        <Line
                          key={`${name}__1RM`}
                          type="monotone"
                          dataKey={`${name}__1RM`}
                          stroke={exerciseColors[i % exerciseColors.length]}
                          strokeWidth={1.5}
                          strokeOpacity={dim ? 0.12 : 0.7}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {personalRecords.length > 0 && (
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider">Recordes Pessoais</h3>
                </div>
                <div className="space-y-2">
                  {personalRecords.slice(0, 10).map((pr, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-sans">
                      <div className="flex flex-col">
                        <span className="text-foreground">{pr.exercise}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {pr.reps} reps · {format(parseISO(pr.date), "dd MMM", { locale: ptBR })} · 1RM est. {pr.e1rm}kg
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">{pr.weight}kg</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Volume + comparativo */}
        <TabsContent value="volume" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Tonelagem por Sessão (kg)
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${Number(v).toLocaleString("pt-BR")} kg`, "Tonelagem"]}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Comparativo — últimos {comparison.days}d vs {comparison.days}d anteriores
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Tonelagem", a: comparison.tonnageA.toLocaleString("pt-BR"), b: comparison.tonnageB.toLocaleString("pt-BR"), pct: comparison.tonnagePct, suffix: "kg" },
                  { label: "Sessões", a: comparison.sessionsA, b: comparison.sessionsB, pct: comparison.sessionsPct, suffix: "" },
                  { label: "Novos PRs", a: comparison.prsA, b: comparison.prsB, pct: comparison.prsPct, suffix: "" },
                ].map((m, i) => (
                  <div key={i} className="bg-secondary/40 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground font-sans uppercase mb-1">{m.label}</p>
                    <p className="text-lg font-bold font-mono text-foreground">{m.a}{m.suffix && ` ${m.suffix}`}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">vs {m.b}{m.suffix && ` ${m.suffix}`}</p>
                    <Badge
                      variant="outline"
                      className={`mt-1 text-[10px] ${m.pct >= 0 ? "border-green-500/40 text-green-500" : "border-red-500/40 text-red-500"}`}
                    >
                      {m.pct >= 0 ? "+" : ""}{m.pct}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-foreground">{totalSessions}</p>
                  <p className="text-[10px] text-muted-foreground font-sans uppercase">Sessões</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-foreground">{personalRecords.length}</p>
                  <p className="text-[10px] text-muted-foreground font-sans uppercase">Recordes</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-foreground">{totalTonnage.toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-muted-foreground font-sans uppercase">Tonelagem (kg)</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-foreground">{avgTonnage.toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-muted-foreground font-sans uppercase">Média/sessão (kg)</p>
                </div>
                {topPR && (
                  <div className="col-span-2 bg-secondary/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold font-mono text-primary">{topPR.exercise} — {topPR.weight}kg</p>
                    <p className="text-[10px] text-muted-foreground font-sans uppercase">Maior PR</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Intensidade + RPE */}
        <TabsContent value="intensidade" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Intensidade Média por Sessão
              </h3>
              <p className="text-[10px] text-muted-foreground font-sans mb-3">
                Tonelagem dividida pelo total de repetições (kg/rep). Mostra densidade de carga.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, name: any) => [`${v} ${name === "intensity" ? "kg/rep" : "kg"}`, name === "intensity" ? "Intensidade" : "Tonelagem"]}
                    />
                    <Area type="monotone" dataKey="intensity" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.2)" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider">
                  Distribuição de RPE
                </h3>
                {avgRpe > 0 && (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                    Média: {avgRpe}
                  </Badge>
                )}
              </div>
              {rpeDistribution.length === 0 ? (
                <p className="text-xs text-muted-foreground font-sans">Nenhum RPE registrado no período.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rpeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="rpe" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [`${v} séries`, "Quantidade"]}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {rpeDistribution.map((entry, idx) => {
                          // verde leve → vermelho intenso conforme RPE sobe
                          const ratio = Math.min(1, Math.max(0, (entry.raw - 5) / 5));
                          const hue = 140 - ratio * 140; // 140 (verde) → 0 (vermelho)
                          return <Cell key={idx} fill={`hsl(${hue}, 70%, 50%)`} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
