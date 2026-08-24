import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { HelpCircle, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { businessDateYmd } from "@/lib/businessDate";
import { BenitoSprite, type BenitoState } from "@/components/BenitoSprite";
import { useBenitoProductState } from "@/lib/benitoProductEvents";

type StudentBnitoMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type StudentBnitoResult = {
  answer?: string;
  topic?: string;
  urgency?: "normal" | "cautela" | "parar_e_avisar";
  student_action?: string;
  handoff_to_team?: boolean;
  follow_up_question?: string | null;
};

type StudentBnitoResponse = {
  result?: StudentBnitoResult | string;
  raw?: string;
  error?: string;
  details?: string;
  assistant_identity?: AssistantIdentity;
};

type AssistantIdentity = {
  assistant_name: string;
  consultancy_name?: string | null;
  company_id?: string | null;
  context_version?: string | null;
};

type ProactiveMission = {
  title: string;
  body: string;
  actionPrompt: string;
  urgency?: StudentBnitoResult["urgency"];
};

const quickPrompts = [
  {
    label: "Treino de hoje",
    prompt: "Me explica o objetivo do meu treino de hoje e como devo encarar a sessao.",
  },
  {
    label: "Tecnica",
    prompt: "Tenho duvida de execucao em um exercicio. O que devo observar antes de aumentar a carga?",
  },
  {
    label: "Dor no treino",
    prompt: "Senti dor durante o treino. Como decido se paro, reduzo ou aviso a equipe?",
  },
  {
    label: "Recuperacao",
    prompt: "Estou cansado hoje. Como saber se treino normal ou faço mais leve?",
  },
];

const WELCOME_ID = "student-bnito-welcome";
// O nome do assistente é por empresa (Central de IA). Padrão do app = "Setty".
function makeWelcome(name: string): StudentBnitoMessage {
  return {
    id: WELCOME_ID,
    role: "assistant",
    content: `Oi. Eu sou o ${name}. Me chama para entender seu treino, tirar duvidas de execucao, cuidar da recuperacao e saber quando vale avisar a equipe.`,
  };
}

const appMap = [
  "Home: resumo do dia, treino sugerido, meta semanal, progresso e atalhos.",
  "Treino: exercicios prescritos, series, repeticoes, descanso, video, carga, reps, RPE e conclusao.",
  "Calendario: organizacao dos treinos por dia e visao do ciclo.",
  "Historico: sessoes concluidas, cargas anteriores, consistencia e evolucao.",
  "Estatisticas: graficos de desempenho, sequencia, volume e progresso.",
  "Atividades externas: corrida, bike, natacao e outras atividades fora da musculacao.",
  "Medidas: registros corporais e evolucao visual/antropometrica.",
  "Avisos: comunicados da equipe e orientacoes importantes.",
  "Conquistas: XP, ranking e marcos de consistencia.",
];

function createMessage(role: StudentBnitoMessage["role"], content: string): StudentBnitoMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function getStudentPageLabel(pathname: string) {
  if (pathname.includes("/treino/")) return "treino aberto";
  if (pathname.includes("/aluno")) return "area do aluno";
  return "SettApp";
}

// A2/Q5 — contexto de treino que o StudentPortal grava (exercício aberto, carga prescrita, melhor carga).
function readTrainingContext(): unknown {
  try {
    const raw = sessionStorage.getItem("sett-bnito-context");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildLocalMission(pageLabel: string, name: string): ProactiveMission {
  if (pageLabel === "treino aberto") {
    return {
      title: `${name} no treino`,
      body: "Antes de aumentar carga, confere tecnica, amplitude e descanso. Se algo doer acima de 3/10, reduz ou para e me chama.",
      actionPrompt: "Me guia no treino de hoje: objetivo, tecnica e pontos de atencao.",
      urgency: "normal",
    };
  }
  return {
    title: `${name} acompanhando`,
    body: "Vou cruzar treino, registros, ciclo, medidas, atividades e avisos para te dar o proximo passo mais seguro.",
    actionPrompt: "Olha meu app agora e me diz qual deveria ser meu foco hoje.",
    urgency: "normal",
  };
}

function toMission(data: StudentBnitoResponse, fallback: ProactiveMission, name: string): ProactiveMission {
  if (typeof data.result === "string") {
    return { ...fallback, body: data.result.slice(0, 220) };
  }
  const result = data.result;
  if (!result) return fallback;
  return {
    title: result.urgency === "parar_e_avisar" ? `Atencao do ${name}` : `Missao do ${name}`,
    body: result.answer || fallback.body,
    actionPrompt: result.student_action || result.follow_up_question || fallback.actionPrompt,
    urgency: result.urgency || fallback.urgency,
  };
}

function formatStudentBnitoResponse(data: StudentBnitoResponse, name: string) {
  if (typeof data.result === "string") return data.result;
  const result = data.result;
  if (!result) return data.raw || `O ${name} respondeu, mas sem texto estruturado.`;

  const parts = [
    result.answer || "Analise pronta.",
    result.student_action ? `Agora: ${result.student_action}` : "",
    result.handoff_to_team ? "Vale avisar a equipe para conferirem junto com voce." : "",
    result.follow_up_question ? `Pergunta: ${result.follow_up_question}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

function getUnavailableMessage(message: string, name: string) {
  if (/function|edge|404|403|fetch|non-2xx/i.test(message)) {
    return `Nao consegui conectar com o ${name} agora. A interface ja esta instalada, mas a funcao ai-student-bnito precisa estar publicada na Supabase para responder.`;
  }
  return `Nao consegui responder agora: ${message}`;
}

export function StudentBnitoAssistantProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  // A edge resolve a empresa a partir do JWT do aluno. A leitura direta abaixo é apenas
  // um fallback visual para versões antigas da função e nunca é a fonte autoritativa.
  const [studentCompanyId, setStudentCompanyId] = useState<string | null>(null);
  const [assistantIdentity, setAssistantIdentity] = useState<AssistantIdentity | null>(null);
  useEffect(() => {
    if (role !== "student") {
      setStudentCompanyId(null);
      return;
    }
    let active = true;
    setStudentCompanyId(null);
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) {
        if (active) setStudentCompanyId(null);
        return;
      }
      (supabase as any)
        .from("students")
        .select("company_id")
        .eq("user_id", uid)
        .maybeSingle()
        .then(({ data: s }: { data: { company_id?: string } | null }) => {
          if (active && s?.company_id) setStudentCompanyId(s.company_id);
        });
    });
    return () => {
      active = false;
    };
  }, [role]);
  const { config } = useCompanyAiConfig(studentCompanyId);
  const name = assistantIdentity?.assistant_name || config.assistant_name || "Assistente";
  const location = useLocation();
  const params = useParams();
  // useParams() devolve um OBJETO NOVO a cada render — usar `params` direto nas deps de
  // useEffect/useCallback causava loop infinito (efeito rodava todo render → setState → render...).
  // paramsKey é estável por VALOR (string), então as deps só mudam quando os params realmente mudam.
  const paramsKey = JSON.stringify(params ?? {});
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [petReaction, setPetReaction] = useState<BenitoState | null>(null);
  const [messages, setMessages] = useState<StudentBnitoMessage[]>(() => [makeWelcome("Assistente")]);
  const [mission, setMission] = useState<ProactiveMission | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionDismissed, setMissionDismissed] = useState(false);
  const petReactionTimerRef = useRef<number | null>(null);

  // Quando o nome da empresa carrega, atualiza a mensagem de boas-vindas (se a conversa ainda nem começou).
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

  const shouldShow = role === "student";
  const pageLabel = useMemo(() => getStudentPageLabel(location.pathname), [location.pathname]);
  const missionCacheKey = useMemo(
    () => `student-bnito-mission:${businessDateYmd()}:${assistantIdentity?.company_id || studentCompanyId || "no-company"}:${assistantIdentity?.context_version || "context-pending"}:${name.trim().toLowerCase()}:${location.pathname}`,
    [assistantIdentity?.company_id, assistantIdentity?.context_version, location.pathname, name, studentCompanyId],
  );
  const missionDismissedKey = `${missionCacheKey}:dismissed`;

  const consumeIdentity = useCallback((data?: StudentBnitoResponse | null) => {
    const next = data?.assistant_identity;
    if (!next?.assistant_name) return;
    setAssistantIdentity((current) => {
      if (
        current?.assistant_name === next.assistant_name
        && current?.company_id === next.company_id
        && current?.context_version === next.context_version
      ) return current;
      return next;
    });
    if (next.company_id) setStudentCompanyId(next.company_id);
  }, []);

  const refreshIdentity = useCallback(async () => {
    if (role !== "student") return;
    const { data, error } = await supabase.functions.invoke<StudentBnitoResponse>("ai-student-bnito", {
      body: { action: "identity" },
    });
    if (!error) consumeIdentity(data);
  }, [consumeIdentity, role]);

  useEffect(() => {
    if (role !== "student") {
      setAssistantIdentity(null);
      return;
    }

    void refreshIdentity();
    const interval = window.setInterval(() => void refreshIdentity(), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshIdentity();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshIdentity, role]);

  const askBnito = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, createMessage("user", trimmed)]);

    try {
      const history = messages
        .filter((message) => message.id !== WELCOME_ID)
        .slice(-8)
        .map((message) => ({ role: message.role, content: message.content }));

      const { data, error } = await supabase.functions.invoke<StudentBnitoResponse>("ai-student-bnito", {
        body: {
          action: "ask",
          question: trimmed,
          history,
          page_context: {
            pathname: location.pathname,
            page_label: pageLabel,
            route_params: params,
            app_map: appMap,
            training_context: readTrainingContext(),
          },
        },
      });

      if (error) throw new Error(error.message);
      if (!data) throw new Error("resposta vazia");
      if (data.error) throw new Error(data.details || data.error);

      consumeIdentity(data);

      const responseName = data.assistant_identity?.assistant_name || name;
      setMessages((current) => [...current, createMessage("assistant", formatStudentBnitoResponse(data, responseName))]);
      const responseUrgency = typeof data.result === "object" ? data.result?.urgency : undefined;
      const requiresTeamHandoff = typeof data.result === "object" && data.result?.handoff_to_team === true;
      showPetReaction(
        requiresTeamHandoff || responseUrgency === "parar_e_avisar" || responseUrgency === "cautela"
          ? "alert"
          : "celebration",
        requiresTeamHandoff || responseUrgency === "parar_e_avisar" ? 3000 : 1800,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro inesperado";
      setMessages((current) => [...current, createMessage("assistant", getUnavailableMessage(message, name))]);
      showPetReaction("error", 1800);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumeIdentity, loading, location.pathname, messages, pageLabel, paramsKey, name, showPetReaction]);

  useEffect(() => {
    if (!shouldShow) return;

    const fallback = buildLocalMission(pageLabel, name);
    setMissionDismissed(sessionStorage.getItem(missionDismissedKey) === "1");
    setMission(fallback);

    const cached = sessionStorage.getItem(missionCacheKey);
    if (cached) {
      try {
        setMission(JSON.parse(cached) as ProactiveMission);
        return;
      } catch {
        sessionStorage.removeItem(missionCacheKey);
      }
    }

    let active = true;
    setMissionLoading(true);
    supabase.functions.invoke<StudentBnitoResponse>("ai-student-bnito", {
      body: {
        action: "brief",
        question: "Gere uma missao proativa curta para o aluno agora, usando o contexto real do app.",
        history: [],
        page_context: {
          pathname: location.pathname,
          page_label: pageLabel,
          route_params: params,
          app_map: appMap,
          training_context: readTrainingContext(),
        },
      },
    }).then(({ data, error }) => {
      if (!active || error || !data || data.error) return;
      consumeIdentity(data);
      const nextMission = toMission(data, fallback, data.assistant_identity?.assistant_name || name);
      setMission(nextMission);
      sessionStorage.setItem(missionCacheKey, JSON.stringify(nextMission));
    }).finally(() => {
      if (active) setMissionLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumeIdentity, location.pathname, missionCacheKey, missionDismissedKey, pageLabel, paramsKey, shouldShow, name]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void askBnito(input);
  };

  // BNITO arrastável: o aluno pode mover o botão pra não atrapalhar finalizar a série.
  const dragRef = useRef({
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    lastClientX: 0,
    moved: false,
  });
  const [bnitoDrag, setBnitoDrag] = useState({ x: 0, y: 0 });
  const [dragDirection, setDragDirection] = useState<"running-left" | "running-right" | null>(null);
  const localPetFallback: BenitoState = loading || missionLoading
    ? "processing"
    : mission && !missionDismissed && mission.urgency === "parar_e_avisar"
      ? "alert"
      : petReaction ?? (open || (mission && !missionDismissed)
        ? "waiting"
        : "idle");
  const petState = useBenitoProductState("student", localPetFallback, dragDirection);

  return (
    <>
      {children}
      {shouldShow && (
        <Dialog open={open} onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) showPetReaction("greeting");
        }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-benito-fab="student"
                aria-label={`Abrir ${name}`}
                style={{ transform: `translate(${bnitoDrag.x}px, ${bnitoDrag.y}px)`, touchAction: "none" }}
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const baseLeft = rect.left - bnitoDrag.x;
                  const baseTop = rect.top - bnitoDrag.y;
                  const minX = 8 - baseLeft;
                  const maxX = window.innerWidth - 8 - baseLeft - rect.width;
                  const minY = 8 - baseTop;
                  const maxY = window.innerHeight - 8 - baseTop - rect.height;
                  const ox = Math.min(maxX, Math.max(minX, bnitoDrag.x));
                  const oy = Math.min(maxY, Math.max(minY, bnitoDrag.y));

                  if (ox !== bnitoDrag.x || oy !== bnitoDrag.y) setBnitoDrag({ x: ox, y: oy });
                  dragRef.current = {
                    sx: e.clientX,
                    sy: e.clientY,
                    ox,
                    oy,
                    minX,
                    maxX,
                    minY,
                    maxY,
                    lastClientX: e.clientX,
                    moved: false,
                  };
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const drag = dragRef.current;
                  const dx = e.clientX - drag.sx;
                  const dy = e.clientY - drag.sy;
                  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
                  if (drag.moved) {
                    const horizontalDelta = e.clientX - drag.lastClientX;
                    if (Math.abs(horizontalDelta) >= 3) {
                      setDragDirection(horizontalDelta < 0 ? "running-left" : "running-right");
                      drag.lastClientX = e.clientX;
                    }
                    setBnitoDrag({
                      x: Math.min(drag.maxX, Math.max(drag.minX, drag.ox + dx)),
                      y: Math.min(drag.maxY, Math.max(drag.minY, drag.oy + dy)),
                    });
                  }
                }}
                onPointerUp={(e) => {
                  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                  setDragDirection(null);
                  if (!dragRef.current.moved) {
                    setOpen(true);
                    showPetReaction("greeting");
                  }
                }}
                onPointerCancel={(e) => {
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
                  setDragDirection(null);
                }}
                onLostPointerCapture={() => setDragDirection(null)}
                className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))] z-40 flex h-[76px] w-[76px] cursor-grab items-center justify-center p-0 text-navy outline-none transition-transform duration-200 active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring md:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:right-6"
              >
                <BenitoSprite state={petState} size={60} alt="" className="benito-sprite-prominent" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{`Falar com o ${name}`}</TooltipContent>
          </Tooltip>

          {!open && mission && !missionDismissed && (
            <div className="pointer-events-none fixed bottom-[calc(11rem+env(safe-area-inset-bottom,0px))] right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[22px] border border-line bg-background/95 p-3 text-sm shadow-xl backdrop-blur [@media(max-height:740px)]:hidden md:bottom-24 md:right-6">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center text-navy">
                  <BenitoSprite state={missionLoading ? "processing" : mission.urgency === "parar_e_avisar" ? "alert" : "waiting"} size={36} alt="" className="benito-sprite-prominent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy">{mission.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mission.body}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="pointer-events-auto rounded-full bg-navy px-3 py-1.5 text-xs font-medium text-primary-foreground"
                      onClick={() => {
                        setOpen(true);
                        showPetReaction("greeting");
                        void askBnito(mission.actionPrompt);
                      }}
                    >
                      Me orientar
                    </button>
                    <button
                      type="button"
                      className="pointer-events-auto rounded-full px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => {
                        sessionStorage.setItem(missionDismissedKey, "1");
                        setMissionDismissed(true);
                      }}
                    >
                      Depois
                    </button>
                    {missionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-[24px] border-line bg-paper p-0 shadow-2xl [&>button]:rounded-full">
            <DialogHeader className="shrink-0 border-b border-line bg-background px-5 py-4 text-left">
              <div className="flex items-start gap-3 pr-8">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center text-navy">
                  <BenitoSprite state={petState} size={52} alt="" className="benito-sprite-prominent" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="font-display text-2xl text-navy">{name}</DialogTitle>
                  <DialogDescription className="mt-1 text-sm">
                    seu parceiro tecnico de treino
                  </DialogDescription>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-paper text-navy">
                  Execucao
                </Badge>
                <Badge variant="outline" className="bg-paper text-navy">
                  Recuperacao
                </Badge>
                <Badge variant="outline" className="bg-paper text-navy">
                  Dor e sinais
                </Badge>
              </div>
            </DialogHeader>

            <div className="shrink-0 border-b border-line bg-paper-warm/45 px-5 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-navy">Contexto:</span> {pageLabel}. O {name} usa seu treino salvo e seus registros para responder melhor.
            </div>

            <div className="hidden shrink-0 space-y-3 px-5 py-4 sm:block">
              {mission && (
                <div className="rounded-[18px] border border-navy/20 bg-navy/5 p-3 text-sm text-navy">
                  <span className="font-semibold">{mission.title}:</span> {mission.body}
                </div>
              )}
              <div className="rounded-[18px] border border-line bg-background p-3 text-sm">
                <span className="font-semibold text-navy">{name} lembra:</span> tecnica boa vale mais que carga alta.
              </div>
              <div className="rounded-[18px] border border-primary/20 bg-primary/5 p-3 text-sm text-navy">
                <span className="font-semibold">Plano agora:</span> me conte a duvida, o exercicio e o que voce sentiu. Eu te ajudo a decidir o proximo passo com seguranca.
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
                      className={`max-w-[86%] whitespace-pre-wrap rounded-[20px] border px-4 py-3 text-sm leading-relaxed ${
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
                      {name} lendo seu contexto...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-line bg-background px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
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
    </>
  );
}
