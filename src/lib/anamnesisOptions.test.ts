import { describe, expect, it } from "vitest";
import {
  buildAnamnesisStepIds,
  deriveTrainingAvailability,
  resolvePrescriptionInterests,
} from "./anamnesisOptions";

describe("deriveTrainingAvailability", () => {
  it("derives total and modality frequency from a day-by-day week", () => {
    expect(deriveTrainingAvailability(
      "segunda - musculacao; terca - corrida; quarta - musculacao; quinta - descanso; sexta - musculacao; sabado - corrida; domingo - descanso",
    )).toEqual({ totalDays: 5, strengthDays: 3, cardioDays: 2 });
  });

  it("understands abbreviated days and weekday ranges", () => {
    expect(deriveTrainingAvailability("musculacao seg/qua/sex; corrida ter/sab")).toEqual({
      totalDays: 5,
      strengthDays: 3,
      cardioDays: 2,
    });
    expect(deriveTrainingAvailability("atividade de segunda a sexta").totalDays).toBe(5);
  });

  it("returns null rather than inventing a frequency", () => {
    expect(deriveTrainingAvailability("ainda nao defini a semana")).toEqual({
      totalDays: null,
      strengthDays: null,
      cardioDays: null,
    });
  });
});

describe("resolvePrescriptionInterests", () => {
  it("enables only strength when that is the only requested service", () => {
    expect(resolvePrescriptionInterests(["strength"])).toEqual({
      wantsStrength: true,
      wantsRunning: false,
      wantsSwimming: false,
      wantsCycling: false,
      wantsNutrition: false,
    });
  });

  it("enables nutrition without enabling sports prescriptions", () => {
    expect(resolvePrescriptionInterests(["nutrition"])).toEqual({
      wantsStrength: false,
      wantsRunning: false,
      wantsSwimming: false,
      wantsCycling: false,
      wantsNutrition: true,
    });
  });

  it("expands triathlon into its three endurance modalities", () => {
    expect(resolvePrescriptionInterests(["triathlon", "nutrition"])).toEqual({
      wantsStrength: false,
      wantsRunning: true,
      wantsSwimming: true,
      wantsCycling: true,
      wantsNutrition: true,
    });
  });
});

describe("buildAnamnesisStepIds", () => {
  it("separates every selected modality into its own conditional step", () => {
    expect(buildAnamnesisStepIds(["strength"])).toEqual([
      "profile", "experience", "services", "recovery", "schedule", "strength", "health", "clinical", "finish",
    ]);
    expect(buildAnamnesisStepIds(["running", "nutrition"])).toEqual([
      "profile", "experience", "services", "recovery", "schedule", "running", "health", "clinical", "nutrition", "finish",
    ]);
    expect(buildAnamnesisStepIds(["triathlon"])).toEqual([
      "profile", "experience", "services", "recovery", "schedule", "running", "swimming", "cycling", "health", "clinical", "finish",
    ]);
  });
});
