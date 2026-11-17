import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Apple,
  BrainCircuit,
  ClipboardCheck,
  Copy,
  Dumbbell,
  Footprints,
  Loader2,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantName } from "@/hooks/useAssistantName";
import { useToast } from "@/hooks/use-toast";

type Modality =
  | "bnito"
  | "strength"
  | "running"
  | "nutrition";

type FieldType = "text" | "number" | "textarea" | "select";

interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

interface ModeConfig {
  id: Modality;
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof BrainCircuit;
  fields: FieldConfig[];
  contextPlaceholder: string;
}

interface AICoachResponse {
  modality?: Modality;
  mode_title?: string;
  library?: {
    source?: string;
    exercises_loaded?: number;
    validation?: {
      valid?: boolean;
      missing?: string[];
      invalid?: string[];
    } | null;
  };
  result?: unknown;
  raw?: string;
  error?: string;
  details?: string;
}

const modes: ModeConfig[] = [
  {
    id: "bnito",
    title: "BNITO",
    subtitle: "Copiloto tecnico, triagem conservadora e secretaria inteligente do professor.",
    badge: "Coração",
    icon: BrainCircuit,
    fields: [
      { key: "support_focus", label: "Foco", type: "select", options: [
        { label: "Tecnico / treino", value: "tecnico_treino" },
        { label: "Dor / triagem conservadora", value: "triagem_conservadora" },
        { label: "Secretaria / atendimento", value: "secretaria_atendimento" },
      ] },
      { key: "question", label: "Pergunta ou mensagem", type: "textarea", placeholder: "Ex: aluno relatou dor no joelho na anamnese; como ajusto o treino de pernas? Ou: escreva uma resposta curta para remarcar o treino." },
      { key: "student_name", label: "Aluno", type: "text", placeholder: "Nome do aluno ou caso" },
      { key: "objective", label: "Objetivo do aluno", type: "text", placeholder: "hipertrofia, performance, retorno, emagrecimento..." },
      { key: "level", label: "Nivel", type: "select", options: [
        { label: "Iniciante", value: "iniciante" },
        { label: "Intermediario", value: "intermediario" },
        { label: "Avancado", value: "avancado" },
      ] },
      { key: "channel", label: "Canal", type: "select", options: [
        { label: "Interno", value: "interno" },
        { label: "WhatsApp", value: "whatsapp" },
        { label: "Portal", value: "portal" },
        { label: "Email", value: "email" },
      ] },
      { key: "tone", label: "Tom", type: "select", options: [
        { label: "Tecnico", value: "tecnico" },
        { label: "Profissional", value: "profissional" },
        { label: "Proximo", value: "proximo" },
        { label: "Motivacional", value: "motivacional" },
      ] },
      { key: "pain_or_restriction", label: "Dor/restricao", type: "textarea", placeholder: "joelho EVA 4, lombar, ombro, retorno de lesao..." },
    ],
    contextPlaceholder: "Cole aqui rascunho do treino, anamnese, avaliacao funcional, volume semanal, mensagem do aluno, agenda/pagamento ou duvida do professor. No app, o BNITO tambem recebe contexto automatico da secao aberta.",
  },
  {
    id: "strength",
    title: "Musculacao",
    subtitle: "Prescricao BN, treino adaptativo e ajustes por dor usando a biblioteca do app.",
    badge: "Força",
    icon: Dumbbell,
    fields: [
      { key: "objective", label: "Objetivo", type: "text", placeholder: "hipertrofia, performance, recomposicao..." },
      { key: "experience", label: "Experiencia", type: "select", options: [
        { label: "Iniciante", value: "iniciante" },
        { label: "Intermediario", value: "intermediario" },
        { label: "Avancado", value: "avancado" },
      ] },
      { key: "days_per_week", label: "Dias por semana", type: "number", placeholder: "4" },
      { key: "duration_weeks", label: "Duracao semanas", type: "number", placeholder: "8" },
      { key: "block_number", label: "Bloco BN", type: "select", options: [
        { label: "Bloco 1", value: "1" },
        { label: "Bloco 2", value: "2" },
        { label: "Bloco 3", value: "3" },
      ] },
      { key: "equipment", label: "Equipamentos", type: "text", placeholder: "academia completa, casa, funcional..." },
      { key: "is_endurance_athlete", label: "Corrida/triathlon", type: "select", options: [
        { label: "Nao", value: "nao" },
        { label: "Sim", value: "sim" },
      ] },
      { key: "restrictions", label: "Restricoes/dor", type: "textarea", placeholder: "joelho, lombar, ombro, EVA..." },
      { key: "adaptation_signals", label: "Sinais de adaptacao", type: "textarea", placeholder: "RPE, queda de performance, faltas, sono, dor pos-treino, exercicios que travaram..." },
    ],
    contextPlaceholder: "Cole avaliacao funcional/OHS, historico de treino, dor EVA, limitacoes, logs de carga/RPE, recuperacao, rotina de corrida e observacoes. A IA carrega automaticamente a biblioteca de exercicios do app.",
  },
  {
    id: "running",
    title: "Corrida",
    subtitle: "Planos por zonas, volume e seguranca de carga.",
    badge: "Endurance",
    icon: Footprints,
    fields: [
      { key: "goal_race", label: "Meta/prova", type: "text", placeholder: "5K, 10K, meia, maratona..." },
      { key: "current_volume", label: "Volume atual", type: "text", placeholder: "20 km/semana, 3 treinos..." },
      { key: "level", label: "Nivel", type: "select", options: [
        { label: "Iniciante", value: "iniciante" },
        { label: "Intermediario", value: "intermediario" },
        { label: "Avancado", value: "avancado" },
        { label: "Retorno pos-lesao", value: "retorno_pos_lesao" },
      ] },
      { key: "pain_score", label: "Dor EVA", type: "number", placeholder: "0 a 10" },
    ],
    contextPlaceholder: "Inclua pace recente, FC repouso/max, dias disponiveis, lesoes e relacao com treinos de forca.",
  },
  {
    id: "nutrition",
    title: "Nutricao",
    subtitle: "Plano educacional com macros e refeicoes.",
    badge: "Macros",
    icon: Apple,
    fields: [
      { key: "goal", label: "Objetivo", type: "select", options: [
        { label: "Emagrecimento", value: "emagrecimento" },
        { label: "Manutencao", value: "manutencao" },
        { label: "Hipertrofia", value: "hipertrofia" },
        { label: "Recomposicao", value: "recomposicao" },
      ] },
      { key: "weight_kg", label: "Peso kg", type: "number", placeholder: "78" },
      { key: "height_cm", label: "Altura cm", type: "number", placeholder: "178" },
      { key: "restrictions", label: "Restricoes/preferencias", type: "textarea", placeholder: "sem lactose, vegetariano, rotina..." },
    ],
    contextPlaceholder: "Inclua horario de treino, numero de refeicoes, orcamento e alimentos preferidos.",
  },
];

const reassignedFlows = [
  { title: "Treino adaptativo", target: "Musculacao", note: "usa logs, RPE, dor e recuperacao dentro da prescricao." },
  { title: "Triagem de lesao", target: "BNITO + Musculacao", note: "BNITO orienta a decisao; musculacao adapta o treino." },
  { title: "Secretaria IA", target: "BNITO", note: "mensagens, agenda e suporte entram como foco de atendimento." },
  { title: "Composicao e tecnica", target: "Avaliacao Funcional", note: "medidas, fotos, OHS e video alimentam o laudo tecnico." },
];

const buildInitialValues = (mode: ModeConfig) =>
  mode.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.options?.[0]?.value || "";
    return acc;
  }, {});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyResult(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function AICoachHub() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const rolePrefix = location.pathname.split("/").filter(Boolean)[0] || "admin";
  const goTo = (path: "avaliacao" | "studio" | "prescricao") => navigate(`/${rolePrefix}/${path}`);
  const assistantName = useAssistantName();
  // White-label: troca o rótulo legado "BNITO" pelo nome da empresa nos textos visíveis.
  const swap = (s: string) => s.replace(/BNITO/gi, assistantName);
  const [selectedId, setSelectedId] = useState<Modality>("bnito");
  const selectedMode = modes.find((mode) => mode.id === selectedId) || modes[0];
  const [forms, setForms] = useState<Record<Modality, Record<string, string>>>(() =>
    modes.reduce((acc, mode) => ({ ...acc, [mode.id]: buildInitialValues(mode) }), {} as Record<Modality, Record<string, string>>)
  );
  const [contexts, setContexts] = useState<Record<Modality, string>>(() =>
    modes.reduce((acc, mode) => ({ ...acc, [mode.id]: "" }), {} as Record<Modality, string>)
  );
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AICoachResponse | null>(null);

  const selectedValues = forms[selectedId];
  const selectedContext = contexts[selectedId];
  const resultText = useMemo(() => {
    if (!response) return "";
    return stringifyResult(response.result || response.raw || response);
  }, [response]);

  const summary = useMemo(() => {
    if (!response?.result || !isRecord(response.result)) return null;
    const result = response.result;
    return typeof result.summary === "string"
      ? result.summary
      : typeof result.reply === "string"
        ? result.reply
        : null;
  }, [response]);

  const updateField = (key: string, value: string) => {
    setForms((current) => ({
      ...current,
      [selectedId]: {
        ...current[selectedId],
        [key]: value,
      },
    }));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const isBnito = selectedId === "bnito";
      const { data, error } = await supabase.functions.invoke<AICoachResponse>(
        isBnito ? "ai-bnito-coach" : "ai-coach-pack",
        {
          body: isBnito
            ? {
                action: "ask",
                question: selectedValues.question || selectedContext || "Responda como copiloto tecnico do professor.",
                profile: selectedValues,
                context: selectedContext,
              }
            : {
                modality: selectedId,
                profile: {
                  ...selectedValues,
                  methodology: selectedId === "strength" ? "BN Musculacao/Forca" : undefined,
                  use_exercise_library: selectedId === "strength",
                },
                context: selectedContext,
              },
        },
      );

      if (error) throw new Error(error.message);
      if (!data) throw new Error("A IA nao retornou dados.");
      if (data.error) throw new Error(data.details || data.error);

      setResponse(data);
      toast({ title: "IA gerou a resposta", description: swap(selectedMode.title) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      toast({ title: "Falha ao gerar", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    toast({ title: "Resultado copiado" });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <BrainCircuit className="h-4 w-4" />
            Pack de IAs BN
          </div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl text-navy">Central IA de Performance</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {assistantName} como coracao do app; musculacao absorve adaptacao de treino; avaliacao funcional concentra composicao, tecnica, fotos e video.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          Requer ANTHROPIC_API_KEY nas secrets da Supabase
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                Modos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {modes.map((mode) => {
                const Icon = mode.icon;
                const active = mode.id === selectedId;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(mode.id);
                      setResponse(null);
                    }}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-line hover:bg-paper/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{swap(mode.title)}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {mode.badge}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{swap(mode.subtitle)}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                Fluxos incorporados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reassignedFlows.map((flow) => (
                <div key={flow.title} className="rounded-md border border-line bg-paper/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{swap(flow.title)}</span>
                    <Badge variant="outline" className="text-[10px]">{swap(flow.target)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{swap(flow.note)}</p>
                </div>
              ))}
              <div className="grid gap-2">
                <Button variant="outline" className="justify-start gap-2" onClick={() => goTo("avaliacao")}>
                  <ClipboardCheck className="h-4 w-4" />
                  Abrir Avaliacao Funcional
                </Button>
                <Button variant="outline" className="justify-start gap-2" onClick={() => goTo("studio")}>
                  <Sparkles className="h-4 w-4" />
                  Abrir Studio Integrado
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <selectedMode.icon className="h-4 w-4 text-primary" />
              {swap(selectedMode.title)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedId === "bnito" && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                {assistantName} agora concentra revisao tecnica, triagem conservadora, perguntas do professor e secretaria.
              </div>
            )}
            {selectedId === "strength" && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                A musculacao agora tambem cobre treino adaptativo e ajustes por dor. A prescricao usa somente exercicios cadastrados na Biblioteca de Exercicios e retorna
                <span className="font-medium"> exercise_id </span>
                para cada item do treino.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {selectedMode.fields.map((field) => (
                <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {field.type === "select" ? (
                    <Select value={selectedValues[field.key]} onValueChange={(value) => updateField(field.key, value)}>
                      <SelectTrigger id={field.key} className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "textarea" ? (
                    <Textarea
                      id={field.key}
                      value={selectedValues[field.key]}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1 min-h-[88px]"
                    />
                  ) : (
                    <Input
                      id={field.key}
                      type={field.type}
                      value={selectedValues[field.key]}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="ai-context">Contexto para a IA</Label>
              <Textarea
                id="ai-context"
                value={selectedContext}
                onChange={(event) => setContexts((current) => ({ ...current, [selectedId]: event.target.value }))}
                placeholder={swap(selectedMode.contextPlaceholder)}
                className="mt-1 min-h-[180px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleGenerate} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar com IA
              </Button>
              <p className="text-xs text-muted-foreground">
                Revise sempre antes de salvar, enviar ao aluno ou aplicar no treino.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                Resultado
              </CardTitle>
              <Button variant="outline" size="sm" onClick={copyResult} disabled={!resultText} className="gap-2">
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!response ? (
              <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-line p-6 text-center text-sm text-muted-foreground">
                Escolha um modo, preencha o contexto e gere uma resposta estruturada.
              </div>
            ) : (
              <div className="space-y-3">
                {response.library?.exercises_loaded !== undefined && (
                  <div className="rounded-md border border-line bg-paper/60 p-3 text-xs text-muted-foreground">
                    Biblioteca carregada: {response.library.exercises_loaded} exercicios
                    {response.library.validation?.valid === false ? " | validar lacunas no JSON" : ""}
                  </div>
                )}
                {summary && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                    {summary}
                  </div>
                )}
                <pre className="max-h-[620px] overflow-auto rounded-md bg-navy p-4 text-xs leading-relaxed text-white">
                  {resultText}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
