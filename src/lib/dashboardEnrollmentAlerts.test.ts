import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const alertsSource = readFileSync("src/components/DashboardAlerts.tsx", "utf8");

describe("dashboard enrollment alerts", () => {
  it("treats every operational enrollment status as an existing enrollment", () => {
    expect(alertsSource).toContain(
      '.in("status", ["active", "awaiting_training", "awaiting_renewal"])',
    );
  });

  it("applies the selected company to the enrollment-existence query", () => {
    const marker = 'select("student_id, trainer_id, training_start_date")';
    const markerIndex = alertsSource.indexOf(marker);
    expect(markerIndex).toBeGreaterThan(-1);
    expect(alertsSource.slice(markerIndex - 100, markerIndex + 250)).toContain("addCompanyFilter");
  });
});
