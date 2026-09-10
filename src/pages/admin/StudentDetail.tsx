import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { StudentCycleFeedbackCard } from "@/components/admin/StudentCycleFeedbackCard";
import { StudentWorkoutFeedbackCard } from "@/components/admin/StudentWorkoutFeedbackCard";
import { PlanVersionsCard } from "@/components/admin/PlanVersionsCard";
import { AssessmentCompareCard } from "@/components/admin/AssessmentCompareCard";
import { PreRegistrationDetails } from "@/components/admin/PreRegistrationDetails";
import { ManualPrescriptionPanel } from "@/components/admin/ManualPrescriptionPanel";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { StudentGoalsManager } from "@/components/admin/StudentGoalsManager";
import { StudentTimeline } from "@/components/admin/StudentTimeline";
import { StudentFilesPanel } from "@/components/admin/StudentFilesPanel";
import { WeeklyContactToggle } from "@/components/admin/WeeklyContactToggle";
import { IntercycleAnamnesisControls, IntercycleAnamnesisTimeline } from "@/components/admin/IntercycleAnamnesisControls";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Phone, Cake, CalendarDays, Dumbbell, Plus, CalendarIcon, MapPin, CreditCard, MessageCircle, Pencil, DollarSign, Upload, Image, Mic, FileText, Download, Square, MicOff, RefreshCw, ExternalLink, Copy, Link, Check, Trash2, UserPlus, BarChart3, Clock, CheckCircle2, Edit, KeyRound, ChevronDown } from "lucide-react";
import { format, parseISO, eachDayOfInterval, addWeeks, addDays, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { EditorialPageHeader } from "@/components/EditorialPageHeader";
import { EditorialTabStrip } from "@/components/EditorialTabStrip";
import { ProgressPhotosPanel } from "@/components/ProgressPhotosPanel";
import { loadStudentPreRegistration } from "@/lib/preRegistrationData";
import type { PreRegistrationData } from "@/lib/preRegistration";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";
import { businessDateYmd } from "@/lib/businessDate";

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
import { formatCPF, formatCEP, formatPhoneForCountry } from "@/lib/masks";
import { lookupCep, lookupCepByAddress } from "@/lib/cep";
import { isBrazilianCountry } from "@/lib/fiscalRegistration";
import { createPlansLink, openStudentChat } from "@/lib/studentChat";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { collapseOverlappingCyclesForDisplay, selectCurrentPlanCycleWindow, selectCyclesForProgramHistory, selectPreferredVisibleCycle } from "@/lib/prescriptionSchedule";
import { isInfluencerPlan, planOperationalRequirements } from "@/lib/influencerPlan";
import { archiveWorkoutForStudent, buildWorkoutArchiveSuccessMessage, buildWorkoutRestoreSuccessMessage, restoreWorkoutForStudent } from "@/lib/workoutArchive";
import {
  archiveCyclePrescriptionForStudent,
  buildCyclePrescriptionArchiveSuccessMessage,
  buildCyclePrescriptionRestoreSuccessMessage,
  previewCyclePrescriptionArchiveForStudent,
  restoreCyclePrescriptionForStudent,
} from "@/lib/cyclePrescriptionArchive";
import {
  assertCyclePrescriptionMutationSucceeded,
  assertCyclePrescriptionPreviewMatches,
  cyclePrescriptionContentCount,
  isCyclePrescriptionArchiveActionStale,
  type CyclePrescriptionArchivePreviewState,
} from "@/lib/cyclePrescriptionArchiveUi";
import { STUDENT_PROGRAM_PRIMARY_TABS, resolveStudentProgramHandoff, type StudentProgramPrimaryTabValue } from "@/lib/studentProgramSections";
import { resolveManualPrescriptionTargetCycle, workoutBuilderUrl } from "@/lib/manualPrescriptionNavigation";
// Heavy children loaded only when their tab is opened (chunk size win)
const WorkoutAnalysis = lazy(() => import("@/components/trainer/WorkoutAnalysis").then(m => ({ default: m.WorkoutAnalysis })));
const TrainerWeeklyBar = lazy(() => import("@/components/trainer/TrainerWeeklyBar").then(m => ({ default: m.TrainerWeeklyBar })));
const StudentVolumePanel = lazy(() => import("@/components/trainer/StudentVolumePanel").then(m => ({ default: m.StudentVolumePanel })));
const StudentBodyMap = lazy(() => import("@/components/body/StudentBodyMap").then(m => ({ default: m.StudentBodyMap })));
const MuscleRadar = lazy(() => import("@/components/student/MuscleRadar").then(m => ({ default: m.MuscleRadar })));
const EmbeddedPrescriptionStudio = lazy(() => import("@/pages/admin/PrescriptionStudio"));


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
  country_code: string | null;
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
  plan_duration_days?: number;
  cycle_duration_days?: number;
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
  has_bundle?: boolean;
  has_cardio_plan?: boolean;
  has_strength_plan?: boolean;
  prescribed_offline_at?: string | null;
  prescribed_offline_by?: string | null;
  prescription_cleared_at?: string | null;
  prescription_cleared_event_id?: string | null;
  prescription_cleared_signature?: string | null;
}

interface StudentWorkoutRow {
  id: string;
  cycle_id: string;
  title: string | null;
  name: string | null;
  exercises: unknown;
  sort_order: number | null;
  superseded_at?: string | null;
  superseded_reason?: string | null;
  student_profile_archive_event_id?: string | null;
}

interface WorkoutArchiveAction {
  mode: "archive" | "restore";
  workout: StudentWorkoutRow;
  cycle: TrainingCycle;
}

interface CyclePrescriptionArchiveAction {
  mode: "archive" | "restore";
  studentId: string;
  cycle: TrainingCycle;
  preview?: CyclePrescriptionArchivePreviewState | null;
}

const hasCyclePrescriptionContent = (cycle: TrainingCycle | null | undefined) =>
  Boolean(cycle && !cycle.prescription_cleared_at && (
    cycle.has_workout
    || cycle.has_bundle
    || cycle.has_strength_plan
    || cycle.has_cardio_plan
  ));

const canClearCyclePrescription = (cycle: TrainingCycle | null | undefined, todayYmd = businessDateYmd()) =>
  hasCyclePrescriptionContent(cycle) && Boolean(cycle?.end_date && cycle.end_date >= todayYmd);

function cyclePrescriptionArchiveErrorMessage(error: unknown, mode: CyclePrescriptionArchiveAction["mode"]): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (/changed_reload_before_clearing|content_changed/i.test(raw)) {
    return "A prescrição mudou depois que a confirmação foi aberta. Recarregue o perfil e confira as contagens antes de tentar de novo.";
  }
  if (/only_current_or_future_cycles_can_be_cleared/i.test(raw)) {
    return "Só é possível limpar a prescrição do ciclo atual ou de ciclos futuros. Ciclos encerrados ficam preservados como histórico.";
  }
  if (/clear_event_not_current|event_missing|not_current_for_cycle/i.test(raw)) {
    return "A restauração não encontrou o evento de remoção atual deste ciclo. Recarregue o perfil antes de tentar novamente.";
  }
  if (/forbidden|permission|not authorized|jwt/i.test(raw)) {
    return "Seu usuário não tem permissão para alterar este ciclo/aluno nesta empresa.";
  }
  if (/signature_required/i.test(raw)) {
    return "A confirmação de segurança expirou. Abra a confirmação novamente para congelar a assinatura atual.";
  }
  return raw || (mode === "archive"
    ? "O servidor recusou a remoção da prescrição."
    : "O servidor recusou a restauração da prescrição.");
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
  plan_kind: string;
  cycle_duration_days?: number | null;
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

const isCyclePrescribed = (cycle: TrainingCycle) =>
  !cycle.prescription_cleared_at
  && Boolean(cycle.has_workout || cycle.has_bundle || cycle.has_cardio_plan || cycle.has_strength_plan || cycle.prescribed_offline_at);

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
  const location = useLocation();
  const { session, role } = useAuth();
  const { toast } = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [preRegistration, setPreRegistration] = useState<PreRegistrationData | null>(null);
  const [preRegistrationLoading, setPreRegistrationLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);
  const [rawCycles, setRawCycles] = useState<TrainingCycle[]>([]);
  const [expandedEnrollmentCycles, setExpandedEnrollmentCycles] = useState<Record<string, boolean>>({});
  const [reschedulingCycleId, setReschedulingCycleId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<StudentWorkoutRow[]>([]);
  const [archivedWorkouts, setArchivedWorkouts] = useState<StudentWorkoutRow[]>([]);
  const [workoutUsageCounts, setWorkoutUsageCounts] = useState<Record<string, { logs: number; sessions: number }>>({});
  const [asaasPayments, setAsaasPayments] = useState<AsaasPayment[]>([]);
  const [refreshingPayment, setRefreshingPayment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [trainerName, setTrainerName] = useState<string | null>(null);

  // Enrollment dialog state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainerOptionsLoading, setTrainerOptionsLoading] = useState(false);
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
  const [activeTab, setActiveTab] = useState<StudentProgramPrimaryTabValue>("overview");
  const [activePrescriptionPanel, setActivePrescriptionPanel] = useState<"prescricao" | "integrada">("prescricao");
  const [manualPrescriptionCycleId, setManualPrescriptionCycleId] = useState("");
  const [workoutArchiveAction, setWorkoutArchiveAction] = useState<WorkoutArchiveAction | null>(null);
  const [workoutArchiveReason, setWorkoutArchiveReason] = useState("");
  const [archivingWorkout, setArchivingWorkout] = useState(false);
	  const [cyclePrescriptionArchiveAction, setCyclePrescriptionArchiveAction] = useState<CyclePrescriptionArchiveAction | null>(null);
	  const [cyclePrescriptionArchiveReason, setCyclePrescriptionArchiveReason] = useState("");
	  const [cyclePrescriptionArchiveLoading, setCyclePrescriptionArchiveLoading] = useState(false);
	  const studentProfileIdRef = useRef<string | undefined>(id);

	  useEffect(() => {
	    studentProfileIdRef.current = id;
	    setCyclePrescriptionArchiveAction(null);
	    setCyclePrescriptionArchiveReason("");
	    setCyclePrescriptionArchiveLoading(false);
	  }, [id]);

  useEffect(() => {
    const handoff = location.state as { studentId?: unknown; tab?: unknown } | null;
    if (!handoff || (typeof handoff.studentId === "string" && handoff.studentId !== id)) return;
    const resolved = resolveStudentProgramHandoff(typeof handoff.tab === "string" ? handoff.tab : null);
    if (resolved.activeTab) {
      setActiveTab(resolved.activeTab);
    }
    if (resolved.prescriptionPanel) {
      setActivePrescriptionPanel(resolved.prescriptionPanel);
    }
  }, [id, location.state]);

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
    if (!isBrazilianCountry(student?.country_code)) return;
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
    if (!isBrazilianCountry(student?.country_code)) return;
    if (studentForm.cep.replace(/\D/g, "").length === 8) return;
    const r = await lookupCepByAddress(studentForm.state, studentForm.city, studentForm.address);
    if (r?.cep) setStudentForm((f) => ({ ...f, cep: formatCEP(r.cep), neighborhood: f.neighborhood || r.bairro }));
  };

  useEffect(() => {
    if (id) loadData(id);
    // loadData is the page-level loader; adding it as a dependency would re-run
    // the loader on every render because it closes over local UI handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async (studentId: string) => {
    setLoading(true);

    const { data: studentData } = await supabase
      .from("students").select("*").eq("id", studentId).single();

    if (!studentData) { setLoading(false); return; }
    setStudent(studentData as Student);
    void loadEnrollmentOptions(studentData.company_id);

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
      setRawCycles([]);
      setAllWorkouts([]);
      setArchivedWorkouts([]);
      setWorkoutUsageCounts({});
      setLoading(false);
      loadEvaluations(studentId);
      loadAsaasPayments(studentId);
      return;
    }

    const planIds = [...new Set(enrollmentData.map((e) => e.plan_id))];
    const trainerIds = [...new Set(enrollmentData.map((e) => e.trainer_id).filter((id): id is string => !!id))];

    const [{ data: plansData }, { data: profiles }] = await Promise.all([
      supabase.from("plans").select("id, name, duration_weeks, duration_days, cycle_duration_days, plan_kind").in("id", planIds),
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
      plan_duration_days: planMap.get(e.plan_id)?.duration_days || undefined,
      cycle_duration_days: planMap.get(e.plan_id)?.cycle_duration_days || undefined,
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
      setRawCycles([]);
      setAllWorkouts([]);
      setArchivedWorkouts([]);
      setWorkoutUsageCounts({});
      setLoading(false);
      loadEvaluations(studentId);
      loadAsaasPayments(studentId);
      return;
    }

    const schedulableCycleData = cycleData.filter((cycle) => cycle.status !== "superseded");
    const cycleIds = schedulableCycleData.map((c) => c.id);
    const [activeWorkoutResult, archivedWorkoutResult, bundleResult, strengthPlanResult, runningPlanResult] = cycleIds.length > 0
      ? await Promise.all([
        supabase.from("workouts").select("id, cycle_id, title, name, exercises, sort_order").is("superseded_at", null).in("cycle_id", cycleIds),
        supabase
          .from("workouts")
          .select("id, cycle_id, title, name, exercises, sort_order, superseded_at, superseded_reason, student_profile_archive_event_id")
          .not("superseded_at", "is", null)
          .not("student_profile_archive_event_id", "is", null)
          .in("cycle_id", cycleIds),
        (supabase as any)
          .from("prescription_bundles")
          .select("id, training_cycle_id, status")
          .eq("company_id", studentData.company_id)
          .eq("student_id", studentId)
          .in("training_cycle_id", cycleIds)
          .in("status", ["active", "scheduled"]),
        (supabase as any)
          .from("ai_strength_plans")
          .select("id, training_cycle_id")
          .eq("company_id", studentData.company_id)
          .eq("student_id", studentId)
          .in("training_cycle_id", cycleIds),
        (supabase as any)
          .from("running_plans")
          .select("id, training_cycle_id, status")
          .eq("company_id", studentData.company_id)
          .eq("student_id", studentId)
          .in("training_cycle_id", cycleIds)
          .in("status", ["active", "scheduled"]),
      ])
      : [
        { data: [] as StudentWorkoutRow[] },
        { data: [] as StudentWorkoutRow[] },
        { data: [] as { training_cycle_id: string }[] },
        { data: [] as { training_cycle_id: string }[] },
        { data: [] as { training_cycle_id: string }[] },
      ];
    const workouts = (activeWorkoutResult.data || []) as StudentWorkoutRow[];
    const archivedRows = (archivedWorkoutResult.data || []) as StudentWorkoutRow[];
    const materializedWorkouts = filterMaterializedWorkouts(workouts || []);
    const materializedArchivedWorkouts = filterMaterializedWorkouts(archivedRows || []);
    const workoutCycleIds = new Set(materializedWorkouts.map((w) => w.cycle_id));
    const bundleCycleIds = new Set(((bundleResult.data || []) as any[])
      .map((row) => row.training_cycle_id)
      .filter(Boolean));
    const strengthCycleIds = new Set(((strengthPlanResult.data || []) as any[])
      .map((row) => row.training_cycle_id)
      .filter(Boolean));
    const runningCycleIds = new Set(((runningPlanResult.data || []) as any[])
      .map((row) => row.training_cycle_id)
      .filter(Boolean));
    setAllWorkouts(materializedWorkouts);
    setArchivedWorkouts(materializedArchivedWorkouts);

    const trackedWorkoutIds = [...new Set([...materializedWorkouts, ...materializedArchivedWorkouts].map((w) => w.id))];
    if (trackedWorkoutIds.length > 0) {
      const [{ data: logRows }, { data: sessionRows }] = await Promise.all([
        supabase.from("workout_logs").select("workout_id").eq("student_id", studentId).in("workout_id", trackedWorkoutIds),
        supabase.from("workout_sessions").select("workout_id").eq("student_id", studentId).in("workout_id", trackedWorkoutIds),
      ]);
      const counts: Record<string, { logs: number; sessions: number }> = {};
      trackedWorkoutIds.forEach((workoutId) => { counts[workoutId] = { logs: 0, sessions: 0 }; });
      (logRows || []).forEach((row: any) => {
        if (row.workout_id && counts[row.workout_id]) counts[row.workout_id].logs += 1;
      });
      (sessionRows || []).forEach((row: any) => {
        if (row.workout_id && counts[row.workout_id]) counts[row.workout_id].sessions += 1;
      });
      setWorkoutUsageCounts(counts);
    } else {
      setWorkoutUsageCounts({});
    }

    const cyclesWithSignals = schedulableCycleData.map((c) => ({
      ...c,
      has_workout: !c.prescription_cleared_at && workoutCycleIds.has(c.id),
      has_workouts: !c.prescription_cleared_at && workoutCycleIds.has(c.id),
      has_bundle: !c.prescription_cleared_at && bundleCycleIds.has(c.id),
      has_strength_plan: !c.prescription_cleared_at && strengthCycleIds.has(c.id),
      has_cardio_plan: !c.prescription_cleared_at && runningCycleIds.has(c.id),
    }));
    setRawCycles(cyclesWithSignals);
    const displayCycles = collapseOverlappingCyclesForDisplay(cyclesWithSignals);
    setCycles(displayCycles);

    // Carregar um perfil é uma operação de leitura. Transições de matrícula
    // precisam acontecer por uma ação explícita e auditável, nunca no page load.
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
  const loadEnrollmentOptions = async (companyIdOverride?: string | null) => {
    const targetCompanyId = companyIdOverride || student?.company_id;
    if (!targetCompanyId) {
      setPlans([]);
      setTrainers([]);
      return;
    }

    setTrainerOptionsLoading(true);
    try {
      const [{ data: plansData, error: plansError }, { data: membersData, error: membersError }] = await Promise.all([
        supabase
          .from("plans")
          .select("id, name, duration_weeks, duration_days, plan_kind")
          .eq("company_id", targetCompanyId)
          .eq("is_active", true)
          .order("name"),
        supabase.from("company_members").select("user_id").eq("company_id", targetCompanyId),
      ]);

      if (plansError) throw plansError;
      if (membersError) throw membersError;
      setPlans(plansData || []);

      const memberIds = [...new Set((membersData || []).map((member) => member.user_id))];
      if (memberIds.length === 0) {
        setTrainers([]);
        return;
      }

      const [{ data: rolesData, error: rolesError }, { data: profilesData, error: profilesError }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", memberIds)
          .in("role", ["admin", "coordinator", "trainer"]),
        supabase.from("profiles").select("user_id, full_name").in("user_id", memberIds),
      ]);

      if (rolesError) throw rolesError;
      if (profilesError) throw profilesError;

      const eligibleIds = new Set((rolesData || []).map((roleRow) => roleRow.user_id));
      setTrainers(
        (profilesData || [])
          .filter((profile) => eligibleIds.has(profile.user_id))
          .map((profile) => ({ user_id: profile.user_id, full_name: profile.full_name || "Sem nome" }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")),
      );
    } catch (error) {
      console.error("Falha ao carregar treinadores da empresa:", error);
      setTrainers([]);
    } finally {
      setTrainerOptionsLoading(false);
    }
  };

  const openEnrollDialog = () => {
    setSelectedPlanId(student?.selected_plan_id || "");
    setSelectedTrainerId("");
    setStartDate(new Date());
    void loadEnrollmentOptions(student?.company_id);
    setEnrollOpen(true);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedPlanRequirements = planOperationalRequirements(selectedPlan?.plan_kind);
  const computedEndDate = selectedPlan && selectedPlanRequirements.requiresStartDate
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
    const { error: studentError } = await supabase.from("students").update({ assigned_trainer_id: trainerId }).eq("id", id);
    if (studentError) {
      toast({ title: "Matrícula atualizada parcialmente", description: `O treinador foi salvo na matrícula, mas não no perfil: ${studentError.message}`, variant: "destructive" });
      return;
    }
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
        {trainerOptionsLoading && <SelectItem value="__loading" disabled>Carregando equipe...</SelectItem>}
        {!trainerOptionsLoading && trainers.length === 0 && <SelectItem value="__empty" disabled>Nenhum treinador disponível</SelectItem>}
        {trainers.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const handleCreateEnrollment = async () => {
    if (!selectedPlanId || !selectedPlan || !id) return;
    if (!student?.company_id) {
      toast({ title: "Empresa não identificada", description: "Atualize o cadastro do aluno antes de criar a matrícula.", variant: "destructive" });
      return;
    }
    if (isInfluencerPlan(selectedPlan)) {
      setSaving(true);
      const { error } = await supabase.rpc("classify_influencer_student", {
        _student_id: id,
        _plan_id: selectedPlanId,
      });
      setSaving(false);
      if (error) {
        toast({ title: "Erro ao classificar influenciador(a)", description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Influenciador(a) classificado e ativado!",
        description: "Nenhuma matrícula, cobrança, data inicial ou treinador foi criado.",
      });
      setEnrollOpen(false);
      loadData(id);
      return;
    }
    if (!selectedTrainerId || !session?.user?.id || !computedEndDate) return;
    if (!student.status || !["active", "awaiting_renewal"].includes(student.status)) {
      toast({
        title: "Pagamento ainda não confirmado",
        description: "Use a esteira de Interessados para enviar o cadastro fiscal e o checkout. A matrícula será criada automaticamente após o Pix do Asaas.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const startDateValue = format(startDate, "yyyy-MM-dd");
    const { data: replacementRows, error } = await supabase.rpc("replace_student_enrollment", {
      _student_id: id,
      _company_id: student.company_id,
      _plan_id: selectedPlanId,
      _trainer_id: selectedTrainerId,
      _start_date: startDateValue,
      _clear_carried_over_cycle: false,
    });
    if (error) {
      setSaving(false);
      toast({ title: "Erro ao criar matrícula", description: error.message, variant: "destructive" });
      return;
    }
    const enrollmentId = Array.isArray(replacementRows) ? replacementRows[0]?.enrollment_id : (replacementRows as any)?.enrollment_id;
    if (!enrollmentId) {
      setSaving(false);
      toast({ title: "Matrícula criada sem confirmação local", description: "O servidor não retornou a matrícula criada. Recarregue o aluno antes de prescrever.", variant: "destructive" });
      return;
    }
    setSaving(false);
    toast({ title: "Matrícula criada com sucesso!" });
    setEnrollOpen(false);
    loadData(id);
  };

  const handleRescheduleCycle = async (
    enrollmentId: string,
    cycle: TrainingCycle,
    date: Date,
  ) => {
    if (!id || reschedulingCycleId) return;
    setReschedulingCycleId(cycle.id);
    const dateStr = format(date, "yyyy-MM-dd");
    const { error } = await supabase.rpc("reschedule_training_cycles_from", {
      p_enrollment_id: enrollmentId,
      p_cycle_id: cycle.id,
      p_new_start_date: dateStr,
    });
    setReschedulingCycleId(null);

    if (error) {
      toast({
        title: "Erro ao reagendar ciclo",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: `Ciclo ${cycle.cycle_number} reagendado`,
      description: "As datas deste ciclo e de todos os seguintes foram ajustadas.",
    });
    loadData(id);
  };

  // ---- EDIT STUDENT ----
  const openEditStudent = () => {
    if (!student) return;
    const brazilian = isBrazilianCountry(student.country_code);
    setStudentForm({
      full_name: student.full_name, email: student.email || "", phone: student.phone || "",
      birth_date: student.birth_date || "", cpf: student.cpf ? (brazilian ? formatCPF(student.cpf) : student.cpf) : "",
      cep: student.cep ? (brazilian ? formatCEP(student.cep) : student.cep) : "", address: student.address || "",
      address_number: student.address_number || "", neighborhood: student.neighborhood || "",
      city: student.city || "", state: student.state || "",
      whatsapp: student.whatsapp ? formatPhoneForCountry(student.whatsapp, student.country_code) : "", status: student.status, notes: student.notes || "",
    });
    setEditStudentOpen(true);
  };

  const handleSaveStudent = async () => {
    if (!id || !studentForm.full_name.trim()) return;
    const brazilian = isBrazilianCountry(student?.country_code);
    setSaving(true);
    const { error } = await supabase.from("students").update({
      full_name: studentForm.full_name.trim(), email: studentForm.email.trim() || null,
      phone: studentForm.phone.trim() || null, birth_date: studentForm.birth_date || null,
      cpf: (brazilian ? studentForm.cpf.replace(/\D/g, "") : studentForm.cpf.trim()) || null,
      cep: (brazilian ? studentForm.cep.replace(/\D/g, "") : studentForm.cep.trim()) || null,
      address: studentForm.address.trim() || null, address_number: studentForm.address_number.trim() || null,
      neighborhood: studentForm.neighborhood.trim() || null, city: studentForm.city.trim() || null,
      state: studentForm.state.trim() || null,
      whatsapp: studentForm.whatsapp.replace(/\D/g, "") || null,
      status: studentForm.status, notes: studentForm.notes.trim() || null,
    }).eq("id", id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    // Sync address to Asaas only for the Brazilian fiscal flow.
    if (brazilian) {
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
      } catch (e) {
        console.error("Erro ao sincronizar com Asaas:", e);
      }
    }
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

  const allEnrollmentCycles = (enrollment: Enrollment) =>
    rawCycles.filter((cycle) => cycle.enrollment_id === enrollment.id);

  const currentEnrollmentCycles = (enrollment: Enrollment) =>
    selectCurrentPlanCycleWindow(
      allEnrollmentCycles(enrollment),
      enrollment.plan_duration_days || Math.max(1, (enrollment.plan_duration || 6) * 7),
      enrollment.cycle_duration_days || 42,
    );

  const displayedEnrollmentCycles = (enrollment: Enrollment) =>
    expandedEnrollmentCycles[enrollment.id]
      ? allEnrollmentCycles(enrollment)
      : currentEnrollmentCycles(enrollment);

  const studentVisibleCycleForEnrollment = (enrollment: Enrollment) =>
    selectPreferredVisibleCycle(currentEnrollmentCycles(enrollment));

  const manualPrescriptionEnrollment =
    enrollments.find(e => e.status === "active" || e.status === "awaiting_training" || e.status === "awaiting_renewal")
    || enrollments[0]
    || null;

  const manualPrescriptionCycles = manualPrescriptionEnrollment
    ? currentEnrollmentCycles(manualPrescriptionEnrollment)
    : [];

  const manualSelectedCycle =
    manualPrescriptionCycles.find((cycle) => cycle.id === manualPrescriptionCycleId)
    || (manualPrescriptionEnrollment ? studentVisibleCycleForEnrollment(manualPrescriptionEnrollment) : null)
    || manualPrescriptionCycles[0]
    || null;

  const openManualPrescriptionBuilder = (cycle: TrainingCycle | null = manualSelectedCycle, enrollment: Enrollment | null = manualPrescriptionEnrollment) => {
    if (!cycle || !enrollment || !id) {
      toast({
        title: "Nenhum ciclo disponível para prescrição manual",
        description: "Crie ou revise a matrícula do aluno antes de abrir o builder.",
        variant: "destructive",
      });
      return;
    }

    const visibleCycle = studentVisibleCycleForEnrollment(enrollment);
    const targetCycle = resolveManualPrescriptionTargetCycle(cycle, visibleCycle, businessDateYmd());

    if (targetCycle.id !== cycle.id) {
      toast({
        title: "Abrindo o treino que o aluno vê",
        description: `O ciclo ${cycle.cycle_number} é histórico ou não está selecionado no app do aluno.`,
      });
    }

    navigate(workoutBuilderUrl({ role, studentId: id, cycleId: targetCycle.id }));
  };

  const workoutDisplayTitle = (workout: Pick<StudentWorkoutRow, "title" | "name">) =>
    workout.title || (workout.name ? `Treino ${workout.name}` : "Treino");

  const openWorkoutArchiveDialog = (mode: WorkoutArchiveAction["mode"], workout: StudentWorkoutRow, cycle: TrainingCycle) => {
    setWorkoutArchiveReason("");
    setWorkoutArchiveAction({ mode, workout, cycle });
  };

  const closeWorkoutArchiveDialog = () => {
    if (archivingWorkout) return;
    setWorkoutArchiveAction(null);
    setWorkoutArchiveReason("");
  };

  const openCyclePrescriptionArchiveDialog = async (mode: CyclePrescriptionArchiveAction["mode"], cycle: TrainingCycle) => {
	    if (!id) return;
	    const studentIdAtOpen = id;
	    if (mode === "restore") {
      if (!cycle.prescription_cleared_event_id) {
        toast({
          title: "Restauração indisponível",
          description: "Este ciclo não tem um evento de remoção vinculado. Recarregue o perfil antes de tentar novamente.",
          variant: "destructive",
        });
        return;
	      }
	      setCyclePrescriptionArchiveReason("");
	      setCyclePrescriptionArchiveAction({ mode, studentId: studentIdAtOpen, cycle });
	      return;
	    }

    if (!canClearCyclePrescription(cycle)) {
      toast({
        title: "Este ciclo não pode ser limpo daqui",
        description: "A ação fica disponível apenas para ciclos atuais ou futuros que ainda têm prescrição ativa.",
        variant: "destructive",
      });
      return;
    }

    setCyclePrescriptionArchiveLoading(true);
    try {
	      const preview = await previewCyclePrescriptionArchiveForStudent(supabase as any, {
	        studentId: studentIdAtOpen,
	        cycleId: cycle.id,
	      }) as CyclePrescriptionArchivePreviewState | null;
	      if (studentProfileIdRef.current !== studentIdAtOpen) {
	        return;
	      }
	      const confirmedPreview = assertCyclePrescriptionPreviewMatches(preview, {
	        studentId: studentIdAtOpen,
	        cycleId: cycle.id,
	      });
	      setCyclePrescriptionArchiveReason("");
	      // A assinatura vem do preview no momento de abertura. A confirmação usa
	      // este snapshot congelado para detectar edição concorrente no servidor.
	      setCyclePrescriptionArchiveAction({ mode, studentId: studentIdAtOpen, cycle, preview: confirmedPreview });
    } catch (error) {
      toast({
        title: "Não foi possível preparar a remoção",
        description: cyclePrescriptionArchiveErrorMessage(error, mode),
        variant: "destructive",
      });
    } finally {
      setCyclePrescriptionArchiveLoading(false);
    }
  };

  const closeCyclePrescriptionArchiveDialog = () => {
    if (cyclePrescriptionArchiveLoading) return;
    setCyclePrescriptionArchiveAction(null);
    setCyclePrescriptionArchiveReason("");
  };

  const confirmCyclePrescriptionArchiveAction = async () => {
	    if (!cyclePrescriptionArchiveAction || !id) return;
	    if (isCyclePrescriptionArchiveActionStale(cyclePrescriptionArchiveAction, id)) {
	      setCyclePrescriptionArchiveAction(null);
	      setCyclePrescriptionArchiveReason("");
	      toast({
	        title: "Perfil mudou durante a confirmação",
	        description: "Abra a confirmação novamente no aluno correto antes de alterar a prescrição.",
	        variant: "destructive",
	      });
	      return;
	    }
	    const { mode, studentId, cycle, preview } = cyclePrescriptionArchiveAction;
	    setCyclePrescriptionArchiveLoading(true);
	    try {
      if (mode === "archive") {
        const expectedContentSignature = preview?.content_signature?.trim();
        if (!expectedContentSignature) {
          throw new Error("A confirmação de segurança expirou. Abra a confirmação novamente.");
        }
	        const result = await archiveCyclePrescriptionForStudent(supabase as any, {
	          studentId,
	          cycleId: cycle.id,
	          expectedWorkoutIds: preview?.active_workout_ids || [],
	          expectedContentSignature,
	          reason: cyclePrescriptionArchiveReason,
	        });
	        assertCyclePrescriptionMutationSucceeded(result, { studentId, cycleId: cycle.id });
	        toast(buildCyclePrescriptionArchiveSuccessMessage(cycle.cycle_number));
	      } else {
	        const result = await restoreCyclePrescriptionForStudent(supabase as any, {
	          studentId,
	          cycleId: cycle.id,
	          clearEventId: cycle.prescription_cleared_event_id,
	          reason: cyclePrescriptionArchiveReason,
	        });
	        assertCyclePrescriptionMutationSucceeded(result, { studentId, cycleId: cycle.id });
	        toast(buildCyclePrescriptionRestoreSuccessMessage(cycle.cycle_number));
	      }
	      setCyclePrescriptionArchiveAction(null);
	      setCyclePrescriptionArchiveReason("");
	      loadData(studentId);
    } catch (error) {
      toast({
        title: mode === "archive" ? "Não foi possível remover a prescrição" : "Não foi possível restaurar a prescrição",
        description: cyclePrescriptionArchiveErrorMessage(error, mode),
        variant: "destructive",
      });
    } finally {
      setCyclePrescriptionArchiveLoading(false);
    }
  };

  const confirmWorkoutArchiveAction = async () => {
    if (!workoutArchiveAction || !id) return;
    const { mode, workout, cycle } = workoutArchiveAction;
    setArchivingWorkout(true);
    try {
      if (mode === "archive") {
        await archiveWorkoutForStudent(supabase as any, {
          studentId: id,
          cycleId: cycle.id,
          workoutId: workout.id,
          reason: workoutArchiveReason,
        });
        const message = buildWorkoutArchiveSuccessMessage(workoutDisplayTitle(workout));
        toast(message);
      } else {
        await restoreWorkoutForStudent(supabase as any, {
          studentId: id,
          cycleId: cycle.id,
          workoutId: workout.id,
          reason: workoutArchiveReason,
        });
        const message = buildWorkoutRestoreSuccessMessage(workoutDisplayTitle(workout));
        toast(message);
      }
      setWorkoutArchiveAction(null);
      setWorkoutArchiveReason("");
      loadData(id);
    } catch (error) {
      toast({
        title: mode === "archive" ? "Não foi possível arquivar o treino" : "Não foi possível restaurar o treino",
        description: error instanceof Error ? error.message : "O servidor recusou a operação.",
        variant: "destructive",
      });
    } finally {
      setArchivingWorkout(false);
    }
  };

  const renderCycleCalendar = () => (
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
  );

  const renderWorkoutCycles = () => {
    const activeEnroll = enrollments.find(e => e.status === "active" || e.status === "awaiting_training" || e.status === "awaiting_renewal");
    if (!activeEnroll) return <p className="text-muted-foreground font-sans text-sm text-center py-8">Nenhuma matrícula ativa.</p>;
    const enrollCycles = selectCyclesForProgramHistory(
      rawCycles.filter(c => c.enrollment_id === activeEnroll.id),
      activeEnroll.plan_duration_days || Math.max(1, (activeEnroll.plan_duration || 6) * 7),
      activeEnroll.cycle_duration_days || 42,
    );
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
            const archivedCycleWorkouts = (archivedWorkouts || []).filter((w) => w.cycle_id === cycle.id);
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
                          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 bg-secondary/30 rounded-xl px-2.5 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-xs font-sans text-foreground truncate">{w.title || `Treino ${w.name}`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] shrink-0">{exercises.length} ex.</Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => openWorkoutArchiveDialog("archive", w, cycle)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Excluir treino
                              </Button>
                            </div>
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
                      onClick={() => openManualPrescriptionBuilder(cycle, activeEnroll)}
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
                            const mg = canonicalAnatomicalMuscleGroup(ex.muscle_group);
                            if (!mg) return acc;
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
                  {archivedCycleWorkouts.length > 0 && (
                    <details className="rounded-xl border border-dashed border-border bg-secondary/20 p-2 text-xs font-sans">
                      <summary className="cursor-pointer text-muted-foreground">Treinos arquivados ({archivedCycleWorkouts.length})</summary>
                      <div className="mt-2 space-y-1.5">
                        {archivedCycleWorkouts.map((w) => (
                          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-foreground">{workoutDisplayTitle(w)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                Arquivado em {safeFormatDate(w.superseded_at, "dd/MM/yyyy HH:mm")} · logs preservados
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => openWorkoutArchiveDialog("restore", w, cycle)}
                            >
                              Restaurar
                            </Button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAnamnesisSection = () => {
    if (!student) return null;
    return (
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
            As respostas abaixo são as mesmas usadas pela Prescrição Integrada e pelos motores de prescrição.
          </p>
        </CardHeader>
        <CardContent>
          <PreRegistrationDetails data={preRegistration} loading={preRegistrationLoading} />
          {id && student?.company_id && (
            <div className="mt-6 border-t pt-5">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="outline">Anamnese interciclos</Badge>
                <span className="text-sm text-muted-foreground">
                  Histórico por ciclo, sem alterar o pré-cadastro.
                </span>
              </div>
              <IntercycleAnamnesisTimeline studentId={id} companyId={student.company_id} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderFinancialSection = () => (
    <div>
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
    </div>
  );

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
        <EditorialPageHeader
          overline="Perfil do aluno"
          title={student.full_name.toUpperCase()}
          titleClassName="text-primary"
          leading={
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => navigate("/admin/students")} aria-label="Voltar para alunos">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          }
          meta={
            <Badge variant="outline" className={`text-xs ${statusColors[student.status]}`}>
              {statusLabels[student.status] || student.status}
            </Badge>
          }
          context={
            <>
              {student.email && (
                <span className="inline-flex min-w-0 items-center gap-1 break-all">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {student.email}
                </span>
              )}
              {student.whatsapp && (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  {formatPhoneForCountry(student.whatsapp, student.country_code)}
                </span>
              )}
              {trainerName && (
                <span className="inline-flex items-center gap-1">
                  <Dumbbell className="h-3.5 w-3.5 shrink-0" />
                  {trainerName}
                </span>
              )}
            </>
          }
          actions={
            <>
              <BnitoContextButton
                label={`perfil de ${student.full_name}`}
                context={`Detalhe do aluno. Status: ${student.status}. Treinador: ${trainerName || "nao definido"}. Matriculas: ${enrollments.length}. Ciclos: ${cycles.length}.`}
                question="Me ajude a identificar os principais riscos e proximos passos deste aluno."
                className="h-11 w-11"
              />
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 text-xs"
                onClick={handleActivateStudentAccess}
                disabled={activatingAccess || !student.email}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                <span>{activatingAccess ? "Ativando..." : "Ativar Acesso"}</span>
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={openEditStudent} aria-label="Editar aluno">
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          }
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudentProgramPrimaryTabValue)} className="w-full">
          <EditorialTabStrip
            tabs={STUDENT_PROGRAM_PRIMARY_TABS}
            ariaLabel="Seções do aluno"
          />

          {/* ===== VISÃO GERAL ===== */}
          <TabsContent value="overview" className="space-y-4">
            {id && student?.company_id && (
              <div className="grid gap-3 lg:grid-cols-2">
                <WeeklyContactToggle
                  studentId={id}
                  phone={student.whatsapp || student.phone}
                  countryCode={student.country_code}
                />
                <IntercycleAnamnesisControls studentId={id} companyId={student.company_id} initial={(student as { intercycle_anamnesis_enabled?: boolean })?.intercycle_anamnesis_enabled} />
              </div>
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
            <CollapsibleCard
              title="FINANCEIRO"
              icon={<DollarSign className="h-4 w-4" />}
              className="mb-4"
              action={
                <BnitoContextButton
                  label="financeiro do aluno"
                  context={`Financeiro do aluno ${student.full_name}: matriculas, pagamentos, Asaas, links e status de cobranca.`}
                  question="O que preciso regularizar no financeiro antes de seguir com este aluno?"
                />
              }
            >
              {renderFinancialSection()}
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
            {id && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <StudentCycleFeedbackCard studentId={id} />
                <StudentWorkoutFeedbackCard studentId={id} />
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Active enrollment + cycles + notes */}
              <div className="space-y-4">
                {/* Active enrollment summary */}
                {enrollments.length > 0 && (() => {
                  const active = enrollments.find(e => e.status === "active" || e.status === "awaiting_training" || e.status === "awaiting_renewal") || enrollments[0];
                  const activeCycles = selectCurrentPlanCycleWindow(
                    cycles.filter(c => c.enrollment_id === active.id),
                    active.plan_duration_days || Math.max(1, (active.plan_duration || 6) * 7),
                    active.cycle_duration_days || 42,
                  );
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
                        {activeCycles.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs font-medium text-foreground">Ciclos:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {activeCycles.map(c => (
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
                      {student.cpf && <div className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-4 w-4" />{isBrazilianCountry(student.country_code) ? formatCPF(student.cpf) : student.cpf}</div>}
                      {student.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{formatPhoneForCountry(student.phone, student.country_code)}</div>}
                      {student.cep && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{isBrazilianCountry(student.country_code) ? `CEP: ${formatCEP(student.cep)}` : `Código postal: ${student.cep}`}</div>}
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
            {renderCycleCalendar()}
          </TabsContent>

          {/* ===== PROGRAMA DE TREINO ===== */}
          <TabsContent value="program" className="space-y-4">
            {/* Provas e metas alvo (aparecem no calendário do aluno e na agenda) */}
            {id && (
              <CollapsibleCard title="PROVAS E METAS" icon={<CalendarDays className="h-4 w-4" />}>
                <StudentGoalsManager
                  studentId={id}
                  companyId={student?.company_id}
                  createdBy={session?.user?.id}
                />
              </CollapsibleCard>
            )}
            <CollapsibleCard title="ANAMNESE" icon={<FileText className="h-4 w-4" />}>
              {renderAnamnesisSection()}
            </CollapsibleCard>
            {id && <AssessmentCompareCard studentId={id} />}
            {id && <PlanVersionsCard studentId={id} />}

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-primary text-lg">
                  PRESCRIÇÃO DO ALUNO
                  <BnitoContextButton
                    label="prescricao do aluno no perfil"
                    context={`Painéis de prescrição já vinculados ao aluno ${student.full_name}; use uma prescrição por vez para evitar contexto cruzado.`}
                    question="Qual painel devo usar para este aluno agora: prescrição simples ou integrada?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={activePrescriptionPanel === "prescricao" ? "default" : "outline"}
                    onClick={() => setActivePrescriptionPanel("prescricao")}
                  >
                    Prescrição
                  </Button>
                  <Button
                    type="button"
                    variant={activePrescriptionPanel === "integrada" ? "default" : "outline"}
                    onClick={() => setActivePrescriptionPanel("integrada")}
                  >
                    Prescrição Integrada
                  </Button>
                </div>
                {activePrescriptionPanel === "prescricao" && (
                  <ManualPrescriptionPanel
                    cycles={manualPrescriptionCycles}
	                    selectedCycle={manualSelectedCycle}
	                    onCycleChange={setManualPrescriptionCycleId}
	                    onOpenCycle={openManualPrescriptionBuilder}
	                    onClearCycle={(cycle) => void openCyclePrescriptionArchiveDialog("archive", cycle)}
	                    onRestoreCycle={(cycle) => void openCyclePrescriptionArchiveDialog("restore", cycle)}
	                    canClearSelectedCycle={canClearCyclePrescription(manualSelectedCycle)}
	                    cycleActionLoading={cyclePrescriptionArchiveLoading}
	                  />
                )}
                {activePrescriptionPanel === "integrada" && (
                  <Suspense fallback={<TabFallback />}>
                    <EmbeddedPrescriptionStudio embeddedStudentId={id} />
                  </Suspense>
                )}
              </CardContent>
            </Card>

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

                        {displayedEnrollmentCycles(e).length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-sans font-medium text-foreground">Ciclos de treino:</p>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                              {displayedEnrollmentCycles(e).map((c) => (
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
                                    {studentVisibleCycleForEnrollment(e)?.id === c.id && (
                                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/25">
                                        Exibido ao aluno
                                      </Badge>
                                    )}
                                    {(role === "trainer" || role === "admin" || role === "master" || role === "coordinator") && (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-5 text-[10px] px-2"
                                          onClick={() => openManualPrescriptionBuilder(c, e)}
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
                                                .is("superseded_at", null)
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
                                    {(role === "trainer" || role === "admin" || role === "master" || role === "coordinator") && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 text-[10px] px-2"
                                            disabled={reschedulingCycleId !== null}
                                          >
                                            <CalendarIcon className="h-3 w-3 mr-0.5" />Alterar data
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                          <Calendar
                                            mode="single"
                                            selected={parseISO(c.start_date)}
                                            onSelect={(date) => date && handleRescheduleCycle(e.id, c, date)}
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
                            {allEnrollmentCycles(e).length > currentEnrollmentCycles(e).length && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setExpandedEnrollmentCycles((current) => ({
                                  ...current,
                                  [e.id]: !current[e.id],
                                }))}
                              >
                                <ChevronDown className={cn(
                                  "mr-1 h-3 w-3 transition-transform",
                                  expandedEnrollmentCycles[e.id] && "rotate-180",
                                )} />
                                {expandedEnrollmentCycles[e.id]
                                  ? "Mostrar somente o ciclo atual do plano"
                                  : `Ver histórico completo (${allEnrollmentCycles(e).length} ciclos)`}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ANÁLISES ===== */}
          <TabsContent value="analytics" className="space-y-4">
            {renderWorkoutCycles()}
            <Suspense fallback={<TabFallback />}>
              <TrainerWeeklyBar studentId={id!} />
              <WorkoutAnalysis studentId={id!} />
              <StudentVolumePanel studentId={id!} />
            </Suspense>
          </TabsContent>

          {/* ===== AVALIAÇÕES ===== */}
          <TabsContent value="evaluations" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              <StudentBodyMap studentId={id!} />
            </Suspense>
            <ProgressPhotosPanel studentId={id!} />
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

        {/* Workout archive/restore dialog */}
        <Dialog open={Boolean(workoutArchiveAction)} onOpenChange={(open) => !open && closeWorkoutArchiveDialog()}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-primary">
                {workoutArchiveAction?.mode === "restore" ? "RESTAURAR TREINO" : "EXCLUIR TREINO"}
              </DialogTitle>
            </DialogHeader>
            {workoutArchiveAction && (
              <div className="space-y-4 text-sm font-sans">
                <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-1">
                  <p><span className="text-muted-foreground">Aluno:</span> <strong>{student.full_name}</strong></p>
                  <p><span className="text-muted-foreground">Ciclo:</span> ciclo {workoutArchiveAction.cycle.cycle_number} · {safeFormatDate(workoutArchiveAction.cycle.start_date, "dd/MM/yyyy")} a {safeFormatDate(workoutArchiveAction.cycle.end_date, "dd/MM/yyyy")}</p>
                  <p><span className="text-muted-foreground">Treino:</span> <strong>{workoutDisplayTitle(workoutArchiveAction.workout)}</strong></p>
                  <p className="text-xs text-muted-foreground">
                    {Array.isArray(workoutArchiveAction.workout.exercises) ? workoutArchiveAction.workout.exercises.length : 0} exercícios · {workoutUsageCounts[workoutArchiveAction.workout.id]?.logs || 0} logs · {workoutUsageCounts[workoutArchiveAction.workout.id]?.sessions || 0} sessões
                  </p>
                </div>
                {workoutArchiveAction.mode === "archive" ? (
                  <p className="text-muted-foreground">
                    Esta ação arquiva somente este treino. Ele sai das telas ativas do aluno e do professor, mas matrícula, ciclo, plano, prescrição, logs, sessões e histórico continuam preservados para auditoria e restauração.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Esta ação restaura somente este treino arquivado. Ele volta às telas ativas; logs e sessões preservados permanecem vinculados ao mesmo treino.
                  </p>
                )}
                <div className="space-y-2">
                  <Label className="font-sans">Motivo opcional</Label>
                  <Textarea
                    value={workoutArchiveReason}
                    onChange={(event) => setWorkoutArchiveReason(event.target.value)}
                    placeholder={workoutArchiveAction.mode === "archive" ? "Ex.: treino duplicado ou publicado no ciclo errado" : "Ex.: rollback solicitado"}
                    rows={3}
                    className="bg-secondary border-border"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={closeWorkoutArchiveDialog} disabled={archivingWorkout}>Cancelar</Button>
              <Button
                variant={workoutArchiveAction?.mode === "archive" ? "destructive" : "default"}
                onClick={confirmWorkoutArchiveAction}
                disabled={archivingWorkout}
              >
                {archivingWorkout
                  ? "Confirmando..."
                  : workoutArchiveAction?.mode === "archive"
                    ? "Arquivar treino"
                    : "Restaurar treino"}
              </Button>
            </DialogFooter>
          </DialogContent>
	        </Dialog>

	        {/* Cycle prescription archive/restore dialog */}
	        <Dialog open={Boolean(cyclePrescriptionArchiveAction)} onOpenChange={(open) => !open && closeCyclePrescriptionArchiveDialog()}>
	          <DialogContent className="bg-card border-border">
	            <DialogHeader>
	              <DialogTitle className="text-primary">
	                {cyclePrescriptionArchiveAction?.mode === "restore" ? "RESTAURAR PRESCRIÇÃO DO CICLO" : "EXCLUIR PRESCRIÇÃO DO CICLO"}
	              </DialogTitle>
	            </DialogHeader>
	            {cyclePrescriptionArchiveAction && (
	              <div className="space-y-4 text-sm font-sans">
	                <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-1">
	                  <p><span className="text-muted-foreground">Aluno:</span> <strong>{student.full_name}</strong></p>
	                  <p><span className="text-muted-foreground">Ciclo:</span> ciclo {cyclePrescriptionArchiveAction.cycle.cycle_number} · {safeFormatDate(cyclePrescriptionArchiveAction.cycle.start_date, "dd/MM/yyyy")} a {safeFormatDate(cyclePrescriptionArchiveAction.cycle.end_date, "dd/MM/yyyy")}</p>
	                  {cyclePrescriptionArchiveAction.mode === "archive" && (
	                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs sm:grid-cols-4">
	                      <span className="rounded-lg bg-background/70 p-2"><strong>{cyclePrescriptionArchiveAction.preview?.active_workouts || 0}</strong><br />treinos</span>
	                      <span className="rounded-lg bg-background/70 p-2"><strong>{cyclePrescriptionArchiveAction.preview?.active_bundles || 0}</strong><br />pacotes</span>
	                      <span className="rounded-lg bg-background/70 p-2"><strong>{cyclePrescriptionArchiveAction.preview?.active_strength_plans || 0}</strong><br />força IA</span>
	                      <span className="rounded-lg bg-background/70 p-2"><strong>{cyclePrescriptionArchiveAction.preview?.active_running_plans || 0}</strong><br />cardio</span>
	                    </div>
	                  )}
	                </div>
	                {cyclePrescriptionArchiveAction.mode === "archive" ? (
	                  <div className="space-y-2 text-muted-foreground">
	                    <p>
	                      Esta ação remove a prescrição inteira deste ciclo das telas ativas do aluno. O ciclo fica intencionalmente vazio para você deixar sem treino ou refazer do zero.
	                    </p>
	                    <p>
	                      É uma remoção recuperável: treinos, pacotes, força, cardio, logs e histórico ficam arquivados com evento de auditoria. Se alguém alterar a prescrição após esta confirmação abrir, o servidor bloqueia a operação.
	                    </p>
	                  </div>
	                ) : (
	                  <p className="text-muted-foreground">
	                    Esta ação restaura a última prescrição removida deste ciclo usando o evento de auditoria vinculado. Ela volta às telas ativas se o servidor não detectar conflito com alterações posteriores.
	                  </p>
	                )}
	                <div className="space-y-2">
	                  <Label className="font-sans">Motivo opcional</Label>
	                  <Textarea
	                    value={cyclePrescriptionArchiveReason}
	                    onChange={(event) => setCyclePrescriptionArchiveReason(event.target.value)}
	                    placeholder={cyclePrescriptionArchiveAction.mode === "archive" ? "Ex.: apagar prescrição atual para refazer do zero" : "Ex.: rollback solicitado pelo professor"}
	                    rows={3}
	                    className="bg-secondary border-border"
	                  />
	                </div>
	              </div>
	            )}
	            <DialogFooter>
	              <Button variant="outline" onClick={closeCyclePrescriptionArchiveDialog} disabled={cyclePrescriptionArchiveLoading}>Cancelar</Button>
	              <Button
	                variant={cyclePrescriptionArchiveAction?.mode === "archive" ? "destructive" : "default"}
	                onClick={confirmCyclePrescriptionArchiveAction}
	                disabled={cyclePrescriptionArchiveLoading}
	              >
	                {cyclePrescriptionArchiveLoading
	                  ? "Confirmando..."
	                  : cyclePrescriptionArchiveAction?.mode === "archive"
	                    ? "Excluir prescrição"
	                    : "Restaurar prescrição"}
	              </Button>
	            </DialogFooter>
	          </DialogContent>
	        </Dialog>

	        {/* Enrollment Dialog */}
        <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-primary">
                {isInfluencerPlan(selectedPlan) ? "CLASSIFICAR INFLUENCIADOR(A)" : "NOVA MATRÍCULA"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-sans">Plano *</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{isInfluencerPlan(p) ? " · sem matrícula/pagamento" : ` (${p.duration_weeks} semanas)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPlanRequirements.requiresTrainer && <div className="space-y-2">
                <Label className="font-sans">Treinador *</Label>
                <Select value={selectedTrainerId} onValueChange={setSelectedTrainerId}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione um treinador" /></SelectTrigger>
                  <SelectContent>{trainers.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
              {selectedPlanRequirements.requiresStartDate && <div className="space-y-2">
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
              </div>}
              {isInfluencerPlan(selectedPlan) && (
                <p className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary font-sans">
                  A pessoa será classificada e ativada como Influenciador(a), sem treinador, matrícula, data inicial ou pagamento.
                </p>
              )}
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
              <Button
                onClick={handleCreateEnrollment}
                disabled={!selectedPlanId || (selectedPlanRequirements.requiresTrainer && !selectedTrainerId) || saving}
              >
                {saving ? "Salvando..." : isInfluencerPlan(selectedPlan) ? "Classificar e ativar" : "Criar Matrícula"}
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
                <div className="space-y-2"><Label className="font-sans">WhatsApp</Label><Input value={studentForm.whatsapp} onChange={e => setStudentForm({ ...studentForm, whatsapp: formatPhoneForCountry(e.target.value, student?.country_code) })} className="bg-secondary border-border" placeholder={isBrazilianCountry(student?.country_code) ? "(00) 00000-0000" : "+351912345678"} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">CPF {isBrazilianCountry(student?.country_code) ? "" : "(opcional)"}</Label><Input value={studentForm.cpf} onChange={e => setStudentForm({ ...studentForm, cpf: isBrazilianCountry(student?.country_code) ? formatCPF(e.target.value) : e.target.value.slice(0, 32) })} className="bg-secondary border-border" placeholder={isBrazilianCountry(student?.country_code) ? "000.000.000-00" : "Documento fiscal, se houver"} /></div>
                <div className="space-y-2"><Label className="font-sans">CEP {isBrazilianCountry(student?.country_code) ? "" : "(opcional)"}</Label><Input value={studentForm.cep} onChange={e => { const m = isBrazilianCountry(student?.country_code) ? formatCEP(e.target.value) : e.target.value.slice(0, 20); setStudentForm(f => ({ ...f, cep: m })); if (isBrazilianCountry(student?.country_code) && m.replace(/\D/g, "").length === 8) void fillFromCepStudent(m); }} className="bg-secondary border-border" placeholder={isBrazilianCountry(student?.country_code) ? "00000-000" : "Código postal"} /></div>
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
