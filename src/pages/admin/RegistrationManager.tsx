import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  CreditCard,
  FileCheck2,
  Link2,
  Loader2,
  MessageCircle,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPlansLink, openStudentChat } from "@/lib/studentChat";
import {
  fiscalRegistrationUrl,
  preRegistrationUrl,
} from "@/lib/publicFlowLinks";
import { cn } from "@/lib/utils";
import {
  FUNNEL_STAGE_META,
  FUNNEL_STAGE_ORDER,
  type FunnelStageKey,
  funnelStageProgress,
  isOpenFunnelStage,
  normalizeSalesStage,
  stageNextAction,
} from "@/lib/salesFunnelView";

const BUDGET_LABELS: Record<string, string> = {
  "200_300": "R$ 200-300",
  "300_400": "R$ 300-400",
  "400_500": "R$ 400-500",
};

const CONTACT_PERIOD_LABELS: Record<string, string> = {
  morning: "manha",
  afternoon: "tarde",
  evening: "noite",
};

const WAIT_FILTERS: Record<string, { label: string; minHours: number }> = {
  "24h": { label: "24h+", minHours: 24 },
  "3d": { label: "3 dias+", minHours: 72 },
  "7d": { label: "7 dias+", minHours: 168 },
};

interface Student {
  entityType: "student" | "lead";
  leadId?: string;
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  status: string | null;
  sales_stage: string | null;
  fiscal_completed_at: string | null;
  payment_link_sent_at: string | null;
  activated_at: string | null;
  assessment_due_at: string | null;
  onboarding_instructions_sent_at: string | null;
  selected_plan_id: string | null;
  assigned_trainer_id: string | null;
  created_at: string;
  updated_at: string | null;
  hasAnamnesis?: boolean;
  hasAssessment?: boolean;
  latestEvent?: FunnelEvent | null;
  budget_range?: string | null;
  preferred_contact_period?: string | null;
  contact_outcome?: string | null;
  pre_registration_answers?: Record<string, unknown> | null;
}

interface LeadRow {
  id: string;
  full_name: string;
  phone: string | null;
  stage: string | null;
  budget_range: string | null;
  preferred_contact_period: string | null;
  contact_outcome: string | null;
  pre_registration_answers: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

interface FunnelEvent {
  id: string;
  student_id: string;
  event_type: string;
  status: "processing" | "completed" | "failed";
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

type StudentWithStage = Student & { stage: FunnelStageKey; nextAction: string; progress: number };

function waDigits(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return d;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "tudo bem";
}

function formatDate(value?: string | null) {
  if (!value) return "nao registrado";
  try {
    return format(new Date(value), "dd/MM HH:mm", { locale: ptBR });
  } catch {
    return "nao registrado";
  }
}

function relativeDate(value?: string | null) {
  if (!value) return "sem data";
  try {
    return formatDistanceToNow(new Date(value), { locale: ptBR, addSuffix: true });
  } catch {
    return "sem data";
  }
}

function stageTone(stage: FunnelStageKey) {
  const tones: Record<FunnelStageKey, string> = {
    interested: "border-sky-200 bg-sky-50/70 text-sky-800",
    contacted: "border-cyan-200 bg-cyan-50/70 text-cyan-800",
    fiscal_registration_pending: "border-violet-200 bg-violet-50/70 text-violet-800",
    payment_pending: "border-amber-200 bg-amber-50/75 text-amber-800",
    active_onboarding: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    active: "border-slate-200 bg-slate-50 text-slate-700",
    lost: "border-rose-200 bg-rose-50/70 text-rose-800",
  };
  return tones[stage];
}

function stageIcon(stage: FunnelStageKey) {
  if (stage === "contacted") return MessageCircle;
  if (stage === "fiscal_registration_pending") return FileCheck2;
  if (stage === "payment_pending") return CreditCard;
  if (stage === "active_onboarding") return ClipboardCheck;
  if (stage === "active") return CheckCircle2;
  if (stage === "lost") return ArrowLeft;
  return UserPlus;
}

function waitHours(student: Student) {
  const reference = student.updated_at || student.created_at;
  return Math.max(0, (Date.now() - new Date(reference).getTime()) / (60 * 60 * 1000));
}

function waitLabel(student: Student) {
  const hours = waitHours(student);
  if (hours < 24) return `${Math.max(1, Math.floor(hours))}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function RegistrationManager() {
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : companyId ?? null;
  const navigate = useNavigate();
  const chatRoutePrefix = role === "master" ? "admin" : role || "admin";

  const [generalLink, setGeneralLink] = useState(preRegistrationUrl(window.location.origin));
  const [students, setStudents] = useState<Student[]>([]);
  const [phone, setPhone] = useState("");
  const [fiscalStudentId, setFiscalStudentId] = useState("");
  const [fiscalPhone, setFiscalPhone] = useState("");
  const [fiscalLink, setFiscalLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [fiscalCopied, setFiscalCopied] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<FunnelStageKey | "all">("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [waitFilter, setWaitFilter] = useState("all");

  const loadPipeline = async () => {
    if (!effectiveCompanyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const companyResult = await (supabase as any)
        .from("companies")
        .select("slug")
        .eq("id", effectiveCompanyId)
        .maybeSingle();
      const companyLink = preRegistrationUrl(window.location.origin, companyResult.data?.slug);
      setGeneralLink(companyLink);

      const [studentResult, leadResult] = await Promise.all([
        (supabase as any)
          .from("students")
          .select([
            "id",
            "full_name",
            "phone",
            "whatsapp",
            "email",
            "status",
            "sales_stage",
            "fiscal_completed_at",
            "payment_link_sent_at",
            "activated_at",
            "assessment_due_at",
            "onboarding_instructions_sent_at",
            "selected_plan_id",
            "assigned_trainer_id",
            "created_at",
            "updated_at",
          ].join(", "))
          .eq("company_id", effectiveCompanyId)
          .order("created_at", { ascending: false })
          .limit(160),
        (supabase as any)
          .from("leads")
          .select("id, full_name, phone, stage, budget_range, preferred_contact_period, contact_outcome, pre_registration_answers, created_at, updated_at")
          .eq("company_id", effectiveCompanyId)
          .is("converted_to_student_id", null)
          .in("stage", ["interested", "contacted"])
          .order("created_at", { ascending: false })
          .limit(160),
      ]);
      if (studentResult.error) throw studentResult.error;
      if (leadResult.error) throw leadResult.error;

      const baseStudents = ((studentResult.data || []) as Omit<Student, "entityType">[]).map((student) => ({
        ...student,
        entityType: "student" as const,
      }));
      const leads = ((leadResult.data || []) as LeadRow[]).map((lead): Student => ({
        entityType: "lead",
        leadId: lead.id,
        id: lead.id,
        full_name: lead.full_name,
        phone: lead.phone,
        whatsapp: lead.phone,
        email: null,
        status: "interested",
        sales_stage: lead.stage === "contacted" ? "contacted" : "interested",
        fiscal_completed_at: null,
        payment_link_sent_at: null,
        activated_at: null,
        assessment_due_at: null,
        onboarding_instructions_sent_at: null,
        selected_plan_id: null,
        assigned_trainer_id: null,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
        hasAnamnesis: true,
        hasAssessment: false,
        budget_range: lead.budget_range,
        preferred_contact_period: lead.preferred_contact_period,
        contact_outcome: lead.contact_outcome,
        pre_registration_answers: lead.pre_registration_answers,
      }));
      const ids = baseStudents.map((student) => student.id);
      if (ids.length === 0) {
        setStudents(leads);
        return;
      }

      const [eventResult, anamnesisResult, assessmentResult] = await Promise.all([
        (supabase as any)
          .from("student_funnel_events")
          .select("id, student_id, event_type, status, error, created_at, processed_at")
          .eq("company_id", effectiveCompanyId)
          .in("student_id", ids)
          .order("created_at", { ascending: false })
          .limit(240),
        (supabase as any)
          .from("student_anamneses")
          .select("student_id")
          .eq("company_id", effectiveCompanyId)
          .in("student_id", ids),
        (supabase as any)
          .from("functional_assessments")
          .select("student_id")
          .eq("company_id", effectiveCompanyId)
          .in("student_id", ids),
      ]);

      if (eventResult.error) console.warn("registration funnel events unavailable", eventResult.error);
      if (anamnesisResult.error) console.warn("registration anamneses unavailable", anamnesisResult.error);
      if (assessmentResult.error) console.warn("registration assessments unavailable", assessmentResult.error);
      const latestEventByStudent = new Map<string, FunnelEvent>();
      ((eventResult.error ? [] : eventResult.data || []) as FunnelEvent[]).forEach((event) => {
        if (!latestEventByStudent.has(event.student_id)) latestEventByStudent.set(event.student_id, event);
      });
      const anamnesisStudents = new Set((anamnesisResult.error ? [] : anamnesisResult.data || []).map((row: any) => row.student_id));
      const assessedStudents = new Set((assessmentResult.error ? [] : assessmentResult.data || []).map((row: any) => row.student_id));

      setStudents([...leads, ...baseStudents.map((student) => ({
        ...student,
        hasAnamnesis: anamnesisStudents.has(student.id),
        hasAssessment: assessedStudents.has(student.id),
        latestEvent: latestEventByStudent.get(student.id) || null,
      }))]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel carregar os cadastros.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompanyId]);

  const stagedStudents = useMemo<StudentWithStage[]>(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const budgetPriority: Record<string, number> = { "400_500": 3, "300_400": 2, "200_300": 1 };
    return students
      .map((student) => {
        const stage = normalizeSalesStage(student);
        const nextAction = stageNextAction(student, {
          hasAnamnesis: student.hasAnamnesis,
          hasAssessment: student.hasAssessment,
        });
        return { ...student, stage, nextAction, progress: funnelStageProgress(stage) };
      })
      .filter((student) => {
        if (activeStage !== "all" && student.stage !== activeStage) return false;
        if (budgetFilter !== "all" && student.budget_range !== budgetFilter) return false;
        if (waitFilter !== "all") {
          const filter = WAIT_FILTERS[waitFilter];
          if (filter && waitHours(student) < filter.minHours) return false;
        }
        if (isOpenFunnelStage(student.stage)) return true;
        if (student.stage === "active_onboarding") return true;
        if (student.stage === "active" && student.activated_at) return new Date(student.activated_at).getTime() >= thirtyDaysAgo;
        return false;
      })
      .sort((a, b) => {
        if (a.entityType === "lead" || b.entityType === "lead") {
          const priority = (budgetPriority[b.budget_range || ""] || 0) - (budgetPriority[a.budget_range || ""] || 0);
          if (priority !== 0) return priority;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [students, activeStage, budgetFilter, waitFilter]);

  const studentsByStage = useMemo(() => {
    const grouped = new Map<FunnelStageKey, StudentWithStage[]>();
    FUNNEL_STAGE_ORDER.forEach((stage) => grouped.set(stage, []));
    stagedStudents.forEach((student) => grouped.get(student.stage)?.push(student));
    return grouped;
  }, [stagedStudents]);

  const createFiscalLinkForStudent = async (id: string): Promise<string> => {
    setCreatingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-registration", {
        body: { action: "create-link", studentId: id },
      });
      if (error || !data?.token) {
        throw new Error(data?.error || error?.message || "Nao foi possivel criar o link fiscal.");
      }
      return fiscalRegistrationUrl(window.location.origin, data.token);
    } finally {
      setCreatingLink(false);
    }
  };

  const ensureFiscalLink = async () => {
    if (!fiscalStudentId) throw new Error("Selecione a pessoa que receberá o cadastro.");
    if (fiscalLink) return fiscalLink;
    const personalized = await createFiscalLinkForStudent(fiscalStudentId);
    setFiscalLink(personalized);
    await loadPipeline();
    return personalized;
  };

  const openChatWithStudent = async (student: Student, message: string) => {
    const digits = waDigits(student.whatsapp || student.phone || phone);
    await openStudentChat({
      navigate,
      routePrefix: chatRoutePrefix,
      studentId: student.entityType === "student" ? student.id : null,
      phone: digits,
      message,
      onNoChat: () => toast.error("Informe um telefone valido para abrir a conversa interna."),
    });
  };

  const handleStageAction = async (student: StudentWithStage) => {
    try {
      if (student.entityType === "lead" && student.stage === "interested") {
        const { data, error } = await supabase.functions.invoke("public-registration", {
          body: { action: "mark-lead-contacted", leadId: student.leadId || student.id, outcome: "in_conversation" },
        });
        if (error || !data?.id) throw new Error(data?.error || error?.message || "Não foi possível registrar o contato.");
        await openChatWithStudent(
          student,
          `Oi, ${firstName(student.full_name)}! Recebi seu pré-cadastro. Vi seu objetivo e queria entender alguns detalhes pra te orientar no plano ideal e na avaliação de movimento. Posso te chamar agora?`,
        );
        await loadPipeline();
        return;
      }

      if (student.entityType === "lead" && student.stage === "contacted") {
        const { data, error } = await supabase.functions.invoke("public-registration", {
          body: { action: "convert-lead", leadId: student.leadId || student.id },
        });
        if (error || !data?.token || !data?.studentId) throw new Error(data?.error || error?.message || "Não foi possível iniciar o cadastro fiscal.");
        const fiscalLink = fiscalRegistrationUrl(window.location.origin, data.token);
        await openStudentChat({
          navigate,
          routePrefix: chatRoutePrefix,
          studentId: data.studentId,
          phone: waDigits(student.whatsapp || student.phone),
          message: `Oi, ${firstName(student.full_name)}! Vamos seguir com seu cadastro BN. Nesse link voce completa os dados fiscais que o Asaas precisa para nota e pagamento: ${fiscalLink}\n\nDepois dele voce escolhe o plano e faz o Pix pelo Asaas. Em seguida eu te mando/confirmo as instrucoes da Avaliacao de Movimento; depois do pagamento confirmado, o prazo para avaliacao e inicio do treino e de ate 5 dias uteis.`,
          onNoChat: () => toast.error("Informe um telefone válido para abrir a conversa interna."),
        });
        await loadPipeline();
        return;
      }

      if (student.stage === "fiscal_registration_pending") {
        const fiscalLink = await createFiscalLinkForStudent(student.id);
        await openChatWithStudent(
          student,
          `Oi, ${firstName(student.full_name)}! Passando novamente seu cadastro fiscal: ${fiscalLink}\n\nEle libera a escolha do plano e o pagamento Pix pelo Asaas. Assim que o pagamento confirmar, voce entra no onboarding de avaliacao de movimento e inicio do treino.`,
        );
        await loadPipeline();
        return;
      }

      if (student.stage === "payment_pending") {
        const paymentLink = await createPlansLink(student.id);
        await openChatWithStudent(
          student,
          `Oi, ${firstName(student.full_name)}! Seu cadastro fiscal esta concluido. Agora escolha seu plano e faca o pagamento com Pix pelo Asaas: ${paymentLink}\n\nDepois da confirmacao, voce passa para aluno ativo e recebe as instrucoes finais da Avaliacao de Movimento. O prazo para avaliacao e inicio do treino e de ate 5 dias uteis.`,
        );
        return;
      }

      if (student.stage === "active_onboarding") {
        const due = student.assessment_due_at
          ? format(new Date(`${student.assessment_due_at}T00:00:00`), "dd/MM/yyyy", { locale: ptBR })
          : "em ate 5 dias uteis";
        await openChatWithStudent(
          student,
          `Oi, ${firstName(student.full_name)}! Pagamento confirmado. O proximo passo e a avaliacao de movimento. Me envie os videos/fotos conforme as instrucoes; o prazo para avaliacao e inicio do treino e ${due}.`,
        );
        return;
      }

      if (student.entityType === "student") navigate(`/${chatRoutePrefix}/students/${student.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel executar a acao.");
    }
  };

  const sendPreRegistrationLink = async () => {
    const digits = waDigits(phone);
    if (!digits) {
      toast.error("Digite um WhatsApp para enviar o link universal.");
      return;
    }
    await openStudentChat({
      navigate,
      routePrefix: chatRoutePrefix,
      studentId: null,
      phone: digits,
      message: `Oi! Para aplicar para o acompanhamento da BN, preencha este pré-cadastro rapidinho: ${generalLink}\n\nDepois que voce enviar, seu perfil entra na nossa lista de interessados e a equipe chama voce por aqui para seguir com cadastro, plano, pagamento Asaas e avaliacao de movimento.`,
      onNoChat: () => toast.error("Informe um telefone valido para abrir a conversa interna."),
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(generalLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Link universal copiado!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel copiar o link.");
    }
  };

  const sendFiscalRegistrationLink = async () => {
    try {
      const selected = students.find((student) => student.entityType === "student" && student.id === fiscalStudentId);
      if (!selected) throw new Error("Selecione a pessoa que receberá o cadastro.");
      const targetLink = await ensureFiscalLink();
      await openStudentChat({
        navigate,
        routePrefix: chatRoutePrefix,
        studentId: selected.id,
        phone: waDigits(fiscalPhone || selected.whatsapp || selected.phone),
        message: `Oi, ${firstName(selected.full_name)}! Agora vamos completar seu cadastro com os dados fiscais que o Asaas precisa. Depois você escolhe o plano e faz o pagamento por aqui: ${targetLink}`,
        onNoChat: () => toast.error("Informe um telefone válido para abrir a conversa interna."),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o cadastro fiscal.");
    }
  };

  const copyFiscalRegistrationLink = async () => {
    try {
      const targetLink = await ensureFiscalLink();
      await navigator.clipboard?.writeText(targetLink);
      setFiscalCopied(true);
      setTimeout(() => setFiscalCopied(false), 1500);
      toast.success("Link de cadastro fiscal copiado!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o cadastro fiscal.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-eyebrow">Cadastro e fechamento</p>
          <h1 className="font-display text-3xl text-primary">Novos cadastros</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            Do pré-cadastro ao primeiro treino, sem contar interessados como alunos antes da hora.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-primary/20 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Link universal de pré-cadastro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-secondary/35 p-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-mono-data text-xs text-muted-foreground">{generalLink}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Este é o primeiro passo para qualquer pessoa. Ela responde o pré-cadastro, vira interessada na esteira e só depois recebe cadastro fiscal, plano e pagamento.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1.5">
              <Label>Enviar para um WhatsApp avulso</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(DDD) 9 xxxx-xxxx" inputMode="tel" />
            </div>
            <Button onClick={sendPreRegistrationLink} className="self-end bg-[#25D366] text-white hover:bg-[#25D366]/90">
              <MessageCircle className="mr-2 h-4 w-4" />
              Abrir conversa
            </Button>
            <Button variant="outline" onClick={copyLink} className="self-end">
              {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cadastro fiscal, escolha do plano e pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta é a segunda etapa. Use depois do pré-cadastro e do primeiro contato para coletar os dados do Asaas, liberar os planos e seguir para o pagamento.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pessoa</Label>
              <Select
                value={fiscalStudentId}
                onValueChange={(id) => {
                  const selected = students.find((student) => student.entityType === "student" && student.id === id);
                  setFiscalStudentId(id);
                  setFiscalPhone(selected?.whatsapp || selected?.phone || "");
                  setFiscalLink("");
                  setFiscalCopied(false);
                }}
              >
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione para gerar o link individual..." /></SelectTrigger>
                <SelectContent>
                  {students.filter((student) =>
                    student.entityType === "student"
                    && !["active", "awaiting_renewal"].includes(student.status),
                  ).map((student) => {
                    const stage = normalizeSalesStage(student);
                    return (
                      <SelectItem key={student.id} value={student.id}>
                        {student.full_name} - {FUNNEL_STAGE_META[stage].label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={fiscalPhone} onChange={(event) => setFiscalPhone(event.target.value)} placeholder="(DDD) 9 xxxx-xxxx" inputMode="tel" />
            </div>
          </div>

          {fiscalLink && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/35 p-3">
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-mono-data text-xs text-muted-foreground">{fiscalLink}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={sendFiscalRegistrationLink} disabled={!fiscalStudentId || creatingLink} className="bg-[#25D366] text-white hover:bg-[#25D366]/90">
              {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              Abrir conversa com cadastro
            </Button>
            <Button variant="outline" onClick={copyFiscalRegistrationLink} disabled={!fiscalStudentId || creatingLink}>
              {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : fiscalCopied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar link de cadastro
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl text-foreground">Esteira de fechamento</h2>
            <p className="text-sm text-muted-foreground">
              Os cartoes mostram a etapa atual, a ultima acao registrada e o proximo movimento.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={activeStage === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveStage("all")}
            >
              Todos
            </Button>
            {FUNNEL_STAGE_ORDER.filter((stage) => stage !== "lost").map((stage) => (
              <Button
                key={stage}
                variant={activeStage === stage ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveStage(stage)}
              >
                {FUNNEL_STAGE_META[stage].shortLabel}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Faixa de investimento</Label>
            <Select value={budgetFilter} onValueChange={setBudgetFilter}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as faixas</SelectItem>
                <SelectItem value="400_500">R$ 400-500 primeiro</SelectItem>
                <SelectItem value="300_400">R$ 300-400</SelectItem>
                <SelectItem value="200_300">R$ 200-300</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tempo de espera</Label>
            <Select value={waitFilter} onValueChange={setWaitFilter}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer tempo</SelectItem>
                {Object.entries(WAIT_FILTERS).map(([value, item]) => (
                  <SelectItem key={value} value={value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando esteira
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-6">
            {FUNNEL_STAGE_ORDER.filter((stage) => stage !== "lost").map((stage) => {
              const Icon = stageIcon(stage);
              const rows = studentsByStage.get(stage) || [];
              return (
                <div key={stage} className="min-h-[220px] rounded-lg border border-border bg-background">
                  <div className={cn("border-b px-3 py-3", stageTone(stage))}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" />
                          <h3 className="truncate text-sm font-semibold text-foreground">{FUNNEL_STAGE_META[stage].label}</h3>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{FUNNEL_STAGE_META[stage].description}</p>
                      </div>
                      <span className="rounded-full bg-background/80 px-2 py-0.5 font-mono-data text-xs text-foreground">
                        {rows.length}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[560px] space-y-2 overflow-auto p-2">
                    {rows.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                        Sem pessoas aqui.
                      </p>
                    ) : rows.map((student) => (
                      <div
                        key={student.id}
                        role="button"
                        tabIndex={0}
                        className="w-full rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/45 hover:bg-primary/5"
                        onClick={() => {
                          if (student.entityType === "student") navigate(`/${chatRoutePrefix}/students/${student.id}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (student.entityType === "student") navigate(`/${chatRoutePrefix}/students/${student.id}`);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{student.full_name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Entrou {relativeDate(student.created_at)}</p>
                          </div>
                          <Badge variant="outline" className={cn("shrink-0 border", stageTone(student.stage))}>
                            {FUNNEL_STAGE_META[student.stage].shortLabel}
                          </Badge>
                        </div>

                        <Progress value={student.progress} className="mt-3 h-1.5" />

                        {student.entityType === "lead" ? (
                          <div className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">
                            <div className="flex justify-between gap-2">
                              <span>Investimento</span>
                              <span className="font-mono-data">{BUDGET_LABELS[student.budget_range || ""] || "não informado"}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Melhor contato</span>
                              <span className="font-mono-data">{CONTACT_PERIOD_LABELS[student.preferred_contact_period || ""] || "não informado"}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Espera</span>
                              <span className="font-mono-data">{waitLabel(student)}</span>
                            </div>
                            {student.stage === "contacted" && (
                              <div className="space-y-1 pt-1">
                                <span>Classificação</span>
                                <Select
                                  value={student.contact_outcome || "in_conversation"}
                                  onValueChange={async (outcome) => {
                                    const { error } = await supabase.functions.invoke("public-registration", {
                                      body: { action: "mark-lead-contacted", leadId: student.leadId || student.id, outcome },
                                    });
                                    if (error) toast.error("Não foi possível atualizar a classificação.");
                                    else await loadPipeline();
                                  }}
                                >
                                  <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="in_conversation">Em conversa</SelectItem>
                                    <SelectItem value="no_response">Sem resposta</SelectItem>
                                    <SelectItem value="follow_up">Retornar depois</SelectItem>
                                    <SelectItem value="qualified">Qualificado</SelectItem>
                                    <SelectItem value="not_fit">Sem perfil</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        ) : <div className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">
                          <div className="flex justify-between gap-2">
                            <span>Fiscal</span>
                            <span className="font-mono-data">{student.fiscal_completed_at ? "ok" : "pendente"}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Pagamento</span>
                            <span className="font-mono-data">{student.activated_at ? "confirmado" : student.payment_link_sent_at ? "link enviado" : "pendente"}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Anamnese</span>
                            <span className="font-mono-data">{student.hasAnamnesis ? "ok" : "pendente"}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Avaliacao</span>
                            <span className="font-mono-data">{student.hasAssessment ? "ok" : student.assessment_due_at ? `ate ${format(new Date(`${student.assessment_due_at}T00:00:00`), "dd/MM")}` : "pendente"}</span>
                          </div>
                        </div>}

                        {student.latestEvent && (
                          <div className={cn(
                            "mt-3 rounded-md border px-2 py-1.5 text-[11px]",
                            student.latestEvent.status === "failed"
                              ? "border-destructive/25 bg-destructive/5 text-destructive"
                              : "border-border bg-secondary/35 text-muted-foreground",
                          )}>
                            <p className="font-medium text-foreground">
                              Ultimo evento: {student.latestEvent.event_type.replace(/_/g, " ")}
                            </p>
                            <p>{student.latestEvent.status} - {formatDate(student.latestEvent.processed_at || student.latestEvent.created_at)}</p>
                            {student.latestEvent.error && <p className="line-clamp-2">{student.latestEvent.error}</p>}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="line-clamp-2 text-xs font-medium text-foreground">{student.nextAction}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 px-2 text-xs"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleStageAction(student);
                            }}
                          >
                            {student.stage === "active" ? "Abrir" : "Agir"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <div className="flex items-start gap-2">
          <UserRoundCheck className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Regra operacional</p>
            <p className="text-xs text-muted-foreground">
              O aluno so entra como ativo depois do pagamento Asaas. Antes disso, a esteira mostra se falta cadastro fiscal, checkout, Pix ou avaliacao.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
