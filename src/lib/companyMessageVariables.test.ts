import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  DEFAULT_COMPANY_PRODUCT_SETTINGS, MESSAGE_EVENTS, TEMPLATE_VARIABLES,
  getMessageEventVariables, normalizeCompanyProductSettings, validateMessageTemplate,
} from './companyProductSettings';

const base = ['primeiro_nome', 'nome', 'empresa'];
const additional = {
  weekly_contact: [], pre_registration_confirmation: [], fiscal_invite: ['link'], payment_link: ['link'],
  assessment_onboarding: ['prazo', 'data'], anamnesis_invite: ['link'], renewal_due: ['link'],
  renewal_overdue: ['link'], intercycle_invite: ['link'], first_contact: ['profissional'],
  daily_reminder_title: ['link', 'data'], daily_reminder_body: ['link', 'data'],
  new_workout_push_title: [], new_workout_push_body: [],
};

for (const event of MESSAGE_EVENTS) {
  it.each(['', ' \n\t '])(`${event}: rejects blank template %j`, template => {
    expect(() => normalizeCompanyProductSettings({ messages: { [event]: template } })).toThrow(`messages.${event}.required`);
  });
  for (const variable of TEMPLATE_VARIABLES) {
    it(`${event}: ${variable} is ${[...base, ...additional[event]].includes(variable) ? 'supported' : 'rejected before save'}`, () => {
      const allowed = [...base, ...additional[event]];
      expect(getMessageEventVariables(event)).toEqual(allowed);
      const template = `Oi {{ ${variable} }}`;
      const normalize = () => normalizeCompanyProductSettings({ messages: { [event]: template } });
      if (allowed.includes(variable)) {
        expect(() => validateMessageTemplate(template, event)).not.toThrow();
        expect(normalize().messages[event]).toBe(template);
      } else {
        expect(normalize).toThrow(`messages.${event}.variable.${variable}`);
        expect(() => validateMessageTemplate(template, event)).toThrow(`messages.${event}.variable.${variable}`);
      }
    });
  }
}

it('preserves all defaults and rejects malformed or unknown event tokens', () => {
  expect(normalizeCompanyProductSettings(DEFAULT_COMPANY_PRODUCT_SETTINGS)).toEqual(DEFAULT_COMPANY_PRODUCT_SETTINGS);
  expect(() => validateMessageTemplate('{{unknown}}', 'weekly_contact')).toThrow('messages.weekly_contact.variable.unknown');
  expect(() => validateMessageTemplate('{{nome}', 'weekly_contact')).toThrow('messages.weekly_contact.variable');
});

it('mirrors the complete SQL matrix, not the global variable vocabulary', () => {
  const sql = readFileSync('supabase/migrations/20261026092601_company_product_settings.sql', 'utf8');
  const matrix = JSON.parse(sql.match(/v_message_variables jsonb := '([^']+)'::jsonb/)?.[1] ?? '{}');
  expect(Object.keys(matrix).sort()).toEqual([...MESSAGE_EVENTS].sort());
  for (const event of MESSAGE_EVENTS) expect(matrix[event]).toEqual(getMessageEventVariables(event));
  expect(sql).toContain("(v_message_variables -> v_key) ? v_match[1]");
});
