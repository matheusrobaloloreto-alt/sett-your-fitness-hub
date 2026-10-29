import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchPlatformExperienceDefaults, type PlatformContent } from '@/lib/platformContent';
import { adoptPlatformExperience } from '@/lib/companyContent';
import { fetchCompanyProductSettings } from '@/lib/companyProductSettings';
export function PlatformExperienceAdoption({ companyId }: { companyId: string }) {
  const [loaded, setLoaded] = useState<{ company: string; platform: number; settings: number; document: PlatformContent }>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const target = useRef(companyId); target.current = companyId;
  const saving = useRef(false);
  useEffect(() => { let active = true; setLoaded(undefined); setConfirmed(false); setMessage('');
    void Promise.all([fetchPlatformExperienceDefaults(companyId), fetchCompanyProductSettings(companyId)]).then(([platform, settings]) => {
      if (active) setLoaded({ company: companyId, platform: platform.version, settings: settings.version, document: platform.document });
    }).catch(() => { if (active) setMessage('Padrões globais ainda não publicados ou acesso indisponível.'); });
    return () => { active = false; };
  }, [companyId]);
  const adopt = async () => {
    if (!loaded || loaded.company !== companyId || !confirmed || saving.current) return;
    const scope = companyId; saving.current = true; setBusy(true); setMessage('');
    try { await adoptPlatformExperience(scope, loaded.platform, loaded.settings); const readback = await fetchCompanyProductSettings(scope); if (target.current === scope) { setConfirmed(false); setLoaded(undefined); setMessage(`Padrões adotados. Configuração confirmada v${readback.version}: ${readback.settings.experience.xp_workout} XP por treino. Histórico preservado.`); } }
    catch (e) { if (target.current === scope) setMessage(e instanceof Error ? e.message : 'Não foi possível adotar os padrões.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Padrões globais de experiência"><h2 className="font-semibold">Adotar padrões globais de experiência</h2>
    {loaded?.company === companyId && <><p className="text-sm">Versão {loaded.platform}: treino {loaded.document.experience.xp_workout} XP · atividade {loaded.document.experience.xp_external_activity} XP · consistência {loaded.document.experience.weekly_consistency_xp} XP.</p><ul className="text-sm">{loaded.document.achievements.map(a => <li key={a.code}>{a.title}: {a.criteria_value} {a.criteria_type} · {a.xp_reward} XP</li>)}</ul>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Confirmo substituir os valores de XP para novos eventos e iniciar novas metas de conquistas a partir de agora. XP e conquistas anteriores ficam preservados.</label></>}
    {message && <p role="status" className="text-sm">{message}</p>}<Button type="button" disabled={busy || !confirmed || loaded?.company !== companyId} onClick={() => void adopt()}>Adotar versão publicada</Button>
  </section>;
}
