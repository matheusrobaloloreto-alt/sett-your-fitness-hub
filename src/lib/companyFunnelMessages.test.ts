import { afterEach, expect, it, vi } from 'vitest';
import { sendFunnelWhatsAppMessage } from '../../supabase/functions/_shared/sales-funnel';

afterEach(() => vi.unstubAllGlobals());
it.each([
  {
    name: 'configured payment link',
    event: 'payment_link',
    template: '{{empresa}}: {{primeiro_nome}}, {{link}}',
    message: { text: 'Legacy', eventType: 'payment_link_sent', templateValues: { link: 'https://payment.invalid/synthetic' } },
    expected: 'Synthetic A: Ana, https://payment.invalid/synthetic',
  },
  {
    name: 'stored legacy default',
    event: 'assessment_onboarding',
    template: 'Oi, {{primeiro_nome}}! Pagamento confirmado. A equipe vai enviar as instrucoes da avaliacao de movimento. Prazo: {{prazo}} dias uteis, com previsao ate {{data}}.',
    message: { eventType: 'assessment_instructions_sent' as const, payload: { has_anamnesis: true } },
    expected: /recebimento do material completo.*2 dias úteis para concluir a avaliação.*7 dias úteis para entregar a primeira prescrição/,
  },
  {
    name: 'custom legacy assessment template',
    event: 'assessment_onboarding',
    template: '{{empresa}}: {{primeiro_nome}}, primeira prescrição em {{prazo}} dias úteis, até {{data}}.',
    message: {
      eventType: 'assessment_instructions_sent' as const,
      payload: { assessment_due_at: '2099-01-01' },
      templateValues: { data: '01/01/2099' },
    },
    expected: 'Synthetic A: Ana, primeira prescrição em 7 dias úteis, até a data definida a partir do recebimento do material.',
  },
])('renders $name through the existing idempotent funnel sender', async ({ event, template, message, expected }) => {
  const writes: Array<Record<string, unknown>> = [];
  const scopes: Array<[string, unknown]> = [];
  let claimed = false;
  const admin = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), from(table: string) {
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { if (key === 'company_id') scopes.push([table, value]); return q; }, order: () => q, limit: () => q,
      maybeSingle: async () => ({ error: null, data: table === 'company_product_settings'
        ? { version: 1, settings: { brand: { company_name: 'Synthetic A' }, business: { assessment_sla_business_days: 7 }, messages: { [event]: template } } }
        : table === 'whatsapp_instances' ? { id: 'instance', instance_name: 'synthetic', status: 'connected' }
        : table === 'student_funnel_events' ? { status: 'completed' }
        : table === 'whatsapp_chats' ? { id: 'chat', student_id: 'student' } : null }),
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
  const args = { admin, companyId: 'company-a', studentId: 'student', fullName: 'Ana Teste', phone: '+55 48 99999-9999', eventKey: 'synthetic-event', ...message };
  expect((await sendFunnelWhatsAppMessage(args)).sent).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(call[0]).toBe('https://provider.invalid/message/sendText/synthetic');
  const text = JSON.parse(String(call[1].body)).text;
  if (typeof expected === 'string') expect(text).toBe(expected);
  else expect(text).toMatch(expected);
  expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
  expect(scopes).toContainEqual(['company_product_settings', 'company-a']);
  expect(writes).toContainEqual(expect.objectContaining({ table: 'whatsapp_messages', message_id_external: 'synthetic-receipt', content: text }));
  expect(await sendFunnelWhatsAppMessage(args)).toEqual({ sent: true, reason: 'already_processed' });
  expect(fetch).toHaveBeenCalledOnce();
});
