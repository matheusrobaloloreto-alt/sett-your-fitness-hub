import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight, BarChart3, CalendarDays, Check, ChevronRight, Dumbbell,
  Flame, Layers, Link2, Megaphone, Moon, Target,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buildStudentProgressionHighlight,
  resolveStudentHomeWorkoutTarget,
  type ResolvedWeekContext,
} from "@/lib/weeklyStrengthPeriodization";

interface Cycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  objective?: string | null;
  duration_weeks?: number | null;
  workouts: { id: string; title: string; day_of_week: number | null; weekly_context?: ResolvedWeekContext }[];
}

interface StudentHomeProps {
  studentName: string;
  nameBadge?: React.ReactNode;
  enrollmentInfo: { plan_name: string; start_date: string; end_date: string } | null;
  overallProgress: number;
  selectedCycle: Cycle | null;
  cycleProgress: number;
  weeklySessionCount: number;
  trainedDays: Set<number>;
  currentDayOfWeek: number;
  totalSessions: number;
  weeklyGoal: number;
  streak: number;
  activeWorkoutId?: string | null;
  goalEditor?: React.ReactNode;
  leaderboard?: React.ReactNode;
  onNavigate: (view: StudentNavView, workoutId?: string | null) => void;
}

export type StudentNavView =
  | "treino" | "stats" | "calendario" | "atividades" | "avisos" | "medidas"
  | "nutricao" | "corrida" | "natacao" | "ciclismo" | "integracoes";

const trackingItems = [
  { view: "calendario", label: "Calendário", icon: CalendarDays, sub: "Histórico de treinos" },
  { view: "stats", label: "Estatísticas", icon: BarChart3, sub: "Volume e evolução" },
  { view: "integracoes", label: "Integrações", icon: Link2, sub: "Relógios e aplicativos" },
] as const;

function getCycleCalendarLabel(cycle: Cycle, today: Date, progress: number) {
  const start = parseISO(cycle.start_date);
  const end = parseISO(cycle.end_date);
  const scheduledDays = differenceInCalendarDays(end, start);
  if (!(scheduledDays > 0)) return { week: null, detail: null };

  const elapsedDays = differenceInCalendarDays(today, start);
  if (elapsedDays < 0) return { week: null, detail: `Início em ${format(start, "dd/MM")}` };
  if (elapsedDays > scheduledDays) return { week: null, detail: "Período encerrado" };

  const duration = cycle.duration_weeks;
  if (duration && Number.isInteger(duration) && duration > 0 && Math.abs(duration * 7 - scheduledDays) <= 1) {
    const elapsedWeeks = Math.min(Math.floor(elapsedDays / 7), duration);
    return {
      week: Math.min(elapsedWeeks + 1, duration),
      detail: `${elapsedWeeks} de ${duration} ${duration === 1 ? "semana" : "semanas"}`,
    };
  }

  return { week: null, detail: `${format(start, "dd/MM")} – ${format(end, "dd/MM")} · ${progress}%` };
}

export function StudentHome({
  studentName,
  nameBadge,
  enrollmentInfo,
  overallProgress,
  selectedCycle,
  cycleProgress,
  weeklySessionCount,
  trainedDays,
  currentDayOfWeek,
  weeklyGoal,
  streak,
  activeWorkoutId,
  goalEditor,
  leaderboard,
  onNavigate,
}: StudentHomeProps) {
  const firstName = studentName.split(" ")[0];
  const today = new Date();
  const workoutTarget = resolveStudentHomeWorkoutTarget(
    selectedCycle?.workouts,
    currentDayOfWeek,
    activeWorkoutId,
  );
  const primaryWorkout = workoutTarget?.workout ?? null;
  const isActiveWorkout = workoutTarget?.kind === "active";
  const isStaleActiveWorkout = workoutTarget?.kind === "stale_active";
  const progressionHighlight = selectedCycle
    ? buildStudentProgressionHighlight({
      prescribedWeek: primaryWorkout?.weekly_context,
      objective: selectedCycle.objective,
      durationWeeks: selectedCycle.duration_weeks,
      startDate: selectedCycle.start_date,
      endDate: selectedCycle.end_date,
      today,
    })
    : null;

  const cycleCalendar = selectedCycle && getCycleCalendarLabel(selectedCycle, today, cycleProgress);
  const weeklyDone = weeklySessionCount ?? trainedDays.size;
  const workoutAction = isActiveWorkout ? "Retomar de onde parei" : primaryWorkout ? "Abrir treino" : "Ver treinos do ciclo";

  return (
    <div className="space-y-3">
      <div className="px-1 pb-2">
        <h2 className="flex flex-wrap items-center gap-x-2 font-sans text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          <span>Olá, {firstName}</span>{nameBadge}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          {primaryWorkout ? "Bom treino!" : format(today, "EEEE · dd 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {selectedCycle ? (
        <Card className="rounded-2xl border-border">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-3 font-sans text-xl font-semibold leading-tight tracking-tight">
              {primaryWorkout || isStaleActiveWorkout ? (
                <Dumbbell className="h-6 w-6 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="h-6 w-6 shrink-0" aria-hidden="true" />
              )}
              {isActiveWorkout || isStaleActiveWorkout ? "Treino em andamento" : primaryWorkout ? "Treino de hoje" : "Dia de descanso"}
            </h3>
            {primaryWorkout && <p className="text-lg font-semibold leading-snug">{primaryWorkout.title}</p>}
            {isStaleActiveWorkout && (
              <div>
                <p className="font-semibold">Retomar treino em andamento</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Há uma sessão aberta de outro treino. Abra a aba de treino para recuperar antes de iniciar outro.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => onNavigate("treino", primaryWorkout?.id ?? null)}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 py-2.5 text-center text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {workoutAction}
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
            </button>
            {progressionHighlight && (
              <div className="space-y-1 border-t border-border pt-3 text-sm">
                <p className="font-medium">
                  <span>{progressionHighlight.title}</span>
                  <span className="text-muted-foreground"> · <span>{progressionHighlight.eyebrow}</span></span>
                </p>
                <p className="max-w-prose leading-snug text-muted-foreground">{progressionHighlight.body}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border">
          <CardContent className="space-y-3 p-4">
            <h3 className="font-sans text-lg font-semibold tracking-tight">Seu treino está sendo montado</h3>
            <p className="text-sm text-muted-foreground">
              Seu treinador está preparando seu programa. Enquanto isso, fique de olho nos avisos:
            </p>
            <button
              type="button"
              onClick={() => onNavigate("avisos")}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" /> Ver avisos
            </button>
          </CardContent>
        </Card>
      )}

      {selectedCycle && cycleCalendar && (
        <Card className="rounded-2xl border-border">
          <CardContent className="space-y-2.5 p-4">
            <h3 className="flex items-center gap-3 font-sans text-lg font-semibold leading-tight tracking-tight">
              <Layers className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span>Ciclo {selectedCycle.cycle_number}{cycleCalendar.week && ` · Semana ${cycleCalendar.week}`}</span>
            </h3>
            {cycleCalendar.detail && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Progress
                  value={cycleProgress}
                  aria-valuenow={cycleProgress}
                  aria-label="Progresso do ciclo"
                  className="h-2.5 min-w-16 flex-1 bg-border/60 [&>div]:rounded-full"
                />
                <span className="text-sm tabular-nums text-muted-foreground">{cycleCalendar.detail}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border">
        <CardContent className="space-y-2.5 p-4">
          <h3 className="flex items-center gap-3 font-sans text-lg font-semibold leading-tight tracking-tight">
            <Target className="h-6 w-6 shrink-0" aria-hidden="true" /> Meta semanal
          </h3>
          <p className="text-center text-base font-medium tabular-nums">
            {weeklyDone} de {weeklyGoal} {weeklyGoal === 1 ? "treino" : "treinos"}
          </p>
          {Number.isInteger(weeklyGoal) && weeklyGoal > 0 && weeklyGoal <= 7 && (
            <div aria-hidden="true" className="mx-auto flex max-w-xs flex-wrap justify-evenly gap-2">
              {Array.from({ length: weeklyGoal }, (_, index) => (
                index < weeklyDone ? (
                  <span key={index} className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <span key={index} className="h-7 w-7 rounded-full border border-border" />
                )
              ))}
            </div>
          )}
          {(streak > 0 || goalEditor) && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {streak > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Flame className="h-4 w-4 text-primary" aria-hidden="true" />
                  {streak} {streak === 1 ? "semana seguida" : "semanas seguidas"}
                </span>
              )}
              {goalEditor && <div className="ml-auto">{goalEditor}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <nav aria-label="Acompanhamento" className="space-y-3 pt-3">
        <h3 className="px-1 font-sans text-2xl font-bold leading-tight tracking-tight text-foreground">Acompanhamento</h3>
        <Card className="overflow-hidden rounded-2xl border-border">
          <ul className="divide-y divide-border">
            {trackingItems.map(({ view, label, icon: Icon, sub }) => (
              <li key={view}>
                <button
                  type="button"
                  onClick={() => onNavigate(view)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold leading-tight">{label}</span>
                    <span className="block text-sm leading-tight text-muted-foreground">{sub}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </nav>

      {leaderboard}

      {enrollmentInfo && (
        <Card className="rounded-2xl border-border">
          <CardContent className="space-y-2 p-4">
            <h3 className="font-sans text-base font-semibold tracking-tight">{enrollmentInfo.plan_name}</h3>
            <p className="text-xs tabular-nums text-muted-foreground">
              {format(parseISO(enrollmentInfo.start_date), "dd/MM/yy")} – {format(parseISO(enrollmentInfo.end_date), "dd/MM/yy")} · {overallProgress}%
            </p>
            <Progress value={overallProgress} aria-valuenow={overallProgress} aria-label="Progresso do plano" className="h-1.5" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
