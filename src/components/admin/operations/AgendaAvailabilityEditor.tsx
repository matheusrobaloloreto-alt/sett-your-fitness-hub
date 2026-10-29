import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useMaster } from '@/contexts/MasterContext';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { availabilityWeekdays, type AgendaAvailability, type AvailabilityWindow } from '@/lib/companyAgendaAvailability';
import { fetchAgendaAvailability, saveAgendaAvailability, type AvailabilityEnvelope } from '@/lib/companyAgendaAvailabilityStore';
import { AvailabilityPreview } from './AgendaAvailabilityLayer';
function WindowFields({value,label,onChange,onRemove}:{value:AvailabilityWindow;label:string;onChange:(value:AvailabilityWindow)=>void;onRemove:()=>void}){
 return <div className="flex flex-wrap items-center gap-2"><label>Início<Input type="time" aria-label={`Início ${label}`} value={value.start} onChange={e=>onChange({...value,start:e.target.value})}/></label><label>Término<Input type="time" aria-label={`Término ${label}`} value={value.end} onChange={e=>onChange({...value,end:e.target.value})}/></label><Button variant="outline" onClick={onRemove} aria-label={`Remover ${label}`}>Remover janela</Button></div>;
}
function AvailabilityEditor({companyId}:{companyId:string}){
 const cache=useQueryClient();
 const saved=useQuery({queryKey:['company-agenda-availability',companyId],queryFn:()=>fetchAgendaAvailability(companyId),staleTime:0});
 const [draft,setDraft]=useState<AvailabilityEnvelope|null>(null);
 const [notice,setNotice]=useState('');
 const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
 const value=draft??saved.data;
 const update=(settings:AgendaAvailability)=>{if(value)setDraft({...value,settings});setNotice('');};
 const save=useMutation({mutationFn:async()=>{
  if(!value)throw new Error('Carregue a disponibilidade.');
  const ack=await saveAgendaAvailability(companyId,value.settings,value.version);
  const read=await fetchAgendaAvailability(companyId);
  if(read.version!==ack.version)throw new Error('A versão mudou após salvar. Recarregue.');
  return read;
 },onSuccess:read=>{cache.setQueryData(['company-agenda-availability',companyId],read);setDraft(null);setNotice('Disponibilidade salva e relida do servidor.');},onError:error=>setNotice(error.message.startsWith('Outra pessoa')?error.message:'Não foi possível salvar. Confira janelas, datas e permissões; recarregue se a versão mudou.')});
 if(saved.isPending)return <p>Carregando disponibilidade…</p>;
 if(saved.error||!value)return <p role="alert">Disponibilidade indisponível. Confira acesso e migração.</p>;
 const settings=value.settings;
 return <section className="space-y-4" aria-label="Editor de disponibilidade"><h2 className="text-xl">Disponibilidade semanal e exceções</h2><p>Versão {value.version}. Disponibilidade comum à empresa. Não cria agendamentos automáticos, reservas ou cobranças.</p>
 <fieldset disabled={save.isPending} className="space-y-4"><label className="block">Fuso IANA<Input className="max-w-sm" aria-label="Fuso da disponibilidade" value={settings.timezone} maxLength={80} onChange={e=>update({...settings,timezone:e.target.value})}/></label>
 <Card><CardHeader><CardTitle>Repetição semanal</CardTitle></CardHeader><CardContent className="space-y-4">{availabilityWeekdays.map((day,weekday)=><div key={day} className="space-y-2"><h3>{day}</h3>{settings.weekly.map((window,index)=>window.weekday===weekday?<WindowFields key={index} label={`${day} ${index+1}`} value={window} onChange={next=>update({...settings,weekly:settings.weekly.map((w,i)=>i===index?{weekday,...next}:w)})} onRemove={()=>update({...settings,weekly:settings.weekly.filter((_,i)=>i!==index)})}/>:null)}<Button variant="outline" disabled={settings.weekly.filter(w=>w.weekday===weekday).length>=4} onClick={()=>update({...settings,weekly:[...settings.weekly,{weekday,start:'09:00',end:'17:00'}]})}>Adicionar janela {day}</Button></div>)}<p className="text-xs">Até quatro janelas por dia, sem sobreposição e sem atravessar meia-noite. A repetição apenas informa disponibilidade.</p></CardContent></Card>
 <Card><CardHeader><CardTitle>Exceções por data</CardTitle></CardHeader><CardContent className="space-y-3">{settings.exceptions.map((exception,index)=><div key={index} className="border rounded p-3 space-y-2"><label>Data<Input type="date" min="2000-01-01" max="2099-12-31" aria-label={`Data da exceção ${index+1}`} value={exception.date} onChange={e=>update({...settings,exceptions:settings.exceptions.map((x,i)=>i===index?{...x,date:e.target.value}:x)})}/></label><label><input type="checkbox" aria-label={`Indisponível na exceção ${index+1}`} checked={!exception.windows.length} onChange={e=>update({...settings,exceptions:settings.exceptions.map((x,i)=>i===index?{...x,windows:e.target.checked?[]:[{start:'09:00',end:'17:00'}]}:x)})}/> Dia indisponível (substitui a semana)</label>{exception.windows.map((window,j)=><WindowFields key={j} label={`exceção ${index+1} janela ${j+1}`} value={window} onChange={next=>update({...settings,exceptions:settings.exceptions.map((x,i)=>i===index?{...x,windows:x.windows.map((w,k)=>k===j?next:w)}:x)})} onRemove={()=>update({...settings,exceptions:settings.exceptions.map((x,i)=>i===index?{...x,windows:x.windows.filter((_,k)=>k!==j)}:x)})}/>)}<Button variant="outline" disabled={exception.windows.length>=4} onClick={()=>update({...settings,exceptions:settings.exceptions.map((x,i)=>i===index?{...x,windows:[...x.windows,{start:'09:00',end:'17:00'}]}:x)})}>Adicionar janela excepcional {index+1}</Button>{' '}<Button variant="outline" onClick={()=>update({...settings,exceptions:settings.exceptions.filter((_,i)=>i!==index)})}>Remover exceção {index+1}</Button></div>)}<Button disabled={settings.exceptions.length>=60} onClick={()=>update({...settings,exceptions:[...settings.exceptions,{date:'',windows:[]}]})}>Adicionar exceção</Button><p className="text-xs">Até 60 datas únicas entre 2000 e 2099. A exceção substitui todas as janelas semanais daquela data.</p></CardContent></Card>
 <Button disabled={!draft||save.isPending} onClick={()=>save.mutate()}>Salvar disponibilidade</Button>{' '}<Button variant="outline" onClick={()=>{setDraft(null);setNotice('');void saved.refetch();}}>Recarregar disponibilidade</Button>
 </fieldset><p role="status">{notice}</p><label>Mês da prévia<Input className="max-w-xs" type="month" aria-label="Mês da prévia" value={month} onChange={e=>setMonth(e.target.value)}/></label><AvailabilityPreview settings={settings} month={month}/></section>;
}
export default function AgendaAvailabilityEditor(){
 const {companyId,role}=useAuth();const {viewingCompany,isViewingCompany}=useMaster();const features=useCompanyFeatures();
 const id=role==='master'?(isViewingCompany?viewingCompany?.id:null):companyId;
 if(features.loading)return <p>Carregando permissões da agenda…</p>;
 if(!features.hasAgenda)return <p>Disponibilidade indisponível para esta empresa.</p>;
 if(role!=='admin'&&role!=='master')return <p role="alert">Apenas administradores podem editar disponibilidade.</p>;
 if(!id)return <p>Selecione uma empresa.</p>;
 return <AvailabilityEditor key={id} companyId={id}/>;
}
