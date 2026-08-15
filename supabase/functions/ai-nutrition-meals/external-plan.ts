export const MAX_EXTERNAL_TEXT_LENGTH = 200_000;

export const externalMealHeaderRe = /^(caf[eé]\s+da\s+manh[aã]|caf[eé]|desjejum|cola[cç][aã]o|lanche(?:\s+da\s+(?:manh[aã]|tarde))?|almo[cç]o|jantar|ceia|pr[eé][\s-]?treino|p[oó]s[\s-]?treino|refei[cç][aã]o\s*\d+|\d+[ªa]?\s*refei[cç][aã]o)(?=\s|:|-|$)[:\-\s]*/i;
const externalTimeRe = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/;

export interface ExternalNutritionMeal {
  meal: string;
  source_header: string | null;
  time: string | null;
  focus: string;
  eat: string[];
  go_easy: string[];
  note: string | null;
  source_lines: string[];
}

export interface ExternalNutritionTargets {
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  water_ml: number | null;
  water_ml_per_kg: number | null;
}

export interface ExternalNutritionDocument {
  parser_version: "nutritionist-pdf-v2";
  raw_text: string;
  source_file_name: string | null;
  lines: string[];
  overview: string[];
  meals: ExternalNutritionMeal[];
  targets: ExternalNutritionTargets;
  target_evidence: Partial<Record<keyof ExternalNutritionTargets, string>>;
}

function preserveExternalText(value: string) {
  return String(value || "").replace(/\0/g, "");
}

function normalizeTime(value: string) {
  const match = value.match(externalTimeRe);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function displayMealLabel(value: string, index: number) {
  const text = value.replace(/[:\-–—\s]+$/, "").trim();
  const known: Array<[RegExp, string]> = [
    [/^(caf[eé]\s+da\s+manh[aã]|caf[eé]|desjejum)$/i, "Café da manhã"],
    [/^cola[cç][aã]o$/i, "Colação"],
    [/^almo[cç]o$/i, "Almoço"],
    [/^lanche(?:\s+da\s+(?:manh[aã]|tarde))?$/i, text],
    [/^pr[eé][\s-]?treino$/i, "Pré-treino"],
    [/^p[oó]s[\s-]?treino$/i, "Pós-treino"],
    [/^jantar$/i, "Jantar"],
    [/^ceia$/i, "Ceia"],
  ];
  for (const [pattern, label] of known) {
    if (pattern.test(text)) return label;
  }
  return text || `Refeição ${index + 1}`;
}

function parseDecimal(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type TargetExtraction = {
  targets: ExternalNutritionTargets;
  evidence: Partial<Record<keyof ExternalNutritionTargets, string>>;
};

const DAILY_TARGET_CUE_RE = /\b(meta|totais?|objetivo|valor\s+di[aá]rio|ao\s+dia|por\s+dia|di[aá]ri[oa]s?|\/\s*dia)\b/i;
const FOOD_PORTION_TAIL_RE = /^\s*(?:de|do|da)\s+[a-zà-ÿ]/i;

function metricFromLines(
  lines: string[],
  pattern: RegExp,
  compactPattern: RegExp,
): { value: number | null; evidence: string | null } {
  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    const rawValue = match.slice(1).find((value) => Boolean(value));
    const parsed = rawValue ? parseDecimal(rawValue) : null;
    if (parsed == null) continue;
    const tail = line.slice((match.index ?? 0) + match[0].length);
    // "PROTEÍNA: 120G DE FRANGO" descreve uma porção, não a meta proteica diária.
    if (FOOD_PORTION_TAIL_RE.test(tail)) continue;
    if (DAILY_TARGET_CUE_RE.test(line) || compactPattern.test(line.trim())) {
      return { value: parsed, evidence: line };
    }
  }
  return { value: null, evidence: null };
}

function extractTargetsWithEvidence(rawText: string): TargetExtraction {
  const lines = preserveExternalText(rawText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const number = "(\\d+(?:[.,]\\d+)?)";
  const calories = metricFromLines(
    lines,
    new RegExp(`${number}\\s*kcal\\b`, "i"),
    /^(?:(?:valor\s+energ[eé]tico|energia|calorias?|meta)\s*[-:=]?\s*)?\d+(?:[.,]\d+)?\s*kcal(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const protein = metricFromLines(
    lines,
    new RegExp(`prote[ií]nas?\\s*[-:=]?\\s*${number}\\s*g\\b`, "i"),
    /^prote[ií]nas?\s*[-:=]?\s*\d+(?:[.,]\d+)?\s*g(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const carbs = metricFromLines(
    lines,
    new RegExp(`(?:carboidratos?|carbo)\\s*[-:=]?\\s*${number}\\s*g\\b`, "i"),
    /^(?:carboidratos?|carbo)\s*[-:=]?\s*\d+(?:[.,]\d+)?\s*g(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const fat = metricFromLines(
    lines,
    new RegExp(`(?:gorduras?|lip[ií]dios?)\\s*[-:=]?\\s*${number}\\s*g\\b`, "i"),
    /^(?:gorduras?|lip[ií]dios?)\s*[-:=]?\s*\d+(?:[.,]\d+)?\s*g(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const fiber = metricFromLines(
    lines,
    new RegExp(`fibras?\\s*[-:=]?\\s*${number}\\s*g\\b`, "i"),
    /^fibras?\s*[-:=]?\s*\d+(?:[.,]\d+)?\s*g(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const waterPerKg = metricFromLines(
    lines,
    new RegExp(`${number}\\s*ml\\s*(?:\\/|por|para\\s+cada)\\s*(?:kg|quilo)`, "i"),
    /^\D*\d+(?:[.,]\d+)?\s*ml\s*(?:\/|por|para\s+cada)\s*(?:kg|quilo)\D*$/i,
  );
  const waterLiters = metricFromLines(
    lines,
    new RegExp(`(?:[aá]gua|hidrata[cç][aã]o)[^\\d]{0,24}${number}\\s*(?:l|litros?)\\b|${number}\\s*(?:l|litros?)\\s+(?:de\\s+)?[aá]gua\\b`, "i"),
    /^(?:[aá]gua|hidrata[cç][aã]o)\s*[-:=]?\s*\d+(?:[.,]\d+)?\s*(?:l|litros?)(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const waterMl = metricFromLines(
    lines,
    new RegExp(`(?:[aá]gua|hidrata[cç][aã]o)[^\\d]{0,24}${number}\\s*ml\\b|${number}\\s*ml\\s+(?:de\\s+)?[aá]gua\\b`, "i"),
    /^(?:[aá]gua|hidrata[cç][aã]o)\s*[-:=]?\s*\d+(?:[.,]\d+)?\s*ml(?:\s*(?:\/|por)\s*dia)?$/i,
  );
  const absoluteWater = waterMl.value ?? (waterLiters.value != null ? Math.round(waterLiters.value * 1000) : null);
  const absoluteWaterEvidence = waterMl.evidence ?? waterLiters.evidence;
  const evidence: TargetExtraction["evidence"] = {};
  const extracted = {
    calories_kcal: calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    water_ml_per_kg: waterPerKg,
  } as const;
  for (const [key, metric] of Object.entries(extracted) as Array<[keyof typeof extracted, { value: number | null; evidence: string | null }]>) {
    if (metric.evidence) evidence[key] = metric.evidence;
  }
  if (absoluteWaterEvidence) evidence.water_ml = absoluteWaterEvidence;
  return {
    targets: {
      calories_kcal: calories.value,
      protein_g: protein.value,
      carbs_g: carbs.value,
      fat_g: fat.value,
      fiber_g: fiber.value,
      water_ml: absoluteWater,
      water_ml_per_kg: waterPerKg.value,
    },
    evidence,
  };
}

export function extractExternalNutritionTargets(rawText: string): ExternalNutritionTargets {
  return extractTargetsWithEvidence(rawText).targets;
}

function stripHeaderFromLine(line: string, header: RegExpMatchArray) {
  return line.slice((header.index ?? 0) + header[0].length).trim();
}

export function parseExternalDietText(rawText: string, _expectedMeals = 0): ExternalNutritionMeal[] {
  const raw = preserveExternalText(rawText);
  if (raw.length > MAX_EXTERNAL_TEXT_LENGTH) {
    throw new Error(`O documento excede o limite de ${MAX_EXTERNAL_TEXT_LENGTH} caracteres.`);
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const meals: ExternalNutritionMeal[] = [];
  let current: { label: string; header: string | null; time: string | null; lines: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const sourceLines = current.lines.filter(Boolean);
    meals.push({
      meal: current.label,
      source_header: current.header,
      time: current.time,
      focus: "Prescrição do nutricionista",
      eat: sourceLines,
      go_easy: [],
      note: null,
      source_lines: sourceLines,
    });
  };

  for (const line of lines) {
    const header = line.match(externalMealHeaderRe);
    if (header) {
      pushCurrent();
      const remainder = stripHeaderFromLine(line, header);
      current = {
        label: displayMealLabel(header[1], meals.length),
        header: line,
        time: normalizeTime(line),
        lines: remainder ? [remainder] : [],
      };
      continue;
    }

    if (!current) {
      current = { label: "Cardápio completo", header: null, time: normalizeTime(line), lines: [] };
    }
    current.lines.push(line);
    if (!current.time) current.time = normalizeTime(line);
  }
  pushCurrent();
  return meals;
}

export function buildExternalNutritionDocument(rawText: string, sourceFileName?: string | null): ExternalNutritionDocument {
  const raw = preserveExternalText(rawText);
  const meals = parseExternalDietText(raw);
  const rawLines = raw.split(/\r?\n/);
  const firstMealLine = meals.length > 0
    ? rawLines.findIndex((line) => externalMealHeaderRe.test(line.trim()))
    : -1;
  const allLines = rawLines.map((line) => line.trim()).filter(Boolean);
  const overview = firstMealLine > 0
    ? rawLines.slice(0, firstMealLine).map((line) => line.trim()).filter(Boolean)
    : [];
  const targetExtraction = extractTargetsWithEvidence(raw);

  return {
    parser_version: "nutritionist-pdf-v2",
    raw_text: raw,
    source_file_name: sourceFileName?.trim().slice(0, 240) || null,
    lines: allLines,
    overview,
    meals,
    targets: targetExtraction.targets,
    target_evidence: targetExtraction.evidence,
  };
}

// Mantém compatibilidade com o contrato legado da edge sem truncar o conteúdo.
export function sanitizeExternalMeals(meals: ReturnType<typeof parseExternalDietText>) {
  return meals.map((meal) => ({
    ...meal,
    eat: [...meal.eat],
    go_easy: [...meal.go_easy],
    source_lines: [...meal.source_lines],
  }));
}
