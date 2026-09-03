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
  if (/^[A-Z]{2}$/.test(explicitBillingCountry)) return explicitBillingCountry;
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
