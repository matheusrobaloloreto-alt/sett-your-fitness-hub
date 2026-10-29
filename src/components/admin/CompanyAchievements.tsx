import { SettingHelp } from './SettingHelp';
import { PlatformExperienceAdoption } from '@/components/content/PlatformExperienceAdoption';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ACHIEVEMENT_CRITERIA, saveCompanyAchievement, type AchievementDefinition, type CompanyAchievement } from '@/lib/gamification';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Plus, Save, X } from 'lucide-react';

const labels: Record<string, string> = { workouts_total: 'Treinos concluidos', external_total: 'Atividades externas', cycles_completed: 'Ciclos concluidos' };
const empty: AchievementDefinition = { code: '', title: '', description: '', criteria_type: 'workouts_total', criteria_value: 1, xp_reward: 50, is_active: true };

export default function CompanyAchievements({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<CompanyAchievement[]>([]);
  const [draft, setDraft] = useState<AchievementDefinition | null>(null);
  const [editing, setEditing] = useState<CompanyAchievement | undefined>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loadedCompany, setLoadedCompany] = useState<string | null>(null);
  const companyRef = useRef(companyId);
  const pendingSave = useRef(false);
  companyRef.current = companyId;
  useEffect(() => {
    let current = true;
    setRows([]); setDraft(null); setEditing(undefined); setError(''); setLoadedCompany(null);
    void supabase.from('achievements').select('*').eq('company_id', companyId).order('title').then(({ data, error: failure }) => {
      if (!current) return;
      if (failure) setError(failure.message);
      else { setRows((data ?? []) as CompanyAchievement[]); setLoadedCompany(companyId); }
    });
    return () => { current = false; };
  }, [companyId, revision]);
  const save = async () => {
    if (!draft || pendingSave.current || loadedCompany !== companyId) return;
    pendingSave.current = true;
    const target = companyId;
    setSaving(true); setError('');
    try { await saveCompanyAchievement(companyId, draft, editing); if (companyRef.current === target) setRevision(n => n + 1); }
    catch (failure) { if (companyRef.current === target) setError(failure instanceof Error ? failure.message : (failure as { message?: string })?.message ?? 'Nao foi possivel salvar a conquista.'); }
    finally { pendingSave.current = false; setSaving(false); }
  };
  return <section className="space-y-4" aria-label="Conquistas da empresa">
    <PlatformExperienceAdoption key={companyId} companyId={companyId} />
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Conquistas</h2>
      <Button type="button" variant="outline" disabled={loadedCompany !== companyId || saving} onClick={() => { setEditing(undefined); setDraft({ ...empty }); }}><Plus className="mr-2 h-4 w-4" />Nova conquista</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="divide-y">{(loadedCompany === companyId ? rows : []).map(row => <div key={row.id} className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1"><p className="font-medium break-words">{row.title}</p><p className="text-sm text-muted-foreground">{labels[row.criteria_type] ?? row.criteria_type}: {row.criteria_value} · {row.xp_reward} XP · {row.is_active ? 'Ativa' : 'Inativa'}</p></div>
      <Button type="button" size="icon" variant="ghost" disabled={saving} title={`Editar ${row.title}`} aria-label={`Editar ${row.title}`} onClick={() => {
        setEditing(row); setDraft({ code: row.code, title: row.title, description: row.description ?? '', criteria_type: row.criteria_type, criteria_value: row.criteria_value, xp_reward: row.xp_reward, is_active: row.is_active });
      }}><Pencil className="h-4 w-4" /></Button></div>)}</div>
    {draft && loadedCompany === companyId && <div className="space-y-4 border-t pt-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="achievement-code">Codigo</Label><SettingHelp label="Codigo" what="Identificador estável da conquista nesta empresa." edits="De 2 a 64 caracteres; comece com letra minúscula e use apenas letras minúsculas, números e sublinhados." effect="Definido na criação e bloqueado na edição. Salvar a definição não concede a conquista imediatamente." /><Input id="achievement-code" value={draft.code} disabled={Boolean(editing) || saving} onChange={e => setDraft({ ...draft, code: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="achievement-title">Titulo</Label><SettingHelp label="Titulo" what="Nome da conquista exibido no catálogo." edits="Título obrigatório de até 120 caracteres." effect="Atualiza a definição após Salvar conquista. Não recalcula XP nem apaga conquistas já obtidas." /><Input id="achievement-title" value={draft.title} maxLength={120} onChange={e => setDraft({ ...draft, title: e.target.value })} /></div></div>
      <div className="space-y-2"><Label htmlFor="achievement-description">Descricao</Label><SettingHelp label="Descricao" what="Texto de apresentação da conquista." edits="Até 1000 caracteres." effect="Atualiza a descrição do catálogo; não modifica a contagem do critério nem concede pontos ao salvar." /><Textarea id="achievement-description" value={draft.description} maxLength={1000} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
      <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Criterio</Label><SettingHelp label="Criterio da conquista" what="Tipo de ocorrência contabilizada para a meta." edits="Treinos concluídos, atividades externas ou ciclos concluídos." effect="Usado na próxima verificação de conquistas, com gamificação ativa. Considera contagens elegíveis e desconta a base de adoção quando existir; não redefine contadores ao editar." /><Select value={draft.criteria_type} onValueChange={criteria_type => setDraft({ ...draft, criteria_type })}><SelectTrigger aria-label="Criterio da conquista"><SelectValue /></SelectTrigger><SelectContent>{ACHIEVEMENT_CRITERIA.map(k => <SelectItem key={k} value={k}>{labels[k]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="achievement-goal">Meta</Label><SettingHelp label="Meta" what="Quantidade mínima de ocorrências do critério selecionado." edits="Número inteiro de 1 a 10000." effect="Após salvar, vale na próxima verificação elegível; contagens existentes podem satisfazer a nova meta. Não desbloqueia ao salvar nem remove conquistas já obtidas." /><Input id="achievement-goal" type="number" min={1} max={10000} value={draft.criteria_value} onChange={e => setDraft({ ...draft, criteria_value: Number(e.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="achievement-xp">Pontos</Label><SettingHelp label="Pontos" what="Recompensa de XP por desbloqueio desta conquista." edits="Número inteiro de 0 a 10000." effect="Usada na concessão de XP de desbloqueios elegíveis. Não recalcula eventos de XP já registrados nem concede pontos ao salvar." /><Input id="achievement-xp" type="number" min={0} max={10000} value={draft.xp_reward} onChange={e => setDraft({ ...draft, xp_reward: Number(e.target.value) })} /></div></div>
      <div className="flex items-center gap-2"><Switch id="achievement-active" checked={draft.is_active} onCheckedChange={is_active => setDraft({ ...draft, is_active })} /><Label htmlFor="achievement-active">Ativa</Label><SettingHelp label="Ativa" what="Participação da conquista nas verificações de desbloqueio." edits="Ative para permitir novas verificações ou desative para excluí-la delas." effect="Após salvar, a desativação impede novos desbloqueios desta definição. Conquistas obtidas e XP registrados permanecem preservados." /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setDraft(null)}><X className="mr-2 h-4 w-4" />Cancelar</Button><Button type="button" disabled={saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Salvar conquista</Button></div>
    </div>}
  </section>;
}
