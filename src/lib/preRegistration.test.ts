import { describe, expect, it } from "vitest";
import {
  canonicalAnamnesisToPreRegistrationAnswers,
  coerceEditedPreRegistrationValue,
  formatPreRegistrationValue,
  preRegistrationAnswerEntries,
  preRegistrationAnswerValue,
  preRegistrationPhoneCandidates,
  updatePreRegistrationAnswer,
} from "@/lib/preRegistration";

describe("pre-registration presentation", () => {
  it("flattens complete answers and ignores empty values", () => {
    const entries = preRegistrationAnswerEntries({
      objective: "Hipertrofia",
      current_pain: "Joelho ao agachar",
      empty: "",
      clinical: { medications: "Nenhum", ignored: null },
    });
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "objective", label: "Objetivo principal", value: "Ganho de massa" }),
      expect.objectContaining({ key: "current_pain", label: "Dor atual", value: "Joelho ao agachar" }),
      expect.objectContaining({ key: "clinical.medications", label: "Medicamentos", value: "Nenhum" }),
    ]));
    expect(entries.some((entry) => entry.key.includes("ignored") || entry.key === "empty")).toBe(false);
  });

  it("formats units and boolean answers for staff", () => {
    expect(formatPreRegistrationValue("hours_week")).toBe("h/sem");
    expect(formatPreRegistrationValue("km_week")).toBe("km/sem");
    expect(formatPreRegistrationValue(true)).toBe("Sim");
  });

  it("humanizes legacy pre-registration values", () => {
    expect(preRegistrationAnswerEntries({
      objective: "saude",
      activity_level: "moderado",
      swim_pool: "nao",
      swim_level: "intermediario",
      interest_swimming: true,
      available_days: 4,
      days_available: 4,
    })).toEqual([
      { key: "objective", label: "Objetivo principal", value: "Saúde e bem-estar", rawValue: "saude" },
      { key: "activity_level", label: "Nível de atividade", value: "Moderadamente ativo", rawValue: "moderado" },
      { key: "swim_pool", label: "Piscina", value: "Sem acesso regular", rawValue: "nao" },
      { key: "swim_level", label: "Nível na natação", value: "Intermediário", rawValue: "intermediario" },
      { key: "interest_swimming", label: "Interesse em natação", value: "Sim", rawValue: true },
      { key: "available_days", label: "Dias disponíveis", value: "4", rawValue: 4 },
    ]);
  });

  it("uses the canonical studio anamnesis as a read fallback", () => {
    expect(canonicalAnamnesisToPreRegistrationAnswers({
      objective: "Força",
      prescribed_modalities: ["musculacao", "corrida"],
      days_per_week_strength: 3,
      id: "internal-id",
    })).toEqual({
      objective: "Força",
      modalities: ["musculacao", "corrida"],
      days_strength: 3,
    });
  });

  it("matches WhatsApp phones with and without Brazil country code", () => {
    expect(preRegistrationPhoneCandidates("+55 (48) 99964-4249")).toEqual([
      "5548999644249",
      "48999644249",
    ]);
    expect(preRegistrationPhoneCandidates("48999644249")).toEqual([
      "48999644249",
      "5548999644249",
    ]);
  });

  it("edits nested answers without mutating the original payload", () => {
    const original = { training: { days_strength: 3 }, requested_services: ["strength"] };
    const updated = updatePreRegistrationAnswer(original, "training.days_strength", 4);
    const withServices = updatePreRegistrationAnswer(updated, "requested_services", ["strength", "running"]);

    expect(preRegistrationAnswerValue(original, "training.days_strength")).toBe(3);
    expect(preRegistrationAnswerValue(withServices, "training.days_strength")).toBe(4);
    expect(preRegistrationAnswerValue(withServices, "requested_services")).toEqual(["strength", "running"]);
  });

  it("preserves the original field type when coercing manual edits", () => {
    expect(coerceEditedPreRegistrationValue(3, "4")).toBe(4);
    expect(coerceEditedPreRegistrationValue(true, "Não")).toBe(false);
    expect(coerceEditedPreRegistrationValue(["strength"], "strength, running")).toEqual(["strength", "running"]);
    expect(coerceEditedPreRegistrationValue("texto", "novo texto")).toBe("novo texto");
  });
});
