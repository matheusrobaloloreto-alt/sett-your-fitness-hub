import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatCPF, formatCEP, formatPhone } from "@/lib/masks";
import { lookupCep, lookupCepByAddress } from "@/lib/cep";
import { applyTheme } from "@/contexts/ThemeContext";

interface CompanyBranding {
  logo_url: string | null;
  platform_title: string;
  primary_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
}

export default function PublicRegistration() {
  const { slug, token } = useParams<{ slug?: string; token?: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [paymentMessageSent, setPaymentMessageSent] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [fiscalMode, setFiscalMode] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [deadlineMessage, setDeadlineMessage] = useState("");

  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [objective, setObjective] = useState("");
  const [painPresent, setPainPresent] = useState("no");
  const [painDetails, setPainDetails] = useState("");
  const [weeklyAvailability, setWeeklyAvailability] = useState("3");
  const [sessionDuration, setSessionDuration] = useState("60");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [sport, setSport] = useState("");
  const [sportFrequency, setSportFrequency] = useState("0");
  const [nutritionGoal, setNutritionGoal] = useState("");
  const [foodRestrictions, setFoodRestrictions] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [preferredContactPeriod, setPreferredContactPeriod] = useState("");
  const [notes, setNotes] = useState("");

  // CEP → endereço (e endereço → CEP) automático via ViaCEP
  const fillFromCep = async (cepValue: string) => {
    const r = await lookupCep(cepValue);
    if (!r) return;
    if (r.logradouro) setAddress(r.logradouro);
    if (r.bairro) setNeighborhood(r.bairro);
    if (r.cidade) setCity(r.cidade);
    if (r.uf) setState(r.uf);
  };
  const fillCepFromAddress = async () => {
    if (cep.replace(/\D/g, "").length === 8) return; // já tem CEP, não sobrescreve
    const r = await lookupCepByAddress(state, city, address);
    if (r?.cep) {
      setCep(formatCEP(r.cep));
      if (!neighborhood && r.bairro) setNeighborhood(r.bairro);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.functions.invoke("public-registration", {
        body: { action: "context", slug: slug ?? null, token: token ?? null },
      });
      if (error || !data?.company) {
        setNotFound(true);
        return;
      }
      setCompanyId(data.company.id);
      setFiscalMode(data.mode === "fiscal");
      if (data.student) {
        setFullName(data.student.full_name || "");
        setBirthDate(data.student.birth_date || "");
        setCpf(formatCPF(data.student.cpf || ""));
        setCep(formatCEP(data.student.cep || ""));
        setAddress(data.student.address || "");
        setAddressNumber(data.student.address_number || "");
        setNeighborhood(data.student.neighborhood || "");
        setCity(data.student.city || "");
        setState(data.student.state || "");
        setWhatsapp(formatPhone(data.student.whatsapp || data.student.phone || ""));
        setEmail(data.student.email || "");
      }
      if (data.branding) {
        setBranding(data.branding);
        applyTheme(data.branding);
      }
    };
    init();
  }, [slug, token]);

  const logoSrc = branding?.logo_url || null;
  const titleText = branding?.platform_title || "Set Training App";

  const handleSubmit = async () => {
    if (!fiscalMode) {
      const missing: string[] = [];
      if (!fullName.trim()) missing.push("nome completo");
      if (whatsapp.replace(/\D/g, "").length < 10) missing.push("WhatsApp");
      if (!objective) missing.push("objetivo");
      if (!experienceLevel) missing.push("experiência");
      if (!budgetRange) missing.push("faixa de investimento");
      if (!preferredContactPeriod) missing.push("horário para contato");
      if (painPresent === "yes" && !painDetails.trim()) missing.push("detalhes da dor");
      if (missing.length > 0) {
        toast({ title: "Complete seu pré-cadastro", description: `Preencha: ${missing.join(", ")}.`, variant: "destructive" });
        return;
      }
      if (!companyId) {
        toast({ title: "Erro ao identificar a empresa", description: "Recarregue a página e tente novamente.", variant: "destructive" });
        return;
      }
      setSaving(true);
      const { data, error } = await supabase.functions.invoke("public-registration", {
        body: {
          action: "pre-register",
          companyId,
          slug: slug ?? null,
          fullName,
          whatsapp,
          budgetRange,
          preferredContactPeriod,
          answers: {
            objective,
            pain_present: painPresent === "yes",
            pain_details: painPresent === "yes" ? painDetails : "",
            weekly_availability: Number(weeklyAvailability),
            session_duration_min: Number(sessionDuration),
            experience_level: experienceLevel,
            sport,
            sport_frequency: sport ? Number(sportFrequency) : 0,
            nutrition_goal: nutritionGoal,
            food_restrictions: foodRestrictions,
            preferred_training: sport ? "strength_and_sport" : "strength",
            notes,
          },
        },
      });
      setSaving(false);
      if (error || !data?.leadId) {
        toast({ title: "Não foi possível enviar", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
        return;
      }
      setDeadlineMessage(data.deadline || "Você vai ouvir da gente em breve.");
      setDone(true);
      return;
    }

    const missing: string[] = [];
    if (!fullName) missing.push("Nome Completo");
    if (!birthDate) missing.push("Data de Nascimento");
    if (!cpf) missing.push("CPF");
    if (!cep) missing.push("CEP");
    if (!address) missing.push("Rua");
    if (!addressNumber) missing.push("Número");
    if (!neighborhood) missing.push("Bairro");
    if (!city) missing.push("Cidade");
    if (!state) missing.push("Estado");
    if (!whatsapp) missing.push("WhatsApp");
    if (!email) missing.push("Email");

    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios", description: `Preencha: ${missing.join(", ")}`, variant: "destructive" });
      return;
    }
    if (!companyId) {
      toast({ title: "Erro ao identificar a empresa", description: "Recarregue a página e tente novamente.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const action = fiscalMode ? "complete" : "register";
    const { data, error } = await supabase.functions.invoke("public-registration", {
      body: {
        action,
        token: fiscalMode ? token : null,
        companyId,
        student: {
          ...(fiscalMode ? {} : { full_name: fullName }),
          birth_date: birthDate,
          email,
          phone: whatsapp,
          cpf: cpf.replace(/\D/g, ""),
          cep: cep.replace(/\D/g, ""),
          address,
          address_number: addressNumber,
          neighborhood,
          city,
          state,
          whatsapp: whatsapp.replace(/\D/g, ""),
          // selected_plan_id propositalmente omitido — pagamento é fluxo separado.
        },
      },
    });

    if (error || !data?.studentId || !data?.paymentToken) {
      setSaving(false);
      toast({ title: "Erro ao salvar cadastro", description: error?.message || data?.error || "Falha ao cadastrar", variant: "destructive" });
      return;
    }

    setSaving(false);
    setPaymentToken(data.paymentToken);
    setPaymentMessageSent(data.paymentMessageSent === true);
    setDone(true);
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <h2 className="text-2xl text-primary">LINK INDISPONÍVEL</h2>
            <p className="text-muted-foreground font-sans">
              Este link de cadastro é inválido ou expirou. Solicite um novo link à equipe.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    if (!fiscalMode) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-lg rounded-2xl border-border bg-card text-center shadow-sm">
            <CardContent className="space-y-4 px-6 py-10">
              <CheckCircle className="mx-auto h-14 w-14 text-primary" />
              <h2 className="font-display text-3xl text-primary">PRÉ-CADASTRO RECEBIDO</h2>
              <p className="font-sans text-muted-foreground">
                Recebi sua aplicação, {fullName.trim().split(/\s+/)[0]}.
              </p>
              <p className="font-sans text-sm leading-relaxed text-muted-foreground">
                Analisamos cada perfil com atenção antes de responder. Recebemos bastante gente interessada em treinar com a gente e mantemos um número limitado de alunos por vez para garantir esse acompanhamento de perto.
              </p>
              <p className="rounded-xl bg-primary/8 px-4 py-3 font-sans font-semibold text-primary">
                {deadlineMessage}
              </p>
              <p className="font-sans text-sm text-muted-foreground">
                Vamos usar esse contato para fazer sua Avaliação de Movimento e ajudar você a escolher o plano ideal para o seu objetivo. Já já a gente se fala.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-3xl text-primary">CADASTRO RECEBIDO!</h2>
            <p className="text-muted-foreground font-sans">
              Seus dados fiscais foram registrados. Agora escolha o plano e faça o pagamento
              com segurança pelo Asaas.
            </p>
            {paymentMessageSent && (
              <p className="text-xs text-muted-foreground font-sans">
                Também enviamos este link na sua conversa do WhatsApp.
              </p>
            )}
            {paymentToken && (
              <Button className="w-full" onClick={() => navigate(`/pagamento/${paymentToken}`)}>
                Escolher plano e pagar agora
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          {logoSrc ? (
            <img src={logoSrc} alt={titleText} className="h-16 mx-auto" />
          ) : (
            <div className="flex justify-center"><Logo size="lg" sublabel="Training App" /></div>
          )}
          <h1 className="text-4xl text-primary">
            {fiscalMode ? "CADASTRO FISCAL" : "PRÉ-CADASTRO"}
          </h1>
          <p className="text-sm text-muted-foreground font-sans">
            {fiscalMode
              ? "Complete os dados necessários para o cadastro no Asaas e emissão da nota fiscal."
              : "Conte um pouco sobre você. Leva poucos minutos e não pedimos dados fiscais nesta etapa."}
          </p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-xl">{fiscalMode ? "DADOS PESSOAIS" : "SUA APLICAÇÃO"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-sans">Nome Completo *</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Seu nome completo"
                readOnly={fiscalMode}
                className={fiscalMode ? "bg-muted/50" : undefined}
              />
              {fiscalMode && (
                <p className="text-xs text-muted-foreground">Nome já identificado pela equipe.</p>
              )}
            </div>
            {!fiscalMode && (
              <>
                <div className="space-y-2">
                  <Label className="font-sans">WhatsApp *</Label>
                  <Input value={whatsapp} onChange={e => setWhatsapp(formatPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Qual é seu principal objetivo? *</Label>
                  <Select value={objective} onValueChange={setObjective}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hypertrophy">Ganhar massa muscular</SelectItem>
                      <SelectItem value="fat_loss">Emagrecer</SelectItem>
                      <SelectItem value="performance">Melhorar performance</SelectItem>
                      <SelectItem value="health">Saúde e qualidade de vida</SelectItem>
                      <SelectItem value="return">Voltar a treinar com segurança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Sente alguma dor ou limitação hoje? *</Label>
                  <Select value={painPresent} onValueChange={setPainPresent}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="no">Não</SelectItem><SelectItem value="yes">Sim</SelectItem></SelectContent>
                  </Select>
                </div>
                {painPresent === "yes" && (
                  <div className="space-y-2">
                    <Label className="font-sans">Onde dói e em quais movimentos? *</Label>
                    <Textarea value={painDetails} onChange={e => setPainDetails(e.target.value)} placeholder="Descreva com suas palavras" className="min-h-24 rounded-xl" />
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-sans">Dias disponíveis por semana *</Label>
                    <Select value={weeklyAvailability} onValueChange={setWeeklyAvailability}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{[2, 3, 4, 5, 6].map(day => <SelectItem key={day} value={String(day)}>{day} dias</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Tempo por treino *</Label>
                    <Select value={sessionDuration} onValueChange={setSessionDuration}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="30">30 min</SelectItem><SelectItem value="45">45 min</SelectItem><SelectItem value="60">60 min</SelectItem><SelectItem value="75">75 min ou mais</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Sua experiência com treino *</Label>
                  <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent><SelectItem value="beginner">Estou começando</SelectItem><SelectItem value="returning">Já treinei e estou voltando</SelectItem><SelectItem value="intermediate">Treino regularmente</SelectItem><SelectItem value="advanced">Treino há anos</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Pratica corrida, ciclismo, natação ou outro esporte?</Label>
                  <Input value={sport} onChange={e => setSport(e.target.value)} placeholder="Deixe vazio se não pratica" className="rounded-xl" />
                </div>
                {sport.trim() && (
                  <div className="space-y-2">
                    <Label className="font-sans">Quantas vezes por semana?</Label>
                    <Select value={sportFrequency} onValueChange={setSportFrequency}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5, 6, 7].map(day => <SelectItem key={day} value={String(day)}>{day}x</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="font-sans">O que você quer melhorar na alimentação?</Label>
                  <Textarea value={nutritionGoal} onChange={e => setNutritionGoal(e.target.value)} placeholder="Rotina, energia, composição corporal..." className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Possui restrição alimentar?</Label>
                  <Input value={foodRestrictions} onChange={e => setFoodRestrictions(e.target.value)} placeholder="Alergias, intolerâncias ou preferências" className="rounded-xl" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-sans">Faixa de investimento mensal *</Label>
                    <Select value={budgetRange} onValueChange={setBudgetRange}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="200_300">R$ 200 a R$ 300</SelectItem><SelectItem value="300_400">R$ 300 a R$ 400</SelectItem><SelectItem value="400_500">R$ 400 a R$ 500</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Melhor horário para contato *</Label>
                    <Select value={preferredContactPeriod} onValueChange={setPreferredContactPeriod}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="morning">Manhã</SelectItem><SelectItem value="afternoon">Tarde</SelectItem><SelectItem value="evening">Noite</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Algo mais que devemos saber?</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" className="rounded-xl" />
                </div>
                <Button className="w-full rounded-xl" onClick={handleSubmit} disabled={saving}>
                  {saving ? "Enviando..." : "Enviar pré-cadastro"}
                </Button>
              </>
            )}
            {fiscalMode && <>
            <div className="space-y-2">
              <Label className="font-sans">Data de Nascimento *</Label>
              <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">CPF *</Label>
              <Input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">CEP *</Label>
              <Input value={cep} onChange={e => { const m = formatCEP(e.target.value); setCep(m); if (m.replace(/\D/g, "").length === 8) void fillFromCep(m); }} placeholder="00000-000" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Rua *</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} onBlur={fillCepFromAddress} placeholder="Nome da rua" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-sans">Número *</Label>
                <Input value={addressNumber} onChange={e => setAddressNumber(e.target.value)} placeholder="Nº" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Bairro *</Label>
                <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-sans">Cidade *</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} onBlur={fillCepFromAddress} placeholder="Cidade" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Estado *</Label>
                <Input value={state} onChange={e => setState(e.target.value)} onBlur={fillCepFromAddress} placeholder="UF" maxLength={2} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-sans">WhatsApp *</Label>
              <Input value={whatsapp} onChange={e => setWhatsapp(formatPhone(e.target.value))} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : "Concluir cadastro e seguir para pagamento"}
            </Button>
            </>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
