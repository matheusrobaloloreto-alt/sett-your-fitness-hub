import { z } from 'zod';
import { FUNNEL_STAGE_ORDER, FUNNEL_STAGE_META, type FunnelStageKey } from './salesFunnelView';
const operationalCodes = ['interested','contacted','fiscal_registration_pending','lost'] as const;
const text = z.string().trim().min(1).max(80).refine(v=>!/[<>]/.test(v) && [...v].every(char=>char.charCodeAt(0)>=32), 'Use texto simples.');
const stageCode=z.enum(['interested','contacted','fiscal_registration_pending','payment_pending','active_onboarding','active','lost']);
export const reportMetrics=['active','pending','awaiting_renewal','inactive'] as const;
export const metricLabels:Record<typeof reportMetrics[number],string>={active:'Alunos ativos',pending:'Alunos pendentes',awaiting_renewal:'Aguardando renovação',inactive:'Alunos inativos'};
const schema=z.object({
 stages:z.array(z.object({code:stageCode,label:text,visible:z.boolean()}).strict()).length(7),
 transitions:z.array(z.object({from:z.enum(operationalCodes),to:z.enum(operationalCodes)}).strict()).max(12),
 reports:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,40}$/),title:text,metric:z.enum(reportMetrics),display:z.enum(['count','share'])}).strict()).max(8),
}).strict().superRefine((v,ctx)=>{
 if(new Set(v.stages.map(s=>s.code)).size!==7 || !v.stages.some(s=>s.visible)) ctx.addIssue({code:'custom',message:'Etapas duplicadas ou invisíveis.'});
 if(v.stages.some(s=>!operationalCodes.includes(s.code as typeof operationalCodes[number])&&!s.visible)) ctx.addIssue({code:'custom',message:'Etapas protegidas devem permanecer visíveis.'});
 if(new Set(v.reports.map(r=>r.id)).size!==v.reports.length) ctx.addIssue({code:'custom',message:'Relatórios duplicados.'});
 if(v.transitions.some(t=>t.from===t.to||(t.from==='lost'&&t.to!=='contacted'))||new Set(v.transitions.map(t=>`${t.from}:${t.to}`)).size!==v.transitions.length) ctx.addIssue({code:'custom',message:'Transições inválidas.'});
});
export type CompanyOperations=z.infer<typeof schema>;
export type OperationReport=CompanyOperations['reports'][number];
export type OperationMetrics=Record<typeof reportMetrics[number],number>;
export function defaultOperations():CompanyOperations {
 return {stages:FUNNEL_STAGE_ORDER.map(code=>({code,label:FUNNEL_STAGE_META[code].label,visible:true})),transitions:operationalCodes.flatMap(from=>operationalCodes.filter(to=>to!==from&&(from!=='lost'||to==='contacted')).map(to=>({from,to}))),reports:[]};
}
export function validateOperations(value:unknown):CompanyOperations{return schema.parse(value);}
export function visibleOperationStages(value:CompanyOperations,counts:Partial<Record<FunnelStageKey,number>>) {
 return value.stages.filter(s=>s.visible||(counts[s.code]??0)>0);
}
/** Additional restriction only: canonical financial/activation checks still run. */
export function operationalTransitionAllowed(value:CompanyOperations,from:FunnelStageKey,to:FunnelStageKey) {
 if(from===to)return true;
 if(!operationalCodes.includes(from as typeof operationalCodes[number])||!operationalCodes.includes(to as typeof operationalCodes[number]))return true;
 return value.transitions.some(t=>t.from===from&&t.to===to);
}
export function evaluateOperationReport(report:OperationReport,metrics:OperationMetrics):string {
 if(report.display==='count')return String(metrics[report.metric]);
 const total=reportMetrics.reduce((sum,k)=>sum+metrics[k],0);
 return total?`${Math.round(metrics[report.metric]/total*100)}%`:'—';
}
export { operationalCodes };
