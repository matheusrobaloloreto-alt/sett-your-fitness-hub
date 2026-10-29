import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Save, Undo2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMaster } from '@/contexts/MasterContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'react-router-dom';
import { SettingHelp } from '@/components/admin/SettingHelp';
import { settingsHelpRegistry } from '@/components/admin/settingsHelpRegistry';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import SettingsWorkspaceLinks from '@/components/admin/SettingsWorkspaceLinks';
import { PrescriptionMethodologyEditor } from '@/components/admin/PrescriptionMethodologyEditor';
import { WhatsAppSequenceEditor } from '@/components/admin/WhatsAppSequenceEditor';
import { displayMessageSequence, editMessageSequence, isWhatsAppEvent, type SequenceSettings } from '@/lib/companyMessageSequences';
import { renderCompanyMessage } from '../../../supabase/functions/_shared/communication-policy';
import {
  fetchCompanyProductSettings, saveCompanyProductSettings, normalizeCompanyProductSettings,
  getMessageEventVariables, validateMessageTemplate, type CompanyProductSettings, type MessageEvent, type SettingsRecord,
} from '@/lib/companyProductSettings';

const FormDefinitionManager = lazy(() => import('@/components/admin/FormDefinitionManager'));
const CompanyAchievements = lazy(() => import('@/components/admin/CompanyAchievements'));
const CompanyCommercialSettings = lazy(() => import('@/components/admin/CompanyCommercialSettings'));
const CompanyIntegrations = lazy(() => import('@/components/admin/CompanyIntegrations'));
type Section = 'messages' | 'contact_policy' | 'forms' | 'prescription' | 'brand' | 'experience' | 'integrations';
const SECTIONS: Array<[Section, string]> = [
  ['messages', 'Mensagens'], ['contact_policy', 'Contatos'], ['forms', 'Formulários'],
  ['prescription', 'Prescrição'], ['brand', 'Identidade'], ['experience', 'Experiência'], ['integrations', 'Integrações'],
];
const MESSAGE_LABELS: Record<MessageEvent, string> = {
  weekly_contact: 'Contato semanal', pre_registration_confirmation: 'Confirmação do pré-cadastro',
  fiscal_invite: 'Convite ao cadastro fiscal', payment_link: 'Link de pagamento',
  assessment_onboarding: 'Pagamento confirmado e avaliação', anamnesis_invite: 'Convite à anamnese',
  renewal_due: 'Renovação próxima', renewal_overdue: 'Renovação pendente',
  intercycle_invite: 'Convite interciclos', first_contact: 'Primeiro contato',
  daily_reminder_title: 'Lembrete diário: título', daily_reminder_body: 'Lembrete diário: mensagem',
  new_workout_push_title: 'Novo treino: título', new_workout_push_body: 'Novo treino: mensagem',
};
type NumericField = { key: string; label: string; min: number; max: number; step?: number };
const CONTACT_FIELDS: NumericField[] = [
  { key: 'max_weekly_contacts', label: 'Limite de contatos em sete dias', min: 1, max: 2 },
  { key: 'minimum_interval_hours', label: 'Intervalo mínimo entre contatos (h)', min: 72, max: 168 },
  { key: 'no_workout_days', label: 'Ausência de treino (dias)', min: 7, max: 90 },
  { key: 'no_workout_repeat_days', label: 'Intervalo de recuperação de contato (dias)', min: 6, max: 90 },
  { key: 'cart_abandonment_hours', label: 'Espera por abandono do pagamento (h)', min: 2, max: 720 },
  { key: 'payment_repeat_hours', label: 'Intervalo de lembrete de pagamento (h)', min: 24, max: 720 },
  { key: 'start_hour', label: 'Início dos envios (hora)', min: 0, max: 23 },
  { key: 'end_hour', label: 'Fim dos envios (hora)', min: 1, max: 24 },
];
const EXPERIENCE_FIELDS: NumericField[] = [
  { key: 'cadence_warning_hours', label: 'Contato em atenção após (h)', min: 1, max: 720 },
  { key: 'cadence_critical_hours', label: 'Contato crítico após (h)', min: 1, max: 720 },
  { key: 'risk_no_workout_days', label: 'Risco por ausência de treino (dias)', min: 1, max: 90 },
  { key: 'renewal_notice_days', label: 'Antecedência da renovação (dias)', min: 1, max: 90 },
  { key: 'xp_workout', label: 'Pontos por treino', min: 0, max: 10000 },
  { key: 'xp_external_activity', label: 'Pontos por atividade externa', min: 0, max: 10000 },
  { key: 'weekly_consistency_xp', label: 'Pontos por consistência semanal', min: 0, max: 10000 },
];
const PRESCRIPTION_FIELDS: NumericField[] = [
  { key: 'beginner_max_weekly_sets', label: 'Teto semanal de séries para iniciantes', min: 1, max: 21 },
  { key: 'first_week_volume_multiplier', label: 'Multiplicador de volume na primeira semana', min: 0.5, max: 1, step: 0.05 },
  { key: 'endurance_strength_multiplier', label: 'Multiplicador de força com endurance', min: 0.5, max: 1, step: 0.05 },
];
const ASSESSMENT_FIELDS: NumericField[] = [{ key: 'assessment_sla_business_days', label: 'Prazo para avaliação e treino (dias úteis)', min: 1, max: 30 }];

function HelpLabel({ htmlFor, helpKey, children }: { htmlFor: string; helpKey?: string; children: string }) {
  return <span className="inline-flex items-center gap-1"><Label htmlFor={htmlFor}>{children}</Label><SettingHelp label={children} {...settingsHelpRegistry[helpKey ?? htmlFor]} /></span>;
}

function errorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'PT409' || code === '40001' || code === '409') return 'Outra pessoa alterou esta configuração. Seu rascunho foi mantido. Recarregue antes de salvar novamente.';
  if (code === '42501') return 'Seu acesso não permite alterar as configurações desta empresa.';
  if (code === 'PGRST202' || code === '42P01' || code === 'PGRST205') return 'O banco deste ambiente ainda não está preparado para salvar as configurações.';
  if (error instanceof Error) return error.message;
  return 'Não foi possível salvar. O rascunho foi mantido.';
}

export default function ProductSettings() {
  const { role, companyId: authCompanyId } = useAuth();
  const { isViewingCompany, viewingCompany } = useMaster();
  const companyId = role === 'master' ? (isViewingCompany ? viewingCompany?.id : null) : authCompanyId;
  const authorized = role === 'admin' || role === 'master';
  const companyRef = useRef(companyId);
  const saveEpoch = useRef(0);
  companyRef.current = companyId;
  const [record, setRecord] = useState<SettingsRecord | null>(null);
  const [draft, setDraft] = useState<SequenceSettings | null>(null);
  const [loadedCompany, setLoadedCompany] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('tab');
  const section: Section = SECTIONS.find(([key]) => key === requestedSection)?.[0] ?? 'messages';
  const setSection = (key: Section) => setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('tab', key); return next; }, { replace: true });
  const [event, setEvent] = useState<MessageEvent>('weekly_contact');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const dirty = Boolean(record && draft && JSON.stringify(record.settings) !== JSON.stringify(draft));

  useEffect(() => {
    let active = true;
    saveEpoch.current += 1;
    setSaving(false); setUploadingMedia(false);
    setRecord(null); setDraft(null); setLoadedCompany(null); setError(''); setNotice('');
    if (!authorized || !companyId) return;
    void fetchCompanyProductSettings(companyId).then(result => {
      if (!active) return;
      setRecord(result); setDraft(structuredClone(result.settings)); setLoadedCompany(companyId);
    }).catch(reason => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; saveEpoch.current += 1; };
  }, [authorized, companyId, refresh]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change<K extends keyof CompanyProductSettings>(key: K, field: keyof CompanyProductSettings[K], value: unknown) {
    setDraft(current => current ? { ...current, [key]: { ...current[key], [field]: value } } : current);
    setError(''); setNotice('');
  }
  async function save() {
    if (!draft || !record || !companyId || saving || uploadingMedia || loadedCompany !== companyId) return;
    const target = companyId;
    const epoch = ++saveEpoch.current;
    setSaving(true); setError(''); setNotice('');
    try {
      const updated = await saveCompanyProductSettings(target, normalizeCompanyProductSettings(draft), record.version);
      if (companyRef.current !== target || saveEpoch.current !== epoch) return;
      setRecord(updated); setDraft(structuredClone(updated.settings)); setNotice('Configurações salvas.');
    } catch (reason) { if (companyRef.current === target && saveEpoch.current === epoch) setError(errorMessage(reason)); }
    finally { if (saveEpoch.current === epoch) setSaving(false); }
  }
  function numbers(key: 'contact_policy' | 'experience' | 'prescription' | 'business', fields: NumericField[]) {
    if (!draft) return null;
    return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{fields.map(field => {
      const values = draft[key] as unknown as Record<string, unknown>;
      const id = `${key}-${field.key}`;
      return <div key={id} className="space-y-2"><HelpLabel htmlFor={id} helpKey={field.key}>{field.label}</HelpLabel>
        <Input id={id} type="number" min={field.min} max={field.max} step={field.step ?? 1}
          value={Number.isNaN(values[field.key]) ? '' : String(values[field.key])}
          onChange={e => change(key, field.key as never, e.target.value === '' ? Number.NaN : Number(e.target.value))} />
      </div>;
    })}</div>;
  }

  if (!authorized) return <p role="alert" className="p-6">As configurações da empresa exigem acesso de administrador.</p>;
  if (!companyId) return <p className="p-6">Selecione uma empresa no painel master.</p>;
  if (!draft || !record || loadedCompany !== companyId) return <div className="p-6">{error
    ? <div role="alert" className="space-y-3"><p>{error}</p><Button variant="outline" onClick={() => setRefresh(v => v + 1)}>Tentar novamente</Button></div>
    : <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando configurações" />}</div>;

  const previewValues: Record<string, string> = {
    primeiro_nome: 'Ana', nome: 'Ana Exemplo', empresa: draft.brand.company_name || viewingCompany?.name || 'Sua empresa',
    link: 'https://exemplo.invalid/convite', prazo: String(draft.business.assessment_sla_business_days),
    profissional: draft.brand.professional_name || 'Profissional', email: 'ana@exemplo.invalid', data: '30/11/2026',
  };
  let preview: string;
  try { validateMessageTemplate(draft.messages[event], event); preview = renderCompanyMessage(draft.messages[event], previewValues); }
  catch { preview = 'Revise as variáveis da mensagem.'; }
  return <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><h1 className="text-2xl font-semibold">Configurações da empresa</h1>
        <p className="mt-1 text-sm text-muted-foreground">{draft.brand.company_name || viewingCompany?.name || 'Minha empresa'} · <span>Versão {record.version}</span></p></div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" title="Recarregar" aria-label="Recarregar configurações" disabled={saving || uploadingMedia || dirty} onClick={() => setRefresh(v => v + 1)}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" title="Descartar alterações" aria-label="Descartar alterações" disabled={!dirty || saving || uploadingMedia} onClick={() => { setDraft(structuredClone(record.settings)); setError(''); setNotice(''); }}><Undo2 className="h-4 w-4" /></Button>
        <Button disabled={!dirty || saving || uploadingMedia} onClick={() => void save()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar</Button>
      </div>
    </header>
    <SettingsWorkspaceLinks />
    <nav aria-label="Seções de configuração" className="flex flex-wrap gap-1 border-b border-border pb-3">{SECTIONS.map(([key, label]) =>
      <Button key={key} variant={section === key ? 'secondary' : 'ghost'} aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</Button>)}</nav>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
    <fieldset disabled={saving || uploadingMedia} className="min-w-0 space-y-6">
    {section === 'integrations' && <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}><CompanyIntegrations key={companyId} companyId={companyId} /></Suspense>}
    {section === 'messages' && <section className="space-y-5">
      <div className="max-w-xl space-y-2"><HelpLabel htmlFor="message-event">Evento</HelpLabel><select id="message-event" disabled={uploadingMedia} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={event} onChange={e => setEvent(e.target.value as MessageEvent)}>{Object.entries(MESSAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{isWhatsAppEvent(key as MessageEvent) ? 'WhatsApp' : 'Push'} · {label}</option>)}</select></div>
      {isWhatsAppEvent(event) ? <WhatsAppSequenceEditor key={`${companyId}-${event}`} companyId={companyId} event={event} blocks={displayMessageSequence(draft, event)} previewValues={previewValues} onBusyChange={setUploadingMedia} onChange={blocks => {
        setDraft(current => current ? editMessageSequence(current, event, blocks) : current); setError(''); setNotice('');
      }} /> : <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5"><p className="text-sm text-muted-foreground">Canal: notificação push · somente texto.</p>
          <div className="space-y-2"><HelpLabel htmlFor="event-message">Mensagem</HelpLabel><Textarea id="event-message" className="min-h-56" maxLength={6000} value={draft.messages[event]} onChange={e => change('messages', event, e.target.value)} /></div>
          <div className="flex flex-wrap gap-1.5">{getMessageEventVariables(event).map(key => <Button key={key} variant="outline" size="sm" onClick={() => change('messages', event, `${draft.messages[event]}{{${key}}}`)}>{`{{${key}}}`}</Button>)}</div>
        </div>
        <div className="space-y-2"><h2 className="text-sm font-medium">Prévia</h2><div className="min-h-56 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed" data-testid="message-preview">{preview || '—'}</div></div>
      </div>}
    </section>}
    {section === 'contact_policy' && <section className="space-y-6">{numbers('contact_policy', CONTACT_FIELDS)}
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Dias de envio</legend><div className="flex flex-wrap gap-4">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, index) => <span key={day} className="inline-flex items-center"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.contact_policy.weekdays.includes(index + 1)} onChange={e => change('contact_policy', 'weekdays', e.target.checked ? [...draft.contact_policy.weekdays, index + 1].sort() : draft.contact_policy.weekdays.filter(v => v !== index + 1))} />{day}</label><SettingHelp label={`Dia de envio: ${day}`} {...settingsHelpRegistry.weekdays} /></span>)}</div></fieldset>
      <div className="max-w-md space-y-2"><HelpLabel htmlFor="contact-timezone">Fuso horário</HelpLabel><select id="contact-timezone" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.contact_policy.timezone} onChange={e => change('contact_policy', 'timezone', e.target.value)}>{['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Recife', 'America/Rio_Branco', 'Europe/Lisbon', 'UTC'].map(zone => <option key={zone}>{zone}</option>)}</select></div>
    </section>}
    {section === 'forms' && <section className="space-y-6">{numbers('business', ASSESSMENT_FIELDS)}<Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}><FormDefinitionManager key={companyId} companyId={companyId} /></Suspense></section>}
    {section === 'prescription' && <section className="space-y-6">{numbers('prescription', PRESCRIPTION_FIELDS)}
      <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><HelpLabel htmlFor="default-cadence">Cadência padrão</HelpLabel><Input id="default-cadence" inputMode="numeric" maxLength={4} value={draft.prescription.default_cadence} onChange={e => change('prescription', 'default_cadence', e.target.value)} /></div>
        <div className="space-y-2"><HelpLabel htmlFor="preferred-split">Divisão preferencial</HelpLabel><select id="preferred-split" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.prescription.preferred_split} onChange={e => change('prescription', 'preferred_split', e.target.value)}><option value="auto">Automática</option><option value="full_body">Corpo inteiro</option><option value="upper_lower">Superior e inferior</option><option value="push_pull_legs">Empurrar, puxar e pernas</option></select></div></div>
      <div className="space-y-2"><HelpLabel htmlFor="methodology-notes">Contexto da metodologia</HelpLabel><Textarea id="methodology-notes" value={draft.prescription.methodology_notes} onChange={e => change('prescription', 'methodology_notes', e.target.value)} /></div>
      <div className="space-y-2"><HelpLabel htmlFor="periodization-notes">Contexto da periodização</HelpLabel><Textarea id="periodization-notes" value={draft.prescription.periodization_notes} onChange={e => change('prescription', 'periodization_notes', e.target.value)} /></div>
      <PrescriptionMethodologyEditor key={companyId} settings={draft.prescription} disabled={saving} onChange={prescription => {setDraft(current=>current?{...current,prescription}:current);setError('');setNotice('');}} />
    </section>}
    {section === 'brand' && <section className="space-y-6"><div className="grid gap-5 sm:grid-cols-2">{([
      ['company_name', 'Nome público da empresa', 'text'], ['professional_name', 'Profissional responsável', 'text'],
      ['professional_registration', 'Registro profissional', 'text'], ['support_email', 'E-mail de suporte', 'email'],
      ['support_whatsapp', 'WhatsApp de suporte', 'tel'], ['terms_url', 'Termos de uso', 'url'], ['privacy_url', 'Política de privacidade', 'url'],
    ] as const).map(([key, label, type]) => <div className="space-y-2" key={key}><HelpLabel htmlFor={`brand-${key}`} helpKey={key}>{label}</HelpLabel><Input id={`brand-${key}`} type={type} value={draft.brand[key]} onChange={e => change('brand', key, e.target.value)} /></div>)}</div><Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}><CompanyCommercialSettings key={companyId} companyId={companyId} /></Suspense></section>}
    {section === 'experience' && <section className="space-y-6"><div className="flex items-center justify-between gap-4 border-b border-border pb-4"><HelpLabel htmlFor="gamification-enabled">Gamificação</HelpLabel><Switch id="gamification-enabled" checked={draft.experience.gamification_enabled} onCheckedChange={value => change('experience', 'gamification_enabled', value)} /></div>{numbers('experience', EXPERIENCE_FIELDS)}<div className="flex items-center justify-between gap-4 border-t border-border pt-5"><HelpLabel htmlFor="daily-reminder-enabled">Lembrete diário por push</HelpLabel><Switch id="daily-reminder-enabled" checked={draft.notifications.daily_reminder_enabled} onCheckedChange={value => change('notifications', 'daily_reminder_enabled', value)} /></div><div className="max-w-sm space-y-2"><HelpLabel htmlFor="daily-reminder-hour">Hora do lembrete diário</HelpLabel><Input id="daily-reminder-hour" type="number" min={0} max={23} value={draft.notifications.daily_reminder_hour} onChange={e => change('notifications', 'daily_reminder_hour', e.target.value === '' ? Number.NaN : Number(e.target.value))} /></div><div className="flex items-center justify-between gap-4 border-t border-border pt-5"><HelpLabel htmlFor="new-workout-enabled">Push de novo treino publicado</HelpLabel><Switch id="new-workout-enabled" checked={draft.notifications.new_workout_enabled} onCheckedChange={value => change('notifications', 'new_workout_enabled', value)} /></div><div className="border-t border-border pt-6"><Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}><CompanyAchievements key={companyId} companyId={companyId} /></Suspense></div></section>}

    </fieldset>
  </div>;
}
