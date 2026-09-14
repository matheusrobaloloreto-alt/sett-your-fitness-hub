import { muscleLabel } from "@/lib/exerciseTaxonomy";

/**
 * Retorna um rótulo anatômico canônico ou null para categorias funcionais.
 * A allowlist falha fechada para impedir que filtros gravados em muscle_group
 * (core, mobilidade, performance etc.) contaminem os gráficos de volume.
 */
export function canonicalAnatomicalMuscleGroup(value: unknown): string | null {
  return muscleLabel(value);
}

export function isAnatomicalMuscleGroup(value: unknown): boolean {
  return canonicalAnatomicalMuscleGroup(value) !== null;
}
