import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Dumbbell, AlertTriangle, CheckCircle, Clock, Pencil, Plus } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { DashboardAlerts } from "@/components/DashboardAlerts";

interface Enrollment {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  students: { full_name: string } | null;
  plans: { name: string; duration_weeks: number } | null;
}

interface Cycle {
  id: string;
  enrollment_id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
}

export default function TrainerDashboard() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [cycles, setCycles] = useState<Record<string, Cycle[]>>({});
  const [cycleWorkoutMap, setCycleWorkoutMap] = useState<Record<string, boolean>>({});
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const getBasePath = () => {
    if (role === "admin") return "/admin";
    if (role === "coordinator") return "/coordinator";
    if (role === "master") return "/master";
    return "/trainer";
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user) loadData();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user]);

  const loadData = async () => {
    await supabase.rpc("advance_training_cycles");
    const { data: enroll } = await supabase
      .from("enrollments")
      .select("*, students(full_name), plans(name, duration_weeks)")
      .eq("trainer_id", user!.id)
      .eq("status", "active");

    const enrollData = (enroll as Enrollment[]) || [];
    setEnrollments(enrollData);

    if (enrollData.length > 0) {
      const ids = enrollData.map((e) => e.id);
      const { data: cycleData } = await supabase
        .from("training_cycles").select("*")
        .in("enrollment_id", ids)
        .order("end_date", { ascending: true });

      const grouped: Record<string, Cycle[]> = {};
      const allCycleIds: string[] = [];
      (cycleData as Cycle[] || []).forEach((c) => {
        if (!grouped[c.enrollment_id]) grouped[c.enrollment_id] = [];
        grouped[c.enrollment_id].push(c);
        allCycleIds.push(c.id);
      });
      setCycles(grouped);

      // Check which cycles have workouts
      if (allCycleIds.length > 0) {
        const { data: workouts } = await supabase
          .from("workouts")
          .select("cycle_id")
          .in("cycle_id", allCycleIds);
        const map: Record<string, boolean> = {};
        (workouts || []).forEach(w => { map[w.cycle_id] = true; });
        setCycleWorkoutMap(map);
      }
    }
  };

  const getCycleIcon = (status: string, endDate: string) => {
    if (status === "completed") return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === "active") {
      const daysLeft = differenceInDays(new Date(endDate), new Date());
      if (daysLeft <= 7) return <AlertTriangle className="h-4 w-4 text-warning" />;
      return <Dumbbell className="h-4 w-4 text-primary" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const navigateToWorkout = (cycleId: string) => {
    const basePath = getBasePath();
    navigate(`${basePath}/workout/${cycleId}?returnTo=${basePath}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl text-primary">MEUS ALUNOS</h1>
          <p className="text-muted-foreground font-sans">Gerencie os treinos dos seus alunos</p>
        </div>

        <DashboardAlerts trainerId={user?.id} />

        {enrollments.length === 0 ? (
          <p className="text-muted-foreground font-sans text-center py-12">Nenhum aluno atribuído ainda</p>
        ) : (
          <div className="space-y-4">
            {enrollments.map((enrollment) => {
              const enrollCycles = cycles[enrollment.id] || [];
              const daysLeft = differenceInDays(new Date(enrollment.end_date), new Date());

              return (
                <Card key={enrollment.id} className="bg-card border-border">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-primary text-xl">{enrollment.students?.full_name}</CardTitle>
                        <p className="text-muted-foreground text-sm font-sans">
                          {enrollment.plans?.name} · {format(new Date(enrollment.start_date), "dd/MM/yyyy")} → {format(new Date(enrollment.end_date), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <Badge variant={daysLeft <= 7 ? "destructive" : daysLeft <= 30 ? "outline" : "default"}>
                        {daysLeft > 0 ? `${daysLeft}d restantes` : "Expirado"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground font-sans mb-3 uppercase tracking-wider">Ciclos de treino</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {enrollCycles.map((cycle) => {
                        const isActive = cycle.status === "active";
                        const hasWorkout = cycleWorkoutMap[cycle.id];
                        return (
                          <div key={cycle.id} className={`p-3 rounded-lg border transition-colors ${
                            isActive ? "border-primary/50 bg-primary/5"
                              : cycle.status === "completed" ? "border-success/30 bg-success/5"
                              : "border-border bg-secondary/30"
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-sans font-medium text-foreground flex items-center gap-1.5">
                                {getCycleIcon(cycle.status, cycle.end_date)}
                                Ciclo {cycle.cycle_number}
                              </span>
                              <div className="flex items-center gap-1">
                                {hasWorkout ? (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigateToWorkout(cycle.id)}>
                                    <Pencil className="h-3 w-3 mr-1" />Editar
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigateToWorkout(cycle.id)}>
                                    <Plus className="h-3 w-3 mr-1" />Prescrever
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground font-sans">
                              {format(new Date(cycle.start_date), "dd/MM")} — {format(new Date(cycle.end_date), "dd/MM")}
                            </p>
                            {hasWorkout && (
                              <Badge variant="secondary" className="text-xs mt-1">Prescrito</Badge>
                            )}
                            {isActive && !hasWorkout && (
                              <Badge variant="destructive" className="text-xs mt-1">Sem treino</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
