import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, RefreshCw, ClipboardList, CheckCircle, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { useToast } from "@/hooks/use-toast";

interface AgendaEvent {
  id: string;
  date: string;
  type: "contract_renewal" | "prescription_pending" | "prescription_done" | "goal";
  label: string;
  studentName: string;
  studentId?: string;
  cycleId?: string;
  trainerName?: string;
  meta?: string;
}

const typeConfig = {
  goal: { icon: Flag, label: "Prova/Meta", color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  contract_renewal: { icon: RefreshCw, label: "Renovação", color: "bg-red-500/15 text-red-600 border-red-500/30" },
  prescription_pending: { icon: ClipboardList, label: "Prescrever", color: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" },
  prescription_done: { icon: CheckCircle, label: "Entregue", color: "bg-green-500/15 text-green-600 border-green-500/30" },
};

const dotColors: Record<string, string> = {
  goal: "bg-amber-500",
  contract_renewal: "bg-red-500",
  prescription_pending: "bg-yellow-500",
  prescription_done: "bg-green-500",
};

export default function AdminAgenda() {
  const navigate = useNavigate();
  const { role, companyId, session } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const { toast } = useToast();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const rolePrefix = role === "coordinator" ? "/coordinator" : role === "trainer" ? "/trainer" : "/admin";
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingCycleId, setMarkingCycleId] = useState<string | null>(null);

  useEffect(() => { loadEvents(); }, [currentMonth, effectiveCompanyId]);

  const loadEvents = async () => {
    setLoading(true);
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    const collected: AgendaEvent[] = [];

    // Contract renewals (enrollment end dates)
    let enrollQuery = supabase
      .from("enrollments")
      .select("id, end_date, status, student_id, students(full_name), plans(name)")
      .eq("status", "active")
      .gte("end_date", monthStart)
      .lte("end_date", monthEnd);
    if (effectiveCompanyId) enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);
    const { data: enrollments } = await enrollQuery;

    (enrollments || []).forEach((e: any) => {
      collected.push({
        id: `enr-${e.id}`,
        date: e.end_date,
        type: "contract_renewal",
        label: e.plans?.name || "Plano",
        studentName: e.students?.full_name || "—",
        studentId: e.student_id,
      });
    });

    // Training cycles — filter by start_date in month, include completed status
    let cyclesQuery = supabase
      .from("training_cycles")
      .select("id, start_date, end_date, cycle_number, enrollment_id, status, prescribed_offline_at, enrollments(student_id, students(full_name, assigned_trainer_id))")
      .in("status", ["active", "pending", "completed"])
      .gte("start_date", monthStart)
      .lte("start_date", monthEnd);
    if (effectiveCompanyId) cyclesQuery = cyclesQuery.eq("company_id", effectiveCompanyId);
    const { data: cycles } = await cyclesQuery;

    if (cycles && cycles.length > 0) {
      const cycleIds = cycles.map((c: any) => c.id);
      const { data: workouts } = await supabase
        .from("workouts")
        .select("cycle_id, exercises")
        .in("cycle_id", cycleIds);

      const cyclesWithWorkout = new Set(filterMaterializedWorkouts(workouts || []).map((w) => w.cycle_id));

      // Collect unique assigned_trainer_ids from students to fetch names
      const trainerIds = [...new Set(cycles.map((c: any) => (c as any).enrollments?.students?.assigned_trainer_id).filter(Boolean))];
      const trainerMap: Record<string, string> = {};
      if (trainerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", trainerIds);
        (profiles || []).forEach((p: any) => {
          trainerMap[p.user_id] = p.full_name || "";
        });
      }

      cycles.forEach((c: any) => {
        const hasWorkout = cyclesWithWorkout.has(c.id) || Boolean(c.prescribed_offline_at);
        const trainerId = (c as any).enrollments?.students?.assigned_trainer_id;
        collected.push({
          id: `cyc-${c.id}`,
          date: c.start_date,
          type: hasWorkout ? "prescription_done" : "prescription_pending",
          label: `Ciclo ${c.cycle_number}`,
          studentName: (c as any).enrollments?.students?.full_name || "—",
          studentId: (c as any).enrollments?.student_id,
          cycleId: c.id,
          trainerName: trainerId ? trainerMap[trainerId] : undefined,
        });
      });
    }

    // Provas / metas alvo do aluno (target_date no mês)
    let goalsQuery = (supabase as any)
      .from("student_goals")
      .select("id, target_date, title, kind, metric, student_id, students(full_name)")
      .gte("target_date", monthStart)
      .lte("target_date", monthEnd);
    if (effectiveCompanyId) goalsQuery = goalsQuery.eq("company_id", effectiveCompanyId);
    const { data: goals } = await goalsQuery;
    (goals || []).forEach((g: any) => {
      collected.push({
        id: `goal-${g.id}`,
        date: g.target_date,
        type: "goal",
        label: `${g.kind === "meta" ? "Meta" : "Prova"}: ${g.title}${g.metric ? ` (${g.metric})` : ""}`,
        studentName: g.students?.full_name || "—",
        studentId: g.student_id,
      });
    });

    setEvents(collected);
    setLoading(false);
  };

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();
  const getEventsForDay = (day: Date) => events.filter((e) => isSameDay(new Date(e.date + "T12:00:00"), day));
  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  // Sort: renewals first, then overdue, pending, done
  const typePriority: Record<string, number> = { goal: 0, contract_renewal: 1, prescription_pending: 2, prescription_done: 3 };
  const sortedEvents = [...events].sort((a, b) => {
    const pa = typePriority[a.type] ?? 9;
    const pb = typePriority[b.type] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.date.localeCompare(b.date);
  });

  const handleEventClick = (ev: AgendaEvent) => {
    if (ev.studentId) navigate(`${rolePrefix}/students/${ev.studentId}`);
  };

  const markCycleAsDone = async (ev: AgendaEvent) => {
    if (!ev.cycleId || ev.type !== "prescription_pending") return;
    if (!session?.user?.id) {
      toast({ title: "Sessão expirada", description: "Entre novamente para marcar o ciclo.", variant: "destructive" });
      return;
    }

    setMarkingCycleId(ev.cycleId);
    const { error } = await (supabase as any)
      .from("training_cycles")
      .update({
        prescribed_offline_at: new Date().toISOString(),
        prescribed_offline_by: session.user.id,
      })
      .eq("id", ev.cycleId);
    setMarkingCycleId(null);

    if (error) {
      toast({ title: "Erro ao marcar como feito", description: error.message, variant: "destructive" });
      return;
    }

    setEvents((prev) => prev.map((item) => (
      item.id === ev.id ? { ...item, type: "prescription_done" } : item
    )));
    toast({ title: "Treino marcado como feito", description: `${ev.studentName} saiu da fila de prescrição.` });
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-4xl text-primary">AGENDA</h1>
            <BnitoContextButton
              label="agenda operacional"
              context="Agenda consolidada com renovacoes, ciclos para prescrever e ciclos entregues."
              question="Como devo priorizar os eventos da agenda deste mes?"
            />
          </div>
          <p className="text-muted-foreground font-sans">Visão consolidada de datas importantes de todos os alunos</p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {Object.entries(typeConfig).map(([key, cfg]) => (
            <div key={key} className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full border text-[10px] sm:text-xs font-sans font-medium ${cfg.color}`}>
              <cfg.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {cfg.label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <CardTitle className="text-primary text-lg sm:text-xl capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="grid grid-cols-7 mb-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                  <div key={d} className="text-center text-[10px] sm:text-xs text-muted-foreground font-sans font-medium py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
                {days.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isPast = isBefore(day, new Date()) && !isToday(day);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                      className={`relative p-0.5 sm:p-1 min-h-[44px] sm:min-h-[60px] rounded-lg border text-left transition-all font-sans text-sm ${
                        isSelected ? "border-primary bg-primary/10 ring-1 ring-primary" :
                        isToday(day) ? "border-primary/50 bg-primary/5" :
                        "border-transparent hover:border-border hover:bg-muted/30"
                      } ${isPast ? "opacity-50" : ""}`}
                    >
                      <span className={`text-[10px] sm:text-xs font-medium ${isToday(day) ? "text-primary" : "text-foreground"}`}>
                        {format(day, "d")}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <div key={ev.id} className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${dotColors[ev.type]}`} />
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : "Próximos Eventos"}
                <BnitoContextButton
                  label="eventos da agenda"
                  context={`Agenda com ${events.length} eventos no mes e ${selectedEvents.length} eventos no dia selecionado.`}
                  question="Quais eventos exigem acao primeiro e por que?"
                  className="ml-auto"
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-auto">
                  {(selectedDate ? selectedEvents : sortedEvents).length === 0 ? (
                    <p className="text-muted-foreground font-sans text-center py-8 text-sm">
                      {selectedDate ? "Nenhum evento neste dia" : "Nenhum evento neste mês"}
                    </p>
                  ) : (
                    (selectedDate ? selectedEvents : sortedEvents).map((ev) => {
                      const cfg = typeConfig[ev.type];
                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className={`flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border transition-colors ${
                            ev.studentId ? "cursor-pointer hover:bg-secondary/80 hover:border-primary/30" : ""
                          }`}
                        >
                          <div className={`p-1.5 rounded-md ${cfg.color}`}>
                            <cfg.icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground font-sans truncate">{ev.studentName}</p>
                            <p className="text-xs text-muted-foreground font-sans">{ev.label}</p>
                            {ev.trainerName && (
                              <p className="text-[11px] text-muted-foreground/70 font-sans">Treinador: {ev.trainerName}</p>
                            )}
                            {!selectedDate && (
                              <p className="text-[11px] text-muted-foreground/70 font-sans mt-0.5">
                                {format(new Date(ev.date + "T12:00:00"), "dd/MM")}
                              </p>
                            )}
                          </div>
                          {ev.type === "prescription_pending" && ev.cycleId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 rounded-full border-green-500/35 bg-green-500/10 px-3 text-xs font-semibold text-green-700 hover:bg-green-500/20"
                              disabled={markingCycleId === ev.cycleId}
                              onClick={(event) => {
                                event.stopPropagation();
                                void markCycleAsDone(ev);
                              }}
                            >
                              <CheckCircle className="mr-1 h-3.5 w-3.5" />
                              {markingCycleId === ev.cycleId ? "..." : "Feito"}
                            </Button>
                          )}
                          {ev.meta && <Badge variant="outline" className="text-[10px] shrink-0">{ev.meta}</Badge>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
