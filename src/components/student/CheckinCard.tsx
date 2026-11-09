// Check-in diário de prontidão (3 toques): sono, estresse e dor.
// Alimenta o readiness do motor de prescrição (professor vê e o motor corta volume em "cautela").
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, HeartPulse } from "lucide-react";
import { businessDateYmd } from "@/lib/businessDate";
import {usePublishedInstrumentState} from '@/hooks/usePublishedInstrument';
import VersionedFormFields from '@/components/VersionedFormFields';
import {Button} from '@/components/ui/button';
import {validateFormAnswers} from '@/lib/formDefinitions';

interface Props { studentId: string; companyId: string | null; }

const SLEEP = [["Péssimo", 1], ["Ruim", 2], ["Regular", 3], ["Bom", 4], ["Ótimo", 5]] as const;
const STRESS = [["Muito baixo", 1], ["Baixo", 2], ["Moderado", 3], ["Alto", 4], ["Muito alto", 5]] as const;
const PAIN = [0, 2, 4, 6, 8] as const;

export function CheckinCard({ studentId, companyId }: Props) {
  const today = businessDateYmd();
  return <DailyCheckin key={`${companyId}:${studentId}:${today}`} studentId={studentId} companyId={companyId} today={today} />;
}

function DailyCheckin({ studentId, companyId, today }: Props & { today: string }) {
  const {published,loaded,error:definitionError}=usePublishedInstrumentState(companyId,'checkin');
  const [instrumentAnswers,setInstrumentAnswers]=useState<Record<string,unknown>>({});
  const [instrumentError,setInstrumentError]=useState('');
  const [done, setDone] = useState<boolean | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    supabase.from("student_checkins").select("id").eq("student_id", studentId).eq("checkin_date", today).maybeSingle()
      .then(({ data }) => { if (alive) setDone(!!data); });
    return () => { alive = false; };
  }, [studentId, today]);

  const save = async (answers: { sleep_quality: number; stress: number; pain: number; form_definition_id?: string; instrument_answers?: Record<string, unknown> }) => {
    if (savingRef.current || !companyId) return;
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const { error } = await supabase.from("student_checkins").upsert({
        student_id: studentId, company_id: companyId, checkin_date: today, ...answers,
      }, { onConflict: "student_id,checkin_date" });
      if (error) throw error;
      setDone(true);
    } catch {
      setSaveFailed(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submit = (value: number) => {
    if (sleep == null || stress == null || savingRef.current) return;
    setPain(value);
    void save({ sleep_quality: sleep, stress, pain: value });
  };
  const saveError = saveFailed && <p role="alert" className="text-sm text-destructive">Não foi possível salvar o check-in. Suas respostas foram mantidas.</p>;

  if (done === null || !loaded) return null;
  if(definitionError)return <p role="alert" className="text-sm text-muted-foreground">{definitionError}</p>;
  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Check-in de hoje feito — sua equipe consegue considerar como você está.
      </div>
    );
  }

  if (published) return <Card><CardContent className="p-4">
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault();
      const invalid = validateFormAnswers(published.definition, instrumentAnswers);
      if (invalid.length) {
        setInstrumentError(`Revise: ${invalid.join(", ")}`);
        return;
      }
      setInstrumentError("");
      void save({
        sleep_quality: Number(instrumentAnswers.sleep_quality),
        stress: Number(instrumentAnswers.stress),
        pain: Number(instrumentAnswers.pain),
        form_definition_id: published.id,
        instrument_answers: instrumentAnswers,
      });
    }}>
      <h2 className="text-sm font-semibold">{published.definition.title}</h2>
      {instrumentError && <p role="alert" className="text-sm text-destructive">{instrumentError}</p>}
      {saveError}
      <fieldset disabled={saving}>
        <VersionedFormFields definition={published.definition} answers={instrumentAnswers}
          onChange={(key, value) => setInstrumentAnswers(answers => ({ ...answers, [key]: value }))} />
      </fieldset>
      <Button type="submit" disabled={saving || !companyId}>{saveFailed ? "Tentar novamente" : "Registrar check-in"}</Button>
    </form>
  </CardContent></Card>;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3 space-y-2.5">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <HeartPulse className="h-4 w-4 text-primary" /> Como você está hoje?
          <span className="text-[10px] text-muted-foreground font-normal ml-auto">leva menos de 1 minuto</span>
        </p>
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Como foi seu sono?</span>
          <div className="grid grid-cols-5 gap-1">
            {SLEEP.map(([label, value]) => (
              <button key={value} type="button" disabled={saving} onClick={() => setSleep(value)} aria-pressed={sleep === value}
                className={`min-h-10 rounded-md px-1 text-[10px] font-medium leading-tight transition ${sleep === value ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1" : "bg-secondary/60 text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Como está seu estresse?</span>
          <div className="grid grid-cols-5 gap-1">
            {STRESS.map(([label, value]) => (
              <button key={value} type="button" disabled={saving} onClick={() => setStress(value)} aria-pressed={stress === value}
                className={`min-h-10 rounded-md px-1 text-[10px] font-medium leading-tight transition ${stress === value ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1" : "bg-secondary/60 text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>
        {sleep != null && stress != null && (
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Dor percebida agora (0 = nenhuma, 8 = intensa)</span>
            <div className="grid grid-cols-5 gap-1">
              {PAIN.map((v) => (
                <button key={v} type="button" disabled={saving || !companyId} onClick={() => submit(v)} aria-label={`Dor ${v} de 8`} aria-pressed={pain === v}
                  className={`min-h-10 rounded-md text-xs font-bold transition ${v >= 6 ? "bg-red-500/10 text-red-500" : v >= 4 ? "bg-amber-500/10 text-amber-600" : "bg-green-500/10 text-green-600"} ${pain === v ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary"} disabled:opacity-50`}>{v}</button>
              ))}
            </div>
          </div>
        )}
        {saveError}
        {saveFailed && pain != null && <Button type="button" variant="outline" onClick={() => submit(pain)}>Tentar novamente</Button>}
      </CardContent>
    </Card>
  );
}
