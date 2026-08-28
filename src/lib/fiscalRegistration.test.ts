import { describe, expect, it } from "vitest";
import { fiscalRegistrationValidation, isBrazilianCountry, normalizeCountryCode, normalizeFiscalDocument } from "./fiscalRegistration";

describe("fiscal registration by country", () => {
  it("keeps Brazilian fiscal requirements", () => {
    const issues = fiscalRegistrationValidation({
      country_code: "BR",
      email: "aluna@example.com",
      whatsapp: "11999990000",
      address: "Rua A",
      city: "São Paulo",
      state: "SP",
    });

    expect(issues).toEqual(expect.arrayContaining(["CPF/CNPJ", "CEP", "número", "bairro"]));
  });

  it("does not require Brazilian CPF or CEP from a foreign student", () => {
    expect(fiscalRegistrationValidation({
      country_code: "PT",
      email: "aluna@example.com",
      whatsapp: "+351912345678",
      address: "Rua do Porto",
      city: "Porto",
      state: "Porto",
    })).toEqual([]);
  });

  it("rejects an invalid country code without silently treating it as Brazil", () => {
    expect(normalizeCountryCode("portugal")).toBe("");
    expect(isBrazilianCountry("PT")).toBe(false);
    expect(fiscalRegistrationValidation({
      country_code: "portugal",
      email: "aluna@example.com",
      whatsapp: "+351912345678",
      address: "Rua do Porto",
      city: "Porto",
      state: "Porto",
    })).toContain("país");
  });

  it("normalizes foreign alphanumeric documents without losing letters", () => {
    expect(normalizeFiscalDocument("ab-123 xy", "GB")).toBe("AB123XY");
    expect(normalizeFiscalDocument("123.456.789-01", "BR")).toBe("12345678901");
  });
});
