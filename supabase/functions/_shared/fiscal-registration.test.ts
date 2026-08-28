import { assertEquals } from "jsr:@std/assert@1";
import { countryAwareFiscalFields, fiscalRegistrationValidation, normalizeCountryCode, normalizeFiscalDocument, supportsAsaasBilling } from "./fiscal-registration.ts";

Deno.test("cadastro brasileiro continua exigindo CPF, CEP e endereço completo", () => {
  const missing = fiscalRegistrationValidation({
    country_code: "BR",
    email: "aluna@example.com",
    whatsapp: "5511999999999",
    address: "Rua A",
    city: "São Paulo",
    state: "SP",
  });
  assertEquals(missing.includes("CPF/CNPJ"), true);
  assertEquals(missing.includes("CEP"), true);
  assertEquals(missing.includes("número"), true);
  assertEquals(missing.includes("bairro"), true);
});

Deno.test("cadastro estrangeiro aceita E.164 e não exige documentos brasileiros", () => {
  assertEquals(fiscalRegistrationValidation({
    country_code: "PT",
    email: "athlete@example.pt",
    whatsapp: "+351912345678",
    address: "Rua do Porto 10",
    city: "Porto",
    state: "Porto",
  }), []);
});

Deno.test("normaliza código de país e falha fechado para valor inválido", () => {
  assertEquals(normalizeCountryCode("pt"), "PT");
  assertEquals(normalizeCountryCode("Portugal"), "");
});

Deno.test("bloqueia telefone brasileiro com formato de celular impossível", () => {
  const missing = fiscalRegistrationValidation({
    country_code: "BR",
    email: "aluna@example.com",
    whatsapp: "+5561452400383",
    cpf: "12345678901",
    cep: "88000000",
    address: "Rua A",
    address_number: "1",
    neighborhood: "Centro",
    city: "Florianópolis",
    state: "SC",
  });
  assertEquals(missing.includes("WhatsApp brasileiro válido"), true);
});

Deno.test("preserva documento e código postal alfanuméricos de estrangeiro", () => {
  assertEquals(countryAwareFiscalFields({
    country_code: "GB",
    cpf: "AB-123-XY",
    cep: "SW1A 1AA",
    state: "Greater London",
  }), {
    country_code: "GB",
    cpf: "AB-123-XY",
    cep: "SW1A 1AA",
    state: "Greater London",
  });
});

Deno.test("mantém normalização brasileira em dígitos e UF maiúscula", () => {
  assertEquals(countryAwareFiscalFields({
    country_code: "BR",
    cpf: "123.456.789-01",
    cep: "88000-000",
    state: "sc",
  }), {
    country_code: "BR",
    cpf: "12345678901",
    cep: "88000000",
    state: "SC",
  });
});

Deno.test("checkout Asaas permanece explicitamente restrito ao Brasil", () => {
  assertEquals(supportsAsaasBilling("BR"), true);
  assertEquals(supportsAsaasBilling("PT"), false);
  assertEquals(supportsAsaasBilling("GB"), false);
});

Deno.test("deduplicação preserva identidade alfanumérica estrangeira", () => {
  assertEquals(normalizeFiscalDocument("ab-123 xy", "GB"), "AB123XY");
  assertEquals(normalizeFiscalDocument("123.456.789-01", "BR"), "12345678901");
});
