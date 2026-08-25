import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCardioPlanUpdate } from "../../supabase/functions/_shared/cardio-plan-update";

const basePlan = {
  plan_name: "Base aeróbica",
  sport: "corrida",
  goal: "Completar 10 km",
  duration_weeks: 99,
  model: "polarizado",
  weeks: [{
    week_number: 1,
    focus: "Base",
    volume_hours: 99,
    volume_km: 99,
    sessions: [{
      day: "Segunda",
      title: "Rodagem",
      type: "base_z2",
      sport: "ciclismo",
      warmup_min: 10,
      main_min: 30,
      cooldown_min: 5,
      total_min: 999,
      distance_km: 5.25,
      zone: "Z2",
      fc_target: "130-145",
      intervals: null,
      notes: "Conversável",
    }],
  }],
  fc_zones: {},
  safety_check: {},
  general_tips: "Progredir com calma",
  warnings: [],
  complementary_strength: [],
  nutrition_alert: "Hidratar",
};

describe("cardio plan update edge contract", () => {
  it("derives immutable sport, duration and weekly aggregates on the server", () => {
    const normalized = normalizeCardioPlanUpdate(basePlan, "corrida");

    expect(normalized.duration_weeks).toBe(1);
    expect(normalized.weeks[0].volume_hours).toBe(0.8);
    expect(normalized.weeks[0].volume_km).toBe(5.3);
    expect(normalized.weeks[0].sessions[0].sport).toBe("corrida");
    expect(normalized.weeks[0].sessions[0].total_min).toBe(45);
  });

  it("rejects an attempt to mutate the persisted modality", () => {
    expect(() => normalizeCardioPlanUpdate({ ...basePlan, sport: "natacao" }, "corrida"))
      .toThrow("modalidade");
  });

  it("rejects empty weeks, invalid sessions and oversized payloads", () => {
    expect(() => normalizeCardioPlanUpdate({ ...basePlan, weeks: [] }, "corrida"))
      .toThrow("semanas");
    expect(() => normalizeCardioPlanUpdate({
      ...basePlan,
      weeks: [{ ...basePlan.weeks[0], sessions: [] }],
    }, "corrida")).toThrow("sessões");
    expect(() => normalizeCardioPlanUpdate({
      ...basePlan,
      general_tips: "x".repeat(1_048_576),
    }, "corrida")).toThrow("1 MB");
  });

  it("allowlists nested plan fields and validates structured metadata", () => {
    const normalized = normalizeCardioPlanUpdate({
      ...basePlan,
      injected_top_level: "discard-me",
      fc_zones: {
        fcmax: 190,
        estimated: true,
        z1: { min: 110, max: 125, injected: "discard-me" },
        injected: "discard-me",
      },
      safety_check: {
        tsb_status: "ok",
        restrictions: ["Sem restrições"],
        injected: "discard-me",
      },
      complementary_strength: ["Panturrilha"],
      weeks: [{
        ...basePlan.weeks[0],
        injected: "discard-me",
        sessions: [{ ...basePlan.weeks[0].sessions[0], injected: "discard-me" }],
      }],
    }, "corrida");

    expect(normalized).not.toHaveProperty("injected_top_level");
    expect(normalized.weeks[0]).not.toHaveProperty("injected");
    expect(normalized.weeks[0].sessions[0]).not.toHaveProperty("injected");
    expect(normalized.fc_zones).toEqual({
      fcmax: 190,
      estimated: true,
      z1: { min: 110, max: 125 },
    });
    expect(normalized.safety_check).toEqual({
      tsb_status: "ok",
      restrictions: ["Sem restrições"],
    });
    expect(normalized.complementary_strength).toEqual(["Panturrilha"]);

    expect(() => normalizeCardioPlanUpdate({
      ...basePlan,
      fc_zones: { z1: { min: "110", max: 125 } },
    }, "corrida")).toThrow("Z1");
    expect(() => normalizeCardioPlanUpdate({
      ...basePlan,
      complementary_strength: [{ exercise: "Panturrilha" }],
    }, "corrida")).toThrow("Força complementar");
  });

  it("keeps auth, tenant resolution and optimistic concurrency inside the edge", () => {
    const source = readFileSync("supabase/functions/update-running-plan-draft/index.ts", "utf8");
    const config = readFileSync("supabase/config.toml", "utf8");

    expect(source).toContain("auth.getUser(token)");
    expect(source).toContain("assertTenantAccess(adminClient");
    expect(source).toContain("studentId: existing.student_id");
    expect(source).toContain("companyId: existing.company_id");
    expect(source).toContain('.eq("updated_at", expectedUpdatedAt)');
    expect(source).toContain('.eq("id", planId)');
    expect(source).not.toContain("body.company_id");
    expect(source).not.toContain("body.student_id");
    expect(config).toContain("[functions.update-running-plan-draft]");
  });

  it("verifies the generator bearer token with the auth server", () => {
    const source = readFileSync("supabase/functions/ai-running-plan/index.ts", "utf8");

    expect(source).toContain("auth.getUser(token)");
    expect(source).not.toContain("auth.getClaims(token)");
  });
});
