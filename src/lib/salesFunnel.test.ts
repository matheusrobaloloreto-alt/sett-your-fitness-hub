import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  buildAssessmentOnboardingMessage,
  buildPaymentLinkMessage,
  isoDate,
} from "../../supabase/functions/_shared/sales-funnel.ts";

describe("sales funnel", () => {
  it("counts five business days without Saturday and Sunday", () => {
    const thursday = new Date("2026-07-30T12:00:00.000Z");
    expect(isoDate(addBusinessDays(thursday, 5))).toBe("2026-08-06");
  });

  it("builds a distinct Asaas payment-link message with the first name", () => {
    const message = buildPaymentLinkMessage("Matheus Loreto", "https://www.settapp.com.br/pagamento/token");
    expect(message).toContain("Matheus");
    expect(message).toContain("Asaas");
    expect(message).toContain("/pagamento/token");
  });

  it("states the movement-assessment deadline without requesting anamnesis again", () => {
    const message = buildAssessmentOnboardingMessage({
      fullName: "Matheus Loreto",
      dueDate: "06/08/2026",
      hasAnamnesis: true,
    });
    expect(message).toContain("avaliação de movimento");
    expect(message).toContain("5 dias úteis");
    expect(message).toContain("não precisa responder novamente");
  });
});
