import { describe, expect, it } from "vitest";
import { preRegistrationFollowUpNotice } from "../../supabase/functions/_shared/pre-registration-confirmation";
import { buildPreRegistrationConfirmationMessage } from "../../supabase/functions/_shared/sales-funnel";

describe("pre-registration confirmation copy", () => {
  it("sets an honest follow-up expectation without a promised deadline", () => {
    const notice = preRegistrationFollowUpNotice();
    const message = buildPreRegistrationConfirmationMessage("Pessoa Teste", notice);

    expect(message).toContain("Recebemos seu pré-cadastro");
    expect(message).toContain("procura alta");
    expect(message).toContain("prioridade de atendimento");
    expect(message).not.toMatch(/hoje|segunda-feira|48 horas|até \d+ dia/i);
  });
});
