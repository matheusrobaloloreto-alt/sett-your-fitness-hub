import { useQuery } from '@tanstack/react-query';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { fetchAgendaAvailability } from '@/lib/companyAgendaAvailabilityStore';
import { availabilityForDate, availabilityMonth, validateAgendaAvailability, type AgendaAvailability } from '@/lib/companyAgendaAvailability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function AvailabilityPreview({settings,month,selectedDate}:{settings:AgendaAvailability;month:string;selectedDate?:string|null}){
 let rows:ReturnType<typeof availabilityMonth>;
 try{
  const valid=validateAgendaAvailability(settings);
  rows=selectedDate?[{date:selectedDate,windows:availabilityForDate(valid,selectedDate)}]:availabilityMonth(valid,month);
 }catch{return <p role="alert">Corrija datas, fuso e janelas para visualizar a disponibilidade.</p>;}
 return <Card><CardHeader><CardTitle>Disponibilidade da empresa</CardTitle><p className="text-sm">Fuso: {settings.timezone}. Horários locais das datas exibidas. Não cria agendamentos automáticos, reservas ou cobranças.</p></CardHeader><CardContent><ul aria-label="Janelas de disponibilidade" className="max-h-72 overflow-y-auto space-y-1">{rows.map(row=><li key={row.date} className="text-sm"><span className="font-medium">{row.date}</span>: {row.windows.length?row.windows.map(w=>`${w.start}–${w.end}`).join(', '):settings.exceptions.some(e=>e.date===row.date)?'Indisponível nesta data (exceção)':'Sem disponibilidade informada'}</li>)}</ul><p className="text-xs mt-2">Exceções substituem toda a disponibilidade semanal da data. Uma exceção sem janelas indica indisponibilidade.</p></CardContent></Card>;
}
export function AgendaAvailabilityLayer({companyId,month,selectedDate}:{companyId:string;month:string;selectedDate?:string|null}){
 const features=useCompanyFeatures();
 const enabled=!features.loading&&features.hasAgenda;
 const saved=useQuery({queryKey:['company-agenda-availability',companyId],queryFn:()=>fetchAgendaAvailability(companyId),enabled,staleTime:0});
 if(!enabled)return null;
 if(saved.error)return <p role="alert">Não foi possível carregar a disponibilidade. Os eventos da agenda permanecem separados.</p>;
 if(!saved.data)return <p>Carregando disponibilidade…</p>;
 return <AvailabilityPreview settings={saved.data.settings} month={month} selectedDate={selectedDate}/>;
}
