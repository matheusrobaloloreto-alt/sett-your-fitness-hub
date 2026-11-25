import { describe, expect, it } from "vitest";
import { COUNTRY_OPTIONS, ISO_COUNTRY_CODES, isCountryCode } from "./countries";

describe("named worldwide countries", () => {
  it("includes all 249 ISO assignments without duplicates or code-only labels", () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(249);
    expect(COUNTRY_OPTIONS).toHaveLength(249);
    for (const country of COUNTRY_OPTIONS) {
      expect(country.name).toBeTruthy();
      expect(country.name).not.toBe(country.code);
    }
  });
  it("displays Portuguese country names with stable internal values", () => {
    expect(COUNTRY_OPTIONS).toEqual(expect.arrayContaining([
      { code: "BR", name: "Brasil" }, { code: "GB", name: "Reino Unido" },
      { code: "JP", name: "Japão" }, { code: "US", name: "Estados Unidos" },
      { code: "ZA", name: "África do Sul" },
    ]));
  });
  it("rejects unassigned and malformed codes instead of accepting any two letters", () => {
    for (const code of ["ZZ", "XX", "XK", "UK", "EU", "gb", "United Kingdom", "", null]) expect(isCountryCode(code)).toBe(false);
    for (const code of ["BR", "GB", "JP", "ZA", "NZ", "AQ"]) expect(isCountryCode(code)).toBe(true);
  });
});
