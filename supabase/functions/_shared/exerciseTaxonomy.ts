import { fixedTargetWeight } from "./muscleVolumeWeight.ts";

export type ExerciseTargetRole = "primary" | "secondary";

export const MUSCLE_GROUP_OPTIONS = [
  { slug: "abdomen", label: "Abdômen", aliases: ["abdomen", "abdominal", "abdominais", "abs"] },
  { slug: "quadriceps", label: "Quadríceps", aliases: ["quadriceps", "quadri", "reto femoral"] },
  { slug: "posterior_de_coxa", label: "Posterior de coxa", aliases: ["posterior", "posteriores", "isquiotibiais", "hamstring", "hamstrings"] },
  { slug: "gluteos", label: "Glúteos", aliases: ["gluteo", "gluteos", "gluteo maximo", "gluteo medio", "gluteo minimo"] },
  { slug: "adutores", label: "Adutores", aliases: ["adutor", "adutores", "adutor magno"] },
  { slug: "panturrilha", label: "Panturrilha", aliases: ["panturrilhas", "gastrocnemio", "gastrocnemios", "soleo"] },
  { slug: "deltoide_lateral", label: "Deltoide Lateral", aliases: ["deltoide lateral", "lateral de ombro"] },
  { slug: "deltoide_posterior", label: "Deltoide Posterior", aliases: ["deltoide posterior", "posterior de ombro"] },
  { slug: "deltoide_anterior", label: "Deltoide Anterior", aliases: ["deltoide anterior", "anterior de ombro", "deltoide frontal", "deltóide frontal"] },
  { slug: "antebraco", label: "Antebraço", aliases: ["antebracos", "braquiorradial"] },
  { slug: "biceps", label: "Biceps", aliases: ["bíceps", "biceps"] },
  { slug: "triceps", label: "Triceps", aliases: ["tríceps", "triceps"] },
  { slug: "dorsal", label: "Dorsal", aliases: ["costas", "dorsais", "latissimo", "latissimos"] },
  { slug: "trapezio", label: "Trapezio", aliases: ["trapézio", "trapezio", "trapézios", "trapezios", "trapezio inferior", "trapézio inferior"] },
  { slug: "peitoral", label: "Peitoral", aliases: ["peito", "peitorais", "chest"] },
] as const;

export type ExerciseMuscleSlug = typeof MUSCLE_GROUP_OPTIONS[number]["slug"];

export const CATEGORY_OPTIONS = [
  { slug: "core", label: "Core", aliases: ["abdomen", "abdominal", "abdominais", "abs"] },
  { slug: "mobilidades", label: "Mobilidades", aliases: ["mobilidade", "mobility", "alongamento", "stretching"] },
  { slug: "funcionais", label: "Funcionais", aliases: ["funcional", "controle_motor", "controle motor", "fisioterapia", "fisio", "ativacao", "ativação", "estabilidade", "propriocepcao"] },
  { slug: "base", label: "Base", aliases: ["basico", "básico", "composto", "compostos"] },
  { slug: "pesos_livre", label: "Pesos Livre", aliases: ["pesos_livres", "pesos livres", "peso livre", "halteres", "barra", "kettlebell", "anilha"] },
  { slug: "peso_corporal", label: "Peso Corporal", aliases: ["calistenia", "livre", "bodyweight", "solo"] },
  { slug: "maquinas", label: "Maquinas", aliases: ["máquinas", "maquina", "máquina", "polia", "cabo", "leg press", "cadeira", "mesa flexora"] },
  { slug: "pliometria", label: "Pliometria", aliases: ["performance", "pliometrico", "pliométrico", "salto", "jump", "hop", "bound"] },
] as const;

export type ExerciseCategorySlug = typeof CATEGORY_OPTIONS[number]["slug"];

export type ExerciseCategoryContext = {
  name?: string | null;
  description?: string | null;
  muscle_group?: string | null;
  equipment?: string | null;
};

export type ExerciseTargetInput = {
  muscle_group?: string | null;
  muscle_group_name?: string | null;
  muscle_group_id?: string | null;
  role?: string | null;
  is_primary?: boolean | null;
  volume_percentage?: number | null;
};

export type NormalizedExerciseTarget = ExerciseTargetInput & {
  muscle_slug: ExerciseMuscleSlug;
  muscle_label: string;
  role: ExerciseTargetRole;
  is_primary: boolean;
  volume_percentage: 100 | 50;
};

const normalizeKey = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const muscleByKey = new Map<string, typeof MUSCLE_GROUP_OPTIONS[number]>();
for (const option of MUSCLE_GROUP_OPTIONS) {
  muscleByKey.set(normalizeKey(option.slug), option);
  muscleByKey.set(normalizeKey(option.label), option);
  for (const alias of option.aliases) muscleByKey.set(normalizeKey(alias), option);
}

const categoryByKey = new Map<string, typeof CATEGORY_OPTIONS[number]>();
for (const option of CATEGORY_OPTIONS) {
  categoryByKey.set(normalizeKey(option.slug), option);
  categoryByKey.set(normalizeKey(option.label), option);
  for (const alias of option.aliases) categoryByKey.set(normalizeKey(alias), option);
}

const textForInference = (context: ExerciseCategoryContext) =>
  normalizeKey(`${context.name ?? ""} ${context.description ?? ""} ${context.muscle_group ?? ""} ${context.equipment ?? ""}`)
    .replace(/_/g, " ");

const inferCategoryFromExercise = (context: ExerciseCategoryContext): ExerciseCategorySlug => {
  const text = textForInference(context);
  if (/salto|jump|hop|bound|drop|pliometr|arremesso|slam|rebote|aterriss/.test(text)) return "pliometria";
  if (/mobil|along|libera|foam|amplitude|rotacao articular/.test(text)) return "mobilidades";
  if (/prancha|abdom|pallof|bird dog|dead bug|anti rotacao/.test(text)) return "core";
  if (/maquina|polia|cabo|leg press|cadeira|mesa flexora/.test(text)) return "maquinas";
  if (/halter|barra|kettlebell|anilha/.test(text)) return "pesos_livre";
  if (/peso corporal|bodyweight|flexao|barra fixa|solo/.test(text)) return "peso_corporal";
  if (/agach|terra|levantamento|supino|remada|puxada/.test(text)) return "base";
  return "funcionais";
};

export function canonicalMuscleSlug(value: unknown): ExerciseMuscleSlug | null {
  return muscleByKey.get(normalizeKey(value))?.slug ?? null;
}

export function muscleLabel(value: unknown): string | null {
  const slug = canonicalMuscleSlug(value);
  return slug ? MUSCLE_GROUP_OPTIONS.find((option) => option.slug === slug)?.label ?? null : null;
}

export function isVolumeMuscleSlug(value: unknown): value is ExerciseMuscleSlug {
  return canonicalMuscleSlug(value) !== null;
}

export function canonicalCategorySlug(value: unknown, context: ExerciseCategoryContext = {}): ExerciseCategorySlug | null {
  const key = normalizeKey(value);
  if (!key) return null;
  if (["fisioterapia", "fisio"].includes(key)) return inferCategoryFromExercise(context);
  return categoryByKey.get(key)?.slug ?? null;
}

export function categoryLabel(value: unknown): string | null {
  const slug = canonicalCategorySlug(value);
  return slug ? CATEGORY_OPTIONS.find((option) => option.slug === slug)?.label ?? null : null;
}

export function normalizeExerciseCategories(exercise: ExerciseCategoryContext & {
  category?: string | null;
  categories?: string[] | null;
}): ExerciseCategorySlug[] {
  // An explicit selection, including [], supersedes all legacy clues.
  const raw = exercise.categories == null
    ? [exercise.category, exercise.muscle_group]
    : Array.isArray(exercise.categories) ? exercise.categories : [exercise.categories];
  return [...new Set(raw.flatMap((category) => {
    const normalized = canonicalCategorySlug(category, exercise);
    return normalized ? [normalized] : [];
  }))];
}

export function normalizeExerciseTargets(targets: ExerciseTargetInput[]): NormalizedExerciseTarget[] {
  const bySlug = new Map<ExerciseMuscleSlug, NormalizedExerciseTarget>();
  for (const target of targets) {
    const slug = canonicalMuscleSlug(target.muscle_group_name ?? target.muscle_group);
    if (!slug) continue;
    let weight: 1 | 0.5;
    try {
      weight = fixedTargetWeight({
        role: target.role,
        isPrimary: target.is_primary,
        volumePercentage: target.volume_percentage,
      });
    } catch {
      continue;
    }
    const role: ExerciseTargetRole = weight === 1 ? "primary" : "secondary";
    const normalized = {
      ...target,
      muscle_slug: slug,
      muscle_label: muscleLabel(slug) || slug,
      role,
      is_primary: role === "primary",
      volume_percentage: role === "primary" ? 100 : 50,
    } satisfies NormalizedExerciseTarget;
    const current = bySlug.get(slug);
    if (!current || normalized.role === "primary") bySlug.set(slug, normalized);
  }
  return [...bySlug.values()];
}

export function buildExerciseTargetRows(
  primaryMuscleGroupIds: string[],
  secondaryMuscleGroupIds: string[],
) {
  const primary = [...new Set(primaryMuscleGroupIds.filter(Boolean))];
  const primarySet = new Set(primary);
  const secondary = [...new Set(secondaryMuscleGroupIds.filter((id) => id && !primarySet.has(id)))];
  if (primary.length === 0 && secondary.length > 0) {
    throw new Error("Selecione ao menos um grupamento primário antes de adicionar secundários.");
  }
  return [
    ...primary.map((muscle_group_id) => ({
      muscle_group_id,
      role: "primary" as const,
      is_primary: true,
      volume_percentage: 100 as const,
    })),
    ...secondary.map((muscle_group_id) => ({
      muscle_group_id,
      role: "secondary" as const,
      is_primary: false,
      volume_percentage: 50 as const,
    })),
  ];
}
