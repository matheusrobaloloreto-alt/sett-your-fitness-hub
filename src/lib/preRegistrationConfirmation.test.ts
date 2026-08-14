import { describe, expect, it } from "vitest";
import { preRegistrationResponseDeadline } from "../../supabase/functions/_shared/pre-registration-confirmation";

describe("pre-registration confirmation deadline", () => {
  it.each([
    ["segunda", "2026-08-03T15:00:00.000Z"],
    ["terça", "2026-08-04T15:00:00.000Z"],
    ["quarta", "2026-08-05T15:00:00.000Z"],
    ["quinta", "2026-08-06T15:00:00.000Z"],
  ])("promises a same-day response on %s", (_label, timestamp) => {
    expect(preRegistrationResponseDeadline(new Date(timestamp))).toBe(
      "Você vai ouvir da gente ainda hoje.",
    );
  });

  it.each([
    ["sexta", "2026-08-07T15:00:00.000Z"],
    ["sábado", "2026-08-08T15:00:00.000Z"],
    ["domingo", "2026-08-09T15:00:00.000Z"],
  ])("promises a response by Monday on %s", (_label, timestamp) => {
    expect(preRegistrationResponseDeadline(new Date(timestamp))).toBe(
      "Você vai ouvir da gente já na segunda-feira.",
    );
  });
});
