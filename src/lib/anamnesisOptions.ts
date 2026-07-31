export const SUPPORTED_TRAINING_MODALITIES = [
  "Nenhum",
  "Musculação / Funcional",
  "Corrida",
  "Natação",
  "Bike",
  "Triathlon",
] as const;

export const PRESCRIPTION_SERVICE_OPTIONS = [
  { value: "strength", label: "Musculação / treino de força" },
  { value: "running", label: "Corrida" },
  { value: "swimming", label: "Natação" },
  { value: "cycling", label: "Ciclismo" },
  { value: "triathlon", label: "Triathlon (corrida + natação + ciclismo)" },
  { value: "nutrition", label: "Dicas nutricionais" },
] as const;

export type SupportedTrainingModality = (typeof SUPPORTED_TRAINING_MODALITIES)[number];
export type PrescriptionService = (typeof PRESCRIPTION_SERVICE_OPTIONS)[number]["value"];

export function resolvePrescriptionInterests(services: readonly string[]) {
  const selected = new Set(services);
  const triathlon = selected.has("triathlon");
  return {
    wantsStrength: selected.has("strength"),
    wantsRunning: selected.has("running") || triathlon,
    wantsSwimming: selected.has("swimming") || triathlon,
    wantsCycling: selected.has("cycling") || triathlon,
    wantsNutrition: selected.has("nutrition"),
  };
}
