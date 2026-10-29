import CompanyOperatorConsole from "@/components/master/CompanyOperatorConsole";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
export default function CompanySupportConsole(){
 const {companyId,role}=useAuth();const {viewingCompany}=useMaster();
 const id=role==="master"?viewingCompany?.id:companyId;
 if(!id)return <p role="alert" className="p-6">Selecione uma empresa para consultar o diagnóstico.</p>;
 return <main className="p-4 md:p-6 max-w-4xl"><CompanyOperatorConsole key={id} companyId={id} canManage={false}/></main>;
}
