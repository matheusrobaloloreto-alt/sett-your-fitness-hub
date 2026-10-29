import { describe, expect, it } from "vitest";
import { normalizeCompanyCommercialSettings, renderPreRegistrationInvite, commercialStageKeys } from "../../supabase/functions/_shared/company-commercial-settings";
import { FUNNEL_STAGE_ORDER } from "./salesFunnelView";
describe("bounded commercial policy", () => {
  it("preserves canonical stage IDs and allows labels only", () => {
    expect([...commercialStageKeys]).toEqual(FUNNEL_STAGE_ORDER);
    expect(normalizeCompanyCommercialSettings({ funnel_labels: { payment_pending:"Confirmar pagamento" } }).funnel_labels.payment_pending).toBe("Confirmar pagamento");
    expect(() => normalizeCompanyCommercialSettings({ funnel_labels: { bypass_payment:"Liberado" } })).toThrow();
  });
  it("renders the actual invitation with a mandatory link and company identity", () => {
    const settings = normalizeCompanyCommercialSettings({ pre_registration_invite:"Conheça {{empresa}}: {{link}}" });
    expect(renderPreRegistrationInvite(settings,"Studio Synthetic","https://example.org/apply")).toBe("Conheça Studio Synthetic: https://example.org/apply");
    expect(() => normalizeCompanyCommercialSettings({ pre_registration_invite:"Link removido" })).toThrow();
    expect(() => normalizeCompanyCommercialSettings({ pre_registration_invite:"{{senha}} {{link}}" })).toThrow();
    expect(() => normalizeCompanyCommercialSettings({ pre_registration_invite:"{empresa} {{link}}" })).toThrow();
    expect(() => normalizeCompanyCommercialSettings({ pre_registration_invite:"{{empresa}} {{link}} }" })).toThrow();
  });
  it("only accepts bounded plaintext CMS documents and influencer policy", () => {
    const page = { title:"Documento fornecido", sections:[{heading:"Seção",body:"Texto fornecido pela empresa."}] };
    expect(normalizeCompanyCommercialSettings({pages:{termos:page}}).pages.termos).toEqual(page);
    expect(() => normalizeCompanyCommercialSettings({pages:{termos:{...page,sections:[{heading:"",body:"<script>alert(1)</script>"}]}}})).toThrow();
    expect(() => normalizeCompanyCommercialSettings({influencer:{max_active_students:-1}})).toThrow();
    expect(() => normalizeCompanyCommercialSettings({influencer:{requiresPayment:false}})).toThrow();
  });
});
