import { afterEach, expect, it, vi } from 'vitest';
import { sendFunnelWhatsAppMessage } from '../../supabase/functions/_shared/sales-funnel';

afterEach(() => vi.unstubAllGlobals());
it('consumes company payment-link copy through the existing idempotent funnel sender', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const scopes: Array<[string, unknown]> = [];
  let claimed = false;
  const admin = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), from(table: string) {
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { if (key === 'company_id') scopes.push([table, value]); return q; }, order: () => q, limit: () => q,
      maybeSingle: async () => ({ error: null, data: table === 'company_product_settings'
        ? { version: 1, settings: { brand: { company_name: 'Synthetic A' }, messages: { payment_link: '{{empresa}}: {{primeiro_nome}}, {{link}}' } } }
        : table === 'whatsapp_instances' ? { id: 'instance', instance_name: 'synthetic', status: 'connected' }
        : table === 'student_funnel_events' ? { status: 'completed' }
        : { id: 'chat', student_id: 'student' } }),
      insert: async (row: Record<string, unknown>) => {
        writes.push({ table, ...row });
        if (table === 'student_funnel_events') { const error = claimed ? { code: '23505' } : null; claimed = true; return { error }; }
        return { error: null };
      },
      update: (row: Record<string, unknown>) => { writes.push({ table, ...row }); return q; },
    };
    return q;
  } };
  const fetch = vi.fn(async () => new Response(JSON.stringify({ key: { id: 'synthetic-receipt' } }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'EVOLUTION_API_URL' ? 'https://provider.invalid' : 'synthetic' } });
  const args = { admin, companyId: 'company-a', studentId: 'student', fullName: 'Ana Teste', phone: '+55 48 99999-9999', text: 'Legacy', eventType: 'payment_link_sent', eventKey: 'synthetic-link', templateValues: { link: 'https://payment.invalid/synthetic' } };
  expect((await sendFunnelWhatsAppMessage(args)).sent).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(call[0]).toBe('https://provider.invalid/message/sendText/synthetic');
  expect(JSON.parse(String(call[1].body)).text).toBe('Synthetic A: Ana, https://payment.invalid/synthetic');
  expect(scopes).toContainEqual(['company_product_settings', 'company-a']);
  expect(writes).toContainEqual(expect.objectContaining({ table: 'whatsapp_messages', message_id_external: 'synthetic-receipt', content: 'Synthetic A: Ana, https://payment.invalid/synthetic' }));
  expect(await sendFunnelWhatsAppMessage(args)).toEqual({ sent: true, reason: 'already_processed' });
  expect(fetch).toHaveBeenCalledOnce();
});
