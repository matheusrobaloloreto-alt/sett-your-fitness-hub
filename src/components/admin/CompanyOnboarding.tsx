// Central de IA (white-label): questionário que molda a "IA-coração" ao professor/dono da unidade.
// Identidade e notas contextuais. Politicas executaveis de geracao usam parametros tipados.
import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from '@/components/ui/switch';
import AssessmentProtocolEditor from '@/lib/prescription/AssessmentProtocolEditor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { fetchCompanyAiConfig, saveCompanyAiConfig, type CompanyAiConfig } from "@/lib/companyAiConfig";

const EMPTY: CompanyAiConfig = {
  assistant_name: "", consultancy_name: "", methodology: "", plans_payment: "", tone: "",
  owner_credentials: "", niche_audience: "", exercise_preferences: "", progression_model: "",
  periodization_doctrine: "", strength_endurance_integration: "",
  assessment_protocol: "", red_lines: "", communication_style: "", nutrition_scope: "", ethical_limits: "",
  onboarding_completed: false,
};

export default function CompanyOnboarding() {
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const [form, setForm] = useState<CompanyAiConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canManageWhatsApp = role === 'admin' || role === 'master';
  const [whatsAppEnabled, setWhatsAppEnabled] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState('');

  useEffect(() => {
    let on = true;
    setLoading(true);
    setWhatsAppEnabled(false); setWhatsAppError('');
    fetchCompanyAiConfig(effectiveCompanyId).then(async (c) => {
      if (effectiveCompanyId && canManageWhatsApp) {
        const { data, error } = await supabase.from('company_ai_config').select('bnito_whatsapp_enabled').eq('company_id', effectiveCompanyId).maybeSingle();
        if (!on) return;
        if (error) setWhatsAppError('Nao foi possivel carregar a permissao do WhatsApp.');
        else setWhatsAppEnabled(data?.bnito_whatsapp_enabled === true);
      }
      // garante strings nos campos (evita null no input controlado)
      if (on) { setForm({ ...EMPTY, ...c }); setLoading(false); }
    }).catch(() => { if (on) { setWhatsAppError('Nao foi possivel carregar a configuracao.'); setLoading(false); } });
    return () => { on = false; };
  }, [effectiveCompanyId, canManageWhatsApp]);

  const set = (k: keyof CompanyAiConfig, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (complete: boolean) => {
    if (!effectiveCompanyId) { toast.error("Empresa não identificada"); return; }
    if (canManageWhatsApp && whatsAppError) { toast.error(whatsAppError); return; }
    const t = (v: string | null) => (typeof v === "string" ? v.trim() : "") || null;
    setSaving(true);
    const { error } = await saveCompanyAiConfig(effectiveCompanyId, {
      assistant_name: form.assistant_name?.trim() || "Assistente",
      consultancy_name: t(form.consultancy_name),
      tone: t(form.tone),
      owner_credentials: t(form.owner_credentials),
      niche_audience: t(form.niche_audience),
      methodology: t(form.methodology),
      exercise_preferences: t(form.exercise_preferences),
      progression_model: t(form.progression_model),
      periodization_doctrine: t(form.periodization_doctrine),
      strength_endurance_integration: t(form.strength_endurance_integration),
      assessment_protocol: t(form.assessment_protocol),
      communication_style: t(form.communication_style),
      red_lines: t(form.red_lines),
      nutrition_scope: t(form.nutrition_scope),
      ethical_limits: t(form.ethical_limits),
      plans_payment: t(form.plans_payment),
      onboarding_completed: complete,
      ...(canManageWhatsApp ? { bnito_whatsapp_enabled: whatsAppEnabled } : {}),
    });
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error });
    else {
      if (canManageWhatsApp) {
        const { data, error: readError } = await supabase.from('company_ai_config').select('bnito_whatsapp_enabled').eq('company_id', effectiveCompanyId).maybeSingle();
        if (readError || data?.bnito_whatsapp_enabled !== whatsAppEnabled) { toast.error('Nao foi possivel confirmar a permissao salva do WhatsApp.'); return; }
      }
      toast.success(complete ? "Configuração concluída!" : "Rascunho salvo");
    }
  };

  if (!effectiveCompanyId) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-2">
        <Sparkles className="h-6 w-6 text-primary mx-auto" />
        <h1 className="font-display text-2xl text-foreground">Selecione uma empresa</h1>
        <p className="text-sm text-muted-foreground">Entre no painel de uma empresa para configurar a IA dela.</p>
      </div>
    );
  }
  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  // Helpers de campo (funções que retornam JSX inline → não remontam, mantêm foco)
  const ta = (k: keyof CompanyAiConfig, label: string, placeholder: string, help?: string, minH = 90): ReactNode => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea style={{ minHeight: minH }} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );

  const section = (title: string, children: ReactNode): ReactNode => (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="font-mono-data text-sm uppercase tracking-wide text-primary">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <p className="text-eyebrow">Central de IA</p>
        <h1 className="font-display text-2xl text-foreground leading-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Molde sua IA assistente
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Identidade e contexto profissional da sua consultoria.
        </p>
      </div>

      {section("Identidade", <>
        <div className="space-y-1.5">
          <Label>Nome da sua consultoria</Label>
          <Input value={form.consultancy_name ?? ""} onChange={(e) => set("consultancy_name", e.target.value)} placeholder="Ex: BN Performance Training" />
        </div>
        <div className="space-y-1.5">
          <Label>Nome do seu assistente de IA</Label>
          <Input value={form.assistant_name ?? ""} onChange={(e) => set("assistant_name", e.target.value)} placeholder="Ex: Setty" />
          <p className="text-xs text-muted-foreground">Como o assistente se apresenta para você e seus alunos.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Tom de voz</Label>
          <Input value={form.tone ?? ""} onChange={(e) => set("tone", e.target.value)} placeholder="Ex: técnico e direto, mas acolhedor" />
        </div>
        {ta("owner_credentials", "Quem é você e qual sua formação?",
          "Ex: educador físico (CREF xxx), 12 anos com força e hipertrofia, pós em fisiologia. A IA fala como extensão do meu trabalho.",
          "A IA assume essa voz de especialista ao orientar o aluno — sem inventar credenciais.")}
      </>)}

      {section("Público & nicho", <>
        {ta("niche_audience", "Qual seu público e nicho principal?",
          "Ex: mulheres 30-50 querendo emagrecer e ganhar força; iniciantes/intermediários; foco estética + saúde.",
          "A IA adapta linguagem e prescrição a esse perfil.")}
      </>)}

      {section("Metodologia de prescrição", <>
        {ta("methodology", "Referencias de metodologia de treino",
          "Filosofia: básicos x isoladores, frequência, divisão (full body/ABC/push-pull), faixas de séries/reps por objetivo, descanso, cardio.",
          undefined, 130)}
        {ta("exercise_preferences", "Exercícios e padrões que você prefere (e os que evita)",
          "Ex: priorizo agachamento livre, terra, supino, remada; gosto de unilaterais; evito leg press pesado p/ joelho sensível.")}
        {ta("progression_model", "Como você faz a progressão de carga e evolução?",
          "Ex: progressão dupla (reps depois carga), +2,5-5% ao completar a faixa; deload a cada 6-8 semanas; uso RPE/RIR 1-3.")}
      </>)}

      {section("Periodização & integração entre modalidades", <>
        {ta("periodization_doctrine", "Notas de periodizacao",
          "Ex: base/força nas primeiras semanas → blocos ordinários reduzindo o volume da musculação e subindo o da modalidade; microciclos (ordinário/choque/regenerativo) e troca de estímulo (séries/reps/sistema) a cada 2 semanas; deload na semana 4/6.",
          undefined, 130)}
        {ta("strength_endurance_integration", "Notas de integracao entre modalidades",
          "Ex: quando o volume da modalidade sobe, reduzo o volume-load da musculação; nada de Z4/Z5 na véspera de perna pesada; deload sincronizado entre força e cardio.",
          undefined, 110)}
      </>)}

      {section("Avaliação & acompanhamento", <>
        {ta("assessment_protocol", "Como você avalia o aluno e acompanha a evolução?",
          "Ex: anamnese (histórico, lesões, sono, rotina), mobilidade, medidas/fotos, força em exercícios-chave; reavalio a cada 4-6 semanas.")}
        {canManageWhatsApp && <AssessmentProtocolEditor key={effectiveCompanyId} companyId={effectiveCompanyId} />}
      </>)}

      {section("Como a IA fala com o aluno", <>
        {canManageWhatsApp && <div className="flex items-center justify-between gap-4">
          <Label htmlFor="bnito-whatsapp-enabled">Assistente no WhatsApp</Label>
          <Switch id="bnito-whatsapp-enabled" checked={whatsAppEnabled} onCheckedChange={setWhatsAppEnabled} disabled={saving || !!whatsAppError} />
        </div>}
        {canManageWhatsApp && whatsAppError && <p role="alert" className="text-sm text-destructive">{whatsAppError}</p>}
        {ta("communication_style", "Regras de conversa no dia a dia",
          "Ex: respostas curtas no WhatsApp, sempre explicar o 'porquê' de forma simples, motivar sem pressionar, 1-2 dicas práticas por dúvida.")}
      </>)}

      {section("Segurança & limites", <>
        {ta("red_lines", "Linhas vermelhas e contraindicações (quando NÃO prescrever)",
          "Ex: dor aguda/lesão recente = não prescreve e encaminha; gestante só com liberação; cardiopata sem alta = encaminha.")}
        <div className="space-y-1.5">
          <Label>Até onde a IA vai em nutrição/suplementação?</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.nutrition_scope ?? ""}
            onChange={(e) => set("nutrition_scope", e.target.value)}
          >
            <option value="">Selecione…</option>
            <option value="orientacao_educativa">Orientação educativa geral (hábitos, hidratação)</option>
            <option value="sugestoes_basicas">Só sugestões básicas, sem dieta</option>
            <option value="encaminha_nutricionista">Não fala de nutrição — encaminha nutricionista</option>
          </select>
        </div>
        {ta("ethical_limits", "Limites éticos — o que a IA nunca deve fazer",
          "Ex: nunca recomendar anabolizantes/emagrecedores; não prometer resultado garantido; não diagnosticar; não substituir médico/fisio/nutri.")}
      </>)}

      {section("Planos & pagamento", <>
        {ta("plans_payment", "Como funcionam seus planos e pagamentos?",
          "Ex: trimestral/semestral/anual, valores, formas de pagamento, renovação, cancelamento, congelamento.",
          "A IA usa para responder dúvidas comerciais e direcionar ao plano certo.")}
      </>)}

      <div className="flex items-center justify-end gap-2 pb-8">
        <Button variant="ghost" onClick={() => save(false)} disabled={saving}>Salvar rascunho</Button>
        <Button onClick={() => save(true)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          Concluir configuração
        </Button>
      </div>
    </div>
  );
}
