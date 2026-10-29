import { useEffect,useRef,useState } from "react";
import { Save,Plus,Trash2,CheckCircle,RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { FUNNEL_STAGE_META } from "@/lib/salesFunnelView";
import { commercialStageKeys,fetchCompanyCommercialSettings,saveCompanyCommercialSettings,publishCompanyPage,publicPageKeys,type PublicPageKey,type CommercialEnvelope } from "@/lib/companyCommercialSettings";

export default function CompanyCommercialSettings({companyId}:{companyId:string}) {
 const request=useRef({companyId,alive:true,pending:false,generation:0});
 if(request.current.companyId!==companyId){request.current.alive=false;request.current={companyId,alive:true,pending:false,generation:request.current.generation+1};}
 const current=(scope:typeof request.current,generation:number)=>scope===request.current && scope.alive && scope.generation===generation;
 const [record,setRecord]=useState<CommercialEnvelope|null>(null);
 const [loadedCompany,setLoadedCompany]=useState("");
 const [page,setPage]=useState<PublicPageKey>("sobre");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [dirty,setDirty]=useState(false);
 useEffect(()=>{const scope=request.current;scope.alive=true;const generation=++scope.generation;setRecord(null);setLoadedCompany("");setDirty(false);setError("");setNotice("");setBusy(false);void fetchCompanyCommercialSettings(companyId).then(value=>{if(current(scope,generation)){setRecord(value);setLoadedCompany(companyId);}},()=>{if(current(scope,generation))setError("Configuração comercial indisponível.");});return()=>{scope.alive=false;scope.pending=false;scope.generation++;};},[companyId]);
 const reload=async()=>{const scope=request.current,generation=scope.generation;if(scope.pending)return;scope.pending=true;setBusy(true);setError("");try{const value=await fetchCompanyCommercialSettings(companyId);if(current(scope,generation)){setRecord(value);setLoadedCompany(companyId);setDirty(false);}}catch{if(current(scope,generation))setError("Não foi possível recarregar.");}finally{if(current(scope,generation)){scope.pending=false;setBusy(false);}}};
 const save=async()=>{const scope=request.current,generation=scope.generation;if(!record || loadedCompany!==companyId || scope.pending)return;scope.pending=true;setBusy(true);setError("");setNotice("");try{const value=await saveCompanyCommercialSettings(companyId,record.settings,record.version);if(current(scope,generation)){setRecord(value);setDirty(false);setNotice("Configuração comercial salva. Documentos continuam dependendo de publicação explícita.");}}catch(cause){if(current(scope,generation))setError(cause instanceof Error?cause.message:"Falha ao salvar.");}finally{if(current(scope,generation)){scope.pending=false;setBusy(false);}}};
 const publish=async()=>{const scope=request.current,generation=scope.generation;if(!record || dirty || loadedCompany!==companyId || scope.pending)return;scope.pending=true;setBusy(true);setError("");setNotice("");try{await publishCompanyPage(companyId,page,record.version);if(current(scope,generation))setNotice("Documento aprovado e publicado na página pública da empresa.");}catch(cause){if(current(scope,generation))setError(cause instanceof Error?cause.message:"Falha ao publicar.");}finally{if(current(scope,generation)){scope.pending=false;setBusy(false);}}};
 if(!record || loadedCompany!==companyId)return <p role="status">{error || "Carregando configuração comercial..."}</p>;
 const update=(settings:CommercialEnvelope["settings"])=>{setRecord({...record,settings});setDirty(true);setNotice("");};
 const doc=record.settings.pages[page];
 const document=(value:typeof doc)=>update({...record.settings,pages:{...record.settings.pages,[page]:value}});
 return <section className="border-t pt-6 mt-6 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Funil, condições comerciais e páginas públicas</h2><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={reload}><RefreshCw className="mr-2 h-4 w-4"/>Recarregar</Button><Button disabled={busy || !dirty} onClick={save}><Save className="mr-2 h-4 w-4"/>Salvar comercial</Button></div></div>
  {error&&<p role="alert" className="text-destructive">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <fieldset disabled={busy} className="space-y-5">
   <div className="grid gap-3 sm:grid-cols-2">{commercialStageKeys.map(key=><div key={key}><Label htmlFor={`funnel-${key}`}>{FUNNEL_STAGE_META[key].label}</Label><Input id={`funnel-${key}`} maxLength={60} value={record.settings.funnel_labels[key] ?? FUNNEL_STAGE_META[key].label} onChange={e=>update({...record.settings,funnel_labels:{...record.settings.funnel_labels,[key]:e.target.value}})}/></div>)}</div>
   <div><Label htmlFor="pre-registration-template">Convite universal de pré-cadastro</Label><Textarea id="pre-registration-template" maxLength={2000} value={record.settings.pre_registration_invite} onChange={e=>update({...record.settings,pre_registration_invite:e.target.value})}/><p className="text-xs text-muted-foreground">Variáveis: {"{{empresa}}"} e {"{{link}}"}. O link é obrigatório.</p></div>
   <div className="grid sm:grid-cols-2 gap-4"><label className="flex items-center gap-2"><Switch checked={record.settings.influencer.enabled} onCheckedChange={enabled=>update({...record.settings,influencer:{...record.settings.influencer,enabled}})}/>Novas classificações de influenciador</label><div><Label htmlFor="influencer-cap">Limite de influenciadores ativos (0 = sem limite)</Label><Input id="influencer-cap" type="number" min={0} max={1000} value={record.settings.influencer.max_active_students} onChange={e=>update({...record.settings,influencer:{...record.settings.influencer,max_active_students:Number(e.target.value)}})}/></div></div>
   <div className="border-t pt-4 space-y-3"><h3 className="font-medium">Conteúdo público fornecido pela empresa</h3><Select value={page} onValueChange={v=>setPage(v as PublicPageKey)}><SelectTrigger aria-label="Página pública"><SelectValue/></SelectTrigger><SelectContent>{publicPageKeys.map(key=><SelectItem key={key} value={key}>{{sobre:"Apresentação",termos:"Termos",privacidade:"Privacidade"}[key]}</SelectItem>)}</SelectContent></Select>
    <Label htmlFor="public-document-title">Título do documento</Label><Input id="public-document-title" maxLength={120} value={doc.title} onChange={e=>document({...doc,title:e.target.value})}/>
    {doc.sections.map((section,index)=><div key={index} className="border-b pb-4 space-y-2"><div className="flex items-center gap-2"><Input aria-label={`Título da seção ${index+1}`} maxLength={120} value={section.heading} onChange={e=>document({...doc,sections:doc.sections.map((item,at)=>at===index?{...item,heading:e.target.value}:item)})}/><Button variant="ghost" size="icon" aria-label={`Remover seção ${index+1}`} onClick={()=>document({...doc,sections:doc.sections.filter((_,at)=>at!==index)})}><Trash2 className="h-4 w-4"/></Button></div><Textarea aria-label={`Texto da seção ${index+1}`} maxLength={8000} value={section.body} onChange={e=>document({...doc,sections:doc.sections.map((item,at)=>at===index?{...item,body:e.target.value}:item)})}/></div>)}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={doc.sections.length>=12} onClick={()=>document({...doc,sections:[...doc.sections,{heading:"",body:""}]})}><Plus className="mr-2 h-4 w-4"/>Adicionar seção</Button><Button disabled={dirty || !doc.title.trim() || !doc.sections.some(section=>section.body.trim())} onClick={publish}><CheckCircle className="mr-2 h-4 w-4"/>Aprovar e publicar documento</Button></div>
   </div>
  </fieldset>
 </section>;
}
