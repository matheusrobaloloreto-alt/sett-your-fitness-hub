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

export function isBrazilianCountry(value: unknown): boolean {
  const code = normalizeCountryCode(value);
  return !code || code === "BR";
}

export function normalizeFiscalDocument(value: unknown, countryCode: unknown): string {
  const raw = text(value);
  return isBrazilianCountry(countryCode)
    ? digits(raw)
    : raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Espelho frontend do contrato fiscal aplicado pela Edge de cadastro público.
 * Mantém CPF/CEP e endereço brasileiro obrigatórios apenas para residentes BR.
 */
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

  return [...new Set(missing)];
}

/** Payer data is separate from the student's residence and contact identity. */
export interface BillingProfileInput {
  countryCode: string;
  name: string;
  email: string;
  documentType: string;
  documentNumber: string;
  postalCode: string;
  phone: string;
  address: string;
  addressNumber: string;
  province: string;
  city: string;
  state: string;
}

export function billingProfileValidation(billing: BillingProfileInput): string[] {
  const missing: string[] = [];
  // Unlike legacy registration, a payer must explicitly select a country.
  const country = /^[A-Z]{2}$/.test(billing.countryCode) ? billing.countryCode : "";
  if (!country) missing.push("país do pagador (ISO, 2 letras)");
  if (!text(billing.name)) missing.push("nome do pagador");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(billing.email))) missing.push("e-mail válido");
  if (!text(billing.address)) missing.push("endereço");
  const phone = digits(billing.phone);
  if (country === "BR") {
    if (![11, 14].includes(digits(billing.documentNumber).length)) missing.push("CPF/CNPJ");
    if (digits(billing.postalCode).length !== 8) missing.push("CEP");
    if (!text(billing.addressNumber)) missing.push("número");
    if (!text(billing.province)) missing.push("bairro");
    const localPhone = phone.startsWith("55") && [12, 13].includes(phone.length) ? phone.slice(2) : phone;
    if (!(localPhone.length === 10 || (localPhone.length === 11 && localPhone[2] === "9"))) missing.push("telefone brasileiro");
  } else {
    if (!text(billing.documentType)) missing.push("tipo de documento");
    if (!normalizeFiscalDocument(billing.documentNumber, country)) missing.push("documento do pagador");
    if (!text(billing.city)) missing.push("cidade");
    // Postal codes and administrative regions do not exist in every country.
    if (!/^\+[1-9]\d{7,14}$/.test(text(billing.phone))) missing.push("telefone internacional com + e código do país");
  }
  return missing;
}

export function billingProfilePayload(billing: BillingProfileInput) {
  return {
    countryCode: billing.countryCode,
    name: text(billing.name),
    email: text(billing.email),
    documentType: billing.countryCode === "BR" ? "CPF_CNPJ" : text(billing.documentType),
    documentNumber: normalizeFiscalDocument(billing.documentNumber, billing.countryCode),
    postalCode: billing.countryCode === "BR" ? digits(billing.postalCode) : text(billing.postalCode),
    phone: billing.countryCode === "BR" ? digits(billing.phone) : text(billing.phone),
    address: text(billing.address),
    addressNumber: text(billing.addressNumber),
    province: text(billing.province),
    city: text(billing.city),
    state: text(billing.state),
  };
}

export const INTERNATIONAL_PAYMENT_UNAVAILABLE = "O provedor não disponibilizou o pagamento para estes dados de cobrança. Nenhum pagamento foi confirmado. Seus dados internacionais não precisam ser substituídos por CPF ou endereço brasileiro.";

export function paymentFailureMessage(error: unknown): string {
  const failure = error as { code?: string; message?: string } | null;
  if (["INTERNATIONAL_PAYER_UNSUPPORTED", "INTERNATIONAL_CARD_UNAVAILABLE", "PROVIDER_CAPABILITY_UNAVAILABLE", "FOREIGN_PAYERS_NOT_ENABLED"].includes(failure?.code || "")) {
    return INTERNATIONAL_PAYMENT_UNAVAILABLE;
  }
  return failure?.message || "Não foi possível continuar o pagamento. Tente novamente mais tarde.";
}

/** A generic invoice must never imply that foreign Pix/boleto or installments work. */
export function internationalCheckoutUrl(data: Record<string, unknown>): string | null {
  // This response is accepted only from create-foreign-card-payment, which
  // enforces CREDIT_CARD / BRL / one installment on the server.
  if (data.billingType !== undefined && data.billingType !== "CREDIT_CARD") return null;
  if (data.currency !== undefined && data.currency !== "BRL") return null;
  if (data.installmentCount !== undefined && data.installmentCount !== 1) return null;
  try {
    const url = new URL(String(data.invoiceUrl || ""));
    if (url.protocol !== "https:" || url.username || url.password
      || !(url.hostname === "asaas.com" || url.hostname.endsWith(".asaas.com"))) return null;
    return url.href;
  } catch {
    return null;
  }
}
