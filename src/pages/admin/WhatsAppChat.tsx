import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Send, Search, User, MessageSquare, Users,
  Paperclip, Filter, AlertTriangle, DollarSign, Calendar, Clock,
  Download, MailOpen, Mail, UserPlus, Pencil, Check, X, Image, Mic,
  MessageCircle, ChevronDown, Tag, Trash2, Reply,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";

type Chat = {
  id: string;
  remote_jid: string;
  unread_count: number;
  last_message_at: string | null;
  student_id: string | null;
  instance_id: string;
  last_sender_id: string | null;
  contact_name: string | null;
  category: string | null;
  student?: { full_name: string; whatsapp: string | null; category_id: string | null } | null;
  lastMessage?: string;
};

type Message = {
  id: string;
  content: string | null;
  source: string;
  type: string;
  created_at: string;
  sender_id: string | null;
  media_url: string | null;
  media_type: string | null;
  message_id_external: string | null;
};

type StudentContext = {
  cycleNumber: number;
  cycleStartDate: string;
  daysRemaining: number;
  paymentStatus: string;
  hasActiveWorkout: boolean;
  studentName: string;
};

type FilterType = "all" | "unread" | "groups" | "mine" | "no-workout";

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

export default function WhatsAppChat() {
  const { user, role: userRole, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = userRole === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [studentContexts, setStudentContexts] = useState<Record<string, StudentContext>>({});
  const [chatLabels, setChatLabels] = useState<Record<string, string[]>>({});
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [mediaFallbacks, setMediaFallbacks] = useState<Record<string, string>>({});
  const [failedMediaFetches, setFailedMediaFetches] = useState<Record<string, true>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("");
  const templatePopoverRef = useRef<HTMLDivElement>(null);

  // Categories state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [availableLabels, setAvailableLabels] = useState<LabelItem[]>([]);
  const [chatCustomLabels, setChatCustomLabels] = useState<Record<string, string[]>>({}); // chatId -> label ids

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
    let query = supabase
      .from("whatsapp_chats")
      .select("*, student:students(full_name, whatsapp, category_id)")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);

    const { data: chatData } = await query;

    if (chatData) {
      const chatsWithPreview = chatData.map((chat: any) => ({
        ...chat,
        student: Array.isArray(chat.student) ? chat.student[0] : chat.student,
        lastMessage: chat.last_message || "",
      }));
      setChats(chatsWithPreview);
    }
  }, [effectiveCompanyId]);

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
    if (studentChats.length === 0) return;

    const studentIds = [...new Set(studentChats.map((c) => c.student_id!))];

    let enrollQuery = supabase
      .from("enrollments")
      .select("id, student_id, status, training_start_date")
      .in("student_id", studentIds)
      .eq("status", "active");
    if (effectiveCompanyId) enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);

    const { data: enrollments } = await enrollQuery;

    const enrollmentIds = (enrollments || []).map((e) => e.id);
    const { data: cycles } = enrollmentIds.length > 0
      ? await supabase.from("training_cycles").select("id, enrollment_id, cycle_number, start_date, end_date, status").in("enrollment_id", enrollmentIds).eq("status", "active")
      : { data: [] };

    const cycleIds = (cycles || []).map((c) => c.id);
    const { data: workouts } = cycleIds.length > 0
      ? await supabase.from("workouts").select("id, cycle_id").in("cycle_id", cycleIds)
      : { data: [] };

    const { data: payments } = await supabase
      .from("payments")
      .select("id, student_id, status")
      .in("student_id", studentIds)
      .not("status", "in", '("RECEIVED","CONFIRMED","RECEIVED_IN_CASH")');

    const contexts: Record<string, StudentContext> = {};
    const labels: Record<string, string[]> = {};
    const workoutsByCycle = new Set((workouts || []).map((w) => w.cycle_id));
    const pendingPaymentsByStudent = new Set((payments || []).map((p) => p.student_id));

    for (const chat of studentChats) {
      const studentId = chat.student_id!;
      const enrollment = (enrollments || []).find((e) => e.student_id === studentId);
      const cycle = enrollment ? (cycles || []).find((c) => c.enrollment_id === enrollment.id) : null;
      const chatLabelsArr: string[] = [];

      if (cycle) {
        const daysRemaining = Math.max(0, differenceInDays(new Date(cycle.end_date), new Date()));
        const hasWorkout = workoutsByCycle.has(cycle.id);
        contexts[chat.id] = { cycleNumber: cycle.cycle_number, cycleStartDate: cycle.start_date, daysRemaining, paymentStatus: pendingPaymentsByStudent.has(studentId) ? "pendente" : "em dia", hasActiveWorkout: hasWorkout, studentName: chat.student?.full_name || "" };
        if (!hasWorkout) chatLabelsArr.push("Aguardando Treino");
      } else if (enrollment) {
        contexts[chat.id] = { cycleNumber: 0, cycleStartDate: enrollment.training_start_date || "", daysRemaining: 0, paymentStatus: pendingPaymentsByStudent.has(studentId) ? "pendente" : "em dia", hasActiveWorkout: false, studentName: chat.student?.full_name || "" };
        chatLabelsArr.push("Aguardando Treino");
      }

      if (pendingPaymentsByStudent.has(studentId)) chatLabelsArr.push("Financeiro");
      if (chatLabelsArr.length > 0) labels[chat.id] = chatLabelsArr;
    }

    setStudentContexts(contexts);
    setChatLabels(labels);
  }, [effectiveCompanyId]);

  const loadMessages = useCallback(async (chatId: string) => {
    const { data } = await supabase.from("whatsapp_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true });
    if (data) setMessages(data);
    await supabase.from("whatsapp_chats").update({ unread_count: 0 }).eq("id", chatId);
  }, []);

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

      if (contactsRes.ok) {
        const data = await contactsRes.json();
        for (const contact of data.contacts || []) {
          const jid = contact.id || contact.remoteJid || contact.jid || "";
          const name = contact.pushName || contact.name || contact.notify || "";
          if (jid && name) nameMap[jid] = name;
        }
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json();
        const updates: PromiseLike<any>[] = [];

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
    } catch (err) {
      console.error("Error loading contacts:", err);
    }
  }, []);

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
    if (!selectedChatId) return;
    await supabase.from("whatsapp_chats").update({ student_id: studentId }).eq("id", selectedChatId);
    setLinkDialogOpen(false);
    setLinkSearch("");
    setLinkStudents([]);
    loadChats();
    toast.success("Aluno vinculado à conversa");
  };

  // Media fallback
  const handleMediaError = async (msg: Message) => {
    if (mediaFallbacks[msg.id] || failedMediaFetches[msg.id] || !msg.message_id_external) return;

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
          messageId: msg.message_id_external,
          remoteJid: chat?.remote_jid || undefined,
          fromMe: msg.source === "outgoing",
        }),
      });

      if (!res.ok) {
        setFailedMediaFetches((prev) => ({ ...prev, [msg.id]: true }));
        return;
      }

      const data = await res.json();
      if (data.base64 && data.mimetype) {
        setMediaFallbacks((prev) => ({ ...prev, [msg.id]: `data:${data.mimetype};base64,${data.base64}` }));
        return;
      }

      setFailedMediaFetches((prev) => ({ ...prev, [msg.id]: true }));
    } catch {
      setFailedMediaFetches((prev) => ({ ...prev, [msg.id]: true }));
    }
  };

  const getMediaSrc = (msg: Message) => mediaFallbacks[msg.id] || msg.media_url;

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

  const loadChatLabels = useCallback(async (chatIds: string[]) => {
    if (chatIds.length === 0) return;
    const { data } = await supabase.from("whatsapp_chat_labels").select("chat_id, label_id").in("chat_id", chatIds);
    if (data) {
      const map: Record<string, string[]> = {};
      data.forEach((row: any) => {
        if (!map[row.chat_id]) map[row.chat_id] = [];
        map[row.chat_id].push(row.label_id);
      });
      setChatCustomLabels(map);
    }
  }, []);

  const toggleChatLabel = async (chatId: string, labelId: string) => {
    const current = chatCustomLabels[chatId] || [];
    if (current.includes(labelId)) {
      await supabase.from("whatsapp_chat_labels").delete().eq("chat_id", chatId).eq("label_id", labelId);
      setChatCustomLabels(prev => ({ ...prev, [chatId]: current.filter(id => id !== labelId) }));
    } else {
      await supabase.from("whatsapp_chat_labels").insert({ chat_id: chatId, label_id: labelId } as any);
      setChatCustomLabels(prev => ({ ...prev, [chatId]: [...current, labelId] }));
    }
  };

  useEffect(() => { loadChats(); loadSenderNames(); loadTemplates(); loadCategories(); loadAvailableLabels(); }, [loadChats, loadSenderNames, loadTemplates, loadCategories, loadAvailableLabels]);
  // Load contacts from Evolution API separately to avoid overwhelming edge function workers
  useEffect(() => { const t = setTimeout(() => loadContacts(), 2000); return () => clearTimeout(t); }, [loadContacts]);
  useEffect(() => { if (chats.length > 0) { loadStudentData(chats); loadChatLabels(chats.map(c => c.id)); } }, [chats, loadStudentData, loadChatLabels]);
  useEffect(() => { if (selectedChatId) loadMessages(selectedChatId); }, [selectedChatId, loadMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Auto-fetch media for messages that have media_type but no media_url or fallback
  useEffect(() => {
    const pendingMedia = messages.filter(
      (m) => m.media_type && !m.media_url && !mediaFallbacks[m.id] && !failedMediaFetches[m.id] && m.message_id_external
    );
    if (pendingMedia.length === 0) return;
    // Throttle: fetch max 3 at a time
    const toFetch = pendingMedia.slice(0, 3);
    for (const msg of toFetch) {
      handleMediaError(msg);
    }
  }, [messages, mediaFallbacks, failedMediaFetches]);

  // Realtime - canal privado por empresa (compatível com policy de realtime.messages)
  useEffect(() => {
    if (!effectiveCompanyId) return;
    const channel = supabase
      .channel(`company:${effectiveCompanyId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${effectiveCompanyId}` }, (payload) => {
        const newMsg = payload.new as Message & { chat_id: string };
        if (newMsg.chat_id === selectedChatId) setMessages((prev) => [...prev, newMsg]);
        loadChats();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_chats", filter: `company_id=eq.${effectiveCompanyId}` }, () => { loadChats(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedChatId, loadChats, effectiveCompanyId]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          action: "send-message",
          companyId: effectiveCompanyId,
          remoteJid: chat.remote_jid,
          content: newMessage.trim(),
          chatId: selectedChatId,
          ...(replyingTo?.message_id_external ? { quotedMessageId: replyingTo.message_id_external } : {}),
        }),
      });
      if (!res.ok) throw new Error("Erro ao enviar");
      setNewMessage("");
      setReplyingTo(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
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
    } catch (err: any) {
      toast.error(err.message || "Erro ao apagar mensagem");
    }
  };

  const handleAttachLastEvaluation = async () => {
    if (!selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat?.student_id) { toast.error("Nenhum aluno vinculado a esta conversa"); return; }
    setSendingAttachment(true);
    try {
      const { data: evaluations } = await supabase.from("student_evaluations").select("id, file_url, type, created_at").eq("student_id", chat.student_id).not("file_url", "is", null).order("created_at", { ascending: false }).limit(1);
      if (!evaluations || evaluations.length === 0) { toast.error("Nenhum arquivo encontrado"); return; }
      const fileUrl = evaluations[0].file_url!;
      let mediaUrl = fileUrl;
      if (!fileUrl.startsWith("http")) {
        const { data: signedData } = await supabase.storage.from("evaluations").createSignedUrl(fileUrl, 3600);
        if (signedData?.signedUrl) mediaUrl = signedData.signedUrl;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "send-media", companyId: effectiveCompanyId, remoteJid: chat.remote_jid, mediaUrl, caption: "📋 Último treino/avaliação", chatId: selectedChatId, fileName: fileUrl.split("/").pop() || "avaliacao.pdf" }),
      });
      if (!res.ok) throw new Error("Erro ao enviar arquivo");
      toast.success("Arquivo enviado!");
    } catch (err: any) { toast.error(err.message || "Erro ao enviar arquivo"); }
    finally { setSendingAttachment(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChatId) return;
    e.target.value = "";
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;
    setSendingAttachment(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const filePath = `${effectiveCompanyId}/${selectedChatId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("whatsapp-media").upload(filePath, file);
      if (uploadError) throw new Error("Erro ao fazer upload: " + uploadError.message);
      const { data: signed } = await supabase.storage.from("whatsapp-media").createSignedUrl(filePath, 60 * 60 * 24 * 7);
      const mediaUrl = signed?.signedUrl;
      if (!mediaUrl) throw new Error("Erro ao gerar URL da mídia");
      let mediatype: string | undefined;
      if (file.type.startsWith("image/")) mediatype = "image";
      else if (file.type.startsWith("video/")) mediatype = "video";
      else if (file.type.startsWith("audio/")) mediatype = "audio";
      else mediatype = "document";
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "send-media", companyId: effectiveCompanyId, remoteJid: chat.remote_jid, mediaUrl, chatId: selectedChatId, mediatype, mimeType: file.type, fileName: file.name, caption: "" }),
      });
      if (!res.ok) throw new Error("Erro ao enviar mídia");
      toast.success("Mídia enviada!");
    } catch (err: any) { toast.error(err.message || "Erro ao enviar mídia"); }
    finally { setSendingAttachment(false); }
  };

  const handleToggleUnread = async (chatId: string, currentUnread: number) => {
    const newCount = currentUnread === 0 ? 1 : 0;
    await supabase.from("whatsapp_chats").update({ unread_count: newCount }).eq("id", chatId);
    loadChats();
    toast.success(newCount > 0 ? "Marcado como não lida" : "Marcado como lida");
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
    try {
      const filePath = `${effectiveCompanyId}/${selectedChatId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("whatsapp-media").upload(filePath, blob, { contentType: "audio/webm" });
      if (uploadError) throw new Error("Erro ao fazer upload: " + uploadError.message);
      const { data: signed } = await supabase.storage.from("whatsapp-media").createSignedUrl(filePath, 60 * 60 * 24 * 7);
      const mediaUrl = signed?.signedUrl;
      if (!mediaUrl) throw new Error("Erro ao gerar URL do áudio");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "send-media", companyId: effectiveCompanyId, remoteJid: chat.remote_jid, mediaUrl, chatId: selectedChatId, mediatype: "audio", mimeType: "audio/webm", fileName: `audio-${Date.now()}.webm`, caption: "" }),
      });
      if (!res.ok) throw new Error("Erro ao enviar áudio");
      toast.success("Áudio enviado!");
    } catch (err: any) { toast.error(err.message || "Erro ao enviar áudio"); }
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
  const unreadCount = chats.filter(c => (c.unread_count || 0) > 0).length;

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const filteredChats = chats.filter((c) => {
    const name = getContactName(c);
    if (!name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (activeFilter === "unread" && (c.unread_count || 0) === 0) return false;
    if (activeFilter === "groups" && !c.remote_jid.includes("@g.us")) return false;
    if (activeFilter === "mine" && c.last_sender_id !== user?.id) return false;
    if (activeFilter === "no-workout") {
      const labels = chatLabels[c.id] || [];
      if (!labels.includes("Aguardando Treino")) return false;
    }
    return true;
  });

  const studentCtx = selectedChat ? studentContexts[selectedChat.id] : null;

  return (
    <AppLayout noPadding>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-wide">Conversas</h1>
            <p className="text-muted-foreground font-sans text-sm">Gestão de atendimento WhatsApp</p>
          </div>
        </div>

        <div className="flex flex-1 border border-border rounded-lg overflow-hidden bg-card min-h-0">
          {/* Chat List */}
          <div className="w-80 border-r border-border flex flex-col shrink-0">
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar conversa..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={["all", "unread", "groups"].includes(activeFilter) ? "default" : "ghost"} size="sm" className="h-7 text-xs">
                      <Filter className="h-3 w-3 mr-1" />
                      {activeFilter === "unread" ? `Não Lidas (${unreadCount})` : activeFilter === "groups" ? "Grupos" : "Todas"}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setActiveFilter("all")} className={cn(activeFilter === "all" && "bg-accent")}>
                      <Filter className="h-3 w-3 mr-2" />Todas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveFilter("unread")} className={cn(activeFilter === "unread" && "bg-accent")}>
                      <MessageCircle className="h-3 w-3 mr-2" />Não Lidas
                      {unreadCount > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] flex items-center justify-center">{unreadCount}</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveFilter("groups")} className={cn(activeFilter === "groups" && "bg-accent")}>
                      <Users className="h-3 w-3 mr-2" />Grupos
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant={activeFilter === "mine" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setActiveFilter("mine")}>Minhas</Button>
                <Button variant={activeFilter === "no-workout" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setActiveFilter("no-workout")}><AlertTriangle className="h-3 w-3 mr-1" />S/ Treino</Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              {filteredChats.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Nenhuma conversa encontrada</div>
              ) : (
                filteredChats.map((chat) => {
                  const labels = chatLabels[chat.id] || [];
                  const lastSenderName = chat.last_sender_id ? senderNames[chat.last_sender_id] : null;
                  return (
                    <div key={chat.id} className="relative group">
                      <button
                        onClick={() => { setSelectedChatId(chat.id); setEditingName(false); }}
                        className={cn("w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors flex items-start gap-3", selectedChatId === chat.id && "bg-primary/10")}
                      >
                        <div className="h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
                          {isGroup(chat) ? <Users className="h-5 w-5 text-muted-foreground" /> : <User className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-foreground truncate min-w-0 flex-1">{getContactName(chat)}</span>
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
                          <div className="flex items-center justify-between mt-0.5">
                            {lastSenderName && <p className="text-[10px] text-muted-foreground truncate">Enviado por: {lastSenderName}</p>}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {chat.last_message_at && <p className="text-[10px] text-muted-foreground">{format(new Date(chat.last_message_at), "dd/MM HH:mm")}</p>}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleUnread(chat.id, chat.unread_count); }}
                                className="p-0.5 rounded hover:bg-muted/80 transition-colors"
                                title={chat.unread_count > 0 ? "Marcar como lida" : "Marcar como não lida"}
                              >
                                {chat.unread_count > 0 ? <Mail className="h-3.5 w-3.5 text-primary" /> : <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {!selectedChat ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <MessageSquare className="h-12 w-12 mx-auto opacity-30" />
                  <p className="text-sm">Selecione uma conversa para começar</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-border flex items-center gap-3 bg-muted/30">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    {isGroup(selectedChat) ? <Users className="h-4 w-4 text-muted-foreground" /> : <User className="h-4 w-4 text-muted-foreground" />}
                  </div>
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
                        <p className="font-medium text-sm text-foreground">{getContactName(selectedChat)}</p>
                        <button onClick={() => { setEditingName(true); setEditNameValue(getContactName(selectedChat)); }} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{formatPhone(selectedChat.remote_jid) || selectedChat.remote_jid.replace(/@.*$/, "")}</p>
                  </div>
                  <div className="flex gap-1 items-center flex-wrap">
                    {(chatLabels[selectedChat.id] || []).map((label) => (
                      <Badge key={label} variant={label === "Aguardando Treino" ? "destructive" : "secondary"} className={cn("text-[10px] h-5", label === "Financeiro" && "bg-amber-500/90 text-white")}>{label}</Badge>
                    ))}
                    {(chatCustomLabels[selectedChat.id] || []).map(labelId => {
                      const label = availableLabels.find(l => l.id === labelId);
                      if (!label) return null;
                      return <Badge key={labelId} className="text-[10px] h-5 text-white" style={{ backgroundColor: label.color }}>{label.name}</Badge>;
                    })}
                    {/* Link student button */}
                    {!selectedChat.student_id && (
                      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <UserPlus className="h-3.5 w-3.5" />
                            Vincular Aluno
                          </Button>
                        </DialogTrigger>
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
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {messages.map((msg) => {
                      const mediaSrc = getMediaSrc(msg);
                      const isMedia = msg.type !== "text" && (msg.media_type || msg.type === "image" || msg.type === "video" || msg.type === "audio" || msg.type === "document" || msg.type === "sticker");
                      const isImage = msg.media_type?.startsWith("image/") || msg.type === "image" || msg.type === "sticker";
                      const isVideo = msg.media_type?.startsWith("video/") || msg.type === "video";
                      const isAudio = msg.media_type?.startsWith("audio/") || msg.type === "audio";
                      return (
                        <div key={msg.id} className={cn("flex group", msg.source === "outgoing" ? "justify-end" : "justify-start")}>
                          <div className="relative flex items-center gap-1">
                            {msg.source === "outgoing" && msg.message_id_external && (
                              <button
                                onClick={() => handleDeleteMessage(msg)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                                title="Apagar para todos"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {msg.message_id_external && (
                              <button
                                onClick={() => setReplyingTo(msg)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                title="Responder"
                              >
                                <Reply className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <div className={cn("max-w-[70%] rounded-lg px-3 py-2 text-sm", msg.source === "outgoing" ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted text-foreground rounded-bl-none")}>
                            {msg.source === "outgoing" && msg.sender_id && senderNames[msg.sender_id] && (
                              <p className="text-[10px] font-semibold mb-0.5 text-primary-foreground/80">{senderNames[msg.sender_id]}</p>
                            )}
                            {mediaSrc && isImage ? (
                              <img src={mediaSrc} alt="Imagem" className="rounded max-w-full max-h-64 mb-1 cursor-pointer" onClick={() => window.open(mediaSrc!, "_blank")} onError={() => handleMediaError(msg)} />
                            ) : mediaSrc && isVideo ? (
                              <video src={mediaSrc} controls className="rounded max-w-full max-h-64 mb-1" onError={() => handleMediaError(msg)} />
                            ) : mediaSrc && isAudio ? (
                              <audio src={mediaSrc} controls className="max-w-full mb-1" onError={() => handleMediaError(msg)} />
                            ) : mediaSrc && isMedia ? (
                              <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs underline mb-1"><Download className="h-3 w-3" />Baixar arquivo</a>
                            ) : isMedia && !mediaSrc ? (
                              <p className="text-xs text-muted-foreground italic mb-1">Carregando mídia...</p>
                            ) : null}
                            <p className="whitespace-pre-wrap break-all">{msg.content}</p>
                            <p className={cn("text-[10px] mt-1", msg.source === "outgoing" ? "text-primary-foreground/70" : "text-muted-foreground")}>{format(new Date(msg.created_at), "HH:mm")}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {replyingTo && (
                  <div className="px-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 border-l-4 border-primary">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-primary">
                          {replyingTo.source === "outgoing" ? "Você" : getContactName(selectedChat!)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {replyingTo.content || (replyingTo.media_type ? "📎 Mídia" : "Mensagem")}
                        </p>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="p-3 border-t border-border flex gap-2 items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  {isRecording ? (
                    <>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                        <span className="text-sm text-destructive font-medium">Gravando... {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0" title="Cancelar" onClick={cancelRecording}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="shrink-0 bg-destructive hover:bg-destructive/90" title="Parar e enviar" onClick={stopAndSendRecording}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="shrink-0" title="Enviar imagem ou arquivo" onClick={() => fileInputRef.current?.click()} disabled={sendingAttachment}>
                        <Image className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="shrink-0" title="Gravar áudio" onClick={startRecording} disabled={sendingAttachment}>
                        <Mic className="h-4 w-4" />
                      </Button>
                      {selectedChat.student_id && (
                        <Button variant="ghost" size="icon" className="shrink-0" title="Anexar último treino/avaliação" onClick={handleAttachLastEvaluation} disabled={sendingAttachment}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="relative flex-1">
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
                          disabled={sending}
                          className="min-h-[40px] max-h-[200px] resize-none overflow-y-auto py-2"
                          rows={1}
                        />
                        {showTemplates && (
                          <div ref={templatePopoverRef} className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
                            {templates
                              .filter(t => !templateFilter || t.title.toLowerCase().includes(templateFilter) || (t.shortcut && t.shortcut.toLowerCase().includes(templateFilter)))
                              .map(t => {
                                const studentName = selectedChat?.student?.full_name || "";
                                return (
                                  <button
                                    key={t.id}
                                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                                    onClick={() => {
                                      const content = t.content.replace(/\{\{nome\}\}/g, studentName);
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
                      <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon"><Send className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Student Context Panel */}
          {selectedChat && (
            <div className="w-64 border-l border-border flex flex-col bg-muted/20 shrink-0 overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><User className="h-4 w-4" />Contexto</h3>
              </div>
              <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Contato</p>
                  <p className="text-sm font-medium text-foreground">{studentCtx?.studentName || selectedChat.student?.full_name || selectedChat.contact_name || "Contato"}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Categoria</p>
                  <Select
                    value={selectedChat.category || "regular"}
                    onValueChange={async (val) => {
                      await supabase.from("whatsapp_chats").update({ category: val }).eq("id", selectedChat.id);
                      setChats((prev) =>
                        prev.map((c) => c.id === selectedChat.id ? { ...c, category: val } : c)
                      );
                      toast.success("Categoria atualizada");
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.name}>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="capitalize">{cat.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Tag className="h-3 w-3" /> Etiquetas</p>
                  {availableLabels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Crie etiquetas no CRM</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {availableLabels.map(label => {
                        const isActive = (chatCustomLabels[selectedChat.id] || []).includes(label.id);
                        return (
                          <button
                            key={label.id}
                            onClick={() => toggleChatLabel(selectedChat.id, label.id)}
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer",
                              isActive
                                ? "border-transparent text-white"
                                : "border-border text-muted-foreground hover:bg-muted/50"
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
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3" /> Ciclo Atual</p>
                          <p className="text-sm text-foreground">Ciclo {studentCtx.cycleNumber}</p>
                          <p className="text-xs text-muted-foreground">Início: {format(new Date(studentCtx.cycleStartDate), "dd/MM/yyyy")}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Clock className="h-3 w-3" /> Dias Restantes</p>
                          <p className={cn("text-lg font-bold", studentCtx.daysRemaining <= 7 ? "text-destructive" : "text-foreground")}>{studentCtx.daysRemaining} dias</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Prescrição</p>
                          <Badge variant={studentCtx.hasActiveWorkout ? "secondary" : "destructive"} className="text-xs">{studentCtx.hasActiveWorkout ? "✓ Treino Ativo" : "✗ Sem Treino"}</Badge>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1"><p className="text-xs text-muted-foreground">Sem ciclo ativo</p></div>
                    )}
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><DollarSign className="h-3 w-3" /> Financeiro</p>
                      <Badge className={cn("text-xs", studentCtx.paymentStatus === "pendente" ? "bg-amber-500/90 text-white hover:bg-amber-500" : "bg-emerald-500/90 text-white hover:bg-emerald-500")}>{studentCtx.paymentStatus === "pendente" ? "Pendente" : "Em dia"}</Badge>
                    </div>
                  </>
                )}
              </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
