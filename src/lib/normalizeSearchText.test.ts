import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from './normalizeSearchText';
describe('normalizeSearchText', () => {
  it('normalizes accents, case and surrounding whitespace', () => {
    expect(normalizeSearchText('  JOÃO Conceição  ')).toBe('joao conceicao');
    expect(normalizeSearchText('Jo\u0303ao')).toBe('joao');
    expect(normalizeSearchText('mária')).toBe(normalizeSearchText('maria'));
    expect(normalizeSearchText('Taís')).toBe(normalizeSearchText('Tais'));
  });
  it('accepts missing optional fields', () => {
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
  });
});
