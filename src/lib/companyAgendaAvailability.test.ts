import { expect, it } from 'vitest';
import { availabilityForDate, validateAgendaAvailability, availabilityMonth, defaultAgendaAvailability } from './companyAgendaAvailability';
it('repeats weekly windows by civil weekday and replaces them completely with date exceptions',()=>{
 const settings=validateAgendaAvailability({...defaultAgendaAvailability(),weekly:[{weekday:1,start:'09:00',end:'12:00'}],exceptions:[{date:'2026-11-02',windows:[]},{date:'2026-11-09',windows:[{start:'14:00',end:'16:00'}]}]});
 expect(availabilityForDate(settings,'2026-10-26')).toEqual([{start:'09:00',end:'12:00'}]);
 expect(availabilityForDate(settings,'2026-11-02')).toEqual([]);
 expect(availabilityForDate(settings,'2026-11-09')).toEqual([{start:'14:00',end:'16:00'}]);
});
it('rejects overlap, overnight/empty windows, invalid dates and unknown timezones',()=>{
 const value=defaultAgendaAvailability();
 expect(()=>validateAgendaAvailability({...value,weekly:[{weekday:1,start:'09:00',end:'12:00'},{weekday:1,start:'11:00',end:'13:00'}]})).toThrow();
 expect(()=>validateAgendaAvailability({...value,weekly:[{weekday:1,start:'23:00',end:'01:00'}]})).toThrow();
 expect(()=>validateAgendaAvailability({...value,exceptions:[{date:'2026-02-30',windows:[]}]})).toThrow();
 expect(()=>validateAgendaAvailability({...value,timezone:'Mars/Olympus'})).toThrow();
});
it('allows adjacent windows and rejects duplicate exceptions, arbitrary fields and excessive input',()=>{
 const value=defaultAgendaAvailability();
 expect(validateAgendaAvailability({...value,weekly:[{weekday:0,start:'09:00',end:'10:00'},{weekday:0,start:'10:00',end:'11:00'}]}).weekly).toHaveLength(2);
 expect(()=>validateAgendaAvailability({...value,exceptions:[{date:'2026-11-01',windows:[]},{date:'2026-11-01',windows:[]}]})).toThrow();
 expect(()=>validateAgendaAvailability({...value,booking:true})).toThrow();
 expect(()=>validateAgendaAvailability({...value,weekly:Array.from({length:29},()=>({weekday:1,start:'09:00',end:'10:00'}))})).toThrow();
});
it('previews only civil windows within a month, including leap days, without generating events',()=>{
 const value=validateAgendaAvailability({...defaultAgendaAvailability(),weekly:[{weekday:0,start:'08:00',end:'09:00'}]});
 expect(availabilityMonth(value,'2028-02')).toHaveLength(29);
 expect(availabilityMonth(value,'2026-11')[0]).toEqual({date:'2026-11-01',windows:[{start:'08:00',end:'09:00'}]});
 expect(()=>availabilityMonth(value,'2026-13')).toThrow();
});
