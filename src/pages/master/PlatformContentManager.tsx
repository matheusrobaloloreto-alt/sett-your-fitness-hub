import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_PLATFORM_CONTENT, fetchPlatformContent, savePlatformContent, type PlatformContentState, type PlatformContent } from '@/lib/platformContent';
import { PlatformLandingHero } from '@/components/content/PlatformLandingContent';
import { PlatformAchievementDefaults } from '@/components/content/PlatformAchievementDefaults';
import { ManifestoFooter } from '@/components/landing/ManifestoFooter';
const cmsLabels: Record<string, string> = { hero_title: 'Título principal', hero_body: 'Descrição principal', trainer_cta: 'Botão do treinador', student_cta: 'Botão do aluno', footer_manifesto: 'Manifesto do rodapé', footer_description: 'Descrição do rodapé', footer_edition: 'Edição do rodapé', support_url: 'Endereço HTTPS do suporte', support_label: 'Nome do suporte' };
export default function PlatformContentManager() {
  const { role, user } = useAuth();
  const [loaded, setLoaded] = useState<PlatformContentState>();
  const [draft, setDraft] = useState<PlatformContent>(DEFAULT_PLATFORM_CONTENT);
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [message, setMessage] = useState('');
  const scope = `${user?.id}:${role}`; const scopeRef = useRef(scope); scopeRef.current = scope;
  const [loadedScope, setLoadedScope] = useState('');
  const apply = useCallback((state: PlatformContentState) => { setLoaded(state); setDraft(state.document); setLoadedScope(scope); }, [scope]);
  useEffect(() => { let active = true; setLoaded(undefined); setLoadedScope(''); setMessage(''); if (role === 'master') void fetchPlatformContent().then(v => { if (active) apply(v); }).catch(() => { if (active) setMessage('Não foi possível carregar o CMS.'); }); return () => { active = false; }; }, [scope, role, apply]);
  const save = async (publish: boolean) => {
    if (!loaded || loadedScope !== scope || pending.current) return;
    const current = scope; pending.current = true; setBusy(true); setMessage('');
    try { const state = await savePlatformContent(draft, loaded.version, publish); if (scopeRef.current === current) { apply(state); setMessage(publish ? 'Versão publicada no CMS deste ambiente.' : 'Rascunho salvo. O conteúdo público continua na versão anterior.'); } }
    catch (e) { if (scopeRef.current === current) setMessage(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { pending.current = false; setBusy(false); }
  };
  if (role !== 'master') return <p role="alert">Acesso exclusivo do Master.</p>;
  return <div className="w-full min-w-0 p-4 md:p-6 space-y-6 max-w-6xl mx-auto break-words"><h1 className="text-2xl font-semibold">Conteúdo da plataforma</h1><p>Rascunho v{loaded?.version ?? '—'} · público v{loaded?.published_version ?? '—'}. Publicar aqui altera somente o CMS do ambiente conectado. Não executa deploy.</p>
    {message && <p role="status">{message}</p>}<fieldset disabled={busy || loadedScope !== scope} className="min-w-0 space-y-4"><legend className="font-semibold">Landing e rodapé</legend><div className="grid md:grid-cols-2 gap-4">{Object.entries(cmsLabels).map(([key, label]) => <label key={key} className="min-w-0 space-y-2 text-sm">{label}<Textarea aria-label={label} value={String(draft.cms[key as keyof typeof draft.cms])} onChange={e => setDraft({ ...draft, cms: { ...draft.cms, [key]: e.target.value } })} /></label>)}</div>
    <label className="block">Layout <select aria-label="Layout da landing" value={draft.cms.layout} onChange={e => setDraft({ ...draft, cms: { ...draft.cms, layout: e.target.value as 'compact' | 'editorial' } })}><option value="editorial">Editorial</option><option value="compact">Compacto</option></select></label>
    <label className="flex gap-2"><input type="checkbox" checked={draft.cms.show_differentials} onChange={e => setDraft({ ...draft, cms: { ...draft.cms, show_differentials: e.target.checked } })} />Exibir diferenciais</label>
    <h2 className="font-semibold">Padrões de experiência</h2><p className="text-sm">A publicação não altera empresas existentes. Cada administrador deve confirmar a adoção. Não recalcula histórico.</p>
    <div className="grid sm:grid-cols-3 gap-4">{(['xp_workout', 'xp_external_activity', 'weekly_consistency_xp'] as const).map(key => <label key={key}>{({ xp_workout: 'XP por treino', xp_external_activity: 'XP por atividade', weekly_consistency_xp: 'XP por consistência' })[key]}<Input aria-label={key} type="number" min={0} max={10000} value={draft.experience[key]} onChange={e => setDraft({ ...draft, experience: { ...draft.experience, [key]: Number(e.target.value) } })} /></label>)}</div>
    <label className="flex gap-2"><input type="checkbox" checked={draft.experience.gamification_enabled} onChange={e => setDraft({ ...draft, experience: { ...draft.experience, gamification_enabled: e.target.checked } })} />Gamificação ao adotar</label>
    <PlatformAchievementDefaults value={draft.achievements} onChange={achievements => setDraft({ ...draft, achievements })} />
    <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => void save(false)}>Salvar rascunho</Button><Button type="button" onClick={() => void save(true)}>Publicar versão neste ambiente</Button></div></fieldset>
    <details><summary>Prévia do conteúdo editado</summary><PlatformLandingHero content={draft.cms} /><ManifestoFooter content={draft.cms} /></details>
  </div>;
}
