export const SUPPORTED_TRAINING_MODALITIES = [
  "Nenhum",
  "Musculação / Funcional",
  "Corrida",
  "Natação",
  "Bike",
  "Triathlon",
] as const;

export type SupportedTrainingModality = (typeof SUPPORTED_TRAINING_MODALITIES)[number];

