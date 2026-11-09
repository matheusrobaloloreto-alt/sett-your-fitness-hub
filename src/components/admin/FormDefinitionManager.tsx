import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingHelp } from '@/components/admin/SettingHelp';
import { useSettingsDraft } from '@/lib/settingsDraftProtection';
import { defaultFormDefinition, fetchFormDefinition, publishFormDefinition, isFormDefinitionConflict, FORM_KINDS, type FormDefinition, type FormKind, type QuestionType } from '@/lib/formDefinitions';

export default function FormDefinitionManager({companyId, visible = true}:{companyId:string; visible?:boolean}) {
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
  useSettingsDraft(dirty);
  const [loadedContext,setLoadedContext]=useState('');
  const editable=ready && loadedContext===context;
  useEffect(()=>{
    const token=++request.current;
    let cancelled=false;
    const active=()=>!cancelled && request.current===token && currentContext.current===context;
    setBusy(true); setReady(false);setForm(defaultFormDefinition(kind));setVersion(0);setDirty(false);
    fetchFormDefinition(companyId,kind).then(row=>{if(active()){setForm(row?.definition??defaultFormDefinition(kind));setVersion(row?.version??0);setLoadedContext(context);setReady(true);}}).catch(()=>{if(active())toast.error('Não foi possível carregar o formulário');}).finally(()=>{if(active())setBusy(false);});
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
    try{const row=await publishFormDefinition(companyId,form,version);if(!active())return;if(row.definition.kind!==kind)throw new Error('Tipo de formulario divergente.');setForm(row.definition);setVersion(row.version);setDirty(false);toast.success(`Versão ${row.version} publicada`);}
    catch(error){if(active())toast.error(isFormDefinitionConflict(error)?'Conflito de versão. Rascunho mantido; recarregue antes de publicar.':error instanceof Error?error.message:'Publicação recusada. Recarregue para conferir a versão.');}
    finally{if(active())setBusy(false);}
  };
  if (!visible) return null;
  const base=defaultFormDefinition(kind);
  const typeLabels: Record<QuestionType, string> = {text:'Texto curto',textarea:'Texto longo',number:'Número',date:'Data',select:'Escolha única',multiselect:'Múltipla escolha',boolean:'Sim ou não',consent:'Consentimento'};
  return <section className="space-y-3 min-w-0">
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1"><select aria-label="Formulário" value={kind} disabled={busy} onChange={e=>{if(!dirty||window.confirm('Descartar alterações não publicadas?'))setKind(e.target.value as FormKind);}} className="rounded-md border bg-background p-2 text-sm">{FORM_KINDS.map(k=><option key={k} value={k}>{defaultFormDefinition(k).title}</option>)}</select><SettingHelp label="Formulário" what="Modelo de perguntas que você está configurando." edits="Seleciona o formulário a editar." effect="Trocar de formulário pode descartar alterações ainda não publicadas, após confirmação." /></div>
      <span className="text-xs text-muted-foreground">Versão {version || 'legada'}</span><Button variant="outline" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Descartar alterações não publicadas?'))setReload(v=>v+1);}}>Recarregar</Button><Button disabled={busy||!editable} onClick={()=>void publish()}><Save className="mr-2 h-4 w-4" />Publicar versão</Button>
    </div>
    <fieldset disabled={busy||!editable} className="space-y-3 min-w-0">
      <div><div className="flex items-center gap-1"><Label htmlFor="form-title">Título</Label><SettingHelp label="Título" what="Nome exibido no formulário." edits="Altera o título apresentado ao aluno." effect="O novo título passa a valer ao publicar esta versão." /></div><Input id="form-title" disabled={busy||!ready} value={form.title} maxLength={160} onChange={e=>edit(f=>({...f,title:e.target.value}))} /></div>
      {kind==='intercycle' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(['intercycle_day','invite_expiry_days'] as const).map(key=><div key={key}><div className="flex items-center gap-1"><Label htmlFor={`policy-${key}`}>{key==='intercycle_day'?'Dia do ciclo para agendamento':'Validade do convite (dias)'}</Label><SettingHelp label={key==='intercycle_day'?'Agendamento no ciclo':'Validade do convite'} what={key==='intercycle_day'?'Dia previsto para o formulário durante o ciclo.':'Prazo de validade do convite em dias.'} edits={key==='intercycle_day'?'Ajusta o dia entre 1 e 90.':'Ajusta a validade entre 1 e 30 dias.'} effect="A política será usada pelos fluxos de convite após a publicação." /></div><Input id={`policy-${key}`} type="number" min={1} max={key==='intercycle_day'?90:30} value={form.policy[key]} onChange={e=>edit(f=>({...f,policy:{...f.policy,[key]:Number(e.target.value)}}))} /></div>)}</div>}
      {kind==='cycle_feedback' && <div><div className="flex items-center gap-1"><Label htmlFor="feedback-days">Dias antes do fim para feedback</Label><SettingHelp label="Antecedência do feedback" what="Antecedência para solicitar o feedback do ciclo." edits="Ajusta o número de dias entre 1 e 30." effect="A política publicada orienta a solicitação antes do fim do ciclo." /></div><Input id="feedback-days" type="number" min={1} max={30} value={form.policy.cycle_feedback_days} onChange={e=>edit(f=>({...f,policy:{...f.policy,cycle_feedback_days:Number(e.target.value)}}))} /></div>}
      <div aria-label="Perguntas do formulário" className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">{form.fields.map((field,index)=>{
        const core=base.fields.find(f=>f.key===field.key);
        return <article aria-label={`Pergunta ${index+1}: ${field.label}`} key={field.key} className="min-w-0 rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-medium">{field.label || 'Nova pergunta'}</h3><span aria-label={`Ordem ${index+1}`} className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-medium">{index+1}</span></div>
          <div className="flex items-center gap-1"><span className="mr-auto text-xs text-muted-foreground">{typeLabels[field.type]}</span><Button size="icon" variant="ghost" title="Mover para cima" aria-label={`Mover ${field.label} para cima`} disabled={busy||index===0} onClick={()=>move(index,-1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Mover para baixo" aria-label={`Mover ${field.label} para baixo`} disabled={busy||index===form.fields.length-1} onClick={()=>move(index,1)}><ArrowDown className="h-4 w-4" /></Button>{!core && <Button size="icon" variant="ghost" title="Excluir pergunta" aria-label={`Excluir ${field.label}`} onClick={()=>edit(f=>({...f,fields:f.fields.filter(x=>x.key!==field.key)}))}><Trash2 className="h-4 w-4" /></Button>}</div>
          <div><div className="flex items-center gap-1"><Label htmlFor={`label-${field.key}`}>Pergunta</Label><SettingHelp label={`Pergunta: ${field.label}`} what="Texto da pergunta apresentado ao aluno." edits="Altera a redação sem mudar a identificação da pergunta." effect="Após publicar, o aluno verá o novo texto; a chave permanece a mesma." /></div><Input id={`label-${field.key}`} value={field.label} maxLength={200} disabled={busy} onChange={e=>update(index,{label:e.target.value})} /></div>
          <div><div className="flex items-center gap-1"><Label htmlFor={`help-${field.key}`}>Ajuda</Label><SettingHelp label={`Ajuda: ${field.label}`} what="Orientação complementar para responder à pergunta." edits="Altera o texto de apoio exibido ao aluno." effect="Não altera a resposta nem torna a pergunta obrigatória." /></div><Input id={`help-${field.key}`} value={field.help} maxLength={1000} disabled={busy} onChange={e=>update(index,{help:e.target.value})} /></div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <div className="flex items-center gap-1"><label><input type="checkbox" checked={field.required} disabled={busy||core?.required} onChange={e=>update(index,{required:e.target.checked,hidden:false})} /> Obrigatória</label><SettingHelp label={`Obrigatória: ${field.label}`} what="Exige uma resposta para concluir o formulário." edits="Ativa ou desativa a obrigatoriedade quando permitida." effect="Ao ativar, a pergunta deixa de ficar oculta. Perguntas essenciais permanecem bloqueadas." /></div>
            <div className="flex items-center gap-1"><label><input type="checkbox" checked={field.hidden} disabled={busy||field.required||core?.required} onChange={e=>update(index,{hidden:e.target.checked})} /> Oculta</label><SettingHelp label={`Oculta: ${field.label}`} what="Controla a exibição da pergunta ao aluno." edits="Oculta ou mostra uma pergunta opcional." effect="A pergunta continua configurada. Perguntas obrigatórias não podem ser ocultadas." /></div>
            {!core && <div className="flex items-center gap-1"><select className="min-w-0 rounded border bg-background p-1 text-sm" aria-label={`Tipo ${field.key}`} value={field.type} onChange={e=>update(index,{type:e.target.value as QuestionType})}>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><SettingHelp label={`Tipo: ${field.label}`} what="Formato de resposta da pergunta adicional." edits="Seleciona texto, número, data ou um tipo de escolha." effect="Muda como o aluno responde; as alternativas configuradas são preservadas no rascunho." /></div>}
          </div>
          {(field.options.length>0 || (!core && ['select','multiselect'].includes(field.type))) && <details className="rounded-md border p-2"><summary className="cursor-pointer text-sm font-medium">Alternativas ({field.options.length})</summary><div className="mt-2 space-y-2">
            {field.options.map((option,i)=><div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><div className="flex items-center gap-1"><Label htmlFor={`value-${field.key}-${i}`}>Valor {i+1}</Label><SettingHelp label={`Valor da alternativa ${i+1}: ${field.label}`} what="Identificador salvo para esta alternativa." edits="Altera o valor de uma alternativa adicional; valores padrão são bloqueados." effect="Mudar o valor altera a identificação das novas respostas. O texto visível é editado ao lado." /></div><Input id={`value-${field.key}-${i}`} aria-label={`Valor ${field.key} ${i+1}`} disabled={!!core} value={option.value} onChange={e=>update(index,{options:field.options.map((o,j)=>j===i?{...o,value:e.target.value}:o)})} /></div>
              <div><div className="flex items-center gap-1"><Label htmlFor={`option-${field.key}-${i}`}>Alternativa {i+1}</Label><SettingHelp label={`Texto da alternativa ${i+1}: ${field.label}`} what="Texto da alternativa mostrado ao aluno." edits="Altera o nome exibido desta opção." effect="O identificador salvo permanece igual quando apenas este texto é alterado." /></div><Input id={`option-${field.key}-${i}`} aria-label={`Alternativa ${field.key} ${i+1}`} value={option.label} onChange={e=>update(index,{options:field.options.map((o,j)=>j===i?{...o,label:e.target.value}:o)})} /></div>
            </div>)}
            {!core && ['select','multiselect'].includes(field.type) && <Button size="sm" variant="outline" onClick={()=>update(index,{options:[...field.options,{value:`opcao_${field.options.length+1}`,label:'Nova alternativa'}]})}><Plus className="h-4 w-4 mr-1" />Alternativa</Button>}
          </div></details>}
        </article>;
      })}</div>
      <Button variant="outline" disabled={busy||!ready} onClick={()=>edit(f=>({...f,fields:[...f.fields,{key:`extra_${crypto.randomUUID().replaceAll('-','')}`,label:'Nova pergunta',type:'text',required:false,hidden:false,help:'',options:[]}]}))}><Plus className="mr-2 h-4 w-4" />Pergunta</Button>
    </fieldset>
  </section>;
}
