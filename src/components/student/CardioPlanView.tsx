import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Footprints,
  Waves,
  Bike,
  Loader2,
  AlertTriangle,
  Target,
  ShieldCheck,
  Dumbbell,
  Heart,
  CalendarDays,
  Apple,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { businessDateYmd } from "@/lib/businessDate";

type Sport = "corrida" | "natacao" | "ciclismo";

interface FcZone {
  min?: number | string;
  max?: number | string;
}

interface CardioSession {
  day?: string;
  type?: string;
  title?: string;
  sport?: string;
  description?: string;
  distance?: number | string;
  distance_km?: number | string;
  duration?: number | string;
  total_min?: number | string;
  intensity?: number | string;
  zone?: string;
  fc_zone?: string;
  fc_target?: string;
  intervals?: string;
  notes?: string;
}

interface CardioWeek {
  week_number?: number | string;
  label?: string;
  focus?: string;
  type?: string;
  volume_km?: number | string;
  volume_hours?: number | string;
  sessions?: CardioSession[];
  dias?: CardioSession[];
}

interface SafetyCheck {
  tsb_status?: string;
  eva_status?: string;
  restrictions?: unknown;
  [key: string]: unknown;
}

interface CardioPlan {
  plan_name?: string;
  name?: string;
  sport?: string;
  goal?: string;
  duration_weeks?: number | string;
  model?: string;
  weeks?: CardioWeek[];
  fc_zones?: Record<string, FcZone | number | string> | null;
  safety_check?: SafetyCheck | null;
  general_tips?: string;
  complementary_strength?: unknown;
  warnings?: unknown;
  nutrition_alert?: string;
}

const SPORT_META: Record<Sport, { label: string; Icon: typeof Footprints }> = {
  corrida: { label: "corrida", Icon: Footprints },
  natacao: { label: "natação", Icon: Waves },
  ciclismo: { label: "ciclismo", Icon: Bike },
};

const ZONE_ORDER = ["z1", "z2", "z3", "z4", "z5"];
const ZONE_LABEL: Record<string, string> = {
  z1: "Z1",
  z2: "Z2",
  z3: "Z3",
  z4: "Z4",
  z5: "Z5",
};

const toText = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);

const formatZoneRange = (zone: FcZone | number | string): string => {
  if (zone == null) return "—";
  if (typeof zone === "number" || typeof zone === "string") return String(zone);
  const min = zone.min;
  const max = zone.max;
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `até ${max}`;
  return "—";
};

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function CardioPlanView({
  studentId,
  sport,
  suppressBecauseCurrentCycleCleared = false,
}: {
  studentId: string;
  sport: "corrida" | "natacao" | "ciclismo";
  suppressBecauseCurrentCycleCleared?: boolean;
}) {
  const [plan, setPlan] = useState<CardioPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      if (suppressBecauseCurrentCycleCleared) {
        if (!active) return;
        setPlan(null);
        setLoading(false);
        return;
      }
      const today = businessDateYmd();
      const { data } = await supabase
        .from("running_plans")
        .select("*")
        .eq("student_id", studentId)
        .eq("sport", sport)
        .lte("start_date", today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .or("status.is.null,status.in.(active,scheduled)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let visible = data;
      // Compatibilidade com prescrições legadas, que não tinham vigência.
      if (!visible) {
        const { data: legacy } = await supabase.from("running_plans").select("*")
          .eq("student_id", studentId).eq("sport", sport).is("start_date", null)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .or("status.is.null,status.in.(active,scheduled)")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        visible = legacy;
      }
      if (!active) return;
      setPlan((visible as CardioPlan) || null);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [studentId, sport, suppressBecauseCurrentCycleCleared]);

  const meta = SPORT_META[sport] ?? SPORT_META.corrida;
  const { label: sportLabel, Icon: SportIcon } = meta;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plan) {
    return (
      <Card className="bg-card border-border border-dashed">
        <CardContent className="p-6 text-center">
          <SportIcon className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum plano de {sportLabel} ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  const planName = plan.plan_name || plan.name || `Plano de ${sportLabel}`;
  const goal = toText(plan.goal);
  const durationWeeks = plan.duration_weeks;

  const fcZones = plan.fc_zones && typeof plan.fc_zones === "object" ? plan.fc_zones : null;
  const orderedZoneKeys = fcZones
    ? [
        ...ZONE_ORDER.filter((k) => k in fcZones),
        ...Object.keys(fcZones).filter(
          (k) => !ZONE_ORDER.includes(k) && /^z\d/i.test(k)
        ),
      ]
    : [];

  const weeks = asArray<CardioWeek>(plan.weeks);
  // O aluno NÃO vê notas internas/para o treinador (disclaimer, FC estimada, nível assumido, sync).
  const INTERNAL_WARNING = /revise antes de prescrever|metodologia bn|plano base gerado|determin[íi]st|fc estimad|estimad[ao]s|n[íi]vel de experi|assumid|sincronizad/i;
  const warnings = asArray<unknown>(plan.warnings).map(toText).filter(Boolean).filter((w) => !INTERNAL_WARNING.test(w));
  const safety = plan.safety_check && typeof plan.safety_check === "object" ? plan.safety_check : null;
  const restrictions = safety ? asArray<unknown>(safety.restrictions).map(toText).filter(Boolean) : [];

  // Plano "casca": existe no banco mas sem treinos reais (ex.: geração caiu no fallback por falta
  // de crédito da IA). Em vez de um cabeçalho com acordeão vazio ("treinos não aparecem"), deixamos
  // claro que o plano ainda não está pronto.
  const totalSessions = weeks.reduce(
    (n, w) => n + (asArray<CardioSession>(w.sessions).length || asArray<CardioSession>(w.dias).length),
    0,
  );
  if (weeks.length === 0 || totalSessions === 0) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="space-y-2 p-6 text-center">
          <SportIcon className="mx-auto h-7 w-7 text-amber-600" />
          <p className="font-display text-base text-foreground">
            Seu plano de {sportLabel} está sendo finalizado
          </p>
          <p className="text-sm text-muted-foreground">
            O plano foi criado, mas os treinos ainda não foram liberados. Fale com seu treinador —
            assim que ele finalizar, suas semanas e sessões aparecem aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SportIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-eyebrow text-muted-foreground mb-0.5">{sportLabel}</p>
          <h2 className="font-display text-lg text-primary leading-tight truncate">
            {planName}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {goal && (
              <span className="text-sm text-muted-foreground">{goal}</span>
            )}
            {durationWeeks != null && durationWeeks !== "" && (
              <Badge variant="outline" className="border-border text-foreground">
                {durationWeeks} semanas
              </Badge>
            )}
            {plan.model && (
              <Badge variant="outline" className="border-border text-muted-foreground capitalize">
                {toText(plan.model)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="bg-card border-destructive/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-eyebrow text-destructive">Alertas</span>
            </div>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-sm text-foreground flex gap-2">
                  <span className="text-destructive mt-1">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* FC Zones */}
      {orderedZoneKeys.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-eyebrow text-muted-foreground">
              Zonas de FC (bpm){(fcZones as { estimated?: boolean } | null)?.estimated ? " · estimadas" : ""}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {orderedZoneKeys.map((key) => {
              const zone = (fcZones as Record<string, FcZone | number | string>)[key];
              return (
                <div key={key} className="rounded-md border border-border bg-card px-1 py-1.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {ZONE_LABEL[key.toLowerCase()] || key.toUpperCase()}
                  </p>
                  <p className="font-mono-data text-[11px] leading-tight text-primary">
                    {formatZoneRange(zone)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weeks */}
      {weeks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-eyebrow text-muted-foreground">Semanas</span>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {weeks.map((week, wIdx) => {
              const weekNum = week.week_number ?? wIdx + 1;
              const weekLabel = week.label || `Semana ${weekNum}`;
              const sessions = asArray<CardioSession>(week.sessions).length
                ? asArray<CardioSession>(week.sessions)
                : asArray<CardioSession>(week.dias);
              return (
                <AccordionItem
                  key={wIdx}
                  value={`week-${wIdx}`}
                  className="border border-border rounded-lg bg-card px-3"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex w-full min-w-0 flex-col gap-1 pr-2 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {weekLabel}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {week.type && (
                            <Badge
                              variant="outline"
                              className="border-border text-muted-foreground text-[10px] capitalize"
                            >
                              {toText(week.type)}
                            </Badge>
                          )}
                          {week.volume_km != null && week.volume_km !== "" && (
                            <span className="font-mono-data text-xs text-primary whitespace-nowrap">
                              {toText(week.volume_km)}km
                            </span>
                          )}
                        </div>
                      </div>
                      {week.focus && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {toText(week.focus)}
                        </p>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    {sessions.length > 0 ? (
                      <div className="space-y-2">
                        {sessions.map((s, sIdx) => {
                          const dist = s.distance ?? s.distance_km;
                          const dur = s.duration ?? s.total_min;
                          const intensity = s.zone || s.fc_zone || s.intensity;
                          const fc = s.fc_target || s.fc_zone;
                          return (
                            <div
                              key={sIdx}
                              className="rounded-md border border-border bg-background p-3"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-sm font-medium text-foreground">
                                  {s.day || `Sessão ${sIdx + 1}`}
                                </span>
                                {(s.type || s.title) && (
                                  <span className="text-xs text-muted-foreground truncate">
                                    {toText(s.title || s.type)}
                                  </span>
                                )}
                              </div>
                              {(s.description) && (
                                <p className="text-sm text-foreground mb-2">
                                  {toText(s.description)}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {dist != null && dist !== "" && (
                                  <Badge
                                    variant="outline"
                                    className="border-border text-foreground text-[10px]"
                                  >
                                    <span className="font-mono-data">{toText(dist)}</span>
                                    <span className="ml-0.5 text-muted-foreground">km</span>
                                  </Badge>
                                )}
                                {dur != null && dur !== "" && (
                                  <Badge
                                    variant="outline"
                                    className="border-border text-foreground text-[10px]"
                                  >
                                    <span className="font-mono-data">{toText(dur)}</span>
                                    <span className="ml-0.5 text-muted-foreground">min</span>
                                  </Badge>
                                )}
                                {intensity != null && intensity !== "" && (
                                  <Badge
                                    variant="outline"
                                    className="border-primary/40 text-primary text-[10px]"
                                  >
                                    {toText(intensity)}
                                  </Badge>
                                )}
                              </div>
                              {fc && fc !== intensity && (
                                <p className="font-mono-data text-[11px] text-muted-foreground mt-1.5">
                                  {toText(fc)}
                                </p>
                              )}
                              {s.intervals && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {toText(s.intervals)}
                                </p>
                              )}
                              {s.notes && (
                                <p className="text-xs text-muted-foreground mt-1.5">
                                  {toText(s.notes)}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Sem sessões detalhadas para esta semana.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}

      {/* Safety check */}
      {safety && (restrictions.length > 0 || safety.tsb_status || safety.eva_status) && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-eyebrow text-muted-foreground">Segurança</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {safety.tsb_status && (
                <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">
                  TSB: {toText(safety.tsb_status)}
                </Badge>
              )}
              {safety.eva_status && (
                <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">
                  EVA: {toText(safety.eva_status)}
                </Badge>
              )}
            </div>
            {restrictions.length > 0 && (
              <ul className="space-y-1">
                {restrictions.map((r, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Força complementar, nutrição e orientações gerais NÃO aparecem aqui de propósito:
          cada modalidade tem sua aba (treino / nutrição). A corrida mostra só o plano de corrida. */}
    </div>
  );
}
