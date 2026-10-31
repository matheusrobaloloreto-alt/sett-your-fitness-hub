import { format, parseISO, isValid } from 'date-fns';
import { SET_TYPE_CONFIG, type SetType } from '@/lib/setTypes';
import { WORKOUT_METHODS, type MethodId } from '@/lib/workoutMethods';
import { studentEffortLabel, studentFacingEffortText } from '@/lib/weeklyStrengthPeriodization';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadPublishedPrescriptions, prescriptionHistoryPageSize, type PublishedPrescription } from '@/lib/studentPrescriptionHistory';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type PrescriptionDetails = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const asDetails = (value: unknown): PrescriptionDetails | null => value && typeof value === 'object' && !Array.isArray(value) ? value as PrescriptionDetails : null;
function displayDate(value: string | null) {
 const date = value ? parseISO(value) : null;
 return date && isValid(date) ? format(date, 'dd/MM/yyyy') : 'Data não informada';
}
function PrescriptionMetrics({ details }: { details: PrescriptionDetails }) {
 const fields: Array<[string, string]> = [
  ['sets', 'Séries'], ['reps', 'Repetições'], ['load', 'Carga'], ['weight', 'Carga'],
  ['rest', 'Descanso'], ['rest_seconds', 'Descanso'], ['rpe', 'Percepção de esforço (0–10)'],
  ['duration', 'Duração'], ['distance', 'Distância'], ['muscle_group', 'Grupo muscular'],
  ['notes', 'Observações'], ['instructions', 'Instruções'], ['instruction', 'Orientação'],
  ['weekly_instruction', 'Orientação semanal'], ['method_seconds', 'Tempo do método'],
 ];
 const tempo = text(details.tempo);
 const method = text(details.method);
 const methodLabel = Object.hasOwn(WORKOUT_METHODS, method) ? WORKOUT_METHODS[method as MethodId].label : '';
 const effort = studentEffortLabel(text(details.rir));
 return <div className="space-y-2">
  <dl className="space-y-1">
   {fields.map(([key, label]) => {
    const value = text(details[key]);
    if (!value) return null;
    return <div key={key}><dt className="inline font-medium">{label}: </dt><dd className="inline whitespace-pre-wrap">{studentFacingEffortText(value)}{['rest_seconds', 'method_seconds'].includes(key) ? ' s' : ''}</dd></div>;
   })}
   {tempo && <div><dt className="inline font-medium">Cadência: </dt><dd className="inline">{/^[0-9Xx]{4}$/.test(tempo) ? tempo.split('').join('-') : tempo}</dd><p className="text-xs text-muted-foreground">Ordem dos tempos: descida, pausa, subida e pausa. Números em segundos; X indica movimento explosivo.</p></div>}
   {effort && <div><dt className="sr-only">Esforço</dt><dd>{effort}</dd></div>}
   {methodLabel && <div><dt className="inline font-medium">Método: </dt><dd className="inline">{methodLabel}</dd></div>}
  </dl>
  {Array.isArray(details.set_types) && details.set_types.length > 0 && <div><p className="font-medium">Tipos de série</p><ul>{details.set_types.map((type, index) => {
   const key = text(type);
   const label = Object.hasOwn(SET_TYPE_CONFIG, key) ? SET_TYPE_CONFIG[key as SetType].name : 'Tipo não informado';
   return <li key={index}>Série {index + 1}: {label}</li>;
  })}</ul></div>}
 </div>;
}
function PublishedExercise({ exercise, number }: { exercise: PrescriptionDetails; number: number }) {
 const weeks = Array.isArray(exercise.weekly_prescription) ? exercise.weekly_prescription.map(asDetails).filter((week): week is PrescriptionDetails => !!week && Number.isInteger(week.week) && Number(week.week) > 0) : [];
 const blocks: Record<string, string> = { base: 'Base', acumulacao: 'Acumulação', intensificacao: 'Intensificação', consolidacao: 'Consolidação', deload: 'Recuperação' };
 return <li className="border-t pt-2 space-y-2">
  <h5 className="font-medium">Exercício {number}</h5>
  <p>{text(exercise.exercise_name) || text(exercise.name)}</p>
  <PrescriptionMetrics details={exercise} />
  {weeks.length > 0 && <div className="space-y-3"><p className="font-semibold">Progressão semanal</p>{weeks.map((week, index) => {
   const block = text(week.block);
   return <section key={index} className="border-l pl-3"><h6 className="font-medium">Semana {text(week.week)}{Object.hasOwn(blocks, block) ? ` · ${blocks[block]}` : ''}</h6><PrescriptionMetrics details={week} /></section>;
  })}</div>}
 </li>;
}

export function PublishedPrescriptionHistory({ userId, studentId, companyId, today }: { userId: string; studentId: string; companyId: string; today: string }) {
 const [open, setOpen] = useState(false);
 const [page, setPage] = useState(0);
 const [revision, setRevision] = useState(0);
 const [result, setResult] = useState<{ scope: string; items: PublishedPrescription[]; hasMore: boolean } | null>(null);
 const [error, setError] = useState(false);
 const [loading, setLoading] = useState(false);
 const scope = `${userId}:${studentId}:${companyId}:${today}`;
 const currentScope = useRef(scope); currentScope.current = scope;
 useEffect(() => {
  if (!open) return;
  let cancelled = false;
  const stale = () => cancelled || currentScope.current !== scope;
  setLoading(true); setError(false); setResult(null);
  void loadPublishedPrescriptions(supabase, { userId, studentId, companyId, today }, page * prescriptionHistoryPageSize, stale).then(data => {
   if (!stale()) setResult({ scope, items: data.prescriptions, hasMore: data.hasMore });
  }).catch(() => { if (!stale()) setError(true); }).finally(() => { if (!stale()) setLoading(false); });
  return () => { cancelled = true; };
 }, [open, scope, userId, studentId, companyId, today, page, revision]);
 const visible = result?.scope === scope ? result : null;
 return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setResult(null); setPage(0); } }}>
  <DialogTrigger asChild><Button variant="outline">Consultar prescrições publicadas</Button></DialogTrigger>
  <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
   <DialogHeader><DialogTitle>Prescrições publicadas</DialogTitle><DialogDescription>Somente consulta. Este histórico não libera sessões, registros ou alterações de treino.</DialogDescription></DialogHeader>
   {loading && <p role="status">Carregando prescrições…</p>}
   {error && <div role="alert">Não foi possível carregar as prescrições. <Button onClick={() => setRevision(n => n + 1)}>Tentar novamente</Button></div>}
   {!loading && !error && visible?.items.length === 0 && <p>Nenhuma prescrição publicada nesta página.</p>}
   {visible?.items.map(cycle => <section key={cycle.id} className="space-y-3 border rounded p-3">
    <h3 className="font-semibold">Ciclo {cycle.cycle_number} · {displayDate(cycle.start_date)} a {displayDate(cycle.end_date)}</h3>
    <p>{cycle.enrollmentExpired ? 'Matrícula vencida: renovação pendente.' : cycle.end_date && cycle.end_date < today ? 'Período encerrado: consulte sua equipe sobre a prescrição atual.' : 'Prescrição publicada. A disponibilidade para iniciar depende da matrícula e do período atual.'}</p>
    {cycle.workouts.map(workout => <article key={workout.id} className="space-y-2">
     <h4 className="font-semibold">{workout.title || workout.name || 'Treino'}</h4>
     {workout.description && <p>{workout.description}</p>}
     <ol className="space-y-2">{(Array.isArray(workout.exercises) ? workout.exercises : []).map((exercise, i) => {
      if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) return null;
      return <PublishedExercise key={i} exercise={exercise} number={i + 1} />;
     })}</ol>
    </article>)}
   </section>)}
   <div className="flex gap-2">
    {page > 0 && <Button disabled={loading} onClick={() => setPage(n => n - 1)}>Mais recentes</Button>}
    {visible?.hasMore && <Button disabled={loading} onClick={() => setPage(n => n + 1)}>Mais antigas</Button>}
   </div>
  </DialogContent>
 </Dialog>;
}
