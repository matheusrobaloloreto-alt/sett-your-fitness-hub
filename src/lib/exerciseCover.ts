import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";

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

const normalizeCategoryId = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const physiotherapyReplacement = (exercise: {
  name?: string | null;
  description?: string | null;
  muscle_group?: string | null;
}) => {
  const text = normalizeCategoryId(`${exercise.name ?? ""} ${exercise.description ?? ""} ${exercise.muscle_group ?? ""}`)
    .replace(/_/g, " ");
  if (/salto|jump|hop|bound|drop|pliometr|arremesso|slam|rebote|aterriss/.test(text)) return "pliometria";
  if (/mobil|along|libera|foam|amplitude|rotacao articular/.test(text)) return "mobilidade";
  if (/prancha|abdom|pallof|bird dog|dead bug/.test(text)) return "core";
  if (/mini band|thera band|ativ|isometr/.test(text)) return "ativacao";
  if (/maquina|polia|leg press|cadeira|mesa flexora/.test(text)) return "maquinas";
  if (/halter|barra|kettlebell|anilha/.test(text)) return "pesos_livres";
  if (/agach|terra|levantamento|supino|remada|puxada/.test(text)) return "base";
  return "funcionais";
};

export function normalizeExerciseCategory(
  value: unknown,
  exercise: { name?: string | null; description?: string | null; muscle_group?: string | null } = {},
): string | null {
  const id = normalizeCategoryId(value);
  if (!id) return null;
  if (["controle_motor", "funcional", "funcionais"].includes(id)) return "funcionais";
  if (id === "performance") return "pliometria";
  if (["fisioterapia", "fisio"].includes(id)) return physiotherapyReplacement(exercise);
  return id;
}

export function normalizedExerciseCategories(exercise: {
  category?: string | null;
  categories?: string[] | null;
  name?: string | null;
  description?: string | null;
  muscle_group?: string | null;
}): string[] {
  const raw = exercise.categories?.length
    ? exercise.categories
    : exercise.category
      ? [exercise.category]
      : [];
  return [...new Set(raw.flatMap((category) => {
    const normalized = normalizeExerciseCategory(category, exercise);
    return normalized ? [normalized] : [];
  }))];
}

export function normalizedExerciseLibraryGroup(exercise: {
  muscle_group?: string | null;
  name?: string | null;
  description?: string | null;
}): string | null {
  const raw = String(exercise.muscle_group ?? "").trim();
  const id = normalizeCategoryId(raw);
  if (!id) return null;
  if (["controle_motor", "funcional", "funcionais"].includes(id)) return "Funcionais";
  if (id === "performance") return "Pliometria";
  if (["fisioterapia", "fisio"].includes(id)) {
    const category = physiotherapyReplacement(exercise);
    return EXERCISE_CATEGORIES.find((item) => item.id === category)?.label ?? "Funcionais";
  }
  return canonicalAnatomicalMuscleGroup(raw) ?? raw;
}

// Filtros canônicos. IDs legados são normalizados no cliente até a migration ser aplicada.
export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  { id: "mobilidade", label: "Mobilidade", hint: "mobilidade, estabilidade, foam roll" },
  { id: "funcionais", label: "Funcionais", hint: "controle motor, estabilidade, propriocepção" },
  { id: "ativacao", label: "Ativação", hint: "mini band, tera band" },
  { id: "core", label: "Core" },
  { id: "base", label: "Base", hint: "agachamento, terra…" },
  { id: "pesos_livres", label: "Pesos Livres" },
  { id: "peso_corporal", label: "Peso Corporal" },
  { id: "maquinas", label: "Máquinas" },
  { id: "pliometria", label: "Pliometria" },
];
