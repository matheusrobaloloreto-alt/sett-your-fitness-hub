// ============================================================================
// VideoAssessment.tsx — BN Performance Training
// Feature 2: upload de vídeo → extrai frames → IA analisa → treinador edita
// Funciona em browser real (Lovable). Cole em: src/components/VideoAssessment.tsx
//
// Props: studentId, companyId, onComplete(assessmentId)
// ============================================================================
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Loader2, Video, Camera, Plus, X, Save, Sparkles, RefreshCw, SkipBack, SkipForward, Eye, Maximize2 } from "lucide-react";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/lib/studioUi";
import { toast } from "sonner";
import { generateAssessmentPDF } from "@/lib/generatePDFs";
import { saveStudentFile } from "@/lib/studentFiles";
import { sendPdfToStudentWhatsApp } from "@/lib/sendStudentMedia";

type JsonObject = { [key: string]: Json | undefined };

interface SupabaseErrorLike {
  message: string;
}

interface FunctionalAssessmentInsert {
  student_id: string;
  company_id: string;
  queixa_principal: string | null;
  historico_lesoes: string | null;
  modalidade: string | null;
  nivel: string | null;
  report_text: string;
  assessment_json: JsonObject;
  status: string;
  source: string;
}

interface AssessmentFrameInsert {
  assessment_id: string;
  company_id: string;
  frame_index: number;
  vista: string;
  image_url: string;
  ai_findings: Finding[] | null;
  trainer_findings: Finding[];
  edited: boolean;
}

interface VideoDbClient {
  storage: {
    from(bucket: string): {
      upload(path: string, file: Blob, options?: { upsert?: boolean }): Promise<{ error: SupabaseErrorLike | null }>;
    };
  };
  from(table: "functional_assessments"): {
    insert(row: FunctionalAssessmentInsert): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: SupabaseErrorLike | null }>;
      };
    };
  };
  from(table: "assessment_frames"): {
    insert(row: AssessmentFrameInsert): Promise<{ error: SupabaseErrorLike | null }>;
  };
}

const videoDb = supabase as unknown as VideoDbClient;

const POSTURE_OHS_VISTAS = [
  "Vista Anterior",
  "Vista Lateral D",
  "Vista Posterior",
  "Vista Lateral E",
  "Vista Anterior OHS",
  "Vista Lateral OHS 1",
  "Vista Posterior OHS",
  "Vista Lateral OHS 2",
];
const BN_SEQUENCE_VISTAS = [
  "Postura inicial",
  "Air Squat",
  "Toe Touch",
  "Lunge alternado",
  "Shoulder Flexion",
  "Marcha estacionaria",
  "Equilibrio unipodal D",
  "Equilibrio unipodal E",
];
const FREE_VISTAS = [
  "Corte 1",
  "Corte 2",
  "Corte 3",
  "Corte 4",
  "Corte 5",
  "Corte 6",
  "Corte 7",
  "Corte 8",
];
const PROTOCOL_PRESETS = {
  posture_ohs: {
    label: "Postura + OHS",
    hint: "postura_ohs",
    description: "Frente, laterais, costas e agachamento/OHS.",
    vistas: POSTURE_OHS_VISTAS,
    fractions: [0.05, 0.17, 0.29, 0.41, 0.53, 0.65, 0.77, 0.89],
  },
  bn_sequence: {
    label: "Sequência BN",
    hint: "sequencia_bn_oficial",
    description: "Air squat, toe touch, lunge, ombro, marcha e equilíbrio.",
    vistas: BN_SEQUENCE_VISTAS,
    fractions: [0.12, 0.25, 0.38, 0.50, 0.62, 0.74, 0.86, 0.94],
  },
  free: {
    label: "Livre",
    hint: "video_livre",
    description: "Cortes sem rótulo técnico para editar manualmente.",
    vistas: FREE_VISTAS,
    fractions: [0.12, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82, 0.92],
  },
} as const;
type AutoProtocol = keyof typeof PROTOCOL_PRESETS;
type AnnotationTool = "line" | "circle";
const VISTAS = Array.from(new Set([
  ...POSTURE_OHS_VISTAS,
  ...BN_SEQUENCE_VISTAS,
  ...FREE_VISTAS,
  "Lunge D",
  "Lunge E",
  "Extra",
]));
const GRAVIDADES = ["Leve", "Moderada", "Severa"];
const FRAME_NUDGE_SECONDS = 1;

interface Finding {
  gravidade: string;
  descricao: string;
}

interface Frame {
  id: string;
  time: number;
  preview: string;   // dataURL para exibir
  blob: Blob;        // para upload
  vista: string;
  findings: Finding[];
  aiAnalyzed: boolean;
}

interface AssessmentContext {
  studentName?: string;
  queixa_principal?: string;
  historico_lesoes?: string;
  modalidade?: string;
  nivel?: string;
  peso_kg?: string;
  altura_cm?: string;
  cintura_cm?: string;
  percentual_gordura?: string;
  perimetros?: string;
  observacoes_tecnicas?: string;
}

interface VideoAssessmentResult {
  id: string;
  report_text: string;
  assessment_json: JsonObject;
  frame_findings?: AiFrameFinding[];
}

type AiFindingInput = Partial<Finding> | string;

interface AiFrameFinding {
  frameId?: string;
  findings?: AiFindingInput[];
}

interface AiFunctionalAssessmentResponse {
  error?: string;
  assessment_json?: JsonObject | null;
  report_text?: string | null;
  frame_findings?: AiFrameFinding[];
}

export interface WhatsAppAssessmentVideoHandoff {
  version: 1;
  studentId: string;
  chatId: string;
  messageId: string;
  messageExternalId?: string | null;
  mediaStoragePath?: string | null;
}

interface WhatsAppFetchMediaResponse {
  base64?: string | null;
  mimetype?: string | null;
  mediaUrl?: string | null;
}

function base64VideoBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Falha ao baixar o vídeo (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith("video/")) {
    throw new Error("A mídia recebida não é um vídeo válido.");
  }
  return blob;
}

async function resolveWhatsAppAssessmentVideoBlob({
  handoff,
  companyId,
  studentId,
}: {
  handoff: WhatsAppAssessmentVideoHandoff;
  companyId: string;
  studentId: string;
}): Promise<Blob> {
  if (handoff.studentId !== studentId) {
    throw new Error("Este vídeo pertence a outro aluno. Volte à conversa correta e tente novamente.");
  }

  const { data: chat, error: chatError } = await supabase
    .from("whatsapp_chats")
    .select("id, company_id, student_id, remote_jid")
    .eq("id", handoff.chatId)
    .eq("company_id", companyId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (chatError || !chat) {
    throw new Error("A conversa não pertence a este aluno ou a esta empresa.");
  }

  const { data: message, error: messageError } = await supabase
    .from("whatsapp_messages")
    .select("id, chat_id, company_id, source, type, media_type, media_url, media_storage_path, message_id_external, sender_id")
    .eq("id", handoff.messageId)
    .eq("chat_id", handoff.chatId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (messageError || !message) {
    throw new Error("A mensagem de vídeo não foi encontrada nesta conversa.");
  }
  if (handoff.messageExternalId && message.message_id_external && handoff.messageExternalId !== message.message_id_external) {
    throw new Error("A identidade da mensagem mudou. Reabra o vídeo na conversa e tente novamente.");
  }
  if (message.source !== "incoming") {
    throw new Error("Somente vídeos recebidos do aluno podem iniciar esta avaliação.");
  }
  if (message.type !== "video" && !message.media_type?.startsWith("video/")) {
    throw new Error("A mensagem selecionada não contém um vídeo.");
  }

  const storagePath = message.media_storage_path;
  if (handoff.mediaStoragePath && storagePath && handoff.mediaStoragePath !== storagePath) {
    throw new Error("A referência do vídeo mudou. Reabra a mensagem e tente novamente.");
  }
  if (storagePath) {
    const expectedPrefix = `${companyId}/${handoff.chatId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      throw new Error("O vídeo não está vinculado à conversa selecionada.");
    }
    const { data: storedVideo, error: storageError } = await supabase.storage
      .from("whatsapp-media")
      .download(storagePath);
    if (!storageError && storedVideo) {
      if (storedVideo.type && !storedVideo.type.startsWith("video/")) {
        throw new Error("O arquivo armazenado não é um vídeo válido.");
      }
      return storedVideo;
    }
  }

  if (message.message_id_external) {
    const { data: fetched, error: fetchError } = await supabase.functions.invoke<WhatsAppFetchMediaResponse>("whatsapp-manager", {
      body: {
        action: "fetch-media",
        companyId,
        chatId: handoff.chatId,
        messageDbId: handoff.messageId,
        messageId: message.message_id_external,
        remoteJid: message.sender_id || chat.remote_jid,
        fromMe: false,
        mimeType: message.media_type,
      },
    });
    if (!fetchError && fetched?.mediaUrl) {
      try {
        return await fetchVideoBlob(fetched.mediaUrl);
      } catch {
        // Em navegadores que bloqueiam o fetch da signed URL, usa o base64
        // autenticado retornado pela mesma função como último fallback.
      }
    }
    if (!fetchError && fetched?.base64) {
      const mimeType = fetched.mimetype || message.media_type || "video/mp4";
      if (!mimeType.startsWith("video/")) throw new Error("A mídia recuperada não é um vídeo.");
      return base64VideoBlob(fetched.base64, mimeType);
    }
  }

  // A URL é o último recurso e vem da linha validada no banco. O valor do
  // history.state nunca é usado para apontar para outra mídia.
  if (message.media_url) return fetchVideoBlob(message.media_url);

  throw new Error("Não foi possível recuperar o vídeo. Tente novamente ou reabra a mídia no WhatsApp.");
}

export default function VideoAssessment({ studentId, companyId, assessmentContext, onComplete, initialWhatsAppVideo, onInitialVideoConsumed }: {
  studentId: string;
  companyId: string;
  assessmentContext?: AssessmentContext;
  onComplete?: (id: string, result?: VideoAssessmentResult) => void;
  // O Studio entrega IDs estáveis; este componente revalida tenant/aluno/mensagem.
  initialWhatsAppVideo?: WhatsAppAssessmentVideoHandoff | null;
  onInitialVideoConsumed?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [initialVideoLoading, setInitialVideoLoading] = useState(false);
  const [initialVideoError, setInitialVideoError] = useState("");
  const [extracting, setExtracting]   = useState(false);
  const [progress, setProgress]       = useState(0);
  const [frames, setFrames]           = useState<Frame[]>([]);
  const [analyzing, setAnalyzing]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [aiAnalysis, setAiAnalysis]   = useState<JsonObject | null>(null); // laudo estruturado da IA (alimenta as prescritoras)
  const [aiReportText, setAiReportText] = useState("");
  const [aiFrameFindings, setAiFrameFindings] = useState<AiFrameFinding[]>([]);
  const [autoProtocol, setAutoProtocol] = useState<AutoProtocol>("posture_ohs");
  const [previewFrame, setPreviewFrame] = useState<Frame | null>(null);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("line");
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationHistoryRef = useRef<string[]>([]);
  const annotationBaseRef = useRef<ImageData | null>(null);
  const annotationDrawingRef = useRef(false);
  const annotationStartRef = useRef<{ x: number; y: number } | null>(null);
  const initialVideoRequestRef = useRef(0);
  const activeProtocol = PROTOCOL_PRESETS[autoProtocol];
  // Entrega do laudo: popup "enviar para o aluno" após salvar a avaliação.
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverBlob, setDeliverBlob] = useState<Blob | null>(null);
  const [deliverName, setDeliverName] = useState("aluno");
  const [sendingPdf, setSendingPdf] = useState(false);
  const [sentPdf, setSentPdf] = useState(false);

  // ── Extrai frame do vídeo no tempo atual ────────────────────────────────
  function captureFrame(video: HTMLVideoElement): Promise<{ preview: string; blob: Blob; mostlyBlack: boolean }> {
    return new Promise((resolve) => {
      const maxW = 720;
      const vw = video.videoWidth || 720;
      const vh = video.videoHeight || 1280;
      const scale = Math.min(1, maxW / vw);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(vw * scale));
      canvas.height = Math.max(1, Math.round(vh * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const mostlyBlack = isMostlyBlack(ctx, canvas.width, canvas.height);
      const preview = canvas.toDataURL("image/jpeg", 0.5);
      canvas.toBlob((blob) => resolve({ preview, blob: blob!, mostlyBlack }), "image/jpeg", 0.85);
    });
  }

  async function waitForPaintedVideoFrame(video: HTMLVideoElement): Promise<void> {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = window.setTimeout(done, 250);
      const finish = () => { window.clearTimeout(timer); done(); };
      const requestFrame = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: VideoFrameRequestCallback) => number }).requestVideoFrameCallback;
      if (requestFrame) requestFrame.call(video, () => finish());
      else requestAnimationFrame(() => requestAnimationFrame(finish));
    });
  }

  async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      const onSeeked = () => { clearTimeout(timer); video.removeEventListener("seeked", onSeeked); resolve(); };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = t;
    });
    await waitForPaintedVideoFrame(video);
  }

  async function captureUsableFrame(video: HTMLVideoElement, t: number, duration: number) {
    const safeDuration = Math.max(0.1, duration - 0.35);
    const scanStep = Math.max(0.8, Math.min(2.4, duration * 0.015));
    let lastShot: { preview: string; blob: Blob; mostlyBlack: boolean; time: number } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const time = Math.min(safeDuration, Math.max(0.35, t + attempt * scanStep));
      await seekTo(video, time);
      const shot = await captureFrame(video);
      lastShot = { ...shot, time };
      if (!shot.mostlyBlack) return lastShot;
    }
    return lastShot!;
  }

  function renderAnnotationCanvas(frame: Frame) {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.naturalWidth);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      annotationHistoryRef.current = [canvas.toDataURL("image/jpeg", 0.92)];
    };
    img.src = frame.preview;
  }

  useEffect(() => {
    if (previewFrame) renderAnnotationCanvas(previewFrame);
  }, [previewFrame]);

  function canvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function pushAnnotationHistory() {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    annotationHistoryRef.current = [...annotationHistoryRef.current.slice(-12), canvas.toDataURL("image/jpeg", 0.92)];
  }

  function drawLine(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    ctx.save();
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = Math.max(3, Math.round(ctx.canvas.width * 0.006));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCircle(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    ctx.save();
    ctx.strokeStyle = "#EF4444";
    ctx.lineWidth = Math.max(3, Math.round(ctx.canvas.width * 0.006));
    ctx.beginPath();
    ctx.ellipse(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      Math.max(8, Math.abs(to.x - from.x) / 2),
      Math.max(8, Math.abs(to.y - from.y) / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  function applyGridAnnotation() {
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    pushAnnotationHistory();
    ctx.save();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
    ctx.lineWidth = Math.max(1, Math.round(canvas.width * 0.002));
    const thirdsX = [canvas.width / 3, (canvas.width * 2) / 3];
    const thirdsY = [canvas.height / 3, (canvas.height * 2) / 3];
    const mids = [canvas.width / 2, canvas.height / 2];
    for (const x of thirdsX) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (const y of thirdsY) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(245, 158, 11, 0.75)";
    ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.003));
    ctx.beginPath(); ctx.moveTo(mids[0], 0); ctx.lineTo(mids[0], canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, mids[1]); ctx.lineTo(canvas.width, mids[1]); ctx.stroke();
    ctx.restore();
  }

  function startAnnotation(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    pushAnnotationHistory();
    annotationDrawingRef.current = true;
    annotationStartRef.current = canvasPoint(event);
    annotationBaseRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function moveAnnotation(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!annotationDrawingRef.current || !annotationStartRef.current) return;
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !annotationBaseRef.current) return;
    ctx.putImageData(annotationBaseRef.current, 0, 0);
    const point = canvasPoint(event);
    if (annotationTool === "line") drawLine(ctx, annotationStartRef.current, point);
    else drawCircle(ctx, annotationStartRef.current, point);
  }

  function endAnnotation(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!annotationDrawingRef.current) return;
    moveAnnotation(event);
    annotationDrawingRef.current = false;
    annotationStartRef.current = null;
    annotationBaseRef.current = null;
  }

  function undoAnnotation() {
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const history = annotationHistoryRef.current;
    if (!canvas || !ctx || history.length <= 1) return;
    const previous = history[history.length - 2];
    annotationHistoryRef.current = history.slice(0, -1);
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = previous;
  }

  async function saveAnnotatedFrame() {
    const canvas = annotationCanvasRef.current;
    if (!canvas || !previewFrame) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return;
    const preview = canvas.toDataURL("image/jpeg", 0.88);
    setAiAnalysis(null);
    setAiReportText("");
    setAiFrameFindings([]);
    setFrames(prev => prev.map(fr => fr.id === previewFrame.id
      ? { ...fr, preview, blob, aiAnalyzed: false }
      : fr));
    setPreviewFrame(prev => prev ? { ...prev, preview, blob, aiAnalyzed: false } : prev);
    toast.success("Marcações salvas no frame.");
  }

  function isMostlyBlack(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const data = ctx.getImageData(0, 0, width, height).data;
    const step = Math.max(8, Math.floor(Math.sqrt((width * height) / 6000)));
    let luminanceSum = 0;
    let bright = 0;
    let count = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha < 10) continue;
        const lum = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
        luminanceSum += lum;
        if (lum > 24) bright++;
        count++;
      }
    }

    if (!count) return true;
    return luminanceSum / count < 12 && bright / count < 0.05;
  }

  async function extractAutoFrames(
    video: HTMLVideoElement,
    protocol: typeof activeProtocol,
    shouldContinue: () => boolean = () => true,
  ): Promise<boolean> {
    const dur = video.duration;
    if (!isFinite(dur) || dur <= 0) {
      setError("Não foi possível ler o vídeo. Tente outro formato (MP4).");
      setExtracting(false);
      return false;
    }

    setFrames([]);
    setAiAnalysis(null);
    setAiReportText("");
    setAiFrameFindings([]);
    setExtracting(true);
    setProgress(0);

    try {
      const list: Frame[] = [];
      for (let i = 0; i < protocol.vistas.length; i++) {
        if (!shouldContinue()) return false;
        const t = dur * protocol.fractions[i];
        const { preview, blob, time } = await captureUsableFrame(video, t, dur);
        if (!shouldContinue()) return false;
        list.push({
          id: crypto.randomUUID(), time, preview, blob,
          vista: protocol.vistas[i] || `Corte ${i + 1}`, findings: [], aiAnalyzed: false,
        });
        setFrames([...list]);
        setProgress(i + 1);
      }
      return true;
    } finally {
      if (shouldContinue()) setExtracting(false);
    }
  }

  async function reextractCurrentVideo() {
    const video = videoRef.current;
    if (!video || !video.src) return;
    setError("");
    await extractAutoFrames(video, activeProtocol);
  }

  async function handleProtocolChange(nextProtocol: AutoProtocol) {
    setAutoProtocol(nextProtocol);
    setError("");
    const video = videoRef.current;
    if (!videoLoaded || !video?.src) return;
    await extractAutoFrames(video, PROTOCOL_PRESETS[nextProtocol]);
  }

  function clampFrameTime(time: number, video: HTMLVideoElement) {
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) return Math.max(0, time);
    return Math.min(Math.max(0.2, time), Math.max(0.2, duration - 0.2));
  }

  async function jumpToFrame(time: number) {
    const video = videoRef.current;
    if (!video) return;
    setError("");
    await seekTo(video, clampFrameTime(time, video));
    video.pause();
    video.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function recaptureFrame(frameId: string, targetTime: number) {
    const video = videoRef.current;
    if (!video || !video.src) return;
    setError("");
    const time = clampFrameTime(targetTime, video);
    await seekTo(video, time);
    const shot = await captureFrame(video);
    const usableShot = shot.mostlyBlack
      ? await captureUsableFrame(video, time + 0.5, video.duration)
      : { ...shot, time };

    setAiAnalysis(null);
    setAiReportText("");
    setAiFrameFindings([]);
    setFrames(prev => prev.map(fr => fr.id === frameId
      ? { ...fr, time: usableShot.time, preview: usableShot.preview, blob: usableShot.blob, aiAnalyzed: false }
      : fr));
    setPreviewFrame(prev => prev?.id === frameId
      ? { ...prev, time: usableShot.time, preview: usableShot.preview, blob: usableShot.blob, aiAnalyzed: false }
      : prev);
  }

  async function recaptureFrameFromCurrentVideo(frameId: string) {
    const video = videoRef.current;
    if (!video) return;
    await recaptureFrame(frameId, video.currentTime);
  }

  // ── Carrega vídeo e extrai 8 cortes ──────────────────────────────────────
  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError("");

    const video = videoRef.current!;
    const url = URL.createObjectURL(file);
    video.src = url;

    await new Promise<void>((resolve) => {
      const onLoad = () => { video.removeEventListener("loadedmetadata", onLoad); resolve(); };
      video.addEventListener("loadedmetadata", onLoad);
    });
    setVideoLoaded(true);

    await extractAutoFrames(video, activeProtocol);
  }

  async function loadInitialWhatsAppVideo(requestVersion = ++initialVideoRequestRef.current) {
    if (!initialWhatsAppVideo) return;
    const isCurrentRequest = () => initialVideoRequestRef.current === requestVersion;
    const video = videoRef.current;
    if (!video) return;
    setInitialVideoLoading(true);
    setInitialVideoError("");
    setError("");
    try {
      const blob = await resolveWhatsAppAssessmentVideoBlob({
        handoff: initialWhatsAppVideo,
        companyId,
        studentId,
      });
      if (!isCurrentRequest()) return;
      const url = URL.createObjectURL(blob);
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("O vídeo demorou demais para abrir."));
        }, 15_000);
        const onLoad = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error("Falha ao abrir o vídeo recuperado.")); };
        const cleanup = () => {
          window.clearTimeout(timeout);
          video.removeEventListener("loadedmetadata", onLoad);
          video.removeEventListener("error", onErr);
        };
        video.addEventListener("loadedmetadata", onLoad);
        video.addEventListener("error", onErr);
      });
      if (!isCurrentRequest()) return;
      setVideoLoaded(true);
      const extracted = await extractAutoFrames(video, activeProtocol, isCurrentRequest);
      if (!isCurrentRequest()) return;
      if (!extracted) throw new Error("O vídeo abriu, mas os cortes não puderam ser extraídos.");
      onInitialVideoConsumed?.();
    } catch (loadError: unknown) {
      if (isCurrentRequest()) setInitialVideoError(errorMessage(loadError));
    } finally {
      if (isCurrentRequest()) setInitialVideoLoading(false);
    }
  }

  // Tenta automaticamente uma vez por mensagem; falhas mantêm o handoff para retry manual.
  const initialVideoAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialWhatsAppVideo || !studentId || !companyId) return;
    const key = `${initialWhatsAppVideo.chatId}:${initialWhatsAppVideo.messageId}:${studentId}:${companyId}`;
    if (initialVideoAttemptRef.current === key) return;
    initialVideoAttemptRef.current = key;
    const requestVersion = ++initialVideoRequestRef.current;
    void loadInitialWhatsAppVideo(requestVersion);
    return () => {
      if (initialVideoRequestRef.current === requestVersion) initialVideoRequestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWhatsAppVideo, studentId, companyId]);

  // ── Captura frame manual (treinador pausa onde quiser) ───────────────────
  async function captureManual() {
    const video = videoRef.current;
    if (!video) return;
    await waitForPaintedVideoFrame(video);
    const { preview, blob } = await captureFrame(video);
    setAiAnalysis(null);
    setAiReportText("");
    setAiFrameFindings([]);
    setFrames(prev => [...prev, {
      id: crypto.randomUUID(), time: video.currentTime, preview, blob,
      vista: "Extra", findings: [], aiAnalyzed: false,
    }]);
  }

  // ── Análise IA de todos os frames ────────────────────────────────────────
  async function analyzeAI(): Promise<AiFunctionalAssessmentResponse | null> {
    if (frames.length === 0) return null;
    setAnalyzing(true); setError("");
    try {
      // Converte frames para base64
      const images = await Promise.all(frames.map(async (fr) => {
        const b64 = await blobToBase64(fr.blob);
        return {
          vista: fr.vista,
          data: b64,
          frameId: fr.id,
          findings: fr.findings.filter((finding) => finding.descricao.trim()).map(toSerializableFinding),
        };
      }));

      const { data, error: e } = await supabase.functions.invoke<AiFunctionalAssessmentResponse>("ai-functional-assessment", {
        body: {
          student_id: studentId,
          student_name: assessmentContext?.studentName,
          company_id: companyId,
          frames: images,
          assessment_source: "video_full_assessment",
          protocol_hint: activeProtocol.hint,
          expected_movements: activeProtocol.vistas,
          frame_findings: frames.map((frame) => ({
            frameId: frame.id,
            vista: frame.vista,
            findings: frame.findings.filter((finding) => finding.descricao.trim()).map(toSerializableFinding),
          })),
          ...assessmentContext,
        },
      });
      const response = data ?? {};
      if (e || response.error) throw new Error(e?.message || response.error);

      // Guarda o laudo estruturado (disfunções, músculos, restrições) p/ alimentar as IAs prescritoras
      setAiAnalysis(response.assessment_json || null);
      setAiReportText(response.report_text || "");
      setAiFrameFindings(response.frame_findings || []);

      // A IA retorna findings por frame. Mapeia de volta.
      const byFrame: Record<string, AiFindingInput[]> = {};
      (response.frame_findings || []).forEach((ff) => {
        if (ff.frameId) byFrame[ff.frameId] = ff.findings || [];
      });

      setFrames(prev => prev.map(fr => ({
        ...fr,
        findings: byFrame[fr.id]?.map(normalizeAIFinding) || fr.findings,
        aiAnalyzed: true,
      })));
      return response;
    } catch (e: unknown) {
      setError(errorMessage(e));
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Edição manual dos achados ────────────────────────────────────────────
  function invalidateStructuredAnalysis() {
    setAiAnalysis(null);
    setAiReportText("");
    setAiFrameFindings([]);
  }
  function updateFrame(id: string, changes: Partial<Frame>) {
    invalidateStructuredAnalysis();
    setFrames(prev => prev.map(fr => fr.id === id ? { ...fr, ...changes } : fr));
  }
  function swapFrameCaptureWithNext(id: string) {
    invalidateStructuredAnalysis();
    setFrames(prev => {
      const idx = prev.findIndex(fr => fr.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = prev[idx + 1];
      const current = prev[idx];
      const swapped = [...prev];
      swapped[idx] = {
        ...current,
        time: next.time,
        preview: next.preview,
        blob: next.blob,
        aiAnalyzed: false,
      };
      swapped[idx + 1] = {
        ...next,
        time: current.time,
        preview: current.preview,
        blob: current.blob,
        aiAnalyzed: false,
      };
      return swapped;
    });
    setPreviewFrame(prev => prev?.id === id ? null : prev);
  }
  function addFinding(id: string) {
    invalidateStructuredAnalysis();
    setFrames(prev => prev.map(fr => fr.id === id
      ? { ...fr, findings: [...fr.findings, { gravidade: "Moderada", descricao: "" }] }
      : fr));
  }
  function updateFinding(frameId: string, idx: number, key: keyof Finding, val: string) {
    invalidateStructuredAnalysis();
    setFrames(prev => prev.map(fr => {
      if (fr.id !== frameId) return fr;
      const findings = [...fr.findings];
      findings[idx] = { ...findings[idx], [key]: val };
      return { ...fr, findings };
    }));
  }
  function removeFinding(frameId: string, idx: number) {
    invalidateStructuredAnalysis();
    setFrames(prev => prev.map(fr => fr.id === frameId
      ? { ...fr, findings: fr.findings.filter((_, i) => i !== idx) }
      : fr));
  }
  function removeFrame(id: string) {
    invalidateStructuredAnalysis();
    setFrames(prev => prev.filter(fr => fr.id !== id));
  }

  // ── Salvar avaliação (upload frames + grava no banco) ────────────────────
  async function save() {
    setSaving(true); setError("");
    try {
      let resolvedAnalysis = aiAnalysis;
      let resolvedReportText = aiReportText;
      let resolvedFrameFindings = aiFrameFindings;
      let framesToSave = frames;

      // The structured deterministic report is mandatory for every saved assessment.
      // The explicit Analyze button remains useful for review, but Save can no longer
      // persist a legacy frame-only assessment by accident.
      if (!resolvedAnalysis) {
        const analyzed = await analyzeAI();
        if (!analyzed?.assessment_json) {
          throw new Error("Não foi possível estruturar a avaliação. Revise os cortes e tente novamente.");
        }
        resolvedAnalysis = analyzed.assessment_json;
        resolvedReportText = analyzed.report_text || "";
        resolvedFrameFindings = analyzed.frame_findings || [];
        const findingsByFrame = new Map((resolvedFrameFindings || []).map((item) => [item.frameId, item.findings || []]));
        framesToSave = frames.map((frame) => ({
          ...frame,
          findings: (findingsByFrame.get(frame.id) || frame.findings).map(normalizeAIFinding),
          aiAnalyzed: true,
        }));
      }

      // 1. Cria a avaliação — junta o laudo estruturado da IA + os achados editados pelo treinador
      const assessmentJson = {
        ...(resolvedAnalysis || {}),
        vistas: framesToSave.map(fr => ({
          vista: fr.vista, time: fr.time,
          compensacoes: fr.findings.filter(x => x.descricao.trim()).map(toSerializableFinding),
        })),
        protocol_hint: activeProtocol.hint,
        expected_movements: [...activeProtocol.vistas],
        total_compensacoes: framesToSave.reduce((s, fr) => s + fr.findings.filter(x => x.descricao.trim()).length, 0),
      } as unknown as JsonObject;
      const fallbackReport = typeof resolvedAnalysis?.relatorio_para_aluno === "string" ? resolvedAnalysis.relatorio_para_aluno : "";
      const { data: assessment, error: e1 } = await videoDb
        .from("functional_assessments")
        .insert({
          student_id: studentId, company_id: companyId,
          queixa_principal: assessmentContext?.queixa_principal || null,
          historico_lesoes: assessmentContext?.historico_lesoes || null,
          modalidade: assessmentContext?.modalidade || null,
          nivel: assessmentContext?.nivel || null,
          report_text: resolvedReportText || fallbackReport,
          assessment_json: assessmentJson,
          status: "completed",
          source: "video",
        }).select("id").single();
      if (e1) throw e1;
      if (!assessment) throw new Error("A avaliação foi salva sem retornar ID.");

      // 2. Upload dos frames para storage + grava assessment_frames
      for (let i = 0; i < framesToSave.length; i++) {
        const fr = framesToSave[i];
        const path = `${companyId}/${assessment.id}/frame_${i}.jpg`;
        const { error: uploadError } = await videoDb.storage.from("assessment-frames").upload(path, fr.blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { error: frameError } = await videoDb.from("assessment_frames").insert({
          assessment_id: assessment.id, company_id: companyId,
          frame_index: i, vista: fr.vista, image_url: path,
          ai_findings: fr.aiAnalyzed ? fr.findings.map(toSerializableFinding) : null,
          trainer_findings: fr.findings.map(toSerializableFinding),
          edited: !fr.aiAnalyzed || true,
        });
        if (frameError) throw frameError;
      }
      onComplete?.(assessment.id, {
        id: assessment.id,
        report_text: resolvedReportText || fallbackReport,
        assessment_json: assessmentJson,
        frame_findings: resolvedFrameFindings,
      });

      // 3. Gera o PDF entregável do laudo → salva na PASTA do aluno + abre o popup de envio.
      try {
        const { data: st } = await supabase.from("students").select("full_name").eq("id", studentId).maybeSingle();
        const name = (st as { full_name?: string } | null)?.full_name || "Aluno";
        const imgs: string[] = [];
        for (const fr of framesToSave) {
          try { imgs.push(await new Promise<string>((res) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(fr.blob); })); } catch { imgs.push(""); }
        }
        const pdf = generateAssessmentPDF(
          { report_text: resolvedReportText || fallbackReport, assessment_json: assessmentJson },
          { studentName: name, date: new Date().toLocaleDateString("pt-BR") },
          imgs,
        );
        const blob = pdf.output("blob") as Blob;
        const safe = name.replace(/[^\w.-]+/g, "_");
        await saveStudentFile({
          studentId, companyId, data: blob,
          fileName: `laudo-avaliacao-${safe}.pdf`, kind: "assessment_report",
          contentType: "application/pdf", stampMs: Date.now(), stableName: true,
          source: "VideoAssessment", metadata: { assessment_id: assessment.id },
        });
        setDeliverBlob(blob);
        setDeliverName(name);
        setSentPdf(false);
        setDeliverOpen(true);
      } catch { /* não bloqueia o save se o PDF/pasta falhar */ }
    } catch (e: unknown) { setError(errorMessage(e)); }
    setSaving(false);
  }

  // Envia o PDF do laudo direto pro WhatsApp do aluno.
  async function sendLaudoWhatsApp() {
    if (!deliverBlob) return;
    setSendingPdf(true);
    const safe = deliverName.replace(/[^\w.-]+/g, "_");
    const res = await sendPdfToStudentWhatsApp({
      companyId, studentId, blob: deliverBlob,
      fileName: `laudo-avaliacao-${safe}.pdf`,
      caption: `Olá, ${deliverName.split(" ")[0]}! Segue o laudo da sua avaliação funcional. Qualquer dúvida, é só chamar. 💪`,
    });
    setSendingPdf(false);
    if (res.ok) { setSentPdf(true); toast.success("Laudo enviado no WhatsApp do aluno."); }
    else toast.error(res.error || "Não consegui enviar pelo WhatsApp.");
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            Avaliação por vídeo
            <BnitoContextButton
              label="avaliacao por video"
              context="Analise tecnica por video/frames no Studio: postura, overhead squat, compensacoes e cues para prescricao."
              question="O que devo observar nos frames antes de transformar essa avaliacao em treino?"
              className="ml-auto"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
            <Select value={autoProtocol} onValueChange={v => void handleProtocolChange(v as AutoProtocol)} disabled={extracting}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PROTOCOL_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{activeProtocol.description}</p>
          </div>

          <video ref={videoRef} muted playsInline controls
            style={{ display: videoLoaded ? "block" : "none", width: "100%", maxHeight: 280, borderRadius: 8, background: "#000" }} />

          {initialWhatsAppVideo && initialVideoLoading && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando o vídeo da conversa com acesso autenticado…
            </div>
          )}

          {initialWhatsAppVideo && initialVideoError && !initialVideoLoading && (
            <div className="mb-3 space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-700">{initialVideoError}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadInitialWhatsAppVideo()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tentar carregar novamente
              </Button>
            </div>
          )}

          {!videoLoaded && (
            <div style={{ position: "relative" }}
              className="border-2 border-dashed border-slate-300 hover:border-[#8B7355] rounded-xl bg-slate-50 transition cursor-pointer">
              <div className="flex flex-col items-center gap-2 py-12 pointer-events-none">
                <Video className="h-10 w-10 text-slate-400" />
                <span className="font-semibold text-slate-600">Clique ou arraste o vídeo da avaliação</span>
                <span className="text-xs text-slate-400">MP4 · {activeProtocol.label.toLowerCase()} vira cortes automáticos para a IA</span>
              </div>
              <input type="file" accept="video/*" onChange={handleVideo}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </div>
          )}

          {videoLoaded && (
            <div className="flex items-center justify-between mt-3">
              <div style={{ position: "relative" }}>
                <span className="text-xs text-slate-500 hover:text-[#8B7355] cursor-pointer">↩ Trocar vídeo</span>
                <input type="file" accept="video/*" onChange={handleVideo}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={reextractCurrentVideo} disabled={extracting}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refazer cortes
                </Button>
                <Button size="sm" variant="outline" onClick={captureManual}>
                  <Camera className="h-3.5 w-3.5 mr-1" /> Capturar frame atual
                </Button>
              </div>
            </div>
          )}

          {extracting && (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                <Loader2 className="h-4 w-4 animate-spin" /> Extraindo cortes… {progress}/{activeProtocol.vistas.length}
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-[#8B7355] h-1.5 rounded-full transition-all" style={{ width: `${progress/activeProtocol.vistas.length*100}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && frames.length === 0 && <p className="text-sm text-red-500">{error}</p>}

      {/* Botão analisar */}
      {frames.length > 0 && !extracting && (
        <div className="flex gap-2">
          <Button onClick={analyzeAI} disabled={analyzing} className="flex-1 bg-[#1B2B4A] hover:bg-[#1B2B4A]/90">
            {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando cortes…</>
              : <><Sparkles className="mr-2 h-4 w-4" /> Analisar {frames.length} cortes</>}
          </Button>
        </div>
      )}

      {/* Grid de frames editáveis */}
      {frames.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Revise os cortes antes da IA. Use Ver, 1s, Usar vídeo ou Trocar ↓ quando dois cortes vizinhos vierem invertidos.
          </p>
          {frames.map((fr, index) => (
            <Card key={fr.id}>
              <CardContent className="pt-4">
                <div className="flex gap-4">
                  {/* Foto */}
                  <div className="relative flex-shrink-0" style={{ width: 132 }}>
                    <button
                      type="button"
                      onClick={() => setPreviewFrame(fr)}
                      className="group relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                      style={{ aspectRatio: "9/16" }}
                      aria-label={`Ampliar ${fr.vista}`}
                    >
                      <img src={fr.preview} alt={fr.vista} className="h-full w-full object-contain" />
                      <span className="absolute top-1 left-1 hidden items-center gap-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white group-hover:flex">
                        <Maximize2 className="h-3 w-3" /> ampliar
                      </span>
                    </button>
                    <button type="button" onClick={() => removeFrame(fr.id)}
                      className="absolute top-1 right-1 bg-slate-900/70 rounded-full h-5 w-5 text-white text-xs flex items-center justify-center">
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-slate-900/70 text-white text-xs px-1.5 rounded">{Math.round(fr.time)}s</span>
                  </div>

                  {/* Edição */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select value={fr.vista} onValueChange={v => updateFrame(fr.id, { vista: v })}>
                        <SelectTrigger className="h-8 text-sm w-auto"><SelectValue /></SelectTrigger>
                        <SelectContent>{VISTAS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                      {fr.aiAnalyzed && <Badge variant="outline" className="text-xs"><Sparkles className="h-2.5 w-2.5 mr-1" />IA</Badge>}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPreviewFrame(fr)}>
                        <Eye className="mr-1 h-3 w-3" /> Ver
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => recaptureFrame(fr.id, fr.time - FRAME_NUDGE_SECONDS)}>
                        <SkipBack className="mr-1 h-3 w-3" /> 1s
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => recaptureFrameFromCurrentVideo(fr.id)}>
                        <Camera className="mr-1 h-3 w-3" /> Usar vídeo
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => recaptureFrame(fr.id, fr.time + FRAME_NUDGE_SECONDS)}>
                        1s <SkipForward className="ml-1 h-3 w-3" />
                      </Button>
                      {index < frames.length - 1 && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => swapFrameCaptureWithNext(fr.id)}>
                          <RefreshCw className="mr-1 h-3 w-3" /> Trocar ↓
                        </Button>
                      )}
                      <span className="text-xs text-slate-400">{fr.time.toFixed(1)}s</span>
                    </div>

                    {fr.findings.length === 0 && (
                      <p className="text-xs text-slate-400 italic">Nenhuma compensação. Clique abaixo para adicionar.</p>
                    )}

                    {fr.findings.map((finding, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Select value={finding.gravidade} onValueChange={v => updateFinding(fr.id, idx, "gravidade", v)}>
                          <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{GRAVIDADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input value={finding.descricao} onChange={e => updateFinding(fr.id, idx, "descricao", e.target.value)}
                          className="h-8 text-sm flex-1" placeholder="Descrição da compensação" />
                        <button onClick={() => removeFinding(fr.id, idx)} className="text-slate-400 hover:text-red-500">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <Button size="sm" variant="ghost" className="h-7 text-xs text-[#8B7355]" onClick={() => addFinding(fr.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar compensação
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={save} disabled={saving || analyzing} className="w-full bg-[#8B7355] hover:bg-[#8B7355]/90">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando avaliação…</>
              : <><Save className="mr-2 h-4 w-4" /> Salvar avaliação funcional</>}
          </Button>
        </div>
      )}

      {previewFrame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setPreviewFrame(null)}
        >
          <div className="relative flex max-h-[94vh] w-full max-w-5xl flex-col gap-3" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewFrame(null)}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white"
              aria-label="Fechar preview"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="rounded-2xl bg-white p-3 shadow-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2 pr-10">
                <Button size="sm" variant="outline" onClick={applyGridAnnotation}>
                  Grade
                </Button>
                <Button
                  size="sm"
                  variant={annotationTool === "line" ? "default" : "outline"}
                  onClick={() => setAnnotationTool("line")}
                  className={annotationTool === "line" ? "bg-[#1B2B4A] text-white hover:bg-[#1B2B4A]/90" : ""}
                >
                  Linha reta
                </Button>
                <Button
                  size="sm"
                  variant={annotationTool === "circle" ? "default" : "outline"}
                  onClick={() => setAnnotationTool("circle")}
                  className={annotationTool === "circle" ? "bg-[#1B2B4A] text-white hover:bg-[#1B2B4A]/90" : ""}
                >
                  Círculo
                </Button>
                <Button size="sm" variant="outline" onClick={undoAnnotation}>
                  Desfazer
                </Button>
                <Button size="sm" onClick={saveAnnotatedFrame} className="bg-[#8B7355] hover:bg-[#8B7355]/90">
                  Salvar marcações
                </Button>
                <span className="text-xs text-slate-500">
                  Arraste sobre a imagem para desenhar. A imagem salva entra no laudo.
                </span>
              </div>
              <div className="flex max-h-[76vh] justify-center overflow-auto rounded-xl bg-black p-2">
                <canvas
                  ref={annotationCanvasRef}
                  className="max-h-[74vh] max-w-full cursor-crosshair object-contain"
                  onMouseDown={startAnnotation}
                  onMouseMove={moveAnnotation}
                  onMouseUp={endAnnotation}
                  onMouseLeave={endAnnotation}
                  aria-label={`Editor de marcações para ${previewFrame.vista}`}
                />
              </div>
            </div>
            <div className="self-center rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow">
              {previewFrame.vista} · {previewFrame.time.toFixed(1)}s
            </div>
          </div>
        </div>
      )}

      {/* Popup pós-avaliação: laudo salvo na pasta + enviar para o aluno no WhatsApp */}
      {deliverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setDeliverOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="pr-4">
                <h3 className="text-lg font-bold text-slate-800">Avaliação concluída</h3>
                <p className="mt-1 text-sm text-slate-500">
                  O laudo (PDF) já foi salvo na pasta do aluno. Gostaria de enviar para {deliverName.split(" ")[0]} no WhatsApp?
                </p>
              </div>
              <button onClick={() => setDeliverOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button onClick={sendLaudoWhatsApp} disabled={sendingPdf || sentPdf} className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white">
                {sendingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {sentPdf ? "Enviado ✓" : "Enviar para o aluno no WhatsApp"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { if (deliverBlob) window.open(URL.createObjectURL(deliverBlob), "_blank"); }}>
                  Ver PDF
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setDeliverOpen(false)}>
                  {sentPdf ? "Fechar" : "Agora não"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

function normalizeAIFinding(finding: AiFindingInput): Finding {
  if (typeof finding === "string") {
    return { gravidade: "Moderada", descricao: finding };
  }
  return {
    gravidade: finding.gravidade || "Moderada",
    descricao: finding.descricao || "",
  };
}

function toSerializableFinding(finding: Finding): Finding {
  return {
    gravidade: finding.gravidade,
    descricao: finding.descricao,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
