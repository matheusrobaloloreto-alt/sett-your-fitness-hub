import { describe, expect, it } from "vitest";
import { preRegistrationResponseDeadline } from "../../supabase/functions/_shared/pre-registration-confirmation";

describe("pre-registration confirmation deadline", () => {
  it.each([
    ["domingo", "2026-08-02T15:00:00.000Z"],
    ["segunda", "2026-08-03T15:00:00.000Z"],
    ["terça", "2026-08-04T15:00:00.000Z"],
    ["quarta", "2026-08-05T15:00:00.000Z"],
    ["quinta", "2026-08-06T15:00:00.000Z"],
  ])("promises a response within 48 hours on %s", (_label, timestamp) => {
    expect(preRegistrationResponseDeadline(new Date(timestamp))).toBe(
      "Vamos analisar o seu perfil e, se pudermos realmente te ajudar, você receberá um retorno nosso em até 48 horas.",
    );
  });

  it.each([
    ["sexta", "2026-08-07T15:00:00.000Z"],
    ["sábado", "2026-08-08T15:00:00.000Z"],
  ])("promises a response by Monday on %s", (_label, timestamp) => {
    expect(preRegistrationResponseDeadline(new Date(timestamp))).toBe(
      "Vamos analisar o seu perfil e, se pudermos realmente te ajudar, você receberá um retorno nosso até segunda-feira.",
    );
  });
});
