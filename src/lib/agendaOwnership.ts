export const uniqueAgendaTrainerIds = (
  ...trainerIds: Array<string | null | undefined>
): string[] => [...new Set(trainerIds.filter((id): id is string => Boolean(id)))];

export const agendaEventBelongsToTrainer = (
  trainerIds: readonly string[] | null | undefined,
  trainerId: string | null | undefined,
): boolean => Boolean(trainerId && trainerIds?.includes(trainerId));
