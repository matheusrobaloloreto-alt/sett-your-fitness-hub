import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsDraft } from '@/lib/settingsDraftProtection';

const columns = 'id,name,is_active,weekly_contact_interval_hours,weekly_contact_inactivity_hours' as const;
const interval = 'weekly_contact_interval_hours';
const inactivity = 'weekly_contact_inactivity_hours';
type Rule = typeof interval | typeof inactivity;
type Rules = Record<Rule, number>;
type Flow = Rules & { id: string; name: string; is_active: boolean };
const rules = [
  { key: interval, label: 'Exigir intervalo adicional entre contatos semanais', hours: 'Intervalo entre contatos semanais (h)', defaultHours: 168 },
  { key: inactivity, label: 'Exigir inatividade no WhatsApp', hours: 'Tempo sem conversa no WhatsApp (h)', defaultHours: 24 },
] as const;

export function WeeklyContactSettings({ companyId, flowId, preferredFlowId, companyMinimum, onPendingChange }: {
  companyId: string; flowId?: string; preferredFlowId?: string; companyMinimum?: number;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<Record<Rule, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const activeRequest = useRef<object | null>(null);
  const writing = useRef(false);
  const current = flows.find(flow => flow.id === selected);
  const dirty = Boolean(current && draft && rules.some(({ key }) => draft[key] !== String(current[key])));
  const pending = dirty || saving;
  useSettingsDraft(pending);
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending]);

  useEffect(() => {
    const request = {};
    activeRequest.current = request;
    setLoading(true); setError(''); setNotice(''); setNeedsReload(false);
    setFlows([]); setDraft(null);
    void (async () => {
      try {
        let query = supabase.from('automation_flows').select(columns)
          .eq('company_id', companyId).eq('trigger_type', 'weekly_contact');
        if (flowId) query = query.eq('id', flowId);
        const { data, error: readError } = await query.order('name').order('id').overrideTypes<Flow[], { merge: false }>();
        if (activeRequest.current !== request) return;
        if (readError || !data) throw new Error('weekly_contact_conditions_unavailable');
        setFlows(data);
        setSelected(previous => {
          const scopedSelection = data.find(flow => flow.id === (previous || preferredFlowId));
          return scopedSelection?.id ?? data[0]?.id ?? '';
        });
      } catch {
        if (activeRequest.current === request) {
          setError('Não foi possível ler as condições de contato semanal neste ambiente.');
        }
      } finally {
        if (activeRequest.current === request) setLoading(false);
      }
    })();
    return () => { activeRequest.current = null; };
  }, [companyId, flowId, preferredFlowId, refresh]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const request = activeRequest.current;
    if (writing.current || needsReload || !dirty || !current || !draft || !request) return;
    const next = { [interval]: Number(draft[interval]), [inactivity]: Number(draft[inactivity]) };
    if (rules.some(({ key }) => !draft[key].trim() || !Number.isInteger(next[key]) || next[key] < 0 || next[key] > 720)) {
      setError('Informe um número inteiro de 1 a 720 horas em cada condição ativada.');
      return;
    }
    writing.current = true;
    setSaving(true); setError(''); setNotice('');
    try {
      const { data, error: writeError } = await supabase.from('automation_flows').update(next)
        .eq('id', current.id).eq('company_id', companyId).eq('trigger_type', 'weekly_contact')
        .filter(interval, 'eq', current[interval]).eq(inactivity, current[inactivity])
        .select(columns).overrideTypes<Flow[], { merge: false }>();
      if (activeRequest.current !== request) return;
      if (writeError || data?.length !== 1 || data[0].id !== current.id
        || rules.some(({ key }) => data[0][key] !== next[key])) throw new Error('weekly_contact_conditions_unconfirmed');
      const confirmed = data[0];
      setFlows(previous => previous.map(flow => flow.id === confirmed.id ? confirmed : flow));
      setDraft(null); setNotice('Condições do fluxo salvas.');
    } catch {
      if (activeRequest.current === request) {
        setNeedsReload(true);
        setError('Não foi possível confirmar o salvamento. Seu rascunho foi mantido. Recarregue os valores salvos antes de reaplicar.');
      }
    } finally {
      writing.current = false;
      if (activeRequest.current === request) setSaving(false);
    }
  }

  return <section aria-label="Contato semanal por WhatsApp" className="space-y-3 rounded-md border border-border p-4">
    <h2 className="font-semibold">Contato semanal por WhatsApp</h2>
    <p className="text-sm text-muted-foreground">O consentimento do aluno, a janela de envio, o teto em sete dias e o intervalo mínimo da empresa{companyMinimum !== undefined ? ` (${companyMinimum} h salvas)` : ''} continuam valendo. Quando as duas condições abaixo estão ligadas, ambas precisam ser cumpridas. Com as duas desligadas, valem as proteções obrigatórias.</p>
    {loading && <p role="status">Carregando condições do contato semanal…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {dirty && !needsReload && <p className="text-sm text-muted-foreground">Alterações do fluxo pendentes.</p>}
    {!loading && !error && !current && <p className="text-sm text-muted-foreground">Nenhum fluxo semanal disponível nesta empresa.</p>}
    {current && <form onSubmit={save} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>Fluxo de contato semanal</span>
        <select className="block h-10 w-full max-w-lg rounded-md border border-input bg-background px-3"
          disabled={dirty || saving || flows.length === 1} value={current.id}
          onChange={event => { setSelected(event.target.value); setDraft(null); setError(''); setNotice(''); }}>
          {flows.map(flow => <option key={flow.id} value={flow.id}>{flow.name} · {flow.is_active ? 'Ativo' : 'Inativo'}</option>)}
        </select>
      </label>
      {flows.length > 1 && <p className="text-sm text-muted-foreground">As condições valem para o fluxo selecionado. Outro fluxo semanal ativo pode ser elegível com as próprias condições.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{rules.map(rule => {
        const value = draft?.[rule.key] ?? String(current[rule.key]);
        const enabled = value !== '0';
        const change = (next: string) => {
          setDraft(previous => ({ [interval]: String(current[interval]), [inactivity]: String(current[inactivity]), ...previous, [rule.key]: next }));
          setNotice('');
          if (!needsReload) setError('');
        };
        return <div className="space-y-2" key={rule.key}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={saving}
            onChange={event => change(event.target.checked ? String(current[rule.key] || rule.defaultHours) : '0')} />{rule.label}</label>
          {enabled && <label className="block max-w-xs space-y-1 text-sm"><span>{rule.hours}</span>
            <Input type="number" min={1} max={720} step={1} required disabled={saving} value={value} onChange={event => change(event.target.value === '0' ? '' : event.target.value)} />
          </label>}
          <p className="text-xs text-muted-foreground">{rule.key === interval
            ? 'Vale o maior prazo entre esta condição e o intervalo mínimo da empresa.'
            : 'Mensagens do aluno e envios manuais da equipe reiniciam a espera. Envios reconhecidos como automação não contam.'}</p>
        </div>;
      })}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!dirty || saving || needsReload}>Salvar condições do fluxo</Button>
        {dirty && !needsReload && <Button type="button" size="sm" variant="outline" disabled={saving}
          onClick={() => { setDraft(null); setError(''); }}>Descartar alterações do fluxo</Button>}
      </div>
    </form>}
    {!loading && (!dirty || needsReload) && <Button type="button" size="sm" variant="outline" disabled={saving}
      onClick={() => setRefresh(value => value + 1)}>{needsReload ? 'Descartar rascunho e recarregar condições' : 'Recarregar condições do fluxo'}</Button>}
  </section>;
}
