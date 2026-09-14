import { describe, expect, it } from "vitest";
import {
  EMERGENCY_FALLBACK_RIR,
  enforceEmergencyFallbackRir,
} from "../../../supabase/functions/_shared/prescription/emergencyFallback.ts";

describe("emergency fallback served policy", () => {
  it.each(["forca_global", "forca_especifica"])(
    "emits RIR 3-4 for the served %s phase even when an input spec regresses",
    (phase) => {
      expect(enforceEmergencyFallbackRir({ phase, rir: "2-3", sets: 4 })).toEqual({
        phase,
        rir: EMERGENCY_FALLBACK_RIR,
        sets: 4,
      });
    },
  );

  it("does not rewrite non-strength preparation phases", () => {
    expect(enforceEmergencyFallbackRir({ phase: "mobilidade", rir: "4" })).toEqual({
      phase: "mobilidade",
      rir: "4",
    });
  });
});
