import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { applyTheme } from "@/contexts/ThemeContext";
import { formatPhone } from "@/lib/masks";
import {
  type AnamnesisStepId,
  buildAnamnesisStepIds,
  deriveTrainingAvailability,
  PRESCRIPTION_SERVICE_OPTIONS,
  resolvePrescriptionInterests,
  SUPPORTED_TRAINING_MODALITIES,
} from "@/lib/anamnesisOptions";

const EQUIPMENT_OPTIONS = [
  "Mini Bands (elástico curto fechado)", "Thera Bands (elástico grande aberto)",
  "Super Bands (elástico grande fechado)", "Medball - Wallball", "Barra Olímpica",
  "Polia alta/baixa", "Anilhas até 10kg", "Anilhas até 20kg",
  "Hack de Agachamento Livre", "Hack de Agachamento Guiado",
  "Halteres até 10kg", "Halteres até 20kg", "Halteres até 30kg ou +",
  "Banco Inclinação Ajustável", "Kettlebell até 10kg", "Kettlebell até 20kg",
  "Máquinas", "Caixote", "Step"
];

const SESSION_DURATION_OPTIONS = [
  "até 30 minutos", "de 30 a 45 minutos", "de 45 a 60 minutos", "60 minutos ou +"
];

const TRAINING_LOCATION_OPTIONS = [
  "Academia de Rede", "Academia do Prédio", "Em casa", "Box de Crossfit/Studio"
];

const SLEEP_OPTIONS = ["4h", "4h - 6h", "6h - 8h", "8h +"];
const COMMON_FOODS = ["Frango", "Ovos", "Carne", "Peixe", "Arroz", "Batata doce", "Pão", "Tapioca", "Aveia", "Feijão", "Macarrão", "Frutas", "Salada", "Legumes", "Iogurte", "Whey", "Queijo"];
const TRAIN_TIMES = ["Manhã cedo", "Manhã", "Almoço", "Tarde", "Fim de tarde", "Noite"];
const ACTIVITY_LEVEL_OPTIONS = [
  ["sedentario", "Sedentário"],
  ["leve", "Levemente ativo"],
  ["moderado", "Moderadamente ativo"],
  ["muito_ativo", "Muito ativo"],
  ["extremo", "Extremamente ativo"],
];
const OBJECTIVE_OPTIONS = [
  ["emagrecimento", "Emagrecimento"],
  ["hipertrofia", "Ganho de massa"],
  ["performance", "Performance esportiva"],
  ["saude", "Saúde e bem-estar"],
];

const STEP_COPY: Record<AnamnesisStepId, { title: string; kicker: string; description: string }> = {
  profile: { title: "Sobre você", kicker: "Início", description: "Contato, objetivo e o acompanhamento que você procura." },
  services: { title: "O que você procura", kicker: "Prescrição e orientação", description: "Escolha somente as modalidades em que deseja nosso acompanhamento." },
  experience: { title: "Experiência atual", kicker: "Seu ponto de partida", description: "Contexto físico e modalidades que já fazem parte da sua rotina." },
  schedule: { title: "Sua semana", kicker: "Rotina", description: "Organize os treinos de segunda a domingo em uma única resposta." },
  strength: { title: "Musculação", kicker: "Treino de força", description: "Tempo, local e equipamentos disponíveis para esta modalidade." },
  sports: { title: "Modalidades esportivas", kicker: "Esporte", description: "Corrida, natação e ciclismo, somente conforme suas escolhas." },
  health: { title: "Saúde e segurança", kicker: "Triagem", description: "Dores, lesões e condições que precisamos respeitar." },
  clinical: { title: "Triagem clínica", kicker: "Segurança", description: "Sinais de atenção e intensidade de dor antes de qualquer prescrição." },
  nutrition: { title: "Nutrição", kicker: "Orientação nutricional", description: "Hábitos e preferências para recomendações aplicáveis à sua rotina." },
  recovery: { title: "Rotina e recuperação", kicker: "Contexto", description: "Trabalho, sono e recuperação fora do treino." },
  finish: { title: "Objetivos e contato", kicker: "Finalização", description: "Expectativas e melhor momento para a nossa equipe falar com você." },
};

interface PublicAnamnesisProps {
  mode?: "student" | "pre-registration";
}

export default function PublicAnamnesis({ mode = "student" }: PublicAnamnesisProps) {
  const { studentId, slug } = useParams<{ studentId?: string; slug?: string }>();
  const isPreRegistration = mode === "pre-registration";
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const [studentName, setStudentName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [titleText, setTitleText] = useState("ANAMNESE");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [preferredContactPeriod, setPreferredContactPeriod] = useState("");
  const [deadlineMessage, setDeadlineMessage] = useState("");

  // Fields
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [objective, setObjective] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [experienceMonths, setExperienceMonths] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [desiredServices, setDesiredServices] = useState<string[]>([]);
  const [modalityOther, setModalityOther] = useState("");
  const [trainingDays, setTrainingDays] = useState("");
  const [sessionDuration, setSessionDuration] = useState("");
  const [trainingLocation, setTrainingLocation] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState("");
  const [goals, setGoals] = useState("");
  const [diseases, setDiseases] = useState("");
  const [injuries, setInjuries] = useState("");
  const [currentPain, setCurrentPain] = useState("");
  const [nutrition, setNutrition] = useState("");
  const [profession, setProfession] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [restorativeSleep, setRestorativeSleep] = useState("");
  const [awareOfTrilogy, setAwareOfTrilogy] = useState("");
  const [feelIn3Months, setFeelIn3Months] = useState("");
  const [biggestObstacle, setBiggestObstacle] = useState("");
  const [extraComments, setExtraComments] = useState("");
  const [commitsCommunication, setCommitsCommunication] = useState("");
  const [sportGoal, setSportGoal] = useState("");
  const [currentVolumeWeekly, setCurrentVolumeWeekly] = useState("");
  const [currentVolumeUnit, setCurrentVolumeUnit] = useState("km_week");
  const [fcmax, setFcmax] = useState("");
  const [fcrep, setFcrep] = useState("");
  const [perceivedRecovery, setPerceivedRecovery] = useState("");
  const [runWhere, setRunWhere] = useState("");
  const [runBestTime, setRunBestTime] = useState("");
  const [swimPool, setSwimPool] = useState("");
  const [swimPoolOther, setSwimPoolOther] = useState("");
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

  useEffect(() => {
    const init = async () => {
      if (isPreRegistration) {
        const { data, error } = await supabase.functions.invoke("public-registration", {
          body: { action: "context", slug: slug ?? null },
        });
        if (error || !data?.company) { setNotFound(true); return; }
        setCompanyId(data.company.id);
        setTitleText("PRÉ-CADASTRO");
        if (data.branding) {
          if (data.branding.logo_url) setLogoSrc(data.branding.logo_url);
          applyTheme(data.branding);
        }
        return;
      }
      if (!studentId) { setNotFound(true); return; }
      const { data, error } = await supabase.functions.invoke("public-anamnesis", {
        body: { action: "context", studentId },
      });
      if (error || !data?.student) { setNotFound(true); return; }
      setStudentName(data.student.full_name);
      if (data.student.gender) setGender(data.student.gender);
      if (data.student.weight_kg) setWeightKg(String(data.student.weight_kg));
      if (data.student.height_cm) setHeightCm(String(data.student.height_cm));
      if (data.student.birth_date) {
        const years = Math.floor((Date.now() - new Date(data.student.birth_date).getTime()) / 31557600000);
        if (Number.isFinite(years) && years > 0) setAge(String(years));
      }
      setCompanyId(null); // backend handles company scoping
      if (data.branding) {
        if (data.branding.logo_url) setLogoSrc(data.branding.logo_url);
        setTitleText(data.branding.platform_title || "ANAMNESE");
        applyTheme(data.branding);
      }
    };
    init();
  }, [isPreRegistration, slug, studentId]);

  const toggleArrayItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]);
  };
  const hasCsv = (field: string, value: string) =>
    field.split(",").map(s => s.trim()).filter(Boolean).includes(value);
  const toggleCsv = (field: string, value: string, setter: (v: string) => void) => {
    const current = field.split(",").map(s => s.trim()).filter(Boolean);
    const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
    setter(next.join(", "));
  };
  const { wantsStrength, wantsRunning, wantsSwimming, wantsCycling, wantsNutrition } =
    resolvePrescriptionInterests(desiredServices);
  const hasEndurance = wantsRunning || wantsSwimming || wantsCycling;
  const activeSteps = buildAnamnesisStepIds(desiredServices).map(id => ({ id, ...STEP_COPY[id] }));

  useEffect(() => {
    setStep(current => Math.min(current, activeSteps.length));
  }, [activeSteps.length]);

  const toggleCurrentModality = (item: string) => {
    if (item === "Nenhum") {
      setModalities(modalities.includes(item) ? [] : [item]);
      return;
    }
    const withoutNone = modalities.filter(current => current !== "Nenhum");
    setModalities(withoutNone.includes(item)
      ? withoutNone.filter(current => current !== item)
      : [...withoutNone, item]);
  };

  const getMissingFields = (targetStep: number) => {
    const targetStepId = activeSteps[targetStep - 1]?.id;
    if (targetStepId === "profile") {
      return [
        ...(isPreRegistration ? [
          [fullName.trim(), "nome completo"],
          [whatsapp.replace(/\D/g, "").length >= 10 ? whatsapp : "", "WhatsApp"],
        ] : []),
        [objective, "objetivo principal"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "services") {
      return [[desiredServices.length > 0 ? "ok" : "", "modalidades para prescrição ou orientação"]]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "experience") {
      return [
        [gender, "sexo"],
        [modalities.length > 0 ? "ok" : "", "modalidades praticadas atualmente"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "schedule") {
      return [[trainingDays.trim(), "semana de treinos"]]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "strength") {
      return [
        [sessionDuration, "tempo livre para as sessões"],
        [trainingLocation, "local da musculação"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "sports") {
      return [
        ...(!wantsStrength ? [[sessionDuration, "tempo livre para as sessões esportivas"]] : []),
        ...(wantsSwimming && swimPool === "outro"
          ? [[swimPoolOther.trim(), "descrição da piscina"]]
          : []),
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "health") {
      return [
        [goals, "metas com o treino"],
        [diseases, "doenças ou remédios contínuos"],
        [injuries, "histórico de lesões"],
        [currentPain, "dor atual"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "nutrition") {
      return [[nutrition, "alimentação"]]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "recovery") {
      return [
        [profession, "profissão e rotina"],
        [sleepHours, "horas de sono"],
        [restorativeSleep, "sono reparador"],
        [awareOfTrilogy, "consciência sobre alimentação, treino e sono"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "finish") return [
      [feelIn3Months, "como quer se sentir em 3 meses"],
      [biggestObstacle, "principal obstáculo"],
      [commitsCommunication, "compromisso de comunicação"],
      ...(isPreRegistration ? [
        [budgetRange, "investimento em saúde"],
        [preferredContactPeriod, "melhor horário para contato"],
      ] : []),
    ].filter(([value]) => !value).map(([, label]) => label);
    return [];
  };

  const validateStep = (targetStep: number) => {
    const missing = getMissingFields(targetStep);
    if (missing.length === 0) return true;
    toast({
      title: "Preencha os campos obrigatórios desta etapa",
      description: missing.join(", "),
      variant: "destructive",
    });
    return false;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep(current => Math.min(current + 1, activeSteps.length));
  };

  const handleSubmit = async () => {
    for (let targetStep = 1; targetStep <= activeSteps.length; targetStep += 1) {
      if (!validateStep(targetStep)) {
        setStep(targetStep);
        return;
      }
    }
    setSaving(true);

    const allModalities = [...modalities, ...(modalityOther ? [modalityOther] : [])];
    const allEquipment = [...equipment, ...(equipmentOther ? [equipmentOther] : [])];
    const availability = deriveTrainingAvailability(trainingDays);

    const answers = {
        age: age ? Number(age) : null,
        gender,
        weight_kg: weightKg ? Number(weightKg) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        body_fat_percent: bodyFatPercent ? Number(bodyFatPercent) : null,
        objective,
        activity_level: activityLevel,
        experience_months: experienceMonths ? Number(experienceMonths) : null,
        modalities: allModalities,
        requested_services: desiredServices,
        training_days: trainingDays,
        available_days: availability.totalDays,
        session_duration: sessionDuration,
        training_location: trainingLocation,
        available_equipment: allEquipment,
        days_available: availability.totalDays,
        days_strength: wantsStrength ? availability.strengthDays ?? availability.totalDays : null,
        days_cardio: hasEndurance ? availability.cardioDays ?? availability.totalDays : null,
        goals,
        diseases,
        injuries,
        current_pain: currentPain,
        nutrition,
        profession,
        sleep_hours: sleepHours,
        restorative_sleep: restorativeSleep === "sim",
        aware_of_trilogy: awareOfTrilogy === "sim",
        feel_in_3_months: feelIn3Months,
        biggest_obstacle: biggestObstacle,
        extra_comments: extraComments || null,
        commits_communication: commitsCommunication === "sim",
        interest_strength: wantsStrength,
        interest_running: wantsRunning,
        interest_swimming: wantsSwimming,
        interest_cycling: wantsCycling,
        interest_nutrition: wantsNutrition,
        sport_goal: sportGoal,
        current_volume_weekly: currentVolumeWeekly ? Number(currentVolumeWeekly) : null,
        current_volume_unit: currentVolumeUnit,
        fcmax: fcmax ? Number(fcmax) : null,
        fcrep: fcrep ? Number(fcrep) : null,
        perceived_recovery: perceivedRecovery,
        run_where: runWhere,
        run_best_time: runBestTime,
        swim_pool: swimPool === "outro" ? swimPoolOther.trim() : swimPool === "nao_sei" ? "Não sei" : swimPool,
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
    };

    const { data, error } = isPreRegistration
      ? await supabase.functions.invoke("public-registration", {
          body: {
            action: "pre-register",
            companyId,
            slug: slug ?? null,
            fullName,
            whatsapp,
            budgetRange,
            preferredContactPeriod,
            answers: {
              ...answers,
              budget_range: budgetRange,
              preferred_contact_period: preferredContactPeriod,
            },
          },
        })
      : await supabase.functions.invoke("public-anamnesis", {
          body: {
            action: "submit",
            studentId: studentId!,
            ...answers,
          },
        });

    setSaving(false);
    if (error || data?.error || (isPreRegistration && !data?.leadId)) {
      toast({
        title: isPreRegistration ? "Não foi possível enviar o pré-cadastro" : "Erro ao salvar anamnese",
        description: error?.message || data?.error || "Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    if (isPreRegistration) setDeadlineMessage(data.deadline || "Você vai ouvir da gente em breve.");
    setDone(true);
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <h2 className="text-2xl text-primary">LINK INDISPONÍVEL</h2>
            <p className="text-muted-foreground font-sans">
              {isPreRegistration
                ? "Este link de pré-cadastro não está disponível. Fale com a equipe para receber o endereço correto."
                : "O link de anamnese é inválido ou o aluno não existe."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    if (isPreRegistration) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-lg w-full rounded-2xl bg-card border-border text-center">
            <CardContent className="px-6 py-10 space-y-4">
              <CheckCircle className="h-16 w-16 text-primary mx-auto" />
              <h2 className="font-display text-3xl text-primary">PRÉ-CADASTRO RECEBIDO</h2>
              <p className="text-muted-foreground font-sans">
                Recebi sua aplicação, {fullName.trim().split(/\s+/)[0]}.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground font-sans">
                Analisamos cada perfil com atenção antes de responder. Recebemos bastante gente interessada em treinar com a gente e mantemos um número limitado de alunos por vez para garantir esse acompanhamento de perto.
              </p>
              <p className="rounded-xl bg-primary/10 px-4 py-3 font-sans font-semibold text-primary">
                {deadlineMessage}
              </p>
              <p className="text-sm text-muted-foreground font-sans">
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
            <h2 className="text-3xl text-primary">ANAMNESE ENVIADA!</h2>
            <p className="text-muted-foreground font-sans">
              Seus dados foram recebidos com sucesso. Obrigado por preencher!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = activeSteps[step - 1] ?? activeSteps[0];
  const progress = Math.round((step / activeSteps.length) * 100);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          {logoSrc ? (
            <img src={logoSrc} alt={titleText} className="h-16 mx-auto" />
          ) : (
            <div className="flex justify-center"><Logo size="lg" sublabel="Training App" /></div>
          )}
          <p className="text-eyebrow">{isPreRegistration ? "Aplicação para acompanhamento" : "Ficha de anamnese"}</p>
          <h1 className="font-display text-4xl text-primary">{titleText}</h1>
          {studentName && <p className="text-muted-foreground font-sans">Aluno: <strong className="text-foreground">{studentName}</strong></p>}
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-eyebrow">{currentStep.kicker}</p>
                <CardTitle className="font-display text-primary text-2xl">{currentStep.title}</CardTitle>
                <p className="text-sm text-muted-foreground font-sans">{currentStep.description}</p>
              </div>
              <div className="font-mono-data text-xs text-muted-foreground whitespace-nowrap">
                {step}/{activeSteps.length}
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {(["profile", "services", "experience", "schedule", "strength", "sports"] as AnamnesisStepId[]).includes(currentStep.id) && (
            <>
            {isPreRegistration && currentStep.id === "profile" && (
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div>
                  <h3 className="font-display text-lg text-primary">Seus dados de contato</h3>
                  <p className="mt-1 text-sm text-muted-foreground font-sans">
                    Nesta primeira etapa pedimos apenas nome e WhatsApp. Os dados fiscais ficam para depois.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Nome completo *</Label>
                    <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ex: Ana Silva" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">WhatsApp *</Label>
                    <Input value={whatsapp} onChange={e => setWhatsapp(formatPhone(e.target.value))} placeholder="Ex: (48) 99999-1234" inputMode="tel" />
                  </div>
                </div>
              </div>
            )}
            {(currentStep.id === "profile" || currentStep.id === "experience") && (
            <div className="space-y-4">
              <h3 className="font-display text-lg text-primary">
                {currentStep.id === "profile" ? "Seu objetivo" : "Experiência e contexto atual"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentStep.id === "profile" && (
                <>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="font-sans font-medium">Objetivo principal *</Label>
                  <select value={objective} onChange={e => setObjective(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    {OBJECTIVE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                </>
                )}
                {currentStep.id === "experience" && (
                <>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Idade</Label>
                  <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="Ex: 28" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Sexo *</Label>
                  <select value={gender} onChange={e => setGender(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Peso atual (kg)</Label>
                  <Input type="number" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="Ex: 70" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Altura (cm)</Label>
                  <Input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="Ex: 175" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">% gordura, se souber</Label>
                  <Input type="number" step="0.1" value={bodyFatPercent} onChange={e => setBodyFatPercent(e.target.value)} placeholder="Ex: 22 (opcional)" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Tempo de treino (meses)</Label>
                  <Input type="number" value={experienceMonths} onChange={e => setExperienceMonths(e.target.value)} placeholder="Ex: 12" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Nível de atividade atual</Label>
                  <select value={activityLevel} onChange={e => setActivityLevel(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    {ACTIVITY_LEVEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                </>
                )}
              </div>
            </div>
            )}

            {/* Modalities */}
            {currentStep.id === "experience" && (
            <div className="space-y-2">
              <Label className="font-sans font-medium">Quais modalidades você pratica atualmente? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_TRAINING_MODALITIES.map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm font-sans cursor-pointer">
                    <Checkbox checked={modalities.includes(m)} onCheckedChange={() => toggleCurrentModality(m)} />
                    {m}
                  </label>
                ))}
              </div>
              <Input placeholder="Ex: pilates" value={modalityOther} onChange={e => setModalityOther(e.target.value)} className="mt-1" />
            </div>
            )}

            {currentStep.id === "services" && (
            <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <Label className="font-sans font-medium">Quais modalidades você gostaria da nossa prescrição/orientação personalizada? *</Label>
              <p className="text-sm text-muted-foreground">Selecione ao menos uma opção. As próximas etapas mostrarão somente as perguntas necessárias.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PRESCRIPTION_SERVICE_OPTIONS.map(service => (
                  <label key={service.value} className="flex cursor-pointer items-center gap-2 text-sm font-sans">
                    <Checkbox
                      checked={desiredServices.includes(service.value)}
                      onCheckedChange={() => toggleArrayItem(desiredServices, service.value, setDesiredServices)}
                    />
                    {service.label}
                  </label>
                ))}
              </div>
            </div>
            )}

            {currentStep.id === "schedule" && (
            <div className="space-y-2">
              <Label className="font-sans font-medium">Como será a sua semana de treinos? Diga cada modalidade que você vai praticar de segunda a domingo. *</Label>
              <Textarea
                value={trainingDays}
                onChange={e => setTrainingDays(e.target.value)}
                placeholder="Ex: segunda — musculação; terça — corrida; quarta — musculação; quinta — descanso; sexta — musculação; sábado — corrida; domingo — descanso"
              />
            </div>
            )}

            {(currentStep.id === "strength" || (currentStep.id === "sports" && !wantsStrength)) && (
            <div className="space-y-2">
              <Label className="font-sans font-medium">
                {currentStep.id === "strength"
                  ? "Quanto tempo você tem para cada sessão de musculação/força? *"
                  : "Quanto tempo você tem para cada sessão esportiva? *"}
              </Label>
              <RadioGroup value={sessionDuration} onValueChange={setSessionDuration}>
                {SESSION_DURATION_OPTIONS.map(o => (
                  <div key={o} className="flex items-center gap-2">
                    <RadioGroupItem value={o} id={`sd-${o}`} />
                    <Label htmlFor={`sd-${o}`} className="font-sans font-normal cursor-pointer">{o}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            )}

            {currentStep.id === "strength" && (
            <>
            <div className="space-y-2">
              <Label className="font-sans font-medium">Onde você fará os treinos de musculação/força? *</Label>
              <RadioGroup value={trainingLocation} onValueChange={setTrainingLocation}>
                {TRAINING_LOCATION_OPTIONS.map(o => (
                  <div key={o} className="flex items-center gap-2">
                    <RadioGroupItem value={o} id={`tl-${o}`} />
                    <Label htmlFor={`tl-${o}`} className="font-sans font-normal cursor-pointer">{o}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Equipamentos disponíveis para musculação/força</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {EQUIPMENT_OPTIONS.map(e => (
                  <label key={e} className="flex items-center gap-2 text-sm font-sans cursor-pointer">
                    <Checkbox checked={equipment.includes(e)} onCheckedChange={() => toggleArrayItem(equipment, e, setEquipment)} />
                    {e}
                  </label>
                ))}
              </div>
              <Input placeholder="Ex: corda de pular" value={equipmentOther} onChange={e => setEquipmentOther(e.target.value)} className="mt-1" />
            </div>
            </>
            )}

            {currentStep.id === "sports" && (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <h3 className="font-display text-lg text-primary">Dados das modalidades escolhidas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="font-sans font-medium">Objetivo ou prova nas modalidades escolhidas</Label>
                    <Input value={sportGoal} onChange={e => setSportGoal(e.target.value)} placeholder="Ex: meia maratona, 5km, triathlon sprint..." />
                  </div>
                  {wantsRunning && (
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Volume atual da corrida</Label>
                    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
                      <Input type="number" min={0} step="0.1" value={currentVolumeWeekly} onChange={e => setCurrentVolumeWeekly(e.target.value)} placeholder="Ex: 25" />
                      <select value={currentVolumeUnit} onChange={e => setCurrentVolumeUnit(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="km_week">km/sem</option>
                        <option value="hours_week">h/sem</option>
                      </select>
                    </div>
                  </div>
                  )}
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Recuperação percebida hoje (0-10)</Label>
                    <Input type="number" min={0} max={10} value={perceivedRecovery} onChange={e => setPerceivedRecovery(e.target.value)} placeholder="Ex: 7" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">FC máxima, se souber</Label>
                    <Input type="number" value={fcmax} onChange={e => setFcmax(e.target.value)} placeholder="Ex: 190" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">FC repouso, se souber</Label>
                    <Input type="number" value={fcrep} onChange={e => setFcrep(e.target.value)} placeholder="Ex: 60" />
                  </div>
                  {wantsRunning && (
                    <>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Onde você pratica corrida?</Label>
                        <select value={runWhere} onChange={e => setRunWhere(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Selecione...</option>
                          <option value="rua">Rua/asfalto</option>
                          <option value="esteira">Esteira</option>
                          <option value="trilha">Trilha</option>
                          <option value="pista">Pista</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Melhor tempo recente na corrida</Label>
                        <Input value={runBestTime} onChange={e => setRunBestTime(e.target.value)} placeholder="ex: 10k em 52min" />
                      </div>
                    </>
                  )}
                  {wantsSwimming && (
                    <>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Em qual piscina você pratica natação?</Label>
                        <select value={swimPool} onChange={e => setSwimPool(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Selecione...</option>
                          <option value="25m">25m</option>
                          <option value="50m">50m</option>
                          <option value="nao">Sem acesso regular</option>
                          <option value="nao_sei">Não sei</option>
                          <option value="outro">Outro</option>
                        </select>
                        {swimPool === "outro" && (
                          <Input
                            value={swimPoolOther}
                            onChange={event => setSwimPoolOther(event.target.value)}
                            placeholder="Ex: piscina de 20 m"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Nível na natação</Label>
                        <select value={swimLevel} onChange={e => setSwimLevel(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Selecione...</option>
                          <option value="iniciante">Iniciante</option>
                          <option value="intermediario">Intermediário</option>
                          <option value="avancado">Avançado</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Volume de natação</Label>
                        <Input value={swimVolume} onChange={e => setSwimVolume(e.target.value)} placeholder="ex: 3000m/sem ou 2x40min" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Melhor tempo / pace recente</Label>
                        <Input value={swimBest} onChange={e => setSwimBest(e.target.value)} placeholder="ex: 400m em 8min, ou 100m em 1:50" />
                      </div>
                    </>
                  )}
                  {wantsCycling && (
                    <>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Qual tipo de bicicleta você usa no ciclismo?</Label>
                        <select value={bikeType} onChange={e => setBikeType(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Selecione...</option>
                          <option value="speed">Speed/estrada</option>
                          <option value="mtb">MTB</option>
                          <option value="indoor">Indoor/rolo</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Volume de bike</Label>
                        <Input value={bikeVolume} onChange={e => setBikeVolume(e.target.value)} placeholder="ex: 120km/sem" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">FTP ou potência média (W), se souber</Label>
                        <Input value={bikeFtp} onChange={e => setBikeFtp(e.target.value)} placeholder="ex: 220W" />
                      </div>
                      <label className="flex items-center gap-2 text-sm font-sans cursor-pointer sm:col-span-2">
                        <Checkbox checked={bikePower} onCheckedChange={v => setBikePower(!!v)} />
                        Tenho medidor de potência
                      </label>
                    </>
                  )}
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="font-sans font-medium">Como você se alimenta nos treinos ou provas longas destas modalidades?</Label>
                    <Input value={fuelingStrategy} onChange={e => setFuelingStrategy(e.target.value)} placeholder="ex: gel a cada 40min, isotônico, ou não uso nada" />
                  </div>
                </div>
              </div>
            )}
            </>
            )}

            {(["health", "clinical"] as AnamnesisStepId[]).includes(currentStep.id) && (
            <>
            {currentStep.id === "health" && (
            <>
            <div className="space-y-2">
              <Label className="font-sans font-medium">Quais as suas metas com o treino? *</Label>
              <Textarea value={goals} onChange={e => setGoals(e.target.value)} placeholder="Ex: ganhar massa, reduzir dores e correr 5 km" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Possui alguma doença e/ou toma algum remédio contínuo? *</Label>
              <Textarea value={diseases} onChange={e => setDiseases(e.target.value)} placeholder="Ex: não possuo; ou hipertensão controlada" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Histórico de lesões (se tiver): *</Label>
              <Textarea value={injuries} onChange={e => setInjuries(e.target.value)} placeholder="Ex: entorse no tornozelo em 2024; ou nenhuma" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Possui alguma dor atualmente? *</Label>
              <Textarea value={currentPain} onChange={e => setCurrentPain(e.target.value)} placeholder="Ex: dor no joelho ao agachar, intensidade 4/10; ou nenhuma" />
            </div>
            </>
            )}

            {currentStep.id === "clinical" && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <h3 className="font-display text-lg text-primary">Triagem clínica</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="font-sans font-medium">Condições médicas relevantes</Label>
                  <Textarea value={medicalConditions} onChange={e => setMedicalConditions(e.target.value)} placeholder="Ex: hipertensão, diabetes, asma..." />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="font-sans font-medium">Medicamentos</Label>
                  <Input value={medications} onChange={e => setMedications(e.target.value)} placeholder="Ex: losartana 50 mg; ou nenhum" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Estresse atual (0-10)</Label>
                  <Input type="number" min={0} max={10} value={stressScore} onChange={e => setStressScore(e.target.value)} placeholder="Ex: 6" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Qualidade do sono (0-10)</Label>
                  <Input type="number" min={0} max={10} value={sleepQuality} onChange={e => setSleepQuality(e.target.value)} placeholder="Ex: 7" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Problema cardíaco / pressão alta?</Label>
                  <select value={clinCardiac} onChange={e => setClinCardiac(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Dor no peito / tontura ao esforço?</Label>
                  <select value={clinChestPain} onChange={e => setClinChestPain(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Cirurgia nos últimos 6 meses?</Label>
                  <select value={clinSurgery} onChange={e => setClinSurgery(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                {clinSurgery === "sim" && (
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Qual / quando?</Label>
                    <Input value={clinSurgeryDetail} onChange={e => setClinSurgeryDetail(e.target.value)} placeholder="Ex: cirurgia no joelho em janeiro de 2026" />
                  </div>
                )}
                {gender === "F" && (
                  <>
                    <div className="space-y-2">
                      <Label className="font-sans font-medium">Gestação / pós-parto?</Label>
                      <select value={clinPregnant} onChange={e => setClinPregnant(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="na">Não se aplica</option>
                        <option value="gravida">Gestante</option>
                        <option value="posparto">Pós-parto recente</option>
                      </select>
                    </div>
                    {clinPregnant !== "na" && (
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Semanas / meses</Label>
                        <Input value={clinPregnantDetail} onChange={e => setClinPregnantDetail(e.target.value)} placeholder="Ex: 20 semanas; ou 3 meses pós-parto" />
                      </div>
                    )}
                  </>
                )}
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Fuma?</Label>
                  <select value={clinSmoke} onChange={e => setClinSmoke(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Doente / com febre agora?</Label>
                  <select value={clinAcute} onChange={e => setClinAcute(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="font-sans font-medium">Outra condição de saúde relevante?</Label>
                  <Textarea value={clinOther} onChange={e => setClinOther(e.target.value)} placeholder="Ex: enxaqueca recorrente; ou nenhuma" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans font-medium">Dor articular agora (0 = sem dor · 10 = dor máxima)</Label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    ["Tornozelo", evaTornozelo, setEvaTornozelo],
                    ["Joelho", evaJoelho, setEvaJoelho],
                    ["Quadril", evaQuadril, setEvaQuadril],
                    ["Lombar", evaLombar, setEvaLombar],
                    ["Ombro", evaOmbro, setEvaOmbro],
                  ].map(([label, value, setter]: any) => (
                    <div key={label}>
                      <Label className="block text-center text-[10px] text-muted-foreground">{label}</Label>
                      <Input type="number" min={0} max={10} value={value} onChange={e => setter(e.target.value)} className="px-1 text-center" placeholder="Ex: 0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}
            </>
            )}

            {(["nutrition", "recovery"] as AnamnesisStepId[]).includes(currentStep.id) && (
            <>
            {currentStep.id === "nutrition" && (
            <>
            <div className="space-y-2">
              <Label className="font-sans font-medium">Como é a sua alimentação? Faz acompanhamento com Nutricionista? *</Label>
              <Textarea value={nutrition} onChange={e => setNutrition(e.target.value)} placeholder="Ex: faço 4 refeições, como bem durante a semana e tenho mais dificuldade à noite" />
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <h3 className="font-display text-lg text-primary">Rotina alimentar e treino</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Refeições por dia</Label>
                  <select value={mealsPerDay} onChange={e => setMealsPerDay(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {["2", "3", "4", "5", "6", "7"].map(value => <option key={value} value={value}>{value}{value === "7" ? "+" : ""}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Seus horários são...</Label>
                  <select value={mealRoutine} onChange={e => setMealRoutine(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="fixa">Fixos no dia a dia</option>
                    <option value="varia">Variam um pouco</option>
                    <option value="muda">Mudam bastante</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">1ª refeição</Label>
                  <Input type="time" value={mealT1} onChange={e => setMealT1(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Almoço</Label>
                  <Input type="time" value={mealT2} onChange={e => setMealT2(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Última refeição</Label>
                  <Input type="time" value={mealT3} onChange={e => setMealT3(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Treina em jejum?</Label>
                  <select value={trainFasted} onChange={e => setTrainFasted(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="nunca">Nunca</option>
                    <option value="asvezes">Às vezes</option>
                    <option value="sempre">Sempre</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Fome ao acordar</Label>
                  <select value={appetiteWake} onChange={e => setAppetiteWake(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="faminto">Com bastante fome</option>
                    <option value="normal">Normal</option>
                    <option value="sem_fome">Sem fome</option>
                    <option value="enjoo">Enjoo / não como</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Orçamento alimentar</Label>
                  <select value={budgetFood} onChange={e => setBudgetFood(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="economico">Econômico</option>
                    <option value="moderado">Moderado</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="font-sans font-medium">Que horas costuma treinar?</Label>
                  <div className="flex flex-wrap gap-2">
                    {TRAIN_TIMES.map(time => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setTrainTime(trainTime === time ? "" : time)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          trainTime === time ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans font-medium">Alimentos que você curte</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_FOODS.map(food => (
                    <button
                      key={food}
                      type="button"
                      onClick={() => toggleCsv(foodLikes, food, setFoodLikes)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        hasCsv(foodLikes, food) ? "border-green-500 bg-green-50 text-green-700" : "border-border text-muted-foreground"
                      }`}
                    >
                      {food}
                    </button>
                  ))}
                </div>
                <Input value={foodLikes} onChange={e => setFoodLikes(e.target.value)} placeholder="Ex: banana, arroz, frango" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans font-medium">Alimentos que NÃO gosta / não come</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_FOODS.map(food => (
                    <button
                      key={food}
                      type="button"
                      onClick={() => toggleCsv(foodDislikes, food, setFoodDislikes)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        hasCsv(foodDislikes, food) ? "border-red-400 bg-red-50 text-red-600" : "border-border text-muted-foreground"
                      }`}
                    >
                      {food}
                    </button>
                  ))}
                </div>
                <Input value={foodDislikes} onChange={e => setFoodDislikes(e.target.value)} placeholder="Ex: peixe, abacate" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="font-sans font-medium">Restrições / alergias / dieta</Label>
                  <Textarea value={foodRestrictions} onChange={e => setFoodRestrictions(e.target.value)} placeholder="Ex: intolerância à lactose; ou nenhuma" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Água por dia (litros)</Label>
                  <Input value={hydration} onChange={e => setHydration(e.target.value)} placeholder="Ex: 2,5 L por dia" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Desconfortos digestivos (opcional)</Label>
                  <Input value={giSensitivities} onChange={e => setGiSensitivities(e.target.value)} placeholder="Ex: refluxo após o jantar; ou nenhum" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Suplementos que usa</Label>
                  <Input value={supplements} onChange={e => setSupplements(e.target.value)} placeholder="Ex: whey e creatina; ou nenhum" />
                </div>
                <label className="flex items-center gap-2 text-sm font-sans cursor-pointer self-end">
                  <Checkbox checked={hasKitchen} onCheckedChange={v => setHasKitchen(!!v)} />
                  Tenho acesso a cozinha / micro-ondas
                </label>
              </div>
            </div>
            </>
            )}

            {currentStep.id === "recovery" && (
            <>
            <div className="space-y-2">
              <Label className="font-sans font-medium">Qual a sua profissão e rotina de trabalho? *</Label>
              <Textarea value={profession} onChange={e => setProfession(e.target.value)} placeholder="Ex: trabalho em escritório, sentado das 9h às 18h" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Quantas horas você costuma dormir por noite? *</Label>
              <RadioGroup value={sleepHours} onValueChange={setSleepHours}>
                {SLEEP_OPTIONS.map(o => (
                  <div key={o} className="flex items-center gap-2">
                    <RadioGroupItem value={o} id={`sl-${o}`} />
                    <Label htmlFor={`sl-${o}`} className="font-sans font-normal cursor-pointer">{o}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Seu sono é reparador? *</Label>
              <RadioGroup value={restorativeSleep} onValueChange={setRestorativeSleep}>
                <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="rs-sim" /><Label htmlFor="rs-sim" className="font-sans font-normal cursor-pointer">Sim</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="rs-nao" /><Label htmlFor="rs-nao" className="font-sans font-normal cursor-pointer">Não</Label></div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Você tem consciência de que precisa ter alimentação + treino + sono alinhados para atingir os resultados? *</Label>
              <RadioGroup value={awareOfTrilogy} onValueChange={setAwareOfTrilogy}>
                <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="at-sim" /><Label htmlFor="at-sim" className="font-sans font-normal cursor-pointer">Sim</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="at-nao" /><Label htmlFor="at-nao" className="font-sans font-normal cursor-pointer">Não</Label></div>
              </RadioGroup>
            </div>
            </>
            )}
            </>
            )}

            {currentStep.id === "finish" && (
            <>
            {isPreRegistration && (
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div>
                  <h3 className="font-display text-lg text-primary">Preferências para o atendimento</h3>
                  <p className="mt-1 text-sm text-muted-foreground font-sans">
                    Estas respostas ajudam a equipe a organizar a prioridade e falar com você no melhor momento.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Quanto você está disposto(a) a investir na sua saúde? *</Label>
                    <select value={budgetRange} onChange={e => setBudgetRange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Selecione...</option>
                      <option value="200_300">R$ 200 a R$ 300</option>
                      <option value="300_400">R$ 300 a R$ 400</option>
                      <option value="400_500">R$ 400 a R$ 500</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Melhor horário para contato *</Label>
                    <select value={preferredContactPeriod} onChange={e => setPreferredContactPeriod(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Selecione...</option>
                      <option value="morning">Manhã</option>
                      <option value="afternoon">Tarde</option>
                      <option value="evening">Noite</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-sans font-medium">Como você quer se sentir em 3 meses? *</Label>
              <Textarea value={feelIn3Months} onChange={e => setFeelIn3Months(e.target.value)} placeholder="Ex: mais forte, disposto e sem medo de correr" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">O que mais atrapalha a sua rotina de treino? *</Label>
              <Textarea value={biggestObstacle} onChange={e => setBiggestObstacle(e.target.value)} placeholder="Ex: falta de tempo e dificuldade para manter constância" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Comentários extras</Label>
              <Textarea value={extraComments} onChange={e => setExtraComments(e.target.value)} placeholder="Ex: prefiro treinos pela manhã e tenho uma prova em outubro" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Você se compromete a comunicar qualquer alteração na sua saúde, rotina ou treino? *</Label>
              <RadioGroup value={commitsCommunication} onValueChange={setCommitsCommunication}>
                <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="cc-sim" /><Label htmlFor="cc-sim" className="font-sans font-normal cursor-pointer">Sim</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="cc-nao" /><Label htmlFor="cc-nao" className="font-sans font-normal cursor-pointer">Não</Label></div>
              </RadioGroup>
            </div>
            </>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="sm:w-36"
                  onClick={() => setStep(current => Math.max(current - 1, 1))}
                  disabled={saving}
                >
                  Voltar
                </Button>
              )}
              {step < activeSteps.length ? (
                <Button type="button" className="flex-1" onClick={goNext} disabled={saving}>
                  Avançar
                </Button>
              ) : (
                <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
                  {saving ? "Salvando..." : isPreRegistration ? "Enviar pré-cadastro" : "Finalizar Anamnese"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
