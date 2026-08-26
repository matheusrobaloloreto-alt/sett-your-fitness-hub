import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Dumbbell, AlertTriangle, CheckCircle, Clock, Pencil, Plus } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { useStaffPermission } from "@/hooks/useStaffPermission";

interface Enrollment {
  id: string;
  student_id: string;
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
  prescribed_offline_at?: string | null;
}

export default function TrainerDashboard() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [cycles, setCycles] = useState<Record<string, Cycle[]>>({});
  const [cycleWorkoutMap, setCycleWorkoutMap] = useState<Record<string, boolean>>({});
  const { user, role, companyId } = useAuth();
  const { enabled: canViewCompanyDashboard, loading: permissionLoading, reload: reloadPermission } = useStaffPermission("company_dashboard_full");
  const { toast } = useToast();
  const navigate = useNavigate();

  const getBasePath = () => {
    if (role === "admin") return "/admin";
    if (role === "coordinator") return "/coordinator";
    if (role === "master") return "/master";
    return "/trainer";
  };

  const loadData = useCallback(async () => {
    if (!user || !companyId) {
      setEnrollments([]);
      setCycles({});
      setCycleWorkoutMap({});
      return;
    }
    let enrollQuery = supabase
      .from("enrollments")
      .select("id, student_id, start_date, end_date, status, students(full_name), plans(name, duration_weeks)")
      .eq("company_id", companyId)
      .eq("status", "active");
    if (!canViewCompanyDashboard) enrollQuery = enrollQuery.eq("trainer_id", user.id);
    const { data: enroll } = await enrollQuery;

    const enrollData = (enroll as Enrollment[]) || [];
    setEnrollments(enrollData);

    if (enrollData.length > 0) {
      const ids = enrollData.map((e) => e.id);
      const { data: cycleData } = await supabase
        .from("training_cycles").select("id, enrollment_id, cycle_number, start_date, end_date, status, prescribed_offline_at")
        .eq("company_id", companyId)
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
          .select("cycle_id, exercises")
          .eq("company_id", companyId)
          .in("cycle_id", allCycleIds);
        const map: Record<string, boolean> = {};
        filterMaterializedWorkouts(workouts || []).forEach(w => { map[w.cycle_id] = true; });
        (cycleData as Cycle[] || []).forEach((cycle) => {
          if (cycle.prescribed_offline_at) map[cycle.id] = true;
        });
        setCycleWorkoutMap(map);
      }
    } else {
      setCycles({});
      setCycleWorkoutMap({});
    }
  }, [canViewCompanyDashboard, companyId, user]);

  useEffect(() => { if (user && !permissionLoading) void loadData(); }, [user, permissionLoading, loadData]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user) void reloadPermission();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user, reloadPermission]);

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
    <>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-4xl text-primary">{canViewCompanyDashboard ? "PAINEL DA EMPRESA" : "MEUS ALUNOS"}</h1>
            <BnitoContextButton
              label="dashboard do professor"
              context={`Painel do professor com ${enrollments.length} matriculas ${canViewCompanyDashboard ? "da empresa" : "atribuidas"} e ciclos de treino.`}
              question="Como devo priorizar meus alunos e ciclos de treino hoje?"
            />
          </div>
          <p className="text-muted-foreground font-sans">
            {canViewCompanyDashboard
              ? "Visão completa concedida individualmente pela empresa"
              : "Gerencie os treinos dos seus alunos"}
          </p>
        </div>

        <DashboardAlerts trainerId={canViewCompanyDashboard ? undefined : user?.id} />

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
                        <CardTitle className="flex items-center gap-2 text-primary text-xl">
                          <button
                            type="button"
                            className="truncate text-left hover:underline"
                            title="Abrir perfil do aluno"
                            onClick={() => navigate(`${getBasePath()}/students/${enrollment.student_id}`)}
                          >
                            {enrollment.students?.full_name}
                          </button>
                          <BnitoContextButton
                            label={`aluno ${enrollment.students?.full_name || ""}`}
                            context={`Aluno no painel do professor. Plano: ${enrollment.plans?.name || "sem plano"}. Dias restantes: ${daysLeft}. Ciclos: ${enrollCycles.length}.`}
                            question="Qual ciclo ou ajuste tecnico devo priorizar para este aluno?"
                          />
                        </CardTitle>
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
    </>
  );
}
