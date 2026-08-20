import { createContext, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { HelpCircle, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useCompanyAiConfig } from "@/lib/companyAiConfig";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { readEdgeError } from "@/lib/edgeError";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BenitoSprite, type BenitoState } from "@/components/BenitoSprite";

type BnitoMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type BnitoResult = {
  summary?: string;
  answer?: string;
  suggestions?: Array<{
    title?: string;
    rationale?: string;
    action?: string;
  }>;
  questions_to_professor?: string[];
};

type BnitoResponse = {
  result?: BnitoResult | string;
  raw?: string;
  error?: string;
  details?: string;
};

type BnitoOpenOptions = {
  label?: string;
  context?: string;
  question?: string;
  source?: string;
  studentId?: string;
};

type BnitoAssistantContextValue = {
  isAvailable: boolean;
  openBnito: (options?: BnitoOpenOptions) => void;
  assistantName: string;
};

type BnitoContextButtonProps = {
  label: string;
  context?: string;
  question?: string;
  className?: string;
  text?: string;
  studentId?: string;
};

const BnitoAssistantContext = createContext<BnitoAssistantContextValue | null>(null);

const quickPrompts = [
  {
    label: "Dor no joelho",
    prompt: "Aluno relatou dor no joelho na anamnese. Como ajusto o treino de pernas?",
  },
  {
    label: "Auditar volume",
    prompt: "Audite um volume semanal alto para hipertrofia e me diga riscos.",
  },
  {
    label: "Forca + corrida",
    prompt: "Como organizar forca e corrida sem atrapalhar os treinos de tiro?",
  },
  {
    label: "Avaliacao funcional",
    prompt: "Quais sinais na avaliacao funcional pedem regressao tecnica?",
  },
];

const WELCOME_ID = "bnito-welcome";
const POSITION_KEY = "bnito-professor-position-v1";
// Nome do assistente vem da empresa (Central de IA). Padrão do app = "Setty".
function makeWelcome(name: string): BnitoMessage {
  return {
    id: WELCOME_ID,
    role: "assistant",
    content: `Oi, professor. Eu sou o ${name}. Posso revisar volume, coerencia com objetivo, dor/restricao, avaliacao funcional e te devolver sugestoes tecnicas para voce aprovar.`,
  };
}

function createMessage(role: BnitoMessage["role"], content: string): BnitoMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function getCycleId(pathname: string) {
  const match = pathname.match(/\/workout\/([^/]+)/);
  return match?.[1] || null;
}

function getStudentId(pathname: string) {
  const match = pathname.match(/\/students\/([0-9a-f-]{36})(?:\/|$)/i);
  return match?.[1] || null;
}

function getPageLabel(pathname: string) {
  if (pathname.includes("/workout/")) return "builder manual de treino";
  if (pathname.includes("/ia")) return "central IA";
  if (pathname.includes("/exercises")) return "biblioteca de exercicios";
  if (pathname.includes("/prescriptions")) return "prescricoes";
  if (pathname.includes("/prescricao")) return "prescricao integrada";
  if (pathname.includes("/studio")) return "studio de prescricao";
  if (pathname.includes("/students")) return "alunos";
  if (pathname.includes("/anamnesis")) return "anamnese";
  if (pathname.includes("/avaliacao")) return "avaliacao funcional";
  if (pathname.includes("/financial")) return "financeiro";
  if (pathname.includes("/agenda")) return "agenda";
  return "painel";
}

function formatBnitoResponse(data: BnitoResponse, name: string) {
  if (typeof data.result === "string") return data.result;
  const result = data.result;
  if (!result) return data.raw || `${name} respondeu, mas sem texto estruturado.`;

  const base = result.answer || result.summary || "Analise tecnica gerada.";
  const suggestions = Array.isArray(result.suggestions)
    ? result.suggestions
        .slice(0, 3)
        .map((item, index) => {
          const title = item.title || `Sugestao ${index + 1}`;
          const detail = item.action || item.rationale || "";
          return detail ? `${index + 1}. ${title}: ${detail}` : `${index + 1}. ${title}`;
        })
    : [];
  const questions = Array.isArray(result.questions_to_professor)
    ? result.questions_to_professor.slice(0, 2).map((question) => `Pergunta: ${question}`)
    : [];

  return [base, ...suggestions, ...questions].filter(Boolean).join("\n\n");
}

function getUnavailableMessage(message: string, name: string) {
  if (/function|edge|404|403|fetch|non-2xx/i.test(message)) {
    return `Nao consegui conectar com o ${name} agora. A interface ja esta instalada, mas a funcao ai-bnito-coach precisa estar publicada na Supabase para eu responder com IA.`;
  }
  return `Nao consegui responder agora: ${message}`;
}

export function useBnitoAssistant() {
  const context = useContext(BnitoAssistantContext);
  return context || { isAvailable: false, openBnito: () => {}, assistantName: "Setty" };
}

export function BnitoContextButton({ label, context, question, className, text, studentId }: BnitoContextButtonProps) {
  const assistant = useBnitoAssistant();
  if (!assistant.isAvailable) return null;
  const name = assistant.assistantName || "Setty";
  // White-label: troca "BNITO" literal (rótulo legado) pelo nome da empresa nos textos visíveis.
  const displayText = text ? text.replace(/BNITO/gi, name) : text;
  const displayLabel = label.replace(/BNITO/gi, name);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={text ? "sm" : "icon"}
          className={`rounded-full border border-navy/15 bg-background/80 text-navy shadow-sm hover:bg-navy hover:text-primary-foreground ${text ? "h-8 px-3 text-xs" : "h-8 w-8"} ${className || ""}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            assistant.openBnito({ label, context, question, studentId });
          }}
          aria-label={`Perguntar ao ${name} sobre ${displayLabel}`}
        >
          <BenitoSprite state="idle" size={16} alt="" />
          {displayText && <span>{displayText}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{`Perguntar ao ${name} sobre ${displayLabel}`}</TooltipContent>
    </Tooltip>
  );
}

export function BnitoAssistantProvider({ children }: { children: ReactNode }) {
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId =
    role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : companyId;
  const { config } = useCompanyAiConfig(effectiveCompanyId);
  const name = config.assistant_name || "Setty";
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [petReaction, setPetReaction] = useState<BenitoState | null>(null);
  const [messages, setMessages] = useState<BnitoMessage[]>(() => [makeWelcome("Setty")]);
  const [sessionContext, setSessionContext] = useState<BnitoOpenOptions | null>(null);
  const dragStateRef = useRef<{ dx: number; dy: number; moved: boolean; lastClientX: number; startClientX: number; startClientY: number } | null>(null);
  const dragAbortRef = useRef<AbortController | null>(null);
  const [dragDirection, setDragDirection] = useState<"running-left" | "running-right" | null>(null);
  const petReactionTimerRef = useRef<number | null>(null);
  const [buttonPosition, setButtonPosition] = useState(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    const stored = window.localStorage.getItem(POSITION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { x?: number; y?: number };
        if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
      } catch {
        // Ignore stale localStorage.
      }
    }
    return {
      x: Math.max(16, window.innerWidth - 92),
      y: Math.max(16, window.innerHeight - 92),
    };
  });

  // Atualiza a saudação quando o nome da empresa carrega (se a conversa ainda não começou).
  useEffect(() => {
    setMessages((cur) => (cur.length === 1 && cur[0].id === WELCOME_ID ? [makeWelcome(name)] : cur));
  }, [name]);

  const showPetReaction = useCallback((state: BenitoState, duration = 1400) => {
    if (petReactionTimerRef.current !== null) window.clearTimeout(petReactionTimerRef.current);
    setPetReaction(state);
    petReactionTimerRef.current = window.setTimeout(() => {
      setPetReaction(null);
      petReactionTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => () => {
    if (petReactionTimerRef.current !== null) window.clearTimeout(petReactionTimerRef.current);
  }, []);

  const shouldShow = role === "admin" || role === "coordinator" || role === "trainer" || role === "master";
  const cycleId = useMemo(() => getCycleId(location.pathname), [location.pathname]);
  const routeStudentId = useMemo(() => getStudentId(location.pathname), [location.pathname]);
  const pageLabel = useMemo(() => getPageLabel(location.pathname), [location.pathname]);
  const activeLabel = sessionContext?.label || pageLabel;
  const activeStudentId = sessionContext?.studentId || routeStudentId;

  const clampButtonPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const margin = 12;
    const size = 72;
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - size - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - size - margin)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setButtonPosition((current) => clampButtonPosition(current.x, current.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampButtonPosition]);

  useEffect(() => {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(buttonPosition));
  }, [buttonPosition]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    const totalDx = event.clientX - state.startClientX;
    const totalDy = event.clientY - state.startClientY;
    if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) state.moved = true;
    const horizontalDelta = event.clientX - state.lastClientX;
    if (state.moved && Math.abs(horizontalDelta) >= 3) {
      setDragDirection(horizontalDelta < 0 ? "running-left" : "running-right");
      state.lastClientX = event.clientX;
    }
    setButtonPosition(clampButtonPosition(event.clientX - state.dx, event.clientY - state.dy));
  }, [clampButtonPosition]);

  useEffect(() => () => {
    dragAbortRef.current?.abort();
    dragAbortRef.current = null;
  }, []);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragAbortRef.current?.abort();
    const rect = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: false,
      lastClientX: event.clientX,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    const controller = new AbortController();
    dragAbortRef.current = controller;
    const finishDrag = () => {
      controller.abort();
      if (dragAbortRef.current === controller) dragAbortRef.current = null;
      setDragDirection(null);
    };
    const cancelDrag = () => {
      dragStateRef.current = null;
      finishDrag();
    };
    window.addEventListener("pointermove", handlePointerMove, { signal: controller.signal });
    window.addEventListener("pointerup", finishDrag, { once: true, signal: controller.signal });
    window.addEventListener("pointercancel", cancelDrag, { once: true, signal: controller.signal });
    window.addEventListener("blur", cancelDrag, { once: true, signal: controller.signal });
  };

  const openBnito = useCallback((options?: BnitoOpenOptions) => {
    setSessionContext(options || null);
    setInput(options?.question || "");
    setOpen(true);
    showPetReaction("greeting");
  }, [showPetReaction]);

  const askBnito = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, createMessage("user", trimmed)]);

    try {
      // Nunca deixa a UI "travar" no spinner: corta em 60s se a edge não responder.
      const invokePromise = supabase.functions.invoke<BnitoResponse>("ai-bnito-coach", {
        body: {
          action: "ask",
          cycle_id: cycleId,
          student_id: activeStudentId,
          company_id: effectiveCompanyId,
          question: trimmed,
          profile: {
            role,
            source: sessionContext?.source || "bnito_contextual_assistant",
            current_page: pageLabel,
            context_label: sessionContext?.label || null,
          },
          context: [
            `Origem: ${pageLabel}.`,
            sessionContext?.label ? `Secao acionada: ${sessionContext.label}.` : "",
            sessionContext?.context ? `Contexto da secao: ${sessionContext.context}.` : "",
            `Rota atual: ${location.pathname}.`,
            cycleId ? `Ciclo aberto: ${cycleId}.` : "",
            activeStudentId ? `Aluno em contexto: ${activeStudentId}.` : "",
          ].filter(Boolean).join(" "),
          page_context: {
            pathname: location.pathname,
            page_label: pageLabel,
            context_label: sessionContext?.label || null,
            context: sessionContext?.context || null,
            cycle_id: cycleId,
            student_id: activeStudentId,
            company_id: effectiveCompanyId,
          },
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__timeout__")), 60000),
      );
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      // Mostra a CAUSA REAL (a edge repassa o erro da Anthropic em error.context), não só "non-2xx".
      if (error) throw new Error((await readEdgeError(error, data)) || error.message);
      if (!data) throw new Error("resposta vazia");
      if (data.error) throw new Error(data.details || data.error);

      setMessages((current) => [...current, createMessage("assistant", formatBnitoResponse(data, name))]);
      showPetReaction("success");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "erro inesperado";
      const message = raw === "__timeout__"
        ? `O ${name} demorou demais para responder e a requisicao foi cancelada. Tente de novo em instantes.`
        : getUnavailableMessage(raw, name);
      setMessages((current) => [...current, createMessage("assistant", message)]);
      showPetReaction("error", 1800);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void askBnito(input);
  };

  const contextValue = useMemo(
    () => ({ isAvailable: shouldShow, openBnito, assistantName: name }),
    [openBnito, shouldShow, name],
  );
  const petState: BenitoState = loading
    ? "processing"
    : dragDirection ?? petReaction ?? (open ? "waiting" : "idle");

  return (
    <BnitoAssistantContext.Provider value={contextValue}>
      {children}
      {shouldShow && (
        <Dialog open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Abrir ${name}`}
                onPointerDown={startDrag}
                onClick={() => {
                  if (dragStateRef.current?.moved) {
                    dragStateRef.current = null;
                    return;
                  }
                  dragStateRef.current = null;
                  openBnito();
                }}
                style={{ left: buttonPosition.x, top: buttonPosition.y, touchAction: "none" }}
                className="fixed z-40 flex h-16 w-16 cursor-grab items-center justify-center rounded-full border border-white/60 bg-navy text-primary-foreground shadow-[0_18px_45px_rgba(29,45,92,0.32)] ring-8 ring-navy/10 transition duration-200 active:cursor-grabbing hover:bg-navy/95 focus:outline-none focus:ring-4 focus:ring-ring focus:ring-offset-2"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/45 bg-white/10">
                  <BenitoSprite state={petState} size={42} alt="" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{`Abrir ${name}`}</TooltipContent>
          </Tooltip>

          <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-[24px] border-line bg-paper p-0 shadow-2xl [&>button]:rounded-full">
            <DialogHeader className="shrink-0 border-b border-line bg-background px-5 py-4 text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-primary-foreground shadow-md">
              <BenitoSprite state={petState} size={42} alt="" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-2xl text-navy">{name}</DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                copiloto tecnico para treino, anamnese e avaliacao funcional
              </DialogDescription>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-paper text-navy">
              Volume
            </Badge>
            <Badge variant="outline" className="bg-paper text-navy">
              Dor e restricao
            </Badge>
            <Badge variant="outline" className="bg-paper text-navy">
              Treino manual
            </Badge>
          </div>
            </DialogHeader>

            <div className="shrink-0 border-b border-line bg-paper-warm/45 px-5 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-navy">Contexto:</span> {activeLabel}. O {name} usa a pagina atual e, quando houver ciclo aberto, usa esse contexto para responder com mais precisao.
            </div>

            <div className="shrink-0 space-y-3 px-5 py-4">
          <div className="rounded-[18px] border border-line bg-background p-3 text-sm">
            <span className="font-semibold text-navy">{name} lembra:</span> tecnica, dor, nivel e objetivo vem antes de carga.
          </div>
          <div className="rounded-[18px] border border-primary/20 bg-primary/5 p-3 text-sm text-navy">
            <span className="font-semibold">Plano tecnico agora:</span> descreva o aluno, o objetivo, a restricao e o rascunho do treino. Eu devolvo riscos e ajustes para voce aprovar.
          </div>
            </div>

            <ScrollArea className="min-h-[120px] flex-1 px-5">
          <div className="space-y-3 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[86%] rounded-[20px] border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    message.role === "user"
                      ? "border-navy bg-navy text-primary-foreground"
                      : "border-line bg-background text-foreground"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-[20px] border border-line bg-background px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {name} revisando contexto...
                </div>
              </div>
            )}
          </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-line bg-background px-5 py-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {quickPrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => void askBnito(item.prompt)}
                disabled={loading}
                className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-navy transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                <Sparkles className="mr-1 inline h-3 w-3" />
                {item.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-[24px] border border-line bg-paper px-3 py-2">
            <HelpCircle className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Conta para o ${name}...`}
              className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="mb-1 h-9 w-9 rounded-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Enviar pergunta</span>
            </Button>
          </form>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </BnitoAssistantContext.Provider>
  );
}
