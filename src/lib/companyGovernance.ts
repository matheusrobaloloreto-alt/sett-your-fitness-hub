import { supabase } from '@/integrations/supabase/client';

export const GOVERNANCE_PERMISSIONS = [{ id: 'company_dashboard_full', label: 'Painel completo da empresa (professores)' }] as const;
export interface GovernanceMember { user_id: string; name: string; roles: string[] }
export interface OwnershipRequest {
  id: string; requester_id: string; recipient_id: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired'; expires_at: string;
}
export interface GovernanceBundle { id: string; name: string; permissions: string[] }
export interface GovernanceSnapshot {
  company_id: string; owner_id: string | null; version: number; can_manage: boolean;
  members: GovernanceMember[]; transfers: OwnershipRequest[]; bundles: GovernanceBundle[];
  assignments: { role_id: string; user_id: string }[];
  audit: { id: string; action: string; version: number; created_at: string; actor_id: string }[];
}
export type GovernanceAction = 'request_transfer' | 'accept_transfer' | 'cancel_transfer' | 'expire_transfer'
  | 'save_role' | 'assign_role' | 'unassign_role' | 'delete_role';
interface GovernanceRpc {
  rpc(name: 'get_company_governance' | 'change_company_governance', args: Record<string, unknown>):
    PromiseLike<{ data: unknown; error: {code?: string; message?: string} | null }>;
}
// Generated types predate this forward migration; cast only the RPC boundary.
const rpc = supabase as unknown as GovernanceRpc;
export function governanceError(error: unknown): string {
  const code = (error as {code?: string})?.code;
  if (code === 'PT409' || code === '40001') return 'O estado mudou ou a solicitação venceu. Recarregue antes de tentar novamente.';
  if (code === '42501') return 'Você não tem permissão para esta ação nesta empresa.';
  if (code === '23505') return 'Já existe um papel com este nome ou uma transferência pendente.';
  if (code === '22023' || code === '23514' || code === '22P02') return 'Confira o membro selecionado, o nome e as permissões permitidas.';
  return 'Não foi possível confirmar a operação. Recarregue para conferir o estado salvo.';
}
export function parseGovernance(value: unknown, companyId: string): GovernanceSnapshot {
  const v = value as GovernanceSnapshot;
  if (!v || v.company_id !== companyId || !Number.isSafeInteger(v.version) || v.version < 0
    || typeof v.can_manage !== 'boolean' || !(v.owner_id === null || typeof v.owner_id === 'string')
    || !['members','transfers','bundles','assignments','audit'].every(key => Array.isArray(v[key as keyof GovernanceSnapshot]))) {
    throw new Error('Resposta de governança inválida. Recarregue.');
  }
  return v;
}
export async function fetchCompanyGovernance(companyId: string) {
  const {data,error} = await rpc.rpc('get_company_governance',{_company_id:companyId});
  if (error) throw error;
  return parseGovernance(data,companyId);
}
export async function changeCompanyGovernance(companyId: string, action: GovernanceAction, payload: Record<string,unknown>, version: number) {
  if (!companyId || !Number.isSafeInteger(version) || version < 0) throw new Error('Versão inválida');
  const {data,error} = await rpc.rpc('change_company_governance',{_company_id:companyId,_action:action,_payload:payload,_expected_version:version});
  if (error) throw error;
  const result = parseGovernance(data,companyId);
  if (result.version !== version + 1) throw new Error('Versão inesperada');
  return result;
}
