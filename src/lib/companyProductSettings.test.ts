import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_COMPANY_PRODUCT_SETTINGS as defaults,
  normalizeCompanyProductSettings as normalize,
  getCompanyProductSettings,
} from '../../supabase/functions/_shared/company-product-settings';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));
import { fetchCompanyProductSettings, saveCompanyProductSettings } from './companyProductSettings';

function respond(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
  return eq;
}

describe('company product settings contract', () => {
  it('merges partial nested settings without sharing mutable defaults', () => {
    const a = normalize({ brand: { company_name: 'Empresa A' } });
    expect(a.contact_policy.minimum_interval_hours).toBe(72);
    expect(a.brand.company_name).toBe('Empresa A');
    a.contact_policy.weekdays.push(7);
    expect(normalize({})).toEqual(defaults);
    expect(normalize({ prescription: { beginner_max_weekly_sets: 12 } }).prescription.beginner_max_weekly_sets).toBe(12);
  });

  it.each([
    null, [], { unknown: {} }, { brand: { api_key: 'x' } },
    { contact_policy: { minimum_interval_hours: 71 } },
    { contact_policy: { max_weekly_contacts: 3 } },
    { contact_policy: { no_workout_days: 6 } },
    { contact_policy: { no_workout_repeat_days: 5 } },
    { contact_policy: { cart_abandonment_hours: 1 } },
    { contact_policy: { weekdays: [0] } }, { contact_policy: { weekdays: [] } },
    { contact_policy: { weekdays: [1, 1] } },
    { contact_policy: { start_hour: 20, end_hour: 8 } },
    { contact_policy: { timezone: 'Invalid/Zone' } },
    { prescription: { first_week_volume_multiplier: 1.1 } },
    { prescription: { beginner_max_weekly_sets: 22 } },
    { prescription: { default_cadence: 'evil' } },
    { prescription: { preferred_split: 'unknown' } },
    { business: { assessment_sla_business_days: 0 } },
    { experience: { cadence_warning_hours: 80, cadence_critical_hours: 10 } },
    { notifications: { daily_reminder_enabled: 'true' } },
    { messages: { weekly_contact: 'Oi {{senha}}' } },
    { messages: { weekly_contact: 'Oi {{nome}' } },
    { messages: { weekly_contact: 'Bearer synthetic-credential-value' } },
    { brand: { terms_url: 'javascript:alert(1)' } },
    { brand: { support_email: 'invalid' } },
  ])('rejects unsafe or malformed settings: %j', (input) => {
    expect(() => normalize(input)).toThrow();
  });

  it('allows only event-supported template variables and preserves notes as text', () => {
    const template = '{{primeiro_nome}} {{nome}} {{empresa}}';
    expect(normalize({ messages: { weekly_contact: template } }).messages.weekly_contact).toBe(template);
    expect(normalize({ prescription: { methodology_notes: 'Orientacao para revisao humana' } }).prescription.methodology_notes).toContain('revisao');
  });

  it('accepts communication policy boundary values with the workout push toggle', () => {
    const normalized = normalize({ contact_policy: { no_workout_days: 7, no_workout_repeat_days: 90, cart_abandonment_hours: 720 }, notifications: { new_workout_enabled: false } });
    expect(normalized.contact_policy.no_workout_repeat_days).toBe(90);
    expect(normalized.notifications.new_workout_enabled).toBe(false);
  });

  it('reads only the requested company and returns a merged envelope', async () => {
    const eq = respond({ settings: { brand: { company_name: 'A' } }, version: 3 });
    const result = await fetchCompanyProductSettings('company-a');
    expect(eq).toHaveBeenCalledWith('company_id', 'company-a');
    expect(result.version).toBe(3);
    expect(result.settings.brand.company_name).toBe('A');
    expect(result.settings.prescription.default_cadence).toBe('2020');
    expect(await getCompanyProductSettings({ from } as never, 'company-a')).toEqual(result.settings);
  });

  it.each(['42P01', 'PGRST205'])('falls back on missing DDL %s only for reads', async (code) => {
    respond(null, { code });
    expect(await fetchCompanyProductSettings('company-a')).toEqual({ settings: defaults, version: 0 });
    rpc.mockResolvedValue({ data: null, error: { code } });
    await expect(saveCompanyProductSettings('company-a', defaults, 0)).rejects.toMatchObject({ code });
  });

  it('does not hide permission, network, or invalid server data errors', async () => {
    respond(null, { code: '42501' });
    await expect(fetchCompanyProductSettings('a')).rejects.toMatchObject({ code: '42501' });
    respond({ settings: {}, version: -1 });
    await expect(fetchCompanyProductSettings('a')).rejects.toThrow();
    respond({ settings: { messages: { weekly_contact: '{{link}}' } }, version: 1 });
    await expect(fetchCompanyProductSettings('a')).rejects.toThrow('messages.weekly_contact.variable.link');
    await expect(fetchCompanyProductSettings('')).rejects.toThrow();
  });

  it('uses optimistic concurrency and exposes version conflicts', async () => {
    rpc.mockResolvedValue({ data: { settings: defaults, version: 2 }, error: null });
    expect((await saveCompanyProductSettings('a', defaults, 1)).version).toBe(2);
    expect(rpc).toHaveBeenLastCalledWith('save_company_product_settings', {
      _company_id: 'a', _settings: defaults, _expected_version: 1,
    });
  });

  it.each(['PT409', '40001'])('normalizes application conflict %s without retrying or losing its server code', async code => {
    const previousCalls = rpc.mock.calls.length;
    rpc.mockResolvedValue({ data: null, error: { code, message: 'Settings version conflict' } });
    const failure = await saveCompanyProductSettings('a', defaults, 1).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ code });
    expect(failure.message).toMatch(/outra pessoa.*recarregue/i);
    expect(rpc.mock.calls.length).toBe(previousCalls + 1);
  });

  it('requires an actual server envelope on save and validates before RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(saveCompanyProductSettings('a', defaults, 0)).rejects.toThrow();
    const count = rpc.mock.calls.length;
    await expect(saveCompanyProductSettings('a', { ...defaults, messages: { ...defaults.messages, weekly_contact: '{{link}}' } }, 0)).rejects.toThrow('messages.weekly_contact.variable.link');
    await expect(saveCompanyProductSettings('a', { ...defaults, brand: { ...defaults.brand, support_email: 'bad' } }, 0)).rejects.toThrow();
    await expect(saveCompanyProductSettings('a', defaults, -1)).rejects.toThrow();
    expect(rpc.mock.calls.length).toBe(count);
  });

  it('SQL prevents direct writes, validates JSON and records history under lock', () => {
    const sql = readFileSync('supabase/migrations/20261026092601_company_product_settings.sql', 'utf8');
    for (const token of ['enable row level security', '42501', 'PT409', 'pg_advisory_xact_lock',
      'company_product_settings_history', 'validate_company_product_settings',
      'revoke all on table', 'grant select on table', 'jsonb_object_keys', "'admin'", "'master'", '_expected_version']) {
      expect(sql.toLowerCase()).toContain(token.toLowerCase());
    }
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table[^;]+to authenticated/i);
  });

  it('SQL and TypeScript defaults are identical for every allowed field', () => {
    const sql = readFileSync('supabase/migrations/20261028090117_company_prescription_methodology.sql', 'utf8');
    const json = sql.match(/select '([\s\S]+?)'::jsonb;/)?.[1];
    expect(json).toBeDefined();
    expect(JSON.parse(json!)).toEqual(defaults);
  });
});
