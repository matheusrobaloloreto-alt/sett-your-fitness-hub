import { HttpError } from "./tenant-auth.ts";
import { validateInviteAnamnesis } from "./public-anamnesis-validation.ts";

const INVESTMENT_RANGES = new Set(["200_300", "300_400", "400_500"]);
const CONTACT_PERIODS = new Set(["morning", "afternoon", "evening"]);

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const digits = (value: unknown) => typeof value === "string" ? value.replace(/\D/g, "") : "";

export function validatePreRegistrationSubmission(body: Record<string, unknown>) {
  const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
    ? body.answers as Record<string, unknown>
    : null;
  if (text(body.fullName).length < 3) throw new HttpError(422, "Informe seu nome completo.");
  if (digits(body.whatsapp).length < 10) throw new HttpError(422, "Informe um WhatsApp válido.");
  if (!INVESTMENT_RANGES.has(text(body.budgetRange))) throw new HttpError(422, "Selecione a faixa de investimento.");
  if (!CONTACT_PERIODS.has(text(body.preferredContactPeriod))) throw new HttpError(422, "Selecione o melhor horário para contato.");
  if (!answers) throw new HttpError(422, "Pré-cadastro incompleto ou inválido.");
  if (!Array.isArray(answers.shown_blocks) || !Array.isArray(answers.available_equipment)) {
    throw new HttpError(422, "Pré-cadastro incompleto ou inválido: estrutura do formulário ausente.");
  }
  if (answers.preferred_contact_period !== body.preferredContactPeriod) {
    throw new HttpError(422, "O melhor horário para contato está inconsistente.");
  }
  const invalid = validateInviteAnamnesis(answers, []);
  if (invalid.length > 0) {
    throw new HttpError(422, `Pré-cadastro incompleto ou inválido: ${invalid.join(", ")}.`);
  }
  return answers;
}
