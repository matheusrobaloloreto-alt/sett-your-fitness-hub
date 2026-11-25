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

import { billingProfileValidation, billingProfilePayload, internationalCheckoutUrl, paymentFailureMessage, INTERNATIONAL_PAYMENT_UNAVAILABLE } from "./fiscalRegistration";

const payer = {
  countryCode: "GB", name: "Synthetic payer", email: "payer@example.com",
  documentType: "PASSPORT", documentNumber: "AB-12 34", postalCode: "SW1A 1AA",
  phone: "+442079460000", address: "1 Example Street", addressNumber: "", province: "",
  city: "London", state: "",
};

describe("international payer billing", () => {
  it.each(["GB", "US", "JP", "PT", "ZA", "AE", "NZ", "SG"])("supports %s without Brazilian fields", countryCode => {
    expect(billingProfileValidation({ ...payer, countryCode, postalCode: "" })).toEqual([]);
  });
  it("requires an explicit country, document and international phone", () => {
    expect(billingProfileValidation({ ...payer, countryCode: "", documentNumber: "", phone: "2079460000" })).toEqual(expect.arrayContaining([
      "país do pagador (ISO, 2 letras)", "documento do pagador", "telefone internacional com + e código do país",
    ]));
  });
  it("keeps foreign letters, postal codes and E.164 without adding Brazilian defaults", () => {
    expect(billingProfilePayload(payer)).toMatchObject({
      documentNumber: "AB1234", postalCode: "SW1A 1AA", phone: "+442079460000", countryCode: "GB",
    });
    expect(billingProfilePayload(payer)).not.toHaveProperty("cpfCnpj");
  });
  it("requires Brazilian fields and preserves all 14 CNPJ digits", () => {
    expect(billingProfileValidation({ ...payer, countryCode: "BR" })).toEqual(expect.arrayContaining(["CPF/CNPJ", "CEP", "número", "bairro", "telefone brasileiro"]));
    expect(billingProfilePayload({ ...payer, countryCode: "BR", documentNumber: "12.345.678/0001-90" }).documentNumber).toBe("12345678000190");
  });
  it("accepts only HTTPS Asaas invoice URLs from the dedicated foreign-card endpoint", () => {
    expect(internationalCheckoutUrl({ invoiceUrl: "https://sandbox.asaas.com/i/fixture" })).toBe("https://sandbox.asaas.com/i/fixture");
    for (const invoiceUrl of ["javascript:alert(1)", "https://asaas.com.evil.test/i/a", "https://evil.test/i/a", "http://asaas.com/i/a", "https://user:pass@asaas.com/i/a", ""]) {
      expect(internationalCheckoutUrl({ invoiceUrl })).toBeNull();
    }
    for (const invalid of [{ billingType: "PIX" }, { billingType: "BOLETO" }, { currency: "USD" }, { installmentCount: 2 }]) {
      expect(internationalCheckoutUrl({ invoiceUrl: "https://sandbox.asaas.com/i/fixture", ...invalid })).toBeNull();
    }
  });
  it("explains provider capability errors without inventing an accepted payment", () => {
    expect(paymentFailureMessage({ code: "FOREIGN_PAYERS_NOT_ENABLED", message: "provider internals" })).toBe(INTERNATIONAL_PAYMENT_UNAVAILABLE);
  });
});
