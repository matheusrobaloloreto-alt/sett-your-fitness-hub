import { Link } from 'react-router-dom';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useAuth } from '@/hooks/useAuth';
import { WhatsAppConnectionPanel } from './WhatsAppSettings';

/** Coordinator/trainer retain their existing operational WhatsApp access, without the admin vault. */
export default function ConnectionSettings() {
  const {role,companyId}=useAuth();
  const features=useCompanyFeatures();
  const {canAccess}=useRolePermissions();
  const canManageWhatsApp=features.hasWhatsApp && canAccess('whatsapp');
  if (!['coordinator','trainer'].includes(role || '') || !companyId) return <p role="alert">Acesso às configurações indisponível.</p>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl font-semibold">Configurações</h1>
    <nav aria-label="Seções de configuração"><span aria-current="page" className="inline-flex rounded-md bg-muted px-4 py-2">Integrações</span></nav>
    <p className="text-sm text-muted-foreground">Conexão WhatsApp da sua empresa. Credenciais e administração continuam restritas aos administradores.</p>
    {features.loading ? <p>Carregando acesso ao WhatsApp…</p> : canManageWhatsApp ? <WhatsAppConnectionPanel key={companyId} embedded/> : <p>O gerenciamento do WhatsApp não está disponível para este perfil ou empresa.</p>}
    <Link to="/suporte" className="inline-flex rounded-md border border-border px-4 py-2">Diagnóstico</Link>
  </div>;
}
