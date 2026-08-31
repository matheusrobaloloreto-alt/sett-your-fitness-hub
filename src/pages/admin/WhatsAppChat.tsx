import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isChatViewportNearBottom, shouldAutoScrollChat } from "@/lib/chatScroll";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PreRegistrationDetails } from "@/components/admin/PreRegistrationDetails";
import {
  Send, Search, User, MessageSquare, Users,
  Paperclip, Filter, AlertTriangle, DollarSign, Calendar, Clock,
  Download, MailOpen, Mail, UserPlus, Pencil, X, Image, Mic,
  MessageCircle, ChevronDown, Tag, Trash2, Reply, Activity,
  ArrowLeft, Loader2, Maximize2, Minimize2,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays, isSameDay, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useLocation, useNavigate } from "react-router-dom";
import { interpolateTemplate } from "@/lib/templateVars";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { listStudentFiles } from "@/lib/studentFiles";
import { type FunnelStageStudent } from "@/lib/salesFunnelView";
import { businessDateYmd } from "@/lib/businessDate";
import { loadStudentPreRegistration } from "@/lib/preRegistrationData";
import type { PreRegistrationData } from "@/lib/preRegistration";
import {
  matchesWhatsAppStatusFilter,
  selectCurrentCycle,
  type WhatsAppStatusFilter,
} from "@/lib/whatsappAudience";
import {
  isUsableMediaUrl,
  normalizeWhatsAppPhoneKey,
  reconcileWhatsAppMessages,
  upsertWhatsAppMessage,
} from "@/lib/whatsappMessages";
import {
  describeWhatsAppMediaDelivery,
  resumableWhatsAppUpload,
  uploadWhatsAppMediaWith,
} from "@/lib/whatsappMediaUpload";
import { shouldOfferWhatsAppRecipientReview } from "@/lib/whatsappRecipientReview";
import { recordAppPerformanceSample } from "@/lib/appPerformanceTelemetry";

type Chat = {
  id: string;
  remote_jid: string;
  unread_count: number;
  last_message_at: string | null;
  student_id: string | null;
  instance_id: string;
  last_sender_id: string | null;
  contact_name: string | null;
  contact_photo: string | null;
  category: string | null;
  history_synced_at: string | null;
  student?: {
    full_name: string;
    whatsapp: string | null;
    category_id: string | null;
    status?: string | null;
    assigned_trainer_id?: string | null;
    sales_stage?: string | null;
    fiscal_completed_at?: string | null;
    payment_link_sent_at?: string | null;
    activated_at?: string | null;
    assessment_due_at?: string | null;
    onboarding_instructions_sent_at?: string | null;
  } | null;
  lastMessage?: string;
};

type Message = {
  id: string;
  content: string | null;
  source: string;
  type: string;
  created_at: string;
  timestamp: string | null;
  sender_id: string | null;
  media_url: string | null;
  media_type: string | null;
  media_storage_path?: string | null;
  message_id_external: string | null;
  quoted_message_id?: string | null;
  quoted_message_external_id?: string | null;
  quoted_message_preview?: string | null;
  quoted_message_source?: string | null;
};

type StudentContext = {
  cycleNumber: number;
  cycleStartDate: string;
  daysRemaining: number;
  paymentStatus: string;
  hasActiveWorkout: boolean;
  studentName: string;
  planName?: string;
  planValue?: number | null;
  dueDate?: string | null;
  enrollmentEndDate?: string | null;
};

type ChatScopeFilter = "all" | "unread" | "groups";
type ChatStatusFilter = WhatsAppStatusFilter;

type BulkFilters = {
  trainerId: string;
  status: string;
  categoryId: string;
  labelId: string;
  base: "all" | "current";
};

type TemplateItem = {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  color: string;
};

type LabelItem = {
  id: string;
  name: string;
  color: string;
};

type ChatNavigationState = {
  chatId?: string | null;
  studentId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  prefillMessage?: string | null;
};

type DraftRecipient = {
  remoteJid: string;
  studentId: string | null;
  contactName: string;
};

const MESSAGE_PAGE_SIZE = 100;
const EMPTY_CATEGORY_VALUE = "__none__";
const DEFAULT_CATEGORY: CategoryItem = {
  id: "default-regular",
  name: "regular",
  color: "#64748b",
};
const ALL_VALUE = "__all__";
const STATUS_FILTER_LABELS: Partial<Record<ChatStatusFilter, string>> = {
  active: "Ativos",
  leads: "Leads",
  renewal: "Renovação",
  pending: "Pendentes",
  assessment: "Avaliação",
};
const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
);

const getMessagePreview = (message: Message | null) => {
  if (!message) return "";
  const content = (message.content || "").trim();
  if (content) return content.length > 180 ? `${content.slice(0, 177)}...` : content;
  if (message.media_type || message.type !== "text") return "Mídia";
  return "Mensagem";
};

const formatMessageDay = (value: string) => {
  const date = new Date(value);
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

const formatMessageTimestamp = (value: string) => (
  format(new Date(value), "dd/MM/yyyy HH:mm")
);

const getMessageDateValue = (message: Pick<Message, "created_at" | "timestamp">) => {
  const value = message.timestamp || message.created_at;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? message.created_at : value;
};

const isAdministrativeRole = (role: string | null) => (
  role === "admin" || role === "master" || role === "coordinator"
);

export default function WhatsAppChat() {
  const { user, role: userRole, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = userRole === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const [chats, setChats] = useState<Chat[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  // Prefixo de rota para mandar o vídeo da avaliação pro Studio (master visualizando = admin).
  const studioRoutePrefix = userRole === "master" && isViewingCompany ? "admin" : (userRole || "admin");
  // Chat alvo vindo do CRM/dashboard (navigate("/admin/whatsapp-chat", { state: { chatId, prefillMessage } }))
  const navigationState = (location.state as ChatNavigationState | null) ?? null;
  const pendingChatIdRef = useRef<string | null>(navigationState?.chatId ?? null);
  const pendingStudentIdRef = useRef<string | null>(navigationState?.studentId ?? null);
  const pendingPhoneRef = useRef<string | null>(navigationState?.phone ?? null);
  const pendingContactNameRef = useRef<string | null>(navigationState?.contactName ?? null);
  // Mensagem pronta (rascunho) vinda de aniversário/renovação/anamnese — pré-preenche a caixa de texto, NÃO envia sozinha.
  const pendingPrefillRef = useRef<string | null>(navigationState?.prefillMessage ?? null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [draftRecipient, setDraftRecipient] = useState<DraftRecipient | null>(null);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const chatsLoadedRef = useRef(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);
  const performanceStartedAt = useRef(performance.now());
  const recordedChatPerformance = useRef(false);
  useEffect(() => {
    performanceStartedAt.current = performance.now();
    recordedChatPerformance.current = false;
  }, [effectiveCompanyId]);
  const selectedChatIdRef = useRef<string | null>(null);
  useEffect(() => { selectedChatIdRef.current = selectedChatId; }, [selectedChatId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [updatingUnreadChatId, setUpdatingUnreadChatId] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const messageRequestRef = useRef(0);
  const suppressMessageAutoScrollRef = useRef(false);
  const initialMessageAutoScrollRef = useRef(false);
  const forceOwnMessageAutoScrollRef = useRef(false);
  const messageViewportNearBottomRef = useRef(true);
  const chatRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historySyncAttemptsRef = useRef(new Set<string>());
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [studentContexts, setStudentContexts] = useState<Record<string, StudentContext>>({});
  const [chatLabels, setChatLabels] = useState<Record<string, string[]>>({});
  const [scopeFilter, setScopeFilter] = useState<ChatScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ChatStatusFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [noWorkoutOnly, setNoWorkoutOnly] = useState(false);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recipientReviewChatId, setRecipientReviewChatId] = useState<string | null>(null);
  const [unlinkingRecipient, setUnlinkingRecipient] = useState(false);
  const [mediaFallbacks, setMediaFallbacks] = useState<Record<string, string>>({});
  const [failedMediaFetches, setFailedMediaFetches] = useState<Record<string, true>>({});
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Record<string, true>>({});
  const avatarFetchesRef = useRef<Set<string>>(new Set());
  const avatarMissesRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isChatListCollapsed, setIsChatListCollapsed] = useState(false);
  const [isConversationCollapsed, setIsConversationCollapsed] = useState(false);
  const [isContextCollapsed, setIsContextCollapsed] = useState(false);
  const [selectedPreRegistration, setSelectedPreRegistration] = useState<PreRegistrationData | null>(null);
  const [preRegistrationLoading, setPreRegistrationLoading] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("");
  const templatePopoverRef = useRef<HTMLDivElement>(null);

  // Categories state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [availableLabels, setAvailableLabels] = useState<LabelItem[]>([]);
  const [chatCustomLabels, setChatCustomLabels] = useState<Record<string, string[]>>({}); // chatId -> label ids
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkFilters, setBulkFilters] = useState<BulkFilters>({
    trainerId: ALL_VALUE,
    status: ALL_VALUE,
    categoryId: ALL_VALUE,
    labelId: ALL_VALUE,
    base: "current",
  });
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [trainerFilterId, setTrainerFilterId] = useState(ALL_VALUE);

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  // Link student dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkStudents, setLinkStudents] = useState<{ id: string; full_name: string; whatsapp: string | null }[]>([]);

  const handleSaveName = async () => {
    if (!selectedChat || !editNameValue.trim()) {
      setEditingName(false);
      return;
    }
    const { error } = await supabase
      .from("whatsapp_chats")
      .update({ contact_name: editNameValue.trim() })
      .eq("id", selectedChat.id);
    if (error) {
      toast.error("Erro ao salvar nome");
    } else {
      setChats((prev) =>
        prev.map((c) => c.id === selectedChat.id ? { ...c, contact_name: editNameValue.trim() } : c)
      );
      toast.success("Nome atualizado");
    }
    setEditingName(false);
  };

  // Load chats - uses last_message column instead of N+1 queries
  const loadChats = useCallback(async () => {
    if (userRole === "master" && !effectiveCompanyId) {
      setChats([]);
      setChatLoadError(null);
      setLoadingChats(false);
      chatsLoadedRef.current = true;
      setChatsLoaded(true);
      return;
    }

    if (!chatsLoadedRef.current) setLoadingChats(true);
    setChatLoadError(null);
    let query = supabase
      .from("whatsapp_chats")
      .select("*, student:students(full_name, whatsapp, category_id, status, assigned_trainer_id, sales_stage, fiscal_completed_at, payment_link_sent_at, activated_at, assessment_due_at, onboarding_instructions_sent_at)")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);

    const { data: chatData, error } = await query;

    if (error) {
      if (!chatsLoadedRef.current) {
        setChatLoadError("Não foi possível carregar as conversas.");
      } else {
        console.error("Error refreshing WhatsApp chats:", error);
      }
    } else if (chatData) {
      const chatsWithPreview = chatData.map((chat) => ({
        ...chat,
        student: Array.isArray(chat.student) ? chat.student[0] : chat.student,
        lastMessage: chat.last_message || "",
      }));
      setChats(chatsWithPreview);
      if (!recordedChatPerformance.current) {
        recordedChatPerformance.current = true;
        void recordAppPerformanceSample({
          routeGroup: "trainer_whatsapp",
          metric: "content_ready",
          durationMs: performance.now() - performanceStartedAt.current,
          companyId: effectiveCompanyId,
        });
      }
    }
    setLoadingChats(false);
    chatsLoadedRef.current = true;
    setChatsLoaded(true);
  }, [effectiveCompanyId, userRole]);

  const scheduleChatsRefresh = useCallback(() => {
    if (chatRefreshTimerRef.current) return;
    chatRefreshTimerRef.current = setTimeout(() => {
      chatRefreshTimerRef.current = null;
      void loadChats();
    }, 600);
  }, [loadChats]);

  const loadSenderNames = useCallback(async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    if (profiles) {
      const map: Record<string, string> = {};
      for (const p of profiles) {
        if (p.user_id && p.full_name) map[p.user_id] = p.full_name;
      }
      setSenderNames(map);
    }
  }, []);

  const loadStudentData = useCallback(async (chatList: Chat[]) => {
    const studentChats = chatList.filter((c) => c.student_id);
    if (studentChats.length === 0) {
      setStudentContexts({});
      setChatLabels({});
      return;
    }

    const studentIds = [...new Set(studentChats.map((c) => c.student_id!))];

    let enrollQuery = supabase
      .from("enrollments")
      .select("id, student_id, status, training_start_date, end_date, plan_id, plans(name, price)")
      .in("student_id", studentIds)
      .in("status", ["active", "awaiting_training", "awaiting_renewal"])
      .order("end_date", { ascending: false, nullsFirst: false });
    if (effectiveCompanyId) enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);

    const { data: enrollments } = await enrollQuery;

    const enrollmentIds = (enrollments || []).map((e) => e.id);
    const { data: cycles } = enrollmentIds.length > 0
      ? await supabase.from("training_cycles").select("id, enrollment_id, cycle_number, start_date, end_date, status, prescribed_offline_at").in("enrollment_id", enrollmentIds).neq("status", "superseded")
      : { data: [] };

    const cycleIds = (cycles || []).map((c) => c.id);
    const { data: workouts } = cycleIds.length > 0
      ? await supabase.from("workouts").select("id, cycle_id, exercises").in("cycle_id", cycleIds)
      : { data: [] };

    const { data: payments } = await supabase
      .from("payments")
      .select("id, student_id, status, due_date")
      .in("student_id", studentIds)
      .not("status", "in", '("RECEIVED","CONFIRMED","RECEIVED_IN_CASH")');

    const contexts: Record<string, StudentContext> = {};
    const labels: Record<string, string[]> = {};
    const workoutsByCycle = new Set(filterMaterializedWorkouts(workouts || []).map((w) => w.cycle_id));
    const pendingPaymentsByStudent = new Set((payments || []).map((p) => p.student_id));
    const today = businessDateYmd();
    // Vencimento pendente mais próximo por aluno (para a variável {{vencimento}}).
    const dueByStudent: Record<string, string> = {};
    for (const p of payments || []) {
      const due = (p as { due_date?: string | null }).due_date;
      if (!due) continue;
      if (!dueByStudent[p.student_id] || due < dueByStudent[p.student_id]) dueByStudent[p.student_id] = due;
    }

    for (const chat of studentChats) {
      const studentId = chat.student_id!;
      const enrollment = (enrollments || []).find((e) => e.student_id === studentId);
      const cycle = enrollment
        ? selectCurrentCycle((cycles || []).filter((c) => c.enrollment_id === enrollment.id), today)
        : null;
      const chatLabelsArr: string[] = [];
      const planRaw = (enrollment as { plans?: { name?: string; price?: number } | { name?: string; price?: number }[] } | undefined)?.plans;
      const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
      const planExtras = {
        planName: plan?.name,
        planValue: plan?.price ?? null,
        dueDate: dueByStudent[studentId] || null,
        enrollmentEndDate: enrollment?.end_date || null,
      };

      if (cycle) {
        const daysRemaining = Math.max(0, differenceInDays(new Date(cycle.end_date), new Date()));
        const hasWorkout = workoutsByCycle.has(cycle.id) || Boolean((cycle as { prescribed_offline_at?: string | null }).prescribed_offline_at);
        contexts[chat.id] = { cycleNumber: cycle.cycle_number, cycleStartDate: cycle.start_date, daysRemaining, paymentStatus: pendingPaymentsByStudent.has(studentId) ? "pendente" : "em dia", hasActiveWorkout: hasWorkout, studentName: chat.student?.full_name || "", ...planExtras };
        if (!hasWorkout) chatLabelsArr.push("Aguardando Treino");
      } else if (enrollment) {
        contexts[chat.id] = { cycleNumber: 0, cycleStartDate: enrollment.training_start_date || "", daysRemaining: 0, paymentStatus: pendingPaymentsByStudent.has(studentId) ? "pendente" : "em dia", hasActiveWorkout: false, studentName: chat.student?.full_name || "", ...planExtras };
        chatLabelsArr.push("Aguardando Treino");
      }

      if (pendingPaymentsByStudent.has(studentId)) chatLabelsArr.push("Financeiro");
      if (chatLabelsArr.length > 0) labels[chat.id] = chatLabelsArr;
    }

    setStudentContexts(contexts);
    setChatLabels(labels);
  }, [effectiveCompanyId]);

  const loadMessages = useCallback(async (chatId: string) => {
    const requestId = ++messageRequestRef.current;
    setMessagesLoading(true);
    initialMessageAutoScrollRef.current = true;
    messageViewportNearBottomRef.current = true;
    setMessagesError(null);
    setHasOlderMessages(false);
    setMessages([]);

    let markReadQuery = supabase
      .from("whatsapp_chats")
      .update({ unread_count: 0 })
      .eq("id", chatId);
    if (effectiveCompanyId) markReadQuery = markReadQuery.eq("company_id", effectiveCompanyId);
    const { error: unreadError } = await markReadQuery;
    if (!unreadError) {
      setChats((prev) => prev.map((chat) => (
        chat.id === chatId ? { ...chat, unread_count: 0 } : chat
      )));
    }

    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("timestamp", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (requestId !== messageRequestRef.current || selectedChatIdRef.current !== chatId) return;

    if (error) {
      setMessagesError("Não foi possível carregar as mensagens.");
    } else {
      const page = (data || []) as Message[];
      setMessages(reconcileWhatsAppMessages([...page].reverse()));
      setHasOlderMessages(page.length === MESSAGE_PAGE_SIZE);
    }
    setMessagesLoading(false);
  }, [effectiveCompanyId]);

  const syncChatHistory = useCallback(async (chat: Chat) => {
    if (!effectiveCompanyId || !["admin", "master"].includes(userRole || "")) return;
    if (historySyncAttemptsRef.current.has(chat.id)) return;
    const lastSync = chat.history_synced_at ? new Date(chat.history_synced_at).getTime() : 0;
    if (lastSync && Date.now() - lastSync < 15 * 60 * 1000) return;
    historySyncAttemptsRef.current.add(chat.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "repair-sync",
          companyId: effectiveCompanyId,
          remoteJids: [chat.remote_jid],
          days: 365,
          limit: 500,
          perChatLimit: 300,
        }),
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => ({}));
      if (result.inserted > 0 && selectedChatIdRef.current === chat.id) {
        await loadMessages(chat.id);
      }
      await loadChats();
    } catch (error) {
      console.error("WhatsApp history reconciliation failed:", error);
    }
  }, [effectiveCompanyId, loadChats, loadMessages, userRole]);

  const loadOlderMessages = useCallback(async () => {
    if (!selectedChatId || loadingOlderMessages || !hasOlderMessages || messages.length === 0) return;
    const oldestTimestamp = getMessageDateValue(messages[0]);
    const viewport = messagesScrollAreaRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") || null;
    const previousScrollHeight = viewport?.scrollHeight ?? 0;
    const previousScrollTop = viewport?.scrollTop ?? 0;
    setLoadingOlderMessages(true);

    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("chat_id", selectedChatId)
      .lt("timestamp", oldestTimestamp)
      .order("timestamp", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (error) {
      toast.error("Não foi possível carregar mensagens anteriores");
    } else {
      const page = (data || []) as Message[];
      suppressMessageAutoScrollRef.current = true;
      setMessages((prev) => reconcileWhatsAppMessages([...page].reverse().concat(prev)));
      setHasOlderMessages(page.length === MESSAGE_PAGE_SIZE);
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = previousScrollTop + Math.max(0, viewport.scrollHeight - previousScrollHeight);
          messageViewportNearBottomRef.current = isChatViewportNearBottom(viewport);
        });
      }
    }
    setLoadingOlderMessages(false);
  }, [hasOlderMessages, loadingOlderMessages, messages, selectedChatId]);

  const loadContacts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`;

      const [contactsRes, groupsRes] = await Promise.all([
        fetch(url, { method: "POST", headers, body: JSON.stringify({ action: "fetch-contacts", companyId: effectiveCompanyId }) }),
        fetch(url, { method: "POST", headers, body: JSON.stringify({ action: "fetch-groups", companyId: effectiveCompanyId }) }),
      ]);

      const nameMap: Record<string, string> = {};
      const photoMap: Record<string, string> = {};

      if (contactsRes.ok) {
        const data = await contactsRes.json();
        const updates: PromiseLike<unknown>[] = [];
        for (const contact of data.contacts || []) {
          const jid = contact.id || contact.remoteJid || contact.jid || "";
          const name = contact.pushName || contact.name || contact.notify || "";
          const photo = contact.profilePicUrl || contact.profilePictureUrl || contact.imgUrl || contact.picture || contact.profilePic || "";
          if (jid && name) nameMap[jid] = name;
          if (jid && photo) {
            photoMap[jid] = photo;
            updates.push(
              supabase
                .from("whatsapp_chats")
                .update({ contact_photo: photo })
                .eq("remote_jid", jid)
                .then(() => null)
            );
          }
        }
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json();
        const updates: PromiseLike<unknown>[] = [];

        for (const group of data.groups || []) {
          if (group.jid && group.subject) {
            nameMap[group.jid] = group.subject;
            updates.push(
              supabase
                .from("whatsapp_chats")
                .update({ contact_name: group.subject })
                .eq("remote_jid", group.jid)
                .then(() => null)
            );
          }
        }

        if (updates.length > 0) {
          await Promise.all(updates);
        }
      }

      setContactNames(nameMap);
      if (Object.keys(photoMap).length > 0) {
        setChats((prev) => prev.map((chat) => (
          photoMap[chat.remote_jid] ? { ...chat, contact_photo: photoMap[chat.remote_jid] } : chat
        )));
      }
    } catch (err) {
      console.error("Error loading contacts:", err);
    }
  }, [effectiveCompanyId]);

  // Search students for linking
  const searchStudentsForLink = useCallback(async (term: string) => {
    if (!term.trim()) { setLinkStudents([]); return; }
    let query = supabase
      .from("students")
      .select("id, full_name, whatsapp")
      .ilike("full_name", `%${term}%`)
      .limit(10);
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    const { data } = await query;
    setLinkStudents(data || []);
  }, [effectiveCompanyId]);

  const handleLinkStudent = async (studentId: string) => {
    if (!selectedChatId || !effectiveCompanyId) return;
    const { error } = await supabase
      .from("whatsapp_chats")
      .update({ student_id: studentId })
      .eq("id", selectedChatId)
      .eq("company_id", effectiveCompanyId);
    if (error) {
      toast.error("Não foi possível vincular o aluno");
      return;
    }
    setLinkDialogOpen(false);
    setLinkSearch("");
    setLinkStudents([]);
    await loadChats();
    toast.success("Aluno vinculado à conversa");
  };

  const handleUnlinkedContactName = (chat: Chat) => {
    const contactName = getContactName(chat);
    setSelectedChatId(chat.id);
    setEditingName(false);
    setLinkSearch(contactName);
    void searchStudentsForLink(contactName);
    setLinkDialogOpen(true);
  };

  const handleChooseRecipientForReview = async () => {
    if (!recipientReviewChatId) return;
    setUnlinkingRecipient(true);
    try {
      const reviewChat = chats.find((item) => item.id === recipientReviewChatId) || null;
      setRecipientReviewChatId(null);
      if (reviewChat) {
        const contactName = getContactName(reviewChat);
        setSelectedChatId(reviewChat.id);
        setLinkSearch(contactName);
        void searchStudentsForLink(contactName);
        setLinkDialogOpen(true);
      }
      toast.info("Escolha o aluno correto. O envio permanece bloqueado enquanto o vínculo divergir.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível abrir a revisão do destinatário"));
    } finally {
      setUnlinkingRecipient(false);
    }
  };

  // Media fallback
  const handleMediaError = useCallback(async (msg: Message, force = false) => {
    if (!msg.message_id_external) return;
    if (!force && (mediaFallbacks[msg.id] || failedMediaFetches[msg.id])) return;

    const chat = chats.find((c) => c.id === selectedChatId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          action: "fetch-media",
          companyId: effectiveCompanyId,
          chatId: selectedChatId,
          messageDbId: msg.id,
          messageId: msg.message_id_external,
          remoteJid: msg.source === "incoming" ? (msg.sender_id || chat?.remote_jid) : chat?.remote_jid,
          fromMe: msg.source === "outgoing",
          mimeType: msg.media_type,
        }),
      });

      if (!res.ok) {
        setFailedMediaFetches((prev) => ({ ...prev, [msg.id]: true }));
        return;
      }

      const data = await res.json();
      if (data.mediaUrl) {
        setMessages((prev) => prev.map((item) => (
          item.id === msg.id ? { ...item, media_url: data.mediaUrl, media_type: data.mimetype || item.media_type } : item
        )));
        return;
      }
      if (data.base64 && data.mimetype) {
        setMediaFallbacks((prev) => ({ ...prev, [msg.id]: `data:${data.mimetype};base64,${data.base64}` }));
        return;
      }

      setFailedMediaFetches((prev) => ({ ...prev, [msg.id]: true }));
    } catch {
      setFailedMediaFetches((prev) => ({ ...prev, [msg.id]: true }));
    }
  }, [chats, effectiveCompanyId, failedMediaFetches, mediaFallbacks, selectedChatId]);

  const shouldHydrateMedia = useCallback((msg: Message) => (
    Boolean(
      msg.media_type
      && msg.message_id_external
      && !mediaFallbacks[msg.id]
      && !failedMediaFetches[msg.id]
      && (!msg.media_url || !isUsableMediaUrl(msg.media_url))
    )
  ), [failedMediaFetches, mediaFallbacks]);

  const getMediaSrc = (msg: Message) => {
    if (mediaFallbacks[msg.id]) return mediaFallbacks[msg.id];
    if (shouldHydrateMedia(msg)) return null;
    if (failedMediaFetches[msg.id] && msg.media_url && !isUsableMediaUrl(msg.media_url)) return null;
    return msg.media_url;
  };

  // Load templates & categories
  const loadTemplates = useCallback(async () => {
    let query = supabase.from("message_templates").select("*").order("title");
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    const { data } = await query;
    if (data) setTemplates(data as TemplateItem[]);
  }, [effectiveCompanyId]);

  const loadCategories = useCallback(async () => {
    let query = supabase.from("student_categories").select("*").order("sort_order");
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    const { data } = await query;
    if (data) setCategories(data as CategoryItem[]);
  }, [effectiveCompanyId]);

  const loadAvailableLabels = useCallback(async () => {
    let query = supabase.from("whatsapp_labels").select("*").order("name");
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    const { data } = await query;
    if (data) setAvailableLabels(data as LabelItem[]);
  }, [effectiveCompanyId]);

  const loadTeamMembers = useCallback(async () => {
    if (!effectiveCompanyId) {
      setTeamMembers([]);
      return;
    }
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", effectiveCompanyId);
    const ids = (members || []).map((member) => member.user_id).filter(Boolean);
    if (ids.length === 0) {
      setTeamMembers([]);
      return;
    }
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("user_id", ids).in("role", ["admin", "coordinator", "trainer"]),
      supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
    ]);
    const allowed = new Set((roles || []).map((row) => row.user_id));
    setTeamMembers(
      (profiles || [])
        .filter((profile) => allowed.has(profile.user_id))
        .map((profile) => ({ user_id: profile.user_id, full_name: profile.full_name || "Sem nome" }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    );
  }, [effectiveCompanyId]);

  const loadChatLabels = useCallback(async (chatIds: string[]) => {
    if (chatIds.length === 0) {
      setChatCustomLabels({});
      return;
    }
    const { data } = await supabase.from("whatsapp_chat_labels").select("chat_id, label_id").in("chat_id", chatIds);
    if (data) {
      const map: Record<string, string[]> = {};
      data.forEach((row) => {
        if (!map[row.chat_id]) map[row.chat_id] = [];
        map[row.chat_id].push(row.label_id);
      });
      setChatCustomLabels(map);
    }
  }, []);

  const toggleChatLabel = async (chatId: string, labelId: string) => {
    const current = chatCustomLabels[chatId] || [];
    if (current.includes(labelId)) {
      const { error } = await supabase
        .from("whatsapp_chat_labels")
        .delete()
        .eq("chat_id", chatId)
        .eq("label_id", labelId);
      if (error) {
        toast.error("Não foi possível remover a etiqueta");
        return;
      }
      setChatCustomLabels(prev => ({ ...prev, [chatId]: current.filter(id => id !== labelId) }));
    } else {
      const { error } = await supabase
        .from("whatsapp_chat_labels")
        .insert({ chat_id: chatId, label_id: labelId });
      if (error) {
        toast.error("Não foi possível adicionar a etiqueta");
        return;
      }
      setChatCustomLabels(prev => ({ ...prev, [chatId]: [...current, labelId] }));
    }
  };

  useEffect(() => {
    chatsLoadedRef.current = false;
    setChatsLoaded(false);
    setChats([]);
    setSelectedChatId(null);
    setDraftRecipient(null);
    historySyncAttemptsRef.current.clear();
  }, [effectiveCompanyId]);
  useEffect(() => { loadChats(); loadSenderNames(); loadTemplates(); loadCategories(); loadAvailableLabels(); loadTeamMembers(); }, [loadChats, loadSenderNames, loadTemplates, loadCategories, loadAvailableLabels, loadTeamMembers]);
  useEffect(() => () => {
    if (chatRefreshTimerRef.current) clearTimeout(chatRefreshTimerRef.current);
  }, []);
  // Load contacts from Evolution API separately to avoid overwhelming edge function workers
  useEffect(() => { const t = setTimeout(() => loadContacts(), 2000); return () => clearTimeout(t); }, [loadContacts]);
  useEffect(() => {
    void loadStudentData(chats);
    void loadChatLabels(chats.map((chat) => chat.id));
  }, [chats, loadStudentData, loadChatLabels]);
  // Pré-seleciona uma conversa existente ou prepara uma nova conversa interna.
  useEffect(() => {
    if (!chatsLoaded) return;

    const requestedChat = pendingChatIdRef.current
      ? chats.find((chat) => chat.id === pendingChatIdRef.current)
      : null;
    const studentChat = !requestedChat && pendingStudentIdRef.current
      ? chats.find((chat) => chat.student_id === pendingStudentIdRef.current)
      : null;
    const digits = (pendingPhoneRef.current || "").replace(/\D/g, "");
    const phoneKey = normalizeWhatsAppPhoneKey(digits);
    const phoneChat = !requestedChat && !studentChat && digits
      ? chats.find((chat) => normalizeWhatsAppPhoneKey(chat.remote_jid) === phoneKey)
      : null;
    const matchedChat = requestedChat || studentChat || phoneChat || null;

    if (matchedChat) {
      setSelectedChatId(matchedChat.id);
      setDraftRecipient(null);
    } else if (digits) {
      setSelectedChatId(null);
      setDraftRecipient({
        remoteJid: digits,
        studentId: pendingStudentIdRef.current,
        contactName: pendingContactNameRef.current || "Nova conversa",
      });
    }

    if (pendingPrefillRef.current) setNewMessage(pendingPrefillRef.current);
    pendingChatIdRef.current = null;
    pendingStudentIdRef.current = null;
    pendingPhoneRef.current = null;
    pendingContactNameRef.current = null;
    pendingPrefillRef.current = null;
  }, [chats, chatsLoaded]);
  useEffect(() => {
    setMediaFallbacks({});
    setFailedMediaFetches({});
    if (selectedChatId) {
      void loadMessages(selectedChatId);
    } else {
      messageRequestRef.current += 1;
      setMessages([]);
      setMessagesError(null);
      setHasOlderMessages(false);
    }
  }, [selectedChatId, loadMessages]);
  useEffect(() => {
    const selected = chats.find((chat) => chat.id === selectedChatId);
    if (selected) void syncChatHistory(selected);
  }, [chats, selectedChatId, syncChatHistory]);
  useEffect(() => {
    if (suppressMessageAutoScrollRef.current) {
      suppressMessageAutoScrollRef.current = false;
      return;
    }
    const shouldScroll = shouldAutoScrollChat({
      isInitialLoad: initialMessageAutoScrollRef.current,
      isNearBottom: messageViewportNearBottomRef.current,
      isOwnMessage: forceOwnMessageAutoScrollRef.current,
    });
    const wasInitial = initialMessageAutoScrollRef.current;
    initialMessageAutoScrollRef.current = false;
    forceOwnMessageAutoScrollRef.current = false;
    if (shouldScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: messagesLoading || wasInitial ? "auto" : "smooth" });
    }
  }, [messages, messagesLoading]);

  // Auto-fetch media when the provider only stored a temporary WhatsApp URL.
  useEffect(() => {
    const pendingMedia = messages.filter(
      (m) => shouldHydrateMedia(m)
    );
    if (pendingMedia.length === 0) return;
    // Throttle: fetch max 3 at a time
    const toFetch = pendingMedia.slice(0, 3);
    for (const msg of toFetch) {
      handleMediaError(msg);
    }
  }, [messages, shouldHydrateMedia, handleMediaError]);

  // Realtime - canal privado por empresa (compatível com policy de realtime.messages)
  // Usa selectedChatIdRef para não re-subscrever o canal a cada conversa aberta (evita thrash).
  useEffect(() => {
    if (!effectiveCompanyId) return;
    const channel = supabase
      .channel(`company:${effectiveCompanyId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${effectiveCompanyId}` }, (payload) => {
        const newMsg = payload.new as Message & { chat_id: string };
        if (newMsg.chat_id === selectedChatIdRef.current) {
          setMessages((prev) => upsertWhatsAppMessage(prev, newMsg));
        }
        scheduleChatsRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_chats", filter: `company_id=eq.${effectiveCompanyId}` }, () => { scheduleChatsRefresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveCompanyId, scheduleChatsRefresh]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat && !draftRecipient) return;
    const content = newMessage.trim();
    const reply = replyingTo;
    const tempId = `temp-${Date.now()}`;
    if (selectedChatId) {
      forceOwnMessageAutoScrollRef.current = true;
      setMessages((prev) => [...prev, {
        id: tempId,
        content,
        source: "outgoing",
        type: "text",
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        sender_id: user?.id || null,
        media_url: null,
        media_type: null,
        message_id_external: null,
        quoted_message_id: reply?.id || null,
        quoted_message_external_id: reply?.message_id_external || null,
        quoted_message_preview: reply ? getMessagePreview(reply) : null,
        quoted_message_source: reply?.source || null,
      }]);
      setChats((prev) => prev.map((item) => (
        item.id === selectedChatId
          ? { ...item, lastMessage: content, last_message_at: new Date().toISOString(), unread_count: 0, last_sender_id: user?.id || null }
          : item
      )));
    }
    setNewMessage("");
    setReplyingTo(null);
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          action: "send-message",
          companyId: effectiveCompanyId,
          remoteJid: chat?.remote_jid || draftRecipient?.remoteJid,
          content,
          chatId: selectedChatId || undefined,
          studentId: chat?.student_id || draftRecipient?.studentId || undefined,
          contactName: chat ? getContactName(chat) : draftRecipient?.contactName,
          ...(reply?.message_id_external ? {
            quotedMessageDbId: reply.id,
            quotedMessageId: reply.message_id_external,
            quotedFromMe: reply.source === "outgoing",
            quotedMessageContent: getMessagePreview(reply),
            quotedMessageType: reply.type || "text",
          } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (selectedChatId && shouldOfferWhatsAppRecipientReview(payload?.code)) {
          setRecipientReviewChatId(selectedChatId);
        }
        throw new Error(payload?.error || "Erro ao enviar");
      }
      if (payload?.message && selectedChatId) {
        setMessages((prev) => {
          const hydrated = prev.map((msg) => (msg.id === tempId ? payload.message as Message : msg));
          return reconcileWhatsAppMessages(hydrated);
        });
      } else if (payload?.messageId && selectedChatId) {
        setMessages((prev) => reconcileWhatsAppMessages(prev.map((msg) => (
          msg.id === tempId ? { ...msg, message_id_external: payload.messageId } : msg
        ))));
      }
      if (payload?.persistenceWarning) {
        toast.warning("Mensagem enviada, mas o histórico pode demorar para sincronizar");
      }
      if (selectedChatId) {
        return;
      } else if (payload?.chatId) {
        setDraftRecipient(null);
        await loadChats();
        setSelectedChatId(payload.chatId);
      }
    } catch (error: unknown) {
      if (selectedChatId) setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setNewMessage(content);
      setReplyingTo(reply);
      toast.error(getErrorMessage(error, "Erro ao enviar mensagem"));
    } finally { setSending(false); }
  };

  const handleDeleteMessage = async (msg: Message) => {
    if (!selectedChatId || !msg.message_id_external) {
      toast.error("Não é possível apagar esta mensagem");
      return;
    }
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "delete-message", companyId: effectiveCompanyId, remoteJid: chat.remote_jid, messageId: msg.message_id_external, chatId: selectedChatId }),
      });
      if (!res.ok) throw new Error("Erro ao apagar");
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      toast.success("Mensagem apagada para todos");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao apagar mensagem"));
    }
  };

  const appendConfirmedOutgoingMessage = (payload: any) => {
    if (payload?.message) {
      setMessages((prev) => (
        prev.some((msg) => msg.id === payload.message.id) ? prev : [...prev, payload.message as Message]
      ));
    }
    scheduleChatsRefresh();
  };

  const handleAttachLastEvaluation = async () => {
    if (!selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat?.student_id) { toast.error("Nenhum aluno vinculado a esta conversa"); return; }
    setSendingAttachment(true);
    try {
      const studentFiles = await listStudentFiles(chat.student_id);
      const latestFile = studentFiles.find((file) => file.kind === "assessment_report") || studentFiles[0] || null;
      let mediaStorageBucket: "student-files" | "evaluations" | null = null;
      let mediaStoragePath: string | null = null;
      let fileName = "arquivo.pdf";

      if (latestFile) {
        mediaStorageBucket = "student-files";
        mediaStoragePath = latestFile.file_path;
        fileName = latestFile.file_name || latestFile.file_path.split("/").pop() || fileName;
      }

      if (!mediaStoragePath) {
        const { data: evaluations } = await supabase
          .from("student_evaluations")
          .select("id, file_url, type, created_at")
          .eq("student_id", chat.student_id)
          .not("file_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);
        const fileUrl = evaluations?.[0]?.file_url || null;
        if (fileUrl) {
          fileName = fileUrl.split("/").pop() || fileName;
          if (fileUrl.startsWith("http")) {
            try {
              const marker = "/evaluations/";
              const parsed = new URL(fileUrl);
              const markerIndex = parsed.pathname.indexOf(marker);
              mediaStoragePath = markerIndex >= 0
                ? decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length))
                : null;
            } catch {
              mediaStoragePath = null;
            }
          } else {
            mediaStoragePath = fileUrl;
          }
          if (mediaStoragePath) mediaStorageBucket = "evaluations";
        }
      }

      if (!mediaStorageBucket || !mediaStoragePath) {
        toast.error("Nenhum arquivo interno válido foi encontrado na pasta ou nas avaliações do aluno");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          action: "send-media",
          companyId: effectiveCompanyId,
          remoteJid: chat.remote_jid,
          caption: "Último treino/avaliação",
          chatId: selectedChatId,
          studentId: chat.student_id,
          fileName,
          mediaSource: "student-upload",
          mediaStorageBucket,
          mediaStoragePath,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (shouldOfferWhatsAppRecipientReview(payload?.code)) setRecipientReviewChatId(selectedChatId);
        throw new Error(payload?.error || "Erro ao enviar arquivo");
      }
      appendConfirmedOutgoingMessage(payload);
      toast.success("Arquivo enviado!");
    } catch (error: unknown) { toast.error(getErrorMessage(error, "Erro ao enviar arquivo")); }
    finally { setSendingAttachment(false); }
  };

  const sendFileAttachment = async (file: File) => {
    if (!selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;
    setSendingAttachment(true);
    setUploadProgress(0);
    let uploadedPath: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");
      const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
      const filePath = `${effectiveCompanyId}/${selectedChatId}/${Date.now()}.${ext}`;
      await uploadWhatsAppMediaWith({
        file,
        path: filePath,
        standardUpload: async (uploadFile, uploadPath, onProgress) => {
          const { error } = await supabase.storage.from("whatsapp-media").upload(uploadPath, uploadFile, {
            contentType: uploadFile.type || "application/octet-stream",
          });
          if (error) throw new Error(error.message);
          onProgress?.(100);
        },
        resumableUpload: async (uploadFile, uploadPath, onProgress) => {
          await resumableWhatsAppUpload({
            file: uploadFile,
            path: uploadPath,
            projectUrl: import.meta.env.VITE_SUPABASE_URL,
            accessToken: session.access_token,
            onProgress,
          });
        },
        onProgress: setUploadProgress,
      });
      uploadedPath = filePath;
      const delivery = describeWhatsAppMediaDelivery(file);
      if (delivery.notice) toast.info(delivery.notice);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          action: "send-media",
          companyId: effectiveCompanyId,
          remoteJid: chat.remote_jid,
          chatId: selectedChatId,
          studentId: chat.student_id,
          mediatype: delivery.mediatype,
          mimeType: file.type,
          fileName: file.name,
          caption: "",
          mediaSource: "chat-upload",
          mediaStorageBucket: "whatsapp-media",
          mediaStoragePath: filePath,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (shouldOfferWhatsAppRecipientReview(payload?.code)) setRecipientReviewChatId(selectedChatId);
        throw new Error(payload?.error || "Erro ao enviar mídia");
      }
      uploadedPath = null;
      appendConfirmedOutgoingMessage(payload);
      toast.success("Mídia enviada!");
    } catch (error: unknown) {
      if (uploadedPath) void supabase.storage.from("whatsapp-media").remove([uploadedPath]);
      toast.error(getErrorMessage(error, "Erro ao enviar mídia"));
    }
    finally { setSendingAttachment(false); setUploadProgress(null); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await sendFileAttachment(file);
  };

  const handleComposerPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.files || [])[0];
    if (!file) return;
    event.preventDefault();
    await sendFileAttachment(file);
  };

  const handleToggleUnread = async (chatId: string, currentUnread: number) => {
    const newCount = Number(currentUnread || 0) > 0 ? 0 : 1;
    setUpdatingUnreadChatId(chatId);
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("Sessão expirada");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "set-read-state",
          companyId: effectiveCompanyId,
          chatId,
          unread: newCount > 0,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Não foi possível atualizar a conversa");
      const persistedCount = Number(payload.unread_count || 0);
      setChats((prev) => prev.map((chat) => (
        chat.id === chatId ? { ...chat, unread_count: persistedCount } : chat
      )));
      toast.success(persistedCount > 0 ? "Marcado como não lida" : "Marcado como lida");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar a conversa"));
    } finally {
      setUpdatingUnreadChatId(null);
    }
  };

  // ─── Audio Recording ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;

    setIsRecording(false);
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    await new Promise<void>((resolve) => { recorder.onstop = () => { recorder.stream.getTracks().forEach((t) => t.stop()); resolve(); }; recorder.stop(); });

    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    if (blob.size < 100) { toast.error("Gravação muito curta"); return; }

    setSendingAttachment(true);
    let uploadedPath: string | null = null;
    try {
      const filePath = `${effectiveCompanyId}/${selectedChatId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("whatsapp-media").upload(filePath, blob, { contentType: "audio/webm" });
      if (uploadError) throw new Error("Erro ao fazer upload: " + uploadError.message);
      uploadedPath = filePath;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "send-media", companyId: effectiveCompanyId, remoteJid: chat.remote_jid, chatId: selectedChatId, studentId: chat.student_id, mediatype: "audio", mimeType: "audio/webm", fileName: `audio-${Date.now()}.webm`, caption: "", mediaSource: "chat-upload", mediaStorageBucket: "whatsapp-media", mediaStoragePath: filePath }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (shouldOfferWhatsAppRecipientReview(payload?.code)) setRecipientReviewChatId(selectedChatId);
        throw new Error(payload?.error || "Erro ao enviar áudio");
      }
      uploadedPath = null;
      appendConfirmedOutgoingMessage(payload);
      toast.success("Áudio enviado!");
    } catch (error: unknown) {
      if (uploadedPath) void supabase.storage.from("whatsapp-media").remove([uploadedPath]);
      toast.error(getErrorMessage(error, "Erro ao enviar áudio"));
    }
    finally { setSendingAttachment(false); }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
    audioChunksRef.current = [];
  };

  const formatPhone = (jid: string): string | null => {
    if (jid.includes("@lid")) return null;
    const num = jid.replace(/@.*$/, "");
    if (num.startsWith("55") && num.length === 13) { const ddd = num.slice(2, 4); const phone = num.slice(4); return `+55 (${ddd}) ${phone.slice(0, 5)}-${phone.slice(5)}`; }
    if (num.startsWith("55") && num.length === 12) { const ddd = num.slice(2, 4); const phone = num.slice(4); return `+55 (${ddd}) ${phone.slice(0, 4)}-${phone.slice(4)}`; }
    if (num.length > 6) return `+${num.slice(0, 2)} ${num.slice(2)}`;
    return num;
  };

  const getContactName = (chat: Chat) => {
    if (chat.student?.full_name) return chat.student.full_name;
    if (chat.remote_jid.includes("@g.us")) return contactNames[chat.remote_jid] || chat.contact_name || "Grupo WhatsApp";
    // Prioritize pushName from API over stored contact_name (which may be polluted by flow responses)
    if (contactNames[chat.remote_jid]) return contactNames[chat.remote_jid];
    if (chat.contact_name && chat.contact_name.length <= 60) return chat.contact_name;
    if (chat.remote_jid.includes("@lid")) return "Contato WhatsApp";
    return formatPhone(chat.remote_jid) || "Contato";
  };

  const isGroup = (chat: Chat) => chat.remote_jid.includes("@g.us");
  const fetchChatPhoto = useCallback(async (chatId: string) => {
    if (avatarFetchesRef.current.has(chatId) || avatarMissesRef.current.has(chatId)) return;
    avatarFetchesRef.current.add(chatId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "fetch-profile-picture",
          companyId: effectiveCompanyId,
          chatId,
        }),
      });
      if (!response.ok) {
        avatarMissesRef.current.add(chatId);
        return;
      }

      const payload = await response.json();
      if (!payload.photo) {
        avatarMissesRef.current.add(chatId);
        return;
      }
      avatarMissesRef.current.delete(chatId);
      setFailedAvatarUrls((previous) => {
        const next = { ...previous };
        delete next[payload.photo];
        return next;
      });
      setChats((previous) => previous.map((chat) => (
        chat.id === chatId ? { ...chat, contact_photo: payload.photo } : chat
      )));
    } finally {
      avatarFetchesRef.current.delete(chatId);
    }
  }, [effectiveCompanyId]);

  const renderAvatar = (chat: Chat, size = "h-10 w-10") => {
    const photo = chat.contact_photo;
    return (
      <div className={cn(size, "shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center")}>
        {photo && !failedAvatarUrls[photo] ? (
          <img
            src={photo}
            alt={getContactName(chat)}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => {
              setFailedAvatarUrls((prev) => ({ ...prev, [photo]: true }));
              setChats((previous) => previous.map((item) => (
                item.id === chat.id ? { ...item, contact_photo: null } : item
              )));
              void fetchChatPhoto(chat.id);
            }}
          />
        ) : isGroup(chat) ? (
          <Users className="h-5 w-5 text-muted-foreground" />
        ) : (
          <User className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
    );
  };
  const unreadCount = chats.filter(c => (c.unread_count || 0) > 0).length;

  const selectedChat = chats.find((c) => c.id === selectedChatId);
  const recipientReviewChat = chats.find((c) => c.id === recipientReviewChatId) || null;
  useEffect(() => {
    let cancelled = false;
    if (!selectedChat) {
      setSelectedPreRegistration(null);
      setPreRegistrationLoading(false);
      return () => { cancelled = true; };
    }

    setPreRegistrationLoading(true);
    void loadStudentPreRegistration({
      studentId: selectedChat.student_id,
      companyId: effectiveCompanyId,
      phone: selectedChat.student?.whatsapp || selectedChat.remote_jid,
    }).then((data) => {
      if (!cancelled) setSelectedPreRegistration(data);
    }).catch((error) => {
      console.error("Falha ao carregar pré-cadastro no WhatsApp:", error);
      if (!cancelled) setSelectedPreRegistration(null);
    }).finally(() => {
      if (!cancelled) setPreRegistrationLoading(false);
    });

    return () => { cancelled = true; };
  }, [effectiveCompanyId, selectedChat?.id, selectedChat?.remote_jid, selectedChat?.student?.whatsapp, selectedChat?.student_id]);

  useEffect(() => {
    if (!selectedChat?.id || selectedChat.contact_photo) return;
    void fetchChatPhoto(selectedChat.id);
  }, [fetchChatPhoto, selectedChat?.contact_photo, selectedChat?.id]);

  useEffect(() => {
    const missingPhotoChats = chats
      .filter((chat) => !chat.contact_photo && !isGroup(chat))
      .slice(0, 16);
    for (const chat of missingPhotoChats) {
      void fetchChatPhoto(chat.id);
    }
  }, [chats, fetchChatPhoto]);

  const selectableCategories = [...categories, DEFAULT_CATEGORY]
    .concat(
      selectedChat?.category
      && !categories.some((category) => category.name.toLowerCase() === selectedChat.category?.toLowerCase())
        ? [{
            id: `current-${selectedChat.category}`,
            name: selectedChat.category,
            color: DEFAULT_CATEGORY.color,
          }]
        : [],
    )
    .filter((category, index, items) => (
      items.findIndex((item) => item.name.toLowerCase() === category.name.toLowerCase()) === index
    ));

  const canFilterByTrainer = isAdministrativeRole(userRole);
  const currentStatusFilterLabel = statusFilter === "all" ? "Status" : STATUS_FILTER_LABELS[statusFilter] || "Status";
  const hasActiveChatFilters = (
    scopeFilter !== "all"
    || statusFilter !== "all"
    || mineOnly
    || noWorkoutOnly
    || (canFilterByTrainer && trainerFilterId !== ALL_VALUE)
  );

  const filteredChats = chats.filter((c) => {
    const name = getContactName(c);
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const searchableText = [
      name,
      formatPhone(c.remote_jid),
      c.remote_jid.replace(/@.*$/, ""),
      c.lastMessage,
    ].filter(Boolean).join(" ").toLowerCase();
    if (normalizedSearch && !searchableText.includes(normalizedSearch)) return false;
    if (canFilterByTrainer && trainerFilterId !== ALL_VALUE && c.student?.assigned_trainer_id !== trainerFilterId) return false;
    if (scopeFilter === "unread" && (c.unread_count || 0) === 0) return false;
    if (scopeFilter === "groups" && !c.remote_jid.includes("@g.us")) return false;
    if (mineOnly && c.student?.assigned_trainer_id !== user?.id) return false;
    if (noWorkoutOnly) {
      const labels = chatLabels[c.id] || [];
      if (!labels.includes("Aguardando Treino")) return false;
    }
    if (statusFilter !== "all") {
      if (!matchesWhatsAppStatusFilter(c.student as FunnelStageStudent | null, statusFilter, {
        enrollmentEndDate: studentContexts[c.id]?.enrollmentEndDate,
      })) return false;
    }
    return true;
  });

  const bulkRecipients = (bulkFilters.base === "current" ? filteredChats : chats)
    .filter((chat) => !isGroup(chat))
    .filter((chat) => {
      if (bulkFilters.trainerId !== ALL_VALUE && chat.student?.assigned_trainer_id !== bulkFilters.trainerId) return false;
      if (bulkFilters.status !== ALL_VALUE && chat.student?.status !== bulkFilters.status) return false;
      if (bulkFilters.categoryId !== ALL_VALUE && chat.student?.category_id !== bulkFilters.categoryId) return false;
      if (bulkFilters.labelId !== ALL_VALUE && !(chatCustomLabels[chat.id] || []).includes(bulkFilters.labelId)) return false;
      return true;
    });

  const personalizeBulkMessage = (message: string, chat: Chat) => {
    const name = getContactName(chat);
    const first = name.trim().split(/\s+/)[0] || "tudo bem";
    const ctx = studentContexts[chat.id] || null;
    const interpolated = interpolateTemplate(message, {
      nome: name,
      primeiro_nome: first,
      plano: ctx?.planName || "",
      vencimento: ctx?.dueDate ? format(new Date(ctx.dueDate), "dd/MM/yyyy") : "",
      valor: ctx?.planValue != null ? ctx.planValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
      dias_restantes: ctx?.daysRemaining ?? "",
    });
    if (/\{\{?\s*(nome|primeiro_nome)\s*\}?\}/i.test(message)) return interpolated;
    return `Oi, ${first}!\n\n${interpolated}`;
  };

  const handleBulkSend = async () => {
    const text = bulkMessage.trim();
    if (!text) { toast.error("Digite uma mensagem para enviar"); return; }
    if (bulkRecipients.length === 0) { toast.error("Nenhum destinatário encontrado com estes filtros"); return; }
    setBulkSending(true);
    setBulkProgress(`0/${bulkRecipients.length}`);
    let ok = 0;
    let failed = 0;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`;
      for (const [index, chat] of bulkRecipients.entries()) {
        const content = personalizeBulkMessage(text, chat);
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "send-message",
            companyId: effectiveCompanyId,
            remoteJid: chat.remote_jid,
            content,
            chatId: chat.id,
            studentId: chat.student_id || undefined,
            contactName: getContactName(chat),
          }),
        });
        if (res.ok) {
          ok += 1;
          if (chat.id === selectedChatIdRef.current) {
            setMessages((prev) => [...prev, {
              id: `bulk-${Date.now()}-${index}`,
              content,
              source: "outgoing",
              type: "text",
              created_at: new Date().toISOString(),
              timestamp: new Date().toISOString(),
              sender_id: user?.id || null,
              media_url: null,
              media_type: null,
              message_id_external: null,
            }]);
          }
        } else {
          failed += 1;
        }
        setBulkProgress(`${index + 1}/${bulkRecipients.length}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      toast.success(`Mensagem enviada para ${ok} conversa(s)${failed ? `; ${failed} falharam` : ""}.`);
      setBulkOpen(false);
      setBulkMessage("");
      scheduleChatsRefresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro no envio em massa"));
    } finally {
      setBulkSending(false);
      setBulkProgress("");
    }
  };

  const studentCtx = selectedChat ? studentContexts[selectedChat.id] : null;
  const renderStudentContext = () => {
    if (!selectedChat) return null;

    return (
      <div className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Contato</p>
          <p className="break-words text-sm font-medium text-foreground">
            {studentCtx?.studentName || selectedChat.student?.full_name || selectedChat.contact_name || "Contato"}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Categoria</p>
          <Select
            value={selectedChat.category || EMPTY_CATEGORY_VALUE}
            onValueChange={async (val) => {
              const previousCategory = selectedChat.category;
              const nextCategory = val === EMPTY_CATEGORY_VALUE ? null : val;
              setChats((prev) => prev.map((chat) => (
                chat.id === selectedChat.id ? { ...chat, category: nextCategory } : chat
              )));
              const { error } = await supabase
                .from("whatsapp_chats")
                .update({ category: nextCategory })
                .eq("id", selectedChat.id);
              if (error) {
                setChats((prev) => prev.map((chat) => (
                  chat.id === selectedChat.id ? { ...chat, category: previousCategory } : chat
                )));
                toast.error("Não foi possível atualizar a categoria");
                return;
              }
              toast.success("Categoria atualizada");
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sem categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_CATEGORY_VALUE}>
                Sem categoria
              </SelectItem>
              {selectableCategories.map((category) => (
                <SelectItem key={category.id} value={category.name}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                    <span className="capitalize">{category.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Tag className="h-3 w-3" /> Etiquetas
          </p>
          {availableLabels.length === 0 ? (
            <p className="text-xs text-muted-foreground">Crie etiquetas nas configurações do WhatsApp</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {availableLabels.map((label) => {
                const isActive = (chatCustomLabels[selectedChat.id] || []).includes(label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => toggleChatLabel(selectedChat.id, label.id)}
                    className={cn(
                      "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                      isActive
                        ? "border-transparent text-white"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                    style={isActive ? { backgroundColor: label.color } : {}}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedChat.student_id && studentCtx && (
          <>
            <Separator />
            {studentCtx.cycleNumber > 0 ? (
              <>
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Ciclo Atual
                  </p>
                  <p className="text-sm text-foreground">Ciclo {studentCtx.cycleNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Início: {format(new Date(studentCtx.cycleStartDate), "dd/MM/yyyy")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3 w-3" /> Dias Restantes
                  </p>
                  <p className={cn("text-lg font-bold", studentCtx.daysRemaining <= 7 ? "text-destructive" : "text-foreground")}>
                    {studentCtx.daysRemaining} dias
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Prescrição</p>
                  <Badge variant={studentCtx.hasActiveWorkout ? "secondary" : "destructive"} className="text-xs">
                    {studentCtx.hasActiveWorkout ? "Treino ativo" : "Sem treino"}
                  </Badge>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Sem ciclo ativo</p>
              </div>
            )}
            <Separator />
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-3 w-3" /> Financeiro
              </p>
              <Badge
                className={cn(
                  "text-xs",
                  studentCtx.paymentStatus === "pendente"
                    ? "bg-amber-500/90 text-white hover:bg-amber-500"
                    : "bg-emerald-500/90 text-white hover:bg-emerald-500",
                )}
              >
                {studentCtx.paymentStatus === "pendente" ? "Pendente" : "Em dia"}
              </Badge>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={!!recipientReviewChatId} onOpenChange={(open) => { if (!open) setRecipientReviewChatId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisar destinatário antes de enviar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">A mensagem não foi enviada.</p>
                <p>
                  O número desta conversa diverge do telefone cadastrado para
                  {recipientReviewChat ? ` ${getContactName(recipientReviewChat)}` : " a aluna"}.
                  O rascunho foi preservado para evitar envio à pessoa errada.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Confira primeiro o cadastro. Se esta conversa for de outro contato, escolha o aluno correto antes de tentar enviar novamente.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRecipientReviewChatId(null)} disabled={unlinkingRecipient}>
                Manter como está
              </Button>
              <Button
                variant="outline"
                disabled={!recipientReviewChat?.student_id || unlinkingRecipient}
                onClick={() => {
                  if (!recipientReviewChat?.student_id) return;
                  setRecipientReviewChatId(null);
                  navigate(`/${studioRoutePrefix}/students/${recipientReviewChat.student_id}`);
                }}
              >
                Abrir cadastro do aluno
              </Button>
              <Button onClick={handleChooseRecipientForReview} disabled={unlinkingRecipient}>
                {unlinkingRecipient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Escolher aluno correto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <p className="text-eyebrow">WhatsApp</p>
            <h1 className="font-display text-2xl text-foreground leading-tight">Conversas</h1>
          </div>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                Enviar para vários
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Mensagem em massa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Base</p>
                    <Select value={bulkFilters.base} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, base: value === "all" ? "all" : "current" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">Filtro atual da conversa</SelectItem>
                        <SelectItem value="all">Todas as conversas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Equipe/carteira</p>
                    <Select value={bulkFilters.trainerId} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, trainerId: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Status do aluno</p>
                    <Select value={bulkFilters.status} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, status: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                        <SelectItem value="active">Ativos</SelectItem>
                        <SelectItem value="pending">Pendentes</SelectItem>
                        <SelectItem value="awaiting_renewal">Aguardando renovação</SelectItem>
                        <SelectItem value="inactive">Inativos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Categoria</p>
                    <Select value={bulkFilters.categoryId} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, categoryId: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">Etiqueta</p>
                    <Select value={bulkFilters.labelId} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, labelId: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                        {availableLabels.map((label) => (
                          <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <span className="font-medium text-foreground">{bulkRecipients.length}</span> conversa(s) serão impactadas. Use <span className="font-mono-data">{"{{primeiro_nome}}"}</span> ou <span className="font-mono-data">{"{{nome}}"}</span>; se você não usar, eu adiciono o primeiro nome automaticamente.
                </div>
                <Textarea
                  value={bulkMessage}
                  onChange={(event) => setBulkMessage(event.target.value)}
                  placeholder="Ex: passando para lembrar do treino de hoje. Me avisa se precisar de ajuste."
                  className="min-h-32"
                  disabled={bulkSending}
                />
                <div className="flex items-center justify-end gap-2">
                  {bulkProgress && <span className="mr-auto text-xs text-muted-foreground">Enviando {bulkProgress}</span>}
                  <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkSending}>Cancelar</Button>
                  <Button onClick={handleBulkSend} disabled={bulkSending || !bulkMessage.trim() || bulkRecipients.length === 0}>
                    {bulkSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden border-y border-border bg-white md:rounded-2xl md:border">
          {/* Chat List */}
          <div className={cn(
            "w-full shrink-0 flex-col border-r border-border md:w-72 xl:w-80",
            selectedChat || draftRecipient ? "hidden md:flex" : "flex",
            isChatListCollapsed && "md:hidden",
          )}>
            <div className="p-3 border-b border-border space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar conversa..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden shrink-0 md:inline-flex"
                  onClick={() => setIsChatListCollapsed(true)}
                  title="Recolher lista de conversas"
                  aria-label="Recolher lista de conversas"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {canFilterByTrainer && (
                  <Select value={trainerFilterId} onValueChange={setTrainerFilterId}>
                    <SelectTrigger className="h-7 w-[150px] rounded-full px-3 text-xs">
                      <SelectValue placeholder="Treinador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>Todos treinadores</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={scopeFilter !== "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs">
                      <Filter className="h-3 w-3 mr-1" />
                      {scopeFilter === "unread" ? `Não lidas (${unreadCount})` : scopeFilter === "groups" ? "Grupos" : "Todas"}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setScopeFilter("all")} className={cn(scopeFilter === "all" && "bg-accent")}>
                      <Filter className="h-3 w-3 mr-2" />Todas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScopeFilter("unread")} className={cn(scopeFilter === "unread" && "bg-accent")}>
                      <MessageCircle className="h-3 w-3 mr-2" />Não lidas
                      {unreadCount > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] flex items-center justify-center">{unreadCount}</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScopeFilter("groups")} className={cn(scopeFilter === "groups" && "bg-accent")}>
                      <Users className="h-3 w-3 mr-2" />Grupos
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={statusFilter !== "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs">
                      <Tag className="h-3 w-3 mr-1" />
                      {currentStatusFilterLabel}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setStatusFilter("all")} className={cn(statusFilter === "all" && "bg-accent")}>
                      <Tag className="h-3 w-3 mr-2" />Todos status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("active")} className={cn(statusFilter === "active" && "bg-accent")}>
                      <User className="h-3 w-3 mr-2" />Ativos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("leads")} className={cn(statusFilter === "leads" && "bg-accent")}>
                      <UserPlus className="h-3 w-3 mr-2" />Leads
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("renewal")} className={cn(statusFilter === "renewal" && "bg-accent")}>
                      <RefreshCw className="h-3 w-3 mr-2" />Renovação
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("pending")} className={cn(statusFilter === "pending" && "bg-accent")}>
                      <Clock className="h-3 w-3 mr-2" />Pendentes
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("assessment")} className={cn(statusFilter === "assessment" && "bg-accent")}>
                      <Activity className="h-3 w-3 mr-2" />Avaliação
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant={mineOnly ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMineOnly((value) => !value)}
                  title="Alunos atribuídos a mim"
                >
                  Meus
                </Button>
                <Button
                  variant={noWorkoutOnly ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setNoWorkoutOnly((value) => !value)}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />S/ Treino
                </Button>
                {hasActiveChatFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => {
                      setScopeFilter("all");
                      setStatusFilter("all");
                      setMineOnly(false);
                      setNoWorkoutOnly(false);
                      setTrainerFilterId(ALL_VALUE);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />Limpar
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full">
              {loadingChats ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando conversas
                </div>
              ) : chatLoadError ? (
                <div className="space-y-3 p-6 text-center">
                  <p className="text-sm text-destructive">{chatLoadError}</p>
                  <Button variant="outline" size="sm" onClick={() => void loadChats()}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Nenhuma conversa encontrada</div>
              ) : (
                filteredChats.map((chat) => {
                  const labels = chatLabels[chat.id] || [];
                  const lastSenderName = chat.last_sender_id ? senderNames[chat.last_sender_id] : null;
                  const isUnread = Number(chat.unread_count || 0) > 0;
	                  const readToggle = (
	                    <button
	                      type="button"
	                      onClick={(e) => { e.stopPropagation(); handleToggleUnread(chat.id, chat.unread_count); }}
	                      disabled={updatingUnreadChatId === chat.id}
	                      data-read-state={isUnread ? "unread" : "read"}
	                      className={cn(
	                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm transition-all disabled:cursor-wait disabled:opacity-40",
	                        isUnread
	                          ? "border-blue-300 text-blue-600 shadow-blue-500/25 ring-2 ring-blue-500/15 drop-shadow-[0_0_5px_rgba(37,99,235,0.45)] hover:bg-blue-50"
	                          : "border-slate-200 bg-slate-50/80 text-slate-400 hover:bg-slate-100 hover:text-slate-500",
	                      )}
	                      style={{ color: isUnread ? "rgb(37, 99, 235)" : "rgb(148, 163, 184)" }}
	                      title={isUnread ? "Não lida: clicar para marcar como lida" : "Lida: clicar para marcar como não lida"}
	                      aria-label={isUnread ? "Conversa não lida" : "Conversa lida"}
                    >
                      {isUnread ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                    </button>
                  );
                  return (
                    <div key={chat.id} className="group w-full max-w-full overflow-hidden">
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid="whatsapp-chat-row"
                        data-chat-id={chat.id}
                        aria-label={`Abrir conversa com ${getContactName(chat)}`}
                        onClick={() => { setSelectedChatId(chat.id); setEditingName(false); }}
                        onKeyDown={(event) => {
                          if (event.currentTarget !== event.target) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedChatId(chat.id);
                            setEditingName(false);
                          }
                        }}
	                        className={cn("relative flex w-full items-start gap-3 border-b border-border p-3 pr-14 text-left transition-colors hover:bg-muted/50", selectedChatId === chat.id && "bg-primary/10")}
	                      >
	                        <div className="absolute right-3 top-3 z-10">
	                          {readToggle}
	                        </div>
	                        {renderAvatar(chat)}
	                        <div className="flex-1 min-w-0">
	                          <div className="flex items-center justify-between gap-2">
	                            {chat.student_id ? (
	                              <button
	                                type="button"
	                                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
	                                title="Abrir perfil do aluno"
	                                onClick={(event) => {
	                                  event.stopPropagation();
	                                  navigate(`/${studioRoutePrefix}/students/${chat.student_id}`);
	                                }}
	                              >
	                                {getContactName(chat)}
	                              </button>
	                            ) : (
	                              <button
	                                type="button"
	                                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
	                                title="Vincular este contato a um perfil"
	                                onClick={(event) => {
	                                  event.stopPropagation();
	                                  handleUnlinkedContactName(chat);
	                                }}
	                              >
	                                {getContactName(chat)}
	                              </button>
	                            )}
                            {chat.unread_count > 0 && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                                <Badge className="bg-primary text-primary-foreground text-xs h-5 min-w-5 flex items-center justify-center">{chat.unread_count}</Badge>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{chat.lastMessage || "Sem mensagens"}</p>
                          {(labels.length > 0 || (chatCustomLabels[chat.id] || []).length > 0) && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {labels.includes("Aguardando Treino") && <Badge variant="destructive" className="text-[10px] h-4 px-1.5"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Aguardando Treino</Badge>}
                              {labels.includes("Financeiro") && <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/90 text-white hover:bg-amber-500"><DollarSign className="h-2.5 w-2.5 mr-0.5" />Financeiro</Badge>}
                              {(chatCustomLabels[chat.id] || []).map(labelId => {
                                const label = availableLabels.find(l => l.id === labelId);
                                if (!label) return null;
                                return <Badge key={labelId} className="text-[10px] h-4 px-1.5 text-white" style={{ backgroundColor: label.color }}>{label.name}</Badge>;
                              })}
                            </div>
                          )}
                          <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                            {lastSenderName ? <p className="min-w-0 truncate text-[10px] text-muted-foreground">Enviado por: {lastSenderName}</p> : <span />}
	                            {chat.last_message_at && <p className="shrink-0 text-[10px] text-muted-foreground">{format(new Date(chat.last_message_at), "dd/MM HH:mm")}</p>}
	                          </div>
	                        </div>
	                      </div>
	                    </div>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {isChatListCollapsed && (
            <div className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-muted/20 py-2 md:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsChatListCollapsed(false)}
                title="Expandir lista de conversas"
                aria-label="Expandir lista de conversas"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              {unreadCount > 0 && (
                <Badge className="mt-2 h-5 min-w-5 justify-center px-1 text-[10px]">
                  {unreadCount}
                </Badge>
              )}
            </div>
          )}

          {/* Messages */}
          <div className={cn(
            "min-w-0 flex-1 flex-col overflow-hidden",
            selectedChat || draftRecipient ? "flex" : "hidden md:flex",
            isConversationCollapsed && "md:hidden",
          )}>
            {!selectedChat && !draftRecipient ? (
              <div className="relative flex flex-1 items-center justify-center text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 hidden md:inline-flex"
                  onClick={() => setIsConversationCollapsed(true)}
                  title="Recolher área da conversa"
                  aria-label="Recolher área da conversa"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <div className="text-center space-y-2">
                  <MessageSquare className="h-12 w-12 mx-auto opacity-30" />
                  <p className="text-sm">Selecione uma conversa para começar</p>
                </div>
              </div>
            ) : draftRecipient ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-3 border-b border-border bg-white p-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 md:hidden"
                    onClick={() => setDraftRecipient(null)}
                    aria-label="Voltar para conversas"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{draftRecipient.contactName}</p>
                    <p className="font-mono-data text-xs text-muted-foreground">+{draftRecipient.remoteJid}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden shrink-0 md:inline-flex"
                    onClick={() => setIsConversationCollapsed(true)}
                    title="Recolher área da conversa"
                    aria-label="Recolher área da conversa"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
                  <div className="max-w-sm space-y-2">
                    <MessageSquare className="mx-auto h-10 w-10 opacity-30" />
                    <p className="text-sm font-medium text-foreground">Nova conversa interna</p>
                    <p className="text-xs">A mensagem só será enviada quando você confirmar abaixo.</p>
                  </div>
                </div>
                <div className="border-t border-border bg-white p-2 pr-20 sm:p-3 sm:pr-24 min-[1780px]:pr-3">
                  <div className="flex min-w-0 items-end gap-2 rounded-lg border border-border bg-background p-1.5 shadow-sm">
                    <Textarea
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSend();
                        }
                      }}
                      onPaste={handleComposerPaste}
                      placeholder="Digite a mensagem..."
                      className="min-h-10 max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="h-9 w-9 shrink-0" title="Enviar mensagem">
                      {sending ? <Clock className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-border bg-white p-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 md:hidden"
                    onClick={() => setSelectedChatId(null)}
                    aria-label="Voltar para conversas"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  {renderAvatar(selectedChat, "h-9 w-9")}
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          className="h-7 text-sm"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName();
                            if (e.key === "Escape") setEditingName(false);
                          }}
                          onBlur={handleSaveName}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {selectedChat.student_id ? (
                          <button
                            type="button"
                            className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                            title="Abrir perfil do aluno"
                            onClick={() => navigate(`/${studioRoutePrefix}/students/${selectedChat.student_id}`)}
                          >
                            {getContactName(selectedChat)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                            title="Vincular este contato a um perfil"
                            onClick={() => handleUnlinkedContactName(selectedChat)}
                          >
                            {getContactName(selectedChat)}
                          </button>
                        )}
                        <button onClick={() => { setEditingName(true); setEditNameValue(getContactName(selectedChat)); }} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{formatPhone(selectedChat.remote_jid) || selectedChat.remote_jid.replace(/@.*$/, "")}</p>
                  </div>
                  <div className="flex gap-1 items-center flex-wrap">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                          <ClipboardList className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">Pré-cadastro</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        sideOffset={8}
                        className="w-[min(94vw,48rem)] overflow-hidden rounded-3xl border-border bg-card p-0 shadow-xl"
                      >
                        <div className="border-b border-border px-4 py-3">
                          <p className="font-display text-lg text-primary">Pré-cadastro completo</p>
                          <p className="text-xs text-muted-foreground">Informações usadas no atendimento, avaliação e prescrição.</p>
                        </div>
                        <ScrollArea className="max-h-[72vh]">
                          <PreRegistrationDetails
                            data={selectedPreRegistration}
                            loading={preRegistrationLoading}
                            className="p-4"
                          />
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    {(chatLabels[selectedChat.id] || []).map((label) => (
                      <Badge key={label} variant={label === "Aguardando Treino" ? "destructive" : "secondary"} className={cn("text-[10px] h-5", label === "Financeiro" && "bg-amber-500/90 text-white")}>{label}</Badge>
                    ))}
                    {(chatCustomLabels[selectedChat.id] || []).map(labelId => {
                      const label = availableLabels.find(l => l.id === labelId);
                      if (!label) return null;
                      return <Badge key={labelId} className="text-[10px] h-5 text-white" style={{ backgroundColor: label.color }}>{label.name}</Badge>;
                    })}
                    {/* Link student button */}
                    <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                      {!selectedChat.student_id && (
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <UserPlus className="h-3.5 w-3.5" />
                            Vincular Aluno
                          </Button>
                        </DialogTrigger>
                      )}
                      <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Vincular Aluno à Conversa</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar aluno pelo nome..."
                                className="pl-9"
                                value={linkSearch}
                                onChange={(e) => { setLinkSearch(e.target.value); searchStudentsForLink(e.target.value); }}
                              />
                            </div>
                            <ScrollArea className="max-h-60">
                              {linkStudents.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">{linkSearch ? "Nenhum aluno encontrado" : "Digite para buscar"}</p>
                              ) : (
                                <div className="space-y-1">
                                  {linkStudents.map((s) => (
                                    <button
                                      key={s.id}
                                      onClick={() => handleLinkStudent(s.id)}
                                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-left transition-colors"
                                    >
                                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-foreground">{s.full_name}</p>
                                        <p className="text-xs text-muted-foreground">{s.whatsapp || "Sem WhatsApp"}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </ScrollArea>
                          </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden shrink-0 md:inline-flex"
                      onClick={() => setIsConversationCollapsed(true)}
                      title="Recolher área da conversa"
                      aria-label="Recolher área da conversa"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 min-[1780px]:hidden"
                          aria-label="Abrir contexto da conversa"
                        >
                          <PanelRightOpen className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="flex w-[min(88vw,22rem)] flex-col gap-0 p-0">
                        <SheetHeader className="border-b border-border p-4 pr-12 text-left">
                          <SheetTitle className="flex items-center gap-2 text-base">
                            <User className="h-4 w-4" />
                            Contexto
                          </SheetTitle>
                        </SheetHeader>
                        <ScrollArea className="min-h-0 flex-1">
                          {renderStudentContext()}
                        </ScrollArea>
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>

                <ScrollArea
                  ref={messagesScrollAreaRef}
                  className="flex-1 bg-white p-3 md:p-4"
                  onScrollCapture={(event) => {
                    const viewport = event.target as HTMLElement;
                    if (viewport.matches?.("[data-radix-scroll-area-viewport]")) {
                      messageViewportNearBottomRef.current = isChatViewportNearBottom(viewport);
                    }
                  }}
                >
                  {messagesLoading ? (
                    <div className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando mensagens
                    </div>
                  ) : messagesError ? (
                    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                      <p className="text-sm text-destructive">{messagesError}</p>
                      <Button variant="outline" size="sm" onClick={() => void loadMessages(selectedChat.id)}>
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        Tentar novamente
                      </Button>
                    </div>
                  ) : (
                  <div className="space-y-2.5">
                    {hasOlderMessages && (
                      <div className="flex justify-center pb-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void loadOlderMessages()}
                          disabled={loadingOlderMessages}
                        >
                          {loadingOlderMessages && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                          Carregar mensagens anteriores
                        </Button>
                      </div>
                    )}
                    {messages.length === 0 && (
                      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                        Nenhuma mensagem nesta conversa
                      </div>
                    )}
                    {messages.map((msg, index) => {
                      const messageDateValue = getMessageDateValue(msg);
                      const mediaSrc = getMediaSrc(msg);
                      const isMedia = msg.type !== "text" && (msg.media_type || msg.type === "image" || msg.type === "video" || msg.type === "audio" || msg.type === "document" || msg.type === "sticker");
                      const isImage = msg.media_type?.startsWith("image/") || msg.type === "image" || msg.type === "sticker";
                      const isVideo = msg.media_type?.startsWith("video/") || msg.type === "video";
                      const isAudio = msg.media_type?.startsWith("audio/") || msg.type === "audio";
                      const quotedPreview = (msg.quoted_message_preview || "").trim();
                      const quotedLabel = msg.quoted_message_source === "outgoing" ? "Você" : getContactName(selectedChat);
                      const previousMessage = index > 0 ? messages[index - 1] : null;
                      const showDateDivider = !previousMessage || !isSameDay(new Date(getMessageDateValue(previousMessage)), new Date(messageDateValue));
                      return (
                        <div key={msg.id} className="space-y-2">
                          {showDateDivider && (
                            <div className="flex justify-center py-1">
                              <span className="rounded-full border border-border bg-background/95 px-3 py-1 text-[11px] font-mono-data text-muted-foreground shadow-sm">
                                {formatMessageDay(messageDateValue)}
                              </span>
                            </div>
                          )}
                        <div
                          className="group flex w-full"
                          data-testid="whatsapp-message"
                          data-message-id={msg.id}
                          data-message-external-id={msg.message_id_external || undefined}
                        >
                          <div className={cn(
                            "relative flex w-full min-w-0 items-center gap-1",
                            msg.source === "outgoing" ? "justify-end" : "justify-start",
                          )}>
                            {msg.source === "outgoing" && msg.message_id_external && (
                              <button
                                onClick={() => handleDeleteMessage(msg)}
                                className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                                title="Apagar para todos"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {msg.message_id_external && (
                              <button
                                onClick={() => setReplyingTo(msg)}
                                className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                                title="Responder"
                              >
                                <Reply className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <div className={cn(
                              "min-w-0 max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[78%]",
                              msg.source === "outgoing"
                                ? "rounded-br-md bg-[#203b78] text-white shadow-sm"
                                : "rounded-bl-md border border-sky-200 bg-sky-50 text-slate-900 shadow-sm",
                            )}>
                            {msg.source === "outgoing" && msg.sender_id && senderNames[msg.sender_id] && (
                              <p className="text-[10px] font-semibold mb-0.5 text-primary-foreground/80">{senderNames[msg.sender_id]}</p>
                            )}
                            {quotedPreview && (
                              <div className={cn(
                                "mb-2 rounded-xl border-l-2 px-2.5 py-1.5 text-xs",
                                msg.source === "outgoing"
                                  ? "border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground/85"
                                  : "border-primary/60 bg-background/70 text-muted-foreground",
                              )}>
                                <p className={cn(
                                  "mb-0.5 font-semibold",
                                  msg.source === "outgoing" ? "text-primary-foreground/90" : "text-foreground",
                                )}>
                                  {quotedLabel}
                                </p>
                                <p className="line-clamp-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                  {quotedPreview}
                                </p>
                              </div>
                            )}
                            {mediaSrc && isImage ? (
                              <img src={mediaSrc} alt="Imagem" className="mb-1 max-h-64 max-w-full cursor-pointer rounded-xl" onClick={() => window.open(mediaSrc!, "_blank")} onError={() => handleMediaError(msg)} />
                            ) : mediaSrc && isVideo ? (
                              <div className="mb-1">
                                <video src={mediaSrc} controls className="max-h-64 max-w-full rounded-xl" onError={() => handleMediaError(msg)} />
                                {msg.source !== "outgoing" && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="mt-1.5 w-full h-7 text-xs"
                                    onClick={() => {
                                      if (!selectedChat?.student_id) { toast.error("Vincule um aluno a esta conversa primeiro."); return; }
                                      navigate(`/${studioRoutePrefix}/studio`, { state: { studentId: selectedChat.student_id, videoUrl: mediaSrc } });
                                    }}
                                  >
                                    <Activity className="h-3.5 w-3.5 mr-1" /> Usar na avaliação
                                  </Button>
                                )}
                              </div>
                            ) : mediaSrc && isAudio ? (
                              <audio src={mediaSrc} controls className="max-w-full mb-1" onError={() => handleMediaError(msg)} />
                            ) : mediaSrc && isMedia ? (
                              <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs underline mb-1"><Download className="h-3 w-3" />Baixar arquivo</a>
                            ) : isMedia && !mediaSrc ? (
                              <div className="mb-1 rounded-xl border border-dashed border-sky-200 bg-white/65 px-3 py-2 text-xs text-muted-foreground">
                                {failedMediaFetches[msg.id] ? "Mídia indisponível no provedor" : "Carregando mídia..."}
                              </div>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                            <p className={cn("mt-1.5 text-[10px] font-mono-data", msg.source === "outgoing" ? "text-primary-foreground/70" : "text-muted-foreground")}>{formatMessageTimestamp(messageDateValue)}</p>
                            </div>
                          </div>
                        </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  )}
                </ScrollArea>

                {replyingTo && (
                  <div className="border-t border-border bg-white px-3 pt-2">
                    <div className="flex items-center gap-2 rounded-2xl border-l-4 border-primary bg-sky-50 p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-primary">
                          {replyingTo.source === "outgoing" ? "Você" : getContactName(selectedChat!)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {replyingTo.content || (replyingTo.media_type ? "📎 Mídia" : "Mensagem")}
                        </p>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="border-t border-border bg-white p-2 pr-20 sm:p-3 sm:pr-24 min-[1780px]:pr-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  {isRecording ? (
                    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-1.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                        <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                        <span className="truncate text-sm font-medium text-destructive">Gravando... {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Cancelar" onClick={cancelRecording}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-9 w-9 shrink-0 bg-destructive hover:bg-destructive/90" title="Parar e enviar" onClick={stopAndSendRecording}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-end gap-1.5 rounded-2xl border border-border bg-background p-1.5 shadow-sm sm:gap-2">
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Enviar imagem ou arquivo" onClick={() => fileInputRef.current?.click()} disabled={sendingAttachment}>
                        {sendingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Gravar áudio" onClick={startRecording} disabled={sendingAttachment}>
                        <Mic className="h-4 w-4" />
                      </Button>
                      {selectedChat.student_id && (
                        <Button variant="ghost" size="icon" className="hidden h-9 w-9 shrink-0 sm:inline-flex" title="Anexar último treino/avaliação" onClick={handleAttachLastEvaluation} disabled={sendingAttachment}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      )}
                      {uploadProgress !== null && (
                        <span className="shrink-0 font-mono-data text-[11px] text-muted-foreground" aria-live="polite">
                          {uploadProgress}%
                        </span>
                      )}
                      <div className="relative min-w-0 flex-1">
                        <Textarea
                          placeholder="Digite / para templates..."
                          value={newMessage}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewMessage(val);
                            if (val.startsWith("/")) {
                              setShowTemplates(true);
                              setTemplateFilter(val.slice(1).toLowerCase());
                            } else {
                              setShowTemplates(false);
                            }
                            // Auto-resize
                            e.target.style.height = "auto";
                            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !showTemplates) { e.preventDefault(); handleSend(); }
                            if (e.key === "Escape") setShowTemplates(false);
                          }}
                          onPaste={handleComposerPaste}
                          disabled={sending}
                          className="min-h-10 max-h-32 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          rows={1}
                        />
                        {showTemplates && (
                          <div ref={templatePopoverRef} className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-60 overflow-y-auto rounded-2xl border border-border bg-popover shadow-lg">
                            {templates
                              .filter(t => !templateFilter || t.title.toLowerCase().includes(templateFilter) || (t.shortcut && t.shortcut.toLowerCase().includes(templateFilter)))
                              .map(t => {
                                const studentName = selectedChat?.student?.full_name || "";
                                return (
                                  <button
                                    key={t.id}
                                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                                    onClick={() => {
                                      const ctx = selectedChat ? studentContexts[selectedChat.id] : null;
                                      const content = interpolateTemplate(t.content, {
                                        nome: studentName,
                                        primeiro_nome: studentName.split(" ")[0] || "",
                                        plano: ctx?.planName || "",
                                        vencimento: ctx?.dueDate ? format(new Date(ctx.dueDate), "dd/MM/yyyy") : "",
                                        valor: ctx?.planValue != null ? ctx.planValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
                                        dias_restantes: ctx?.daysRemaining ?? "",
                                      });
                                      setNewMessage(content);
                                      setShowTemplates(false);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-foreground">{t.title}</span>
                                      {t.shortcut && <Badge variant="secondary" className="text-[10px]">/{t.shortcut}</Badge>}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.content}</p>
                                  </button>
                                );
                              })}
                            {templates.filter(t => !templateFilter || t.title.toLowerCase().includes(templateFilter) || (t.shortcut && t.shortcut.toLowerCase().includes(templateFilter))).length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-3">Nenhum template encontrado</p>
                            )}
                          </div>
                        )}
                      </div>
                      <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="h-9 w-9 shrink-0" title="Enviar mensagem">
                        {sending ? <Clock className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {isConversationCollapsed && (
            <div className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-card py-2 md:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsConversationCollapsed(false)}
                title="Expandir área da conversa"
                aria-label="Expandir área da conversa"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <MessageSquare className="mt-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          {/* Student Context Panel */}
          {selectedChat && !isContextCollapsed && (
            <div className="hidden w-64 shrink-0 flex-col overflow-hidden border-l border-border bg-muted/20 min-[1780px]:flex">
              <div className="flex items-center gap-2 border-b border-border p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User className="h-4 w-4" />
                  Contexto
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto shrink-0"
                  onClick={() => setIsContextCollapsed(true)}
                  title="Recolher contexto"
                  aria-label="Recolher contexto"
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                {renderStudentContext()}
              </ScrollArea>
            </div>
          )}
          {selectedChat && isContextCollapsed && (
            <div className="hidden w-12 shrink-0 flex-col items-center border-l border-border bg-muted/20 py-2 min-[1780px]:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsContextCollapsed(false)}
                title="Expandir contexto"
                aria-label="Expandir contexto"
              >
                <PanelRightOpen className="h-4 w-4" />
              </Button>
              <User className="mt-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
