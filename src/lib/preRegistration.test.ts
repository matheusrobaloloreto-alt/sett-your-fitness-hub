import { describe, expect, it } from "vitest";
import {
  canonicalAnamnesisToPreRegistrationAnswers,
  formatPreRegistrationValue,
  preRegistrationAnswerEntries,
  preRegistrationPhoneCandidates,
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
      { key: "objective", label: "Objetivo principal", value: "Saúde e bem-estar" },
      { key: "activity_level", label: "Nível de atividade", value: "Moderadamente ativo" },
      { key: "swim_pool", label: "Piscina", value: "Sem acesso regular" },
      { key: "swim_level", label: "Nível na natação", value: "Intermediário" },
      { key: "interest_swimming", label: "Interesse em natação", value: "Sim" },
      { key: "available_days", label: "Dias disponíveis", value: "4" },
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
});
