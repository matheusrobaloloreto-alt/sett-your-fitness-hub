import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveAnamnesisDurations } from "../../supabase/functions/_shared/anamnesis-duration";

describe("anamnesis session durations", () => {
  it("keeps strength and endurance durations separate when both coexist", () => {
    expect(resolveAnamnesisDurations({
      session_duration: "60 min",
      endurance_session_duration: "30-45 min",
    }, { strength: true, endurance: true })).toEqual({
      session_duration_min: 60,
      endurance_session_duration_min: 45,
    });
  });

  it("keeps the legacy duration useful for an endurance-only athlete", () => {
    expect(resolveAnamnesisDurations({
      session_duration: null,
      endurance_session_duration: "45-60 min",
    }, { strength: false, endurance: true })).toEqual({
      session_duration_min: 60,
      endurance_session_duration_min: 60,
    });
  });

  it("wires the sport planner to the endurance duration without replacing strength", () => {
    const form = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
    const studio = readFileSync("src/pages/admin/PrescriptionStudio.tsx", "utf8");
    expect(form).toContain("session_duration: sessionDuration || null");
    expect(form).toContain("endurance_session_duration: enduranceSessionDuration || null");
    expect(form).not.toContain("sessionDuration || enduranceSessionDuration");
    expect(studio).toContain("a.endurance_session_duration_min ?? a.session_duration_min");
  });
});
