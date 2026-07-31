// ============================================================================
// FunctionalAssessment — Avaliação Postural e Funcional com IA
//   Envia fotos de postura estática + overhead squat e dados clínicos.
//   A IA gera um laudo (report_text) e um JSON estruturado usado depois
//   como contexto pelas prescrições de musculação e corrida.
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, X, ClipboardCheck, AlertCircle } from "lucide-react";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import VideoAssessment from "@/components/VideoAssessment";
import { saveStudentFile } from "@/lib/studentFiles";
import { AssessmentBodyMap } from "@/components/body/AssessmentBodyMap";
import { normalizeGender } from "@/lib/bodyMap";

interface Student { id: string; full_name: string; gender?: string | null; }

const IMAGE_SLOTS: { key: string; label: string }[] = [
  { key: "image_postura_frente", label: "Postura — Frontal" },
  { key: "image_postura_lado",   label: "Postura — Lateral" },
  { key: "image_postura_costas", label: "Postura — Posterior" },
  { key: "image_squat_frente",   label: "Overhead Squat — Frontal" },
  { key: "image_squat_lado",     label: "Overhead Squat — Lateral" },
  { key: "image_squat_costas",   label: "Overhead Squat — Posterior" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FunctionalAssessment() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents]   = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [images, setImages]       = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    queixa_principal: "",
    historico_lesoes: "",
    modalidade: "",
    nivel: "intermediario",
    peso_kg: "",
    altura_cm: "",
    cintura_cm: "",
    percentual_gordura: "",
    perimetros: "",
    observacoes_tecnicas: "",
  });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [result, setResult]       = useState<any>(null);

  // Resolve a empresa do jeito que o app usa de fato: master usa a empresa que está
  // "visualizando" (MasterContext); staff usa a própria. (Antes filtrava por company_members,
  // o que deixava o master SEM linha em company_members travado — telas não carregavam.)
  const { companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId ?? null;

  useEffect(() => {
    if (!effectiveCompanyId) { setCompanyId(null); setStudents([]); return; }
    setCompanyId(effectiveCompanyId);
    (async () => {
      const { data: list } = await supabase.from("students")
        .select("id, full_name, gender").eq("company_id", effectiveCompanyId).order("full_name");
      setStudents(list || []);
    })();
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!studentId) { setResult(null); return; }
    (async () => {
      const { data } = await supabase.from("functional_assessments")
        .select("*").eq("student_id", studentId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      setResult(data ?? null);
      if (data) {
        const assessmentJson = data.assessment_json;
        const composition = assessmentJson && typeof assessmentJson === "object" && !Array.isArray(assessmentJson)
          ? ((assessmentJson as Record<string, unknown>).composicao_corporal as Record<string, unknown> | undefined) ?? {}
          : {};
        setForm({
          queixa_principal: data.queixa_principal ?? "",
          historico_lesoes: data.historico_lesoes ?? "",
          modalidade: data.modalidade ?? "",
          nivel: data.nivel ?? "intermediario",
          peso_kg: composition.peso_kg != null ? String(composition.peso_kg) : "",
          altura_cm: composition.altura_cm != null ? String(composition.altura_cm) : "",
          cintura_cm: composition.cintura_cm != null ? String(composition.cintura_cm) : "",
          percentual_gordura: composition.percentual_gordura_informado != null ? String(composition.percentual_gordura_informado) : "",
          perimetros: Array.isArray(composition.prioridades_de_acompanhamento) ? composition.prioridades_de_acompanhamento.join("; ") : "",
          observacoes_tecnicas: "",
        });
      }
    })();
  }, [studentId]);

  const student = students.find(s => s.id === studentId);

  async function onPick(key: string, file?: File) {
    if (!file) return;
    const b64 = await fileToBase64(file);
    setImages(prev => ({ ...prev, [key]: b64 }));
  }

  async function generate() {
    if (!studentId || !companyId) { setError("Selecione um aluno."); return; }
    const hasAssessmentInput = Object.keys(images).length > 0 || [
      form.queixa_principal,
      form.historico_lesoes,
      form.peso_kg,
      form.altura_cm,
      form.cintura_cm,
      form.percentual_gordura,
      form.perimetros,
      form.observacoes_tecnicas,
    ].some((value) => value.trim());
    if (!hasAssessmentInput) { setError("Envie fotos ou preencha dados de composicao/analise tecnica."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const assessmentId = crypto.randomUUID();
      const { data, error: e } = await supabase.functions.invoke("ai-functional-assessment", {
        body: {
          assessment_id: assessmentId,
          student_id: studentId, student_name: student?.full_name, company_id: companyId,
          ...images, ...form,
        },
      });
      if (e || data?.error) throw new Error(data?.error || e?.message);
      setResult(data);
      await saveAssessmentReport(data);
    } catch (err: any) {
      setError(err.message || "Erro ao gerar avaliação.");
    }
    setLoading(false);
  }

  async function saveAssessmentReport(data: any) {
    if (!studentId || !companyId || !data) return;
    const reportPayload = {
      student_id: studentId,
      student_name: student?.full_name,
      assessment_id: data.id ?? data.assessment_id ?? null,
      report_text: data.report_text ?? null,
      report_sections: data.assessment_json?.report_sections ?? null,
      prescription_context: data.assessment_json?.prescription_context ?? null,
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: "application/json" });
    const safeName = (student?.full_name || "aluno").replace(/[^\w.-]+/g, "_");
    const { error: fileError } = await saveStudentFile({
      studentId,
      companyId,
      data: blob,
      fileName: `avaliacao-funcional-${safeName}.json`,
      kind: "assessment_report",
      contentType: "application/json",
      stampMs: Date.now(),
      stableName: true, // 1 laudo atual por aluno — re-gerar sobrescreve em vez de empilhar duplicados
      metadata: {
        source: "FunctionalAssessment",
        assessment_id: reportPayload.assessment_id,
      },
    });
    if (fileError) setError(`Avaliação gerada, mas não consegui salvar na pasta do aluno: ${fileError}`);
  }

  const json = result?.assessment_json;
  const assessmentContext = {
    studentName: student?.full_name,
    ...form,
  };

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <p className="text-eyebrow">Avaliação</p>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl">Avaliação Funcional com IA</h1>
            <BnitoContextButton
              studentId={studentId || undefined}
              label="avaliacao funcional"
              context="Avaliacao postural, overhead squat, queixa principal, historico de lesoes e laudo usado para prescricao."
              question="Como devo interpretar a avaliacao funcional para ajustar a prescricao com seguranca?"
            />
          </div>
          <p className="text-sm text-muted-foreground">Postura estática + overhead squat · laudo técnico · contexto para a prescrição</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              Aluno
              <BnitoContextButton
                studentId={studentId || undefined}
                label="aluno da avaliacao funcional"
                context="Selecao do aluno para carregar avaliacao funcional e contexto clinico."
                question="Que informacoes do aluno devo revisar antes de gerar a avaliacao funcional?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {studentId && (
          <>
            {companyId && (
              <VideoAssessment
                studentId={studentId}
                companyId={companyId}
                assessmentContext={assessmentContext}
                onComplete={(_, videoResult) => {
                  if (videoResult) {
                    setResult(videoResult);
                    void saveAssessmentReport(videoResult);
                  }
                }}
              />
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Fotos
                  <BnitoContextButton
                    studentId={studentId || undefined}
                    label="fotos da avaliacao funcional"
                    context="Fotos de postura frontal/lateral/posterior e overhead squat frontal/lateral/posterior."
                    question="Quais angulos e sinais devo observar nestas fotos antes de confiar no laudo?"
                    className="ml-auto"
                  />
                </CardTitle>
                <p className="text-xs text-muted-foreground">Envie o que tiver — nem todas são obrigatórias.</p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {IMAGE_SLOTS.map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <div className="relative border border-line rounded-lg aspect-square overflow-hidden flex items-center justify-center bg-muted/30">
                      {images[key] ? (
                        <>
                          <img src={images[key]} alt={label} className="object-cover w-full h-full" />
                          <button
                            type="button"
                            onClick={() => setImages(prev => { const n = { ...prev }; delete n[key]; return n; })}
                            className="absolute top-1 right-1 bg-ink/70 text-paper rounded-full p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center gap-1 text-muted-foreground text-xs">
                          <Upload className="h-5 w-5" />
                          Enviar
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => onPick(key, e.target.files?.[0])} />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Composição e técnica
                  <BnitoContextButton
                    studentId={studentId || undefined}
                    label="composicao e tecnica"
                    context="Medidas corporais, perimetros, observacoes tecnicas, assimetrias e execucao para alimentar a avaliacao funcional."
                    question="Como devo interpretar medidas e observacoes tecnicas junto com a avaliacao funcional?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Peso kg</Label>
                  <Input className="h-9 text-sm" value={form.peso_kg}
                    onChange={e => setForm(f => ({ ...f, peso_kg: e.target.value }))}
                    placeholder="Ex: 78" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Altura cm</Label>
                  <Input className="h-9 text-sm" value={form.altura_cm}
                    onChange={e => setForm(f => ({ ...f, altura_cm: e.target.value }))}
                    placeholder="Ex: 178" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Cintura cm</Label>
                  <Input className="h-9 text-sm" value={form.cintura_cm}
                    onChange={e => setForm(f => ({ ...f, cintura_cm: e.target.value }))}
                    placeholder="Ex: 84" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">% gordura</Label>
                  <Input className="h-9 text-sm" value={form.percentual_gordura}
                    onChange={e => setForm(f => ({ ...f, percentual_gordura: e.target.value }))}
                    placeholder="Opcional" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1">Perímetros, dobras ou evolução</Label>
                  <Textarea className="text-sm min-h-[56px]" value={form.perimetros}
                    onChange={e => setForm(f => ({ ...f, perimetros: e.target.value }))}
                    placeholder="Ex: quadril, tórax, braço, histórico de peso, fotos comparativas..." />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1">Observações técnicas</Label>
                  <Textarea className="text-sm min-h-[56px]" value={form.observacoes_tecnicas}
                    onChange={e => setForm(f => ({ ...f, observacoes_tecnicas: e.target.value }))}
                    placeholder="Ex: joelho entra no agachamento, pouca dorsiflexão, assimetria de passada..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Dados clínicos
                  <BnitoContextButton
                    studentId={studentId || undefined}
                    label="dados clinicos da avaliacao"
                    context="Queixa principal, historico de lesoes, modalidade e nivel do aluno antes da analise funcional."
                    question="Como devo usar queixa, lesoes e nivel para calibrar a interpretacao da avaliacao?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 grid-cols-2">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1">Queixa principal</Label>
                  <Textarea className="text-sm min-h-[56px]" value={form.queixa_principal}
                    onChange={e => setForm(f => ({ ...f, queixa_principal: e.target.value }))}
                    placeholder="Ex: dor no joelho ao agachar" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1">Histórico de lesões</Label>
                  <Textarea className="text-sm min-h-[56px]" value={form.historico_lesoes}
                    onChange={e => setForm(f => ({ ...f, historico_lesoes: e.target.value }))}
                    placeholder="Ex: entorse de tornozelo D em 2023" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Modalidade</Label>
                  <Input className="h-9 text-sm" value={form.modalidade}
                    onChange={e => setForm(f => ({ ...f, modalidade: e.target.value }))}
                    placeholder="Ex: corrida + musculação" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Nível</Label>
                  <Select value={form.nivel} onValueChange={v => setForm(f => ({ ...f, nivel: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iniciante">Iniciante</SelectItem>
                      <SelectItem value="intermediario">Intermediário</SelectItem>
                      <SelectItem value="avancado">Avançado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}

            <Button className="w-full" onClick={generate} disabled={loading}>
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando…</>
                : <><ClipboardCheck className="mr-2 h-4 w-4" /> Gerar avaliação</>}
            </Button>

            {result && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Laudo
                    <BnitoContextButton
                      studentId={studentId || undefined}
                      label="laudo funcional"
                      context="Resultado da avaliacao funcional com scores, compensacoes e recomendacoes para prescricao."
                      question="Me ajuda a transformar este laudo em ajustes práticos de treino?"
                      className="ml-auto"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {(json?.score_postural?.total != null || json?.score_funcional?.total != null) && (
                    <div className="grid grid-cols-2 gap-2">
                      {json?.score_postural?.total != null && (
                        <div className="border border-line rounded p-2 text-center">
                          <div className="font-display text-2xl">{json.score_postural.total}/10</div>
                          <div className="text-xs text-muted-foreground">Score postural</div>
                        </div>
                      )}
                      {json?.score_funcional?.total != null && (
                        <div className="border border-line rounded p-2 text-center">
                          <div className="font-display text-2xl">{json.score_funcional.total}/10</div>
                          <div className="text-xs text-muted-foreground">Score funcional</div>
                        </div>
                      )}
                    </div>
                  )}
                  <AssessmentBodyMap assessmentJson={json} gender={normalizeGender(student?.gender) ?? "male"} />
                  {json?.direcionamento_protocolo?.protocolo && (
                    <div className="rounded border border-line p-3">
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Direcionamento de protocolo</p>
                      <p className="font-medium">{json.direcionamento_protocolo.protocolo}</p>
                      {json.direcionamento_protocolo.motivo && (
                        <p className="text-muted-foreground">{json.direcionamento_protocolo.motivo}</p>
                      )}
                      {Array.isArray(json.direcionamento_protocolo.testes_recomendados) && json.direcionamento_protocolo.testes_recomendados.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Testes: {json.direcionamento_protocolo.testes_recomendados.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                  {Array.isArray(json?.red_yellow_flags) && json.red_yellow_flags.length > 0 && (
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Pontos de atenção</p>
                      <ul className="space-y-2">
                        {json.red_yellow_flags.map((flag: any, i: number) => (
                          <li key={i} className="rounded border border-line p-2">
                            <p className="font-medium">{flag.tipo || "atenção"} · {flag.sinal || "ponto observado"}</p>
                            {flag.conduta && <p className="text-muted-foreground">{flag.conduta}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(json?.prioridades_corretivas) && json.prioridades_corretivas.length > 0 && (
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Prioridades corretivas</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {json.prioridades_corretivas.map((p: string, i: number) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(json?.sequencia_bn_video) && json.sequencia_bn_video.length > 0 && (
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Sequência BN</p>
                      <ul className="space-y-2">
                        {json.sequencia_bn_video.map((item: any, i: number) => (
                          <li key={i} className="rounded border border-line p-2">
                            <p className="font-medium">
                              {item.movimento || "Movimento"}{item.score != null ? ` · ${item.score}/10` : ""}
                            </p>
                            {Array.isArray(item.achados) && item.achados.length > 0 && (
                              <p className="text-muted-foreground">{item.achados.join("; ")}</p>
                            )}
                            {item.cue_ou_teste && <p className="text-muted-foreground">{item.cue_ou_teste}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {json?.criterios_progressao_bn && (
                    <div className="rounded border border-line p-3">
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Progressão BN</p>
                      <p className="text-muted-foreground">
                        Pliometria: {json.criterios_progressao_bn.liberado_para_pliometria ? "liberada com critério" : "manter cautela"}
                      </p>
                      {json.criterios_progressao_bn.motivo && (
                        <p className="text-muted-foreground">{json.criterios_progressao_bn.motivo}</p>
                      )}
                    </div>
                  )}
                  {json?.composicao_corporal && (
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Composição corporal</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-line p-2">Peso: {json.composicao_corporal.peso_kg ?? "—"} kg</div>
                        <div className="rounded border border-line p-2">IMC: {json.composicao_corporal.imc ?? "—"}</div>
                        <div className="rounded border border-line p-2">Cintura: {json.composicao_corporal.cintura_cm ?? "—"} cm</div>
                        <div className="rounded border border-line p-2">Confiança: {json.composicao_corporal.confianca ?? "—"}</div>
                      </div>
                      {json.composicao_corporal.leitura_tecnica && (
                        <p className="mt-2 text-muted-foreground">{json.composicao_corporal.leitura_tecnica}</p>
                      )}
                    </div>
                  )}
                  {Array.isArray(json?.analise_tecnica_movimento) && json.analise_tecnica_movimento.length > 0 && (
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Análise técnica</p>
                      <ul className="space-y-2">
                        {json.analise_tecnica_movimento.map((item: any, i: number) => (
                          <li key={i} className="rounded border border-line p-2">
                            <p className="font-medium">{item.movimento || "Movimento"} · {item.achado || "achado técnico"}</p>
                            <p className="text-muted-foreground">{item.cue_ou_ajuste || item.impacto || "—"}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.report_text && (
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Relatório</p>
                      <p className="whitespace-pre-line text-muted-foreground">{result.report_text}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
