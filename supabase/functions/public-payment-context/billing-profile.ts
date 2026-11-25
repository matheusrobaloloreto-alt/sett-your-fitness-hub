function field(value: unknown, label: string, max: number, required = true): string {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`Informe ${label}.`);
  if (text.length > max) throw new Error(`${label} excede o limite permitido.`);
  return text;
}

/** Foreign payer billing only: never writes the student's identity or contact. */
export function foreignBillingUpdate(billing: Record<string, unknown>) {
  const country = field(billing.countryCode, "país de cobrança", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || country === "BR") throw new Error("Informe um país estrangeiro com código ISO de 2 letras.");
  const email = field(billing.email, "e-mail do pagador", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  const phone = field(billing.phone, "telefone internacional", 16);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Informe telefone com + e código do país.");
  const documentType = field(billing.documentType, "tipo de documento", 20);
  if (!["TAX_ID", "PASSPORT", "NATIONAL_ID"].includes(documentType)) throw new Error("Tipo de documento inválido.");
  const document = field(billing.documentNumber, "documento do pagador", 80).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!document) throw new Error("Informe o documento do pagador.");
  return {
    billing_country_code: country,
    billing_name: field(billing.name, "nome do pagador", 160),
    billing_email: email,
    billing_document_type: documentType,
    billing_document_number: document,
    billing_cpf_cnpj: null,
    billing_postal_code: field(billing.postalCode, "código postal", 40, false) || null,
    billing_address: field(billing.address, "endereço", 240),
    billing_address_number: field(billing.addressNumber, "número", 40, false) || null,
    billing_neighborhood: field(billing.province, "bairro", 160, false) || null,
    billing_city: field(billing.city, "cidade", 160),
    billing_state: field(billing.state, "estado/região", 160, false) || null,
    billing_phone: phone,
  };
}
