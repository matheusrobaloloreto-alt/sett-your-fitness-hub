import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, Search, Pencil, Trash2, Phone, Mail, Eye, Play, Copy, KeyRound, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMaster } from "@/contexts/MasterContext";
import { formatCPF, formatCEP, formatPhoneForCountry } from "@/lib/masks";
import { lookupCep, lookupCepByAddress } from "@/lib/cep";
import { format, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { StudentChatButton } from "@/components/admin/StudentChatButton";
import { preRegistrationUrl } from "@/lib/publicFlowLinks";
import { fiscalRegistrationValidation, isBrazilianCountry, normalizeCountryCode, normalizeFiscalDocument } from "@/lib/fiscalRegistration";

interface Student {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  birth_date: string | null;
  cpf: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  whatsapp: string | null;
  country_code: string | null;
  user_id: string | null;
  selected_plan_id: string | null;
  assigned_trainer_id: string | null;
  created_at: string;
  plan_name?: string;
}

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
}

interface Trainer {
  user_id: string;
  full_name: string;
}

const statusLabels: Record<string, string> = {
  interested: "Interessado",
  active: "Ativo",
  pending: "Pendente",
  inactive: "Inativo",
  awaiting_renewal: "Aguardando Renovação",
};
const statusColors: Record<string, string> = {
  interested: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  active: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
  awaiting_renewal: "bg-warning/15 text-warning border-warning/30",
};

const emptyForm = { full_name: "", email: "", phone: "", status: "interested", notes: "", birth_date: "", cpf: "", cep: "", address: "", address_number: "", neighborhood: "", city: "", state: "", whatsapp: "", country_code: "BR" };

type StudentCredentialsResponse = {
  email?: unknown;
  password?: unknown;
  error?: unknown;
};

const normalizeEmail = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const onlyDigits = (value: string | null | undefined) => (value || "").replace(/\D/g, "");

const errorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
};

function findDuplicateStudent(students: Student[], payload: { email: string | null; cpf: string | null; phone: string | null; whatsapp: string | null; country_code: string }, currentId?: string) {
  const email = normalizeEmail(payload.email);
  const cpf = normalizeFiscalDocument(payload.cpf, payload.country_code);
  const phone = onlyDigits(payload.whatsapp || payload.phone);

  return students.find((student) => {
    if (student.id === currentId) return false;
    if (email && normalizeEmail(student.email) === email) return true;
    if (cpf && normalizeFiscalDocument(student.cpf, student.country_code) === cpf) return true;
    if (!email && !cpf && phone && onlyDigits(student.whatsapp || student.phone) === phone) return true;
    return false;
  });
}

export default function StudentsManager() {
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [filter, setFilter] = useState(initialStatus && ["interested", "active", "pending", "inactive", "awaiting_renewal"].includes(initialStatus) ? initialStatus : "all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [accessLoadingId, setAccessLoadingId] = useState<string | null>(null);
  const [batchAccessLoading, setBatchAccessLoading] = useState(false);

  // CEP ↔ endereço automático no Novo Aluno
  const fillFromCepNew = async (cepValue: string) => {
    if (!isBrazilianCountry(form.country_code)) return;
    const r = await lookupCep(cepValue);
    if (!r) return;
    setForm((f) => ({
      ...f,
      cep: formatCEP(r.cep),
      address: r.logradouro || f.address,
      neighborhood: r.bairro || f.neighborhood,
      city: r.cidade || f.city,
      state: r.uf || f.state,
    }));
  };
  const fillCepFromAddressNew = async () => {
    if (!isBrazilianCountry(form.country_code)) return;
    if (form.cep.replace(/\D/g, "").length === 8) return;
    const r = await lookupCepByAddress(form.state, form.city, form.address);
    if (r?.cep) setForm((f) => ({ ...f, cep: formatCEP(r.cep), neighborhood: f.neighborhood || r.bairro }));
  };
  const { toast } = useToast();
  const { session, role, companyId } = useAuth();
  const navigate = useNavigate();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const rolePrefix = role === "coordinator" ? "/coordinator" : role === "trainer" ? "/trainer" : "/admin";

  useEffect(() => { loadData(); }, [effectiveCompanyId]);

  const loadData = async () => {
    // Don't load until we know which company we're in (avoids empty trainers list on first paint)
    if (!effectiveCompanyId) return;

    const studentsQuery = supabase.from("students").select("*").eq("company_id", effectiveCompanyId).order("full_name");
    const plansQuery = supabase.from("plans").select("id, name, duration_weeks").eq("is_active", true).eq("company_id", effectiveCompanyId).order("name");
    // Restrict trainer/coordinator/admin lookup to the current company via company_members
    const membersQuery = supabase.from("company_members").select("user_id").eq("company_id", effectiveCompanyId);

    const [{ data: studentsData }, { data: plansData }, { data: membersData }] = await Promise.all([
      studentsQuery,
      plansQuery,
      membersQuery,
    ]);

    setPlans(plansData || []);

    // Load trainers (filtered by company members + relevant roles)
    const memberIds = (membersData || []).map(m => m.user_id);
    if (memberIds.length > 0) {
      const [{ data: rolesData }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", memberIds).in("role", ["admin", "coordinator", "trainer"]),
        supabase.from("profiles").select("user_id, full_name").in("user_id", memberIds),
      ]);
      const trainerIds = new Set((rolesData || []).map(r => r.user_id));
      setTrainers(
        (profiles || [])
          .filter(p => trainerIds.has(p.user_id))
          .map(p => ({ user_id: p.user_id, full_name: p.full_name || "Sem nome" }))
      );
    } else {
      setTrainers([]);
    }

    // Load enrollments for plan names
    if (studentsData) {
      const studentIds = studentsData.map(s => s.id);
      const { data: enrollments } = await supabase
        .from("enrollments").select("student_id, plan_id, status")
        .in("student_id", studentIds).in("status", ["active", "awaiting_training", "awaiting_renewal"]);

      const planMap = new Map((plansData || []).map(p => [p.id, p.name]));
      const studentPlanMap = new Map<string, string>();
      const studentEnrollPlanIdMap = new Map<string, string>();
      (enrollments || []).forEach(e => {
        if (!studentPlanMap.has(e.student_id)) {
          studentPlanMap.set(e.student_id, planMap.get(e.plan_id) || "");
          studentEnrollPlanIdMap.set(e.student_id, e.plan_id);
        }
      });
      setStudents(studentsData.map(s => ({
        ...s,
        selected_plan_id: s.selected_plan_id || studentEnrollPlanIdMap.get(s.id) || null,
        plan_name: studentPlanMap.get(s.id) || (s.selected_plan_id ? planMap.get(s.selected_plan_id) : undefined)
      })));
    }
  };

  const filtered = students.filter(s => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.full_name.toLowerCase().includes(q) || (s.email?.toLowerCase().includes(q) ?? false) || (s.cpf?.includes(search) ?? false);
    }
    return true;
  });
  const activeWithoutAccess = students.filter(s => s.status === "active" && !s.user_id);
  const activeWithoutAccessWithEmail = activeWithoutAccess.filter(s => !!s.email);
  const activeWithoutAccessNoEmail = activeWithoutAccess.length - activeWithoutAccessWithEmail.length;

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (s: Student) => {
    const brazilian = isBrazilianCountry(s.country_code);
    setEditing(s);
    setForm({
      full_name: s.full_name, email: s.email || "", phone: s.phone || "", status: s.status,
      notes: s.notes || "", birth_date: s.birth_date || "",
      cpf: s.cpf ? (brazilian ? formatCPF(s.cpf) : s.cpf) : "",
      cep: s.cep ? (brazilian ? formatCEP(s.cep) : s.cep) : "",
      address: s.address || "", address_number: s.address_number || "",
      neighborhood: s.neighborhood || "", city: s.city || "", state: s.state || "",
      whatsapp: s.whatsapp ? formatPhoneForCountry(s.whatsapp, s.country_code) : "",
      country_code: normalizeCountryCode(s.country_code) || "BR",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) return;

    // Validação de dados de cobrança (necessários para o link de pagamento funcionar)
    if (!form.country_code.trim()) {
      toast({
        title: "País obrigatório",
        description: "Informe o código ISO com 2 letras, como BR, PT ou US.",
        variant: "destructive",
      });
      return;
    }
    const countryCode = normalizeCountryCode(form.country_code);
    if (!countryCode) {
      toast({
        title: "País inválido",
        description: "Informe o código ISO com 2 letras, como BR, PT ou US.",
        variant: "destructive",
      });
      return;
    }
    const billingIssues = fiscalRegistrationValidation({ ...form, country_code: countryCode });

    if (billingIssues.length > 0) {
      const proceed = window.confirm(
        `Atenção: o link de cobrança (Pix/Cartão) não vai funcionar para este aluno enquanto faltarem:\n\n• ${billingIssues.join("\n• ")}\n\nDeseja salvar mesmo assim?`
      );
      if (!proceed) return;
    }

    const payload = {
      full_name: form.full_name.trim(), email: form.email.trim() || null,
      phone: form.phone.trim() || null, status: form.status, notes: form.notes.trim() || null,
      birth_date: form.birth_date || null,
      cpf: (isBrazilianCountry(countryCode) ? form.cpf.replace(/\D/g, "") : form.cpf.trim()) || null,
      cep: (isBrazilianCountry(countryCode) ? form.cep.replace(/\D/g, "") : form.cep.trim()) || null,
      address: form.address.trim() || null,
      address_number: form.address_number.trim() || null, neighborhood: form.neighborhood.trim() || null,
      city: form.city.trim() || null, state: form.state.trim() || null,
      whatsapp: form.whatsapp.replace(/\D/g, "") || null,
      country_code: countryCode,
    };

    const duplicate = findDuplicateStudent(students, payload, editing?.id);
    if (duplicate) {
      toast({
        title: "Aluno já cadastrado",
        description: `${duplicate.full_name} já usa este e-mail/CPF. Abra o perfil existente em vez de criar outro.`,
        variant: "destructive",
      });
      return;
    }

    if (editing) {
      const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      // Sync address to Asaas
      try {
        if (isBrazilianCountry(countryCode)) {
          await supabase.functions.invoke("asaas-integration", {
            body: {
              action: "update-customer", studentId: editing.id,
              name: payload.full_name, email: payload.email,
              mobilePhone: payload.whatsapp, postalCode: payload.cep,
              address: payload.address, addressNumber: payload.address_number,
              province: payload.neighborhood,
            },
          });
        }
      } catch (e) { console.error("Erro ao sincronizar com Asaas:", e); }
      toast({ title: "Aluno atualizado!" });
    } else {
      const { error } = await supabase.from("students").insert({ ...payload, company_id: effectiveCompanyId });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Aluno cadastrado!" });
    }
    setOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aluno removido" });
    loadData();
  };

  const handleAssignTrainer = async (studentId: string, trainerId: string) => {
    const { error } = await supabase.from("students").update({ assigned_trainer_id: trainerId }).eq("id", studentId);
    if (error) {
      console.error("[handleAssignTrainer] update failed:", error);
      toast({ title: "Erro ao atribuir treinador", description: `${error.message}${error.code ? ` (código ${error.code})` : ""}`, variant: "destructive" });
      return;
    }
    toast({ title: "Treinador atribuído!" });
    loadData();
  };

  const handleChangePlan = async (studentId: string, planId: string) => {
    const { error } = await supabase.from("students").update({ selected_plan_id: planId }).eq("id", studentId);
    if (error) {
      console.error("[handleChangePlan] update failed:", error);
      toast({ title: "Erro ao alterar plano", description: `${error.message}${error.code ? ` (código ${error.code})` : ""}`, variant: "destructive" });
      return;
    }
    toast({ title: "Plano atualizado!" });
    loadData();
  };

  const handleStartEnrollment = async (s: Student) => {
    if (!s.selected_plan_id || !s.assigned_trainer_id || !session?.user?.id) {
      toast({ title: "Atenção", description: "Selecione o plano e o treinador antes.", variant: "destructive" });
      return;
    }
    const plan = plans.find(p => p.id === s.selected_plan_id);
    if (!plan) return;
    setSaving(true);
    const startDate = new Date();
    const endDate = addWeeks(startDate, plan.duration_weeks);
    const { error } = await supabase.from("enrollments").insert({
      student_id: s.id, plan_id: s.selected_plan_id, trainer_id: s.assigned_trainer_id,
      start_date: format(startDate, "yyyy-MM-dd"), end_date: format(endDate, "yyyy-MM-dd"),
      created_by: session.user.id, status: "awaiting_training", company_id: effectiveCompanyId,
    });
    if (!error) await supabase.from("students").update({
      status: "active",
      sales_stage: "active",
      activated_at: new Date().toISOString(),
    }).eq("id", s.id).eq("company_id", effectiveCompanyId);
    setSaving(false);
    if (error) { toast({ title: "Erro ao criar matrícula", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Matrícula criada! Aguardando prescrição do treinador." });
    loadData();
  };

  const studentLoginUrl = `${window.location.origin}/auth?as=student`;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const buildLoginMessage = (student: Student, creds: { email: string; password: string }) => {
    const first = student.full_name.trim().split(/\s+/)[0] || "";
    return (
      `Olá${first ? ", " + first : ""}! Seu acesso ao app de treino está pronto.\n\n` +
      `Acesse: ${studentLoginUrl}\n` +
      `Email: ${creds.email}\n` +
      `Senha: ${creds.password}\n\n` +
      `É só entrar e começar. Qualquer dúvida, me chama por aqui!`
    );
  };

  const requestStudentCredentials = async (student: Student): Promise<{ email: string; password: string } | null> => {
    if (!student.email) {
      toast({ title: "Sem e-mail", description: "Cadastre um e-mail no aluno para gerar o acesso.", variant: "destructive" });
      return null;
    }

    const { data, error } = await supabase.functions.invoke<StudentCredentialsResponse>("student-login-credentials", {
      body: { student_id: student.id },
    });
    if (error || data?.error) {
      throw new Error(errorMessage(data?.error || error, "Falha ao gerar acesso"));
    }
    if (typeof data?.email !== "string" || typeof data?.password !== "string") {
      throw new Error("Resposta inválida ao gerar acesso");
    }
    return { email: data.email, password: data.password };
  };

  const handleGenerateStudentAccess = async (student: Student) => {
    setAccessLoadingId(student.id);
    try {
      const creds = await requestStudentCredentials(student);
      if (!creds) return;
      await copyText(buildLoginMessage(student, creds));
      toast({ title: "Login copiado!", description: "Email, senha e link prontos pra colar no chat do aluno." });
      await loadData();
    } catch (err: unknown) {
      toast({ title: "Erro ao gerar acesso", description: errorMessage(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setAccessLoadingId(null);
    }
  };

  const handleGenerateBatchAccess = async () => {
    const targets = activeWithoutAccessWithEmail;
    if (targets.length === 0) {
      toast({ title: "Nenhum aluno elegível", description: "Os ativos sem acesso precisam ter e-mail cadastrado." });
      return;
    }

    const proceed = window.confirm(
      `Gerar/redefinir senha temporária para ${targets.length} aluno(s) ativo(s) sem acesso?\n\n` +
      `As mensagens serão copiadas para você enviar. ${activeWithoutAccessNoEmail > 0 ? `${activeWithoutAccessNoEmail} aluno(s) sem e-mail serão ignorados.` : ""}`
    );
    if (!proceed) return;

    setBatchAccessLoading(true);
    const messages: string[] = [];
    const failures: string[] = [];
    for (const student of targets) {
      setAccessLoadingId(student.id);
      try {
        const creds = await requestStudentCredentials(student);
        if (creds) messages.push(buildLoginMessage(student, creds));
      } catch (err: unknown) {
        failures.push(`${student.full_name}: ${errorMessage(err, "falha ao gerar acesso")}`);
      }
    }
    setAccessLoadingId(null);

    if (messages.length > 0) {
      await copyText(messages.join("\n\n---\n\n"));
    }
    if (failures.length > 0) {
      toast({
        title: `${messages.length} acesso(s) gerado(s), ${failures.length} falha(s)`,
        description: failures.slice(0, 2).join(" | "),
        variant: "destructive",
      });
    } else {
      toast({ title: "Acessos gerados!", description: `${messages.length} mensagem(ns) copiadas para envio.` });
    }
    setBatchAccessLoading(false);
    await loadData();
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-4xl text-primary">ALUNOS</h1>
              <BnitoContextButton
                label="gestao de alunos"
                context="Lista de alunos, status, treinador, plano, inicio de matricula, dados de cobranca e proximo passo operacional."
                question="Como devo priorizar alunos pendentes, sem treinador, sem plano ou aguardando prescricao?"
              />
            </div>
            <p className="text-muted-foreground font-sans">Gerencie alunos, atribua treinadores e inicie matrículas</p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            {activeWithoutAccess.length > 0 && (
              <Button
                variant="outline"
                onClick={handleGenerateBatchAccess}
                disabled={batchAccessLoading || activeWithoutAccessWithEmail.length === 0}
                title={activeWithoutAccessNoEmail > 0 ? `${activeWithoutAccessNoEmail} ativo(s) sem e-mail serão ignorados` : "Gerar acessos dos alunos ativos sem login"}
              >
                {batchAccessLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Gerar {activeWithoutAccessWithEmail.length} acessos
              </Button>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                if (!effectiveCompanyId) return;
                const { data } = await supabase.from("companies").select("slug").eq("id", effectiveCompanyId).maybeSingle();
                const slug = data?.slug;
                const link = preRegistrationUrl(window.location.origin, slug);
                try { await navigator.clipboard.writeText(link); } catch {
                  const ta = document.createElement("textarea");
                  ta.value = link; ta.style.position = "fixed"; ta.style.left = "-9999px";
                  document.body.appendChild(ta); ta.focus(); ta.select();
                  document.execCommand("copy"); document.body.removeChild(ta);
                }
                toast({ title: "Link de cadastro copiado!", description: link });
              }}
            >
              <Copy className="h-4 w-4 mr-2" />Link de Pré-cadastro
            </Button>
            <Button onClick={openCreate}><UserPlus className="h-4 w-4 mr-2" />Novo Aluno</Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, email ou CPF..." className="pl-9 bg-card border-border" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] bg-card border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="interested">Interessados</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="awaiting_renewal">Aguardando Renovação</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {filtered.map(s => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        className="max-w-full truncate text-left font-sans font-medium text-foreground hover:text-primary hover:underline"
                        onClick={() => navigate(`${rolePrefix}/students/${s.id}`)}
                        title="Abrir perfil do aluno"
                      >
                        {s.full_name}
                      </button>
                      <Badge variant="outline" className={`text-xs ${statusColors[s.status]}`}>{statusLabels[s.status] || s.status}</Badge>
                      {s.plan_name && <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">{s.plan_name}</Badge>}
                      {s.status === "active" && !s.user_id && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">Sem acesso</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-sans">
                      {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}
                      {(s.phone || s.whatsapp) && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.whatsapp || s.phone}</span>}
                      <span>Cadastro: {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <BnitoContextButton
                      label={`aluno ${s.full_name}`}
                      context={`Aluno na lista. Status: ${statusLabels[s.status] || s.status}. Plano: ${s.plan_name || "sem plano"}. Treinador atribuido: ${s.assigned_trainer_id ? "sim" : "nao"}.`}
                      question="Qual o proximo passo operacional e tecnico para este aluno?"
                    />
                    <StudentChatButton studentId={s.id} studentName={s.full_name} phone={s.whatsapp || s.phone} />
                    {s.status === "active" && !s.user_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Gerar login de ${s.full_name}`}
                        title={s.email ? `Gerar login de ${s.full_name}` : "Cadastre e-mail para gerar login"}
                        disabled={batchAccessLoading || accessLoadingId === s.id || !s.email}
                        onClick={() => handleGenerateStudentAccess(s)}
                      >
                        {accessLoadingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Ver perfil de ${s.full_name}`} title={`Ver perfil de ${s.full_name}`} onClick={() => navigate(`${rolePrefix}/students/${s.id}`)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${s.full_name}`} title={`Editar ${s.full_name}`} onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${s.full_name}`} title={`Excluir ${s.full_name}`} onClick={() => handleDelete(s.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                {/* Trainer & Plan assignment */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs font-sans text-muted-foreground">Treinador</Label>
                    <Select value={s.assigned_trainer_id || ""} onValueChange={v => handleAssignTrainer(s.id, v)}>
                      <SelectTrigger className="bg-secondary border-border h-8 text-xs"><SelectValue placeholder="Atribuir treinador" /></SelectTrigger>
                      <SelectContent>{trainers.map(t => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs font-sans text-muted-foreground">Plano</Label>
                    <Select value={s.selected_plan_id || ""} onValueChange={v => handleChangePlan(s.id, v)}>
                      <SelectTrigger className="bg-secondary border-border h-8 text-xs"><SelectValue placeholder="Selecionar plano" /></SelectTrigger>
                      <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-muted-foreground font-sans text-center py-12">Nenhum aluno encontrado</p>}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                {editing ? "EDITAR ALUNO" : "NOVO ALUNO"}
                <BnitoContextButton
                  label="cadastro do aluno"
                  context="Formulario do aluno com dados de contato, cobranca, status e observacoes usados para matricula e links de pagamento."
                  question="Quais campos sao criticos para evitar problema de cobranca, matricula ou prescricao?"
                  className="ml-auto"
                />
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label className="font-sans">Nome completo *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2">
                <Label className="font-sans">País (código ISO de 2 letras)</Label>
                <Input
                  value={form.country_code}
                  onChange={e => setForm({ ...form, country_code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })}
                  className="bg-secondary border-border uppercase"
                  placeholder="BR, PT, US..."
                  maxLength={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: formatPhoneForCountry(e.target.value, form.country_code) })} className="bg-secondary border-border" placeholder={isBrazilianCountry(form.country_code) ? "(00) 00000-0000" : "+351912345678"} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">CPF {isBrazilianCountry(form.country_code) ? "" : "(opcional)"}</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: isBrazilianCountry(form.country_code) ? formatCPF(e.target.value) : e.target.value.slice(0, 32) })} className="bg-secondary border-border" placeholder={isBrazilianCountry(form.country_code) ? "000.000.000-00" : "Documento fiscal, se houver"} /></div>
                <div className="space-y-2"><Label className="font-sans">CEP {isBrazilianCountry(form.country_code) ? "" : "(opcional)"}</Label><Input value={form.cep} onChange={e => { const m = isBrazilianCountry(form.country_code) ? formatCEP(e.target.value) : e.target.value.slice(0, 20); setForm(f => ({ ...f, cep: m })); if (isBrazilianCountry(form.country_code) && m.replace(/\D/g, "").length === 8) void fillFromCepNew(m); }} className="bg-secondary border-border" placeholder={isBrazilianCountry(form.country_code) ? "00000-000" : "Código postal"} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Data de nascimento</Label><Input type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} className="bg-secondary border-border" /></div>
              </div>
              <div className="space-y-2"><Label className="font-sans">Rua</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} onBlur={fillCepFromAddressNew} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Número</Label><Input value={form.address_number} onChange={e => setForm({ ...form, address_number: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">Bairro</Label><Input value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} className="bg-secondary border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Cidade</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} onBlur={fillCepFromAddressNew} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">Estado/região</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} onBlur={fillCepFromAddressNew} className="bg-secondary border-border" maxLength={isBrazilianCountry(form.country_code) ? 2 : 80} /></div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interested">Interessado</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="font-sans">Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-secondary border-border" rows={3} /></div>
              <Button onClick={handleSave} className="w-full">{editing ? "Salvar" : "Cadastrar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
