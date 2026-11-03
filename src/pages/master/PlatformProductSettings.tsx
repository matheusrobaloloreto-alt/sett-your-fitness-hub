import { useCallback,useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { FEATURE_LABELS, companyTiers, companyFeatureKeys, fetchPlatformProductSettings, savePlatformProductSettings, type PlatformSettingsEnvelope } from "@/lib/platformSettingsClient";

export default function PlatformProductSettings() {
  const { role,user } = useAuth();
  const scopeKey=`${role}:${user?.id || ""}`;
  const request=useRef({key:scopeKey,alive:true,pending:false,generation:0});
  if(request.current.key!==scopeKey){request.current.alive=false;request.current={key:scopeKey,alive:true,pending:false,generation:request.current.generation+1};}
  const current=useCallback((scope:typeof request.current,generation:number)=>request.current===scope && scope.alive && scope.generation===generation,[]);
  const queryClient = useQueryClient();
  const [record, setRecord] = useState<PlatformSettingsEnvelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const scope=request.current,generation=scope.generation;if(role!=="master" || scope.pending || !scope.alive)return;scope.pending=true;
    setBusy(true); setError(""); setNotice("");
    try { const value=await fetchPlatformProductSettings();if(current(scope,generation))setRecord(value); } catch { if(current(scope,generation))setError("Não foi possível carregar a configuração."); }
    finally {if(current(scope,generation)){scope.pending=false;setBusy(false);}}
  },[role,current]);
  useEffect(() => {const scope=request.current;scope.alive=true;setRecord(null);setNotice("");setError("");setBusy(false);if(role==="master")void load();return()=>{scope.alive=false;scope.pending=false;scope.generation++;};}, [scopeKey,role,load]);
  if (role !== "master") return <p role="alert">Acesso exclusivo de master.</p>;
  const save = async () => {
    const scope=request.current,generation=scope.generation;
    if (!record || busy || role!=="master" || scope.pending || !scope.alive) return;scope.pending=true;
    setBusy(true); setError(""); setNotice("");
    try {const value=await savePlatformProductSettings(record.settings,record.version);if(!current(scope,generation))return;setRecord(value);await queryClient.invalidateQueries({queryKey:["platform-product-catalog"]});if(current(scope,generation))setNotice("Configuração salva. Assinaturas existentes não foram alteradas.");}
    catch(cause){if(current(scope,generation))setError(cause instanceof Error?cause.message:"Falha ao salvar.");}
    finally{if(current(scope,generation)){scope.pending=false;setBusy(false);}}
  };
  return <main className="p-4 md:p-6 space-y-6 max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Configuração da plataforma</h1><div className="flex gap-2"><Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="w-4 h-4 mr-2" />Recarregar</Button><Button onClick={save} disabled={busy || !record}><Save className="w-4 h-4 mr-2" />Salvar</Button></div></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {record && <fieldset disabled={busy} className="space-y-6">
      <section><h2 className="text-lg font-medium mb-4">Catálogo SETT</h2><p className="text-sm text-muted-foreground mb-4">Preço de referência em reais por mês. O preço de cobrança é validado no Stripe ao criar um novo checkout. Alterações não migram assinaturas.</p>
        <div className="grid md:grid-cols-3 gap-5">{companyTiers.map(tier => {
          const entry = record.settings.tiers[tier];
          const change = (key: string, value: unknown) => setRecord(current => current && ({ ...current, settings: { ...current.settings, tiers: { ...current.settings.tiers, [tier]: { ...current.settings.tiers[tier], [key]: value } } } }));
          return <div key={tier} className="border rounded-md p-4 space-y-3 min-w-0"><h3 className="font-semibold">{entry.name || ({ basic: "Básico", intermediate: "Intermediário", advanced: "Avançado" }[tier])}</h3><Label htmlFor={`${tier}-name`}>Nome</Label><Input id={`${tier}-name`} value={entry.name} maxLength={80} onChange={e => change("name", e.target.value)} /><Label htmlFor={`${tier}-price`}>Preço mensal (R$)</Label><Input id={`${tier}-price`} type="number" min={0} max={100000} step="0.01" value={entry.monthly_price} onChange={e => change("monthly_price", Number(e.target.value))} /><Label htmlFor={`${tier}-stripe`}>ID de preço Stripe</Label><Input id={`${tier}-stripe`} value={entry.stripe_price_id} maxLength={100} onChange={e => change("stripe_price_id", e.target.value)} /><Label htmlFor={`${tier}-description`}>Descrição</Label><Textarea id={`${tier}-description`} value={entry.description} maxLength={500} onChange={e => change("description", e.target.value)} />{companyFeatureKeys.map(key => <label className="flex items-center gap-2 text-sm" key={key}><Checkbox checked={entry.features[key]} onCheckedChange={v => change("features", { ...entry.features, [key]: v === true })} />{FEATURE_LABELS[key]}</label>)}</div>;
        })}</div>
      </section>
      <section className="border-t pt-5 space-y-3"><h2 className="text-lg font-medium">Limite para novas ativações por plano</h2><div className="grid sm:grid-cols-3 gap-4">{companyTiers.map(tier=><div key={tier} className="space-y-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={record.settings.tiers[tier].limits_enabled} onCheckedChange={value=>setRecord(current=>current&&({...current,settings:{...current.settings,tiers:{...current.settings.tiers,[tier]:{...current.settings.tiers[tier],limits_enabled:value===true}}}}))}/>Aplicar limite a novas ativações: {record.settings.tiers[tier].name}</label><Label htmlFor={`${tier}-student-limit`}>Alunos ativos e em renovação (0 = sem limite)</Label><Input id={`${tier}-student-limit`} type="number" min={0} max={100000} value={record.settings.tiers[tier].active_student_limit} onChange={e=>setRecord(current=>current&&({...current,settings:{...current.settings,tiers:{...current.settings.tiers,[tier]:{...current.settings.tiers[tier],active_student_limit:Number(e.target.value)}}}}))}/></div>)}</div></section>
      <section className="border-t pt-5 space-y-3"><h2 className="text-lg font-medium">Identidade editorial BN Content</h2>{(["brand_name", "audience", "tone", "context"] as const).map(key => <div key={key}><Label htmlFor={`editorial-${key}`}>{{ brand_name: "Marca", audience: "Público", tone: "Tom", context: "Contexto editorial" }[key]}</Label><Textarea id={`editorial-${key}`} value={record.settings.editorial[key]} maxLength={key === "context" ? 4000 : 200} onChange={e => setRecord(current => current && ({ ...current, settings: { ...current.settings, editorial: { ...current.settings.editorial, [key]: e.target.value } } }))} /></div>)}</section>
      <section className="border-t pt-5 space-y-3"><h2 className="text-lg font-medium">Identidade visual do Content Studio</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{(["navy","ink","paper","sand"] as const).map(key=><div key={key}><Label htmlFor={`visual-${key}`}>{{navy:"Principal",ink:"Texto",paper:"Fundo",sand:"Destaque"}[key]}</Label><Input id={`visual-${key}`} type="color" value={record.settings.visual[key]} onChange={e=>setRecord(current=>current&&({...current,settings:{...current.settings,visual:{...current.settings.visual,[key]:e.target.value}}}))}/></div>)}</div>{(["logo_url","handle"] as const).map(key=><div key={key}><Label htmlFor={`visual-${key}`}>{key==="logo_url"?"Logo (URL HTTPS)":"Perfil público (@)"}</Label><Input id={`visual-${key}`} value={record.settings.visual[key]} onChange={e=>setRecord(current=>current&&({...current,settings:{...current.settings,visual:{...current.settings.visual,[key]:e.target.value}}}))}/></div>)}</section>
    </fieldset>}
  </main>;
}
