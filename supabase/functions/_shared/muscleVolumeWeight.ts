/** One work set contributes 1 to a primary target and 0.5 to a secondary target.
 * Historical percentages are accepted as metadata but never control exposure.
 */
export function fixedTargetWeight(target: {
  role?: string | null;
  isPrimary?: boolean | null;
  volumePercentage?: number | null;
}): 1 | 0.5 {
  if (target.role && target.role !== "primary" && target.role !== "secondary") {
    throw new TypeError("target role must be primary or secondary");
  }
  if (target.role && typeof target.isPrimary === "boolean" &&
    (target.role === "primary") !== target.isPrimary) {
    throw new TypeError("target role conflicts with isPrimary");
  }
  if (target.role === "primary" || target.isPrimary === true) return 1;
  if (target.role === "secondary" || target.isPrimary === false) return 0.5;
  throw new TypeError("target role or isPrimary is required");
}
