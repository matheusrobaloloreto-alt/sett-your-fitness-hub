export type ReconciliationSource = 'flow' | 'intercycle' | 'webhook';
export type ReconciliationRow = {
  id: string; source: ReconciliationSource; name: string; status: string;
  updated_at: string | null; revision: number; last_action: 'review' | 'cancel' | null;
  ack_count: number; unknown_count: number;
};

// Explicit projection avoids accidentally displaying RPC/body/recipient data.
export function parseReconciliationRows(data: unknown): ReconciliationRow[] {
  if (!Array.isArray(data) || data.length > 50) throw new Error('dispatch_projection_invalid');
  return data.map((row: Record<string, unknown>) => {
    if (!row || typeof row.id !== 'string' || !['flow','intercycle','webhook'].includes(String(row.source)) ||
      typeof row.name !== 'string' || typeof row.status !== 'string' ||
      !(row.updated_at === null || typeof row.updated_at === 'string') ||
      !Number.isInteger(row.revision) || Number(row.revision) < 0 ||
      !Number.isInteger(row.ack_count) || Number(row.ack_count) < 0 ||
      !Number.isInteger(row.unknown_count) || Number(row.unknown_count) < 0 ||
      !(row.last_action === null || row.last_action === 'review' || row.last_action === 'cancel')) {
      throw new Error('dispatch_projection_invalid');
    }
    return { id: row.id, source: row.source as ReconciliationSource, name: row.name, status: row.status,
      updated_at: row.updated_at as string | null, revision: Number(row.revision), last_action: row.last_action as ReconciliationRow['last_action'],
      ack_count: Number(row.ack_count), unknown_count: Number(row.unknown_count) };
  });
}
