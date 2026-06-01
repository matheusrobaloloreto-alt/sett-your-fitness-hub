import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, BarChart3, CalendarDays, History, Activity, Megaphone } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { WeeklyBar } from "./WeeklyBar";

interface Cycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
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
  goalEditor?: React.ReactNode;
  achievementsPanel?: React.ReactNode;
  onNavigate: (view: "treino" | "stats" | "calendario" | "historico" | "atividades" | "avisos") => void;
}


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
  goalEditor,
  achievementsPanel,
  onNavigate,

}: StudentHomeProps) {
  const firstName = studentName.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-foreground font-sans">
          Olá, {firstName}! 👋
        </h2>
        {enrollmentInfo && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-sans">{enrollmentInfo.plan_name}</span>
              <span className="text-muted-foreground font-sans">
                {format(parseISO(enrollmentInfo.start_date), "dd/MM/yy")} — {format(parseISO(enrollmentInfo.end_date), "dd/MM/yy")}
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        )}
      </div>

      {/* Cycle info */}
      {selectedCycle && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-primary font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  CICLO {selectedCycle.cycle_number}
                </h3>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">Atual</Badge>
              </div>
              <span className="text-xs text-muted-foreground font-sans">
                {format(parseISO(selectedCycle.start_date), "dd/MM", { locale: ptBR })} — {format(parseISO(selectedCycle.end_date), "dd/MM", { locale: ptBR })}
              </span>
            </div>
            <Progress value={cycleProgress} className="h-1.5" />
          </CardContent>
        </Card>
      )}

      {/* Weekly bar - shows actual trained days */}
      <WeeklyBar
        trainedDays={trainedDays}
        currentDayOfWeek={currentDayOfWeek}
        weeklySessionCount={weeklySessionCount}
        weeklyGoal={weeklyGoal}
        streak={streak}
        goalEditor={goalEditor}
      />

      {achievementsPanel}




      {/* Navigation grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Treino */}
        <button onClick={() => onNavigate("treino")} className="text-left">
          <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Dumbbell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground font-sans text-sm">Treino</h3>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">
                  {workoutCount > 0 ? `${workoutCount} treinos disponíveis` : "Ver treinos do ciclo"}
                </p>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Estatísticas */}
        <button onClick={() => onNavigate("stats")} className="text-left">
          <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground font-sans text-sm">Estatísticas</h3>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">Volume e força</p>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Calendário */}
        <button onClick={() => onNavigate("calendario")} className="text-left">
          <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground font-sans text-sm">Calendário</h3>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">Histórico mensal</p>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Histórico */}
        <button onClick={() => onNavigate("historico")} className="text-left">
          <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground font-sans text-sm">Histórico</h3>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">
                  {totalSessions > 0 ? `${totalSessions} sessões` : "Sessões passadas"}
                </p>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Atividades externas */}
        <button onClick={() => onNavigate("atividades")} className="text-left">
          <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground font-sans text-sm">Atividades</h3>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">Corrida, natação e mais</p>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Avisos */}
        <button onClick={() => onNavigate("avisos")} className="text-left">
          <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground font-sans text-sm">Avisos</h3>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">Mural do treinador</p>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>
    </div>

  );
}
