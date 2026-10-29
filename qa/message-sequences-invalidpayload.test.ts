import { describe, expect, it } from 'vitest';
import {
  MESSAGE_EVENTS, WHATSAPP_EVENTS, normalizeCompanyProductSettings, validateMessageSequences,
} from '../supabase/functions/_shared/company-product-settings';
import { eventMessageSequence } from '../supabase/functions/_shared/communication-policy';
import { displayMessageSequence, editMessageSequence } from '../src/lib/companyMessageSequences';

const path = '11111111-1111-1111-1111-111111111111/message-settings/22222222-2222-2222-2222-222222222222.png';
const text = () => ({ id: 'first', type: 'text', text: 'Oi, {{primeiro_nome}}' });
const image = () => ({ id: 'photo', type: 'image', text: '', media: {
  bucket: 'whatsapp-media', path, mimeType: 'image/png', fileName: 'foto.png',
} });
const invalid: Array<[string, unknown]> = [
  ['null envelope', null], ['array envelope', []], ['unknown event', { other: [text()] }],
  ['null event', { weekly_contact: null }], ['empty parts', { weekly_contact: [] }],
  ['eleven parts', { weekly_contact: Array.from({ length: 11 }, (_, i) => ({ ...text(), id: `p${i}` })) }],
  ['duplicate id', { weekly_contact: [text(), text()] }],
  ...[
    ['missing id', { type: 'text', text: 'Oi' }], ['empty id', { ...text(), id: '' }],
    ['long id', { ...text(), id: 'a'.repeat(81) }], ['path id', { ...text(), id: '../x' }],
    ['nonstring id', { ...text(), id: 12 }], ['unknown type', { ...text(), type: 'document' }],
    ['array media type', { ...image(), type: ['image'] }],
    ['null type', { ...text(), type: null }], ['nonstring text', { ...text(), text: 1 }],
    ['missing text', { id: 'x', type: 'image', media: image().media }],
    ['whitespace text', { ...text(), text: '   ' }], ['oversize text', { ...text(), text: 'x'.repeat(6001) }],
    ['extra field', { ...text(), unexpected: true }], ['text media null', { ...text(), media: null }],
    ['text media object', { ...text(), media: image().media }], ['missing media', { id: 'x', type: 'image', text: '' }],
    ['caption disallowed variable', { ...image(), text: '{{link}}' }],
    ['caption malformed variable', { ...image(), text: '{{nome}' }],
    ['caption secret', { ...image(), text: 'token=synthetic-only-token' }],
    ['caption oversize whitespace', { ...image(), text: ' '.repeat(6001) }],
    ...[
      ['foreign bucket', { bucket: 'evaluations' }], ['url path', { path: 'https://example.invalid/image.png' }],
      ['traversal path', { path: path.replace('message-settings/', 'message-settings/../') }],
      ['encoded traversal', { path: path.replace('message-settings/', 'message-settings/%2e%2e/') }],
      ['signed query', { path: `${path}?token=synthetic` }], ['wrong mime', { mimeType: 'audio/mpeg' }],
      ['empty filename', { fileName: '' }], ['slash filename', { fileName: '../foto.png' }],
      ['backslash filename', { fileName: 'x\\foto.png' }], ['control filename', { fileName: 'x\u0000.png' }],
      ['oversize filename', { fileName: 'a'.repeat(181) }], ['extra media key', { size: 1 }],
      ['nonstring path', { path: 12 }],
    ].map(([label, patch]) => [label, { ...image(), media: { ...image().media, ...(patch as object) } }]),
  ].map(([label, part]) => [String(label), { weekly_contact: [part] }] as [string, unknown]),
];

describe('independent JSON payload rejection', () => {
  it.each(invalid)('rejects %s without mutation', (_label, payload) => {
    const before = JSON.stringify(payload);
    expect(() => validateMessageSequences(payload)).toThrow();
    expect(JSON.stringify(payload)).toBe(before);
  });
  it.each(MESSAGE_EVENTS.filter(event => !WHATSAPP_EVENTS.includes(event as never)))('rejects push event %s', event => {
    expect(() => validateMessageSequences({ [event]: [text()] })).toThrow();
  });
  it.each(WHATSAPP_EVENTS)('accepts ten ordered parts for %s and detaches result', event => {
    const input = { [event]: Array.from({ length: 10 }, (_, i) => ({ ...text(), id: `p${i}` })) };
    const output = validateMessageSequences(input);
    expect(output[event]?.map(part => part.id)).toEqual(input[event].map(part => part.id));
    output[event]![0].text = 'Changed';
    expect(input[event][0].text).toBe('Oi, {{primeiro_nome}}');
  });
  it('accepts caption-free image and renders detached ordered media', () => {
    const settings = normalizeCompanyProductSettings({ message_sequences: { weekly_contact: [text(), image()] } });
    const rendered = eventMessageSequence(settings, 'weekly_contact', { primeiro_nome: '{{nome}}' }, 'fallback');
    expect(rendered.map(part => [part.type, part.text])).toEqual([['text', 'Oi, {{nome}}'], ['image', '']]);
    rendered[1].media!.path = 'changed';
    expect(settings.message_sequences!.weekly_contact![1].media!.path).toBe(path);
  });
  it('keeps absent optional section absent and keeps four push strings', () => {
    const legacy = normalizeCompanyProductSettings({});
    expect(Object.hasOwn(legacy, 'message_sequences')).toBe(false);
    for (const event of MESSAGE_EVENTS.filter(event => !WHATSAPP_EVENTS.includes(event as never))) {
      expect(typeof legacy.messages[event]).toBe('string');
    }
    const withSequence = normalizeCompanyProductSettings({ ...legacy, message_sequences: { weekly_contact: [image()] } });
    expect(withSequence.messages).toEqual(legacy.messages);
  });
  it('does not migrate settings merely by displaying legacy copy', () => {
    const settings = normalizeCompanyProductSettings({});
    const before = JSON.stringify(settings);
    expect(displayMessageSequence(settings, 'weekly_contact')[0].text).toBe(settings.messages.weekly_contact);
    expect(JSON.stringify(settings)).toBe(before);
  });
  it('keeps legacy messages intact when editing an explicit sequence', () => {
    const settings = normalizeCompanyProductSettings({});
    const before = structuredClone(settings.messages);
    const edited = editMessageSequence(settings, 'weekly_contact', [{ id: 'edited', type: 'text', text: 'Nova sequência' }]);
    expect(settings.messages).toEqual(before);
    expect(edited.messages).toEqual(before);
    expect(edited.message_sequences?.weekly_contact?.[0].text).toBe('Nova sequência');
  });
});
