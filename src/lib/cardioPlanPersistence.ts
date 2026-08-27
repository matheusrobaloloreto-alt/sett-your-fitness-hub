const EDITABLE_RUNNING_PLAN_COLUMNS = [
  "plan_name",
  "sport",
  "goal",
  "duration_weeks",
  "model",
  "weeks",
  "fc_zones",
  "safety_check",
  "general_tips",
  "warnings",
  "complementary_strength",
  "nutrition_alert",
] as const;

type EditableRunningPlanColumn = typeof EDITABLE_RUNNING_PLAN_COLUMNS[number];
type CardioPlanDraft = Record<string, unknown>;
export type CardioModality = "corrida" | "natacao" | "ciclismo";

type GeneratedCardioState = {
  plans: Partial<Record<CardioModality, CardioPlanDraft>>;
  planIds: Partial<Record<CardioModality, string>>;
  planVersions: Partial<Record<CardioModality, string>>;
};

export function captureGeneratedCardioPlan(
  state: GeneratedCardioState,
  modality: CardioModality,
  response: { id?: string | null; plan?: CardioPlanDraft | null; updated_at?: string | null },
): GeneratedCardioState {
  if (!response.id || !response.plan || !response.updated_at) {
    throw new Error(`A prescrição de ${modality} foi gerada sem ID ou versão persistida.`);
  }
  return {
    plans: { ...state.plans, [modality]: response.plan },
    planIds: { ...state.planIds, [modality]: response.id },
    planVersions: { ...state.planVersions, [modality]: response.updated_at },
  };
}

export function buildCardioPlanPatch(plan: CardioPlanDraft): Partial<Record<EditableRunningPlanColumn, unknown>> {
  return EDITABLE_RUNNING_PLAN_COLUMNS.reduce<Partial<Record<EditableRunningPlanColumn, unknown>>>((patch, column) => {
    if (Object.prototype.hasOwnProperty.call(plan, column)) patch[column] = plan[column];
    return patch;
  }, {});
}

type CardioPlanSaveInput = {
  planId: string;
  expectedUpdatedAt: string;
  plan: CardioPlanDraft;
};

type RunningPlanEdgeClient = {
  functions: {
    invoke: (
      functionName: "update-running-plan-draft",
      options: { body: { plan_id: string; expected_updated_at: string; plan: Record<string, unknown> } },
    ) => Promise<{
      data: { id?: string; updated_at?: string; plan?: CardioPlanDraft; error?: string } | null;
      error: { message?: string; context?: Response } | null;
    }>;
  };
};

async function edgeErrorMessage(error: { message?: string; context?: Response } | null, data: { error?: string } | null) {
  if (data?.error) return data.error;
  if (error?.context) {
    try {
      const payload = await error.context.clone().json();
      if (payload?.error) return String(payload.error);
    } catch { /* response without JSON */ }
  }
  return error?.message || "Falha ao salvar a prescrição aeróbica.";
}

export async function saveCardioPlanDraft(client: RunningPlanEdgeClient, input: CardioPlanSaveInput) {
  if (!input.planId || !input.expectedUpdatedAt) {
    throw new Error("Plano e versão persistida são obrigatórios para salvar.");
  }

  const { data, error } = await client.functions.invoke("update-running-plan-draft", {
    body: {
      plan_id: input.planId,
      expected_updated_at: input.expectedUpdatedAt,
      plan: buildCardioPlanPatch(input.plan) as Record<string, unknown>,
    },
  });

  if (error || data?.error) throw new Error(await edgeErrorMessage(error, data));
  if (!data?.id || !data.updated_at || !data.plan) {
    throw new Error("O servidor não confirmou a versão salva do plano.");
  }
  return { id: data.id, updatedAt: data.updated_at, plan: data.plan };
}

type StrengthPlanDraft = Record<string, unknown>;

export function captureGeneratedStrengthPlan(response: {
  id?: string | null;
  plan?: StrengthPlanDraft | null;
  updated_at?: string | null;
}) {
  if (!response.id || !response.plan || !response.updated_at) {
    throw new Error("A prescrição de musculação foi gerada sem ID ou versão persistida.");
  }
  return { planId: response.id, planVersion: response.updated_at, plan: response.plan };
}

type StrengthPlanEdgeClient = {
  functions: {
    invoke: (
      functionName: "update-strength-plan-draft",
      options: { body: { plan_id: string; expected_updated_at: string; plan: StrengthPlanDraft } },
    ) => Promise<{
      data: { id?: string; updated_at?: string; plan?: StrengthPlanDraft; error?: string } | null;
      error: { message?: string; context?: Response } | null;
    }>;
  };
};

export async function saveStrengthPlanDraft(
  client: StrengthPlanEdgeClient,
  input: { planId: string; expectedUpdatedAt: string; plan: StrengthPlanDraft },
) {
  if (!input.planId || !input.expectedUpdatedAt) {
    throw new Error("Plano e versão persistida são obrigatórios para salvar.");
  }
  const { data, error } = await client.functions.invoke("update-strength-plan-draft", {
    body: {
      plan_id: input.planId,
      expected_updated_at: input.expectedUpdatedAt,
      plan: input.plan,
    },
  });
  if (error || data?.error) throw new Error(await edgeErrorMessage(error, data));
  if (!data?.id || !data.updated_at || !data.plan) {
    throw new Error("O servidor não confirmou a versão salva do plano.");
  }
  return { id: data.id, updatedAt: data.updated_at, plan: data.plan };
}
