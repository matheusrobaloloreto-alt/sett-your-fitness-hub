import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uiSource = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
const edgeSource = readFileSync("supabase/functions/public-registration/index.ts", "utf8");

describe("pre-registration WhatsApp confirmation", () => {
  it("requires an explicit visual confirmation before submitting", () => {
    expect(uiSource).toContain("CONFIRME SEU WHATSAPP");
    expect(uiSource).toContain("Esse é o número certo — confirmar e enviar");
  });

  it("sends the final acknowledgement only after the confirmed submission", () => {
    const start = edgeSource.indexOf("async function preRegister");
    const end = edgeSource.indexOf("async function loadLeadForStaff", start);
    const handler = edgeSource.slice(start, end);
    expect(handler).toContain("whatsappConfirmed");
    expect(handler).toContain("sendPreRegistrationConfirmation");
    expect(handler).toContain("confirmationMessageSent");
  });
});
