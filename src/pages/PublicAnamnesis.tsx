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
import { mealScheduleEntries, mealSchedulePayload } from "@/lib/mealSchedule";

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
  profile: { title: "Dados básicos", kicker: "Início", description: "Contato, informações comuns e o objetivo que deve orientar todo o plano." },
  experience: { title: "Modalidades atuais", kicker: "Seu ponto de partida", description: "Atividades que já fazem parte da sua rotina hoje." },
  services: { title: "O que você procura", kicker: "Prescrição e orientação", description: "Escolha somente as modalidades em que deseja nosso acompanhamento." },
  schedule: { title: "Sua semana", kicker: "Rotina", description: "Organize os treinos de segunda a domingo e conte a meta esportiva uma única vez." },
  strength: { title: "Musculação", kicker: "Treino de força", description: "Tempo, local e equipamentos disponíveis para esta modalidade." },
  running: { title: "Corrida", kicker: "Modalidade", description: "Volume, local e referências atuais somente da corrida." },
  swimming: { title: "Natação", kicker: "Modalidade", description: "Piscina, nível e referências atuais somente da natação." },
  cycling: { title: "Ciclismo", kicker: "Modalidade", description: "Bicicleta, volume e potência somente do ciclismo." },
  health: { title: "Saúde e segurança", kicker: "Triagem", description: "Dores, lesões e condições que precisamos respeitar." },
  clinical: { title: "Triagem clínica", kicker: "Segurança", description: "Sinais de atenção e intensidade de dor antes de qualquer prescrição." },
  nutrition: { title: "Nutrição", kicker: "Orientação nutricional", description: "Hábitos e preferências para recomendações aplicáveis à sua rotina." },
  recovery: { title: "Rotina e recuperação", kicker: "Contexto", description: "Trabalho, sono e como seu corpo está chegando para treinar." },
  finish: { title: "Objetivos e contato", kicker: "Finalização", description: "Expectativas e melhor momento para a nossa equipe falar com você." },
};

interface PublicAnamnesisProps {
  mode?: "student" | "pre-registration";
}

interface CustomAnamnesisField {
  id: string;
  label: string;
  field_type: string;
  options: string[];
  is_required: boolean;
}

export default function PublicAnamnesis({ mode = "student" }: PublicAnamnesisProps) {
  const { studentId, token, slug } = useParams<{ studentId?: string; token?: string; slug?: string }>();
  const accessKey = studentId || token;
  const isPreRegistration = mode === "pre-registration";
  const isInviteFlow = Boolean(token);
  const requestsContactPreferences = isPreRegistration || isInviteFlow;
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
  const [preferredContactChannel, setPreferredContactChannel] = useState("");
  const [preferredContactPeriod, setPreferredContactPeriod] = useState("");
  const [deadlineMessage, setDeadlineMessage] = useState("");
  const [customFields, setCustomFields] = useState<CustomAnamnesisField[]>([]);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | string[]>>({});

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
  const [enduranceSessionDuration, setEnduranceSessionDuration] = useState("");
  const [trainingLocation, setTrainingLocation] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState("");
  const [diseases, setDiseases] = useState("");
  const [injuries, setInjuries] = useState("");
  const [currentPain, setCurrentPain] = useState("");
  const [nutrition, setNutrition] = useState("");
  const [hasNutritionist, setHasNutritionist] = useState("");
  const [profession, setProfession] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [restorativeSleep, setRestorativeSleep] = useState("");
  const [awareOfTrilogy, setAwareOfTrilogy] = useState("");
  const [feelIn3Months, setFeelIn3Months] = useState("");
  const [biggestObstacle, setBiggestObstacle] = useState("");
  const [extraComments, setExtraComments] = useState("");
  const [commitsCommunication, setCommitsCommunication] = useState("");
  const [sportGoal, setSportGoal] = useState("");
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
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
  const [medications, setMedications] = useState("");
  const [clinCardiac, setClinCardiac] = useState("");
  const [clinChestPain, setClinChestPain] = useState("");
  const [clinSurgery, setClinSurgery] = useState("");
  const [clinSurgeryDetail, setClinSurgeryDetail] = useState("");
  const [clinPregnant, setClinPregnant] = useState("");
  const [clinPregnantDetail, setClinPregnantDetail] = useState("");
  const [clinSmoke, setClinSmoke] = useState("");
  const [clinAcute, setClinAcute] = useState("");
  const [clinOther, setClinOther] = useState("");
  const [evaTornozelo, setEvaTornozelo] = useState("");
  const [evaJoelho, setEvaJoelho] = useState("");
  const [evaQuadril, setEvaQuadril] = useState("");
  const [evaLombar, setEvaLombar] = useState("");
  const [evaOmbro, setEvaOmbro] = useState("");
  const [mealsPerDay, setMealsPerDay] = useState("5");
  const [mealTimes, setMealTimes] = useState<string[]>(() => Array(7).fill(""));
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
      if (!accessKey) { setNotFound(true); return; }
      const { data, error } = await supabase.functions.invoke("public-anamnesis", {
        body: { action: "context", accessKey },
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
      setCustomFields(Array.isArray(data.custom_fields) ? data.custom_fields : []);
      setCompanyId(null); // backend handles company scoping
      if (data.branding) {
        if (data.branding.logo_url) setLogoSrc(data.branding.logo_url);
        setTitleText(data.branding.platform_title || "ANAMNESE");
        applyTheme(data.branding);
      }
    };
    init();
  }, [accessKey, isPreRegistration, slug]);

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

  const validZeroToTen = (value: string) => {
    if (value.trim() === "") return "";
    const score = Number(value);
    return Number.isFinite(score) && score >= 0 && score <= 10 ? value : "";
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
        [gender, "sexo"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "services") {
      return [[desiredServices.length > 0 ? "ok" : "", "modalidades para prescrição ou orientação"]]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "experience") {
      return [
        [modalities.length > 0 ? "ok" : "", "modalidades praticadas atualmente"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "schedule") {
      return [
        [trainingDays.trim(), "semana de treinos"],
        ...(hasEndurance ? [
          [sportGoal.trim(), "meta nas modalidades esportivas"],
          [enduranceSessionDuration, "tempo disponível para cada sessão esportiva"],
          ...((raceName.trim() || raceDate) ? [
            [raceName.trim(), "nome da prova"],
            [raceDate, "data da prova"],
          ] : []),
        ] : []),
      ]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "strength") {
      return [
        [sessionDuration, "tempo livre para as sessões"],
        [trainingLocation, "local da musculação"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "running") {
      return [[runWhere, "local onde pratica corrida"]]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "swimming") {
      return [
        [swimPool, "piscina onde pratica natação"],
        [swimLevel, "nível atual na natação"],
        ...(swimPool === "outro" ? [[swimPoolOther.trim(), "descrição da piscina"]] : []),
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "cycling") {
      return [[bikeType, "tipo de bicicleta"]]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "health") {
      return [
        [diseases, "condições médicas relevantes"],
        [medications, "medicamentos de uso contínuo"],
        [injuries, "histórico de lesões"],
        [currentPain, "dor atual"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "clinical") {
      return [
        [clinCardiac, "problema cardíaco ou pressão alta"],
        [clinChestPain, "dor no peito ou tontura ao esforço"],
        [clinSurgery, "cirurgia recente"],
        ...(clinSurgery === "sim" ? [[clinSurgeryDetail.trim(), "detalhes da cirurgia recente"]] : []),
        ...(gender === "F" ? [[clinPregnant, "gestação ou pós-parto"]] : []),
        ...(["gravida", "posparto"].includes(clinPregnant)
          ? [[clinPregnantDetail.trim(), "tempo de gestação ou pós-parto"]]
          : []),
        [clinSmoke, "tabagismo"],
        [clinAcute, "febre ou doença aguda"],
        [validZeroToTen(evaTornozelo), "dor no tornozelo (0 a 10)"],
        [validZeroToTen(evaJoelho), "dor no joelho (0 a 10)"],
        [validZeroToTen(evaQuadril), "dor no quadril (0 a 10)"],
        [validZeroToTen(evaLombar), "dor lombar (0 a 10)"],
        [validZeroToTen(evaOmbro), "dor no ombro (0 a 10)"],
      ].filter(([value]) => value === "" || value === null || value === undefined).map(([, label]) => label);
    }
    if (targetStepId === "nutrition") {
      return [
        [nutrition, "alimentação"],
        [hasNutritionist, "se já faz acompanhamento com nutricionista"],
      ]
        .filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "recovery") {
      return [
        [profession, "profissão e rotina"],
        [sleepHours, "horas de sono"],
        [restorativeSleep, "sono reparador"],
        [validZeroToTen(perceivedRecovery), "recuperação percebida hoje (0 a 10)"],
        [awareOfTrilogy, "consciência sobre alimentação, treino e sono"],
      ].filter(([value]) => !value).map(([, label]) => label);
    }
    if (targetStepId === "finish") return [
      [feelIn3Months, "como quer se sentir em 3 meses"],
      [biggestObstacle, "principal obstáculo"],
      [commitsCommunication, "compromisso de comunicação"],
      ...(isPreRegistration ? [[budgetRange, "investimento em saúde"]] : []),
      ...(requestsContactPreferences ? [
        [preferredContactChannel, "forma preferida de contato"],
        [preferredContactPeriod, "melhor horário para contato"],
      ] : []),
      ...customFields
        .filter(field => field.is_required)
        .map(field => {
          const value = customAnswers[field.id];
          return [Array.isArray(value) ? (value.length ? "ok" : "") : value, field.label];
        }),
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
        modalities,
        modality_other: modalityOther || null,
        requested_services: desiredServices,
        training_days: trainingDays,
        available_days: availability.totalDays,
        session_duration: sessionDuration || null,
        endurance_session_duration: enduranceSessionDuration || null,
        training_location: trainingLocation,
        available_equipment: allEquipment,
        days_available: availability.totalDays,
        days_strength: wantsStrength ? availability.strengthDays ?? availability.totalDays : null,
        days_cardio: hasEndurance ? availability.cardioDays ?? availability.totalDays : null,
        goals: sportGoal || objective,
        diseases,
        injuries,
        current_pain: currentPain,
        nutrition,
        has_nutritionist: hasNutritionist === "sim",
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
        race_name: raceName || null,
        race_date: raceDate || null,
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
        medical_conditions: diseases,
        medications,
        clin_cardiac: clinCardiac,
        clin_chest_pain: clinChestPain,
        clin_surgery: clinSurgery,
        clin_surgery_detail: clinSurgeryDetail,
        clin_pregnant: gender === "F" ? clinPregnant : "na",
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
        ...mealSchedulePayload(mealsPerDay, mealTimes),
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
        preferred_contact_channel: preferredContactChannel || null,
        preferred_contact_period: preferredContactPeriod || null,
        shown_blocks: [
          "dados", "objetivo", "treino", "saude", "clinica",
          wantsNutrition && "nutricao",
          wantsStrength && "musculacao",
          wantsRunning && "corrida",
          wantsSwimming && "natacao",
          wantsCycling && "ciclismo",
        ].filter(Boolean),
        custom_answers: Object.fromEntries(customFields.flatMap(field => {
          const value = customAnswers[field.id];
          if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return [];
          return [[field.id, { label: field.label, value }]];
        })),
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
              preferred_contact_channel: preferredContactChannel,
              preferred_contact_period: preferredContactPeriod,
            },
          },
        })
      : await supabase.functions.invoke("public-anamnesis", {
          body: {
            action: "submit",
            accessKey: accessKey!,
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

    if (isPreRegistration) {
      setDeadlineMessage(data.deadline || "Vamos analisar o seu perfil e, se pudermos realmente te ajudar, você receberá um retorno nosso em até 48 horas.");
    }
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
                : "Este convite é inválido ou expirou. Peça um novo link à equipe e abra-o no mesmo navegador da sua conta."}
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
                Recebemos muitos interessados em treinar com a gente e mantemos um número limitado de alunos por vez para garantir esse acompanhamento de perto.
              </p>
              <p className="rounded-xl bg-primary/10 px-4 py-3 font-sans font-semibold text-primary">
                {deadlineMessage}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground font-sans">
                Nosso retorno será feito pelo WhatsApp informado, respeitando a forma e o horário que você escolheu.
              </p>
              <p className="text-sm text-muted-foreground font-sans">
                No próximo contato, faremos sua Avaliação de Movimento e escolheremos o plano ideal para alcançarmos o seu objetivo juntos.
              </p>
              <p className="text-sm font-semibold text-primary font-sans">
                Até daqui a pouco!
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
            {(["profile", "services", "experience", "schedule", "strength", "running", "swimming", "cycling"] as AnamnesisStepId[]).includes(currentStep.id) && (
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
            {currentStep.id === "profile" && (
            <div className="space-y-4">
              <h3 className="font-display text-lg text-primary">Informações básicas</h3>
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
                {currentStep.id === "profile" && (
                <>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Idade</Label>
                  <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="Ex: 28" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Isso nos ajuda a ajustar volume, recuperação e segurança à sua fase de vida.
                  </p>
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
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="font-sans font-medium">Como será a sua semana de treinos? Diga cada modalidade que você vai praticar de segunda a domingo. *</Label>
                <Textarea
                  value={trainingDays}
                  onChange={e => setTrainingDays(e.target.value)}
                  placeholder="Ex: segunda — musculação; terça — corrida; quarta — musculação; quinta — descanso; sexta — musculação; sábado — corrida; domingo — descanso"
                />
              </div>
              {hasEndurance && (
                <div className="space-y-4 rounded-xl border border-border bg-background/50 p-4">
                  <h3 className="font-display text-lg text-primary">Meta esportiva comum</h3>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Qual meta você quer atingir nas modalidades esportivas? *</Label>
                    <Input value={sportGoal} onChange={e => setSportGoal(e.target.value)} placeholder="Ex: completar meu primeiro triathlon sprint em outubro" />
                    <p className="text-xs leading-relaxed text-muted-foreground">Perguntamos uma única vez para alinhar corrida, natação e ciclismo ao mesmo objetivo.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Quanto tempo você tem para cada sessão esportiva? *</Label>
                    <RadioGroup value={enduranceSessionDuration} onValueChange={setEnduranceSessionDuration}>
                      {SESSION_DURATION_OPTIONS.map(option => (
                        <div key={option} className="flex items-center gap-2">
                          <RadioGroupItem value={option} id={`esd-${option}`} />
                          <Label htmlFor={`esd-${option}`} className="cursor-pointer font-sans font-normal">{option}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-sans font-medium">Nome da prova-alvo (se houver)</Label>
                      <Input value={raceName} onChange={event => setRaceName(event.target.value)} placeholder="Ex: Meia Maratona de Floripa" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans font-medium">Data da prova</Label>
                      <Input type="date" value={raceDate} onChange={event => setRaceDate(event.target.value)} />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">Ao informar nome e data, a prova entra no calendário do seu acompanhamento.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Como você se alimenta nos treinos ou provas longas?</Label>
                    <Input value={fuelingStrategy} onChange={e => setFuelingStrategy(e.target.value)} placeholder="Ex: gel a cada 40 min, isotônico; ou ainda não uso nada" />
                  </div>
                </div>
              )}
            </div>
            )}

            {currentStep.id === "strength" && (
            <div className="space-y-2">
              <Label className="font-sans font-medium">Quanto tempo você tem para cada sessão de musculação/força? *</Label>
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

            {currentStep.id === "running" && (
              <div className="space-y-4 rounded-lg border border-border bg-background/50 p-4">
                <h3 className="font-display text-lg text-primary">Somente corrida</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <div className="space-y-2">
                        <Label className="font-sans font-medium">Onde você pratica corrida? *</Label>
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
                </div>
              </div>
            )}

            {currentStep.id === "swimming" && (
              <div className="space-y-4 rounded-lg border border-border bg-background/50 p-4">
                <h3 className="font-display text-lg text-primary">Somente natação</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                        <Label className="font-sans font-medium">Em qual piscina você pratica natação? *</Label>
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
                        <Label className="font-sans font-medium">Nível na natação *</Label>
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
                </div>
              </div>
            )}

            {currentStep.id === "cycling" && (
              <div className="space-y-4 rounded-lg border border-border bg-background/50 p-4">
                <h3 className="font-display text-lg text-primary">Somente ciclismo</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                        <Label className="font-sans font-medium">Qual tipo de bicicleta você usa no ciclismo? *</Label>
                        <select value={bikeType} onChange={e => setBikeType(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Selecione...</option>
                          <option value="speed">Speed/estrada</option>
                          <option value="gravel">Gravel</option>
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
                  <label className="flex cursor-pointer items-center gap-2 font-sans text-sm sm:col-span-2">
                        <Checkbox checked={bikePower} onCheckedChange={v => setBikePower(!!v)} />
                        Tenho medidor de potência
                  </label>
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
              <Label className="font-sans font-medium">Possui alguma condição médica diagnosticada? *</Label>
              <Textarea value={diseases} onChange={e => setDiseases(e.target.value)} placeholder="Ex: hipertensão controlada; ou nenhuma" />
              <p className="text-xs leading-relaxed text-muted-foreground">Isso nos ajuda a respeitar limites clínicos e definir quando é necessário pedir liberação profissional.</p>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Usa algum medicamento continuamente? *</Label>
              <Input value={medications} onChange={e => setMedications(e.target.value)} placeholder="Ex: losartana 50 mg; ou nenhum" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Histórico de lesões *</Label>
              <Textarea value={injuries} onChange={e => setInjuries(e.target.value)} placeholder="Ex: entorse no tornozelo em 2024; ou nenhuma" />
              <p className="text-xs leading-relaxed text-muted-foreground">Isso nos ajuda a montar sua Avaliação de Movimento e seu treino com segurança.</p>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Possui alguma dor atualmente? *</Label>
              <Textarea value={currentPain} onChange={e => setCurrentPain(e.target.value)} placeholder="Ex: dor no joelho ao agachar, intensidade 4/10; ou nenhuma" />
              <p className="text-xs leading-relaxed text-muted-foreground">Conte onde dói, em qual movimento e a intensidade de 0 a 10. Se não houver dor, escreva “nenhuma”.</p>
            </div>
            </>
            )}

            {currentStep.id === "clinical" && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <h3 className="font-display text-lg text-primary">Triagem clínica</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">As respostas marcadas com * são essenciais para decidir se o treino pode começar com segurança. Nenhuma opção vem respondida por padrão.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Problema cardíaco / pressão alta? *</Label>
                  <select value={clinCardiac} onChange={e => setClinCardiac(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Dor no peito / tontura ao esforço? *</Label>
                  <select value={clinChestPain} onChange={e => setClinChestPain(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Cirurgia nos últimos 6 meses? *</Label>
                  <select value={clinSurgery} onChange={e => setClinSurgery(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                {clinSurgery === "sim" && (
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Qual cirurgia e quando? *</Label>
                    <Input value={clinSurgeryDetail} onChange={e => setClinSurgeryDetail(e.target.value)} placeholder="Ex: cirurgia no joelho em janeiro de 2026" />
                  </div>
                )}
                {gender === "F" && (
                  <>
                    <div className="space-y-2">
                      <Label className="font-sans font-medium">Gestação / pós-parto? *</Label>
                      <select value={clinPregnant} onChange={e => setClinPregnant(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Selecione...</option>
                        <option value="na">Não se aplica</option>
                        <option value="gravida">Gestante</option>
                        <option value="posparto">Pós-parto recente</option>
                      </select>
                    </div>
                    {clinPregnant && clinPregnant !== "na" && (
                      <div className="space-y-2">
                        <Label className="font-sans font-medium">Semanas / meses *</Label>
                        <Input value={clinPregnantDetail} onChange={e => setClinPregnantDetail(e.target.value)} placeholder="Ex: 20 semanas; ou 3 meses pós-parto" />
                      </div>
                    )}
                  </>
                )}
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Fuma? *</Label>
                  <select value={clinSmoke} onChange={e => setClinSmoke(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">Doente / com febre agora? *</Label>
                  <select value={clinAcute} onChange={e => setClinAcute(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione...</option>
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
                <Label className="font-sans font-medium">Dor articular agora (0 = sem dor · 10 = dor máxima) *</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">Preencha cada região. Assim evitamos interpretar um campo vazio como ausência de dor.</p>
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
              <Label className="font-sans font-medium">Como é a sua alimentação hoje? *</Label>
              <Textarea value={nutrition} onChange={e => setNutrition(e.target.value)} placeholder="Ex: faço 4 refeições, como bem durante a semana e tenho mais dificuldade à noite" />
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
              <Label className="font-sans font-medium">Você já faz acompanhamento com nutricionista? *</Label>
              <RadioGroup value={hasNutritionist} onValueChange={setHasNutritionist} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <RadioGroupItem value="sim" />
                  Sim, já tenho nutricionista
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <RadioGroupItem value="nao" />
                  Não tenho nutricionista
                </label>
              </RadioGroup>
              {hasNutritionist === "sim" && (
                <p className="text-xs text-muted-foreground">
                  Depois, no app do aluno, você poderá enviar ou colar o cardápio do seu nutricionista para deixarmos tudo organizado na aba Nutrição.
                </p>
              )}
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
                {mealScheduleEntries(mealsPerDay, mealTimes).map((meal) => (
                  <div className="space-y-2" key={meal.key}>
                    <Label className="font-sans font-medium">{meal.label}</Label>
                    <Input
                      type="time"
                      value={meal.value}
                      onChange={event => setMealTimes(current => current.map((value, index) => (
                        index === meal.index ? event.target.value : value
                      )))}
                    />
                  </div>
                ))}
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

            <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <Label className="font-sans font-medium">Recuperação percebida hoje (0-10) *</Label>
              <Input type="number" min={0} max={10} value={perceivedRecovery} onChange={e => setPerceivedRecovery(e.target.value)} placeholder="Ex: 7" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                0 significa “exausto, dolorido ou sem condições de treinar”; 10 significa “totalmente descansado e pronto”. Isso orienta o ajuste de volume e intensidade.
              </p>
            </div>

            {hasEndurance && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-sans font-medium">FC máxima, se souber</Label>
                  <Input type="number" value={fcmax} onChange={e => setFcmax(e.target.value)} placeholder="Ex: 190" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans font-medium">FC de repouso, se souber</Label>
                  <Input type="number" value={fcrep} onChange={e => setFcrep(e.target.value)} placeholder="Ex: 60" />
                </div>
              </div>
            )}

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
            {requestsContactPreferences && (
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div>
                  <h3 className="font-display text-lg text-primary">Preferências para o atendimento</h3>
                  <p className="mt-1 text-sm text-muted-foreground font-sans">
                    Estas respostas ajudam a equipe a organizar a prioridade e falar com você no melhor momento.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {isPreRegistration && <div className="space-y-2">
                    <Label className="font-sans font-medium">Quanto você está disposto(a) a investir na sua saúde? *</Label>
                    <select value={budgetRange} onChange={e => setBudgetRange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Selecione...</option>
                      <option value="200_300">R$ 200 a R$ 300</option>
                      <option value="300_400">R$ 300 a R$ 400</option>
                      <option value="400_500">R$ 400 a R$ 500</option>
                    </select>
                    <p className="text-xs leading-relaxed text-muted-foreground">Isso nos ajuda a indicar uma opção compatível com a sua realidade, sem oferecer um plano inadequado.</p>
                  </div>}
                  <div className="space-y-2">
                    <Label className="font-sans font-medium">Forma preferida de contato *</Label>
                    <select
                      value={preferredContactChannel}
                      onChange={event => {
                        setPreferredContactChannel(event.target.value);
                        setPreferredContactPeriod("");
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Selecione...</option>
                      <option value="whatsapp_message">Mensagem pelo WhatsApp</option>
                      <option value="whatsapp_call">Ligação pelo WhatsApp</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="font-sans font-medium">Melhor horário para contato *</Label>
                    <select value={preferredContactPeriod} onChange={e => setPreferredContactPeriod(e.target.value)} disabled={!preferredContactChannel} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60">
                      <option value="">Selecione...</option>
                      <option value="morning">Manhã (8h às 12h)</option>
                      <option value="afternoon">Tarde (12h às 18h)</option>
                      <option value="evening">Noite (após 18h)</option>
                    </select>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {preferredContactChannel === "whatsapp_call"
                        ? "Para ligação, escolha um período em que você possa atender com tranquilidade."
                        : "Para mensagem, escolha quando costuma conseguir responder com mais facilidade."}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {customFields.length > 0 && (
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div>
                  <h3 className="font-display text-lg text-primary">Perguntas do seu treinador</h3>
                  <p className="mt-1 text-sm text-muted-foreground font-sans">
                    Responda estas perguntas adicionais para completar o contexto da sua prescrição.
                  </p>
                </div>
                {customFields.map(field => {
                  const value = customAnswers[field.id];
                  const setValue = (nextValue: string | string[]) => setCustomAnswers(current => ({
                    ...current,
                    [field.id]: nextValue,
                  }));
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label className="font-sans font-medium">{field.label}{field.is_required ? " *" : ""}</Label>
                      {field.field_type === "textarea" ? (
                        <Textarea value={typeof value === "string" ? value : ""} onChange={event => setValue(event.target.value)} />
                      ) : field.field_type === "number" || field.field_type === "date" ? (
                        <Input type={field.field_type} value={typeof value === "string" ? value : ""} onChange={event => setValue(event.target.value)} />
                      ) : field.field_type === "select" || field.field_type === "radio" ? (
                        <select value={typeof value === "string" ? value : ""} onChange={event => setValue(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-base">
                          <option value="">Selecione...</option>
                          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : field.field_type === "checkbox" ? (
                        <div className="space-y-2">
                          {field.options.map(option => {
                            const selected = Array.isArray(value) ? value : [];
                            return (
                              <label key={option} className="flex cursor-pointer items-center gap-2 font-sans text-sm">
                                <Checkbox checked={selected.includes(option)} onCheckedChange={checked => setValue(checked ? [...selected, option] : selected.filter(item => item !== option))} />
                                {option}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <Input value={typeof value === "string" ? value : ""} onChange={event => setValue(event.target.value)} />
                      )}
                    </div>
                  );
                })}
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
