export function intercycleScheduleDate(start:string,day:number) {
  if(!Number.isInteger(day)||day<1||day>90)throw new Error('Dia invalido');
  const date=new Date(`${start}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+day-1);
  return date.toISOString().slice(0,10);
}
export function canIssueManualIntercycle(start:string|null,today:string,eligible:boolean) {
  return !!start && start<=today && eligible;
}
