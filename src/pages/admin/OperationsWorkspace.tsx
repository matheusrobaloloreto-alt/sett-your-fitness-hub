import OperationsDesigner from './OperationsDesigner';
import AgendaAvailabilityEditor from '@/components/admin/operations/AgendaAvailabilityEditor';
import {useCompanyFeatures} from '@/hooks/useCompanyFeatures';

export default function OperationsWorkspace(){
 const features=useCompanyFeatures();
 if(features.loading)return <p role="status" className="p-6">Carregando operação…</p>;
 return <div className="space-y-6">
  {(features.hasRegistration||features.hasDashboard)&&<OperationsDesigner/>}
  {features.hasAgenda&&<section className="mx-auto max-w-6xl px-4 pb-6"><AgendaAvailabilityEditor/></section>}
  {!features.hasRegistration&&!features.hasDashboard&&!features.hasAgenda&&<p className="p-6">Nenhum módulo operacional disponível para esta empresa.</p>}
 </div>;
}
