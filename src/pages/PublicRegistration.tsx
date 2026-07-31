import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatCPF, formatCEP, formatPhone } from "@/lib/masks";
import { lookupCep, lookupCepByAddress } from "@/lib/cep";
import { applyTheme } from "@/contexts/ThemeContext";
import { SUPPORTED_TRAINING_MODALITIES } from "@/lib/anamnesisOptions";
import { paymentPath } from "@/lib/publicFlowLinks";

interface CompanyBranding {
  logo_url: string | null;
  platform_title: string;
  primary_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
}

const EQUIPMENT_OPTIONS = [
  "Mini Bands (elástico curto fechado)",
  "Thera Bands (elástico grande aberto)",
  "Super Bands (elástico grande fechado)",
  "Medball - Wallball",
  "Barra Olímpica",
  "Polia alta/baixa",
  "Anilhas até 10kg",
  "Anilhas até 20kg",
  "Hack de Agachamento Livre",
  "Hack de Agachamento Guiado",
  "Halteres até 10kg",
  "Halteres até 20kg",
  "Halteres até 30kg ou +",
  "Banco Inclinação Ajustável",
  "Kettlebell até 10kg",
  "Kettlebell até 20kg",
  "Máquinas",
  "Caixote",
  "Step",
];

const SESSION_DURATION_OPTIONS = [
  "até 30 minutos",
  "de 30 a 45 minutos",
  "de 45 a 60 minutos",
  "60 minutos ou +",
];

const TRAINING_LOCATION_OPTIONS = [
  "Academia de Rede",
  "Academia do Prédio",
  "Em casa",
  "Box de Crossfit/Studio",
];

const SLEEP_OPTIONS = ["4h", "4h - 6h", "6h - 8h", "8h +"];
const COMMON_FOODS = ["Frango", "Ovos", "Carne", "Peixe", "Arroz", "Batata doce", "Pão", "Tapioca", "Aveia", "Feijão", "Macarrão", "Frutas", "Salada", "Legumes", "Iogurte", "Whey", "Queijo"];
const TRAIN_TIMES = ["Manhã cedo", "Manhã", "Almoço", "Tarde", "Fim de tarde", "Noite"];

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
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("M");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [experienceMonths, setExperienceMonths] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [modalityOther, setModalityOther] = useState("");
  const [trainingDays, setTrainingDays] = useState("");
  const [availableDays, setAvailableDays] = useState("");
  const [daysStrength, setDaysStrength] = useState("");
  const [daysCardio, setDaysCardio] = useState("");
  const [sessionDuration, setSessionDuration] = useState("");
  const [trainingLocation, setTrainingLocation] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState("");
  const [goals, setGoals] = useState("");
  const [diseases, setDiseases] = useState("");
  const [injuries, setInjuries] = useState("");
  const [currentPain, setCurrentPain] = useState("");
  const [sportGoal, setSportGoal] = useState("");
  const [currentVolumeWeekly, setCurrentVolumeWeekly] = useState("");
  const [fcmax, setFcmax] = useState("");
  const [fcrep, setFcrep] = useState("");
  const [perceivedRecovery, setPerceivedRecovery] = useState("");
  const [runWhere, setRunWhere] = useState("");
  const [runBestTime, setRunBestTime] = useState("");
  const [swimPool, setSwimPool] = useState("");
  const [swimLevel, setSwimLevel] = useState("");
  const [swimVolume, setSwimVolume] = useState("");
  const [swimBest, setSwimBest] = useState("");
  const [bikeType, setBikeType] = useState("");
  const [bikeVolume, setBikeVolume] = useState("");
  const [bikeFtp, setBikeFtp] = useState("");
  const [bikePower, setBikePower] = useState(false);
  const [fuelingStrategy, setFuelingStrategy] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [stressScore, setStressScore] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [clinCardiac, setClinCardiac] = useState("nao");
  const [clinChestPain, setClinChestPain] = useState("nao");
  const [clinSurgery, setClinSurgery] = useState("nao");
  const [clinSurgeryDetail, setClinSurgeryDetail] = useState("");
  const [clinPregnant, setClinPregnant] = useState("na");
  const [clinPregnantDetail, setClinPregnantDetail] = useState("");
  const [clinSmoke, setClinSmoke] = useState("nao");
  const [clinAcute, setClinAcute] = useState("nao");
  const [clinOther, setClinOther] = useState("");
  const [evaTornozelo, setEvaTornozelo] = useState("0");
  const [evaJoelho, setEvaJoelho] = useState("0");
  const [evaQuadril, setEvaQuadril] = useState("0");
  const [evaLombar, setEvaLombar] = useState("0");
  const [evaOmbro, setEvaOmbro] = useState("0");
  const [nutrition, setNutrition] = useState("");
  const [profession, setProfession] = useState("");
  const [restorativeSleep, setRestorativeSleep] = useState("");
  const [awareOfTrilogy, setAwareOfTrilogy] = useState("");
  const [mealsPerDay, setMealsPerDay] = useState("5");
  const [mealT1, setMealT1] = useState("");
  const [mealT2, setMealT2] = useState("");
  const [mealT3, setMealT3] = useState("");
  const [mealRoutine, setMealRoutine] = useState("");
  const [trainTime, setTrainTime] = useState("");
  const [trainFasted, setTrainFasted] = useState("nunca");
  const [appetiteWake, setAppetiteWake] = useState("");
  const [foodLikes, setFoodLikes] = useState("");
  const [foodDislikes, setFoodDislikes] = useState("");
  const [foodRestrictions, setFoodRestrictions] = useState("");
  const [budgetFood, setBudgetFood] = useState("moderado");
  const [hasKitchen, setHasKitchen] = useState(true);
  const [supplements, setSupplements] = useState("");
  const [hydration, setHydration] = useState("");
  const [giSensitivities, setGiSensitivities] = useState("");
  const [feelIn3Months, setFeelIn3Months] = useState("");
  const [biggestObstacle, setBiggestObstacle] = useState("");
  const [extraComments, setExtraComments] = useState("");
  const [authorizesPlan, setAuthorizesPlan] = useState("");
  const [commitsCommunication, setCommitsCommunication] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [preferredContactPeriod, setPreferredContactPeriod] = useState("");

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
  const allModalities = [...modalities, ...(modalityOther.trim() ? [modalityOther.trim()] : [])];
  const allEquipment = [...equipment, ...(equipmentOther.trim() ? [equipmentOther.trim()] : [])];
  const hasEndurance = allModalities.some((modality) => /corrida|nata|bike|triathlon|ciclismo/i.test(modality));
  const doesStrength = allModalities.some((modality) => /muscula|funcional|crossfit/i.test(modality));

  const toggleArrayItem = (items: string[], item: string, setter: (value: string[]) => void) => {
    setter(items.includes(item) ? items.filter((current) => current !== item) : [...items, item]);
  };

  const hasCsv = (field: string, value: string) =>
    field.split(",").map((item) => item.trim()).filter(Boolean).includes(value);

  const toggleCsv = (field: string, value: string, setter: (value: string) => void) => {
    const current = field.split(",").map((item) => item.trim()).filter(Boolean);
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setter(next.join(", "));
  };

  const handleSubmit = async () => {
    if (!fiscalMode) {
      const missing: string[] = [];
      if (!fullName.trim()) missing.push("nome completo");
      if (whatsapp.replace(/\D/g, "").length < 10) missing.push("WhatsApp");
      if (!objective) missing.push("objetivo");
      if (!sessionDuration) missing.push("tempo por sessão");
      if (!trainingLocation) missing.push("local de treino");
      if (!goals.trim()) missing.push("metas");
      if (!diseases.trim()) missing.push("doenças/remédios");
      if (!injuries.trim()) missing.push("histórico de lesões");
      if (!currentPain.trim()) missing.push("dor atual");
      if (!nutrition.trim()) missing.push("alimentação");
      if (!profession.trim()) missing.push("profissão/rotina");
      if (!sleepHours) missing.push("sono");
      if (!restorativeSleep) missing.push("sono reparador");
      if (!awareOfTrilogy) missing.push("consciência treino/alimentação/sono");
      if (!feelIn3Months.trim()) missing.push("como quer se sentir em 3 meses");
      if (!biggestObstacle.trim()) missing.push("principal obstáculo");
      if (!authorizesPlan) missing.push("autorização do plano");
      if (!commitsCommunication) missing.push("compromisso de comunicação");
      if (!budgetRange) missing.push("faixa de investimento");
      if (!preferredContactPeriod) missing.push("horário para contato");
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
            age: age ? Number(age) : null,
            gender,
            weight_kg: weightKg ? Number(weightKg) : null,
            height_cm: heightCm ? Number(heightCm) : null,
            body_fat_percent: bodyFatPercent ? Number(bodyFatPercent) : null,
            objective,
            activity_level: activityLevel,
            experience_months: experienceMonths ? Number(experienceMonths) : null,
            modalities: allModalities,
            training_days: trainingDays,
            available_days: availableDays ? Number(availableDays) : null,
            days_strength: daysStrength ? Number(daysStrength) : null,
            days_cardio: daysCardio ? Number(daysCardio) : null,
            session_duration: sessionDuration,
            training_location: trainingLocation,
            available_equipment: allEquipment,
            goals,
            diseases,
            injuries,
            current_pain: currentPain,
            interest_strength: doesStrength,
            interest_running: allModalities.some((modality) => /corrida|triathlon/i.test(modality)),
            interest_swimming: allModalities.some((modality) => /nata|triathlon/i.test(modality)),
            interest_cycling: allModalities.some((modality) => /bike|ciclismo|triathlon/i.test(modality)),
            interest_nutrition: true,
            sport_goal: sportGoal,
            current_volume_weekly: currentVolumeWeekly ? Number(currentVolumeWeekly) : null,
            fcmax: fcmax ? Number(fcmax) : null,
            fcrep: fcrep ? Number(fcrep) : null,
            perceived_recovery: perceivedRecovery,
            run_where: runWhere,
            run_best_time: runBestTime,
            swim_pool: swimPool,
            swim_level: swimLevel,
            swim_volume: swimVolume,
            swim_best: swimBest,
            bike_type: bikeType,
            bike_volume: bikeVolume,
            bike_ftp: bikeFtp,
            bike_power: bikePower,
            fueling_strategy: fuelingStrategy,
            medical_conditions: medicalConditions,
            medications,
            stress_score: stressScore ? Number(stressScore) : null,
            sleep_quality: sleepQuality ? Number(sleepQuality) : null,
            sleep_hours: sleepHours,
            clin_cardiac: clinCardiac,
            clin_chest_pain: clinChestPain,
            clin_surgery: clinSurgery,
            clin_surgery_detail: clinSurgeryDetail,
            clin_pregnant: clinPregnant,
            clin_pregnant_detail: clinPregnantDetail,
            clin_smoke: clinSmoke,
            clin_acute: clinAcute,
            clin_other: clinOther,
            eva_tornozelo: evaTornozelo,
            eva_joelho: evaJoelho,
            eva_quadril: evaQuadril,
            eva_lombar: evaLombar,
            eva_ombro: evaOmbro,
            nutrition,
            profession,
            restorative_sleep: restorativeSleep === "sim",
            aware_of_trilogy: awareOfTrilogy === "sim",
            meals_per_day: mealsPerDay ? Number(mealsPerDay) : null,
            meal_t1: mealT1,
            meal_t2: mealT2,
            meal_t3: mealT3,
            meal_routine: mealRoutine,
            train_time: trainTime,
            train_fasted: trainFasted,
            appetite_wake: appetiteWake,
            food_likes: foodLikes,
            food_dislikes: foodDislikes,
            food_restrictions: foodRestrictions,
            budget_food: budgetFood,
            has_kitchen: hasKitchen,
            supplements,
            hydration,
            gi_sensitivities: giSensitivities,
            feel_in_3_months: feelIn3Months,
            biggest_obstacle: biggestObstacle,
            extra_comments: extraComments,
            authorizes_plan: authorizesPlan === "sim",
            commits_communication: commitsCommunication === "sim",
            budget_range: budgetRange,
            preferred_contact_period: preferredContactPeriod,
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
              <Button className="w-full" onClick={() => navigate(paymentPath(paymentToken))}>
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

                <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                  <div>
                    <p className="text-eyebrow">Base da prescrição</p>
                    <h2 className="font-display text-xl text-primary">Dados, objetivo e rotina</h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Idade</Label>
                      <Input type="number" value={age} onChange={e => setAge(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Sexo</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Feminino</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Peso atual (kg)</Label>
                      <Input type="number" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Altura (cm)</Label>
                      <Input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">% gordura, se souber</Label>
                      <Input type="number" step="0.1" value={bodyFatPercent} onChange={e => setBodyFatPercent(e.target.value)} placeholder="opcional" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Tempo de treino (meses)</Label>
                      <Input type="number" value={experienceMonths} onChange={e => setExperienceMonths(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Objetivo principal *</Label>
                      <Select value={objective} onValueChange={setObjective}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                          <SelectItem value="hipertrofia">Ganho de massa</SelectItem>
                          <SelectItem value="performance">Performance esportiva</SelectItem>
                          <SelectItem value="saude">Saúde e bem-estar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Nível de atividade atual</Label>
                      <Select value={activityLevel} onValueChange={setActivityLevel}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sedentario">Sedentário</SelectItem>
                          <SelectItem value="leve">Levemente ativo</SelectItem>
                          <SelectItem value="moderado">Moderadamente ativo</SelectItem>
                          <SelectItem value="muito_ativo">Muito ativo</SelectItem>
                          <SelectItem value="extremo">Extremamente ativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Quais modalidades você pratica ou quer receber no app?</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SUPPORTED_TRAINING_MODALITIES.map((modality) => (
                        <label key={modality} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                          <Checkbox checked={modalities.includes(modality)} onCheckedChange={() => toggleArrayItem(modalities, modality, setModalities)} />
                          {modality}
                        </label>
                      ))}
                    </div>
                    <Input value={modalityOther} onChange={e => setModalityOther(e.target.value)} placeholder="Outro esporte ou modalidade..." className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Quais dias da semana você pratica cada modalidade?</Label>
                    <Textarea value={trainingDays} onChange={e => setTrainingDays(e.target.value)} placeholder="Ex: musculação seg/qua/sex; corrida ter/sáb" className="rounded-xl" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Quantos dias por semana você tem para treinar?</Label>
                      <Input type="number" min={0} max={7} value={availableDays} onChange={e => setAvailableDays(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Quanto tempo livre para as sessões? *</Label>
                      <Select value={sessionDuration} onValueChange={setSessionDuration}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{SESSION_DURATION_OPTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {doesStrength && hasEndurance && (
                      <>
                        <div className="space-y-2">
                          <Label className="font-sans">Dias de musculação / força</Label>
                          <Input type="number" min={0} max={7} value={daysStrength} onChange={e => setDaysStrength(e.target.value)} placeholder="ex: 3" />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-sans">Dias de cardio</Label>
                          <Input type="number" min={0} max={7} value={daysCardio} onChange={e => setDaysCardio(e.target.value)} placeholder="ex: 3" />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Onde você treina? *</Label>
                    <Select value={trainingLocation} onValueChange={setTrainingLocation}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{TRAINING_LOCATION_OPTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Materiais disponíveis</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {EQUIPMENT_OPTIONS.map((item) => (
                        <label key={item} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                          <Checkbox checked={equipment.includes(item)} onCheckedChange={() => toggleArrayItem(equipment, item, setEquipment)} />
                          {item}
                        </label>
                      ))}
                    </div>
                    <Input value={equipmentOther} onChange={e => setEquipmentOther(e.target.value)} placeholder="Outro material..." className="rounded-xl" />
                  </div>
                </section>

                {hasEndurance && (
                  <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                    <div>
                      <p className="text-eyebrow">Cardio</p>
                      <h2 className="font-display text-xl text-primary">Corrida, natação, bike ou triathlon</h2>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="font-sans">Objetivo / prova</Label>
                        <Input value={sportGoal} onChange={e => setSportGoal(e.target.value)} placeholder="Ex: meia maratona, 5km, triathlon sprint..." />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Volume atual (km ou h/sem)</Label>
                        <Input type="number" value={currentVolumeWeekly} onChange={e => setCurrentVolumeWeekly(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Recuperação percebida hoje (0-10)</Label>
                        <Input type="number" min={0} max={10} value={perceivedRecovery} onChange={e => setPerceivedRecovery(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">FC máxima, se souber</Label>
                        <Input type="number" value={fcmax} onChange={e => setFcmax(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">FC repouso, se souber</Label>
                        <Input type="number" value={fcrep} onChange={e => setFcrep(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Onde corre?</Label>
                        <Select value={runWhere} onValueChange={setRunWhere}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Se pratica corrida" /></SelectTrigger>
                          <SelectContent><SelectItem value="rua">Rua/asfalto</SelectItem><SelectItem value="esteira">Esteira</SelectItem><SelectItem value="trilha">Trilha</SelectItem><SelectItem value="pista">Pista</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Melhor tempo recente</Label>
                        <Input value={runBestTime} onChange={e => setRunBestTime(e.target.value)} placeholder="ex: 10k em 52min" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Piscina</Label>
                        <Select value={swimPool} onValueChange={setSwimPool}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Se pratica natação" /></SelectTrigger>
                          <SelectContent><SelectItem value="25m">25m</SelectItem><SelectItem value="50m">50m</SelectItem><SelectItem value="nao">Sem acesso regular</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Nível na natação</Label>
                        <Select value={swimLevel} onValueChange={setSwimLevel}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Se pratica natação" /></SelectTrigger>
                          <SelectContent><SelectItem value="iniciante">Iniciante</SelectItem><SelectItem value="intermediario">Intermediário</SelectItem><SelectItem value="avancado">Avançado</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Volume de natação</Label>
                        <Input value={swimVolume} onChange={e => setSwimVolume(e.target.value)} placeholder="ex: 3000m/sem" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Melhor tempo / pace na água</Label>
                        <Input value={swimBest} onChange={e => setSwimBest(e.target.value)} placeholder="ex: 400m em 8min" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Tipo de bike</Label>
                        <Select value={bikeType} onValueChange={setBikeType}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Se pratica bike" /></SelectTrigger>
                          <SelectContent><SelectItem value="speed">Speed/estrada</SelectItem><SelectItem value="mtb">MTB</SelectItem><SelectItem value="indoor">Indoor/rolo</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Volume de bike</Label>
                        <Input value={bikeVolume} onChange={e => setBikeVolume(e.target.value)} placeholder="ex: 120km/sem" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">FTP ou potência média, se souber</Label>
                        <Input value={bikeFtp} onChange={e => setBikeFtp(e.target.value)} placeholder="ex: 220W" />
                      </div>
                      <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                        <Checkbox checked={bikePower} onCheckedChange={value => setBikePower(!!value)} />
                        Tenho medidor de potência
                      </label>
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="font-sans">Como você se alimenta em treinos/provas longas?</Label>
                        <Input value={fuelingStrategy} onChange={e => setFuelingStrategy(e.target.value)} placeholder="ex: gel a cada 40min, isotônico, ou não uso nada" />
                      </div>
                    </div>
                  </section>
                )}

                <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                  <div>
                    <p className="text-eyebrow">Segurança</p>
                    <h2 className="font-display text-xl text-primary">Saúde, dores e triagem</h2>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Quais são suas metas com o treino? *</Label>
                    <Textarea value={goals} onChange={e => setGoals(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Possui alguma doença e/ou toma algum remédio contínuo? *</Label>
                    <Textarea value={diseases} onChange={e => setDiseases(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Histórico de lesões *</Label>
                    <Textarea value={injuries} onChange={e => setInjuries(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Possui alguma dor atualmente? *</Label>
                    <Textarea value={currentPain} onChange={e => setCurrentPain(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="font-sans">Condições médicas relevantes</Label>
                      <Textarea value={medicalConditions} onChange={e => setMedicalConditions(e.target.value)} className="rounded-xl" placeholder="opcional" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="font-sans">Medicamentos</Label>
                      <Input value={medications} onChange={e => setMedications(e.target.value)} placeholder="opcional" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Estresse (0-10)</Label>
                      <Input type="number" min={0} max={10} value={stressScore} onChange={e => setStressScore(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Qualidade do sono (0-10)</Label>
                      <Input type="number" min={0} max={10} value={sleepQuality} onChange={e => setSleepQuality(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Horas de sono *</Label>
                      <Select value={sleepHours} onValueChange={setSleepHours}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{SLEEP_OPTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Sono reparador? *</Label>
                      <Select value={restorativeSleep} onValueChange={setRestorativeSleep}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Problema cardíaco / pressão alta?</Label>
                      <Select value={clinCardiac} onValueChange={setClinCardiac}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Dor no peito / tontura ao se esforçar?</Label>
                      <Select value={clinChestPain} onValueChange={setClinChestPain}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Cirurgia nos últimos 6 meses?</Label>
                      <Select value={clinSurgery} onValueChange={setClinSurgery}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent></Select>
                    </div>
                    {clinSurgery === "sim" && (
                      <div className="space-y-2">
                        <Label className="font-sans">Qual / quando?</Label>
                        <Input value={clinSurgeryDetail} onChange={e => setClinSurgeryDetail(e.target.value)} />
                      </div>
                    )}
                    {gender === "F" && (
                      <div className="space-y-2">
                        <Label className="font-sans">Gestação / pós-parto?</Label>
                        <Select value={clinPregnant} onValueChange={setClinPregnant}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="na">Não se aplica</SelectItem><SelectItem value="gravida">Gestante</SelectItem><SelectItem value="posparto">Pós-parto recente</SelectItem></SelectContent></Select>
                      </div>
                    )}
                    {gender === "F" && clinPregnant !== "na" && (
                      <div className="space-y-2">
                        <Label className="font-sans">Semanas gestação / meses pós-parto</Label>
                        <Input value={clinPregnantDetail} onChange={e => setClinPregnantDetail(e.target.value)} />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="font-sans">Fuma?</Label>
                      <Select value={clinSmoke} onValueChange={setClinSmoke}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Doente / com febre agora?</Label>
                      <Select value={clinAcute} onValueChange={setClinAcute}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-5">
                    {[
                      ["Tornozelo", evaTornozelo, setEvaTornozelo],
                      ["Joelho", evaJoelho, setEvaJoelho],
                      ["Quadril", evaQuadril, setEvaQuadril],
                      ["Lombar", evaLombar, setEvaLombar],
                      ["Ombro", evaOmbro, setEvaOmbro],
                    ].map(([label, value, setter]) => (
                      <div className="space-y-1" key={label as string}>
                        <Label className="text-xs">{label} EVA</Label>
                        <Input type="number" min={0} max={10} value={value as string} onChange={e => (setter as (next: string) => void)(e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Outra condição de saúde relevante?</Label>
                    <Textarea value={clinOther} onChange={e => setClinOther(e.target.value)} className="rounded-xl" placeholder="opcional" />
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                  <div>
                    <p className="text-eyebrow">Rotina</p>
                    <h2 className="font-display text-xl text-primary">Alimentação, recuperação e contexto</h2>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Como está sua alimentação hoje? *</Label>
                    <Textarea value={nutrition} onChange={e => setNutrition(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Profissão e rotina de trabalho/estudo *</Label>
                    <Textarea value={profession} onChange={e => setProfession(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Você tem consciência que resultado depende de alimentação, treino e sono? *</Label>
                    <Select value={awareOfTrilogy} onValueChange={setAwareOfTrilogy}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Refeições por dia</Label>
                      <Select value={mealsPerDay} onValueChange={setMealsPerDay}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["2","3","4","5","6","7"].map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Horários das refeições</Label>
                      <Select value={mealRoutine} onValueChange={setMealRoutine}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="fixa">Fixos</SelectItem><SelectItem value="varia">Variam um pouco</SelectItem><SelectItem value="muda">Mudam bastante</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">1ª refeição</Label>
                      <Input type="time" value={mealT1} onChange={e => setMealT1(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">2ª refeição</Label>
                      <Input type="time" value={mealT2} onChange={e => setMealT2(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">3ª refeição</Label>
                      <Input type="time" value={mealT3} onChange={e => setMealT3(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Treina em jejum?</Label>
                      <Select value={trainFasted} onValueChange={setTrainFasted}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nunca">Nunca</SelectItem><SelectItem value="asvezes">Às vezes</SelectItem><SelectItem value="sempre">Sempre</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Que horas você costuma treinar?</Label>
                    <div className="flex flex-wrap gap-2">
                      {TRAIN_TIMES.map(time => (
                        <Button key={time} type="button" variant={trainTime === time ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setTrainTime(trainTime === time ? "" : time)}>
                          {time}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Fome ao acordar</Label>
                    <Select value={appetiteWake} onValueChange={setAppetiteWake}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="faminto">Com bastante fome</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="sem_fome">Sem fome</SelectItem><SelectItem value="enjoo">Enjoo / não como</SelectItem></SelectContent></Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Alimentos que você curte</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_FOODS.map(food => (
                        <Button key={food} type="button" variant={hasCsv(foodLikes, food) ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => toggleCsv(foodLikes, food, setFoodLikes)}>
                          {food}
                        </Button>
                      ))}
                    </div>
                    <Input value={foodLikes} onChange={e => setFoodLikes(e.target.value)} placeholder="adicione outros, separados por vírgula" className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Alimentos que NÃO gosta / não come</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_FOODS.map(food => (
                        <Button key={food} type="button" variant={hasCsv(foodDislikes, food) ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => toggleCsv(foodDislikes, food, setFoodDislikes)}>
                          {food}
                        </Button>
                      ))}
                    </div>
                    <Input value={foodDislikes} onChange={e => setFoodDislikes(e.target.value)} placeholder="adicione outros, separados por vírgula" className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Restrições / alergias / dieta</Label>
                    <Textarea value={foodRestrictions} onChange={e => setFoodRestrictions(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Orçamento alimentar</Label>
                      <Select value={budgetFood} onValueChange={setBudgetFood}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="economico">Econômico</SelectItem><SelectItem value="moderado">Moderado</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Suplementos</Label>
                      <Input value={supplements} onChange={e => setSupplements(e.target.value)} placeholder="opcional" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <Checkbox checked={hasKitchen} onCheckedChange={value => setHasKitchen(!!value)} />
                    Tenho acesso a cozinha / micro-ondas
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Hidratação atual</Label>
                      <Input value={hydration} onChange={e => setHydration(e.target.value)} placeholder="ex: 2L/dia" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Desconfortos digestivos</Label>
                      <Input value={giSensitivities} onChange={e => setGiSensitivities(e.target.value)} placeholder="opcional" />
                    </div>
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                  <div>
                    <p className="text-eyebrow">Fechamento</p>
                    <h2 className="font-display text-xl text-primary">Compromisso e contato</h2>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Como você quer se sentir daqui 3 meses? *</Label>
                    <Textarea value={feelIn3Months} onChange={e => setFeelIn3Months(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans">Qual é o maior obstáculo hoje? *</Label>
                    <Textarea value={biggestObstacle} onChange={e => setBiggestObstacle(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans">Autoriza a equipe a montar seu plano? *</Label>
                      <Select value={authorizesPlan} onValueChange={setAuthorizesPlan}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Topa manter comunicação ativa com a equipe? *</Label>
                      <Select value={commitsCommunication} onValueChange={setCommitsCommunication}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent></Select>
                    </div>
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
                    <Textarea value={extraComments} onChange={e => setExtraComments(e.target.value)} placeholder="Opcional" className="rounded-xl" />
                  </div>
                </section>

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
