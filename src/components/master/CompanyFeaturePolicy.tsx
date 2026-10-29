import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchCompanyEntitlements, saveCompanyFeaturePolicy, type EffectiveCompanyFeatures } from "@/lib/companyFeatureEntitlements";
import { FEATURE_LABELS, fetchPlatformProductSettings, type PlatformSettingsEnvelope, type CompanyFeatureKey } from "@/lib/platformSettingsClient";

export default function CompanyFeaturePolicy({ companyId, name }: { companyId: string; name: string }) {
  const [policy, setPolicy] = useState<EffectiveCompanyFeatures | null>(null);
  const [catalog, setCatalog] = useState<PlatformSettingsEnvelope | null>(null);
  const [target, setTarget] = useState<"catalog" | "legacy" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const current = ++epoch.current;
    pending.current = false;
    setPolicy(null); setCatalog(null); setTarget(null); setError(""); setBusy(false);
    Promise.all([fetchCompanyEntitlements(companyId), fetchPlatformProductSettings()]).then(([next, settings]) => {
      if (current === epoch.current) { setPolicy(next); setCatalog(settings); }
    }).catch(() => { if (current === epoch.current) setError("Permissoes indisponiveis. Reabra a pagina."); });
    return () => { if (epoch.current === current) epoch.current = current + 1; };
  }, [companyId]);
  const confirm = async () => {
    if (!policy || !catalog || !target || pending.current) return;
    const current = epoch.current;
    pending.current = true; setBusy(true); setError("");
    try {
      const result = await saveCompanyFeaturePolicy(companyId, target, policy.version, catalog.version);
      if (current === epoch.current) { setPolicy(result); setTarget(null); }
    } catch (cause) {
      if (current === epoch.current) setError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally {
      if (current === epoch.current) { pending.current = false; setBusy(false); }
    }
  };
  const proposal = policy && catalog ? catalog.settings.tiers[policy.tier].features : null;
  return <div className="border-t pt-3 mt-3 space-y-2">
    <p className="text-sm">Recursos: {policy ? policy.source === "legacy" ? "legado preservado" : `contrato v${policy.version}, catalogo v${policy.catalog_version}` : "carregando"}</p>
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" disabled={!policy || !catalog || busy} onClick={() => setTarget("catalog")}>Revisar recursos do tier</Button>
      {policy?.source === "catalog" && <Button variant="outline" size="sm" disabled={busy} onClick={() => setTarget("legacy")}>Restaurar legado</Button>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={target !== null} onOpenChange={open => { if (!open && !busy) setTarget(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Recursos de {name}</DialogTitle>
        <DialogDescription>{target === "catalog" ? `Adotar os recursos abaixo do tier ${policy?.tier}, catalogo v${catalog?.version}. Esta confirmacao pode remover acessos.` : "Restaurar os recursos legados desta empresa."}</DialogDescription>
      </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {target === "catalog" && proposal && <ul className="text-sm space-y-1">{Object.entries(proposal).map(([key, enabled]) => <li key={key}>{FEATURE_LABELS[key as CompanyFeatureKey]}: {enabled ? "liberado" : "bloqueado"}</li>)}</ul>}
        <Button disabled={busy || !policy || !catalog} onClick={confirm}>Confirmar recursos de {name}</Button>
      </DialogContent>
    </Dialog>
  </div>;
}
