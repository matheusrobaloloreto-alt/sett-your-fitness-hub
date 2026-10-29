import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingHelp } from './SettingHelp';
import { fetchCompanyProductSettings, saveCompanyProductSettings, type SettingsRecord } from '@/lib/companyProductSettings';

const fields = [
  ['installments_short', 'Parcelas máximas: planos de 6 semanas'],
  ['installments_medium', 'Parcelas máximas: planos de 24 semanas'],
  ['installments_long', 'Parcelas máximas: planos de 48 semanas'],
] as const;
/** Company policy: these are not plan-specific overrides. Saving uses the product settings CAS. */
export function PlanPaymentSettings({ companyId }: { companyId: string }) {
  const [record, setRecord] = useState<SettingsRecord | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const dirty = Boolean(record && fields.some(([key]) => draft[key] !== record.settings.business[key]));
  useEffect(() => {
    const generation = ++epoch.current;
    setRecord(null); setError(''); setNotice(''); setBusy(false); inFlight.current = false;
    void fetchCompanyProductSettings(companyId).then(value => {
      if (generation !== epoch.current) return;
      setRecord(value); setDraft(Object.fromEntries(fields.map(([key]) => [key, value.settings.business[key]])));
    }).catch(() => { if (generation === epoch.current) setError('Não foi possível carregar a política de parcelamento.'); });
    return () => { epoch.current = generation + 1; };
  }, [companyId, refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    if (!record || inFlight.current || !dirty) return;
    if (fields.some(([key]) => !Number.isInteger(draft[key]) || draft[key] < 1 || draft[key] > 12)) { setError('Use números inteiros de 1 a 12.'); return; }
    const generation = epoch.current;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      // Preserve every other setting, including message sequences, and reject concurrent versions.
      const settings = { ...record.settings, business: { ...record.settings.business, ...draft } };
      const updated = await saveCompanyProductSettings(companyId, settings, record.version);
      if (generation === epoch.current) { setRecord(updated); setNotice('Política de parcelamento salva.'); }
    } catch (cause) {
      if (generation === epoch.current) setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Recarregue após preservar o rascunho.');
    } finally { if (generation === epoch.current) { inFlight.current = false; setBusy(false); } }
  }
  return <section aria-label="Configurações de pagamento dos planos" className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Configurações de pagamento dos planos</h2>
    <p className="text-sm text-muted-foreground">Política global da empresa, por duração. Outras durações permanecem em uma parcela. Alterar estes limites não inicia cobranças nem modifica pagamentos existentes.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!record && !error && <p role="status">Carregando política de parcelamento…</p>}
    {record && <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">{fields.map(([key, label]) => <div key={key}>
      <span className="inline-flex items-center"><Label htmlFor={key}>{label}</Label><SettingHelp label={label} what="Limite global de parcelas para esta duração de plano." edits="Número inteiro de 1 a 12 parcelas." effect="Consultado na validação de novas solicitações de pagamento; depende da integração disponível. Não altera cobranças existentes nem cria uma regra individual por plano." /></span>
      <Input id={key} type="number" min={1} max={12} step={1} value={Number.isNaN(draft[key]) ? '' : draft[key]} onChange={event => { setDraft(previous => ({ ...previous, [key]: event.target.value === '' ? Number.NaN : Number(event.target.value) })); setNotice(''); }} />
    </div>)}</fieldset>}
    <div className="flex gap-2"><Button type="button" disabled={!record || !dirty || busy} onClick={() => void save()}>Salvar parcelamento</Button><Button type="button" variant="outline" disabled={busy || dirty} onClick={() => setRefresh(value => value + 1)}>Recarregar parcelamento</Button>{dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (record) setDraft(Object.fromEntries(fields.map(([key]) => [key, record.settings.business[key]]))); setError(''); }}>Descartar parcelamento</Button>}</div>
  </section>;
}
