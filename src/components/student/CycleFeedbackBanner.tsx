import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, X, Loader2, CheckCircle2 } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {usePublishedInstrumentState} from '@/hooks/usePublishedInstrument';
import VersionedFormFields from '@/components/VersionedFormFields';
import {validateFormAnswers} from '@/lib/formDefinitions';

interface Props {
  studentId: string;
  companyId: string;
  enrollmentId: string | null;
  enrollmentEndDate: string | null;
  cycleId?: string | null;
}

const DISMISS_KEY = (id: string) => `cycle_feedback_dismissed_${id}`;
const DONE_KEY = (id: string) => `cycle_feedback_done_${id}`;

// Banner de fim de ciclo → anamnese RÁPIDA + NPS (item 3). Grava em cycle_feedback;
// o professor vê na hora de liberar a próxima prescrição (liberação manual).
export function CycleFeedbackBanner(props: Props) {
  const instrument = usePublishedInstrumentState(props.companyId, 'cycle_feedback');
  const contextKey = JSON.stringify([props.companyId, props.studentId, props.enrollmentId, props.cycleId, instrument.published?.id ?? null]);
  return <CycleFeedbackForm key={contextKey} {...props} published={instrument.published} loaded={instrument.loaded} error={instrument.error} />;
}

function CycleFeedbackForm({ studentId, companyId, enrollmentId, enrollmentEndDate, cycleId, published, loaded, error: definitionError }: Props & Pick<ReturnType<typeof usePublishedInstrumentState>, 'published' | 'loaded' | 'error'>) {
  const [instrumentAnswers,setInstrumentAnswers]=useState<Record<string,unknown>>({});
  const [instrumentError,setInstrumentError]=useState('');
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [nps, setNps] = useState<number | null>(null);
  const [goalsAligned, setGoalsAligned] = useState<boolean | null>(null);
  const [wantsAdjustment, setWantsAdjustment] = useState<boolean | null>(null);
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  useEffect(() => {
    if (!enrollmentId) return;
    setDismissed(localStorage.getItem(DISMISS_KEY(enrollmentId)) === "1");
    setDone(localStorage.getItem(DONE_KEY(enrollmentId)) === "1");
  }, [enrollmentId]);

  if (!loaded || !enrollmentId || !enrollmentEndDate || dismissed || done) return null;
  if(definitionError)return <p role="alert" className="text-sm text-muted-foreground">{definitionError}</p>;
  const daysLeft = differenceInCalendarDays(parseISO(enrollmentEndDate), new Date());
  if (daysLeft < 0 || daysLeft > (published?.definition.policy.cycle_feedback_days??7)) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY(enrollmentId), "1"); setDismissed(true); };

  const canSubmit = nps !== null && goalsAligned !== null && wantsAdjustment !== null && !(wantsAdjustment && !adjustmentNotes.trim());

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const { error } = await (supabase as any).from("cycle_feedback").insert({
      company_id: companyId, student_id: studentId, enrollment_id: enrollmentId, cycle_id: cycleId ?? null,
      nps, goals_aligned: goalsAligned, wants_adjustment: wantsAdjustment,
      adjustment_notes: wantsAdjustment ? adjustmentNotes.trim() : null,
      answers: { nps, goals_aligned: goalsAligned, wants_adjustment: wantsAdjustment, adjustment: adjustmentNotes.trim() || null },
    });
    setSubmitting(false);
    if (!error) {
      localStorage.setItem(DONE_KEY(enrollmentId), "1");
      setDone(true);
    }
  };

  const YesNo = ({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) => (
    <div className="flex gap-2">
      {[["Sim", true], ["Não", false]].map(([lbl, v]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v as boolean)}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium transition",
            value === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50")}>
          {lbl as string}
        </button>
      ))}
    </div>
  );

  if(published)return <Card><CardContent className="p-4"><form className="space-y-4" onSubmit={async e=>{e.preventDefault();const invalid=validateFormAnswers(published.definition,instrumentAnswers);if(invalid.length){setInstrumentError(`Revise: ${invalid.join(', ')}`);return;}setSubmitting(true);try{const result=await (supabase as any).from('cycle_feedback').insert({company_id:companyId,student_id:studentId,enrollment_id:enrollmentId,cycle_id:cycleId??null,nps:Number(instrumentAnswers.nps),goals_aligned:instrumentAnswers.goals_aligned,wants_adjustment:instrumentAnswers.wants_adjustment,adjustment_notes:instrumentAnswers.wants_adjustment?instrumentAnswers.adjustment_notes:null,answers:{...instrumentAnswers,adjustment:instrumentAnswers.adjustment_notes??null},form_definition_id:published.id});if(result.error)throw result.error;localStorage.setItem(DONE_KEY(enrollmentId),'1');setDone(true);}catch{setInstrumentError('Nao foi possivel registrar o feedback.');}finally{setSubmitting(false);}}}><h2 className="text-sm font-semibold">{published.definition.title}</h2>{instrumentError&&<p role="alert" className="text-sm text-destructive">{instrumentError}</p>}<fieldset disabled={submitting}><VersionedFormFields definition={published.definition} answers={instrumentAnswers} onChange={(key,value)=>setInstrumentAnswers(a=>({...a,[key]:value}))} /></fieldset><Button type="submit" disabled={submitting}>Enviar feedback</Button></form></CardContent></Card>;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <CalendarClock className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-sans text-sm font-medium text-foreground">
              Seu ciclo termina {daysLeft === 0 ? "hoje" : `em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}`}
            </p>
            <p className="mt-0.5 font-sans text-xs text-muted-foreground">
              Responde rapidinho pra gente ajustar a próxima fase do seu plano (1 min).
            </p>

            {!open ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="h-8" onClick={() => setOpen(true)}>Responder (1 min)</Button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-foreground">De 0 a 10, o quanto você recomendaria seu treinador?</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button key={n} type="button" onClick={() => setNps(n)}
                        className={cn("h-7 w-7 rounded-md border text-xs font-semibold transition",
                          nps === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50")}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-foreground">Seus objetivos seguem os mesmos?</p>
                  <YesNo value={goalsAligned} onChange={setGoalsAligned} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-foreground">Quer algum ajuste na próxima fase?</p>
                  <YesNo value={wantsAdjustment} onChange={setWantsAdjustment} />
                  {wantsAdjustment && (
                    <Textarea value={adjustmentNotes} onChange={(e) => setAdjustmentNotes(e.target.value)}
                      placeholder="Ex.: reduzir o tempo de treino, focar mais em corrida, menos impacto no joelho…"
                      className="mt-2 min-h-[60px] text-sm" />
                  )}
                </div>
                <Button size="sm" className="h-8 w-full" onClick={submit} disabled={!canSubmit || submitting}>
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</> : "Enviar"}
                </Button>
              </div>
            )}
          </div>
          <button onClick={dismiss} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Dispensar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
