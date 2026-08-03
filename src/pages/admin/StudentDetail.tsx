import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentCycleFeedbackCard } from "@/components/admin/StudentCycleFeedbackCard";
import { PlanVersionsCard } from "@/components/admin/PlanVersionsCard";
import { AssessmentCompareCard } from "@/components/admin/AssessmentCompareCard";
import { PreRegistrationDetails } from "@/components/admin/PreRegistrationDetails";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { StudentGoalsManager } from "@/components/admin/StudentGoalsManager";
import { StudentTimeline } from "@/components/admin/StudentTimeline";
import { StudentFilesPanel } from "@/components/admin/StudentFilesPanel";
import { WeeklyContactToggle } from "@/components/admin/WeeklyContactToggle";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Phone, Cake, CalendarDays, Dumbbell, Plus, CalendarIcon, MapPin, CreditCard, MessageCircle, Pencil, DollarSign, Upload, Image, Mic, FileText, Download, Square, MicOff, RefreshCw, ExternalLink, Copy, Link, Check, Trash2, UserPlus, BarChart3, Clock, CheckCircle2, Edit, KeyRound, ChevronDown } from "lucide-react";
import { format, parseISO, eachDayOfInterval, addWeeks, addDays, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { ProgressPhotosPanel } from "@/components/ProgressPhotosPanel";
import { loadStudentPreRegistration } from "@/lib/preRegistrationData";
import type { PreRegistrationData } from "@/lib/preRegistration";

// Safely format a date string. Returns "—" when value is missing or invalid.
function safeFormatDate(value: string | null | undefined, fmt: string, opts?: Parameters<typeof format>[2]): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return "—";
    return format(d, fmt, opts);
  } catch {
    return "—";
  }
}
import { formatCPF, formatCEP, formatPhone } from "@/lib/masks";
import { lookupCep, lookupCepByAddress } from "@/lib/cep";
import { createPlansLink, openStudentChat } from "@/lib/studentChat";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
// Heavy children loaded only when their tab is opened (chunk size win)
const WorkoutAnalysis = lazy(() => import("@/components/trainer/WorkoutAnalysis").then(m => ({ default: m.WorkoutAnalysis })));
const TrainerWeeklyBar = lazy(() => import("@/components/trainer/TrainerWeeklyBar").then(m => ({ default: m.TrainerWeeklyBar })));
const StudentVolumePanel = lazy(() => import("@/components/trainer/StudentVolumePanel").then(m => ({ default: m.StudentVolumePanel })));
const StudentBodyMap = lazy(() => import("@/components/body/StudentBodyMap").then(m => ({ default: m.StudentBodyMap })));
const MuscleRadar = lazy(() => import("@/components/student/MuscleRadar").then(m => ({ default: m.MuscleRadar })));


const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);
const InlineFallback = () => (
  <div className="flex items-center justify-center py-6">
    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

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
  selected_plan_id: string | null;
  assigned_trainer_id: string | null;
  company_id: string | null;
}

interface Enrollment {
  id: string;
  plan_id: string;
  trainer_id: string;
  start_date: string;
  end_date: string;
  status: string;
  plan_name?: string;
  plan_duration?: number;
  trainer_name?: string;
  payment_status?: string;
  payment_date?: string;
  payment_method?: string;
  financial_notes?: string;
  training_start_date?: string;
}

interface TrainingCycle {
  id: string;
  enrollment_id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  has_workout?: boolean;
  prescribed_offline_at?: string | null;
  prescribed_offline_by?: string | null;
}

type TrainingCycleUpdate = Database["public"]["Tables"]["training_cycles"]["Update"] & {
  prescribed_offline_at?: string | null;
  prescribed_offline_by?: string | null;
};

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
  duration_days: number | null;
}

interface Trainer {
  user_id: string;
  full_name: string;
}

interface Evaluation {
  id: string;
  type: string;
  file_url: string | null;
  notes: string | null;
  created_at: string;
  created_by_name?: string;
}

interface AsaasPayment {
  id: string;
  asaas_payment_id: string | null;
  billing_type: string;
  value: number;
  status: string;
  due_date: string | null;
  invoice_url: string | null;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  interested: "Interessado",
  active: "Ativo",
  pending: "Pendente",
  inactive: "Inativo",
  completed: "Concluído",
  upcoming: "Próximo",
  awaiting_training: "Aguardando Prescrição",
  awaiting_renewal: "Aguardando Renovação",
};

const statusColors: Record<string, string> = {
  interested: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  active: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
  completed: "bg-muted text-muted-foreground border-border",
  upcoming: "bg-warning/15 text-warning border-warning/30",
  awaiting_training: "bg-warning/15 text-warning border-warning/30",
  awaiting_renewal: "bg-warning/15 text-warning border-warning/30",
};

const cycleCalendarColors: Record<string, { bg: string; text: string }> = {
  prescribe: { bg: "hsl(var(--warning) / 0.25)", text: "hsl(var(--warning))" },
  done: { bg: "hsl(var(--success) / 0.25)", text: "hsl(var(--success))" },
  expired_no_workout: { bg: "hsl(var(--destructive) / 0.25)", text: "hsl(var(--destructive))" },
};

const STUDENT_TABS = [
  ["overview", "Visão Geral"],
  ["program", "Programa"],
  ["anamnesis", "Anamnese"],
  ["evaluations", "Avaliações"],
  ["financial", "Financeiro"],
  ["analytics", "Análises"],
] as const;

const isCyclePrescribed = (cycle: TrainingCycle) =>
  Boolean(cycle.has_workout || cycle.prescribed_offline_at);

const paymentStatusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Inadimplente",
};

const paymentStatusColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  paid: "bg-success/15 text-success border-success/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, role } = useAuth();
  const { toast } = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [preRegistration, setPreRegistration] = useState<PreRegistrationData | null>(null);
  const [preRegistrationLoading, setPreRegistrationLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<any[]>([]);
  const [asaasPayments, setAsaasPayments] = useState<AsaasPayment[]>([]);
  const [refreshingPayment, setRefreshingPayment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [trainerName, setTrainerName] = useState<string | null>(null);

  // Enrollment dialog state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  // Edit student dialog state
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [studentForm, setStudentForm] = useState({
    full_name: "", email: "", phone: "", birth_date: "", cpf: "", cep: "", address: "",
    address_number: "", neighborhood: "", city: "", state: "",
    whatsapp: "", status: "pending", notes: ""
  });

  // Financial edit dialog
  const [financialOpen, setFinancialOpen] = useState(false);
  const [financialEnrollment, setFinancialEnrollment] = useState<Enrollment | null>(null);
  const [financialForm, setFinancialForm] = useState({ payment_status: "", payment_date: "", payment_method: "", financial_notes: "" });

  // Evaluations
  const [evalNotes, setEvalNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [activatingAccess, setActivatingAccess] = useState(false);
  const [loginCreds, setLoginCreds] = useState<{ email: string; password: string } | null>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [copiedLogin, setCopiedLogin] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const handleActivateStudentAccess = async () => {
    if (!student?.email) {
      toast({ title: "Erro", description: "Aluno precisa ter um email cadastrado", variant: "destructive" });
      return;
    }
    setActivatingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke("activate-student-access", {
        body: { student_id: student.id },
      });
      if (error) {
        const msg = (data as any)?.error || error.message || "Falha ao ativar acesso";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      } else if ((data as any)?.error) {
        toast({ title: "Erro", description: (data as any).error, variant: "destructive" });
      } else {
        toast({ title: "Acesso ativado!", description: `Senha temporária: ${(data as any)?.temp_password}. Compartilhe com o aluno.` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao ativar acesso", description: err?.message, variant: "destructive" });
    }
    setActivatingAccess(false);
  };

  // ===== Acesso do app: gerar/copiar/enviar login do aluno =====
  const studentLoginUrl = `${window.location.origin}/auth?as=student`;

  const waDigits = (phone?: string | null): string | null => {
    if (!phone) return null;
    let d = phone.replace(/\D/g, "");
    if (!d) return null;
    if (d.length <= 11) d = "55" + d; // assume Brasil se vier sem DDI
    return d;
  };

  const buildLoginMessage = (creds: { email: string; password: string }) => {
    const first = (student?.full_name || "").trim().split(/\s+/)[0] || "";
    return (
      `Olá${first ? ", " + first : ""}! Seu acesso ao app de treino está pronto 💪\n\n` +
      `🔗 Acesse: ${studentLoginUrl}\n` +
      `📧 Email: ${creds.email}\n` +
      `🔑 Senha: ${creds.password}\n\n` +
      `É só entrar e começar. Qualquer dúvida, me chama por aqui!`
    );
  };

  // Gera/redefine a senha no servidor e devolve as credenciais (cacheia no estado).
  const fetchLoginCreds = async (): Promise<{ email: string; password: string } | null> => {
    if (loginCreds) return loginCreds;
    if (!student?.id) return null;
    if (!student.email) {
      toast({ title: "Sem e-mail", description: "Cadastre um e-mail no aluno para gerar o acesso.", variant: "destructive" });
      return null;
    }
    setLoadingLogin(true);
    try {
      const { data, error } = await supabase.functions.invoke("student-login-credentials", {
        body: { student_id: student.id },
      });
      if (error || (data as any)?.error) {
        toast({ title: "Erro", description: (data as any)?.error || error?.message || "Falha ao gerar acesso", variant: "destructive" });
        return null;
      }
      const creds = { email: (data as any).email, password: (data as any).password };
      setLoginCreds(creds);
      return creds;
    } catch (err: any) {
      toast({ title: "Erro ao gerar acesso", description: err?.message, variant: "destructive" });
      return null;
    } finally {
      setLoadingLogin(false);
    }
  };

  const copyStudentLogin = async () => {
    const creds = await fetchLoginCreds();
    if (!creds) return;
    const msg = buildLoginMessage(creds);
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = msg; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopiedLogin(true);
    setTimeout(() => setCopiedLogin(false), 1800);
    toast({ title: "Login copiado!", description: "Email, senha e link prontos pra colar no chat do aluno." });
  };

  const sendStudentLoginWhatsApp = async () => {
    if (!waDigits(student?.whatsapp || student?.phone)) {
      toast({ title: "Sem WhatsApp", description: "Cadastre o WhatsApp do aluno para enviar.", variant: "destructive" });
      return;
    }
    const creds = await fetchLoginCreds();
    if (!creds) return;
    await openStudentChat({
      navigate,
      routePrefix: role === "master" ? "admin" : role || "admin",
      studentId: student?.id,
      phone: student?.whatsapp || student?.phone,
      message: buildLoginMessage(creds),
      onNoChat: (message) => {
        void navigator.clipboard?.writeText(message);
        toast({ title: "Mensagem copiada", description: "O aluno não possui telefone válido cadastrado." });
      },
    });
  };

  // CEP ↔ endereço automático no editar aluno
  const fillFromCepStudent = async (cepValue: string) => {
    const r = await lookupCep(cepValue);
    if (!r) return;
    setStudentForm((f) => ({
      ...f,
      cep: formatCEP(r.cep),
      address: r.logradouro || f.address,
      neighborhood: r.bairro || f.neighborhood,
      city: r.cidade || f.city,
      state: r.uf || f.state,
    }));
  };
  const fillCepFromAddressStudent = async () => {
    if (studentForm.cep.replace(/\D/g, "").length === 8) return;
    const r = await lookupCepByAddress(studentForm.state, studentForm.city, studentForm.address);
    if (r?.cep) setStudentForm((f) => ({ ...f, cep: formatCEP(r.cep), neighborhood: f.neighborhood || r.bairro }));
  };

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  const loadData = async (studentId: string) => {
    setLoading(true);

    const { data: studentData } = await supabase
      .from("students").select("*").eq("id", studentId).single();

    if (!studentData) { setLoading(false); return; }
    setStudent(studentData as Student);

    // Load trainer name — will be set after enrollments load (uses active enrollment trainer)
    setTrainerName(null);

    setPreRegistrationLoading(true);
    try {
      setPreRegistration(await loadStudentPreRegistration({
        studentId,
        companyId: studentData.company_id,
        phone: studentData.whatsapp || studentData.phone,
      }));
    } catch (error) {
      console.error("Falha ao carregar pré-cadastro do aluno:", error);
      setPreRegistration(null);
    } finally {
      setPreRegistrationLoading(false);
    }

    const { data: enrollmentData } = await supabase
      .from("enrollments").select("*").eq("student_id", studentId)
      .order("start_date", { ascending: false });

    if (!enrollmentData || enrollmentData.length === 0) {
      setEnrollments([]);
      setCycles([]);
      setLoading(false);
      loadEvaluations(studentId);
      loadAsaasPayments(studentId);
      return;
    }

    const planIds = [...new Set(enrollmentData.map((e) => e.plan_id))];
    const trainerIds = [...new Set(enrollmentData.map((e) => e.trainer_id).filter((id): id is string => !!id))];

    const [{ data: plansData }, { data: profiles }] = await Promise.all([
      supabase.from("plans").select("id, name, duration_weeks, duration_days").in("id", planIds),
      trainerIds.length > 0
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", trainerIds)
        : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] }),
    ]);

    const planMap = new Map((plansData || []).map((p) => [p.id, p]));
    const trainerMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));

    const enrichedEnrollments: Enrollment[] = enrollmentData.map((e: any) => ({
      ...e,
      plan_name: planMap.get(e.plan_id)?.name || "Plano desconhecido",
      plan_duration: planMap.get(e.plan_id)?.duration_weeks,
      trainer_name: trainerMap.get(e.trainer_id) || "Treinador desconhecido",
    }));
    setEnrollments(enrichedEnrollments);

    // Set header trainer from active enrollment, fallback to assigned_trainer_id
    const activeEnrollment = enrichedEnrollments.find(e => e.status === "active" || e.status === "awaiting_training" || e.status === "awaiting_renewal") || enrichedEnrollments[0];
    if (activeEnrollment) {
      setTrainerName(trainerMap.get(activeEnrollment.trainer_id) || null);
    } else if (studentData.assigned_trainer_id) {
      const { data: fallbackProfile } = await supabase
        .from("profiles").select("full_name").eq("user_id", studentData.assigned_trainer_id).maybeSingle();
      setTrainerName(fallbackProfile?.full_name || null);
    }

    const enrollmentIds = enrollmentData.map((e) => e.id);
    const { data: cycleData } = await supabase
      .from("training_cycles").select("*").in("enrollment_id", enrollmentIds).order("end_date", { ascending: true });

    if (!cycleData || cycleData.length === 0) {
      setCycles([]);
      setLoading(false);
      loadEvaluations(studentId);
      loadAsaasPayments(studentId);
      return;
    }

    const cycleIds = cycleData.map((c) => c.id);
    const { data: workouts } = await supabase.from("workouts").select("id, cycle_id, title, name, exercises, sort_order").in("cycle_id", cycleIds);
    const materializedWorkouts = filterMaterializedWorkouts(workouts || []);
    const workoutCycleIds = new Set(materializedWorkouts.map((w) => w.cycle_id));
    const prescribedCycleIds = new Set(workoutCycleIds);
    cycleData.forEach((cycle) => {
      if (cycle.prescribed_offline_at) prescribedCycleIds.add(cycle.id);
    });
    setAllWorkouts(materializedWorkouts);

    setCycles(cycleData.map((c) => ({ ...c, has_workout: workoutCycleIds.has(c.id) })));

    // Auto-fix: if enrollment is "awaiting_training" but already has workouts, update to "active"
    const awaitingEnrollments = enrollmentData.filter((e: any) => e.status === "awaiting_training");
    for (const enrollment of awaitingEnrollments) {
      const enrollmentCycles = cycleData.filter((c) => c.enrollment_id === enrollment.id);
      const allCyclesHaveWorkouts = enrollmentCycles.length > 0 && enrollmentCycles.every((c) => prescribedCycleIds.has(c.id));
      if (allCyclesHaveWorkouts) {
        await supabase.from("enrollments").update({ status: "active" }).eq("id", enrollment.id);
        // Update local state
        const idx = enrichedEnrollments.findIndex((e) => e.id === enrollment.id);
        if (idx !== -1) enrichedEnrollments[idx].status = "active";
      }
    }
    setEnrollments([...enrichedEnrollments]);

    setLoading(false);
    loadEvaluations(studentId);
    loadAsaasPayments(studentId);
  };

  const loadEvaluations = async (studentId: string) => {
    const { data } = await supabase
      .from("student_evaluations").select("*").eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map((e: any) => e.created_by))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
      setEvaluations(data.map((e: any) => ({ ...e, created_by_name: profileMap.get(e.created_by) || "—" })));
    } else {
      setEvaluations([]);
    }
  };

  const loadAsaasPayments = async (studentId: string) => {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    setAsaasPayments((data as AsaasPayment[]) || []);
  };

  const refreshAsaasPaymentStatus = async (paymentId: string) => {
    setRefreshingPayment(paymentId);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-integration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "get-payment-status", paymentId }),
      });
      const data = await res.json();
      if (data.status) {
        setAsaasPayments(prev => prev.map(p => p.asaas_payment_id === paymentId ? { ...p, status: data.status } : p));
        toast({ title: `Status atualizado: ${data.status}` });
      }
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
    setRefreshingPayment(null);
  };

  // Load plans and trainers for the enrollment dialog
  const loadEnrollmentOptions = async () => {
    const [{ data: plansData }, { data: rolesData }] = await Promise.all([
      supabase.from("plans").select("id, name, duration_weeks, duration_days").eq("is_active", true).order("name"),
      supabase.from("user_roles").select("user_id, role").in("role", ["admin", "coordinator", "trainer"]),
    ]);
    setPlans(plansData || []);
    if (rolesData && rolesData.length > 0) {
      const trainerUserIds = rolesData.map((r) => r.user_id);
      const { data: profilesData } = await supabase.from("profiles").select("user_id, full_name").in("user_id", trainerUserIds);
      setTrainers((profilesData || []).map((p) => ({ user_id: p.user_id, full_name: p.full_name || "Sem nome" })));
    } else {
      setTrainers([]);
    }
  };

  const openEnrollDialog = () => {
    setSelectedPlanId(student?.selected_plan_id || "");
    setSelectedTrainerId("");
    setStartDate(new Date());
    loadEnrollmentOptions();
    setEnrollOpen(true);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const computedEndDate = selectedPlan
    ? addDays(startDate, (selectedPlan.duration_days || (selectedPlan.duration_weeks ?? 4) * 7) - 1)
    : null;

  // Atribuir/trocar treinador direto do perfil (grava na MATRÍCULA e sincroniza o aluno).
  const handleAssignTrainerInline = async (enrollmentId: string, trainerId: string) => {
    if (!trainerId || !id) return;
    const { error } = await supabase.from("enrollments").update({ trainer_id: trainerId }).eq("id", enrollmentId);
    if (error) {
      toast({ title: "Erro ao atribuir treinador", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("students").update({ assigned_trainer_id: trainerId }).eq("id", id);
    toast({ title: "Treinador atribuído!" });
    loadData(id);
  };

  // Seletor inline de treinador — substitui o "Treinador desconhecido" estático.
  const TrainerInlineSelect = ({ enrollmentId, trainerId, trainerName }: { enrollmentId: string; trainerId: string | null; trainerName?: string }) => (
    <Select value={trainerId || ""} onValueChange={(v) => handleAssignTrainerInline(enrollmentId, v)}>
      <SelectTrigger className="h-6 w-auto min-w-[150px] border-dashed px-2 py-0 text-xs gap-1 [&>svg]:h-3 [&>svg]:w-3">
        <Dumbbell className="h-3 w-3 shrink-0" />
        <SelectValue placeholder="Selecionar treinador">
          {trainerId && trainerName && trainerName !== "Treinador desconhecido" ? trainerName : "Selecionar treinador"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {trainers.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const handleCreateEnrollment = async () => {
    if (!selectedPlanId || !selectedTrainerId || !id || !session?.user?.id || !computedEndDate) return;
    setSaving(true);
    const { error } = await supabase.from("enrollments").insert({
      student_id: id,
      plan_id: selectedPlanId,
      trainer_id: selectedTrainerId,
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(computedEndDate, "yyyy-MM-dd"),
    });
    if (error) {
      setSaving(false);
      toast({ title: "Erro ao criar matrícula", description: error.message, variant: "destructive" });
      return;
    }
    // Sync assigned_trainer_id on student
    await supabase.from("students").update({ assigned_trainer_id: selectedTrainerId }).eq("id", id);
    setSaving(false);
    toast({ title: "Matrícula criada com sucesso!" });
    setEnrollOpen(false);
    loadData(id);
  };

  // ---- EDIT STUDENT ----
  const openEditStudent = () => {
    if (!student) return;
    setStudentForm({
      full_name: student.full_name, email: student.email || "", phone: student.phone || "",
      birth_date: student.birth_date || "", cpf: student.cpf ? formatCPF(student.cpf) : "",
      cep: student.cep ? formatCEP(student.cep) : "", address: student.address || "",
      address_number: student.address_number || "", neighborhood: student.neighborhood || "",
      city: student.city || "", state: student.state || "",
      whatsapp: student.whatsapp ? formatPhone(student.whatsapp) : "", status: student.status, notes: student.notes || "",
    });
    setEditStudentOpen(true);
  };

  const handleSaveStudent = async () => {
    if (!id || !studentForm.full_name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("students").update({
      full_name: studentForm.full_name.trim(), email: studentForm.email.trim() || null,
      phone: studentForm.phone.trim() || null, birth_date: studentForm.birth_date || null,
      cpf: studentForm.cpf.replace(/\D/g, "") || null, cep: studentForm.cep.replace(/\D/g, "") || null,
      address: studentForm.address.trim() || null, address_number: studentForm.address_number.trim() || null,
      neighborhood: studentForm.neighborhood.trim() || null, city: studentForm.city.trim() || null,
      state: studentForm.state.trim() || null,
      whatsapp: studentForm.whatsapp.replace(/\D/g, "") || null,
      status: studentForm.status, notes: studentForm.notes.trim() || null,
    }).eq("id", id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    // Sync address to Asaas
    try {
      await supabase.functions.invoke("asaas-integration", {
        body: {
          action: "update-customer", studentId: id,
          name: studentForm.full_name.trim(), email: studentForm.email.trim() || undefined,
          mobilePhone: studentForm.whatsapp.replace(/\D/g, "") || undefined,
          postalCode: studentForm.cep.replace(/\D/g, "") || undefined,
          address: studentForm.address.trim() || undefined,
          addressNumber: studentForm.address_number.trim() || undefined,
          province: studentForm.neighborhood.trim() || undefined,
        },
      });
    } catch (e) { console.error("Erro ao sincronizar com Asaas:", e); }
    toast({ title: "Dados atualizados!" });
    setEditStudentOpen(false);
    loadData(id);
  };

  // ---- FINANCIAL ----
  const openFinancialEdit = (enrollment: Enrollment) => {
    setFinancialEnrollment(enrollment);
    setFinancialForm({
      payment_status: enrollment.payment_status || "pending",
      payment_date: enrollment.payment_date || "",
      payment_method: enrollment.payment_method || "",
      financial_notes: enrollment.financial_notes || "",
    });
    setFinancialOpen(true);
  };

  const handleSaveFinancial = async () => {
    if (!financialEnrollment) return;
    setSaving(true);
    const { error } = await supabase.from("enrollments").update({
      payment_status: financialForm.payment_status || "pending",
      payment_date: financialForm.payment_date || null,
      payment_method: financialForm.payment_method || null,
      financial_notes: financialForm.financial_notes || null,
    }).eq("id", financialEnrollment.id);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Dados financeiros atualizados!" });
    setFinancialOpen(false);
    loadData(id!);
  };

  // ---- EVALUATIONS ----
  const handleFileUpload = async (file: File, type: "photo" | "audio") => {
    if (!id || !session?.user?.id) return;
    const cid = student?.company_id;
    if (!cid) { toast({ title: "Aluno sem empresa", variant: "destructive" }); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${cid}/${id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("evaluations").upload(path, file);
    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // Use signed URL instead of public URL (bucket is private)
    const { data: signedData, error: signedError } = await supabase.storage
      .from("evaluations")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

    if (signedError || !signedData?.signedUrl) {
      toast({ title: "Erro ao gerar URL", description: signedError?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error } = await supabase.from("student_evaluations").insert({
      student_id: id,
      created_by: session.user.id,
      company_id: student?.company_id,
      type,
      file_url: signedData.signedUrl,
    });

    setUploading(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${type === "photo" ? "Foto" : "Áudio"} adicionado!` });
    loadEvaluations(id);
  };

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([audioBlob], `gravacao_${Date.now()}.webm`, { type: "audio/webm" });
        await handleFileUpload(file, "audio");
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast({ title: "Erro ao acessar microfone", description: "Verifique as permissões do navegador.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSaveTextEval = async () => {
    if (!id || !session?.user?.id || !evalNotes.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("student_evaluations").insert({
      student_id: id, created_by: session.user.id, company_id: student?.company_id, type: "text", notes: evalNotes.trim(),
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Nota adicionada!" });
    setEvalNotes("");
    loadEvaluations(id);
  };

  // Build calendar modifiers: Prescrever (yellow), Entregue (green), Vencido sem treino (red)
  const buildCalendarDays = () => {
    const prescribeDays: Date[] = [];
    const doneDays: Date[] = [];
    const expiredDays: Date[] = [];

    cycles.forEach((cycle) => {
      const start = parseISO(cycle.start_date);
      const end = parseISO(cycle.end_date);
      const days = eachDayOfInterval({ start, end });
      const isExpiredNoWorkout = cycle.status === "completed" && !isCyclePrescribed(cycle);

      if (isExpiredNoWorkout) expiredDays.push(...days);
      else if (isCyclePrescribed(cycle)) doneDays.push(...days);
      else prescribeDays.push(...days);
    });

    return { prescribeDays, doneDays, expiredDays };
  };

  const { prescribeDays, doneDays, expiredDays } = buildCalendarDays();

  const renderWorkoutCycles = () => {
    const activeEnroll = enrollments.find(e => e.status === "active" || e.status === "awaiting_training" || e.status === "awaiting_renewal");
    if (!activeEnroll) return <p className="text-muted-foreground font-sans text-sm text-center py-8">Nenhuma matrícula ativa.</p>;
    const enrollCycles = cycles.filter(c => c.enrollment_id === activeEnroll.id);
    if (enrollCycles.length === 0) {
      return (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-sans">Nenhum ciclo de treino criado.</p>
            <p className="text-xs text-muted-foreground/60 font-sans mt-1">Defina a data de início do treino na matrícula do aluno.</p>
          </CardContent>
        </Card>
      );
    }
    const prefix = role === "master" ? "/admin" : role ? `/${role}` : "/admin";
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-primary text-lg font-display">TREINOS DO PROGRAMA</h2>
          <BnitoContextButton
            label="treinos do programa"
            context={`Treinos e ciclos materializados do aluno ${student?.full_name || "selecionado"}.`}
            question="Como posso revisar a continuidade entre estes ciclos de treino?"
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {enrollCycles.map(cycle => {
            const cycleWorkouts = (allWorkouts || []).filter((w: any) => w.cycle_id === cycle.id);
            return (
              <Card key={cycle.id} className="bg-card border-border">
                <CardContent className="p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-primary font-mono-data font-semibold text-xs">
                        CICLO {cycle.cycle_number}
                      </h3>
                      <Badge
                        variant={cycle.status === "active" ? "default" : "outline"}
                        className="text-[10px] shrink-0"
                      >
                        {cycle.status === "active" ? "Ativo" : cycle.status === "completed" ? "Concluído" : "Futuro"}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-sans shrink-0">
                      {safeFormatDate(cycle.start_date, "dd/MM", { locale: ptBR })} — {safeFormatDate(cycle.end_date, "dd/MM", { locale: ptBR })}
                    </span>
                  </div>

                  {cycleWorkouts.length > 0 ? (
                    <div className="space-y-1.5">
                      {cycleWorkouts.map((w: any) => {
                        const exercises = (w.exercises as any[]) || [];
                        return (
                          <div key={w.id} className="flex items-center justify-between gap-2 bg-secondary/30 rounded-xl px-2.5 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-xs font-sans text-foreground truncate">{w.title || `Treino ${w.name}`}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">{exercises.length} ex.</Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {cycle.prescribed_offline_at ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <span className="text-xs font-sans">Prescrito fora do app</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4" />
                          <span className="text-xs font-sans">Nenhum treino prescrito</span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={cycleWorkouts.length > 0 ? "outline" : "default"}
                      className="h-7 text-xs"
                      onClick={() => navigate(`${prefix}/workout/${cycle.id}`)}
                    >
                      {cycleWorkouts.length > 0 ? (
                        <><Edit className="h-3.5 w-3.5 mr-1" />Editar</>
                      ) : (
                        <><Plus className="h-3.5 w-3.5 mr-1" />Prescrever</>
                      )}
                    </Button>
                  </div>

                  {cycleWorkouts.length > 0 && (
                    <Suspense fallback={<InlineFallback />}>
                      <div className="grid grid-cols-1 gap-3 pt-2 border-t border-border/50">
                        {cycleWorkouts.map((w: any) => {
                          const exercises = (w.exercises as any[]) || [];
                          const muscleVolumes = exercises.reduce((acc: any[], ex: any) => {
                            const mg = ex.muscle_group || "Outro";
                            const sets = parseInt(ex.sets) || 0;
                            const existing = acc.find((a: any) => a.muscleGroup === mg);
                            if (existing) existing.volume += sets;
                            else acc.push({ muscleGroup: mg, volume: sets });
                            return acc;
                          }, []);
                          return (
                            <div key={w.id} className="space-y-2">
                              <p className="text-xs font-sans font-medium text-muted-foreground truncate">{w.title || `Treino ${w.name}`}</p>
                              <MuscleRadar muscleVolumes={muscleVolumes} />
                            </div>
                          );
                        })}
                      </div>
                    </Suspense>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!student) {
    return (
      <>
        <div className="text-center py-20">
          <p className="text-muted-foreground font-sans">Aluno não encontrado</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/students")}>
            <ArrowLeft className="h-4 w-4 mr-2" />Voltar
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/students")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl text-primary truncate">{student.full_name.toUpperCase()}</h1>
              <Badge variant="outline" className={`text-xs ${statusColors[student.status]}`}>
                {statusLabels[student.status] || student.status}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-sans mt-1">
              {student.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{student.email}</span>}
              {student.whatsapp && <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatPhone(student.whatsapp)}</span>}
              {trainerName && <span className="flex items-center gap-1"><Dumbbell className="h-3 w-3" />{trainerName}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <BnitoContextButton
              label={`perfil de ${student.full_name}`}
              context={`Detalhe do aluno. Status: ${student.status}. Treinador: ${trainerName || "nao definido"}. Matriculas: ${enrollments.length}. Ciclos: ${cycles.length}.`}
              question="Me ajude a identificar os principais riscos e proximos passos deste aluno."
            />
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleActivateStudentAccess}
              disabled={activatingAccess || !student.email}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">{activatingAccess ? "Ativando..." : "Ativar Acesso"}</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEditStudent}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 pb-2">
            {STUDENT_TABS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 rounded-full border border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary/30 data-[state=active]:bg-secondary data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ===== VISÃO GERAL ===== */}
          <TabsContent value="overview" className="space-y-4">
            {id && student?.company_id && (
              <WeeklyContactToggle studentId={id} initial={(student as { weekly_contact_enabled?: boolean })?.weekly_contact_enabled} />
            )}
            {/* Acesso do app: copiar login (email+senha+link) ou enviar no WhatsApp */}
            <CollapsibleCard title="ACESSO DO APP" icon={<KeyRound className="h-4 w-4" />} className="mb-4" contentClassName="space-y-3">
                <p className="text-xs text-muted-foreground font-sans">
                  Abra a conversa interna com o login pronto ou copie a mensagem. Ao gerar, uma senha nova é definida.
                </p>
                {loginCreds && (
                  <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1.5 text-sm font-mono-data break-all">
                    <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary shrink-0" /> {loginCreds.email}</div>
                    <div className="flex items-center gap-2"><KeyRound className="h-3.5 w-3.5 text-primary shrink-0" /> {loginCreds.password}</div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs"><Link className="h-3.5 w-3.5 shrink-0" /> {studentLoginUrl}</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={sendStudentLoginWhatsApp}
                    disabled={loadingLogin}
                    className="bg-[#25D366] text-white hover:bg-[#25D366]/90"
                  >
                    <MessageCircle className="h-4 w-4 mr-1.5" />
                    {loadingLogin ? "Gerando..." : "Abrir conversa"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyStudentLogin} disabled={loadingLogin}>
                    {copiedLogin ? <Check className="h-4 w-4 mr-1.5 text-green-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
                    {loadingLogin ? "Gerando..." : "Copiar login"}
                  </Button>
                </div>
            </CollapsibleCard>
            {id && student?.company_id && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <details className="rounded-2xl border border-border bg-card p-4 group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-eyebrow">
                    Linha do tempo
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3">
                    <StudentTimeline studentId={id} />
                  </div>
                </details>
                <StudentFilesPanel studentId={id} companyId={student.company_id} />
              </div>
            )}
            {id && <StudentCycleFeedbackCard studentId={id} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Active enrollment + cycles + notes */}
              <div className="space-y-4">
                {/* Active enrollment summary */}
                {enrollments.length > 0 && (() => {
                  const active = enrollments.find(e => e.status === "active" || e.status === "awaiting_training" || e.status === "awaiting_renewal") || enrollments[0];
                  return (
                      <Card className="bg-card border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-primary text-lg">
                          MATRÍCULA ATIVA
                          <BnitoContextButton
                            label="matricula ativa do aluno"
                            context={`Matricula ativa do aluno ${student.full_name}. Plano: ${active.plan_name}. Status: ${active.status}. Treinador: ${active.trainer_name || "sem treinador"}.`}
                            question="O que devo revisar nesta matricula antes de prescrever ou renovar?"
                            className="ml-auto"
                          />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm font-sans">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{active.plan_name}</span>
                          <Badge variant="outline" className={`text-xs ${statusColors[active.status]}`}>
                            {statusLabels[active.status] || active.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <TrainerInlineSelect enrollmentId={active.id} trainerId={active.trainer_id} trainerName={active.trainer_name} />
                          <span><CalendarDays className="h-3 w-3 inline mr-1" />{safeFormatDate(active.start_date, "dd/MM/yyyy")} → {safeFormatDate(active.end_date, "dd/MM/yyyy")}</span>
                        </div>
                        {cycles.filter(c => c.enrollment_id === active.id).length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs font-medium text-foreground">Ciclos:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {cycles.filter(c => c.enrollment_id === active.id).map(c => (
                              <div key={c.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-xl bg-secondary/40 border border-border">
                                <span className="truncate">C{c.cycle_number} · {safeFormatDate(c.start_date, "dd/MM")} a {safeFormatDate(c.end_date, "dd/MM/yy")}</span>
                                <div className="flex items-center gap-1">
                                  {c.has_workout ? (
                                    <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">Treino</Badge>
                                  ) : c.prescribed_offline_at ? (
                                    <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">Fora do app</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">Sem treino</Badge>
                                  )}
                                </div>
                              </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Personal details */}
                <CollapsibleCard title="DADOS PESSOAIS" action={
                  <BnitoContextButton
                    label="dados pessoais do aluno"
                    context="Dados de contato, idade, CPF, endereco e observacoes que impactam cobranca, acesso e rotina."
                    question="Quais dados deste cadastro podem impactar cobranca, acesso ou acompanhamento?"
                  />
                }>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-sans">
                      {student.birth_date && <div className="flex items-center gap-2 text-muted-foreground"><Cake className="h-4 w-4" />{safeFormatDate(student.birth_date, "dd/MM/yyyy")}</div>}
                      {student.cpf && <div className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-4 w-4" />{formatCPF(student.cpf)}</div>}
                      {student.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{formatPhone(student.phone)}</div>}
                      {student.cep && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />CEP: {formatCEP(student.cep)}</div>}
                    </div>
                    {(student.address || student.neighborhood || student.city) && (
                      <p className="text-sm text-muted-foreground font-sans mt-2 flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                        {[student.address, student.address_number ? `nº ${student.address_number}` : null, student.neighborhood, student.city, student.state].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {student.notes && (
                      <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border">
                        <p className="text-xs font-sans font-medium text-foreground mb-1">Observações:</p>
                        <p className="text-xs text-muted-foreground font-sans whitespace-pre-wrap">{student.notes}</p>
                      </div>
                    )}
                </CollapsibleCard>
              </div>

              {/* Right: WeeklyBar + quick summary */}
              <div className="space-y-4">
                <Suspense fallback={<InlineFallback />}><TrainerWeeklyBar studentId={id!} /></Suspense>
                {enrollments.length === 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground font-sans text-sm">Nenhuma matrícula encontrada.</p>
                      <Button size="sm" className="mt-3" onClick={openEnrollDialog}><Plus className="h-4 w-4 mr-1" />Nova Matrícula</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ===== PROGRAMA DE TREINO ===== */}
          <TabsContent value="program" className="space-y-4">
            {/* Provas e metas alvo (aparecem no calendário do aluno e na agenda) */}
            {id && (
              <StudentGoalsManager
                studentId={id}
                companyId={student?.company_id}
                createdBy={session?.user?.id}
              />
            )}
            {id && <AssessmentCompareCard studentId={id} />}
            {id && <PlanVersionsCard studentId={id} />}

            {/* Enrollments */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-primary text-lg">
                  MATRÍCULAS
                  <BnitoContextButton
                    label="programa e matriculas do aluno"
                    context={`Matriculas, datas de treino, ciclos e status de prescricao do aluno ${student.full_name}.`}
                    question="Como devo organizar os ciclos e proximas prescricoes deste aluno?"
                  />
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const link = await createPlansLink(id!);
                      try { await navigator.clipboard.writeText(link); } catch {
                        const ta = document.createElement("textarea");
                        ta.value = link; ta.style.position = "fixed"; ta.style.left = "-9999px";
                        document.body.appendChild(ta); ta.focus(); ta.select();
                        document.execCommand("copy"); document.body.removeChild(ta);
                      }
                      toast({ title: "Link de pagamento copiado!", description: "O link é seguro e válido por 30 dias." });
                    } catch (error) {
                      toast({
                        title: "Erro ao criar link de pagamento",
                        description: error instanceof Error ? error.message : "Tente novamente.",
                        variant: "destructive",
                      });
                    }
                  }}>
                    <Copy className="h-4 w-4 mr-1" />Link de Pagamento
                  </Button>
                  <Button size="sm" onClick={openEnrollDialog}><Plus className="h-4 w-4 mr-1" />Nova Matrícula</Button>
                </div>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-muted-foreground font-sans text-sm">Nenhuma matrícula encontrada.</p>
                ) : (
                  <div className="space-y-4">
                    {enrollments.map((e) => (
                      <div key={e.id} className="p-3 rounded-2xl bg-secondary/50 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-sans font-medium text-foreground">{e.plan_name}</span>
                          <Badge variant="outline" className={`text-xs ${statusColors[e.status]}`}>
                            {statusLabels[e.status] || e.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-sans">
                          <TrainerInlineSelect enrollmentId={e.id} trainerId={e.trainer_id} trainerName={e.trainer_name} />
                          <span><CalendarDays className="h-3 w-3 inline mr-1" />{safeFormatDate(e.start_date, "dd/MM/yyyy")} → {safeFormatDate(e.end_date, "dd/MM/yyyy")}</span>
                          {e.plan_duration && <span>{e.plan_duration} semanas</span>}
                        </div>

                        {/* Training Start Date */}
                        <div className="flex items-center gap-3 mt-2 p-2 rounded bg-background border border-border flex-wrap">
                          <span className="text-xs font-sans font-medium text-foreground whitespace-nowrap">Início do treino:</span>
                          {e.training_start_date ? (
                            <span className="text-xs font-sans text-muted-foreground">
                              {safeFormatDate(e.training_start_date, "dd/MM/yyyy")}
                            </span>
                          ) : (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 text-xs">
                                  <CalendarIcon className="h-3 w-3 mr-1" />Definir data
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  onSelect={async (date) => {
                                    if (!date) return;
                                    const dateStr = format(date, "yyyy-MM-dd");
                                    const { error } = await supabase.from("enrollments").update({
                                      training_start_date: dateStr,
                                      status: "awaiting_training",
                                    }).eq("id", e.id);
                                    if (error) {
                                      toast({ title: "Erro ao definir data", description: error.message, variant: "destructive" });
                                    } else {
                                      toast({ title: "Data de início do treino definida! Ciclos gerados." });
                                      loadData(id!);
                                    }
                                  }}
                                  locale={ptBR}
                                  className="pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>

                        {cycles.filter((c) => c.enrollment_id === e.id).length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-sans font-medium text-foreground">Ciclos de treino:</p>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                              {cycles.filter((c) => c.enrollment_id === e.id).map((c) => (
                                <div key={c.id} className="flex flex-wrap items-center justify-between px-2 py-1.5 rounded-xl bg-background border border-border text-xs font-sans gap-1.5">
                                  <span className="min-w-0 truncate text-[11px] sm:text-xs">C{c.cycle_number} · {safeFormatDate(c.start_date, "dd/MM")} a {safeFormatDate(c.end_date, "dd/MM/yy")}</span>
                                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    {c.has_workout ? (
                                      <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">Treino</Badge>
                                    ) : c.prescribed_offline_at ? (
                                      <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">Fora do app</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">Sem treino</Badge>
                                    )}
                                    <Badge variant="outline" className={`text-[10px] ${statusColors[c.status]}`}>
                                      {statusLabels[c.status] || c.status}
                                    </Badge>
                                    {(role === "trainer" || role === "admin" || role === "master" || role === "coordinator") && (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-5 text-[10px] px-2"
                                          onClick={() => {
                                            const basePath = role === "coordinator" ? "/coordinator" : role === "trainer" ? "/trainer" : "/admin";
                                            const returnPath = `${basePath}/students/${id}`;
                                            navigate(`${basePath}/workout/${c.id}?returnTo=${encodeURIComponent(returnPath)}`);
                                          }}
                                        >
                                          <Dumbbell className="h-3 w-3 mr-1" />
                                          {c.has_workout ? "Editar Treino" : "Prescrever"}
                                        </Button>
                                        {!isCyclePrescribed(c) && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-5 text-[10px] px-2 text-success border-success/30 hover:bg-success/10"
                                            onClick={async () => {
                                              if (!session?.user?.id) return;
                                              // Idempotente: se o ciclo já tem treino materializado, apenas recarrega.
                                              const { data: existing } = await supabase
                                                .from("workouts")
                                                .select("id, exercises")
                                                .eq("cycle_id", c.id)
                                                .limit(20);
                                              if (filterMaterializedWorkouts(existing || []).length > 0) {
                                                toast({ title: "Esse ciclo já possui treino." });
                                                if (id) loadData(id);
                                                return;
                                              }
                                              const offlineUpdate: TrainingCycleUpdate = {
                                                prescribed_offline_at: new Date().toISOString(),
                                                prescribed_offline_by: session.user.id,
                                              };
                                              const { error } = await supabase
                                                .from("training_cycles")
                                                .update(offlineUpdate)
                                                .eq("id", c.id);
                                              if (error) {
                                                toast({ title: "Erro ao marcar como prescrito", description: error.message, variant: "destructive" });
                                              } else {
                                                toast({ title: "Ciclo marcado como prescrito fora do app." });
                                                if (id) loadData(id);
                                              }
                                            }}
                                          >
                                            <Check className="h-3 w-3 mr-1" />
                                            Feito
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                    {c.cycle_number === 1 && (role === "admin" || role === "master" || role === "coordinator") && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2">
                                            <CalendarIcon className="h-3 w-3 mr-0.5" />Alterar data
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                          <Calendar
                                            mode="single"
                                            onSelect={async (date) => {
                                              if (!date) return;
                                              const dateStr = format(date, "yyyy-MM-dd");
                                              const { error } = await supabase.rpc("recalculate_training_cycles", {
                                                p_enrollment_id: e.id,
                                                p_new_start_date: dateStr,
                                              });
                                              if (error) {
                                                toast({ title: "Erro ao recalcular ciclos", description: error.message, variant: "destructive" });
                                              } else {
                                                toast({ title: "Ciclos recalculados com sucesso!" });
                                                loadData(id!);
                                              }
                                            }}
                                            locale={ptBR}
                                            className="pointer-events-auto"
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {renderWorkoutCycles()}

            {/* Calendar */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary text-lg">
                  CALENDÁRIO DE CICLOS
                  <BnitoContextButton
                    label="calendario de ciclos"
                    context={`Calendario de ciclos do aluno ${student.full_name}; dias de prescrever, entregue e vencido sem treino.`}
                    question="Como devo interpretar este calendario de ciclos e atrasos?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cycles.length > 0 && (
                  <div className="flex flex-wrap gap-4 mb-4 text-xs font-sans">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: cycleCalendarColors.prescribe.bg, border: `1px solid ${cycleCalendarColors.prescribe.text}` }} />Prescrever</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: cycleCalendarColors.done.bg, border: `1px solid ${cycleCalendarColors.done.text}` }} />Entregue</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: cycleCalendarColors.expired_no_workout.bg, border: `1px solid ${cycleCalendarColors.expired_no_workout.text}` }} />Vencido sem treino</span>
                  </div>
                )}
                {cycles.length === 0 && <p className="text-muted-foreground font-sans text-sm mb-4">Nenhum ciclo de treino ainda.</p>}
                <Calendar
                  mode="single" month={calendarMonth} onMonthChange={setCalendarMonth} locale={ptBR} className="pointer-events-auto"
                  modifiers={{ prescribeCycle: prescribeDays, doneCycle: doneDays, expiredCycle: expiredDays }}
                  modifiersStyles={{
                    prescribeCycle: { backgroundColor: cycleCalendarColors.prescribe.bg, color: cycleCalendarColors.prescribe.text, borderRadius: "4px" },
                    doneCycle: { backgroundColor: cycleCalendarColors.done.bg, color: cycleCalendarColors.done.text, borderRadius: "4px" },
                    expiredCycle: { backgroundColor: cycleCalendarColors.expired_no_workout.bg, color: cycleCalendarColors.expired_no_workout.text, borderRadius: "4px" },
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ANÁLISES ===== */}
          <TabsContent value="analytics" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              <TrainerWeeklyBar studentId={id!} />
              <WorkoutAnalysis studentId={id!} />
              <StudentVolumePanel studentId={id!} />
            </Suspense>
            <ProgressPhotosPanel studentId={id!} />
          </TabsContent>

          {/* ===== ANAMNESE ===== */}
          <TabsContent value="anamnesis">
            <Card className="rounded-3xl border-border bg-card">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-primary">
                  ANAMNESE
                  <Badge variant="outline" className="rounded-full text-[10px] font-mono-data">
                    Pré-cadastro
                  </Badge>
                  <BnitoContextButton
                    label="anamnese do aluno"
                    context={`Pré-cadastro de ${student.full_name}: fonte oficial de objetivos, dores, lesões, rotina, sono, equipamentos, modalidades solicitadas e restrições para a prescrição.`}
                    question="Quais respostas deste pré-cadastro devem mudar a prescrição?"
                  />
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  As respostas abaixo são as mesmas usadas pelo Studio Integrado e pelos motores de prescrição.
                </p>
              </CardHeader>
              <CardContent>
                <PreRegistrationDetails data={preRegistration} loading={preRegistrationLoading} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== FINANCEIRO ===== */}
          <TabsContent value="financial">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-primary text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />FINANCEIRO
                  <BnitoContextButton
                    label="financeiro do aluno"
                    context={`Financeiro do aluno ${student.full_name}: matriculas, pagamentos, Asaas, links e status de cobranca.`}
                    question="O que preciso regularizar no financeiro antes de seguir com este aluno?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-muted-foreground font-sans text-sm">Nenhuma matrícula para rastrear pagamento.</p>
                ) : (
                  <div className="space-y-3">
                    {enrollments.map((e) => (
                      <div key={e.id} className="p-3 rounded-lg bg-secondary/50 border border-border flex items-center justify-between">
                        <div>
                          <p className="text-sm font-sans font-medium text-foreground">{e.plan_name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground font-sans mt-1">
                            <Badge variant="outline" className={`text-[10px] ${paymentStatusColors[e.payment_status || "pending"]}`}>
                              {paymentStatusLabels[e.payment_status || "pending"]}
                            </Badge>
                            {e.payment_date && <span>Pago em: {safeFormatDate(e.payment_date, "dd/MM/yyyy")}</span>}
                            {e.payment_method && <span>{e.payment_method}</span>}
                          </div>
                          {e.financial_notes && <p className="text-xs text-muted-foreground mt-1">{e.financial_notes}</p>}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => openFinancialEdit(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {asaasPayments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <p className="text-xs font-sans font-medium text-foreground">Cobranças Asaas</p>
                    {asaasPayments.map((p) => (
                      <div key={p.id} className="p-3 rounded-lg bg-secondary/50 border border-border flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {p.billing_type === "PIX" ? "Pix" : "Cartão"}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${
                              p.status === "RECEIVED" || p.status === "CONFIRMED" ? "bg-success/15 text-success border-success/30" :
                              p.status === "PENDING" ? "bg-warning/15 text-warning border-warning/30" :
                              "bg-destructive/15 text-destructive border-destructive/30"
                            }`}>
                              {p.status}
                            </Badge>
                          </div>
                          <p className="text-sm font-sans font-medium text-foreground mt-1">
                            R$ {Number(p.value).toFixed(2).replace(".", ",")}
                          </p>
                          {p.due_date && <p className="text-xs text-muted-foreground font-sans">Vencimento: {safeFormatDate(p.due_date, "dd/MM/yyyy")}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          {p.invoice_url && (
                            <Button variant="ghost" size="icon" asChild>
                              <a href={p.invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => p.asaas_payment_id && refreshAsaasPaymentStatus(p.asaas_payment_id)}
                            disabled={refreshingPayment === p.asaas_payment_id}
                          >
                            <RefreshCw className={`h-4 w-4 ${refreshingPayment === p.asaas_payment_id ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== AVALIAÇÕES ===== */}
          <TabsContent value="evaluations" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              <StudentBodyMap studentId={id!} />
            </Suspense>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-primary text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />AVALIAÇÕES
                  <BnitoContextButton
                    label="avaliacoes do aluno"
                    context={`Avaliacoes do aluno ${student.full_name}: fotos, audios, observacoes e registros que podem influenciar treino.`}
                    question="Como devo transformar estas avaliacoes em ajustes de treino?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "photo")} />
                  <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "audio")} />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading || isRecording}>
                    <Image className="h-4 w-4 mr-1" />Foto
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} disabled={uploading || isRecording}>
                    <Upload className="h-4 w-4 mr-1" />Upload Áudio
                  </Button>
                  {isRecording ? (
                    <Button variant="destructive" size="sm" onClick={stopRecording}>
                      <Square className="h-4 w-4 mr-1" />Parar Gravação
                      <span className="ml-1.5 w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={startRecording} disabled={uploading}>
                      <Mic className="h-4 w-4 mr-1" />Gravar Áudio
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea value={evalNotes} onChange={(e) => setEvalNotes(e.target.value)} placeholder="Adicionar nota de avaliação..." className="bg-secondary border-border" rows={2} />
                  <Button onClick={handleSaveTextEval} disabled={!evalNotes.trim() || saving} className="self-end">Salvar</Button>
                </div>
                {evaluations.length > 0 ? (
                  <div className="space-y-3 mt-4">
                    {evaluations.map((ev) => (
                      <div key={ev.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {ev.type === "photo" ? "📷 Foto" : ev.type === "audio" ? "🎤 Áudio" : "📝 Nota"}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-sans">
                              {format(new Date(ev.created_at), "dd/MM/yyyy HH:mm")} · {ev.created_by_name}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={async () => {
                                if (!confirm("Excluir esta avaliação?")) return;
                                if (ev.file_url) {
                                  const pathMatch = ev.file_url.match(/evaluations\/(.+)\?/);
                                  if (pathMatch) {
                                    await supabase.storage.from("evaluations").remove([pathMatch[1]]);
                                  }
                                }
                                await supabase.from("student_evaluations").delete().eq("id", ev.id);
                                toast({ title: "Avaliação excluída" });
                                if (id) loadEvaluations(id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {ev.type === "photo" && ev.file_url && (
                          <div className="space-y-2">
                            <a href={ev.file_url} target="_blank" rel="noopener noreferrer">
                              <img src={ev.file_url} alt="Avaliação" className="rounded max-h-48 object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                            </a>
                            <a href={ev.file_url} target="_blank" rel="noopener noreferrer" download>
                              <Button variant="ghost" size="sm"><Download className="h-4 w-4 mr-1" />Baixar</Button>
                            </a>
                          </div>
                        )}
                        {ev.type === "audio" && ev.file_url && (
                          <audio controls src={ev.file_url} className="w-full" />
                        )}
                        {ev.notes && <p className="text-sm text-foreground font-sans mt-1">{ev.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground font-sans text-sm">Nenhuma avaliação registrada.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Enrollment Dialog */}
        <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-primary">NOVA MATRÍCULA</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-sans">Plano *</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                  <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.duration_weeks} semanas)</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Treinador *</Label>
                <Select value={selectedTrainerId} onValueChange={setSelectedTrainerId}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione um treinador" /></SelectTrigger>
                  <SelectContent>{trainers.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Data de início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-secondary border-border")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />{format(startDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} locale={ptBR} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              {computedEndDate && (
                <div className="space-y-2">
                  <Label className="font-sans">Data de término (calculada)</Label>
                  <p className="text-sm text-muted-foreground font-sans p-2 rounded bg-secondary border border-border">
                    {format(computedEndDate, "dd/MM/yyyy")} ({selectedPlan?.duration_weeks} semanas)
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateEnrollment} disabled={!selectedPlanId || !selectedTrainerId || saving}>
                {saving ? "Salvando..." : "Criar Matrícula"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Student Dialog */}
        <Dialog open={editStudentOpen} onOpenChange={setEditStudentOpen}>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-primary">EDITAR DADOS PESSOAIS</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label className="font-sans">Nome completo *</Label><Input value={studentForm.full_name} onChange={e => setStudentForm({ ...studentForm, full_name: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Email</Label><Input value={studentForm.email} onChange={e => setStudentForm({ ...studentForm, email: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">WhatsApp</Label><Input value={studentForm.whatsapp} onChange={e => setStudentForm({ ...studentForm, whatsapp: formatPhone(e.target.value) })} className="bg-secondary border-border" placeholder="(00) 00000-0000" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">CPF</Label><Input value={studentForm.cpf} onChange={e => setStudentForm({ ...studentForm, cpf: formatCPF(e.target.value) })} className="bg-secondary border-border" placeholder="000.000.000-00" /></div>
                <div className="space-y-2"><Label className="font-sans">CEP</Label><Input value={studentForm.cep} onChange={e => { const m = formatCEP(e.target.value); setStudentForm(f => ({ ...f, cep: m })); if (m.replace(/\D/g, "").length === 8) void fillFromCepStudent(m); }} className="bg-secondary border-border" placeholder="00000-000" /></div>
              </div>
              <div className="space-y-2"><Label className="font-sans">Rua</Label><Input value={studentForm.address} onChange={e => setStudentForm({ ...studentForm, address: e.target.value })} onBlur={fillCepFromAddressStudent} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Número</Label><Input value={studentForm.address_number} onChange={e => setStudentForm({ ...studentForm, address_number: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">Bairro</Label><Input value={studentForm.neighborhood} onChange={e => setStudentForm({ ...studentForm, neighborhood: e.target.value })} className="bg-secondary border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Cidade</Label><Input value={studentForm.city} onChange={e => setStudentForm({ ...studentForm, city: e.target.value })} onBlur={fillCepFromAddressStudent} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">Estado</Label><Input value={studentForm.state} onChange={e => setStudentForm({ ...studentForm, state: e.target.value })} onBlur={fillCepFromAddressStudent} className="bg-secondary border-border" maxLength={2} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Data de nascimento</Label><Input type="date" value={studentForm.birth_date} onChange={e => setStudentForm({ ...studentForm, birth_date: e.target.value })} className="bg-secondary border-border" /></div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Status</Label>
                <Select value={studentForm.status} onValueChange={v => setStudentForm({ ...studentForm, status: v })}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interested">Interessado</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="font-sans">Observações</Label><Textarea value={studentForm.notes} onChange={e => setStudentForm({ ...studentForm, notes: e.target.value })} className="bg-secondary border-border" rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditStudentOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveStudent} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Financial Edit Dialog */}
        <Dialog open={financialOpen} onOpenChange={setFinancialOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-primary">EDITAR FINANCEIRO</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-sans">Status do pagamento</Label>
                <Select value={financialForm.payment_status} onValueChange={v => setFinancialForm({ ...financialForm, payment_status: v })}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Inadimplente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Data de pagamento</Label>
                <Input type="date" value={financialForm.payment_date} onChange={e => setFinancialForm({ ...financialForm, payment_date: e.target.value })} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Método de pagamento</Label>
                <Input value={financialForm.payment_method} onChange={e => setFinancialForm({ ...financialForm, payment_method: e.target.value })} placeholder="PIX, Cartão, Boleto..." className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Observações financeiras</Label>
                <Textarea value={financialForm.financial_notes} onChange={e => setFinancialForm({ ...financialForm, financial_notes: e.target.value })} className="bg-secondary border-border" rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFinancialOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveFinancial} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
