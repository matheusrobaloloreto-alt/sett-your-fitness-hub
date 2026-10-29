export interface InstallmentPolicy { installments_short: number; installments_medium: number; installments_long: number }
export function maxInstallmentsForPlanDuration(durationWeeks: number, policy?: InstallmentPolicy): number {
  const limits = policy ?? { installments_short: 1, installments_medium: 6, installments_long: 12 };
  for (const limit of Object.values(limits)) if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error("Política de parcelamento inválida.");
  if (durationWeeks === 6) return limits.installments_short;
  if (durationWeeks === 24) return limits.installments_medium;
  if (durationWeeks === 48) return limits.installments_long;
  return 1;
}

export function assertInstallmentCountAllowed(
  installmentCount: unknown,
  durationWeeks: number,
  policy?: InstallmentPolicy,
): number {
  const parsed = installmentCount == null ? 1 : Number(installmentCount);
  const maximum = maxInstallmentsForPlanDuration(durationWeeks, policy);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Quantidade de parcelas não permitida para este plano.");
  }
  return parsed;
}
