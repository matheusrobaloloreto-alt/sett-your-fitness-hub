import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, BarChart3, CalendarDays, Megaphone, Play, Moon, ArrowRight, Utensils, Footprints, Waves, Bike, Watch } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { WeeklyBar } from "./WeeklyBar";
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
  enrollmentInfo: { plan_name: string; start_date: string; end_date: string } | null;
  overallProgress: number;
  selectedCycle: Cycle | null;
  cycleProgress: number;
  workoutCount: number;
  weeklySessionCount: number;
  trainedDays: Set<number>;
  currentDayOfWeek: number;
  totalSessions: number;
  weeklyGoal: number;
  streak: number;
  activeWorkoutId?: string | null;
  goalEditor?: React.ReactNode;
  leaderboard?: React.ReactNode;
  // Abas de prescrição condicionais: só aparecem se a prescrição correspondente existir no app do aluno.
  hasNutrition?: boolean;
  hasCorrida?: boolean;
  hasNatacao?: boolean;
  hasCiclismo?: boolean;
  onNavigate: (view: StudentNavView, workoutId?: string | null) => void;
}

export type StudentNavView =
  | "treino" | "stats" | "calendario" | "atividades" | "avisos" | "medidas"
  | "nutricao" | "corrida" | "natacao" | "ciclismo" | "integracoes";

type NavItem = { view: StudentNavView; label: string; icon: typeof Dumbbell; sub?: string };

function ProgressionHighlightBlock({
  title,
  eyebrow,
  body,
  tone = "light",
}: {
  title: string;
  eyebrow: string;
  body: string;
  tone?: "light" | "dark";
}) {
  const titleClass = tone === "dark" ? "text-foreground" : "text-primary-foreground";
  const eyebrowClass = tone === "dark" ? "text-primary" : "text-primary-foreground/65";
  const bodyClass = tone === "dark" ? "text-muted-foreground" : "text-primary-foreground/78";
  return (
    <div className="mt-3 max-w-[34rem] space-y-1">
      <p className={`font-mono-data text-[10px] uppercase tracking-[0.16em] ${eyebrowClass}`}>
        <span className={titleClass}>{title}</span>
        <span className="mx-1.5">·</span>
        {eyebrow}
      </p>
      <p className={`text-sm leading-relaxed ${bodyClass}`}>
        {body}
      </p>
    </div>
  );
}

const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  { view: "treino", label: "Treino", icon: Dumbbell },
];

const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { view: "stats", label: "Estatísticas", icon: BarChart3, sub: "Volume e força" },
  { view: "calendario", label: "Calendário", icon: CalendarDays, sub: "Histórico mensal" },
  { view: "integracoes", label: "Integrações", icon: Watch, sub: "Relógios e aplicativos" },
  // "Atividades" removido: cada modalidade prescrita (corrida/natação/ciclismo/nutrição) tem sua própria aba.
  // "Avisos" removido daqui: virou o sino no topo (AnnouncementsBell).
];

export function StudentHome({
  studentName,
  enrollmentInfo,
  overallProgress,
  selectedCycle,
  cycleProgress,
  workoutCount,
  weeklySessionCount,
  trainedDays,
  currentDayOfWeek,
  weeklyGoal,
  streak,
  activeWorkoutId,
  goalEditor,
  leaderboard,
  hasNutrition,
  hasCorrida,
  hasNatacao,
  hasCiclismo,
  onNavigate,
}: StudentHomeProps) {
  const firstName = studentName.split(" ")[0];
  const todayLabel = format(new Date(), "EEEE · dd 'de' MMMM", { locale: ptBR });
  const workoutTarget = resolveStudentHomeWorkoutTarget(
    selectedCycle?.workouts,
    currentDayOfWeek,
    activeWorkoutId,
  );
  const primaryWorkout = workoutTarget?.workout ?? null;
  const isStaleActiveWorkout = workoutTarget?.kind === "stale_active";
  const progressionHighlight = selectedCycle
    ? buildStudentProgressionHighlight({
      prescribedWeek: primaryWorkout?.weekly_context,
      objective: selectedCycle.objective,
      durationWeeks: selectedCycle.duration_weeks,
      startDate: selectedCycle.start_date,
      endDate: selectedCycle.end_date,
    })
    : null;

  // Abas de prescrição que só aparecem quando o treinador publicou aquela modalidade.
  const prescriptionItems: NavItem[] = [
    hasCorrida ? { view: "corrida", label: "Corrida", icon: Footprints, sub: "Plano de corrida" } : null,
    hasCiclismo ? { view: "ciclismo", label: "Ciclismo", icon: Bike, sub: "Plano de ciclismo" } : null,
    hasNatacao ? { view: "natacao", label: "Natação", icon: Waves, sub: "Plano de natação" } : null,
    hasNutrition ? { view: "nutricao", label: "Dicas nutricionais", icon: Utensils, sub: "Plano alimentar" } : null,
  ].filter(Boolean) as NavItem[];
  const navItems: NavItem[] = [...PRIMARY_NAV_ITEMS, ...prescriptionItems, ...SECONDARY_NAV_ITEMS];

  const subFor = (view: StudentNavView, fallback?: string) => {
    if (view === "treino") return workoutCount > 0 ? `${workoutCount} treinos disponíveis` : "Ver treinos do ciclo";
    return fallback ?? "";
  };

  return (
    <div className="space-y-7">
      {/* Greeting — editorial */}
      <div>
        <p className="text-eyebrow">{todayLabel}</p>
        <h2 className="font-display text-3xl sm:text-4xl text-foreground mt-1 leading-tight">
          Olá, {firstName}.
        </h2>
        {enrollmentInfo && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono-data text-[11px] tracking-wide text-muted-foreground">{enrollmentInfo.plan_name}</span>
              <span className="font-mono-data text-[11px] text-muted-foreground">
                {format(parseISO(enrollmentInfo.start_date), "dd/MM/yy")} – {format(parseISO(enrollmentInfo.end_date), "dd/MM/yy")} · {overallProgress}%
              </span>
            </div>
            <Progress value={overallProgress} className="h-1.5" />
          </div>
        )}
      </div>

      {/* Hero — Treino de hoje (maior ação do atleta) */}
      {selectedCycle && (
        <button onClick={() => onNavigate("treino", primaryWorkout?.id ?? null)} className="w-full text-left group">
          <Card className="student-action-surface relative overflow-hidden border-primary transition-shadow group-hover:shadow-lg">
            <Dumbbell className="absolute -right-4 -bottom-5 h-32 w-32 text-primary-foreground/10 rotate-12 pointer-events-none" />
            <CardContent className="relative p-5">
              {primaryWorkout ? (
                <>
                  <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">
                    {workoutTarget?.kind === "active" ? "Treino em andamento" : "Treino de hoje"}
                  </p>
                  <h3 className="font-display text-2xl mt-1.5 text-primary-foreground leading-snug">
                    {primaryWorkout.title}
                  </h3>
                  {progressionHighlight && (
                    <ProgressionHighlightBlock
                      title={progressionHighlight.title}
                      eyebrow={progressionHighlight.eyebrow}
                      body={progressionHighlight.body}
                    />
                  )}
                  <span className="inline-flex items-center gap-2 mt-4 text-sm font-semibold">
                    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary-foreground/15">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                    {workoutTarget?.kind === "active" ? "Retomar de onde parei" : "Iniciar treino"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </>
              ) : isStaleActiveWorkout ? (
                <>
                  <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">
                    Treino em andamento
                  </p>
                  <h3 className="font-display text-2xl mt-1.5 text-primary-foreground leading-snug">
                    Retomar treino em andamento
                  </h3>
                  <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-primary-foreground/75">
                    Há uma sessão aberta de outro treino. Abra a aba de treino para recuperar antes de iniciar outro.
                  </p>
                  {progressionHighlight && (
                    <ProgressionHighlightBlock
                      title={progressionHighlight.title}
                      eyebrow={progressionHighlight.eyebrow}
                      body={progressionHighlight.body}
                    />
                  )}
                  <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary-foreground/80">
                    Ver treinos do ciclo
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </>
              ) : (
                <>
                  <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">
                    Hoje
                  </p>
                  <h3 className="font-display text-2xl mt-1.5 text-primary-foreground leading-snug flex items-center gap-2">
                    <Moon className="h-5 w-5" /> Dia de descanso
                  </h3>
                  {progressionHighlight && (
                    <ProgressionHighlightBlock
                      title={progressionHighlight.title}
                      eyebrow={progressionHighlight.eyebrow}
                      body={progressionHighlight.body}
                    />
                  )}
                  <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary-foreground/80">
                    Ver treinos do ciclo
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        </button>
      )}

      {/* Onboarding — aluno ainda sem ciclo/treino montado */}
      {!selectedCycle && (
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Bem-vindo</p>
            <h3 className="font-display text-xl text-foreground mt-1.5 leading-snug">Seu treino está sendo montado</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Seu treinador está preparando seu programa. Enquanto isso, fique de olho nos avisos:
            </p>
            <div className="mt-4">
              <button
                onClick={() => onNavigate("avisos")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
              >
                <Megaphone className="h-4 w-4 text-primary" /> Ver avisos
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ciclo atual */}
      {selectedCycle && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-mono-data text-sm font-semibold uppercase tracking-[0.12em] text-primary">
                  Ciclo {selectedCycle.cycle_number}
                </h3>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">Atual</Badge>
              </div>
              <span className="font-mono-data text-[11px] text-muted-foreground">
                {format(parseISO(selectedCycle.start_date), "dd/MM", { locale: ptBR })} – {format(parseISO(selectedCycle.end_date), "dd/MM", { locale: ptBR })} · {cycleProgress}%
              </span>
            </div>
            <Progress value={cycleProgress} className="h-1.5" />
          </CardContent>
        </Card>
      )}

      {/* Semana */}
      <WeeklyBar
        trainedDays={trainedDays}
        currentDayOfWeek={currentDayOfWeek}
        weeklySessionCount={weeklySessionCount}
        weeklyGoal={weeklyGoal}
        streak={streak}
        goalEditor={goalEditor}
      />

      {leaderboard}

      {/* Navegação */}
      <nav aria-label="Explorar áreas do app" className="border-t border-border pt-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-eyebrow">Explorar</p>
            <h3 className="mt-1 font-display text-xl leading-tight text-foreground">Seu índice de treino</h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("treino")}
            className="min-h-11 shrink-0 rounded-md border border-primary/40 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Abrir treino
          </button>
        </div>
        <ul aria-label="Destinos do portal do aluno" className="grid grid-cols-2 gap-2">
          {navItems.map((item) => {
            const { view, label, icon: Icon } = item;
            const sub = item.sub;
            const resolvedSub = subFor(view, sub);
            const isToday = view === "treino" && !!primaryWorkout;
            return (
              <li key={view} className="min-w-0">
                <button
                  type="button"
                  aria-label={`${label}: ${resolvedSub}`}
                  onClick={() => onNavigate(view)}
                  className={cn(
                    "group flex min-h-11 h-full w-full flex-col rounded-xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </span>
                    {isToday ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-primary">Hoje</span>
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-2 min-w-0 w-full flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-sans text-sm font-semibold text-foreground">{label}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{resolvedSub}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
