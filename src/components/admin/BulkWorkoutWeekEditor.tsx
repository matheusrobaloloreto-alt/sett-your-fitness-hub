import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { BulkWeekPatch } from '@/lib/bulkWorkoutWeek';

export function BulkWorkoutWeekEditor({ week, title, disabled, onApply }: {
  week: number; title: string; disabled: boolean; onApply: (patch: BulkWeekPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [rest, setRest] = useState('');
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button variant="outline" disabled={disabled} onClick={() => { setSets(''); setReps(''); setRest(''); setOpen(true); }}>Edição em massa</Button>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Edição em massa · Semana {week}</DialogTitle>
        <DialogDescription>Todos os exercícios de {title || 'este treino'}, somente na semana {week}. Deixe em branco o que deseja manter. Depois, salve a prescrição normalmente.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        onApply({ ...(sets.trim() ? { sets: Number(sets) } : {}), ...(reps.trim() ? { reps: reps.trim() } : {}), ...(rest.trim() ? { rest_seconds: Number(rest) } : {}) });
        setOpen(false);
      }}>
        <label className="block space-y-1"><span>Séries</span><Input type="number" min={1} step={1} value={sets} onChange={e => setSets(e.target.value)} placeholder="Manter atuais" /></label>
        <label className="block space-y-1"><span>Repetições</span><Input value={reps} onChange={e => setReps(e.target.value)} placeholder="Ex.: 8–12" /></label>
        <label className="block space-y-1"><span>Descanso (segundos)</span><Input type="number" min={0} step={1} value={rest} onChange={e => setRest(e.target.value)} placeholder="Manter atuais" /></label>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={disabled || ![sets,reps,rest].some(value => value.trim())}>Aplicar na semana {week}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
