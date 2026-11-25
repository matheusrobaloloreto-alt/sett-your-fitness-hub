import { foreignBillingUpdate } from "./billing-profile.ts";
const billing = { countryCode: "GB", name: "Synthetic payer", email: "payer@example.com", documentType: "PASSPORT", documentNumber: "AB-1234", phone: "+442079460000", address: "Example Street", city: "London" };
function assert(condition: boolean) { if (!condition) throw new Error("Assertion failed"); }
Deno.test("foreign payer storage is global, preserves postal letters and never writes student contact", () => {
  for (const countryCode of ["GB", "JP", "US", "AE", "ZA", "SG"]) {
    const result = foreignBillingUpdate({ ...billing, countryCode, postalCode: "SW1A 1AA" });
    assert(result.billing_country_code === countryCode);
    assert(result.billing_document_number === "AB1234");
    assert(result.billing_postal_code === "SW1A 1AA");
    assert(result.billing_state === null && result.billing_address_number === null);
    assert(!["country_code", "cpf", "whatsapp", "phone", "email", "full_name"].some(key => key in result));
  }
});
Deno.test("foreign payer rejects domestic country, bad documents and unqualified phone", () => {
  for (const invalid of [{ countryCode: "BR" }, { countryCode: "portugal" }, { documentType: "OTHER" }, { documentNumber: "---" }, { phone: "442079460000" }, { email: "invalid" }]) {
    let rejected = false;
    try { foreignBillingUpdate({ ...billing, ...invalid }); } catch { rejected = true; }
    assert(rejected);
  }
});
