import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, BarChart3, CalendarDays, History, Megaphone, Play, Moon, ArrowRight, Utensils, Footprints, Waves, Bike, Watch } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { WeeklyBar } from "./WeeklyBar";

interface Cycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  objective?: string | null;
  workouts: { id: string; title: string; day_of_week: number | null }[];
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
  // Abas de prescrição condicionais: só aparecem se a prescrição correspondente existir no app do aluno.
  hasNutrition?: boolean;
  hasCorrida?: boolean;
  hasNatacao?: boolean;
  hasCiclismo?: boolean;
  onNavigate: (view: StudentNavView) => void;
}

export type StudentNavView =
  | "treino" | "stats" | "calendario" | "historico" | "atividades" | "avisos" | "medidas"
  | "nutricao" | "corrida" | "natacao" | "ciclismo" | "integracoes";

type NavItem = { view: StudentNavView; label: string; icon: typeof Dumbbell; sub?: string };

const NAV_ITEMS: readonly NavItem[] = [
  { view: "treino", label: "Treino", icon: Dumbbell },
  { view: "stats", label: "Estatísticas", icon: BarChart3, sub: "Volume e força" },
  { view: "calendario", label: "Calendário", icon: CalendarDays, sub: "Histórico mensal" },
  { view: "historico", label: "Histórico", icon: History },
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
  totalSessions,
  weeklyGoal,
  streak,
  activeWorkoutId,
  goalEditor,
  hasNutrition,
  hasCorrida,
  hasNatacao,
  hasCiclismo,
  onNavigate,
}: StudentHomeProps) {
  const firstName = studentName.split(" ")[0];
  const todayLabel = format(new Date(), "EEEE · dd 'de' MMMM", { locale: ptBR });
  const todayWorkout = selectedCycle?.workouts.find((w) => w.day_of_week === currentDayOfWeek) ?? null;
  const activeWorkout = selectedCycle?.workouts.find((w) => w.id === activeWorkoutId) ?? null;
  const primaryWorkout = activeWorkout ?? todayWorkout;

  // Abas de prescrição que só aparecem quando o treinador publicou aquela modalidade.
  const prescriptionItems: NavItem[] = [
    hasNutrition ? { view: "nutricao", label: "Dicas Nutricionais", icon: Utensils, sub: "Plano alimentar" } : null,
    hasCorrida ? { view: "corrida", label: "Corrida", icon: Footprints, sub: "Plano de corrida" } : null,
    hasNatacao ? { view: "natacao", label: "Natação", icon: Waves, sub: "Plano de natação" } : null,
    hasCiclismo ? { view: "ciclismo", label: "Ciclismo", icon: Bike, sub: "Plano de ciclismo" } : null,
  ].filter(Boolean) as NavItem[];
  const navItems: NavItem[] = [...NAV_ITEMS, ...prescriptionItems];

  const subFor = (view: StudentNavView, fallback?: string) => {
    if (view === "treino") return workoutCount > 0 ? `${workoutCount} treinos disponíveis` : "Ver treinos do ciclo";
    if (view === "historico") return totalSessions > 0 ? `${totalSessions} sessões` : "Sessões passadas";
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
        <button onClick={() => onNavigate("treino")} className="w-full text-left group">
          <Card className="student-action-surface relative overflow-hidden border-primary transition-shadow group-hover:shadow-lg">
            <Dumbbell className="absolute -right-4 -bottom-5 h-32 w-32 text-primary-foreground/10 rotate-12 pointer-events-none" />
            <CardContent className="relative p-5">
              {primaryWorkout ? (
                <>
                  <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">
                    {activeWorkout ? "Treino em andamento" : "Treino de hoje"}
                  </p>
                  <h3 className="font-display text-2xl mt-1.5 text-primary-foreground leading-snug">
                    {primaryWorkout.title}
                  </h3>
                  {selectedCycle.objective && (
                    <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-primary-foreground/75">
                      Por que agora: {selectedCycle.objective}
                    </p>
                  )}
                  <span className="inline-flex items-center gap-2 mt-4 text-sm font-semibold">
                    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary-foreground/15">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                    {activeWorkout ? "Retomar de onde parei" : "Iniciar treino"}
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

      {/* Navegação */}
      <div>
        <p className="text-eyebrow mb-3">Explorar</p>
        <div className="grid grid-cols-2 gap-3">
          {navItems.map((item) => {
            const { view, label, icon: Icon } = item;
            const sub = item.sub;
            const isToday = view === "treino" && !!primaryWorkout;
            return (
              <button key={view} onClick={() => onNavigate(view)} className="text-left group">
                <Card className={cn(
                  "h-full bg-card border-border transition-all duration-200",
                  "group-hover:border-primary/50 group-hover:shadow-md group-hover:-translate-y-0.5",
                )}>
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center transition-colors group-hover:bg-primary/15">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      {isToday && (
                        <span className="font-mono-data text-[9px] uppercase tracking-[0.14em] text-primary bg-primary/10 rounded-full px-2 py-0.5">
                          Hoje
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground font-sans text-sm">{label}</h3>
                      <p className="text-xs text-muted-foreground font-sans mt-0.5">{subFor(view, sub)}</p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
