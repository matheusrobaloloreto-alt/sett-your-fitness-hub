import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Search, Dumbbell, ChevronRight, Calendar, Plus, Edit, Clock, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkoutSummary {
  id: string;
  title: string;
  exerciseCount: number;
}

interface CycleSummary {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  workouts: WorkoutSummary[];
}

interface StudentWithCycles {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
  plan_name: string | null;
  enrollment_id: string | null;
  cycles: CycleSummary[];
}

export default function WorkoutPrescriptions() {
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const navigate = useNavigate();
  const effectiveCompanyId = (role === "master" && isViewingCompany) ? viewingCompany?.id : companyId;

  const [students, setStudents] = useState<StudentWithCycles[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithCycles | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const prefix = (role === "master" && isViewingCompany) ? "/admin" : `/${role}`;

  useEffect(() => {
    if (effectiveCompanyId) loadStudents();
  }, [effectiveCompanyId]);

  const loadStudents = async () => {
    setLoading(true);

    // Get students with active enrollments
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name, email, status")
      .eq("company_id", effectiveCompanyId!)
      .order("full_name");

    if (!studentsData || studentsData.length === 0) {
      setStudents([]);
      setLoading(false);
      return;
    }

    // Get active enrollments for these students
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, student_id, plan_id, plans(name)")
      .eq("company_id", effectiveCompanyId!)
      .eq("status", "active");

    // Get all training cycles
    const enrollmentIds = enrollments?.map(e => e.id) || [];
    let cyclesData: any[] = [];
    if (enrollmentIds.length > 0) {
      const { data } = await supabase
        .from("training_cycles")
        .select("id, enrollment_id, cycle_number, start_date, end_date, status")
        .in("enrollment_id", enrollmentIds)
        .order("cycle_number");
      cyclesData = data || [];
    }

    // Get all workouts for these cycles
    const cycleIds = cyclesData.map(c => c.id);
    let workoutsData: any[] = [];
    if (cycleIds.length > 0) {
      const { data } = await supabase
        .from("workouts")
        .select("id, title, exercises, cycle_id")
        .in("cycle_id", cycleIds);
      workoutsData = data || [];
    }

    // Map everything together
    const result: StudentWithCycles[] = studentsData.map(s => {
      const enrollment = enrollments?.find(e => e.student_id === s.id);
      const studentCycles = cyclesData
        .filter(c => c.enrollment_id === enrollment?.id)
        .map(c => {
          const cycleWorkouts = workoutsData
            .filter(w => w.cycle_id === c.id)
            .map(w => ({
              id: w.id,
              title: w.title,
              exerciseCount: Array.isArray(w.exercises) ? w.exercises.length : 0,
            }));
          return {
            id: c.id,
            cycle_number: c.cycle_number,
            start_date: c.start_date,
            end_date: c.end_date,
            status: c.status,
            workouts: cycleWorkouts,
          };
        });

      return {
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        status: s.status,
        plan_name: (enrollment?.plans as any)?.name || null,
        enrollment_id: enrollment?.id || null,
        cycles: studentCycles,
      };
    });

    // Only show students with active enrollments
    const withEnrollments = result.filter(s => s.enrollment_id);
    setStudents(withEnrollments);
    setLoading(false);
  };

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalWorkouts = (s: StudentWithCycles) =>
    s.cycles.reduce((sum, c) => sum + c.workouts.length, 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Dumbbell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl text-primary font-bold tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            PRESCRIÇÃO DE TREINOS
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student list */}
          <div className="lg:col-span-1 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[calc(100vh-240px)]">
              <div className="space-y-2 pr-2">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground font-sans">
                      {search ? "Nenhum aluno encontrado" : "Nenhum aluno com matrícula ativa"}
                    </p>
                  </div>
                ) : (
                  filtered.map(student => (
                    <Card
                      key={student.id}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${
                        selectedStudent?.id === student.id ? "border-primary bg-primary/5" : "bg-card border-border"
                      }`}
                      onClick={() => setSelectedStudent(student)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-sans font-medium text-foreground text-sm truncate">{student.full_name}</p>
                            <p className="text-xs text-muted-foreground font-sans truncate">
                              {student.plan_name || "Sem plano"} · {totalWorkouts(student)} treino(s)
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Student detail */}
          <div className="lg:col-span-2">
            {selectedStudent ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-sans font-semibold text-foreground">{selectedStudent.full_name}</h2>
                    <p className="text-sm text-muted-foreground font-sans">{selectedStudent.plan_name}</p>
                  </div>
                </div>

                {selectedStudent.cycles.length === 0 ? (
                  <Card className="bg-card border-border border-dashed">
                    <CardContent className="p-8 text-center">
                      <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground font-sans">Nenhum ciclo de treino criado.</p>
                      <p className="text-xs text-muted-foreground/60 font-sans mt-1">
                        Defina a data de início do treino na matrícula do aluno.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {selectedStudent.cycles.map(cycle => (
                      <Card key={cycle.id} className="bg-card border-border">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="text-primary font-bold text-sm" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                                CICLO {cycle.cycle_number}
                              </h3>
                              <Badge
                                variant={cycle.status === "active" ? "default" : "outline"}
                                className="text-[10px]"
                              >
                                {cycle.status === "active" ? "Ativo" : cycle.status === "completed" ? "Concluído" : "Futuro"}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground font-sans">
                              {format(parseISO(cycle.start_date), "dd/MM", { locale: ptBR })} — {format(parseISO(cycle.end_date), "dd/MM", { locale: ptBR })}
                            </span>
                          </div>

                          {cycle.workouts.length > 0 ? (
                            <div className="space-y-2">
                              {cycle.workouts.map((w, i) => (
                                <div key={w.id} className="flex items-center justify-between bg-secondary/30 rounded-md px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-sans text-foreground">{w.title}</span>
                                    <Badge variant="outline" className="text-[10px]">{w.exerciseCount} ex.</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm font-sans">Nenhum treino prescrito</span>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={cycle.workouts.length > 0 ? "outline" : "default"}
                              onClick={() => navigate(`${prefix}/workout/${cycle.id}`)}
                            >
                              {cycle.workouts.length > 0 ? (
                                <><Edit className="h-3.5 w-3.5 mr-1" />Editar Treinos</>
                              ) : (
                                <><Plus className="h-3.5 w-3.5 mr-1" />Prescrever Treino</>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground font-sans">Selecione um aluno para ver seus treinos</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
