import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Phone, Cake, CalendarDays, Dumbbell, Plus, CalendarIcon, MapPin, CreditCard, MessageCircle, Pencil, DollarSign, Upload, Image, Mic, FileText, Download, Square, MicOff, RefreshCw, ExternalLink, Copy, Link, Check, Trash2, UserPlus, BarChart3, Clock, CheckCircle2, Edit } from "lucide-react";
import { format, parseISO, eachDayOfInterval, addWeeks, addDays, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
// Heavy children loaded only when their tab is opened (chunk size win)
const WorkoutAnalysis = lazy(() => import("@/components/trainer/WorkoutAnalysis").then(m => ({ default: m.WorkoutAnalysis })));
const TrainerWeeklyBar = lazy(() => import("@/components/trainer/TrainerWeeklyBar").then(m => ({ default: m.TrainerWeeklyBar })));
const BodyMap = lazy(() => import("@/components/student/BodyMap").then(m => ({ default: m.BodyMap })));
const StudentFeedbackTab = lazy(() => import("@/components/admin/StudentFeedbackTab").then(m => ({ default: m.StudentFeedbackTab })));

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

interface Anamnesis {
  id: string;
  modalities: string[];
  training_days: string | null;
  available_days: number | null;
  session_duration: string | null;
  training_location: string | null;
  available_equipment: string[];
  goals: string | null;
  diseases: string | null;
  injuries: string | null;
  current_pain: string | null;
  nutrition: string | null;
  profession: string | null;
  sleep_hours: string | null;
  restorative_sleep: boolean | null;
  aware_of_trilogy: boolean | null;
  feel_in_3_months: string | null;
  biggest_obstacle: string | null;
  extra_comments: string | null;
  authorizes_plan: boolean | null;
  commits_communication: boolean | null;
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
}

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
  active: "Ativo",
  pending: "Pendente",
  inactive: "Inativo",
  completed: "Concluído",
  upcoming: "Próximo",
  awaiting_training: "Aguardando Prescrição",
};

const statusColors: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
  completed: "bg-muted text-muted-foreground border-border",
  upcoming: "bg-warning/15 text-warning border-warning/30",
  awaiting_training: "bg-warning/15 text-warning border-warning/30",
};

const cycleCalendarColors: Record<string, { bg: string; text: string }> = {
  prescribe: { bg: "hsl(var(--warning) / 0.25)", text: "hsl(var(--warning))" },
  done: { bg: "hsl(var(--success) / 0.25)", text: "hsl(var(--success))" },
  expired_no_workout: { bg: "hsl(var(--destructive) / 0.25)", text: "hsl(var(--destructive))" },
};

const MODALITY_OPTIONS = [
  "Nenhum", "Musculação / Funcional", "Corrida", "Natação", "Bike", "Triathlon", "Tênis"
];

const EQUIPMENT_OPTIONS = [
  "Mini Bands (elástico curto fechado)", "Thera Bands (elástico grande aberto)",
  "Super Bands (elástico grande fechado)", "Medball - Wallball", "Barra Olímpica",
  "Polia alta/baixa", "Anilhas até 10kg", "Anilhas até 20kg",
  "Hack de Agachamento Livre", "Hack de Agachamento Guiado",
  "Halteres até 10kg", "Halteres até 20kg", "Halteres até 30kg ou +",
  "Banco Inclinação Ajustável", "Kettlebell até 10kg", "Kettlebell até 20kg",
  "Máquinas", "Caixote", "Step"
];

const SESSION_DURATION_OPTIONS = [
  "até 30 minutos", "de 30 a 45 minutos", "de 45 a 60 minutos", "60 minutos ou +"
];

const TRAINING_LOCATION_OPTIONS = [
  "Academia de Rede", "Academia do Prédio", "Em casa", "Box de Crossfit/Studio"
];

const SLEEP_OPTIONS = ["4h", "4h - 6h", "6h - 8h", "8h +"];

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
  const [anamnesis, setAnamnesis] = useState<Anamnesis | null>(null);
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

  // Edit anamnesis dialog state
  const [editAnamnesisOpen, setEditAnamnesisOpen] = useState(false);
  const [anamnesisForm, setAnamnesisForm] = useState({
    modalities: [] as string[], training_days: "", available_days: "", session_duration: "",
    training_location: "", available_equipment: [] as string[], goals: "", diseases: "",
    injuries: "", current_pain: "", nutrition: "", profession: "", sleep_hours: "",
    restorative_sleep: "", aware_of_trilogy: "", feel_in_3_months: "", biggest_obstacle: "",
    extra_comments: "", authorizes_plan: "", commits_communication: "",
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

    // Load anamnesis (latest version)
    const { data: anamnesisData } = await supabase
      .from("anamnesis").select("*").eq("student_id", studentId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    setAnamnesis(anamnesisData as unknown as Anamnesis | null);

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
    const activeEnrollment = enrichedEnrollments.find(e => e.status === "active" || e.status === "awaiting_training") || enrichedEnrollments[0];
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
    const { data: workouts } = await supabase.from("workouts").select("id, cycle_id, name, exercises, sort_order").in("cycle_id", cycleIds);
    const workoutCycleIds = new Set((workouts || []).map((w) => w.cycle_id));
    setAllWorkouts(workouts || []);

    setCycles(cycleData.map((c) => ({ ...c, has_workout: workoutCycleIds.has(c.id) })));

    // Auto-fix: if enrollment is "awaiting_training" but already has workouts, update to "active"
    const awaitingEnrollments = enrollmentData.filter((e: any) => e.status === "awaiting_training");
    for (const enrollment of awaitingEnrollments) {
      const enrollmentCycles = cycleData.filter((c) => c.enrollment_id === enrollment.id);
      const allCyclesHaveWorkouts = enrollmentCycles.length > 0 && enrollmentCycles.every((c) => workoutCycleIds.has(c.id));
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

  // ---- EDIT ANAMNESIS ----
  const openEditAnamnesis = () => {
    if (anamnesis) {
      setAnamnesisForm({
        modalities: anamnesis.modalities || [], training_days: anamnesis.training_days || "",
        available_days: anamnesis.available_days != null ? String(anamnesis.available_days) : "",
        session_duration: anamnesis.session_duration || "", training_location: anamnesis.training_location || "",
        available_equipment: anamnesis.available_equipment || [], goals: anamnesis.goals || "",
        diseases: anamnesis.diseases || "", injuries: anamnesis.injuries || "",
        current_pain: anamnesis.current_pain || "", nutrition: anamnesis.nutrition || "",
        profession: anamnesis.profession || "", sleep_hours: anamnesis.sleep_hours || "",
        restorative_sleep: anamnesis.restorative_sleep != null ? (anamnesis.restorative_sleep ? "sim" : "nao") : "",
        aware_of_trilogy: anamnesis.aware_of_trilogy != null ? (anamnesis.aware_of_trilogy ? "sim" : "nao") : "",
        feel_in_3_months: anamnesis.feel_in_3_months || "", biggest_obstacle: anamnesis.biggest_obstacle || "",
        extra_comments: anamnesis.extra_comments || "",
        authorizes_plan: anamnesis.authorizes_plan != null ? (anamnesis.authorizes_plan ? "sim" : "nao") : "",
        commits_communication: anamnesis.commits_communication != null ? (anamnesis.commits_communication ? "sim" : "nao") : "",
      });
    } else {
      setAnamnesisForm({
        modalities: [], training_days: "", available_days: "", session_duration: "", training_location: "",
        available_equipment: [], goals: "", diseases: "", injuries: "", current_pain: "", nutrition: "",
        profession: "", sleep_hours: "", restorative_sleep: "", aware_of_trilogy: "", feel_in_3_months: "",
        biggest_obstacle: "", extra_comments: "", authorizes_plan: "", commits_communication: "",
      });
    }
    setEditAnamnesisOpen(true);
  };

  const toggleAnamnesisArray = (field: "modalities" | "available_equipment", item: string) => {
    const arr = anamnesisForm[field];
    setAnamnesisForm({ ...anamnesisForm, [field]: arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item] });
  };

  const handleSaveAnamnesis = async () => {
    if (!id) return;
    setSaving(true);
    const payload = {
      student_id: id,
      modalities: anamnesisForm.modalities, training_days: anamnesisForm.training_days || null,
      available_days: anamnesisForm.available_days ? parseInt(anamnesisForm.available_days) : null,
      session_duration: anamnesisForm.session_duration || null, training_location: anamnesisForm.training_location || null,
      available_equipment: anamnesisForm.available_equipment, goals: anamnesisForm.goals || null,
      diseases: anamnesisForm.diseases || null, injuries: anamnesisForm.injuries || null,
      current_pain: anamnesisForm.current_pain || null, nutrition: anamnesisForm.nutrition || null,
      profession: anamnesisForm.profession || null, sleep_hours: anamnesisForm.sleep_hours || null,
      restorative_sleep: anamnesisForm.restorative_sleep ? anamnesisForm.restorative_sleep === "sim" : null,
      aware_of_trilogy: anamnesisForm.aware_of_trilogy ? anamnesisForm.aware_of_trilogy === "sim" : null,
      feel_in_3_months: anamnesisForm.feel_in_3_months || null, biggest_obstacle: anamnesisForm.biggest_obstacle || null,
      extra_comments: anamnesisForm.extra_comments || null,
      authorizes_plan: anamnesisForm.authorizes_plan ? anamnesisForm.authorizes_plan === "sim" : null,
      commits_communication: anamnesisForm.commits_communication ? anamnesisForm.commits_communication === "sim" : null,
    };

    let error;
    if (anamnesis) {
      ({ error } = await supabase.from("anamnesis").update(payload as any).eq("id", anamnesis.id));
    } else {
      ({ error } = await supabase.from("anamnesis").insert(payload as any));
    }
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar anamnese", description: error.message, variant: "destructive" }); return; }
    toast({ title: anamnesis ? "Anamnese atualizada!" : "Anamnese adicionada!" });
    setEditAnamnesisOpen(false);
    loadData(id!);
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
      const isExpiredNoWorkout = cycle.status === "completed" && !cycle.has_workout;

      if (isExpiredNoWorkout) expiredDays.push(...days);
      else if (cycle.has_workout) doneDays.push(...days);
      else prescribeDays.push(...days);
    });

    return { prescribeDays, doneDays, expiredDays };
  };

  const { prescribeDays, doneDays, expiredDays } = buildCalendarDays();

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!student) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground font-sans">Aluno não encontrado</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/students")}>
            <ArrowLeft className="h-4 w-4 mr-2" />Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
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
            <Button variant="ghost" size="sm" className="text-xs" onClick={async () => {
              const link = `${window.location.origin}/anamnese/${id}`;
              try { await navigator.clipboard.writeText(link); } catch {
                const ta = document.createElement("textarea");
                ta.value = link; ta.style.position = "fixed"; ta.style.left = "-9999px";
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand("copy"); document.body.removeChild(ta);
              }
              toast({ title: "Link da anamnese copiado!" });
            }}>
              <Link className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Anamnese</span>
            </Button>
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
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Visão Geral</TabsTrigger>
            <TabsTrigger value="program" className="text-xs sm:text-sm">Programa</TabsTrigger>
            <TabsTrigger value="workouts" className="text-xs sm:text-sm">Treinos</TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs sm:text-sm">Análises</TabsTrigger>
            <TabsTrigger value="anamnesis" className="text-xs sm:text-sm">Anamnese</TabsTrigger>
            <TabsTrigger value="financial" className="text-xs sm:text-sm">Financeiro</TabsTrigger>
            <TabsTrigger value="evaluations" className="text-xs sm:text-sm">Avaliações</TabsTrigger>
            <TabsTrigger value="feedback" className="text-xs sm:text-sm">Feedbacks</TabsTrigger>
          </TabsList>

          <TabsContent value="feedback">
            <Suspense fallback={<TabFallback />}>
              {student && <StudentFeedbackTab studentId={student.id} />}
            </Suspense>
          </TabsContent>


          {/* ===== VISÃO GERAL ===== */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Active enrollment + cycles + notes */}
              <div className="space-y-4">
                {/* Active enrollment summary */}
                {enrollments.length > 0 && (() => {
                  const active = enrollments.find(e => e.status === "active" || e.status === "awaiting_training") || enrollments[0];
                  return (
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-primary text-lg">MATRÍCULA ATIVA</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm font-sans">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{active.plan_name}</span>
                          <Badge variant="outline" className={`text-xs ${statusColors[active.status]}`}>
                            {statusLabels[active.status] || active.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span><Dumbbell className="h-3 w-3 inline mr-1" />{active.trainer_name}</span>
                          <span><CalendarDays className="h-3 w-3 inline mr-1" />{safeFormatDate(active.start_date, "dd/MM/yyyy")} → {safeFormatDate(active.end_date, "dd/MM/yyyy")}</span>
                        </div>
                        {cycles.filter(c => c.enrollment_id === active.id).length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs font-medium text-foreground">Ciclos:</p>
                            {cycles.filter(c => c.enrollment_id === active.id).map(c => (
                              <div key={c.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-secondary/50 border border-border">
                                <span>Ciclo {c.cycle_number} — {safeFormatDate(c.start_date, "dd/MM")} a {safeFormatDate(c.end_date, "dd/MM/yy")}</span>
                                <div className="flex items-center gap-1">
                                  {c.has_workout ? (
                                    <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">Treino</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">Sem treino</Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Personal details */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-primary text-lg">DADOS PESSOAIS</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
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
            {/* Enrollments */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-primary text-lg">MATRÍCULAS</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    const link = `${window.location.origin}/pagamento/${id}`;
                    try { await navigator.clipboard.writeText(link); } catch {
                      const ta = document.createElement("textarea");
                      ta.value = link; ta.style.position = "fixed"; ta.style.left = "-9999px";
                      document.body.appendChild(ta); ta.focus(); ta.select();
                      document.execCommand("copy"); document.body.removeChild(ta);
                    }
                    toast({ title: "Link de pagamento copiado!" });
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
                      <div key={e.id} className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-sans font-medium text-foreground">{e.plan_name}</span>
                          <Badge variant="outline" className={`text-xs ${statusColors[e.status]}`}>
                            {statusLabels[e.status] || e.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground font-sans">
                          <span><Dumbbell className="h-3 w-3 inline mr-1" />{e.trainer_name}</span>
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
                            <div className="grid grid-cols-1 gap-2">
                              {cycles.filter((c) => c.enrollment_id === e.id).map((c) => (
                                <div key={c.id} className="flex flex-wrap items-center justify-between p-2 rounded bg-background border border-border text-xs font-sans gap-2">
                                  <span className="shrink-0 text-[11px] sm:text-xs">Ciclo {c.cycle_number} — {safeFormatDate(c.start_date, "dd/MM")} a {safeFormatDate(c.end_date, "dd/MM/yy")}</span>
                                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    {c.has_workout ? (
                                      <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">Treino</Badge>
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
                                        {!c.has_workout && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-5 text-[10px] px-2 text-success border-success/30 hover:bg-success/10"
                                            onClick={async () => {
                                              if (!session?.user?.id) return;
                                              const { error } = await supabase.from("workouts").insert({
                                                cycle_id: c.id,
                                                title: `Treino Ciclo ${c.cycle_number}`,
                                                created_by: session.user.id,
                                                exercises: [],
                                              });
                                              if (error) {
                                                toast({ title: "Erro ao marcar como prescrito", description: error.message, variant: "destructive" });
                                              } else {
                                                toast({ title: "Ciclo marcado como prescrito!" });
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

            {/* Calendar */}
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-primary text-lg">CALENDÁRIO DE CICLOS</CardTitle></CardHeader>
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

          {/* ===== TREINOS ===== */}
          <TabsContent value="workouts" className="space-y-4">
            {(() => {
              const activeEnroll = enrollments.find(e => e.status === "active" || e.status === "awaiting_training");
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
              const prefix = role === "master" ? "/admin" : `/${role}`;
              return (
                <div className="space-y-4">
                  {enrollCycles.map(cycle => {
                    const cycleWorkouts = (allWorkouts || []).filter((w: any) => w.cycle_id === cycle.id);
                    return (
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
                              {safeFormatDate(cycle.start_date, "dd/MM", { locale: ptBR })} — {safeFormatDate(cycle.end_date, "dd/MM", { locale: ptBR })}
                            </span>
                          </div>

                          {cycleWorkouts.length > 0 ? (
                            <div className="space-y-2">
                              {cycleWorkouts.map((w: any) => {
                                const exercises = (w.exercises as any[]) || [];
                                return (
                                  <div key={w.id} className="flex items-center justify-between bg-secondary/30 rounded-md px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="h-4 w-4 text-primary" />
                                      <span className="text-sm font-sans text-foreground">{w.title || `Treino ${w.name}`}</span>
                                      <Badge variant="outline" className="text-[10px]">{exercises.length} ex.</Badge>
                                    </div>
                                  </div>
                                );
                              })}
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
                              variant={cycleWorkouts.length > 0 ? "outline" : "default"}
                              onClick={() => navigate(`${prefix}/workout/${cycle.id}`)}
                            >
                              {cycleWorkouts.length > 0 ? (
                                <><Edit className="h-3.5 w-3.5 mr-1" />Editar Treinos</>
                              ) : (
                                <><Plus className="h-3.5 w-3.5 mr-1" />Prescrever Treino</>
                              )}
                            </Button>
                          </div>

                          {/* BodyMap por treino */}
                          {cycleWorkouts.length > 0 && (
                            <Suspense fallback={<InlineFallback />}>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-border/50">
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
                                      <p className="text-xs font-sans font-medium text-muted-foreground">{w.title || `Treino ${w.name}`}</p>
                                      <BodyMap muscleVolumes={muscleVolumes} />
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
              );
            })()}
          </TabsContent>

          {/* ===== ANÁLISES ===== */}
          <TabsContent value="analytics" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              <TrainerWeeklyBar studentId={id!} />
              <WorkoutAnalysis studentId={id!} />
            </Suspense>
          </TabsContent>

          {/* ===== ANAMNESE ===== */}
          <TabsContent value="anamnesis">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-primary text-lg">ANAMNESE</CardTitle>
                <Button variant="ghost" size="sm" onClick={openEditAnamnesis}>
                  <Pencil className="h-4 w-4 mr-1" />{anamnesis ? "Editar" : "Adicionar"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 text-sm font-sans">
                {!anamnesis ? (
                  <p className="text-muted-foreground">Nenhuma anamnese preenchida. Clique em "Adicionar" para preencher.</p>
                ) : (
                  <>
                    {anamnesis.modalities && (Array.isArray(anamnesis.modalities) ? anamnesis.modalities.length > 0 : anamnesis.modalities) && <div><span className="font-medium text-foreground">Modalidades:</span> <span className="text-muted-foreground">{Array.isArray(anamnesis.modalities) ? anamnesis.modalities.join(", ") : anamnesis.modalities}</span></div>}
                    {anamnesis.training_days && <div><span className="font-medium text-foreground">Dias de treino:</span> <span className="text-muted-foreground">{anamnesis.training_days}</span></div>}
                    {anamnesis.available_days != null && <div><span className="font-medium text-foreground">Dias disponíveis p/ BN:</span> <span className="text-muted-foreground">{anamnesis.available_days}</span></div>}
                    {anamnesis.session_duration && <div><span className="font-medium text-foreground">Tempo por sessão:</span> <span className="text-muted-foreground">{anamnesis.session_duration}</span></div>}
                    {anamnesis.training_location && <div><span className="font-medium text-foreground">Local de treino:</span> <span className="text-muted-foreground">{anamnesis.training_location}</span></div>}
                    {anamnesis.available_equipment && (Array.isArray(anamnesis.available_equipment) ? anamnesis.available_equipment.length > 0 : anamnesis.available_equipment) && <div><span className="font-medium text-foreground">Equipamentos:</span> <span className="text-muted-foreground">{Array.isArray(anamnesis.available_equipment) ? anamnesis.available_equipment.join(", ") : anamnesis.available_equipment}</span></div>}
                    {anamnesis.goals && <div><span className="font-medium text-foreground">Metas:</span> <span className="text-muted-foreground">{anamnesis.goals}</span></div>}
                    {anamnesis.diseases && <div><span className="font-medium text-foreground">Doenças/Remédios:</span> <span className="text-muted-foreground">{anamnesis.diseases}</span></div>}
                    {anamnesis.injuries && <div><span className="font-medium text-foreground">Lesões:</span> <span className="text-muted-foreground">{anamnesis.injuries}</span></div>}
                    {anamnesis.current_pain && <div><span className="font-medium text-foreground">Dores atuais:</span> <span className="text-muted-foreground">{anamnesis.current_pain}</span></div>}
                    {anamnesis.nutrition && <div><span className="font-medium text-foreground">Alimentação:</span> <span className="text-muted-foreground">{anamnesis.nutrition}</span></div>}
                    {anamnesis.profession && <div><span className="font-medium text-foreground">Profissão/Rotina:</span> <span className="text-muted-foreground">{anamnesis.profession}</span></div>}
                    {anamnesis.sleep_hours && <div><span className="font-medium text-foreground">Sono:</span> <span className="text-muted-foreground">{anamnesis.sleep_hours}</span></div>}
                    {anamnesis.restorative_sleep != null && <div><span className="font-medium text-foreground">Sono reparador:</span> <span className="text-muted-foreground">{anamnesis.restorative_sleep ? "Sim" : "Não"}</span></div>}
                    {anamnesis.aware_of_trilogy != null && <div><span className="font-medium text-foreground">Consciente da tríade:</span> <span className="text-muted-foreground">{anamnesis.aware_of_trilogy ? "Sim" : "Não"}</span></div>}
                    {anamnesis.feel_in_3_months && <div><span className="font-medium text-foreground">Como quer se sentir em 3 meses:</span> <span className="text-muted-foreground">{anamnesis.feel_in_3_months}</span></div>}
                    {anamnesis.biggest_obstacle && <div><span className="font-medium text-foreground">Maior obstáculo:</span> <span className="text-muted-foreground">{anamnesis.biggest_obstacle}</span></div>}
                    {anamnesis.extra_comments && <div><span className="font-medium text-foreground">Comentários extras:</span> <span className="text-muted-foreground">{anamnesis.extra_comments}</span></div>}
                    {anamnesis.authorizes_plan != null && <div><span className="font-medium text-foreground">Autoriza criação do plano:</span> <span className="text-muted-foreground">{anamnesis.authorizes_plan ? "SIM" : "NÃO"}</span></div>}
                    {anamnesis.commits_communication != null && <div><span className="font-medium text-foreground">Compromete-se a comunicar:</span> <span className="text-muted-foreground">{anamnesis.commits_communication ? "SIM" : "NÃO"}</span></div>}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== FINANCEIRO ===== */}
          <TabsContent value="financial">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-primary text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />FINANCEIRO
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
          <TabsContent value="evaluations">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-primary text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />AVALIAÇÕES
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
                <div className="space-y-2"><Label className="font-sans">CEP</Label><Input value={studentForm.cep} onChange={e => setStudentForm({ ...studentForm, cep: formatCEP(e.target.value) })} className="bg-secondary border-border" placeholder="00000-000" /></div>
              </div>
              <div className="space-y-2"><Label className="font-sans">Rua</Label><Input value={studentForm.address} onChange={e => setStudentForm({ ...studentForm, address: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Número</Label><Input value={studentForm.address_number} onChange={e => setStudentForm({ ...studentForm, address_number: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">Bairro</Label><Input value={studentForm.neighborhood} onChange={e => setStudentForm({ ...studentForm, neighborhood: e.target.value })} className="bg-secondary border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Cidade</Label><Input value={studentForm.city} onChange={e => setStudentForm({ ...studentForm, city: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans">Estado</Label><Input value={studentForm.state} onChange={e => setStudentForm({ ...studentForm, state: e.target.value })} className="bg-secondary border-border" maxLength={2} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans">Data de nascimento</Label><Input type="date" value={studentForm.birth_date} onChange={e => setStudentForm({ ...studentForm, birth_date: e.target.value })} className="bg-secondary border-border" /></div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Status</Label>
                <Select value={studentForm.status} onValueChange={v => setStudentForm({ ...studentForm, status: v })}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
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

        {/* Edit Anamnesis Dialog */}
        <Dialog open={editAnamnesisOpen} onOpenChange={setEditAnamnesisOpen}>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader><DialogTitle className="text-primary">{anamnesis ? "EDITAR ANAMNESE" : "ADICIONAR ANAMNESE"}</DialogTitle></DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="font-sans font-medium">Modalidades</Label>
                <div className="grid grid-cols-2 gap-2">{MODALITY_OPTIONS.map(m => (<label key={m} className="flex items-center gap-2 text-sm font-sans cursor-pointer"><Checkbox checked={anamnesisForm.modalities.includes(m)} onCheckedChange={() => toggleAnamnesisArray("modalities", m)} />{m}</label>))}</div>
              </div>
              <div className="space-y-2"><Label className="font-sans font-medium">Dias de treino</Label><Textarea value={anamnesisForm.training_days} onChange={e => setAnamnesisForm({ ...anamnesisForm, training_days: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans font-medium">Dias disponíveis p/ BN</Label><Input type="number" min={0} max={7} value={anamnesisForm.available_days} onChange={e => setAnamnesisForm({ ...anamnesisForm, available_days: e.target.value })} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label className="font-sans font-medium">Tempo por sessão</Label><Select value={anamnesisForm.session_duration} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, session_duration: v })}><SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{SESSION_DURATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label className="font-sans font-medium">Local de treino</Label><Select value={anamnesisForm.training_location} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, training_location: v })}><SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{TRAINING_LOCATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Equipamentos disponíveis</Label><div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">{EQUIPMENT_OPTIONS.map(e => (<label key={e} className="flex items-center gap-2 text-sm font-sans cursor-pointer"><Checkbox checked={anamnesisForm.available_equipment.includes(e)} onCheckedChange={() => toggleAnamnesisArray("available_equipment", e)} />{e}</label>))}</div></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Metas</Label><Textarea value={anamnesisForm.goals} onChange={e => setAnamnesisForm({ ...anamnesisForm, goals: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Doenças/Remédios</Label><Textarea value={anamnesisForm.diseases} onChange={e => setAnamnesisForm({ ...anamnesisForm, diseases: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Lesões</Label><Textarea value={anamnesisForm.injuries} onChange={e => setAnamnesisForm({ ...anamnesisForm, injuries: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Dores atuais</Label><Textarea value={anamnesisForm.current_pain} onChange={e => setAnamnesisForm({ ...anamnesisForm, current_pain: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Alimentação</Label><Textarea value={anamnesisForm.nutrition} onChange={e => setAnamnesisForm({ ...anamnesisForm, nutrition: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Profissão/Rotina</Label><Textarea value={anamnesisForm.profession} onChange={e => setAnamnesisForm({ ...anamnesisForm, profession: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans font-medium">Horas de sono</Label><Select value={anamnesisForm.sleep_hours} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, sleep_hours: v })}><SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{SLEEP_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="font-sans font-medium">Sono reparador?</Label><RadioGroup value={anamnesisForm.restorative_sleep} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, restorative_sleep: v })}><div className="flex gap-4"><div className="flex items-center gap-1"><RadioGroupItem value="sim" id="ed-rs-s" /><Label htmlFor="ed-rs-s" className="font-sans font-normal">Sim</Label></div><div className="flex items-center gap-1"><RadioGroupItem value="nao" id="ed-rs-n" /><Label htmlFor="ed-rs-n" className="font-sans font-normal">Não</Label></div></div></RadioGroup></div>
              </div>
              <div className="space-y-2"><Label className="font-sans font-medium">Consciente da tríade?</Label><RadioGroup value={anamnesisForm.aware_of_trilogy} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, aware_of_trilogy: v })}><div className="flex gap-4"><div className="flex items-center gap-1"><RadioGroupItem value="sim" id="ed-at-s" /><Label htmlFor="ed-at-s" className="font-sans font-normal">Sim</Label></div><div className="flex items-center gap-1"><RadioGroupItem value="nao" id="ed-at-n" /><Label htmlFor="ed-at-n" className="font-sans font-normal">Não</Label></div></div></RadioGroup></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Como quer se sentir em 3 meses</Label><Textarea value={anamnesisForm.feel_in_3_months} onChange={e => setAnamnesisForm({ ...anamnesisForm, feel_in_3_months: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Maior obstáculo</Label><Textarea value={anamnesisForm.biggest_obstacle} onChange={e => setAnamnesisForm({ ...anamnesisForm, biggest_obstacle: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label className="font-sans font-medium">Comentários extras</Label><Textarea value={anamnesisForm.extra_comments} onChange={e => setAnamnesisForm({ ...anamnesisForm, extra_comments: e.target.value })} className="bg-secondary border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-sans font-medium">Autoriza plano?</Label><RadioGroup value={anamnesisForm.authorizes_plan} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, authorizes_plan: v })}><div className="flex gap-4"><div className="flex items-center gap-1"><RadioGroupItem value="sim" id="ed-ap-s" /><Label htmlFor="ed-ap-s" className="font-sans font-normal">Sim</Label></div><div className="flex items-center gap-1"><RadioGroupItem value="nao" id="ed-ap-n" /><Label htmlFor="ed-ap-n" className="font-sans font-normal">Não</Label></div></div></RadioGroup></div>
                <div className="space-y-2"><Label className="font-sans font-medium">Compromete-se a comunicar?</Label><RadioGroup value={anamnesisForm.commits_communication} onValueChange={v => setAnamnesisForm({ ...anamnesisForm, commits_communication: v })}><div className="flex gap-4"><div className="flex items-center gap-1"><RadioGroupItem value="sim" id="ed-cc-s" /><Label htmlFor="ed-cc-s" className="font-sans font-normal">Sim</Label></div><div className="flex items-center gap-1"><RadioGroupItem value="nao" id="ed-cc-n" /><Label htmlFor="ed-cc-n" className="font-sans font-normal">Não</Label></div></div></RadioGroup></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAnamnesisOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveAnamnesis} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
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
    </AppLayout>
  );
}
