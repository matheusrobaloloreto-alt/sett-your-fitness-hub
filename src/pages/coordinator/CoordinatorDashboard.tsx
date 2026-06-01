import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Plus, UserCheck, Clock, Users } from "lucide-react";
import { addWeeks, format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { RenewalsAndCyclesPanel } from "@/components/dashboard/RenewalsAndCyclesPanel";

interface Student {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
}

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
}

interface Trainer {
  user_id: string;
  full_name: string | null;
}

export default function CoordinatorDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [open, setOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [enrollForm, setEnrollForm] = useState({ plan_id: "", start_date: format(new Date(), "yyyy-MM-dd") });
  const { toast } = useToast();
  const { user, companyId } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: studentsData } = await supabase.from("students").select("*").order("created_at", { ascending: false });
    setStudents((studentsData as Student[]) || []);

    const { data: plansData } = await supabase.from("plans").select("*").eq("is_active", true);
    setPlans((plansData as Plan[]) || []);

    // Load trainers (profiles with trainer role)
    const { data: trainerRoles } = await supabase.from("user_roles").select("user_id").eq("role", "trainer");
    if (trainerRoles && trainerRoles.length > 0) {
      const trainerIds = trainerRoles.map((r) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", trainerIds);
      setTrainers((profiles as Trainer[]) || []);
    }
  };

  const handleAddStudent = async () => {
    if (!form.full_name) return;
    const { error } = await supabase.from("students").insert({
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      status: "pending",
      company_id: companyId,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Aluno cadastrado!" });
    setOpen(false);
    setForm({ full_name: "", email: "", phone: "" });
    loadData();
  };

  const handleEnroll = async () => {
    if (!selectedStudent || !enrollForm.plan_id) return;

    const plan = plans.find((p) => p.id === enrollForm.plan_id);
    if (!plan) return;

    const startDate = new Date(enrollForm.start_date);
    const endDate = addWeeks(startDate, plan.duration_weeks);

    const { error } = await supabase.from("enrollments").insert({
      student_id: selectedStudent.id,
      plan_id: enrollForm.plan_id,
      trainer_id: null,
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(endDate, "yyyy-MM-dd"),
      company_id: companyId,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // Update student status
    await supabase.from("students").update({ status: "active" }).eq("id", selectedStudent.id);

    toast({ title: "Aluno matriculado e liberado!" });
    setEnrollOpen(false);
    setSelectedStudent(null);
    setEnrollForm({ plan_id: "", start_date: format(new Date(), "yyyy-MM-dd") });
    loadData();
  };

  const selectedPlan = plans.find((p) => p.id === enrollForm.plan_id);
  const calculatedEndDate = selectedPlan
    ? format(addWeeks(new Date(enrollForm.start_date), selectedPlan.duration_weeks), "dd/MM/yyyy")
    : null;
  const calculatedCycles = selectedPlan
    ? Math.ceil((selectedPlan.duration_weeks * 7) / 42)
    : null;

  const pendingStudents = students.filter((s) => s.status === "pending");
  const activeStudents = students.filter((s) => s.status === "active");

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendente", variant: "outline" },
    triaging: { label: "Em triagem", variant: "secondary" },
    active: { label: "Ativo", variant: "default" },
    inactive: { label: "Inativo", variant: "destructive" },
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl text-primary">MATRÍCULAS</h1>
            <p className="text-muted-foreground font-sans">Fila de alunos e matrículas</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Aluno</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-primary">CADASTRAR ALUNO</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-sans">Nome completo</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Email</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-secondary border-border" />
                </div>
                <Button onClick={handleAddStudent} className="w-full">Cadastrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-warning/10">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{pendingStudents.length}</p>
                <p className="text-sm text-muted-foreground font-sans">Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-success/10">
                <UserCheck className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{activeStudents.length}</p>
                <p className="text-sm text-muted-foreground font-sans">Ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{students.length}</p>
                <p className="text-sm text-muted-foreground font-sans">Total</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        <DashboardAlerts />

        {/* Renovação e Troca de Treino */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RenewalsAndCyclesPanel effectiveCompanyId={companyId} routePrefix="coordinator" renewalsOnly />
          <RenewalsAndCyclesPanel effectiveCompanyId={companyId} routePrefix="coordinator" cyclesOnly />
        </div>

        {/* Student List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-xl">FILA DE ALUNOS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {students.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border">
                  <div>
                    <p className="text-foreground font-sans font-medium">{student.full_name}</p>
                    <p className="text-muted-foreground text-xs font-sans">{student.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusMap[student.status]?.variant || "outline"}>
                      {statusMap[student.status]?.label || student.status}
                    </Badge>
                    {student.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedStudent(student);
                          setEnrollOpen(true);
                        }}
                      >
                        Matricular
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {students.length === 0 && (
                <p className="text-muted-foreground font-sans text-center py-8">Nenhum aluno na fila</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Enrollment Dialog */}
        <Dialog open={enrollOpen} onOpenChange={(o) => { setEnrollOpen(o); if (!o) setSelectedStudent(null); }}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-primary">MATRICULAR: {selectedStudent?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-sans">Plano *</Label>
                <Select value={enrollForm.plan_id} onValueChange={(v) => setEnrollForm({ ...enrollForm, plan_id: v })}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} — {plan.duration_weeks} semanas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlan && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                  <p className="text-sm font-sans text-foreground">📅 Expiração: <strong>{calculatedEndDate}</strong></p>
                  <p className="text-sm font-sans text-foreground">🔄 Ciclos de 42 dias: <strong>{calculatedCycles}</strong></p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="font-sans">Data de início</Label>
                <Input
                  type="date"
                  value={enrollForm.start_date}
                  onChange={(e) => setEnrollForm({ ...enrollForm, start_date: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>

              <Button
                onClick={handleEnroll}
                className="w-full"
                disabled={!enrollForm.plan_id}
              >
                Liberar para o Treinador
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
