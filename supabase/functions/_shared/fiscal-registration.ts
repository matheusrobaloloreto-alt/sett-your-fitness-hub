function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeCountryCode(value: unknown): string {
  const code = text(value || "BR").toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

export function countryAwareFiscalFields(student: Record<string, unknown>) {
  const countryCode = normalizeCountryCode(student.country_code);
  const isBrazil = !countryCode || countryCode === "BR";
  return {
    country_code: countryCode,
    cpf: isBrazil ? digits(student.cpf) : text(student.cpf),
    cep: isBrazil ? digits(student.cep) : text(student.cep),
    state: isBrazil ? text(student.state).toUpperCase() : text(student.state),
  };
}

export function supportsAsaasBilling(value: unknown): boolean {
  return String(value || "").trim().toUpperCase() === "BR";
}

export function effectiveBillingCountryCode(student: Record<string, unknown>): string {
  const explicitBillingCountry = String(student.billing_country_code || "").trim().toUpperCase();
  if (explicitBillingCountry) return /^[A-Z]{2}$/.test(explicitBillingCountry) ? explicitBillingCountry : "";
  return normalizeCountryCode(student.country_code);
}

export function normalizeFiscalDocument(value: unknown, countryCode: unknown): string {
  const raw = text(value);
  return normalizeCountryCode(countryCode) === "BR"
    ? digits(raw)
    : raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function fiscalRegistrationValidation(student: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const countryCode = normalizeCountryCode(student.country_code);
  const phone = digits(student.whatsapp || student.phone);
  const email = text(student.email).toLowerCase();
  const isBrazil = !countryCode || countryCode === "BR";

  if (!email || !email.includes("@")) missing.push("e-mail válido");
  if (phone.length < 8 || phone.length > 15) missing.push("WhatsApp");
  if (!countryCode) missing.push("país");
  if (!text(student.address)) missing.push("endereço");
  if (!text(student.city)) missing.push("cidade");
  if (!text(student.state)) missing.push("estado/região");

  if (isBrazil) {
    const localPhone = phone.startsWith("55") && (phone.length === 12 || phone.length === 13)
      ? phone.slice(2)
      : phone;
    const validBrazilianPhone = localPhone.length === 10
      || (localPhone.length === 11 && localPhone[2] === "9");
    if (!validBrazilianPhone) missing.push("WhatsApp brasileiro válido");
    if (![11, 14].includes(digits(student.cpf).length)) missing.push("CPF/CNPJ");
    if (digits(student.cep).length !== 8) missing.push("CEP");
    if (!text(student.address_number)) missing.push("número");
    if (!text(student.neighborhood)) missing.push("bairro");
    if (text(student.state).length !== 2) missing.push("estado com 2 letras");
  }
  return missing;
}

// Separate from supportsAsaasBilling: automatic Brazilian NFS-e stays domestic-only.
export class ForeignBillingError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function foreignAsaasBillingProfile(
  student: Record<string, unknown>,
  capability: string | null | undefined,
  environment: string,
  request: Record<string, unknown> = {},
) {
  if (!["sandbox", "production"].includes(environment) || capability !== "true") {
    throw new ForeignBillingError(503, "FOREIGN_PAYERS_NOT_ENABLED",
      "Pagamento internacional indisponível neste ambiente. A conta Asaas precisa permitir pagadores estrangeiros e o servidor precisa habilitar essa capacidade neste ambiente.");
  }
  const country = effectiveBillingCountryCode(student);
  if (!country || country === "BR") {
    throw new ForeignBillingError(422, "FOREIGN_PAYER_REQUIRED", "Informe um país fiscal estrangeiro válido para este pagamento.");
  }
  if ((request.billingType !== undefined && request.billingType !== "CREDIT_CARD")
    || [request.installments, request.installmentCount].some(v => v !== undefined && v !== 1)
    || (request.currency !== undefined && request.currency !== "BRL")) {
    throw new ForeignBillingError(422, "FOREIGN_PAYMENT_METHOD_UNSUPPORTED",
      "Pagadores estrangeiros podem pagar somente com cartão internacional, à vista, em reais (BRL).");
  }
  if (["creditCard", "creditCardHolderInfo", "creditCardToken"].some(key => request[key] !== undefined)) {
    throw new ForeignBillingError(422, "FOREIGN_CARD_HOSTED_ONLY", "Informe os dados do cartão somente na página segura do Asaas.");
  }
  const sameCountry = normalizeCountryCode(student.country_code) === country;
  const name = text(student.billing_name) || (sameCountry ? text(student.full_name) : "");
  const email = text(student.billing_email) || (sameCountry ? text(student.email) : "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ForeignBillingError(422, "FOREIGN_PAYER_INCOMPLETE", "Preencha nome e e-mail válidos do pagador estrangeiro.");
  }
  // Only documented customer fields. Never coerce a foreign document, postal code,
  // address or phone into Brazilian fields. Cardholder data is collected by Asaas.
  return { name, email, foreignCustomer: true as const, notificationDisabled: true };
}
