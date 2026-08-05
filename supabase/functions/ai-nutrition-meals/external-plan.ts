const MAX_EXTERNAL_TEXT_LENGTH = 24_000;

export const externalMealHeaderRe = /^(café\s+da\s+manhã|cafe\s+da\s+manha|café|cafe|desjejum|colação|colacao|lanche(?:\s+da\s+(?:manhã|manha|tarde))?|almoço|almoco|jantar|ceia|pré[\s-]?treino|pre[\s-]?treino|pós[\s-]?treino|pos[\s-]?treino|refei[cç][aã]o\s*\d+|\d+[ªa]?\s*refei[cç][aã]o)(?=\s|:|-|$)[:\-\s]*/i;
const externalTimeRe = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/;

function cleanExternalText(value: string) {
  return (value || "")
    .replace(/[^\x20-\x7EÀ-ſ\n]/g, "")
    .slice(0, MAX_EXTERNAL_TEXT_LENGTH);
}

function normalizeTime(value: string) {
  const match = value.match(externalTimeRe);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function normalizeMealLabel(value: string, index: number) {
  const normalized = value
    .replace(/^cafe\s+da\s+manha$/i, "Café da manhã")
    .replace(/^café\s+da\s+manhã$/i, "Café da manhã")
    .replace(/^cafe$/i, "Café da manhã")
    .replace(/^café$/i, "Café da manhã")
    .replace(/^almoco$/i, "Almoço")
    .replace(/^pre[\s-]?treino$/i, "Pré-treino")
    .replace(/^pos[\s-]?treino$/i, "Pós-treino")
    .trim();
  return normalized ? normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1).toLocaleLowerCase("pt-BR") : `Refeição ${index + 1}`;
}

export function parseExternalDietText(rawText: string, expectedMeals: number) {
  const lines = cleanExternalText(rawText)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);
  const meals: Array<{ meal: string; time: string | null; focus: string; eat: string[]; go_easy: string[]; note: string }> = [];
  let current: { meal: string; time: string | null; items: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const items = current.items
      .map((item) => item.replace(externalMealHeaderRe, "").replace(externalTimeRe, "").replace(/^[\s:–—-]+/, "").trim())
      .filter(Boolean);
    meals.push({
      meal: current.meal,
      time: current.time,
      focus: "Cardápio informado pelo nutricionista",
      eat: items.length ? items : ["seguir o cardápio prescrito"],
      go_easy: [],
      note: "Siga as quantidades e substituições combinadas com seu nutricionista.",
    });
  };

  for (const line of lines) {
    const header = line.match(externalMealHeaderRe);
    if (header) {
      pushCurrent();
      current = {
        meal: normalizeMealLabel(header[1], meals.length),
        time: normalizeTime(line),
        items: [line.replace(header[0], "").trim()].filter(Boolean),
      };
      continue;
    }
    if (current) {
      current.items.push(line);
      if (!current.time) current.time = normalizeTime(line);
    } else {
      current = { meal: `Refeição ${meals.length + 1}`, time: normalizeTime(line), items: [line] };
    }
  }
  pushCurrent();

  if (meals.length <= 1 && lines.length > 1) {
    const target = Math.min(Math.max(Number(expectedMeals) || 3, 1), 8);
    const chunkSize = Math.max(1, Math.ceil(lines.length / target));
    return Array.from({ length: Math.min(target, Math.ceil(lines.length / chunkSize)) }).map((_, index) => {
      const chunk = lines.slice(index * chunkSize, index * chunkSize + chunkSize);
      return {
        meal: `Refeição ${index + 1}`,
        time: normalizeTime(chunk.join(" ")),
        focus: "Cardápio informado pelo nutricionista",
        eat: chunk.map((item) => item.replace(externalTimeRe, "").trim()).filter(Boolean),
        go_easy: [],
        note: "Siga as quantidades e substituições combinadas com seu nutricionista.",
      };
    });
  }

  return meals;
}

export function sanitizeExternalMeals(meals: ReturnType<typeof parseExternalDietText>) {
  return meals.slice(0, 10).map((meal, index) => ({
    meal: typeof meal?.meal === "string" ? meal.meal.slice(0, 80) : `Refeição ${index + 1}`,
    time: typeof meal?.time === "string" ? meal.time.slice(0, 12) : null,
    focus: typeof meal?.focus === "string" ? meal.focus.slice(0, 180) : null,
    eat: Array.isArray(meal?.eat)
      ? meal.eat.filter((item) => typeof item === "string" && item.trim()).slice(0, 32).map((item) => item.slice(0, 260))
      : [],
    go_easy: Array.isArray(meal?.go_easy)
      ? meal.go_easy.filter((item) => typeof item === "string" && item.trim()).slice(0, 12).map((item) => item.slice(0, 160))
      : [],
    note: typeof meal?.note === "string" ? meal.note.slice(0, 240) : null,
  }));
}
