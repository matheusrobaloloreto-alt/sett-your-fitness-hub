import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { PlatformContent } from '@/lib/platformContent';
export function PlatformAchievementDefaults({ value, onChange }: { value: PlatformContent['achievements']; onChange: (next: PlatformContent['achievements']) => void }) {
  const update = (index: number, patch: Partial<PlatformContent['achievements'][number]>) => onChange(value.map((a, i) => i === index ? { ...a, ...patch } : a));
  return <section className="space-y-4" aria-label="Conquistas padrão"><h2 className="font-semibold">Conquistas padrão</h2>{value.map((a, i) => <div key={i} className="border rounded-md p-4 space-y-3">
    <div className="grid sm:grid-cols-2 gap-3"><label>Código<Input aria-label={`Código da conquista ${i + 1}`} value={a.code} maxLength={31} onChange={e => update(i, { code: e.target.value })} /></label><label>Título<Input aria-label={`Título da conquista ${i + 1}`} value={a.title} maxLength={120} onChange={e => update(i, { title: e.target.value })} /></label></div>
    <label className="block">Descrição<Textarea aria-label={`Descrição da conquista ${i + 1}`} value={a.description} maxLength={1000} onChange={e => update(i, { description: e.target.value })} /></label>
    <div className="grid sm:grid-cols-3 gap-3"><label>Critério<select aria-label={`Critério da conquista ${i + 1}`} value={a.criteria_type} onChange={e => update(i, { criteria_type: e.target.value as typeof a.criteria_type })}><option value="workouts_total">Treinos concluídos</option><option value="external_total">Atividades externas</option><option value="cycles_completed">Ciclos concluídos</option></select></label>
    <label>Meta<Input aria-label={`Meta da conquista ${i + 1}`} type="number" min={1} max={10000} value={a.criteria_value} onChange={e => update(i, { criteria_value: Number(e.target.value) })} /></label><label>XP<Input aria-label={`XP da conquista ${i + 1}`} type="number" min={0} max={10000} value={a.xp_reward} onChange={e => update(i, { xp_reward: Number(e.target.value) })} /></label></div>
    <label className="flex gap-2"><input type="checkbox" checked={a.is_active} onChange={e => update(i, { is_active: e.target.checked })} />Ativa</label><Button type="button" variant="outline" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remover conquista {i + 1}</Button>
  </div>)}<Button type="button" variant="outline" disabled={value.length >= 20} onClick={() => onChange([...value, { code: `meta_${value.length + 1}`, title: 'Nova conquista', description: '', criteria_type: 'workouts_total', criteria_value: 1, xp_reward: 50, is_active: true }])}>Adicionar conquista padrão</Button></section>;
}
