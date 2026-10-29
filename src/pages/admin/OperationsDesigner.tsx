import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useMaster } from '@/contexts/MasterContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { metricLabels, operationalCodes, reportMetrics, type CompanyOperations } from '@/lib/companyOperations';
import { fetchCompanyOperations, fetchOperationMetrics, saveCompanyOperations, type OperationsEnvelope } from '@/lib/companyOperationsStore';
import { OperationsReportPreview } from '@/components/admin/operations/OperationsConsumers';
function OperationsEditor({companyId}:{companyId:string}) {
 const cache=useQueryClient();
 const features=useCompanyFeatures();
 const canRead=!features.loading&&(features.hasRegistration||features.hasDashboard);
 const saved=useQuery({queryKey:['company-operations',companyId],queryFn:()=>fetchCompanyOperations(companyId),enabled:canRead,staleTime:0});
 const metrics=useQuery({queryKey:['company-operation-metrics',companyId],queryFn:()=>fetchOperationMetrics(companyId),enabled:!features.loading&&features.hasDashboard});
 const [draft,setDraft]=useState<OperationsEnvelope|null>(null);
 const [notice,setNotice]=useState('');
 const value=draft??saved.data;
 const update=(settings:CompanyOperations)=>{if(value)setDraft({...value,settings});setNotice('');};
 const save=useMutation({mutationFn:async()=>{
  if(!value)throw new Error('Carregue a operação.');
  const ack=await saveCompanyOperations(companyId,value.settings,value.version);
  const read=await fetchCompanyOperations(companyId);
  if(read.version!==ack.version)throw new Error('A versão mudou após salvar. Recarregue.');
  return read;
 },onSuccess:read=>{cache.setQueryData(['company-operations',companyId],read);setDraft(null);setNotice('Salvo e relido do servidor.');},onError:error=>setNotice(error.message)});
 if(features.loading)return <p>Carregando permissões…</p>;
 if(!canRead)return <p role="alert">Cadastro e dashboard indisponíveis para esta empresa.</p>;
 if(saved.isPending)return <p>Carregando operação…</p>;
 if(saved.error||!value)return <p role="alert">Não foi possível carregar a operação.</p>;
 const settings=value.settings;
 return <div className="space-y-4"><p>Versão {value.version}. As alterações restringem apenas transições operacionais. Pagamento, ativação e avaliação seguem os fluxos existentes.</p>
 <fieldset disabled={save.isPending} className="space-y-4">
 <fieldset disabled={!features.hasRegistration}><Card><CardHeader><CardTitle>Etapas do funil</CardTitle></CardHeader><CardContent className="space-y-3">{settings.stages.map((s,i)=><div key={s.code} className="flex flex-wrap gap-2 items-center"><label className="flex-1 min-w-40">{s.code}<Input aria-label={`Rótulo ${s.code}`} maxLength={80} value={s.label} onChange={e=>update({...settings,stages:settings.stages.map(v=>v.code===s.code?{...v,label:e.target.value}:v)})}/></label><label><input type="checkbox" aria-label={`Exibir ${s.code}`} checked={s.visible} disabled={!operationalCodes.includes(s.code as typeof operationalCodes[number])} onChange={e=>update({...settings,stages:settings.stages.map(v=>v.code===s.code?{...v,visible:e.target.checked}:v)})}/> Exibir</label><Button variant="outline" disabled={i===0} onClick={()=>{const stages=[...settings.stages];[stages[i-1],stages[i]]=[stages[i],stages[i-1]];update({...settings,stages});}} aria-label={`Subir ${s.code}`}>↑</Button></div>)}<p className="text-xs">Etapas com cartões continuam visíveis, mesmo ocultadas.</p></CardContent></Card>
 <Card><CardHeader><CardTitle>Transições operacionais permitidas</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{operationalCodes.flatMap(from=>operationalCodes.filter(to=>to!==from&&(from!=='lost'||to==='contacted')).map(to=><label key={`${from}:${to}`}><input type="checkbox" checked={settings.transitions.some(t=>t.from===from&&t.to===to)} onChange={e=>update({...settings,transitions:e.target.checked?[...settings.transitions,{from,to}]:settings.transitions.filter(t=>t.from!==from||t.to!==to)})}/> {settings.stages.find(s=>s.code===from)?.label} → {settings.stages.find(s=>s.code===to)?.label}</label>))}</CardContent></Card>
 </fieldset><fieldset disabled={!features.hasDashboard}><Card><CardHeader><CardTitle>Relatórios e indicadores</CardTitle></CardHeader><CardContent className="space-y-3">{settings.reports.map(report=><div key={report.id} className="flex flex-wrap gap-2"><Input className="w-52" aria-label={`Título ${report.id}`} value={report.title} maxLength={80} onChange={e=>update({...settings,reports:settings.reports.map(r=>r.id===report.id?{...r,title:e.target.value}:r)})}/><select aria-label={`Métrica ${report.id}`} value={report.metric} onChange={e=>update({...settings,reports:settings.reports.map(r=>r.id===report.id?{...r,metric:e.target.value as typeof r.metric}:r)})}>{reportMetrics.map(m=><option key={m} value={m}>{metricLabels[m]}</option>)}</select><select aria-label={`Exibição ${report.id}`} value={report.display} onChange={e=>update({...settings,reports:settings.reports.map(r=>r.id===report.id?{...r,display:e.target.value as typeof r.display}:r)})}><option value="count">Contagem</option><option value="share">Participação (%)</option></select><Button variant="outline" onClick={()=>update({...settings,reports:settings.reports.filter(r=>r.id!==report.id)})}>Remover</Button></div>)}<Button disabled={settings.reports.length>=8} onClick={()=>update({...settings,reports:[...settings.reports,{id:crypto.randomUUID(),title:'Alunos ativos',metric:'active',display:'count'}]})}>Adicionar relatório</Button><p className="text-xs">Até 8 indicadores do retrato atual; sem filtros clínicos, expressões livres ou receitas estimadas.</p></CardContent></Card>
 </fieldset><Button onClick={()=>save.mutate()} disabled={!draft||save.isPending}>{save.isPending?'Salvando…':'Salvar operação'}</Button>{' '}<Button variant="outline" onClick={()=>{setDraft(null);setNotice('');void saved.refetch();}} disabled={save.isPending}>Recarregar do servidor</Button>
 </fieldset><p role="status">{notice}</p>{!features.hasDashboard?null:metrics.error?<p role="alert">Prévia indisponível; não há contagens confirmadas.</p>:metrics.data?<OperationsReportPreview settings={settings} metrics={metrics.data}/>:<p>Carregando contagens…</p>}
 </div>;
}
export default function OperationsDesigner(){
 const {companyId,role}=useAuth();const {viewingCompany,isViewingCompany}=useMaster();
 const id=role==='master'?(isViewingCompany?viewingCompany?.id:null):companyId;
 if(role!=='admin'&&role!=='master')return <p role="alert">Apenas administradores podem configurar a operação.</p>;
 if(!id)return <p>Selecione uma empresa.</p>;
 return <main className="p-4 space-y-4"><h1 className="text-2xl font-semibold">Operação da empresa</h1><OperationsEditor key={id} companyId={id}/></main>;
}
