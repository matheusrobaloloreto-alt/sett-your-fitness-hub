export type PrescriptionBundleSummaryRow = {
  id?: string | null;
  has_strength?: boolean | null;
  has_cardio?: boolean | null;
  has_swimming?: boolean | null;
  has_cycling?: boolean | null;
  has_nutrition?: boolean | null;
  strength_plan_id?: string | null;
  running_plan_id?: string | null;
  nutrition_plan_id?: string | null;
};

export type PrescriptionBundleItemRow = {
  bundle_id?: string | null;
  modality?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
};

export type CompletedPrescriptionBundleBadges = {
  strength: boolean;
  cardio: boolean;
  swimming: boolean;
  cycling: boolean;
  nutrition: boolean;
};

const BADGE_CONTRACTS = {
  strength: {
    flag: "has_strength",
    pointer: "strength_plan_id",
    modality: "musculacao",
    entityType: "ai_strength_plan",
  },
  cardio: {
    flag: "has_cardio",
    pointer: "running_plan_id",
    modality: "corrida",
    entityType: "running_plan",
  },
  swimming: {
    flag: "has_swimming",
    pointer: "running_plan_id",
    modality: "natacao",
    entityType: "running_plan",
  },
  cycling: {
    flag: "has_cycling",
    pointer: "running_plan_id",
    modality: "ciclismo",
    entityType: "running_plan",
  },
  nutrition: {
    flag: "has_nutrition",
    pointer: "nutrition_plan_id",
    modality: "nutricao",
    entityType: "nutrition_plan",
  },
} as const;

const AEROBIC_MODALITIES = new Set(["corrida", "natacao", "ciclismo"]);

function normalizeModality(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMatchingBundleItem(
  bundle: PrescriptionBundleSummaryRow,
  items: PrescriptionBundleItemRow[],
  contract: (typeof BADGE_CONTRACTS)[keyof typeof BADGE_CONTRACTS],
) {
  const pointerId = bundle[contract.pointer];
  if (!bundle[contract.flag] || !hasText(pointerId) || !hasText(bundle.id)) return false;

  const usesSharedAerobicPointer = contract.pointer === "running_plan_id";
  if (usesSharedAerobicPointer) {
    const pointerIsAnchored = items.some((item) =>
      item.bundle_id === bundle.id &&
      item.entity_id === pointerId &&
      item.entity_type === contract.entityType &&
      AEROBIC_MODALITIES.has(normalizeModality(item.modality))
    );
    if (!pointerIsAnchored) return false;
  }

  return items.some((item) =>
    item.bundle_id === bundle.id &&
    hasText(item.entity_id) &&
    (usesSharedAerobicPointer || item.entity_id === pointerId) &&
    item.entity_type === contract.entityType &&
    normalizeModality(item.modality) === contract.modality
  );
}

export function completedPrescriptionBundleBadges(
  bundle: PrescriptionBundleSummaryRow,
  items: PrescriptionBundleItemRow[] = [],
): CompletedPrescriptionBundleBadges {
  return {
    strength: hasMatchingBundleItem(bundle, items, BADGE_CONTRACTS.strength),
    cardio: hasMatchingBundleItem(bundle, items, BADGE_CONTRACTS.cardio),
    swimming: hasMatchingBundleItem(bundle, items, BADGE_CONTRACTS.swimming),
    cycling: hasMatchingBundleItem(bundle, items, BADGE_CONTRACTS.cycling),
    nutrition: hasMatchingBundleItem(bundle, items, BADGE_CONTRACTS.nutrition),
  };
}

export async function updateBundleRunningPlanPointer(
  db: any,
  { bundleId, runningPlanId }: { bundleId: string; runningPlanId: string },
) {
  const { data, error } = await db
    .from("prescription_bundles")
    .update({ running_plan_id: runningPlanId })
    .eq("id", bundleId)
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao ligar cardio: ${error.message}`);
  if (data?.id !== bundleId) {
    throw new Error("Falha ao ligar cardio: pacote nao confirmado apos update.");
  }
}
