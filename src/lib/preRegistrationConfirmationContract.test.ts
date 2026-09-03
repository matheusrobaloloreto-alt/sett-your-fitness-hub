import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uiSource = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
const fiscalUiSource = readFileSync("src/pages/PublicRegistration.tsx", "utf8");
const routesSource = readFileSync("src/App.tsx", "utf8");
const edgeSource = readFileSync("supabase/functions/public-registration/index.ts", "utf8");

describe("pre-registration WhatsApp confirmation", () => {
  it("requires an explicit visual confirmation before submitting", () => {
    expect(uiSource).toContain("CONFIRME SEU WHATSAPP");
    expect(uiSource).toContain("Esse é o número certo — confirmar e enviar");
    expect(uiSource).toContain("{whatsapp}");
    expect(uiSource).toContain("handleSubmit(true)");
    expect(uiSource).toContain("whatsappConfirmed: true");
  });

  it("keeps the fiscal page out of the pre-registration submission path", () => {
    expect(routesSource).toContain('<Route path="/cadastro/:slug" element={<RouteTransition><PublicAnamnesis mode="pre-registration" />');
    expect(routesSource).toContain('<Route path="/cadastro-fiscal/:token" element={<RouteTransition><PublicRegistration />');
    expect(fiscalUiSource).toContain("if (!token)");
    expect(fiscalUiSource).toContain('return <Navigate to={slug ? `/cadastro/${encodeURIComponent(slug)}` : "/cadastro"} replace />');
  });

  it("ends with a short status that reports whether WhatsApp confirmation was sent", () => {
    expect(uiSource).toContain("A confirmação foi enviada para o WhatsApp que você confirmou.");
    expect(uiSource).toContain("confirmationMessageSent");
    expect(uiSource).not.toContain("Recebemos muitos interessados em treinar com a gente");
  });

  it("sends the final acknowledgement only after the confirmed submission", () => {
    const start = edgeSource.indexOf("async function preRegister");
    const end = edgeSource.indexOf("async function loadLeadForStaff", start);
    const handler = edgeSource.slice(start, end);
    expect(handler).toContain("whatsappConfirmed");
    expect(handler).toContain("sendPreRegistrationConfirmation");
    expect(handler).toContain("countryCode:");
    expect(handler).toContain("confirmationMessageSent");
  });

  it("offers a fail-closed staging canary without writing or sending", () => {
    const start = edgeSource.indexOf("async function preRegisterCanary");
    const end = edgeSource.indexOf("async function loadLeadForStaff", start);
    const canary = edgeSource.slice(start, end);
    expect(canary).toContain("PROJECT_REF === PRODUCTION_PROJECT_REF");
    expect(canary).toContain('Deno.env.get("PRE_REGISTRATION_CANARY_TOKEN")');
    expect(canary).toContain('req.headers.get("x-pre-registration-canary")');
    expect(canary).toContain("validatePreRegistrationSubmission(body)");
    expect(canary).toContain("confirmationMessageReady");
    expect(canary).not.toContain('.from("leads")');
    expect(canary).not.toContain("sendPreRegistrationConfirmation");
    expect(canary).not.toContain("sendFunnelWhatsAppMessage");
  });
});
