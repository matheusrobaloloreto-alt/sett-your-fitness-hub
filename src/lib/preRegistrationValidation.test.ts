import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validatePreRegistrationSubmission } from "../../supabase/functions/_shared/pre-registration-validation";

const completeAnswers = {
  objective: "saude", gender: "M", modalities: ["Musculação / Funcional"], requested_services: ["strength"],
  profession: "Escritório", sleep_hours: "6h - 8h", restorative_sleep: true, perceived_recovery: 7,
  aware_of_trilogy: true, training_days: "seg, qua e sex", session_duration: "de 45 a 60 minutos",
  training_location: "Academia de Rede", diseases: "nenhuma", medications: "nenhum", injuries: "nenhuma",
  current_pain: "nenhuma", clin_cardiac: "nao", clin_chest_pain: "nao", clin_surgery: "nao",
  clin_pregnant: "na", clin_smoke: "nao", clin_acute: "nao", eva_tornozelo: 0, eva_joelho: 0,
  eva_quadril: 0, eva_lombar: 0, eva_ombro: 0, feel_in_3_months: "Bem", biggest_obstacle: "Tempo",
  commits_communication: true, preferred_contact_channel: "whatsapp_message", preferred_contact_period: "evening",
  budget_range: "300_400", shown_blocks: ["dados", "objetivo", "treino", "saude", "clinica", "musculacao"],
  available_equipment: [], custom_answers: {},
};
const complete = {
  fullName: "Aluno Teste", whatsapp: "48999999999", budgetRange: "300_400",
  preferredContactPeriod: "evening", answers: completeAnswers,
};

describe("pre-registration server contract", () => {
  it("validates before the first lead read or write", () => {
    const edge = readFileSync("supabase/functions/public-registration/index.ts", "utf8");
    const start = edge.indexOf("async function preRegister");
    const end = edge.indexOf("async function loadLeadForStaff", start);
    const handler = edge.slice(start, end);
    const validationOffset = handler.indexOf("validatePreRegistrationSubmission(versioned?.legacyBody ?? body");
    expect(validationOffset).toBeGreaterThan(0);
    expect(handler.indexOf("resolvePreRegistrationCompany(body)")).toBeLessThan(handler.indexOf("prepareVersionedPreRegistration("));
    expect(handler.indexOf("prepareVersionedPreRegistration(")).toBeLessThan(validationOffset);
    expect(validationOffset).toBeLessThan(handler.indexOf('.from("leads")'));
    expect(handler).toContain('__form: versioned.snapshot');
  });

  it("accepts the complete real form contract", () => {
    expect(validatePreRegistrationSubmission({
      ...complete,
      fullName: "  Aluno   Teste  ",
      whatsapp: "+55 (48) 99999-9999",
    })).toEqual({
      fullName: "Aluno Teste",
      phone: "5548999999999",
      budgetRange: "300_400",
      preferredContactPeriod: "evening",
      answers: completeAnswers,
    });
  });

  it("accepts a valid international E.164 WhatsApp with up to 15 digits", () => {
    expect(validatePreRegistrationSubmission({
      ...complete,
      whatsapp: "+123 456 789 012 345",
    }).phone).toBe("123456789012345");
  });

  it('accepts additional answers only with their validated published definition', () => {
    const extra = { id: 'extra_preference', label: 'Preferencia', is_required: true, field_type: 'select', options: ['morning', 'evening'] };
    const body = { ...complete, answers: { ...completeAnswers, custom_answers: { extra_preference: { label: 'Preferencia', value: 'morning' } } } };
    expect(() => validatePreRegistrationSubmission(body)).toThrow(/adicionais/);
    expect(validatePreRegistrationSubmission(body, [extra]).answers.custom_answers).toEqual(body.answers.custom_answers);
    expect(() => validatePreRegistrationSubmission({ ...body, answers: { ...body.answers, custom_answers: { extra_preference: { label: 'Preferencia', value: 'injetada' } } } }, [extra])).toThrow(/Preferencia/);
  });

  it('accepts a defined multiselect extra without permitting arbitrary nested objects', () => {
    const extra = { id: 'extra_goals', label: 'Metas adicionais', is_required: true, field_type: 'checkbox', options: ['forca', 'mobilidade'] };
    const body = { ...complete, answers: { ...completeAnswers, custom_answers: { extra_goals: { label: extra.label, value: ['forca', 'mobilidade'] } } } };
    expect(validatePreRegistrationSubmission(body, [extra]).answers.custom_answers).toEqual(body.answers.custom_answers);
    expect(() => validatePreRegistrationSubmission({ ...body, answers: { ...body.answers, custom_answers: { extra_goals: { label: extra.label, value: { nested: true } } } } }, [extra])).toThrow(/limites permitidos/);
  });

  it.each([
    [{ answers: { objective: "saude" } }, "incompleto"],
    [{ answers: { ...completeAnswers, eva_joelho: 99 } }, "dor no joelho"],
    [{ answers: { ...completeAnswers, modalities: ["injetada"] } }, "modalidades"],
    [{ answers: { ...completeAnswers, restorative_sleep: "sim" } }, "sono reparador"],
    [{ answers: { ...completeAnswers, preferred_contact_period: "morning" } }, "inconsistente"],
    [{ answers: { ...completeAnswers, shown_blocks: undefined } }, "estrutura do formulário"],
    [{ answers: { ...completeAnswers, injected: true } }, "respostas desconhecidas"],
    [{ unknown: "field" }, "campos desconhecidos"],
    [{ fullName: "Aluno" }, "nome completo"],
    [{ fullName: "123 456" }, "nome completo"],
    [{ whatsapp: "123" }, "WhatsApp válido"],
    [{ whatsapp: "11111111111" }, "WhatsApp válido"],
    [{ answers: { ...completeAnswers, budget_range: "200_300" } }, "investimento está inconsistente"],
    [{ answers: { ...completeAnswers, custom_answers: { unknown: { label: "X", value: "Y" } } } }, "respostas adicionais"],
    [{ answers: { ...completeAnswers, custom_answers: { deep: { label: "X", value: { nested: true } } } } }, "limites permitidos"],
    [{ answers: { ...completeAnswers, extra_comments: "x".repeat(70_000) } }, "limites permitidos"],
  ])("rejects partial or malformed direct submissions %#", (change, message) => {
    try {
      validatePreRegistrationSubmission({ ...complete, ...change });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ status: 422 });
      expect((error as Error).message).toContain(message);
    }
  });
});
