import { describe, expect, it } from "vitest";
import {
  WEEKLY_SCHEDULE_DAYS,
  missingWeeklyScheduleDays,
  parseWeeklySchedule,
  serializeWeeklySchedule,
  updateWeeklySchedule,
} from "./weeklySchedule";

describe("weeklySchedule", () => {
  it("always exposes Monday through Sunday in order", () => {
    expect(WEEKLY_SCHEDULE_DAYS.map((day) => day.label)).toEqual([
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ]);
  });

  it("serializes the seven visible fields into the legacy training_days string", () => {
    expect(serializeWeeklySchedule({
      monday: "Musculação",
      tuesday: "Corrida",
      wednesday: "Musculação",
      thursday: "Descanso",
      friday: "Musculação",
      saturday: "Corrida",
      sunday: "Descanso",
    })).toBe(
      "segunda — Musculação; terça — Corrida; quarta — Musculação; quinta — Descanso; sexta — Musculação; sábado — Corrida; domingo — Descanso",
    );
  });

  it("reads the legacy serialized value back into the fixed day fields", () => {
    expect(parseWeeklySchedule(
      "segunda - musculação; terça — corrida; quarta: descanso; domingo - caminhada",
    )).toMatchObject({
      monday: "musculação",
      tuesday: "corrida",
      wednesday: "descanso",
      sunday: "caminhada",
    });
  });

  it("updates one day without losing the other answers", () => {
    const original = "segunda — Musculação; terça — Corrida";
    expect(updateWeeklySchedule(original, "wednesday", "Descanso")).toBe(
      "segunda — Musculação; terça — Corrida; quarta — Descanso",
    );
  });

  it("identifies which visible days still need an answer", () => {
    expect(missingWeeklyScheduleDays("segunda — Musculação; domingo — Descanso")).toEqual([
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ]);
  });
});
