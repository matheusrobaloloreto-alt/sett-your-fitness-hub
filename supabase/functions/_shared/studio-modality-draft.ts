import { HttpError } from "./tenant-auth.ts";

export type StudioModality = "corrida" | "natacao" | "ciclismo" | "nutricao";

type DraftScope = {
  bundleId: string | null;
  cycleId: string | null;
  companyId: string;
  studentId: string;
  modality: StudioModality;
};

export async function resolveStudioModalityDraft(
  client: any,
  scope: DraftScope,
  draftOnly: unknown,
): Promise<boolean> {
  if (!scope.bundleId) {
    if (draftOnly === true) throw new HttpError(409, "A geração exige um pacote de rascunho.");
    return false;
  }
  const { data: bundle, error } = await client.from("prescription_bundles")
    .select("training_cycle_id,status,modalities,studio_modalities_draft,studio_modalities_snapshot,studio_strength_draft")
    .eq("id", scope.bundleId).eq("company_id", scope.companyId).eq("student_id", scope.studentId).maybeSingle();
  if (error) throw new HttpError(503, "Falha ao consultar o pacote integrado.");
  if (!bundle) throw new HttpError(403, "Pacote indisponível.");
  if (!bundle.studio_modalities_draft) {
    if (draftOnly === true || bundle.training_cycle_id || scope.cycleId || bundle.studio_strength_draft || bundle.studio_modalities_snapshot) {
      throw new HttpError(409, "Este pacote não aceita geração. Abra um novo rascunho integrado.");
    }
    return false;
  }
  if (!scope.cycleId || bundle.training_cycle_id !== scope.cycleId
    || bundle.status !== "generating" || !bundle.modalities?.includes(scope.modality)) {
    throw new HttpError(409, "O pacote, ciclo ou modalidade não está disponível para geração.");
  }
  return true;
}

export async function readPreviousStudioModalityDraft(
  client: any,
  id: string,
  scope: DraftScope,
  cycleStart: string,
) {
  const { data: draft, error } = await client.from("studio_modality_drafts")
    .select("plan,modality,prescription_bundles!inner(company_id,student_id,status,studio_modalities_snapshot)")
    .eq("id", id).eq("modality", scope.modality)
    .eq("prescription_bundles.company_id", scope.companyId)
    .eq("prescription_bundles.student_id", scope.studentId).maybeSingle();
  if (error) throw new HttpError(503, "Falha ao consultar o rascunho anterior.");
  const bundle = draft?.prescription_bundles;
  return bundle?.status === "draft" && bundle.studio_modalities_snapshot?.start_date < cycleStart ? draft.plan : null;
}

export async function writeStudioModalityDraft(
  client: any,
  scope: DraftScope,
  plan: Record<string, unknown>,
  payload: Record<string, unknown>,
  edit?: { id: string; updatedAt: string },
) {
  const { data, error } = await client.rpc("write_studio_modality_draft", {
    p_bundle_id: scope.bundleId,
    p_cycle_id: scope.cycleId,
    p_company_id: scope.companyId,
    p_student_id: scope.studentId,
    p_modality: scope.modality,
    p_plan: plan,
    p_payload: payload,
    ...(edit ? { p_draft_id: edit.id, p_expected_updated_at: edit.updatedAt } : {}),
  });
  if (error?.message === "studio_bundle_changed") {
    throw new HttpError(409, "O rascunho mudou ou foi publicado. Recarregue antes de continuar.");
  }
  if (error || !data?.id || !data.updated_at || data.draft_only !== true) {
    throw new HttpError(503, "Falha ao confirmar a versão persistida do rascunho.");
  }
  return data;
}
