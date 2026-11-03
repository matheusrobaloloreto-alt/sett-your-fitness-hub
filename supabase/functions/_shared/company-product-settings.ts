// Pure TypeScript contract shared by browser and Edge consumers. No credentials belong here.
export const MESSAGE_EVENTS = [
  'weekly_contact', 'pre_registration_confirmation', 'fiscal_invite', 'payment_link',
  'assessment_onboarding', 'anamnesis_invite', 'renewal_due', 'renewal_overdue',
  'intercycle_invite', 'first_contact', 'daily_reminder_title', 'daily_reminder_body',
  'new_workout_push_title', 'new_workout_push_body',
] as const;
export type MessageEvent = typeof MESSAGE_EVENTS[number];
export const WHATSAPP_EVENTS = MESSAGE_EVENTS.filter((event) => !['daily_reminder_title', 'daily_reminder_body', 'new_workout_push_title', 'new_workout_push_body'].includes(event)) as readonly WhatsAppEvent[];
export type WhatsAppEvent = Exclude<MessageEvent, 'daily_reminder_title' | 'daily_reminder_body' | 'new_workout_push_title' | 'new_workout_push_body'>;
export type MessagePart = { id: string; type: 'text' | 'image' | 'video' | 'audio'; text: string; media?: { bucket: string; path: string; mimeType: string; fileName: string } };
export const MESSAGE_MEDIA_MIMES = { image: ['image/jpeg', 'image/png', 'image/webp'], video: ['video/mp4'], audio: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm'] } as const;
export const MESSAGE_MEDIA_PATH = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/message-settings\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpg|jpeg|png|webp|mp4|mp3|m4a|ogg|webm)$/;
function validateMessageSequencePayload(input: unknown, rendered: boolean): Partial<Record<WhatsAppEvent, MessagePart[]>> {
  if (!object(input)) fail('message_sequences');
  for (const [event, parts] of Object.entries(input)) {
    if (!(WHATSAPP_EVENTS as readonly string[]).includes(event) || !Array.isArray(parts) || parts.length < 1 || parts.length > 10) fail('message_sequences.' + event);
    const ids = new Set<string>();
    for (const part of parts) {
      if (!object(part) || Object.keys(part).some(k => !['id', 'type', 'text', 'media'].includes(k)) || typeof part.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(part.id) || ids.has(part.id)) fail('message_sequences.id');
      ids.add(part.id);
      if (typeof part.type !== 'string' || !['text', 'image', 'video', 'audio'].includes(part.type) || typeof part.text !== 'string') fail('message_sequences.part');
      if (rendered) {
        if (part.text.length > 6000 || secretLike.test(part.text) || (part.type === 'text' && !part.text.trim())) fail('message_sequences.text');
      } else if (part.type === 'text' || part.text.trim()) validateMessageTemplate(part.text, event as MessageEvent);
      else if (part.text.length > 6000) fail('message_sequences.text');
      if (part.type === 'text') { if (Object.hasOwn(part, 'media')) fail('message_sequences.media'); }
      else {
        const media = part.media;
        // eslint-disable-next-line no-control-regex -- Reject control bytes at this untrusted message boundary.
        if (!object(media) || Object.keys(media).sort().join(',') !== 'bucket,fileName,mimeType,path' || media.bucket !== 'whatsapp-media' || typeof media.path !== 'string' || !MESSAGE_MEDIA_PATH.test(media.path) || typeof media.mimeType !== 'string' || !(MESSAGE_MEDIA_MIMES[part.type as keyof typeof MESSAGE_MEDIA_MIMES] as readonly string[]).includes(media.mimeType) || typeof media.fileName !== 'string' || !/^[^/\\\x00-\x1f\x7f]{1,180}$/.test(media.fileName) || (secretLike.test(media.fileName) || media.fileName.includes('{{') || media.fileName.includes('}}'))) fail('message_sequences.media');
      }
    }
  }
  return JSON.parse(JSON.stringify(input));
}
export function validateMessageSequences(input: unknown): Partial<Record<WhatsAppEvent, MessagePart[]>> {
  return validateMessageSequencePayload(input, false);
}
/** Manual drafts are literal output: never parse braces or variables again. */
export function validateRenderedMessageParts(parts: unknown): MessagePart[] {
  return validateMessageSequencePayload({ first_contact: parts }, true).first_contact!;
}
export const TEMPLATE_VARIABLES = ['primeiro_nome', 'nome', 'empresa', 'link', 'prazo', 'profissional', 'email', 'data'] as const;
type TemplateVariable = typeof TEMPLATE_VARIABLES[number];
const BASE_MESSAGE_VARIABLES = ['primeiro_nome', 'nome', 'empresa'] as const;
// Only variables supplied by every consumer of the event may be offered centrally.
const EVENT_MESSAGE_VARIABLES: Record<MessageEvent, readonly TemplateVariable[]> = {
  weekly_contact: [], pre_registration_confirmation: [], fiscal_invite: ['link'], payment_link: ['link'],
  assessment_onboarding: ['prazo', 'data'], anamnesis_invite: ['link'], renewal_due: ['link'],
  renewal_overdue: ['link'], intercycle_invite: ['link'], first_contact: ['profissional'],
  daily_reminder_title: ['link', 'data'], daily_reminder_body: ['link', 'data'],
  new_workout_push_title: [], new_workout_push_body: [],
};
export function getMessageEventVariables(event: MessageEvent): readonly TemplateVariable[] {
  if (!Object.hasOwn(EVENT_MESSAGE_VARIABLES, event)) throw new Error(`Configuracao invalida: messages.${event}`);
  return Object.freeze([...BASE_MESSAGE_VARIABLES, ...EVENT_MESSAGE_VARIABLES[event]]);
}

export const PRESCRIPTION_METHODS = ['biset', 'triset', 'superset', 'giantset', 'circuito', 'dropset', 'restpause', 'cluster', 'isometria', 'pico_contracao', 'pico_alongamento'] as const;
export const PRESCRIPTION_PHASES = ['base', 'acumulacao', 'intensificacao'] as const;
export const PRESCRIPTION_MAPPING_VALUES = {
  objective: ['forca', 'hipertrofia', 'emagrecimento', 'recomposicao', 'performance', 'saude'],
  daysPerWeek: ['2', '3', '4', '5', '6'],
  sessionDurationMinutes: ['15', '20', '30', '40', '45', '60', '75', '90', '120', '180'],
  equipment: ['academia completa', 'halteres', 'peso corporal', 'elasticos'],
} as const;
export interface PrescriptionWeekRule {
  week: number; phase: typeof PRESCRIPTION_PHASES[number]; rir_min: number; rir_max: number; volume_percent: number;
}
export interface PrescriptionAnswerMapping {
  source_key: string; answer: string; target: keyof typeof PRESCRIPTION_MAPPING_VALUES; value: string;
}
export const EXPIRED_WORKOUT_BEHAVIORS = ['keep_until_replaced', 'hide_on_expiry'] as const;
export type ExpiredWorkoutBehavior = typeof EXPIRED_WORKOUT_BEHAVIORS[number];

export interface CompanyProductSettings {
  messages: Record<MessageEvent, string>;
  message_sequences?: Partial<Record<WhatsAppEvent, MessagePart[]>>;
  contact_policy: {
    max_weekly_contacts: number; minimum_interval_hours: number; no_workout_days: number;
    no_workout_repeat_days: number; cart_abandonment_hours: number;
    payment_repeat_hours: number; weekdays: number[]; start_hour: number; end_hour: number; timezone: string;
  };
  brand: {
    company_name: string; professional_name: string; professional_registration: string;
    support_email: string; support_whatsapp: string; terms_url: string; privacy_url: string;
  };
  business: { assessment_sla_business_days: number; installments_short: number; installments_medium: number; installments_long: number };
  notifications: { daily_reminder_enabled: boolean; daily_reminder_hour: number; new_workout_enabled: boolean };
  experience: {
    cadence_warning_hours: number; cadence_critical_hours: number; risk_no_workout_days: number;
    renewal_notice_days: number; xp_workout: number; xp_external_activity: number;
    weekly_consistency_xp: number; gamification_enabled: boolean;
  };
  prescription: {
    expired_workout_behavior: ExpiredWorkoutBehavior;
    default_cadence: string; beginner_max_weekly_sets: number; first_week_volume_multiplier: number;
    endurance_strength_multiplier: number; preferred_split: 'auto' | 'full_body' | 'upper_lower' | 'push_pull_legs';
    methodology_notes: string; periodization_notes: string;
    weekly_rules: PrescriptionWeekRule[];
    allowed_methods: Array<typeof PRESCRIPTION_METHODS[number]>;
    progression_mode: 'wave' | 'maintain' | 'reps_only';
    answer_mappings: PrescriptionAnswerMapping[];
  };
}
export interface SettingsRecord { settings: CompanyProductSettings; version: number }

export const DEFAULT_COMPANY_PRODUCT_SETTINGS: CompanyProductSettings = {
  messages: {
    weekly_contact: 'Oi, {{primeiro_nome}}! Como estao os treinos? Conte com a equipe para continuar evoluindo.',
    pre_registration_confirmation: 'Oi, {{primeiro_nome}}! Recebemos seu pre-cadastro na {{empresa}}. Nossa equipe entrara em contato.',
    fiscal_invite: 'Oi, {{primeiro_nome}}! Complete seus dados fiscais e escolha seu plano: {{link}}',
    payment_link: 'Oi, {{primeiro_nome}}! Seu cadastro foi concluido. Escolha seu plano e faca o pagamento com seguranca: {{link}}',
    assessment_onboarding: 'Oi, {{primeiro_nome}}! Pagamento confirmado. A equipe vai enviar as instrucoes da avaliacao de movimento. Prazo: {{prazo}} dias uteis, com previsao ate {{data}}.',
    anamnesis_invite: 'Oi, {{primeiro_nome}}! Preencha sua anamnese para prepararmos seu treino: {{link}}',
    renewal_due: 'Oi, {{primeiro_nome}}! Seu plano esta proximo da renovacao. Vamos continuar? {{link}}',
    renewal_overdue: 'Oi, {{primeiro_nome}}! Sua renovacao esta pendente. Fale com a equipe: {{link}}',
    intercycle_invite: 'Oi, {{primeiro_nome}}! Responda ao questionario para o proximo ciclo: {{link}}',
    first_contact: 'Oi, {{primeiro_nome}}! Aqui e {{profissional}}, da {{empresa}}. Como posso ajudar?',
    daily_reminder_title: 'Seu treino de hoje te espera',
    daily_reminder_body: 'Bora manter a sequencia? Abra o app e registre seu treino.',
    new_workout_push_title: 'Novo treino disponivel',
    new_workout_push_body: '{{primeiro_nome}}, seu novo treino ja esta disponivel no app.',
  },
  contact_policy: { max_weekly_contacts: 2, minimum_interval_hours: 72, no_workout_days: 7, no_workout_repeat_days: 6, cart_abandonment_hours: 2, payment_repeat_hours: 24, weekdays: [1, 2, 3, 4, 5, 6, 7], start_hour: 8, end_hour: 20, timezone: 'America/Sao_Paulo' },
  brand: { company_name: '', professional_name: '', professional_registration: '', support_email: '', support_whatsapp: '', terms_url: '', privacy_url: '' },
  business: { assessment_sla_business_days: 5, installments_short: 1, installments_medium: 6, installments_long: 12 },
  notifications: { daily_reminder_enabled: true, daily_reminder_hour: 8, new_workout_enabled: true },
  experience: { cadence_warning_hours: 24, cadence_critical_hours: 72, risk_no_workout_days: 10, renewal_notice_days: 7, xp_workout: 50, xp_external_activity: 30, weekly_consistency_xp: 100, gamification_enabled: true },
  prescription: { expired_workout_behavior: 'keep_until_replaced', default_cadence: '2020', beginner_max_weekly_sets: 21, first_week_volume_multiplier: 0.8, endurance_strength_multiplier: 0.8, preferred_split: 'auto', methodology_notes: '', periodization_notes: '', weekly_rules: [], allowed_methods: [...PRESCRIPTION_METHODS], progression_mode: 'wave', answer_mappings: [] },
};

// Limits are mirrored in the SQL validator: extending this contract requires both validators.
const ranges: Record<string, [number, number, boolean?]> = {
  max_weekly_contacts: [1, 2], minimum_interval_hours: [72, 168], no_workout_days: [7, 90],
  no_workout_repeat_days: [6, 90], cart_abandonment_hours: [2, 720],
  payment_repeat_hours: [24, 720], start_hour: [0, 23], end_hour: [1, 24],
  assessment_sla_business_days: [1, 30], installments_short: [1, 12], installments_medium: [1, 12], installments_long: [1, 12],
  daily_reminder_hour: [0, 23], cadence_warning_hours: [1, 720], cadence_critical_hours: [1, 720],
  risk_no_workout_days: [1, 90], renewal_notice_days: [1, 90], xp_workout: [0, 10000], xp_external_activity: [0, 10000],
  weekly_consistency_xp: [0, 10000], beginner_max_weekly_sets: [1, 21],
  first_week_volume_multiplier: [0.5, 1, true], endurance_strength_multiplier: [0.5, 1, true],
};
const secretLike = /(?:\bBearer\s+\S+|\b(?:sk|sb_secret|service_role)[_-][A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:api[_ -]?key|secret|password|senha|token)\s*[:=]\s*\S+)/i;
function fail(path: string): never { throw new Error(`Configuracao invalida: ${path}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateMessageTemplate(value: string, event: MessageEvent): void {
  const variables = getMessageEventVariables(event);
  if (typeof value === 'string' && !value.trim()) fail(`messages.${event}.required`);
  if (typeof value !== 'string' || value.length > 6000 || secretLike.test(value)) fail('messages');
  const rest = value.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, variable: string) => {
    if (!(variables as readonly string[]).includes(variable)) fail(`messages.${event}.variable.${variable}`);
    return '';
  });
  if (/[{}]/.test(rest)) fail(`messages.${event}.variable`);
}

// Strict allowlists are also enforced by the forward SQL validator used by the save RPC.
export function validatePrescriptionMethodologyField(key: string, value: unknown): unknown {
  const path = `prescription.${key}`;
  if (key === 'progression_mode') {
    if (!['wave', 'maintain', 'reps_only'].includes(String(value)) || typeof value !== 'string') fail(path);
    return value;
  }
  if (!Array.isArray(value)) fail(path);
  if (key === 'allowed_methods') {
    if (value.length > PRESCRIPTION_METHODS.length || new Set(value).size !== value.length || value.some(v => !PRESCRIPTION_METHODS.includes(v))) fail(path);
  } else if (key === 'weekly_rules') {
    if (value.length > 6 || new Set(value.map(v => v?.week)).size !== value.length) fail(path);
    for (const rule of value) {
      if (!object(rule) || Object.keys(rule).sort().join(',') !== 'phase,rir_max,rir_min,volume_percent,week') fail(path);
      if (!Number.isInteger(rule.week) || Number(rule.week) < 1 || Number(rule.week) > 6 || !PRESCRIPTION_PHASES.includes(rule.phase as PrescriptionWeekRule['phase'])) fail(path);
      if (![rule.rir_min, rule.rir_max, rule.volume_percent].every(v => typeof v === 'number' && Number.isInteger(v))) fail(path);
      if (Number(rule.rir_min) < 2 || Number(rule.rir_max) > 5 || Number(rule.rir_min) > Number(rule.rir_max) || Number(rule.volume_percent) < 50 || Number(rule.volume_percent) > 105) fail(path);
    }
  } else if (key === 'answer_mappings') {
    if (value.length > 24) fail(path);
    const pairs = new Set<string>(); const sources = new Map<string, string>(); const targets = new Map<string, string>();
    for (const mapping of value) {
      if (!object(mapping) || Object.keys(mapping).sort().join(',') !== 'answer,source_key,target,value') fail(path);
      const { source_key, answer, target, value: canonical } = mapping;
      if (typeof source_key !== 'string' || !/^extra_[a-z0-9_]{1,50}$/.test(source_key) || typeof answer !== 'string' || !answer.trim() || answer.length > 100 || secretLike.test(answer)) fail(path);
      if (typeof target !== 'string' || !Object.hasOwn(PRESCRIPTION_MAPPING_VALUES, target) || typeof canonical !== 'string' || !(PRESCRIPTION_MAPPING_VALUES[target as keyof typeof PRESCRIPTION_MAPPING_VALUES] as readonly string[]).includes(canonical)) fail(path);
      const pair = JSON.stringify([source_key, answer]);
      if (pairs.has(pair) || (sources.has(source_key) && sources.get(source_key) !== target) || (targets.has(target) && targets.get(target) !== source_key)) fail(path);
      pairs.add(pair); sources.set(source_key, target); targets.set(target, source_key);
    }
  } else fail(path);
  return JSON.parse(JSON.stringify(value));
}

export function normalizeCompanyProductSettings(input: unknown = {}): CompanyProductSettings {
  if (!object(input)) fail('settings');
  const output = JSON.parse(JSON.stringify(DEFAULT_COMPANY_PRODUCT_SETTINGS)) as CompanyProductSettings;
  for (const section of Object.keys(input)) {
    if (section === 'message_sequences') { output.message_sequences = validateMessageSequences(input[section]); continue; }
    if (!Object.hasOwn(output, section) || !object(input[section])) fail(section);
    const target = output[section as keyof CompanyProductSettings] as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(input[section] as Record<string, unknown>)) {
      const path = `${section}.${key}`;
      if (!Object.hasOwn(target, key)) fail(path);
      if (section === 'prescription' && ['weekly_rules', 'allowed_methods', 'progression_mode', 'answer_mappings'].includes(key)) {
        target[key] = validatePrescriptionMethodologyField(key, value);
        continue;
      }
      if (key === 'weekdays') {
        if (!Array.isArray(value) || value.length < 1 || value.length > 7 || new Set(value).size !== value.length || value.some(d => !Number.isInteger(d) || d < 1 || d > 7)) fail(path);
        target[key] = [...value];
        continue;
      }
      if (typeof value !== typeof target[key]) fail(path);
      if (typeof value === 'number') {
        const [min, max, decimal] = ranges[key];
        if (!Number.isFinite(value) || value < min || value > max || (!decimal && !Number.isInteger(value))) fail(path);
      }
      if (typeof value === 'string') {
        if (value.length > 6000 || secretLike.test(value)) fail(path);
        if (section === 'messages') validateMessageTemplate(value, key as MessageEvent);
        else if (value.includes('{{') || value.includes('}}')) fail(path);
        if (key === 'timezone') {
          try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); } catch { fail(path); }
        }
        if (key === 'default_cadence' && !/^[0-9]{4}$/.test(value)) fail(path);
        if (key === 'expired_workout_behavior' && !(EXPIRED_WORKOUT_BEHAVIORS as readonly string[]).includes(value)) fail(path);
        if (key === 'preferred_split' && !['auto', 'full_body', 'upper_lower', 'push_pull_legs'].includes(value)) fail(path);
        if (key === 'support_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(path);
        if (key === 'support_whatsapp' && value && !/^\+?[0-9 ()-]{7,30}$/.test(value)) fail(path);
        if ((key === 'terms_url' || key === 'privacy_url') && value && !/^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/.test(value)) fail(path);
      }
      target[key] = value;
    }
  }
  if (output.contact_policy.start_hour >= output.contact_policy.end_hour) fail('contact_policy.end_hour');
  if (output.experience.cadence_warning_hours >= output.experience.cadence_critical_hours) fail('experience.cadence_critical_hours');
  return output;
}

export type SettingsQueryError = { code?: string; message?: string };
export interface SettingsReadClient {
  from(table: 'company_product_settings'): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: SettingsQueryError | null }>;
      };
    };
  };
}
export function parseSettingsRecord(data: unknown): SettingsRecord {
  if (!object(data) || !Number.isSafeInteger(data.version) || (data.version as number) < 0 || !object(data.settings)) fail('server envelope');
  const settings = normalizeCompanyProductSettings(data.settings);
  // This policy is projected into the app contract, never persisted in settings JSON.
  // Missing column in legacy envelopes retains continuity; a present invalid value fails closed.
  if (Object.hasOwn(data, 'expired_workout_behavior')) {
    const behavior = data.expired_workout_behavior;
    if (typeof behavior !== 'string' || !(EXPIRED_WORKOUT_BEHAVIORS as readonly string[]).includes(behavior)) fail('expired_workout_behavior');
    settings.prescription.expired_workout_behavior = behavior as ExpiredWorkoutBehavior;
  }
  return { settings, version: data.version as number };
}
export async function readCompanyProductSettings(client: SettingsReadClient, companyId: string): Promise<SettingsRecord> {
  if (!companyId?.trim()) fail('company_id');
  const { data, error } = await client.from('company_product_settings').select('settings,version,expired_workout_behavior').eq('company_id', companyId).maybeSingle();
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  if (error || data === null) return { settings: normalizeCompanyProductSettings({}), version: 0 };
  return parseSettingsRecord(data);
}
export async function getCompanyProductSettings(client: SettingsReadClient, companyId: string): Promise<CompanyProductSettings> {
  return (await readCompanyProductSettings(client, companyId)).settings;
}
