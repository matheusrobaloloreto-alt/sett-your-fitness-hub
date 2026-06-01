import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, RefreshCw, Clock, UserX, Timer } from "lucide-react";
import { format, addDays } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { useMaster } from "@/contexts/MasterContext";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const LazyChart = lazy(() => import("recharts").then(mod => ({
  default: ({ data, colors }: { data: { name: string; count: number }[]; colors: string[] }) => (
    <mod.ResponsiveContainer width="100%" height={250}>
      <mod.BarChart data={data}>
        <mod.XAxis dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
        <mod.YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
        <mod.Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(0,0%,88%)" }} labelStyle={{ color: "hsl(220,70%,25%)" }} />
        <mod.Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <mod.Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </mod.Bar>
      </mod.BarChart>
    </mod.ResponsiveContainer>
  )
})));

interface DashboardData {
  stats: { totalStudents: number; pendingStudents: number; inactiveStudents: number; trainers: number };
  planChart: { name: string; count: number }[];
  expiringContracts: any[];
  cycleCountdowns: any[];
  trainerMap: Record<string, string>;
}

async function fetchDashboardData(effectiveCompanyId: string | null | undefined): Promise<DashboardData> {
  // Advance expired cycles before loading dashboard data
  await supabase.rpc("advance_training_cycles");
  const thirtyDaysFromNow = format(addDays(new Date(), 30), "yyyy-MM-dd");

  let studentQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "active");
  let pendingQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "pending");
  let inactiveQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "inactive");
  let enrollQuery = supabase.from("enrollments").select("plan_id, plans(name)");
  let expiringQuery = supabase.from("enrollments").select("*, trainer_id, students(full_name, status), plans(name)")
    .eq("status", "active").lte("end_date", thirtyDaysFromNow)
    .order("end_date", { ascending: true });

  if (effectiveCompanyId) {
    studentQuery = studentQuery.eq("company_id", effectiveCompanyId);
    pendingQuery = pendingQuery.eq("company_id", effectiveCompanyId);
    inactiveQuery = inactiveQuery.eq("company_id", effectiveCompanyId);
    enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);
    expiringQuery = expiringQuery.eq("company_id", effectiveCompanyId);
  }

  // Trainer count + cycle enrollments in parallel with the others
  let cycleEnrollQuery = supabase.from("enrollments")
    .select("id, student_id, training_start_date, trainer_id, students(full_name, assigned_trainer_id)")
    .in("status", ["active", "awaiting_training"]) as any;
  if (effectiveCompanyId) cycleEnrollQuery = cycleEnrollQuery.eq("company_id", effectiveCompanyId);

  const trainerCountPromise = (async () => {
    if (effectiveCompanyId) {
      const { data: members } = await supabase.from("company_members").select("user_id").eq("company_id", effectiveCompanyId);
      if (!members || members.length === 0) return 0;
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true })
        .eq("role", "trainer").in("user_id", members.map(m => m.user_id));
      return count || 0;
    }
    const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "trainer");
    return count || 0;
  })();

  const [studentRes, pendingRes, inactiveRes, enrollRes, expiringRes, activeEnrollsRes, trainerCount] = await Promise.all([
    studentQuery,
    pendingQuery,
    inactiveQuery,
    enrollQuery,
    expiringQuery,
    cycleEnrollQuery,
    trainerCountPromise,
  ]);

  const stats = {
    totalStudents: studentRes.count || 0,
    pendingStudents: pendingRes.count || 0,
    inactiveStudents: inactiveRes.count || 0,
    trainers: trainerCount,
  };

  const planCounts: Record<string, { name: string; count: number }> = {};
  (enrollRes.data || []).forEach((e: any) => {
    const name = e.plans?.name || "Sem plano";
    if (!planCounts[name]) planCounts[name] = { name, count: 0 };
    planCounts[name].count++;
  });
  const planChart = Object.values(planCounts).sort((a, b) => b.count - a.count);

  const expiringContracts = (expiringRes.data || []).filter((e: any) => {
    const s = e.students?.status;
    return s === "active" || s === "pending";
  });

  // Cycle countdowns
  const activeEnrolls = (activeEnrollsRes as any)?.data || [];
  const countdowns: any[] = [];
  const enrollsWithDate = activeEnrolls.filter((e: any) => e.training_start_date);
  if (enrollsWithDate.length > 0) {
    const enrollIds = enrollsWithDate.map((e: any) => e.id);
    const enrollInfoMap: Record<string, { name: string; trainer_id: string | null; student_id: string }> = {};
    enrollsWithDate.forEach((e: any) => {
      enrollInfoMap[e.id] = {
        name: e.students?.full_name || "—",
        trainer_id: e.students?.assigned_trainer_id || e.trainer_id,
        student_id: e.student_id,
      };
    });
    const { data: activeCycles } = await supabase.from("training_cycles").select("*").in("enrollment_id", enrollIds).eq("status", "active");
    (activeCycles || []).forEach((c: any) => {
      const info = enrollInfoMap[c.enrollment_id];
      const daysLeft = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      countdowns.push({
        student_name: info?.name || "—",
        student_id: info?.student_id,
        cycle_number: c.cycle_number,
        end_date: c.end_date,
        days_left: daysLeft,
        trainer_id: info?.trainer_id,
      });
    });
  }
  countdowns.sort((a, b) => a.days_left - b.days_left);

  // Resolve trainer names once
  const allTrainerIds = new Set<string>();
  expiringContracts.forEach((e: any) => { if (e.trainer_id) allTrainerIds.add(e.trainer_id); });
  countdowns.forEach((m: any) => { if (m.trainer_id) allTrainerIds.add(m.trainer_id); });
  let trainerMap: Record<string, string> = {};
  if (allTrainerIds.size > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(allTrainerIds));
    (profiles || []).forEach((p: any) => { trainerMap[p.user_id] = p.full_name || ""; });
  }

  return { stats, planChart, expiringContracts, cycleCountdowns: countdowns, trainerMap };
}

const chartColors = ["hsl(220, 70%, 25%)", "hsl(220, 60%, 35%)", "hsl(220, 50%, 45%)", "hsl(220, 40%, 55%)"];

export default function AdminDashboard() {
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const navigate = useNavigate();
  const routePrefix = role === "master" && isViewingCompany ? "admin" : role;
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const { data } = useQuery({
    queryKey: ["admin-dashboard", effectiveCompanyId ?? "all"],
    queryFn: () => fetchDashboardData(effectiveCompanyId),
    staleTime: 60_000,
  });

  const stats = data?.stats ?? { totalStudents: 0, pendingStudents: 0, inactiveStudents: 0, trainers: 0 };
  const planChart = data?.planChart ?? [];
  const expiringContracts = data?.expiringContracts ?? [];
  const cycleCountdowns = data?.cycleCountdowns ?? [];
  const trainerMap = data?.trainerMap ?? {};

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl text-primary">DASHBOARD</h1>
          <p className="text-muted-foreground font-sans">
            {isViewingCompany ? `Visualizando: ${viewingCompany?.name}` : "Visão geral da consultoria"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=active`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{stats.totalStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border cursor-pointer hover:border-warning/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=pending`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-warning/10"><Clock className="h-6 w-6 text-warning" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{stats.pendingStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border cursor-pointer hover:border-muted-foreground/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=inactive`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-muted"><UserX className="h-6 w-6 text-muted-foreground" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{stats.inactiveStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Inativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10"><TrendingUp className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{stats.trainers}</p>
                <p className="text-sm text-muted-foreground font-sans">Treinadores</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-primary text-xl">PLANOS MAIS VENDIDOS</CardTitle></CardHeader>
            <CardContent>
              {planChart.length > 0 ? (
                <Suspense fallback={<div className="h-[250px] flex items-center justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                  <LazyChart data={planChart} colors={chartColors} />
                </Suspense>
              ) : (
                <p className="text-muted-foreground font-sans text-center py-8">Nenhuma matrícula registrada</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />RENOVAÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expiringContracts.length > 0 ? (
                <div className="space-y-3 max-h-[250px] overflow-auto">
                  {expiringContracts.map((contract: any) => {
                    const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={contract.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:brightness-110 transition-all" onClick={() => navigate(`/${routePrefix}/students/${contract.student_id}`)}>
                        <div>
                          <p className="text-foreground font-sans font-medium text-sm">{contract.students?.full_name}</p>
                          <p className="text-muted-foreground text-xs font-sans">{contract.plans?.name}</p>
                          {contract.trainer_id && trainerMap[contract.trainer_id] && (
                            <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[contract.trainer_id]}</p>
                          )}
                        </div>
                        <span className={`text-xs font-sans font-medium px-2 py-1 rounded ${
                          daysLeft <= 7 ? "bg-destructive/20 text-destructive" :
                          daysLeft <= 15 ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"
                        }`}>
                          {daysLeft}d restantes
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground font-sans text-center py-8">Nenhuma renovação pendente</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-xl flex items-center gap-2">
              <Timer className="h-5 w-5" />TROCA DE TREINO
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cycleCountdowns.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-auto">
                {cycleCountdowns.map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:brightness-110 transition-all" onClick={() => m.student_id && navigate(`/${routePrefix}/students/${m.student_id}`)}>
                    <div>
                      <p className="text-foreground font-sans font-medium text-sm">{m.student_name}</p>
                      <p className="text-muted-foreground text-xs font-sans">Ciclo {m.cycle_number} · vence {format(new Date(m.end_date), "dd/MM")}</p>
                      {m.trainer_id && trainerMap[m.trainer_id] && (
                        <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[m.trainer_id]}</p>
                      )}
                    </div>
                    <span className={`text-xs font-sans font-medium px-2 py-1 rounded ${
                      m.days_left <= 0 ? "bg-destructive/20 text-destructive" :
                      m.days_left <= 7 ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"
                    }`}>
                      {m.days_left <= 0 ? "Vencido!" : `${m.days_left}d para troca`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground font-sans text-center py-8">Nenhum ciclo ativo no momento</p>
            )}
          </CardContent>
        </Card>

        <DashboardAlerts />
      </div>
    </AppLayout>
  );
}
