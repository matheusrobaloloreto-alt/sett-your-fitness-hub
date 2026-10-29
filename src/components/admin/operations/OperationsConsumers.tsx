import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { useQuery } from '@tanstack/react-query';
import { fetchCompanyOperations, fetchOperationMetrics } from '@/lib/companyOperationsStore';
import { evaluateOperationReport, type CompanyOperations, type OperationMetrics } from '@/lib/companyOperations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function useCompanyOperations(companyId:string|null|undefined, enabled=true) {
 return useQuery({queryKey:['company-operations',companyId],queryFn:()=>fetchCompanyOperations(companyId!),enabled:!!companyId&&enabled,staleTime:0});
}
export function OperationsReportPreview({settings,metrics}:{settings:CompanyOperations;metrics:OperationMetrics}) {
 return <section aria-label="Relatórios operacionais" className="grid gap-3 sm:grid-cols-2">{settings.reports.map(report=><Card key={report.id}><CardHeader><CardTitle className="text-base">{report.title}</CardTitle></CardHeader><CardContent><p className="text-2xl">{evaluateOperationReport(report,metrics)}</p><p className="text-xs text-muted-foreground">Retrato atual · {report.display==='share'?'Participação entre alunos ativos, pendentes, aguardando renovação e inativos':'Contagem de alunos pelo status cadastral'}. Não representa confirmação de pagamento.</p></CardContent></Card>)}</section>;
}
export function CompanyOperationsReports({companyId}:{companyId:string}) {
 const features=useCompanyFeatures();
 const allowed=!features.loading&&features.hasDashboard;
 const config=useCompanyOperations(companyId,allowed);
 const metrics=useQuery({queryKey:['company-operation-metrics',companyId],queryFn:()=>fetchOperationMetrics(companyId),enabled:allowed&&!!config.data?.settings.reports.length,staleTime:30_000});
 if(!allowed)return null;
 if(config.error||metrics.error)return <p role="alert">Relatórios operacionais indisponíveis.</p>;
 if(!config.data?.settings.reports.length)return null;
 if(!metrics.data)return <p>Carregando relatórios operacionais…</p>;
 return <OperationsReportPreview settings={config.data.settings} metrics={metrics.data}/>;
}
