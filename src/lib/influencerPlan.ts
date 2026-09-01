export const INFLUENCER_PLAN_KIND = "influencer" as const;
export const STANDARD_PLAN_KIND = "standard" as const;

export type PlanKind = typeof STANDARD_PLAN_KIND | typeof INFLUENCER_PLAN_KIND;

export type PlanOperationalRequirements = {
  requiresEnrollment: boolean;
  requiresTrainer: boolean;
  requiresStartDate: boolean;
  requiresPayment: boolean;
};

const STANDARD_REQUIREMENTS: PlanOperationalRequirements = {
  requiresEnrollment: true,
  requiresTrainer: true,
  requiresStartDate: true,
  requiresPayment: true,
};

const INFLUENCER_REQUIREMENTS: PlanOperationalRequirements = {
  requiresEnrollment: false,
  requiresTrainer: false,
  requiresStartDate: false,
  requiresPayment: false,
};

export function planOperationalRequirements(planKind?: string | null): PlanOperationalRequirements {
  return planKind === INFLUENCER_PLAN_KIND
    ? INFLUENCER_REQUIREMENTS
    : STANDARD_REQUIREMENTS;
}

export function isInfluencerPlan(plan?: { plan_kind?: string | null } | null): boolean {
  return plan?.plan_kind === INFLUENCER_PLAN_KIND;
}
