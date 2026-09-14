export type TrainerReassignmentStudent = {
  id: string;
  full_name: string;
  status: string | null;
  assigned_trainer_id: string | null;
};

export type TrainerReassignmentScope = {
  companyId: string | null;
  trainerId: string;
};

export type TrainerReassignmentFailure = {
  student: TrainerReassignmentStudent;
  message: string;
};

export type TrainerReassignmentBatchResult = {
  successes: TrainerReassignmentStudent[];
  failures: TrainerReassignmentFailure[];
};

export type TrainerReassignmentRpc = (args: {
  _student_id: string;
  _trainer_id: string;
  _expected_trainer_id: string | null;
}) => Promise<{ error?: { message?: string } | null }>;

const INELIGIBLE_STATUSES = new Set(["inactive"]);

export const isBulkTrainerReassignmentEligible = (student: TrainerReassignmentStudent) =>
  !INELIGIBLE_STATUSES.has(String(student.status || "").toLowerCase());

export const sameTrainerReassignmentScope = (
  left: TrainerReassignmentScope | null | undefined,
  right: TrainerReassignmentScope | null | undefined,
) => !!left && !!right && left.companyId === right.companyId && left.trainerId === right.trainerId;

export function bulkTrainerOriginLabel(students: TrainerReassignmentStudent[], trainerName: (trainerId: string | null | undefined) => string) {
  const origins = new Set(students.map((student) => student.assigned_trainer_id || null));
  if (origins.size !== 1) return "origens diferentes";
  return trainerName(students[0]?.assigned_trainer_id || null);
}

export async function reassignStudentsWithLimit(input: {
  students: TrainerReassignmentStudent[];
  trainerId: string;
  initialScope: TrainerReassignmentScope;
  getCurrentScope: () => TrainerReassignmentScope;
  rpc: TrainerReassignmentRpc;
  concurrency?: number;
}): Promise<TrainerReassignmentBatchResult> {
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, 5));
  const successes: TrainerReassignmentStudent[] = [];
  const failures: TrainerReassignmentFailure[] = [];
  let index = 0;

  const next = async () => {
    while (index < input.students.length) {
      const student = input.students[index++];
      if (!isBulkTrainerReassignmentEligible(student)) {
        failures.push({ student, message: "Aluno inativo ou inelegivel para troca em massa." });
        continue;
      }
      if (!sameTrainerReassignmentScope(input.initialScope, input.getCurrentScope())) {
        failures.push({ student, message: "Carteira alterada; reabra a acao em massa antes de continuar." });
        continue;
      }
      const { error } = await input.rpc({
        _student_id: student.id,
        _trainer_id: input.trainerId,
        _expected_trainer_id: student.assigned_trainer_id || null,
      });
      if (error) {
        failures.push({ student, message: error.message || "Falha ao trocar professor." });
      } else {
        successes.push(student);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, input.students.length) }, () => next()));
  return { successes, failures };
}
