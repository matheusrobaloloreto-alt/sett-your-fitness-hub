import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { defaultFormDefinition, fetchFormDefinition, publishFormDefinition, isFormDefinitionConflict, FORM_KINDS, type FormDefinition, type FormKind, type QuestionType } from '@/lib/formDefinitions';

export default function FormDefinitionManager({companyId}:{companyId:string}) {
  const [kind,setKind]=useState<FormKind>('initial');
  const [form,setForm]=useState<FormDefinition>(defaultFormDefinition('initial'));
  const [version,setVersion]=useState(0);
  const [busy,setBusy]=useState(true);
  const [ready,setReady]=useState(false);
  const [reload,setReload]=useState(0);
  const [dirty,setDirty]=useState(false);
  const context=`${companyId}:${kind}`;
  const currentContext=useRef(context);
  currentContext.current=context;
  const request=useRef(0);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [loadedContext,setLoadedContext]=useState('');
  const editable=ready && loadedContext===context;
  useEffect(()=>{
    const token=++request.current;
    let cancelled=false;
    const active=()=>!cancelled && request.current===token && currentContext.current===context;
    setBusy(true); setReady(false);setForm(defaultFormDefinition(kind));setVersion(0);setDirty(false);
    fetchFormDefinition(companyId,kind).then(row=>{if(active()){setForm(row?.definition??defaultFormDefinition(kind));setVersion(row?.version??0);setLoadedContext(context);setReady(true);}}).catch(()=>{if(active())toast.error('Nao foi possivel carregar o formulario');}).finally(()=>{if(active())setBusy(false);});
    return ()=>{cancelled=true;};
  },[companyId,kind,reload,context]);
  const edit=(updater:SetStateAction<FormDefinition>)=>{if(!editable||busy)return;setDirty(true);setForm(updater);};
  const update=(index:number,patch:Partial<FormDefinition['fields'][number]>)=>edit(f=>({...f,fields:f.fields.map((field,i)=>i===index?{...field,...patch}:field)}));
  const move=(index:number,delta:number)=>edit(f=>{const fields=[...f.fields];[fields[index],fields[index+delta]]=[fields[index+delta],fields[index]];return {...f,fields};});
  const publish=async()=>{
    if(!editable||busy)return;
    const token=++request.current;
    const active=()=>mounted.current && request.current===token && currentContext.current===context;
    setBusy(true);
    try{const row=await publishFormDefinition(companyId,form,version);if(!active())return;if(row.definition.kind!==kind)throw new Error('Tipo de formulario divergente.');setForm(row.definition);setVersion(row.version);setDirty(false);toast.success(`Versao ${row.version} publicada`);}
    catch(error){if(active())toast.error(isFormDefinitionConflict(error)?'Conflito de versao. Rascunho mantido; recarregue antes de publicar.':error instanceof Error?error.message:'Publicacao recusada. Recarregue para conferir a versao.');}
    finally{if(active())setBusy(false);}
  };
  const base=defaultFormDefinition(kind);
  return <section className="space-y-5 min-w-0">
    <div className="flex flex-wrap items-center gap-3"><select aria-label="Formulario" value={kind} disabled={busy} onChange={e=>{if(!dirty||window.confirm('Descartar alteracoes nao publicadas?'))setKind(e.target.value as FormKind);}} className="rounded-md border bg-background p-2 text-sm">{FORM_KINDS.map(k=><option key={k} value={k}>{defaultFormDefinition(k).title}</option>)}</select><span className="text-xs text-muted-foreground">Versao {version || 'legada'}</span><Button variant="outline" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Descartar alteracoes nao publicadas?'))setReload(v=>v+1);}}>Recarregar</Button><Button disabled={busy||!editable} onClick={()=>void publish()}><Save className="mr-2 h-4 w-4" />Publicar versao</Button></div>
    <fieldset disabled={busy||!editable} className="space-y-5 min-w-0">
    <div><Label htmlFor="form-title">Titulo</Label><Input id="form-title" disabled={busy||!ready} value={form.title} maxLength={160} onChange={e=>edit(f=>({...f,title:e.target.value}))} /></div>
    {kind==='intercycle' && <div className="grid gap-3 sm:grid-cols-2">{(['intercycle_day','invite_expiry_days'] as const).map(key=><label key={key} className="space-y-1 text-sm">{key==='intercycle_day'?'Dia do ciclo para agendamento':'Validade do convite (dias)'}<Input type="number" min={1} max={key==='intercycle_day'?90:30} value={form.policy[key]} onChange={e=>edit(f=>({...f,policy:{...f.policy,[key]:Number(e.target.value)}}))} /></label>)}</div>}
    {kind==='cycle_feedback' && <label className="block text-sm">Dias antes do fim para feedback<Input type="number" min={1} max={30} value={form.policy.cycle_feedback_days} onChange={e=>edit(f=>({...f,policy:{...f.policy,cycle_feedback_days:Number(e.target.value)}}))} /></label>}
    <div className="divide-y border-y">{form.fields.map((field,index)=>{
      const core=base.fields.find(f=>f.key===field.key);
      return <div key={field.key} className="py-4 space-y-3">
        <div className="flex items-center gap-2"><code className="text-xs text-muted-foreground break-all mr-auto">{field.key}</code><Button size="icon" variant="ghost" title="Mover para cima" aria-label={`Mover ${field.label} para cima`} disabled={busy||index===0} onClick={()=>move(index,-1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Mover para baixo" aria-label={`Mover ${field.label} para baixo`} disabled={busy||index===form.fields.length-1} onClick={()=>move(index,1)}><ArrowDown className="h-4 w-4" /></Button>{!core && <Button size="icon" variant="ghost" title="Excluir pergunta" aria-label={`Excluir ${field.label}`} onClick={()=>edit(f=>({...f,fields:f.fields.filter(x=>x.key!==field.key)}))}><Trash2 className="h-4 w-4" /></Button>}</div>
        <Label htmlFor={`label-${field.key}`}>Pergunta</Label><Input id={`label-${field.key}`} value={field.label} maxLength={200} disabled={busy} onChange={e=>update(index,{label:e.target.value})} />
        <Label htmlFor={`help-${field.key}`}>Ajuda</Label><Input id={`help-${field.key}`} value={field.help} maxLength={1000} disabled={busy} onChange={e=>update(index,{help:e.target.value})} />
        <div className="flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={field.required} disabled={busy||core?.required} onChange={e=>update(index,{required:e.target.checked,hidden:false})} /> Obrigatoria</label><label><input type="checkbox" checked={field.hidden} disabled={busy||field.required||core?.required} onChange={e=>update(index,{hidden:e.target.checked})} /> Oculta</label>{!core && <select aria-label={`Tipo ${field.key}`} value={field.type} onChange={e=>update(index,{type:e.target.value as QuestionType})}>{['text','textarea','number','date','select','multiselect','boolean','consent'].map(t=><option key={t}>{t}</option>)}</select>}</div>
        {field.options.map((option,i)=><div key={i} className="grid grid-cols-2 gap-2"><Input aria-label={`Valor ${field.key} ${i+1}`} disabled={!!core} value={option.value} onChange={e=>update(index,{options:field.options.map((o,j)=>j===i?{...o,value:e.target.value}:o)})} /><Input aria-label={`Alternativa ${field.key} ${i+1}`} value={option.label} onChange={e=>update(index,{options:field.options.map((o,j)=>j===i?{...o,label:e.target.value}:o)})} /></div>)}
        {!core && ['select','multiselect'].includes(field.type) && <Button size="sm" variant="outline" onClick={()=>update(index,{options:[...field.options,{value:`opcao_${field.options.length+1}`,label:'Nova alternativa'}]})}><Plus className="h-4 w-4 mr-1" />Alternativa</Button>}
      </div>;
    })}</div>
    <Button variant="outline" disabled={busy||!ready} onClick={()=>edit(f=>({...f,fields:[...f.fields,{key:`extra_${crypto.randomUUID().replaceAll('-','')}`,label:'Nova pergunta',type:'text',required:false,hidden:false,help:'',options:[]}]}))}><Plus className="mr-2 h-4 w-4" />Pergunta</Button>
    </fieldset>
  </section>;
}
