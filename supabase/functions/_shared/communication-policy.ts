import { DEFAULT_COMPANY_PRODUCT_SETTINGS, type CompanyProductSettings, type MessagePart, type WhatsAppEvent } from "./company-product-settings.ts";
export const COMPANY_MESSAGE_VARIABLES = ['nome', 'primeiro_nome', 'empresa', 'link', 'prazo', 'profissional', 'email', 'data'] as const;

/** A single pass prevents a supplied value from becoming another template. */
export function renderCompanyMessage(template: string, values: Record<string, string>): string {
  const tokens = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}|\{\s*([a-zA-Z_][\w-]*)\s*\}/g;
  const remainder = template.replace(tokens, '');
  if (/[{}]/.test(remainder)) throw new Error('message_template_malformed');
  return template.replace(tokens, (_, double: string, single: string) => {
    const key = double || single;
    if (!Object.hasOwn(values, key) || values[key] == null) throw new Error(`message_variable_missing:${key}`);
    return String(values[key]);
  });
}

export function messageValues(context: Record<string, unknown>, companyName = ''): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[key] = String(value);
  }
  values.nome = values.nome || values.name || values.student_name || '';
  values.primeiro_nome = values.primeiro_nome || values.nome.trim().split(/\s+/)[0] || 'atleta';
  values.empresa = companyName || values.empresa || 'sua equipe';
  return values;
}

export function eventMessage(messages: Record<string, string>, event: string, values: Record<string, string>, fallback: string): string {
  return renderCompanyMessage(eventTemplate(event, messages[event], fallback), values);
}

function eventTemplate(event: string, configured: string | undefined, fallback: string): string {
  return configured?.trim() && !isLegacyAssessmentTemplate(event, configured) ? configured : fallback;
}

function isLegacyAssessmentTemplate(event: string, configured: string): boolean {
  return event === "assessment_onboarding"
    && configured.trim() === DEFAULT_COMPANY_PRODUCT_SETTINGS.messages.assessment_onboarding;
}

export function weeklyFlowMessage(messages: Record<string, string>, _defaultTemplate: string, node: Record<string, unknown>, values: Record<string, string>, fallback: string): string {
  const configured = messages.weekly_contact;
  const useCentral = node.use_company_template === 'weekly_contact';
  return renderCompanyMessage(useCentral && configured?.trim() ? configured : (String(node.message || '') || fallback), values);
}

export function reminderSlot(now: Date, enabled: boolean, hour: number, timezone: string): string | null {
  if (!enabled) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return Number(part('hour')) === hour ? `${part('year')}-${part('month')}-${part('day')}` : null;
}

/** Ordered, detached and rendered once before durable snapshot creation. */
export function eventMessageSequence(settings: CompanyProductSettings, event: WhatsAppEvent, values: Record<string, string>, fallback: string): MessagePart[] {
  const configured = settings.message_sequences?.[event];
  return configured ? configured.map(part => ({
    ...structuredClone(part),
    text: renderCompanyMessage(isLegacyAssessmentTemplate(event, part.text) ? fallback : part.text, values),
  }))
    : [{ id: 'legacy', type: 'text', text: eventMessage(settings.messages, event, values, fallback) }];
}
