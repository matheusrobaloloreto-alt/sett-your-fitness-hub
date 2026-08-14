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
  const primary = [...new Set(primaryMuscleIds.filter(Boolean))];
  const primarySet = new Set(primary);
  const secondary = [...new Set(secondaryMuscleIds.filter((id) => id && !primarySet.has(id)))];
  if (primary.length === 0) throw new Error("Selecione ao menos um grupamento primário.");
  return [
    ...primary.map((muscle_group_id) => ({
      muscle_group_id,
      role: "primary" as const,
      is_primary: true,
      volume_percentage: 100,
    })),
    ...secondary.map((muscle_group_id) => ({
      muscle_group_id,
      role: "secondary" as const,
      is_primary: false,
      volume_percentage: 50,
    })),
  ];
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
