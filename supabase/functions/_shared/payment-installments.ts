export function maxInstallmentsForPlanDuration(durationWeeks: number): number {
  if (durationWeeks === 6) return 1;
  if (durationWeeks === 24) return 6;
  if (durationWeeks === 48) return 12;
  return 1;
}

export function assertInstallmentCountAllowed(
  installmentCount: unknown,
  durationWeeks: number,
): number {
  const parsed = installmentCount == null ? 1 : Number(installmentCount);
  const maximum = maxInstallmentsForPlanDuration(durationWeeks);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Quantidade de parcelas não permitida para este plano.");
  }
  return parsed;
}
