import { buildExerciseTargetRows } from "@/lib/exerciseTaxonomy";

export interface ExerciseTargetPayload {
  muscle_group_id: string;
  role: "primary" | "secondary";
  is_primary: boolean;
  volume_percentage: number;
}

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data?: unknown;
    error?: { message?: string } | null;
  }>;
};

export function buildExerciseTargetPayload(
  primaryMuscleIds: string[],
  secondaryMuscleIds: string[],
): ExerciseTargetPayload[] {
  return buildExerciseTargetRows(primaryMuscleIds, secondaryMuscleIds);
}

export async function replaceExerciseMuscleTargets(
  client: RpcClient,
  exerciseId: string,
  targets: ExerciseTargetPayload[],
) {
  const { error } = await client.rpc("replace_exercise_muscle_targets", {
    p_exercise_id: exerciseId,
    p_targets: targets,
  });
  if (error) throw new Error(error.message || "Falha ao salvar alvos musculares.");
}
