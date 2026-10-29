import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import VersionedFormFields from '@/components/VersionedFormFields';
import { projectFormAnswers, validateFormAnswers, type PublishedForm } from '@/lib/formDefinitions';

export default function VersionedPublicAnamnesis({form,accessKey,companyId,slug}:{form:PublishedForm;accessKey?:string;companyId?:string|null;slug?:string}) {
  const [answers,setAnswers]=useState<Record<string,unknown>>({});
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [done,setDone]=useState(false); const [confirm,setConfirm]=useState(false);
  const pre=form.definition.kind==='pre_registration';
  const submit=async()=>{
    const invalid=validateFormAnswers(form.definition,answers);
    if(invalid.length){setError(`Revise: ${invalid.join(', ')}`);return;}
    if(pre && !confirm){setConfirm(true);return;}
    setBusy(true);setError('');
    try {
      const projected=projectFormAnswers(form.definition,answers);
      const result=await supabase.functions.invoke(pre?'public-registration':'public-anamnesis',{body:pre?{
        action:'pre-register',companyId,slug:slug??null,fullName:projected.full_name,whatsapp:projected.whatsapp,whatsappConfirmed:true,
        budgetRange:projected.budget_range,preferredContactPeriod:projected.preferred_contact_period,
        form_definition_id:form.id,versioned_answers:answers,
        answers:Object.fromEntries(Object.entries(projected).filter(([key])=>!['full_name','whatsapp'].includes(key))),
      }:{action:'submit',accessKey,form_definition_id:form.id,versioned_answers:answers}});
      if(result.error || result.data?.error || (pre && !result.data?.leadId)) throw new Error('Nao foi possivel registrar. Revise as respostas ou solicite um novo link.');
      setDone(true);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao registrar.');}finally{setBusy(false);}
  };
  if(done)return <main className="mx-auto max-w-2xl px-5 py-12"><h1 className="text-2xl font-semibold">Respostas registradas</h1><p className="mt-3 text-sm text-muted-foreground">A equipe vai analisar suas informacoes.</p></main>;
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-10"><h1 className="text-2xl font-semibold break-words">{form.definition.title}</h1><p className="mt-1 mb-6 text-xs text-muted-foreground">Versao {form.version}</p>{error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {confirm?<div className="space-y-4"><h2 className="text-lg">Confirme seu WhatsApp</h2><p>{String(answers.whatsapp??'')}</p><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Corrigir</Button><Button disabled={busy} onClick={()=>void submit()}>Confirmar e enviar</Button></div>:<form onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-6"><fieldset disabled={busy} className="min-w-0"><VersionedFormFields definition={form.definition} answers={answers} onChange={(key,value)=>setAnswers(a=>({...a,[key]:value}))} /></fieldset><Button type="submit" disabled={busy}>{busy?'Enviando...':'Enviar respostas'}</Button></form>}
  </main>;
}
