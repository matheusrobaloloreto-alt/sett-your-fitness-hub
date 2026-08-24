import { useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  buildPeriodizationPlan,
  currentWeekIndex,
  weeksBetweenDates,
  MICROCYCLES,
  MESOCYCLES,
  type MicrocycleType,
} from "@/lib/periodization";
import type { ResolvedWeekContext } from "@/lib/weeklyStrengthPeriodization";
import { buildStudentProgressionHighlight, studentEffortCue, weeklyMethodLabel } from "@/lib/weeklyStrengthPeriodization";

const DOT: Record<MicrocycleType, string> = {
  ordinario: "bg-primary",
  choque: "bg-amber-500",
  regenerativo: "bg-green-500",
};
const CHIP: Record<MicrocycleType, string> = {
  ordinario: "border-primary/30 bg-primary/15 text-primary",
  choque: "border-amber-500/30 bg-amber-500/15 text-amber-700",
  regenerativo: "border-green-500/30 bg-green-500/15 text-green-700",
};

/**
 * Periodização do ciclo em MENU SUSPENSO (recolhido por padrão p/ não ocupar espaço).
 * Fechado: resumo da fase atual. Aberto: linha do tempo navegável + detalhe da semana.
 * Tudo derivado do objetivo + datas/duração do ciclo (sem depender do banco).
 */
export function PeriodizationBanner({
  objective,
  durationWeeks,
  startDate,
  endDate,
  prescribedWeek,
}: {
  objective?: string | null;
  durationWeeks?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  prescribedWeek?: ResolvedWeekContext | null;
}) {
  const dur = durationWeeks || weeksBetweenDates(startDate, endDate) || 6;
  const plan = buildPeriodizationPlan(objective, dur);
  const curIdx = currentWeekIndex(startDate, plan.durationWeeks);

  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number>(curIdx);

  const cur = plan.weeks[curIdx] || plan.weeks[0];
  if (!cur) return null;
  const curMicro = MICROCYCLES[cur.microcycle];
  const curMeso = MESOCYCLES[cur.mesocycle];
  const progressionHighlight = buildStudentProgressionHighlight({
    prescribedWeek,
    objective,
    durationWeeks: dur,
    startDate,
    endDate,
  });
  const currentLabel = prescribedWeek
    ? `${prescribedWeek.block === "acumulacao" ? "Acumulação" : prescribedWeek.block === "intensificacao" ? "Intensificação" : "Base"} · ${prescribedWeek.methods.length ? prescribedWeek.methods.map((method) => weeklyMethodLabel(method) || method).join(" + ") : "Séries retas"}`
    : `${curMeso.label} · ${curMicro.short}`;

  const wk = plan.weeks[Math.min(sel, plan.weeks.length - 1)] || cur;
  const micro = MICROCYCLES[wk.microcycle];
  const meso = MESOCYCLES[wk.mesocycle];
  const isCurrent = sel === curIdx;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <Collapsible
        open={open}
        onOpenChange={(v) => { setOpen(v); if (v) setSel(curIdx); }}
      >
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between gap-2 p-4 text-left">
            <span className="flex min-w-0 items-center gap-2">
              <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-mono-data text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  <span>{progressionHighlight.title}</span>
                  <span className="mx-1">·</span>
                  <span>{progressionHighlight.eyebrow}</span>
                </span>
                <span className="font-mono-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Periodização · Semana {curIdx + 1}/{plan.durationWeeks}
                </span>
                <span className="font-sans text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {progressionHighlight.body}
                </span>
              </span>
              <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline ${CHIP[cur.microcycle]}`}>
                {curMicro.short}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
            {/* Linha do tempo dos microciclos — toque para ver a fase de cada semana */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {plan.weeks.map((w, i) => {
                const isCur = i === curIdx;
                const isSel = i === sel;
                return (
                  <button
                    key={w.week}
                    type="button"
                    onClick={() => setSel(i)}
                    title={`Semana ${w.week} · ${MICROCYCLES[w.microcycle].short}`}
                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold transition
                      ${isSel ? "border-primary ring-2 ring-primary/40" : "border-border"}
                      ${isCur ? "bg-primary/10" : "bg-card hover:bg-secondary"}`}
                  >
                    <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${DOT[w.microcycle]}`} />
                    <span className="text-foreground">{w.week}</span>
                  </button>
                );
              })}
            </div>

            {/* Detalhe da semana selecionada (padrão = atual) */}
            <div className="space-y-1.5 rounded-lg border border-border bg-card/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Mesociclo: {meso.label}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHIP[wk.microcycle]}`}>
                  {micro.short}
                </span>
                {!isCurrent && (
                  <span className="text-[10px] text-muted-foreground">prévia · semana {wk.week}</span>
                )}
              </div>
              <p className="font-sans text-sm leading-relaxed text-foreground">{micro.description}</p>
              <p className="font-sans text-xs text-muted-foreground">{wk.focus}</p>
              <p className="font-mono-data text-[11px] text-muted-foreground">
                Esforço alvo: {studentEffortCue(isCurrent && prescribedWeek ? prescribedWeek.rir : wk.rir)} · Volume ~{wk.volumePct}% da referência
              </p>
              {isCurrent && prescribedWeek && (
                <p className="font-sans text-xs font-medium text-primary">
                  {progressionHighlight.title} · {progressionHighlight.eyebrow} · {currentLabel}
                </p>
              )}
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap gap-3 px-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Ordinário</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Choque</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Regenerativo</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
