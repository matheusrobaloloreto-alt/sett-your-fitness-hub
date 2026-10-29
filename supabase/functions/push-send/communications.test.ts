import { handlePushRequest } from './index.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
Deno.test('daily push honors per-company hour, enabled flag, templates and durable receipts', async () => {
  const previous = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service');
  const hour = new Date().getUTCHours();
  const receipts = new Set<string>();
  const delivered: string[] = [];
  const lookedUp: string[] = [];
  const settings: Record<string, unknown> = {
    a: { notifications: { daily_reminder_hour: hour }, contact_policy: { timezone: 'UTC' }, messages: { daily_reminder_title: 'Empresa A', daily_reminder_body: 'Oi {{primeiro_nome}}' } },
    b: { notifications: { daily_reminder_enabled: false, daily_reminder_hour: hour }, contact_policy: { timezone: 'UTC' } },
    c: { notifications: { daily_reminder_hour: (hour + 1) % 24 }, contact_policy: { timezone: 'UTC' } },
  };
  const admin = { from(table: string) {
    const filters: Record<string, any> = {};
    let inserted: any;
    const result = () => {
      if (table === 'training_cycles') return { data: ['a', 'b', 'c'].map(id => ({ student_id: id, enrollment_id: null })) };
      if (table === 'students') return { data: (filters.id || ['a', 'b', 'c']).map((id: string) => ({ user_id: id, company_id: id, full_name: 'Ana Teste' })) };
      if (table === 'company_product_settings') { lookedUp.push(filters.company_id); return { data: { settings: settings[filters.company_id], version: 1 } }; }
      if (table === 'push_subscriptions') return { data: filters.user_id.map((id: string) => ({ id: `sub-${id}`, user_id: id, endpoint: 'https://push.invalid', p256dh: 'synthetic', auth: 'synthetic' })) };
      if (table === 'company_push_reminder_receipts') {
        const key = JSON.stringify(inserted);
        if (receipts.has(key)) return { error: { code: '23505' } };
        receipts.add(key); return { error: null };
      }
      throw new Error(`Unexpected table ${table}`);
    };
    const q: any = { select: () => q, eq: (k: string, v: unknown) => { filters[k] = v; return q; }, in: (k: string, v: unknown) => { filters[k] = v; return q; }, not: () => q,
      insert: (value: unknown) => { inserted = value; return q; }, maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return q;
  } };
  try {
    const run = () => handlePushRequest(new Request('https://push.invalid', { method: 'POST', headers: { authorization: 'Bearer synthetic-service' }, body: JSON.stringify({ action: 'daily_reminder' }) }), {
      admin, send: async (_subscription, payload) => { delivered.push(payload); return {} as any; },
    });
    const first = await run();
    assert(first.status === 200 && (await first.json()).sent === 1, 'Daily dispatch did not respect company filters');
    assert(delivered.length === 1 && JSON.parse(delivered[0]).title === 'Empresa A' && JSON.parse(delivered[0]).body === 'Oi Ana', 'Company templates were ignored');
    assert(lookedUp.includes('a') && lookedUp.includes('b') && lookedUp.includes('c'), 'Settings were not scoped to each company');
    const again = await run();
    assert((await again.json()).sent === 0 && delivered.length === 1, 'Duplicate local-day reminder');
    settings.a = { notifications: { new_workout_enabled: true }, messages: { new_workout_push_title: 'Publicado A', new_workout_push_body: 'Treino para {{primeiro_nome}}' } };
    settings.b = { notifications: { new_workout_enabled: false } };
    const publication = await handlePushRequest(new Request('https://push.invalid', { method: 'POST', headers: { authorization: 'Bearer synthetic-service' }, body: JSON.stringify({ action: 'notify', event: 'new_workout', student_ids: ['a', 'b'] }) }), {
      admin, send: async (_subscription, payload) => { delivered.push(payload); return {} as any; },
    });
    assert((await publication.json()).sent === 1 && delivered.length === 2, 'Publication enabled flag ignored');
    assert(JSON.parse(delivered[1]).title === 'Publicado A' && JSON.parse(delivered[1]).body === 'Treino para Ana', 'Publication template ignored');
  } finally {
    if (previous === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY'); else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previous);
  }
});
