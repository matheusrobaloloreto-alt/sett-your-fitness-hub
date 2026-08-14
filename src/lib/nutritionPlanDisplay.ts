export interface NutritionMealLike {
  meal?: string | null;
  source_header?: string | null;
  source_lines?: string[] | null;
  time?: string | null;
  focus?: string | null;
  eat?: string[] | null;
  go_easy?: string[] | null;
  note?: string | null;
}

export interface ExternalNutritionDocumentLike {
  parser_version?: string | null;
  raw_text?: string | null;
  source_file_name?: string | null;
  lines?: string[] | null;
  overview?: string[] | null;
  meals?: NutritionMealLike[] | null;
  targets?: {
    calories_kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    fiber_g?: number | null;
    water_ml?: number | null;
    water_ml_per_kg?: number | null;
  } | null;
  target_evidence?: Partial<Record<
    "calories_kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "water_ml" | "water_ml_per_kg",
    string
  >> | null;
}

export interface NutritionPlanCandidate {
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
}

export type ImportedNutritionItemKind = "choice" | "detail" | "heading" | "separator";

export interface ImportedNutritionItem {
  kind: ImportedNutritionItemKind;
  text: string;
}

export interface ImportedNutritionMeal {
  meal: string;
  time: string | null;
  focus: string | null;
  items: ImportedNutritionItem[];
}

export interface ImportedNutritionDisplay {
  overview: string[];
  meals: ImportedNutritionMeal[];
  sourceFileName: string | null;
  rawText: string | null;
}

const MEAL_LABELS: Array<[RegExp, string]> = [
  [/^(caf[eé]\s+da\s+manh[aã]|caf[eé]|desjejum)$/i, "Café da manhã"],
  [/^(cola[cç][aã]o)$/i, "Colação"],
  [/^(almo[cç]o)$/i, "Almoço"],
  [/^(lanche(?:\s+da\s+(?:manh[aã]|tarde))?)$/i, "Lanche"],
  [/^(pr[eé][\s-]?treino)$/i, "Pré-treino"],
  [/^(p[oó]s[\s-]?treino)$/i, "Pós-treino"],
  [/^(jantar)$/i, "Jantar"],
  [/^(ceia)$/i, "Ceia"],
];

const GENERIC_MEAL_RE = /^(refei[cç][aã]o\s*\d+|\d+[ªa]?\s*refei[cç][aã]o)$/i;
const PLAN_TITLE_RE = /^plano\s+alimentar\b/i;
const STANDALONE_CONTEXT_RE = /^(diariamente|ao longo do dia|op[cç][aã]o(?:\s+\d+)?|alternativa(?:\s+\d+)?)[:.]?$/i;
const SECTION_HEADING_RE = /^(fontes?\s+de\s+|prote[ií]na\s+e\s+carboidrato|escolher\s+uma|intermedi[aá]rio|substitui[cç][oõ]es|observa[cç][oõ]es|orienta[cç][oõ]es)/i;

// Preserva o conteúdo clínico. Só remove espaços de borda inseridos pela extração do PDF.
function sourceText(value: unknown): string {
  return String(value ?? "").trim();
}

// Mantida para consumidores legados, agora sem alterar caixa, unidades ou pontuação.
export function humanizeNutritionText(value: unknown): string {
  return sourceText(value);
}

export function normalizeNutritionMealLabel(value: unknown, index = 0): string {
  const text = sourceText(value).replace(/[:\-–—]+$/, "").trim();
  for (const [pattern, label] of MEAL_LABELS) {
    if (pattern.test(text)) return label;
  }
  if (!text || GENERIC_MEAL_RE.test(text)) return `Refeição ${index + 1}`;
  return text;
}

function embeddedMealLabel(value: string): string | null {
  const text = sourceText(value).replace(/[:\-–—]+$/, "").trim();
  for (const [pattern, label] of MEAL_LABELS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function classifyImportedItem(value: string): ImportedNutritionItem | null {
  const text = sourceText(value);
  if (!text || PLAN_TITLE_RE.test(text)) return null;
  if (/^ou[.:]?$/i.test(text)) return { kind: "separator", text };
  if (STANDALONE_CONTEXT_RE.test(text) || SECTION_HEADING_RE.test(text)) {
    return { kind: "heading", text };
  }
  const commaCount = (text.match(/,/g) ?? []).length;
  return { kind: text.length > 72 || commaCount >= 3 ? "detail" : "choice", text };
}

function cleanOverview(values: string[]): string[] {
  return values.map(sourceText).filter(Boolean).filter((value) => !PLAN_TITLE_RE.test(value));
}

function planDateRank(value?: string | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Define o plano vigente sem depender da ordem incidental da query:
 * status ativo + janela de datas contendo hoje; se houver duplicidade, vence
 * a data de início mais recente e depois o registro mais novo. Registros sem
 * status só entram como compatibilidade legada quando nenhum ativo é elegível.
 */
export function selectCurrentNutritionPlan<T extends NutritionPlanCandidate>(
  plans: T[] | null | undefined,
  today: string,
): T | null {
  const rows = (Array.isArray(plans) ? plans : []).filter(Boolean);
  const inDateWindow = (plan: T) =>
    (!plan.start_date || plan.start_date <= today) && (!plan.end_date || plan.end_date >= today);
  const byCurrentPriority = (a: T, b: T) =>
    planDateRank(b.start_date).localeCompare(planDateRank(a.start_date)) ||
    planDateRank(b.created_at).localeCompare(planDateRank(a.created_at));
  const active = rows
    .filter((plan) => /^(active|ativo)$/i.test(String(plan.status || "")) && inDateWindow(plan))
    .sort(byCurrentPriority);
  if (active.length) return active[0];
  const legacy = rows
    .filter((plan) => !plan.status && inDateWindow(plan))
    .sort(byCurrentPriority);
  return legacy[0] ?? null;
}

export function prepareImportedNutritionPlan(
  meals: NutritionMealLike[] | null | undefined,
  sourceDocument?: ExternalNutritionDocumentLike | null,
): ImportedNutritionDisplay {
  const documentMeals = Array.isArray(sourceDocument?.meals) ? sourceDocument.meals : null;
  const source = (documentMeals || (Array.isArray(meals) ? meals : [])).filter(Boolean);
  const overview = Array.isArray(sourceDocument?.overview)
    ? cleanOverview(sourceDocument.overview)
    : [];
  const prepared: ImportedNutritionMeal[] = [];

  source.forEach((meal, index) => {
    const preservedLines = Array.isArray(meal.source_lines) && meal.source_lines.length
      ? meal.source_lines
      : Array.isArray(meal.eat) ? meal.eat : [];
    const rawItems = preservedLines.map(sourceText).filter(Boolean);
    const currentLabel = normalizeNutritionMealLabel(meal.meal, index);
    const isGeneric = GENERIC_MEAL_RE.test(sourceText(meal.meal)) || /^Refei[cç][aã]o\s+\d+$/i.test(currentLabel);
    const embeddedIndex = isGeneric ? rawItems.findIndex((item) => embeddedMealLabel(item) !== null) : -1;

    let label = currentLabel;
    let items = rawItems;
    if (embeddedIndex >= 0) {
      if (!sourceDocument?.overview) overview.push(...cleanOverview(rawItems.slice(0, embeddedIndex)));
      label = embeddedMealLabel(rawItems[embeddedIndex]) || currentLabel;
      items = rawItems.slice(embeddedIndex + 1);
    }

    const displayItems = items.map(classifyImportedItem).filter((item): item is ImportedNutritionItem => item !== null);
    prepared.push({
      meal: label,
      time: sourceText(meal.time) || null,
      focus: meal.focus && !/(?:prescri[cç][aã]o|card[aá]pio) (?:do|informado pelo) nutricionista/i.test(meal.focus)
        ? sourceText(meal.focus)
        : null,
      items: displayItems,
    });
  });

  return {
    overview,
    meals: prepared,
    sourceFileName: sourceText(sourceDocument?.source_file_name) || null,
    rawText: typeof sourceDocument?.raw_text === "string" ? sourceDocument.raw_text : null,
  };
}
