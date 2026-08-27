import { describe, expect, it, vi } from "vitest";
import {
  createPerformanceRecorder,
  normalizePerformanceSample,
} from "@/lib/appPerformanceTelemetry";

describe("app performance telemetry", () => {
  it("keeps only allowlisted, aggregate-safe performance dimensions", () => {
    expect(normalizePerformanceSample({
      routeGroup: "student_workout",
      metric: "content_ready",
      durationMs: 944.49,
      navigationType: "reload",
      effectiveType: "4g",
      viewportWidth: 390,
      extra: "student-id-must-not-pass",
    } as never)).toEqual({
      route_group: "student_workout",
      metric: "content_ready",
      duration_ms: 944,
      navigation_type: "reload",
      effective_type: "4g",
      viewport_bucket: "xs",
    });
  });

  it("rejects unknown routes, metrics and implausible durations", () => {
    expect(normalizePerformanceSample({
      routeGroup: "/aluno/treino/private-id",
      metric: "content_ready",
      durationMs: 100,
    })).toBeNull();
    expect(normalizePerformanceSample({
      routeGroup: "student_workout",
      metric: "student_name",
      durationMs: 100,
    })).toBeNull();
    expect(normalizePerformanceSample({
      routeGroup: "student_workout",
      metric: "content_ready",
      durationMs: Number.NaN,
    })).toBeNull();
    expect(normalizePerformanceSample({
      routeGroup: "student_workout",
      metric: "content_ready",
      durationMs: 120_001,
    })).toBeNull();
  });

  it("records each page metric once and never blocks the product on telemetry failure", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("telemetry unavailable"))
      .mockResolvedValue(undefined);
    const record = createPerformanceRecorder(send);

    await expect(record({
      routeGroup: "trainer_whatsapp",
      metric: "content_ready",
      durationMs: 1_154,
    })).resolves.toBe(false);
    await expect(record({
      routeGroup: "trainer_whatsapp",
      metric: "content_ready",
      durationMs: 1_500,
    })).resolves.toBe(false);
    await expect(record({
      routeGroup: "trainer_whatsapp",
      metric: "shell_ready",
      durationMs: 800,
    })).resolves.toBe(true);

    expect(send).toHaveBeenCalledTimes(2);
  });
});
