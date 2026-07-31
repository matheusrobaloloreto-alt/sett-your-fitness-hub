import { describe, expect, it } from "vitest";
import { resolvePrescriptionInterests } from "./anamnesisOptions";

describe("resolvePrescriptionInterests", () => {
  it("habilita somente musculação quando esse é o único serviço solicitado", () => {
    expect(resolvePrescriptionInterests(["strength"])).toEqual({
      wantsStrength: true,
      wantsRunning: false,
      wantsSwimming: false,
      wantsCycling: false,
      wantsNutrition: false,
    });
  });

  it("habilita nutrição sem acionar prescrições esportivas", () => {
    expect(resolvePrescriptionInterests(["nutrition"])).toEqual({
      wantsStrength: false,
      wantsRunning: false,
      wantsSwimming: false,
      wantsCycling: false,
      wantsNutrition: true,
    });
  });

  it("expande triathlon para corrida, natação e ciclismo", () => {
    expect(resolvePrescriptionInterests(["triathlon", "nutrition"])).toEqual({
      wantsStrength: false,
      wantsRunning: true,
      wantsSwimming: true,
      wantsCycling: true,
      wantsNutrition: true,
    });
  });
});
