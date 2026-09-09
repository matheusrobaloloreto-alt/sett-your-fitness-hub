import { describe, expect, it } from "vitest";
import {
  canManuallyCancelIntercycle,
  canManuallyScheduleIntercycle,
  intercycleAnamnesisPath,
  intercycleStatusLabel,
  isIntercycleWindow,
} from "./intercycleAnamnesis";

describe("intercycle anamnesis contract", () => {
  it("uses an opaque route segment and never a student identifier", () => {
    expect(intercycleAnamnesisPath("abc def")).toBe("/anamnese-interciclos/abc%20def");
  });
  it("opens the automatic window exactly on day 29", () => {
    expect(isIntercycleWindow("2026-09-01", new Date("2026-09-28T12:00:00"))).toBe(false);
    expect(isIntercycleWindow("2026-09-01", new Date("2026-09-29T12:00:00"))).toBe(true);
    expect(isIntercycleWindow("2026-09-01", new Date("2026-10-13T12:00:00"))).toBe(false);
  });
  it("keeps observable delivery states in Portuguese", () => {
    expect(intercycleStatusLabel("opted_in")).toBe("Opt-in ativo");
    expect(intercycleStatusLabel("ready")).toBe("Link gerado");
    expect(intercycleStatusLabel("scheduled")).toBe("Envio agendado");
    expect(intercycleStatusLabel("responded")).toBe("Respondido");
  });
  it("lets schedule-now reopen cancelled deliveries but not sending ones", () => {
    expect(canManuallyScheduleIntercycle(null)).toBe(true);
    expect(canManuallyScheduleIntercycle("ready")).toBe(true);
    expect(canManuallyScheduleIntercycle("cancelled")).toBe(true);
    expect(canManuallyScheduleIntercycle("failed")).toBe(true);
    expect(canManuallyScheduleIntercycle("sending")).toBe(false);
    expect(canManuallyScheduleIntercycle("sent")).toBe(false);
    expect(canManuallyScheduleIntercycle("responded")).toBe(false);
  });
  it("does not offer manual cancellation after the dispatcher has claimed sending", () => {
    expect(canManuallyCancelIntercycle("ready")).toBe(true);
    expect(canManuallyCancelIntercycle("scheduled")).toBe(true);
    expect(canManuallyCancelIntercycle("failed")).toBe(true);
    expect(canManuallyCancelIntercycle("sending")).toBe(false);
    expect(canManuallyCancelIntercycle("sent")).toBe(false);
  });
});
