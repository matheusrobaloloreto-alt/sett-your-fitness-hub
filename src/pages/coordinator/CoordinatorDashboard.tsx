import { useEffect, useState, useRef, useCallback } from "react";
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
import { addDays, format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";

import { useMaster } from "@/contexts/MasterContext";

interface Student {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string;
  assigned_trainer_id?: string | null;
}

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
  duration_days?: number | null;
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
  const { user, companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const companyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId;
  const actorId = user?.id ?? null;
  const operationScope = useRef({ companyId, actorId, role, mounted: false });
  if (operationScope.current.companyId !== companyId || operationScope.current.actorId !== actorId || operationScope.current.role !== role) {
    operationScope.current.mounted = false;
    operationScope.current = { companyId, actorId, role, mounted: false };
  }
  // A new object also invalidates A -> B -> A operations from the first A epoch.
  const scope = operationScope.current;
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const loadData = useCallback(async () => {
    if (operationScope.current !== scope || !scope.mounted) return;
    const request = ++generation.current;
    const current = () => operationScope.current === scope && scope.mounted && request === generation.current;
    setLoadError("");
    if (!companyId || !actorId) { setLoading(false); return; }
    setLoading(true);
    try {
      const results = await Promise.all([
        supabase.from("students").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("plans").select("id, name, duration_weeks, duration_days").eq("company_id", companyId).eq("is_active", true),
        supabase.rpc("get_company_student_staff_directory" as never, { _company_id: companyId } as never),
      ]);
      if (!current()) return;
      if (results.some(result => result.error)) throw new Error();
      setStudents((results[0].data || []) as Student[]);
      setPlans((results[1].data || []) as Plan[]);
      setTrainers(((results[2].data || []) as unknown as (Trainer & { roles: string[] })[]).filter(member => member.roles.includes("trainer")));
    } catch {
      if (current()) setLoadError("Não foi possível carregar as matrículas. Tente novamente.");
    } finally { if (current()) setLoading(false); }
  }, [companyId, actorId, scope]);

  useEffect(() => {
    scope.mounted = true;
    setStudents([]); setPlans([]); setTrainers([]); setSelectedStudent(null); setEnrollOpen(false); setOpen(false);
    void loadData();
    const counter = generation;
    return () => { scope.mounted = false; counter.current++; };
  }, [loadData, scope]);

  const handleAddStudent = async () => {
    const current = () => operationScope.current === scope && scope.mounted;
    if (!current() || !actorId || !form.full_name || !companyId || loading || loadError) return;
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/\D/g, "");
    const duplicate = students.find((student) => {
      const studentEmail = (student.email || "").trim().toLowerCase();
      const studentPhone = (student.whatsapp || student.phone || "").replace(/\D/g, "");
      return (email && studentEmail === email) || (!email && phone && studentPhone === phone);
    });
    if (duplicate) {
      toast({
        title: "Aluno já cadastrado",
        description: `${duplicate.full_name} já existe na empresa. Abra o perfil existente para seguir.`,
        variant: "destructive",
      });
      return;
    }
    try {
      const { error } = await supabase.from("students").insert({
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        status: "pending",
        company_id: companyId,
      });
      if (!current()) return;
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Aluno cadastrado!" });
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "" });
      void loadData();
    } catch {
      if (current()) toast({ title: "Erro", description: "Não foi possível confirmar o cadastro. Recarregue antes de tentar novamente.", variant: "destructive" });
    }
  };

  const handleEnroll = async () => {
    const current = () => operationScope.current === scope && scope.mounted;
    if (!current() || !actorId || !selectedStudent || !enrollForm.plan_id || loading || loadError) return;

    const plan = plans.find((p) => p.id === enrollForm.plan_id);
    if (!plan) return;

    if (!companyId) {
      toast({ title: "Empresa não identificada", description: "Recarregue a página antes de liberar a matrícula.", variant: "destructive" });
      return;
    }

    try {
      const { data: replacementRows, error } = await supabase.rpc("replace_student_enrollment", {
        _student_id: selectedStudent.id,
        _company_id: companyId,
        _plan_id: enrollForm.plan_id,
        _trainer_id: selectedStudent.assigned_trainer_id ?? null,
        _start_date: enrollForm.start_date,
        _clear_carried_over_cycle: false,
      });
      if (!current()) return;

      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      const enrollmentId = Array.isArray(replacementRows) ? replacementRows[0]?.enrollment_id : (replacementRows as any)?.enrollment_id;
      if (!enrollmentId) {
        toast({ title: "Matrícula criada sem confirmação local", description: "O servidor não retornou a matrícula criada. Recarregue o aluno antes de prescrever.", variant: "destructive" });
        return;
      }

      toast({ title: "Aluno matriculado e liberado!" });
      setEnrollOpen(false);
      setSelectedStudent(null);
      setEnrollForm({ plan_id: "", start_date: format(new Date(), "yyyy-MM-dd") });
      void loadData();
    } catch {
      if (current()) toast({ title: "Erro", description: "Não foi possível confirmar a matrícula. Recarregue antes de tentar novamente.", variant: "destructive" });
    }
  };

  const selectedPlan = plans.find((p) => p.id === enrollForm.plan_id);
  const calculatedEndDate = selectedPlan
    ? format(addDays(parseISO(enrollForm.start_date), Math.max(1, Number(selectedPlan.duration_days) || selectedPlan.duration_weeks * 7) - 1), "dd/MM/yyyy")
    : null;
  const calculatedCycles = selectedPlan
    ? Math.ceil(Math.max(1, Number(selectedPlan.duration_days) || selectedPlan.duration_weeks * 7) / 42)
    : null;

  const pendingStudents = students.filter((s) => s.status === "pending");
  const activeStudents = students.filter((s) => s.status === "active");

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendente", variant: "outline" },
    triaging: { label: "Em triagem", variant: "secondary" },
    active: { label: "Ativo", variant: "default" },
    inactive: { label: "Inativo", variant: "destructive" },
  };

  return <AdminDashboard routePrefixOverride="coordinator" includeCoordinatorPanels operationalExtras={(
      <section className="space-y-6">
        {!companyId ? <p>Selecione uma empresa para consultar as matrículas.</p> : loading ? <p role="status">Carregando matrículas...</p> : loadError ? <div role="alert">{loadError}<Button onClick={loadData}>Tentar novamente</Button></div> : students.length === 0 ? <p>Nenhum aluno nesta empresa.</p> : null}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-4xl text-primary">MATRÍCULAS</h1>
              <BnitoContextButton
                label="dashboard de matriculas"
                context={`Fila de matriculas com ${pendingStudents.length} pendentes, ${activeStudents.length} ativos e ${students.length} alunos totais.`}
                question="Como devo priorizar esta fila de matriculas e alunos?"
              />
            </div>
            <p className="text-muted-foreground font-sans">Fila de alunos e matrículas</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!companyId || loading || Boolean(loadError)}><Plus className="h-4 w-4 mr-2" />Novo Aluno</Button>
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
                <p className="text-2xl font-bold text-foreground font-sans">{companyId && !loading && !loadError ? pendingStudents.length : "—"}</p>
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
                <p className="text-2xl font-bold text-foreground font-sans">{companyId && !loading && !loadError ? activeStudents.length : "—"}</p>
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
                <p className="text-2xl font-bold text-foreground font-sans">{companyId && !loading && !loadError ? students.length : "—"}</p>
                <p className="text-sm text-muted-foreground font-sans">Total de alunos da empresa</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-xl">
              FILA DE ALUNOS
              <BnitoContextButton
                label="fila de alunos"
                context="Fila de alunos com status pendente, triagem, ativo ou inativo; usada para matricular e liberar."
                question="Qual criterio usar para tirar alunos da fila e liberar matricula?"
                className="ml-auto"
              />
            </CardTitle>
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
      </section>
  )} />;
}
