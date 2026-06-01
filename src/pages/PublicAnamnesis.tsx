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

const MODALITY_OPTIONS = [
  "Nenhum", "Musculação / Funcional", "Corrida", "Natação", "Bike", "Triathlon", "Tênis"
];

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

export default function PublicAnamnesis() {
  const { studentId } = useParams<{ studentId: string }>();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [titleText, setTitleText] = useState("ANAMNESE");

  // Fields
  const [modalities, setModalities] = useState<string[]>([]);
  const [modalityOther, setModalityOther] = useState("");
  const [trainingDays, setTrainingDays] = useState("");
  const [availableDays, setAvailableDays] = useState("");
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
  const [authorizesPlan, setAuthorizesPlan] = useState("");
  const [commitsCommunication, setCommitsCommunication] = useState("");

  useEffect(() => {
    if (!studentId) { setNotFound(true); return; }
    const init = async () => {
      const { data, error } = await supabase.functions.invoke("public-anamnesis", {
        body: { action: "context", studentId },
      });
      if (error || !data?.student) { setNotFound(true); return; }
      setStudentName(data.student.full_name);
      setCompanyId(null); // backend handles company scoping
      if (data.branding) {
        if (data.branding.logo_url) setLogoSrc(data.branding.logo_url);
        setTitleText(data.branding.platform_title || "ANAMNESE");
        applyTheme(data.branding);
      }
    };
    init();
  }, [studentId]);

  const toggleArrayItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]);
  };

  const handleSubmit = async () => {
    if (!goals || !diseases || !injuries || !currentPain || !nutrition || !profession || !sleepHours ||
      !restorativeSleep || !awareOfTrilogy || !feelIn3Months || !biggestObstacle ||
      !authorizesPlan || !commitsCommunication || !sessionDuration || !trainingLocation) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);

    const allModalities = [...modalities, ...(modalityOther ? [modalityOther] : [])];
    const allEquipment = [...equipment, ...(equipmentOther ? [equipmentOther] : [])];

    const { data, error } = await supabase.functions.invoke("public-anamnesis", {
      body: {
        action: "submit",
        studentId: studentId!,
        modalities: allModalities,
        training_days: trainingDays,
        available_days: availableDays ? parseInt(availableDays) : null,
        session_duration: sessionDuration,
        training_location: trainingLocation,
        available_equipment: allEquipment,
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
        authorizes_plan: authorizesPlan === "sim",
        commits_communication: commitsCommunication === "sim",
      },
    });

    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Erro ao salvar anamnese", description: error?.message || data?.error, variant: "destructive" });
      return;
    }

    setDone(true);
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <h2 className="text-2xl text-primary">ALUNO NÃO ENCONTRADO</h2>
            <p className="text-muted-foreground font-sans">O link de anamnese é inválido ou o aluno não existe.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          {logoSrc ? (
            <img src={logoSrc} alt={titleText} className="h-16 mx-auto" />
          ) : (
            <div className="flex justify-center"><Logo size="lg" sublabel="Training App" /></div>
          )}
          <h1 className="text-4xl text-primary">ANAMNESE</h1>
          {studentName && <p className="text-muted-foreground font-sans">Aluno: <strong className="text-foreground">{studentName}</strong></p>}
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-xl">ANAMNESE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Modalities */}
            <div className="space-y-2">
              <Label className="font-sans font-medium">Quais modalidades você pratica atualmente? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {MODALITY_OPTIONS.map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm font-sans cursor-pointer">
                    <Checkbox checked={modalities.includes(m)} onCheckedChange={() => toggleArrayItem(modalities, m, setModalities)} />
                    {m}
                  </label>
                ))}
              </div>
              <Input placeholder="Outro..." value={modalityOther} onChange={e => setModalityOther(e.target.value)} className="mt-1" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Quais dias da semana você pratica cada uma delas? *</Label>
              <Textarea value={trainingDays} onChange={e => setTrainingDays(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Quantos dias na semana você tem para treinar com a BN? *</Label>
              <Input type="number" min={0} max={7} value={availableDays} onChange={e => setAvailableDays(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Quanto tempo livre para as sessões? *</Label>
              <RadioGroup value={sessionDuration} onValueChange={setSessionDuration}>
                {SESSION_DURATION_OPTIONS.map(o => (
                  <div key={o} className="flex items-center gap-2">
                    <RadioGroupItem value={o} id={`sd-${o}`} />
                    <Label htmlFor={`sd-${o}`} className="font-sans font-normal cursor-pointer">{o}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Onde você treina? *</Label>
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
              <Label className="font-sans font-medium">Materiais disponíveis (se casa/prédio):</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {EQUIPMENT_OPTIONS.map(e => (
                  <label key={e} className="flex items-center gap-2 text-sm font-sans cursor-pointer">
                    <Checkbox checked={equipment.includes(e)} onCheckedChange={() => toggleArrayItem(equipment, e, setEquipment)} />
                    {e}
                  </label>
                ))}
              </div>
              <Input placeholder="Outro..." value={equipmentOther} onChange={e => setEquipmentOther(e.target.value)} className="mt-1" />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Quais as suas metas com o Performance Training? *</Label>
              <Textarea value={goals} onChange={e => setGoals(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Possui alguma doença e/ou toma algum remédio contínuo? *</Label>
              <Textarea value={diseases} onChange={e => setDiseases(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Histórico de lesões (se tiver): *</Label>
              <Textarea value={injuries} onChange={e => setInjuries(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Possui alguma dor atualmente? *</Label>
              <Textarea value={currentPain} onChange={e => setCurrentPain(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Como é a sua alimentação? Faz acompanhamento com Nutricionista? *</Label>
              <Textarea value={nutrition} onChange={e => setNutrition(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Qual a sua profissão e rotina de trabalho? *</Label>
              <Textarea value={profession} onChange={e => setProfession(e.target.value)} />
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

            <div className="space-y-2">
              <Label className="font-sans font-medium">Como você quer se sentir em 3 meses? *</Label>
              <Textarea value={feelIn3Months} onChange={e => setFeelIn3Months(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">O que mais atrapalha a sua rotina de treino? *</Label>
              <Textarea value={biggestObstacle} onChange={e => setBiggestObstacle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Comentários extras</Label>
              <Textarea value={extraComments} onChange={e => setExtraComments(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Você autoriza a criação do seu plano de treino com base nas informações fornecidas? *</Label>
              <RadioGroup value={authorizesPlan} onValueChange={setAuthorizesPlan}>
                <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="ap-sim" /><Label htmlFor="ap-sim" className="font-sans font-normal cursor-pointer">Sim</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="ap-nao" /><Label htmlFor="ap-nao" className="font-sans font-normal cursor-pointer">Não</Label></div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="font-sans font-medium">Você se compromete a comunicar qualquer alteração na sua saúde, rotina ou treino? *</Label>
              <RadioGroup value={commitsCommunication} onValueChange={setCommitsCommunication}>
                <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="cc-sim" /><Label htmlFor="cc-sim" className="font-sans font-normal cursor-pointer">Sim</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="cc-nao" /><Label htmlFor="cc-nao" className="font-sans font-normal cursor-pointer">Não</Label></div>
              </RadioGroup>
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : "Finalizar Anamnese"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
