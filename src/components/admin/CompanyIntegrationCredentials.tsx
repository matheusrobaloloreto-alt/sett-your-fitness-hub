import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMaster } from '@/contexts/MasterContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingHelp } from './SettingHelp';
import { fetchIntegrationStatus, saveIntegrationCredentials, removeIntegrationCredentials, type IntegrationProvider, type IntegrationStatus } from '@/lib/companyIntegrationCredentials';
const LABELS: Record<IntegrationProvider, string> = { asaas: 'Asaas', whatsapp_evolution: 'WhatsApp Evolution' };
const unavailable = 'Não foi possível preparar a integração. Confira acesso e disponibilidade do cofre.';
function CredentialForm({ row, busy, onSave, onRemove }: { row: IntegrationStatus; busy: boolean; onSave: (key: string, option: string) => Promise<void>; onRemove: () => Promise<void> }) {
  const [key, setKey] = useState('');
  const [option, setOption] = useState(row.provider === 'asaas' ? 'sandbox' : '');
  const id = `integration-${row.provider}`;
  const valid = /^[!-~]{16,4096}$/.test(key) && (row.provider === 'asaas' || option.startsWith('https://'));
  async function submit() {
    const entered = key;
    setKey(''); // Write-only: clear even when save fails or conflicts.
    await onSave(entered, option);
  }
  return <section className="space-y-4 rounded-xl border border-border p-4" aria-label={`Preparação ${LABELS[row.provider]}`}>
    <h3 className="font-semibold">{LABELS[row.provider]}</h3>
    <p>{row.configured ? 'Chave preparada neste cofre — ativação futura' : 'Nenhuma chave salva neste cofre'}{row.mask ? ` · ${row.mask}` : ''}</p>
    <div className="space-y-2"><div className="flex items-center gap-2"><Label htmlFor={`${id}-key`}>Nova chave {LABELS[row.provider]}</Label><SettingHelp label={`Nova chave ${LABELS[row.provider]}`} what="Credencial privada da API, gravada no cofre desta empresa e ocultada após salvar." edits="Preparar substitui somente a chave preparada, usando controle de versão." effect="Esta preparação ainda não muda as credenciais do servidor, a conexão atual nem as cobranças. A ativação por empresa exige uma etapa posterior." /></div>
      <Input id={`${id}-key`} type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} value={key} disabled={busy} onChange={event => setKey(event.target.value)} />
    </div>
    {row.provider === 'asaas' ? <div className="space-y-2"><div className="flex items-center gap-2"><Label htmlFor={`${id}-option`}>Ambiente Asaas</Label><SettingHelp label="Ambiente Asaas" what="Identifica se a nova chave preparada pertence ao ambiente de testes ou de produção." edits="Salva o ambiente junto da chave preparada para a empresa." effect="Sandbox é destinado a testes. Selecionar produção aqui ainda não ativa cobranças nem altera o ambiente usado pelo servidor." /></div>
      <select id={`${id}-option`} className="h-10 rounded-md border border-input bg-background px-3" value={option} disabled={busy} onChange={event => setOption(event.target.value)}><option value="sandbox">Sandbox</option><option value="production">Produção</option></select>
    </div> : <div className="space-y-2"><div className="flex items-center gap-2"><Label htmlFor={`${id}-option`}>Base HTTPS Evolution</Label><SettingHelp label="Base HTTPS Evolution" what="Endereço seguro da API Evolution correspondente à nova chave preparada." edits="Define o destino que ficará associado à credencial preparada desta empresa." effect="Preparar este endereço não transfere nem recria a sessão WhatsApp existente. O servidor atual continua sendo utilizado até uma ativação controlada." /></div><Input id={`${id}-option`} type="url" autoComplete="off" value={option} disabled={busy} onChange={event => setOption(event.target.value)} placeholder="https://provedor.exemplo.com" /></div>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !valid} onClick={() => void submit()}>Preparar {LABELS[row.provider]}</Button>
      <Button variant="outline" disabled={busy || !row.configured} onClick={() => { setKey(''); void onRemove(); }}>Remover {LABELS[row.provider]}</Button><SettingHelp label={`Remover chave preparada ${LABELS[row.provider]}`} what="Remove a credencial preparada deste cofre." edits="Exclui a chave preparada para esta empresa, mantendo o controle de versão." effect="Não desconecta a instância WhatsApp nem remove as credenciais atuais do servidor." /></div>
  </section>;
}
export default function CompanyIntegrationCredentials({ companyId }: { companyId: string }) {
  const auth = useAuth();
  const master = useMaster();
  const authorized = Boolean(companyId && ((auth.role === 'admin' && auth.companyId === companyId)
    || (auth.role === 'master' && master.isViewingCompany && master.viewingCompany?.id === companyId)));
  const [rows, setRows] = useState<IntegrationStatus[] | null>(null);
  const [loadedCompany, setLoadedCompany] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const current = useRef({ companyId, authorized });
  current.current = { companyId, authorized };
  useEffect(() => {
    const generation = ++epoch.current;
    setRows(null); setLoadedCompany(null); setBusy(false); setError(''); setNotice('');
    if (!authorized) return;
    void fetchIntegrationStatus(companyId).then(result => {
      if (generation !== epoch.current) return;
      setRows(result); setLoadedCompany(companyId);
    }).catch(() => { if (generation === epoch.current) setError(unavailable); });
    return () => { epoch.current += 1; };
  }, [companyId, authorized, refresh]);
  async function mutate(row: IntegrationStatus, key?: string, option?: string) {
    if (busy || !authorized || loadedCompany !== companyId) return;
    const target = companyId;
    const generation = ++epoch.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = key === undefined
        ? await removeIntegrationCredentials(target, row.provider, row.version)
        : await saveIntegrationCredentials(target, row.provider, row.provider === 'asaas'
          ? { api_key: key, environment: option === 'production' ? 'production' : 'sandbox' }
          : { api_key: key, base_url: option || '' }, row.version);
      if (generation !== epoch.current || current.current.companyId !== target || !current.current.authorized) return;
      setRows(result); setNotice(key === undefined ? 'Credencial preparada removida.' : 'Credencial preparada. Validade no provedor não verificada; uso desativado.');
    } catch (reason) {
      if (generation === epoch.current && current.current.companyId === target && current.current.authorized) {
        setError(reason instanceof Error && reason.message.startsWith('Outra pessoa alterou')
          ? 'Outra pessoa alterou a integração. Recarregue antes de tentar novamente.' : unavailable);
      }
    } finally { if (generation === epoch.current) setBusy(false); }
  }
  if (!authorized) return <p role="alert">A preparação de integrações exige administrador da empresa ou master com empresa selecionada.</p>;
  return <section className="space-y-4" aria-label="Credenciais de integração">
    <h2 className="text-lg font-semibold">Preparar integrações</h2>
    <p className="text-sm text-muted-foreground">Asaas e WhatsApp Evolution: cofre da empresa, com chave oculta após salvar. Somente o formato é validado. Esta preparação não conecta provedores nem altera cobranças ou a conexão WhatsApp atual. Z-API não está incluída nesta preparação.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Recarregar estado das integrações</Button>
    {rows && loadedCompany === companyId ? <div className="grid gap-4 lg:grid-cols-2">{rows.map(row => <CredentialForm key={`${companyId}:${row.provider}:${row.version}`} row={row} busy={busy}
      onSave={(key, option) => mutate(row, key, option)} onRemove={() => mutate(row)} />)}</div> : !error && <p>Carregando estado das integrações…</p>}
  </section>;
}
