import { z } from 'zod';
const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const windowSchema=z.object({start:clock,end:clock}).strict().refine(w=>w.start<w.end,'O término deve ser posterior ao início, no mesmo dia.');
export type AvailabilityWindow=z.infer<typeof windowSchema>;
export function isCivilDate(value:string):boolean {
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function noOverlap(windows:AvailabilityWindow[]):boolean {
 const sorted=[...windows].sort((a,b)=>a.start.localeCompare(b.start));
 return sorted.every((w,i)=>i===0||sorted[i-1].end<=w.start);
}
const schema=z.object({
 timezone:z.string().min(1).max(80).refine(value=>{
  if(!/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)+$/.test(value)&&value!=='UTC')return false;
  try{new Intl.DateTimeFormat('pt-BR',{timeZone:value});return true;}catch{return false;}
 },'Fuso IANA inválido.'),
 weekly:z.array(z.object({weekday:z.number().int().min(0).max(6),start:clock,end:clock}).strict()).max(28),
 exceptions:z.array(z.object({date:z.string().refine(isCivilDate,'Data inválida (2000–2099).'),windows:z.array(windowSchema).max(4)}).strict()).max(60),
}).strict().superRefine((v,ctx)=>{
 for(let day=0;day<7;day++){
  const windows=v.weekly.filter(w=>w.weekday===day);
  if(windows.length>4||windows.some(w=>w.start>=w.end)||!noOverlap(windows))ctx.addIssue({code:'custom',message:'Até quatro janelas sem sobreposição por dia, com início anterior ao término.'});
 }
 if(new Set(v.exceptions.map(e=>e.date)).size!==v.exceptions.length||v.exceptions.some(e=>!noOverlap(e.windows)))ctx.addIssue({code:'custom',message:'Exceções devem ter datas únicas e janelas sem sobreposição.'});
});
export type AgendaAvailability=z.infer<typeof schema>;
export function defaultAgendaAvailability():AgendaAvailability{return {timezone:'America/Sao_Paulo',weekly:[],exceptions:[]};}
export function validateAgendaAvailability(value:unknown):AgendaAvailability{return schema.parse(value);}
/** Civil date in the configured timezone: no booking, UTC conversion or event generation. */
export function availabilityForDate(value:AgendaAvailability,date:string):AvailabilityWindow[]{
 if(!isCivilDate(date))throw new Error('Data inválida.');
 const exception=value.exceptions.find(e=>e.date===date);
 const windows=exception?exception.windows:value.weekly.filter(w=>w.weekday===new Date(`${date}T00:00:00Z`).getUTCDay());
 return windows.map(({start,end})=>({start,end})).sort((a,b)=>a.start.localeCompare(b.start));
}
export function availabilityMonth(value:AgendaAvailability,month:string){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Mês inválido.');
 const [year,part]=month.split('-').map(Number);
 const count=new Date(Date.UTC(year,part,0)).getUTCDate();
 return Array.from({length:count},(_,index)=>{const date=`${month}-${String(index+1).padStart(2,'0')}`;return {date,windows:availabilityForDate(value,date)};});
}
export const availabilityWeekdays=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
