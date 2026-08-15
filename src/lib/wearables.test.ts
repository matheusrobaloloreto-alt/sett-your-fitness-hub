import { describe, expect, it } from "vitest";
import { wearableMetricDisplay, WEARABLE_STATUS_LABELS } from "./wearables";

describe("wearable UI contracts", () => {
  it("does not render pending or null scores as zero", () => {
    expect(wearableMetricDisplay({ metric: "recovery_score", value: null, unit: "percent", score_state: "PENDING_SCORE" })).toEqual({
      value: "—",
      unit: "aguardando cálculo",
    });
  });

  it("uses WHOOP's 0..21 strain scale", () => {
    expect(wearableMetricDisplay({ metric: "strain", value: 12.4, unit: "whoop_0_21", score_state: "SCORED" })).toEqual({ value: "12.4", unit: "/21" });
  });

  it("declares every operational UI state", () => {
    expect(Object.keys(WEARABLE_STATUS_LABELS)).toEqual(expect.arrayContaining([
      "connected",
      "syncing",
      "stale",
      "error",
      "revoked",
      "revocation_pending",
      "reauthorization_required",
      "config_required",
      "partial_scope",
    ]));
  });
});
