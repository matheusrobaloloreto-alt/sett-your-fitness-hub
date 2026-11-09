import { useAuth } from '@/hooks/useAuth';
import { useMaster } from '@/contexts/MasterContext';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { WhatsAppConnectionPanel } from '@/pages/admin/WhatsAppSettings';
import CompanyIntegrationCredentials from './CompanyIntegrationCredentials';

/** Moving this UI never moves credentials or creates/replaces the provider instance. */
export default function CompanyIntegrations({companyId, visible = true}: {companyId: string; visible?: boolean}) {
  const auth=useAuth();
  const master=useMaster();
  const features=useCompanyFeatures();
  const authorized=Boolean(companyId && ((auth.role==='admin' && auth.companyId===companyId)
    || (auth.role==='master' && master.isViewingCompany && master.viewingCompany?.id===companyId)));
  if (!authorized) return <p role="alert">Selecione uma empresa com acesso de administrador para consultar as integrações.</p>;
  return <section aria-label="Integrações da empresa" className="space-y-6">
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
      <h2 className="text-lg font-semibold">Conexão em uso</h2>
      <p className="text-sm text-muted-foreground">Gerencie aqui a instância WhatsApp já vinculada à empresa, sem transferir suas credenciais. Ao abrir, o estado é consultado. Se uma conexão já estiver aguardando leitura do QR Code, o painel acompanha a tentativa e pode atualizar o código automaticamente. Uma sessão conectada não é desconectada ao navegar por esta área.</p>
    </div>
    {visible && (features.loading ? <p>Carregando acesso ao WhatsApp…</p> : features.hasWhatsApp
      ? <WhatsAppConnectionPanel key={companyId} embedded />
      : <p className="text-sm text-muted-foreground">O WhatsApp não está habilitado para esta empresa.</p>)}
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">Credenciais próprias da empresa · preparação</summary>
      <div className="pt-4 space-y-3">
        <p className="text-sm text-muted-foreground">Este cofre guarda chaves para uma ativação futura por empresa. Estar vazio aqui não significa que a integração do servidor esteja desligada. As chaves preparadas ainda não são usadas nos envios nem nas cobranças.</p>
        <CompanyIntegrationCredentials key={companyId} companyId={companyId}/>
      </div>
    </details>
  </section>;
}
