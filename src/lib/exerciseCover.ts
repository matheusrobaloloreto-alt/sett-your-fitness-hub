import {
  CATEGORY_OPTIONS,
  canonicalCategorySlug,
  muscleLabel,
  normalizeExerciseCategories as normalizeTaxonomyCategories,
} from "@/lib/exerciseTaxonomy";

// Capa (thumbnail) do exercício + categorias do seletor estilo Mywellness.

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([0-9A-Za-z_-]{11})/;

export function youtubeIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(YT_RE);
  return m ? m[1] : null;
}

/**
 * URL da "capa" do exercício — SEMPRE do vídeo que realmente vai tocar.
 * Ordem: (1) thumbnail_url oficial (ex.: MFIT manda o .jpg do próprio .mp4);
 *        (2) se o vídeo que toca é do YouTube, a thumb dele;
 *        (3) só usa youtube_video_id quando NÃO há vídeo próprio (aí o YT é o vídeo).
 * Regra: nunca mostrar capa de um vídeo diferente do que o play abre — melhor sem capa.
 */
export function exerciseThumb(ex: {
  youtube_video_id?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  video_path?: string | null;
}): string | null {
  if (ex.thumbnail_url) return ex.thumbnail_url;

  const idFromPlayingUrl = youtubeIdFromUrl(ex.video_url);
  if (idFromPlayingUrl) return `https://i.ytimg.com/vi/${idFromPlayingUrl}/hqdefault.jpg`;

  // Vídeo próprio (mp4/upload) sem capa cadastrada: não inventar thumb do YouTube.
  if (ex.video_url || ex.video_path) return null;

  return ex.youtube_video_id ? `https://i.ytimg.com/vi/${ex.youtube_video_id}/hqdefault.jpg` : null;
}

export type ExerciseCategory = {
  id: string;
  label: string;
  /** dica curta exibida no chip ativo */
  hint?: string;
};

export function normalizeExerciseCategory(
  value: unknown,
  exercise: { name?: string | null; description?: string | null; muscle_group?: string | null } = {},
): string | null {
  return canonicalCategorySlug(value, exercise);
}

export function normalizedExerciseCategories(exercise: {
  category?: string | null;
  categories?: string[] | null;
  name?: string | null;
  description?: string | null;
  muscle_group?: string | null;
}): string[] {
  return normalizeTaxonomyCategories(exercise);
}

export function normalizedExerciseLibraryGroup(exercise: {
  muscle_group?: string | null;
  name?: string | null;
  description?: string | null;
}): string | null {
  const raw = String(exercise.muscle_group ?? "").trim();
  if (!raw) return null;
  return muscleLabel(raw) ?? categoryLabelFor(raw, exercise) ?? raw;
}

// Filtros canônicos. IDs legados são normalizados no cliente até a migration ser aplicada.
export const EXERCISE_CATEGORIES: ExerciseCategory[] = CATEGORY_OPTIONS.map((category) => ({
  id: category.slug,
  label: category.label,
}));

function categoryLabelFor(
  value: unknown,
  exercise: { name?: string | null; description?: string | null; muscle_group?: string | null } = {},
): string | null {
  const slug = canonicalCategorySlug(value, exercise);
  return slug ? EXERCISE_CATEGORIES.find((item) => item.id === slug)?.label ?? null : null;
}
