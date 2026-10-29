import { describe, expect, it } from "vitest";
import { formatPhone, formatPhoneForCountry } from "./masks";

describe("phone mask", () => {
  it("preserves an international E.164 number pasted with leading whitespace", () => {
    expect(formatPhone("  +351 912 345 678")).toBe("+351912345678");
  });

  it("keeps the Brazilian visual mask for local numbers", () => {
    expect(formatPhone("48991432057")).toBe("(48) 99143-2057");
  });

  it("does not truncate a stored international number without plus", () => {
    expect(formatPhoneForCountry("351912345678", "PT")).toBe("351912345678");
  });

  it("preserves E.164 formatting for an international number", () => {
    expect(formatPhoneForCountry("+44 7700 900123", "GB")).toBe("+447700900123");
  });
});


describe('persisted Brazilian E.164 contact display', () => {
 it.each(['5511981234567', '11981234567', '(11) 98123-4567'])('preserves DDD and ninth digit for %s', input => {
  expect(formatPhoneForCountry(input, 'BR')).toBe('(11) 98123-4567');
 });
 it.each(['551131234567', '1131234567'])('preserves ten-digit national phone for %s', input => {
  expect(formatPhoneForCountry(input, 'BR')).toBe('(11) 3123-4567');
 });
 it.each(['+5511981234567', ' +55 (11) 98123-4567'])('keeps existing explicit E.164 input %s intact', input => {
  expect(formatPhoneForCountry(input, 'BR')).toBe('+5511981234567');
 });
 it('keeps an explicitly prefixed twelve-digit Brazilian phone intact', () => {
  expect(formatPhoneForCountry('+55 (11) 3123-4567', 'BR')).toBe('+551131234567');
 });
 it('does not remove a national DDD 55 as though it were an international prefix', () => {
  expect(formatPhoneForCountry('55981234567', 'BR')).toBe('(55) 98123-4567');
 });
 it('keeps BR as the legacy default for a full stored Brazilian phone', () => {
  expect(formatPhoneForCountry('5511981234567', null)).toBe('(11) 98123-4567');
 });
});
