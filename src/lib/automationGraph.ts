export interface AutomationGraphClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
export function isAutomationGraphConflict(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && (error.code === 'PT409' || error.code === '40001');
}
export function requireDeletedAutomationFlow(result: { data: unknown; error: { code?: string; message?: string } | null }, flowId: string): void {
  if (result.error) throw result.error;
  if (!Array.isArray(result.data) || result.data.length !== 1 || result.data[0]?.id !== flowId) throw new Error('flow_delete_unconfirmed');
}
export async function saveAutomationGraph(client: AutomationGraphClient, companyId: string, flowId: string, expectedRevision: number, nodes: readonly unknown[], edges: readonly unknown[]): Promise<number> {
  if (!companyId || !flowId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('flow_revision_required');
  const { data, error } = await client.rpc('save_company_automation_graph', { _company_id: companyId, _flow_id: flowId, _expected_revision: expectedRevision, _nodes: nodes, _edges: edges });
  if (isAutomationGraphConflict(error)) throw Object.assign(new Error('Outra pessoa alterou este fluxo. Recarregue antes de salvar novamente.'), { code: error?.code });
  if (error) throw error;
  if (data === null || typeof data !== 'object' || !('revision' in data) || data.revision !== expectedRevision + 1) throw new Error('flow_save_revision_unconfirmed');
  return data.revision as number;
}
