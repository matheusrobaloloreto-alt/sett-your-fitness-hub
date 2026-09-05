import { describe, expect, it } from "vitest";
import { SUPPORTED_TRAINING_MODALITIES } from "@/lib/anamnesisOptions";
import {
  anamnesisInvitePath,
  anamnesisInviteUrl,
  fiscalRegistrationPath,
  fiscalRegistrationUrl,
  paymentPath,
  paymentUrl,
  preRegistrationPath,
  preRegistrationUrl,
  publicUrl,
} from "@/lib/publicFlowLinks";

describe("public flow links", () => {
  const origin = "https://www.settapp.com.br/";

  it("uses the universal pre-registration route as the first step", () => {
    expect(preRegistrationPath("bn-performance-training")).toBe("/cadastro/bn-performance-training");
    expect(preRegistrationUrl(origin, "bn-performance-training"))
      .toBe("https://www.settapp.com.br/cadastro/bn-performance-training");
    expect(() => preRegistrationPath(" ")).toThrow("Slug da empresa é obrigatório");
  });

  it("keeps fiscal registration and payment as distinct tokenized steps", () => {
    expect(fiscalRegistrationPath("fiscal-token")).toBe("/cadastro-fiscal/fiscal-token");
    expect(paymentPath("payment-token")).toBe("/pagamento/payment-token");
    expect(fiscalRegistrationUrl(origin, "fiscal-token"))
      .toBe("https://www.settapp.com.br/cadastro-fiscal/fiscal-token");
    expect(paymentUrl(origin, "payment-token"))
      .toBe("https://www.settapp.com.br/pagamento/payment-token");
  });

  it("uses an opaque invitation for an existing student's anamnesis", () => {
    expect(anamnesisInvitePath("invite-token")).toBe("/anamnese-convite/invite-token");
    expect(anamnesisInviteUrl(origin, "invite-token"))
      .toBe("https://www.settapp.com.br/anamnese-convite/invite-token");
  });

  it("normalizes origins and paths", () => {
    expect(publicUrl("https://www.settapp.com.br///", "pagamento/token"))
      .toBe("https://www.settapp.com.br/pagamento/token");
  });
});

describe("prescribable modalities", () => {
  it("does not offer unsupported tennis prescriptions", () => {
    expect(SUPPORTED_TRAINING_MODALITIES).not.toContain("Tênis");
    expect(SUPPORTED_TRAINING_MODALITIES).toEqual([
      "Nenhum",
      "Musculação / Funcional",
      "Corrida",
      "Natação",
      "Bike",
      "Triathlon",
    ]);
  });
});
