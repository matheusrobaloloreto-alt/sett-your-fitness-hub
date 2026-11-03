import { selectPrescriptionEnrollment } from "@/lib/prescriptionSchedule";
import { normalizeSearchText } from "@/lib/normalizeSearchText";
import { useEffect, useState, useRef, useCallback } from "react";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { StudentChatButton } from "@/components/admin/StudentChatButton";
import { AthleticClubStar } from "@/components/AthleticClubStar";
import { preRegistrationUrl } from "@/lib/publicFlowLinks";
import { fiscalRegistrationValidation, isBrazilianCountry, normalizeCountryCode, normalizeFiscalDocument } from "@/lib/fiscalRegistration";
import { isInfluencerPlan } from "@/lib/influencerPlan";

import { generateStudentLoginAccess, studentCanonicalContact } from "@/lib/studentChat";

interface Student {
  id: string;
  company_id: string | null;
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
  enrollment_trainer_id?: string | null;
  created_at: string;
  plan_name?: string;
  has_current_contract?: boolean;
  contract_read_error?: boolean;
}

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
  duration_days?: number | null;
  plan_kind: string;
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
  const loadGeneration = useRef(0);
  const contextRef = useRef("");
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractReadError, setContractReadError] = useState(false);
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
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(null);
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
  const canManageCompanyStudents = Boolean(session?.user?.id && effectiveCompanyId)
    && ["trainer", "coordinator", "admin", "master"].includes(role || "");
  const rolePrefix = role === "coordinator" ? "/coordinator" : role === "trainer" ? "/trainer" : "/admin";

  const readContext = `${effectiveCompanyId || ""}:${role || ""}:${session?.user?.id || ""}`;
  contextRef.current = readContext;

  const loadData = useCallback(async () => {
    const context = readContext;
    if (context !== contextRef.current) return;
    const generation = ++loadGeneration.current;
    const current = () => generation === loadGeneration.current && contextRef.current === context;
    setStudents([]); setPlans([]); setTrainers([]);
    setContractReadError(false); setLoadError(false); setLoading(false);
    if (!effectiveCompanyId || !canManageCompanyStudents) return;
    setLoading(true);
    try {
      const [studentRead, planRead, directoryRead] = await Promise.all([
        supabase.from("students").select("*").eq("company_id", effectiveCompanyId).order("full_name"),
        supabase.from("plans").select("id, name, duration_weeks, duration_days, plan_kind").eq("is_active", true).eq("company_id", effectiveCompanyId).order("name"),
        (supabase as any).rpc("get_company_student_staff_directory", { _company_id: effectiveCompanyId }),
      ]);
      if (!current()) return;
      if (studentRead.error || (studentRead.data || []).some(student => student.company_id !== effectiveCompanyId)) throw new Error("Student scope unavailable");
      const studentsData = studentRead.data || [];
      const studentIds = studentsData.map(student => student.id);
      const enrollmentRead = studentIds.length ? await supabase.from("enrollments")
        .select("id, student_id, company_id, plan_id, trainer_id, status, start_date, end_date, training_start_date, created_at")
        .eq("company_id", effectiveCompanyId).in("student_id", studentIds).in("status", ["active", "awaiting_training", "awaiting_renewal"])
        : { data: [], error: null };
      if (!current()) return;
      const enrollmentError = Boolean(enrollmentRead.error || (enrollmentRead.data || []).some(row => row.company_id !== effectiveCompanyId || !studentIds.includes(row.student_id)));
      const enrollments = enrollmentError ? [] : enrollmentRead.data || [];
      const planIds = [...new Set(enrollments.map(row => row.plan_id))];
      const metadata = planIds.length ? await supabase.from("plans").select("id, name").eq("company_id", effectiveCompanyId).in("id", planIds) : { data: [], error: null };
      if (!current()) return;
      const names = new Map((metadata.error ? [] : metadata.data || []).filter(plan => planIds.includes(plan.id)).map(plan => [plan.id, plan.name]));
      const enriched = studentsData.map(student => {
        const enrollment = selectPrescriptionEnrollment(enrollments.filter(row => row.student_id === student.id), {
          expectedStudentId: student.id, expectedCompanyId: effectiveCompanyId,
        });
        return { ...student, selected_plan_id: student.selected_plan_id,
          enrollment_trainer_id: enrollment?.trainer_id || null,
          has_current_contract: Boolean(enrollment), contract_read_error: enrollmentError,
          plan_name: enrollment ? names.get(enrollment.plan_id) : undefined };
      });
      setStudents(enriched);
      setPlans(planRead.error ? [] : planRead.data || []);
      setTrainers(directoryRead.error ? [] : (directoryRead.data || []).map(member => ({
        user_id: member.user_id, full_name: member.full_name || "Sem nome",
      })).sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")));
      setContractReadError(enrollmentError || Boolean(metadata.error) || enriched.some(student => student.has_current_contract && !student.plan_name));
      setLoadError(Boolean(planRead.error || directoryRead.error));
    } catch {
      if (current()) { setStudents([]); setPlans([]); setTrainers([]); setLoadError(true); }
    } finally {
      if (current()) setLoading(false);
    }
  }, [readContext, effectiveCompanyId, canManageCompanyStudents]);

  useEffect(() => {
    setOpen(false); setEditing(null); setForm(emptyForm);
    void loadData();
    return () => { loadGeneration.current += 1; };
  }, [loadData]);

  const filtered = students.filter(s => {
    if (s.company_id !== effectiveCompanyId) return false;
    if (filter !== "all" && s.status !== filter) return false;
    if (search) {
      const q = normalizeSearchText(search);
      return normalizeSearchText(s.full_name).includes(q) || normalizeSearchText(s.email).includes(q) || (s.cpf?.includes(search) ?? false);
    }
    return true;
  });
  const canManageStudent = (student: Student) => (
    canManageCompanyStudents && student.company_id === effectiveCompanyId
  );
  const activeWithoutAccess = students.filter(s => canManageStudent(s) && s.status === "active" && !s.user_id);
  const activeWithoutAccessWithEmail = activeWithoutAccess.filter(s => !!s.email);
  const activeWithoutAccessNoEmail = activeWithoutAccess.length - activeWithoutAccessWithEmail.length;

  const openCreate = () => { if (!canManageCompanyStudents) return; setEditing(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (s: Student) => {
    if (!canManageStudent(s)) return;
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
    if (!canManageCompanyStudents || (editing && !canManageStudent(editing))) return;
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
      const { error } = await supabase.from("students").update(payload).eq("id", editing.id).eq("company_id", effectiveCompanyId!);
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
    const student = students.find((s) => s.id === id);
    if (!student || !canManageStudent(student)) return;
    const { error } = await supabase.from("students").delete().eq("id", id).eq("company_id", effectiveCompanyId!);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aluno removido" });
    loadData();
  };

  const handleAssignTrainer = async (studentId: string, trainerId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (assigningStudentId || !student || !canManageStudent(student) || student.assigned_trainer_id === trainerId || !trainers.some((t) => t.user_id === trainerId)) return;
    setAssigningStudentId(studentId);
    try {
      const { error } = await (supabase as any).rpc("reassign_student_trainer", {
        _student_id: studentId,
        _trainer_id: trainerId,
        _expected_trainer_id: student.assigned_trainer_id || null,
      });
      if (error) {
        toast({ title: "Erro ao atribuir treinador", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Treinador atribuído!" });
      await loadData();
    } catch (error) {
      toast({ title: "Erro ao atribuir treinador", description: errorMessage(error, "Tente novamente."), variant: "destructive" });
    } finally {
      setAssigningStudentId(null);
    }
  };

  const handleChangePlan = async (studentId: string, planId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student || !canManageStudent(student)) return;
    const selectedPlan = plans.find((plan) => plan.id === planId);
    if (!selectedPlan || !effectiveCompanyId) return;
    const { error } = isInfluencerPlan(selectedPlan)
      ? await supabase.rpc("classify_influencer_student", {
          _student_id: studentId,
          _plan_id: planId,
        })
      : await supabase
          .from("students")
          .update({ selected_plan_id: planId })
          .eq("id", studentId)
          .eq("company_id", effectiveCompanyId);
    if (error) {
      console.error("[handleChangePlan] update failed:", error);
      toast({ title: "Erro ao alterar plano", description: `${error.message}${error.code ? ` (código ${error.code})` : ""}`, variant: "destructive" });
      return;
    }
    toast({
      title: isInfluencerPlan(selectedPlan) ? "Influenciador(a) classificado e ativado!" : "Plano atualizado!",
      description: isInfluencerPlan(selectedPlan) ? "Nenhuma matrícula, cobrança, data inicial ou treinador foi criado." : undefined,
    });
    loadData();
  };

  const handleStartEnrollment = async (s: Student) => {
    if (!canManageStudent(s)) return;
    const plan = plans.find(p => p.id === s.selected_plan_id);
    if (isInfluencerPlan(plan)) {
      await handleChangePlan(s.id, plan.id);
      return;
    }
    if (!s.selected_plan_id || !s.assigned_trainer_id || !session?.user?.id) {
      toast({ title: "Atenção", description: "Selecione o plano e o treinador antes.", variant: "destructive" });
      return;
    }
    if (!plan) return;
    setSaving(true);
    const startDate = new Date();
    const startDateValue = format(startDate, "yyyy-MM-dd");
    const { data: replacementRows, error } = await supabase.rpc("replace_student_enrollment", {
      _student_id: s.id,
      _company_id: effectiveCompanyId,
      _plan_id: s.selected_plan_id,
      _trainer_id: s.assigned_trainer_id,
      _start_date: startDateValue,
      _clear_carried_over_cycle: false,
    });
    const enrollmentId = Array.isArray(replacementRows) ? replacementRows[0]?.enrollment_id : (replacementRows as any)?.enrollment_id;
    setSaving(false);
    if (error) { toast({ title: "Erro ao criar matrícula", description: error.message, variant: "destructive" }); return; }
    if (!enrollmentId) {
      toast({ title: "Matrícula criada sem confirmação local", description: "O servidor não retornou a matrícula criada. Recarregue o aluno antes de prescrever.", variant: "destructive" });
      return;
    }
    toast({ title: "Matrícula criada! Aguardando prescrição do treinador." });
    loadData();
  };

  const accessBusy = useRef(false);
  const accessCompanyRef = useRef(effectiveCompanyId);
  accessCompanyRef.current = effectiveCompanyId;
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
      let copied = false;
      try { ta.focus(); ta.select(); copied = document.execCommand("copy"); }
      finally { document.body.removeChild(ta); }
      if (!copied) throw new Error("Não foi possível copiar o acesso. A senha já foi gerada; confira o cadastro antes de tentar novamente.");
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
    if (!canManageStudent(student)) return null;
    if (!student.email) {
      toast({ title: "Sem e-mail", description: "Cadastre um e-mail no aluno para gerar o acesso.", variant: "destructive" });
      return null;
    }

    const contact = studentCanonicalContact(student);
    if (!contact.ready) throw new Error(contact.reason);
    if (!effectiveCompanyId || student.company_id !== effectiveCompanyId) throw new Error("Empresa do aluno não confirmada.");
    return generateStudentLoginAccess({ studentId: student.id, companyId: effectiveCompanyId,
      remoteJid: `${contact.whatsapp}@s.whatsapp.net` });
  };

  const handleGenerateStudentAccess = async (student: Student) => {
    if (accessBusy.current) return;
    accessBusy.current = true;
    const accessCompany = effectiveCompanyId;
    setAccessLoadingId(student.id);
    try {
      const creds = await requestStudentCredentials(student);
      if (!creds || accessCompanyRef.current !== accessCompany) return;
      await copyText(buildLoginMessage(student, creds));
      toast({ title: "Login copiado!", description: "Email, senha e link prontos pra colar no chat do aluno." });
      await loadData();
    } catch (err: unknown) {
      toast({ title: "Erro ao gerar acesso", description: errorMessage(err, "Tente novamente."), variant: "destructive" });
    } finally {
      accessBusy.current = false;
      setAccessLoadingId(null);
    }
  };

  const handleGenerateBatchAccess = async () => {
    if (accessBusy.current) return;
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

    accessBusy.current = true;
    setBatchAccessLoading(true);
    const accessCompany = effectiveCompanyId;
    const messages: string[] = [];
    const failures: string[] = [];
    for (const student of targets) {
      if (accessCompanyRef.current !== accessCompany) break;
      setAccessLoadingId(student.id);
      try {
        const creds = await requestStudentCredentials(student);
        if (creds) messages.push(buildLoginMessage(student, creds));
      } catch (err: unknown) {
        failures.push(`${student.full_name}: ${errorMessage(err, "falha ao gerar acesso")}`);
      }
    }
    setAccessLoadingId(null);

    if (accessCompanyRef.current !== accessCompany) {
      accessBusy.current = false;
      setBatchAccessLoading(false);
      return;
    }
    if (messages.length > 0) {
      try {
        await copyText(messages.join("\n\n---\n\n"));
      } catch (err) {
        toast({ title: "Acessos gerados, cópia não confirmada", description: errorMessage(err, "Falha ao copiar."), variant: "destructive" });
        accessBusy.current = false;
        setBatchAccessLoading(false);
        return;
      }
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
    accessBusy.current = false;
    setBatchAccessLoading(false);
    await loadData();
  };

  return (
    <>
      <div className="space-y-6">
        {loading && <p role="status">Carregando alunos…</p>}
        {loadError && <p role="alert">Não foi possível carregar todos os dados de alunos, planos ou equipe.</p>}
        {contractReadError && <p role="alert">Não foi possível confirmar todos os dados contratuais. Falha de leitura ou nome indisponível não significa ausência de contrato.</p>}
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
                const { data, error } = await supabase.from("companies").select("slug").eq("id", effectiveCompanyId).maybeSingle();
                const slug = data?.slug?.trim();
                if (error || !slug) {
                  toast({
                    title: "Não foi possível copiar o pré-cadastro",
                    description: error?.message || "Empresa sem slug público configurado.",
                    variant: "destructive",
                  });
                  return;
                }
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
                {(() => {
                  const selectedPlan = plans.find((plan) => plan.id === s.selected_plan_id);
                  const influencer = isInfluencerPlan(selectedPlan);
                  return <>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        className="min-w-0 max-w-full truncate text-left font-sans font-medium text-foreground hover:text-primary hover:underline"
                        onClick={() => navigate(`${rolePrefix}/students/${s.id}`)}
                        title="Abrir perfil do aluno"
                      >
                        {s.full_name}
                      </button>
                      <AthleticClubStar studentId={s.id} companyId={effectiveCompanyId} className="shrink-0" />
                      <Badge variant="outline" className={`text-xs ${statusColors[s.status]}`}>{statusLabels[s.status] || s.status}</Badge>
                      {s.contract_read_error ? <Badge variant="outline">Contrato indisponível: falha de leitura</Badge> : s.has_current_contract && !s.plan_name ? <Badge variant="outline">Plano contratado vigente: nome indisponível</Badge> : s.plan_name ? <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">Plano contratado vigente: {s.plan_name}</Badge> : <Badge variant="outline">Sem plano contratado vigente</Badge>}
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
                    {canManageStudent(s) && s.status === "active" && !s.user_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Gerar login de ${s.full_name}`}
                        title={s.email ? `Gerar/redefinir senha de ${s.full_name}` : "Cadastre e-mail para gerar login"}
                        disabled={batchAccessLoading || accessLoadingId === s.id || !s.email}
                        onClick={() => handleGenerateStudentAccess(s)}
                      >
                        {accessLoadingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Ver perfil de ${s.full_name}`} title={`Ver perfil de ${s.full_name}`} onClick={() => navigate(`${rolePrefix}/students/${s.id}`)}><Eye className="h-4 w-4" /></Button>
                    {canManageStudent(s) && (
                      <>
                        <Button variant="ghost" size="icon" aria-label={`Editar ${s.full_name}`} title={`Editar ${s.full_name}`} onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Excluir ${s.full_name}`} title={`Excluir ${s.full_name}`} onClick={() => handleDelete(s.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Trainer & Plan assignment */}
                {canManageStudent(s) && <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs font-sans text-muted-foreground">Treinador{influencer ? " (opcional)" : ""}</Label>
                    <Select value={s.assigned_trainer_id || ""} onValueChange={v => handleAssignTrainer(s.id, v)} disabled={influencer || Boolean(assigningStudentId)}>
                      <SelectTrigger aria-label={`Professor responsável por ${s.full_name}`} className="bg-secondary border-border h-8 text-xs"><SelectValue placeholder={influencer ? "Não exigido" : "Atribuir treinador"} /></SelectTrigger>
                      <SelectContent>{trainers.map(t => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs font-sans text-muted-foreground">Plano escolhido no cadastro</Label>
                    <Select value={s.selected_plan_id || ""} onValueChange={v => handleChangePlan(s.id, v)}>
                      <SelectTrigger aria-label="Plano escolhido no cadastro" className="bg-secondary border-border h-8 text-xs"><SelectValue placeholder="Plano escolhido no cadastro" /></SelectTrigger>
                      <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>}
                  </>;
                })()}
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
