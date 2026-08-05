export interface NutritionMealLike {
  meal?: string | null;
  time?: string | null;
  focus?: string | null;
  eat?: string[] | null;
  go_easy?: string[] | null;
  note?: string | null;
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

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function normalizeUnits(value: string): string {
  return value
    .replace(/(\d)\s*(ml|mg|kg|kcal|g)\b/gi, (_, number: string, unit: string) => `${number} ${unit.toLowerCase()}`)
    .replace(/\b(ml|mg|kg|kcal)\b/gi, (unit) => unit.toLowerCase());
}

export function humanizeNutritionText(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "";

  const letters = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) ?? [];
  const uppercase = text.match(/[A-ZÀ-ÖØ-Þ]/g) ?? [];
  const shouting = letters.length >= 4 && uppercase.length / letters.length > 0.72;
  const readable = shouting
    ? text.toLocaleLowerCase("pt-BR").replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"))
    : text;

  return normalizeUnits(readable);
}

export function normalizeNutritionMealLabel(value: unknown, index = 0): string {
  const text = cleanText(value).replace(/[:\-–—]+$/, "");
  for (const [pattern, label] of MEAL_LABELS) {
    if (pattern.test(text)) return label;
  }
  if (!text || GENERIC_MEAL_RE.test(text)) return `Refeição ${index + 1}`;
  return humanizeNutritionText(text);
}

function embeddedMealLabel(value: string): string | null {
  const text = cleanText(value).replace(/[:\-–—]+$/, "");
  for (const [pattern, label] of MEAL_LABELS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function classifyImportedItem(value: string): ImportedNutritionItem | null {
  const raw = cleanText(value);
  if (!raw || PLAN_TITLE_RE.test(raw)) return null;
  if (/^ou[.:]?$/i.test(raw)) return { kind: "separator", text: "ou" };

  const text = humanizeNutritionText(raw);
  if (STANDALONE_CONTEXT_RE.test(raw) || SECTION_HEADING_RE.test(raw)) {
    return { kind: "heading", text: text.replace(/[:.]$/, "") };
  }

  const commaCount = (raw.match(/,/g) ?? []).length;
  const isLong = text.length > 72 || commaCount >= 3;
  return { kind: isLong ? "detail" : "choice", text };
}

function cleanOverview(values: string[]): string[] {
  return values
    .filter((value) => !PLAN_TITLE_RE.test(cleanText(value)))
    .filter((value) => !STANDALONE_CONTEXT_RE.test(cleanText(value)))
    .map(humanizeNutritionText)
    .filter(Boolean);
}

export function prepareImportedNutritionPlan(meals: NutritionMealLike[] | null | undefined): ImportedNutritionDisplay {
  const source = Array.isArray(meals) ? meals.filter(Boolean) : [];
  const overview: string[] = [];
  const prepared: ImportedNutritionMeal[] = [];

  source.forEach((meal, index) => {
    const rawItems = Array.isArray(meal.eat) ? meal.eat.map(cleanText).filter(Boolean) : [];
    const currentLabel = normalizeNutritionMealLabel(meal.meal, index);
    const isGeneric = GENERIC_MEAL_RE.test(cleanText(meal.meal)) || /^Refei[cç][aã]o\s+\d+$/i.test(currentLabel);
    const embeddedIndex = isGeneric ? rawItems.findIndex((item) => embeddedMealLabel(item) !== null) : -1;

    const nextMealHasExplicitLabel = source[index + 1]
      ? embeddedMealLabel(cleanText(source[index + 1]?.meal)) !== null
      : false;
    if (isGeneric && embeddedIndex < 0 && index === 0 && nextMealHasExplicitLabel) {
      overview.push(...cleanOverview(rawItems));
      return;
    }

    let label = currentLabel;
    let items = rawItems;
    if (embeddedIndex >= 0) {
      overview.push(...cleanOverview(rawItems.slice(0, embeddedIndex)));
      label = embeddedMealLabel(rawItems[embeddedIndex]) || currentLabel;
      items = rawItems.slice(embeddedIndex + 1);
    }

    const displayItems = items.map(classifyImportedItem).filter((item): item is ImportedNutritionItem => item !== null);
    if (!displayItems.length && !label) return;

    const genericFocus = /card[aá]pio informado pelo nutricionista/i.test(String(meal.focus || ""));
    prepared.push({
      meal: label,
      time: cleanText(meal.time) || null,
      focus: genericFocus ? null : humanizeNutritionText(meal.focus),
      items: displayItems,
    });
  });

  return { overview: Array.from(new Set(overview)), meals: prepared };
}
