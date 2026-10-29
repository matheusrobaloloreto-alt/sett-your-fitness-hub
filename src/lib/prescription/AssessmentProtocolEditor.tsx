import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { APPROVED_ASSESSMENT_TESTS, fetchCompanyAssessmentProtocol, saveCompanyAssessmentProtocol, isAssessmentProtocolConflict, type AssessmentProtocolRecord, type CompanyAssessmentProtocol } from './companyAssessmentProtocol';

export default function AssessmentProtocolEditor({ companyId }: { companyId: string }) {
  const { role } = useAuth();
  const authorized = role === 'admin' || role === 'master';
  const request = useRef(0);
  const companyRef = useRef(companyId); companyRef.current = companyId;
  const [record, setRecord] = useState<AssessmentProtocolRecord | null>(null);
  const [draft, setDraft] = useState<CompanyAssessmentProtocol | null>(null);
  const [loadedCompany, setLoadedCompany] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [refresh, setRefresh] = useState(0);
  const [editingId, setEditingId] = useState('posture_anterior');
  useEffect(() => {
    const epoch = ++request.current;
    setRecord(null); setDraft(null); setLoadedCompany(''); setError(''); setNotice(''); setBusy(false);
    if (!authorized || !companyId) return;
    void fetchCompanyAssessmentProtocol(companyId).then(value => {
      if (request.current !== epoch) return;
      setRecord(value); setDraft(structuredClone(value.protocol)); setLoadedCompany(companyId);
    }).catch(reason => { if (request.current === epoch) setError(reason instanceof Error ? reason.message : 'Falha ao carregar protocolo.'); });
    return () => { request.current += 1; };
  }, [authorized, companyId, refresh]);
  if (!authorized) return null;
  if (!draft || !record || loadedCompany !== companyId) return error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Recarregar protocolo</Button></div> : <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando protocolo" />;

  const change = (index: number, patch: Partial<CompanyAssessmentProtocol['tests'][number]>) => {
    setDraft(current => current ? { ...current, tests: current.tests.map((test, position) => position === index ? { ...test, ...patch } : test) } : null); setNotice('');
  };
  const move = (index: number, offset: number) => {
    setDraft(current => {
      if (!current || index + offset < 0 || index + offset >= current.tests.length) return current;
      const tests = [...current.tests]; [tests[index], tests[index + offset]] = [tests[index + offset], tests[index]];
      return { ...current, tests };
    }); setNotice('');
  };
  const save = async () => {
    if (busy || !draft || !record || loadedCompany !== companyId) return;
    const target = companyId; const epoch = request.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveCompanyAssessmentProtocol(target, draft, record.version);
      const confirmed = await fetchCompanyAssessmentProtocol(target);
      if (companyRef.current !== target || request.current !== epoch) return;
      if (confirmed.version !== saved.version || JSON.stringify(confirmed.protocol) !== JSON.stringify(saved.protocol)) throw new Error('A leitura nao confirmou a versao salva. Recarregue.');
      setRecord(confirmed); setDraft(structuredClone(confirmed.protocol)); setNotice('Protocolo salvo.');
    } catch (reason) {
      if (companyRef.current === target && request.current === epoch) setError(isAssessmentProtocolConflict(reason) ? 'Conflito de versao. Rascunho mantido; recarregue antes de salvar.' : reason instanceof Error ? reason.message : 'Falha ao salvar protocolo.');
    } finally { if (request.current === epoch) setBusy(false); }
  };
  return <section aria-label="Protocolo funcional da empresa" className="space-y-4 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Protocolo funcional</h3><span className="text-xs text-muted-foreground">Versao {record.version}</span></div>
    <p className="text-xs text-muted-foreground">Escala: Ausente · Incerta · Leve · Moderada · Severa</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <ol className="divide-y">{draft.tests.map((test, index) => {
      const definition = APPROVED_ASSESSMENT_TESTS.find(entry => entry.id === test.id)!;
      return <li key={test.id} className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Incluir ${definition.canonical}`} disabled={busy || definition.required} checked={test.enabled} onChange={event => change(index, { enabled: event.target.checked })} />{definition.canonical} {definition.required && <span className="text-xs text-muted-foreground">Obrigatorio</span>}</label>
          <div className="flex gap-1"><Button type="button" size="icon" variant="ghost" title={`Editar ${definition.canonical}`} aria-label={`Editar ${definition.canonical}`} disabled={busy} onClick={() => setEditingId(test.id)}><Pencil className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title={`Subir ${definition.canonical}`} aria-label={`Subir ${definition.canonical}`} disabled={busy || index === 0} onClick={() => move(index,-1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title={`Descer ${definition.canonical}`} aria-label={`Descer ${definition.canonical}`} disabled={busy || index === draft.tests.length - 1} onClick={() => move(index,1)}><ArrowDown className="h-4 w-4" /></Button></div></div>
        {editingId === test.id && <><div className="space-y-1"><Label htmlFor={`assessment-label-${test.id}`}>Rotulo de {definition.canonical}</Label><Input id={`assessment-label-${test.id}`} value={test.label} maxLength={120} disabled={busy} onChange={event => change(index, { label: event.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor={`assessment-guidance-${test.id}`}>Orientacoes de {definition.canonical}</Label><Textarea id={`assessment-guidance-${test.id}`} value={test.instructions} maxLength={600} disabled={busy} onChange={event => change(index, { instructions: event.target.value })} /></div></>}
      </li>;
    })}</ol>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Recarregar protocolo</Button><Button disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar protocolo</Button></div>
  </section>;
}
