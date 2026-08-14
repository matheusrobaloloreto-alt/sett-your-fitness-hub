// nutritionEngine.ts — Motor DETERMINÍSTICO de nutrição (metodologia BN Nutri).
// Porta o que vivia no SYSTEM_PROMPT: TMB (Mifflin-St Jeor; Katch-McArdle se %gordura),
// GET por fator de atividade, macros por objetivo, carb cycling, hidratação, pisos de segurança.
// Saída 100% completa e enviável SEM IA (inclui plano de refeições determinístico).

export interface NutritionInput {
  student_name?: string;
  age?: number | string | null;
  gender?: string | null;
  weight_kg?: number | string | null;
  height_cm?: number | string | null;
  body_fat_percent?: number | string | null;
  objective?: string | null; // emagrecimento | hipertrofia | performance
  activity_level?: string | null; // sedentario | leve | moderado | muito_ativo | extremo
  is_endurance_athlete?: boolean | null;
  training_modality?: string | null;
  meals_per_day?: number | string | null;
  food_restrictions?: string | null;
  budget?: string | null;
  has_microwave?: boolean | string | null;
  training_hours_per_day?: number | string | null;
  stress_score?: number | string | null;
  sleep_quality?: number | string | null;
  nutrition_context?: string | null;
  running_plan_context?: unknown;
  strength_plan_context?: unknown;
  prescription_integration?: unknown;
  anamnese_context?: Record<string, unknown> | null;
  block_number?: number | string | null;
  previous_plan_context?: NutritionPlan | null;
  program_sequence?: {
    sequence_number?: number | string | null;
    total_cycles?: number | string | null;
    start_date?: string | null;
    end_date?: string | null;
    phase?: string | null;
  } | null;
  [k: string]: unknown;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isNaN(n) ? NaN : n;
};
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

function isFemale(g?: string | null): boolean {
  const x = (g || "").toLowerCase();
  return /fem|mulher|female|^f$/.test(x);
}

const ACTIVITY: Record<string, number> = {
  sedentario: 1.2, leve: 1.375, moderado: 1.55, muito_ativo: 1.725, extremo: 1.9,
};

interface MacroProfile { proteinGkg: number; fatGkg: number; carbsGkg: number; adjPct: number }
function macroProfile(objective: string, endurance: boolean): MacroProfile {
  const o = (objective || "").toLowerCase();
  if (o.includes("emagre") || o.includes("estetic") || o.includes("perda")) {
    return { proteinGkg: 2.0, fatGkg: 0.9, carbsGkg: 3.0, adjPct: -20 };
  }
  if (o.includes("hipert") || o.includes("massa") || o.includes("ganho")) {
    return { proteinGkg: 1.9, fatGkg: 1.0, carbsGkg: endurance ? 6.0 : 5.0, adjPct: 10 };
  }
  // performance / manutenção
  return { proteinGkg: 1.8, fatGkg: 1.0, carbsGkg: endurance ? 7.0 : 5.0, adjPct: 0 };
}

export interface EnergySummary {
  tmb_kcal: number; get_kcal: number; target_kcal: number; deficit_surplus_percent: number;
  protein_g_per_kg: number; protein_total_g: number;
  carbs_g_per_kg: number; carbs_total_g: number;
  fat_g_per_kg: number; fat_total_g: number;
  hydration_ml: number; formula_used: string; calculation_notes: string;
}

export interface NutritionPlan {
  plan_name: string; objective: string;
  energy_summary: EnergySummary;
  total_calories: number; protein_g: number; carbs_g: number; fat_g: number;
  carb_cycling: any;
  nutrition_tips: any[];
  supplementation: any[];
  substitutions: any[];
  periodized_blocks: any[];
  meals: any[];
  pre_race_gi_protocol: string; intra_workout_protocol: string; rest_day_adjustments: string;
  general_notes: string; warnings: string[];
  program_sequence?: {
    sequence_number: number;
    total_cycles: number | null;
    phase: string;
    start_date: string | null;
    end_date: string | null;
    previous_plan_used: boolean;
  };
  generated_by: string;
}

// Extrai os horários reais informados na anamnese (campo nutrition_context: "Horários habituais: ...").
function parseMealTimes(ctx?: string | null): string[] {
  if (!ctx) return [];
  const seg = /hor[aá]rios? habituais?:([^|]+)/i.exec(ctx)?.[1] || "";
  return (seg.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).slice(0, 7);
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function buildMeals(
  mealsPerDay: number,
  restrictions: string,
  budget: string,
  hasMicrowave: boolean,
  times?: string[],
): any[] {
  const veg = includesAny(restrictions, ["vegetarian", "vegano", "vegan"]);
  const noEgg = includesAny(restrictions, ["ovo", "egg"]);
  const noDairy = includesAny(restrictions, ["lactose", "leite", "milk", "lácteo", "lacteo"]);
  const economical = includesAny(budget, ["econom", "baixo", "200", "300"]);
  const protein = veg
    ? ["tofu", noEgg ? "leguminosas" : "ovos", "leguminosas (feijão, lentilha, grão-de-bico)", noDairy ? "tofu" : "iogurte/queijo"]
    : [economical ? "frango ou ovos" : "frango", economical ? "ovos ou sardinha" : "peixe", economical ? "patinho ou frango" : "carne magra", noEgg ? "frango" : "ovos"];
  const breakfastProtein = noEgg ? (noDairy ? protein[0] : "iogurte") : "ovos";
  const portable = hasMicrowave ? "arroz/batata" : "sanduíche ou fruta com fonte de proteína";
  const base = [
    { meal: "Café da manhã", time: "07:00", focus: "Energia + proteína para começar o dia", eat: ["fruta", "aveia ou pão", breakfastProtein], go_easy: ["açúcar refinado"] },
    { meal: "Almoço", time: "12:30", focus: "Proteína + vegetais + carboidrato", eat: [protein[0], "vegetais variados", "arroz/batata", "feijão"], go_easy: ["frituras"] },
    { meal: "Lanche", time: "15:30", focus: "Energia prática para a rotina", eat: ["fruta", noDairy ? "castanhas" : "iogurte", "pão ou aveia"], go_easy: ["longos períodos sem comer"] },
    { meal: "Pré-treino", time: "17:00", focus: "Carboidrato para render no treino", eat: [portable, "banana"], go_easy: ["muita gordura", "muita fibra", "excesso de proteína"] },
    { meal: "Pós-treino", time: "19:00", focus: "Recuperação: proteína + carboidrato", eat: [protein[1] || protein[0], portable, "fruta"], go_easy: ["pular a refeição"] },
    { meal: "Jantar", time: "21:00", focus: "Proteína + vegetais (carboidrato leve)", eat: [protein[2] || protein[0], "legumes/salada", "porção menor de carbo"], go_easy: ["refeição muito pesada perto de dormir"] },
    { meal: "Ceia", time: "22:30", focus: "Algo leve com proteína", eat: [noDairy ? protein[3] : "iogurte", "castanhas"], go_easy: ["doces", "cafeína"] },
    { meal: "Refeição extra", time: "10:00", focus: "Complementar energia sem pesar", eat: ["fruta", portable], go_easy: ["ultraprocessados"] },
  ];
  const meals = base.slice(0, Math.min(Math.max(mealsPerDay || 5, 1), 8));
  // Usa os horários reais da anamnese quando informados (em vez de fixos).
  if (times && times.length) meals.forEach((m, i) => { if (times[i]) m.time = times[i]; });
  return meals;
}

function buildSupplements(): any[] {
  return [{
    supplement: "Suplementação individualizada",
    dose: "Somente conforme orientação de nutricionista ou médico",
    timing: "Conforme a prescrição profissional",
    reason: "Evitar doses automáticas sem histórico clínico, exames e avaliação profissional.",
  }];
}

function sequenceMeta(input: NutritionInput) {
  const sequenceNumber = Math.max(1, Math.round(num(input.program_sequence?.sequence_number ?? input.block_number)) || 1);
  const position = ((sequenceNumber - 1) % 4) + 1;
  const inferred = position === 1 ? "base" : position === 2 ? "acumulacao" : position === 3 ? "intensificacao" : "consolidacao";
  const requested = String(input.program_sequence?.phase || "").toLowerCase();
  const phase = /acumul/.test(requested) ? "acumulacao"
    : /intens/.test(requested) ? "intensificacao"
      : /(consol|deload|regener)/.test(requested) ? "consolidacao"
        : /base/.test(requested) ? "base" : inferred;
  return {
    sequence_number: sequenceNumber,
    total_cycles: Number(input.program_sequence?.total_cycles) || null,
    phase,
    start_date: input.program_sequence?.start_date || null,
    end_date: input.program_sequence?.end_date || null,
    previous_plan_used: Boolean(input.previous_plan_context),
  };
}

export function buildNutritionProgram(input: NutritionInput): NutritionPlan {
  const sequence = sequenceMeta(input);
  const kg = num(input.weight_kg) || 75;
  const cm = num(input.height_cm) || 172;
  const age = num(input.age) || 30;
  const female = isFemale(input.gender);
  const bf = num(input.body_fat_percent);
  const objective = String(input.objective || "performance");
  const loadContext = JSON.stringify({
    running: input.running_plan_context,
    strength: input.strength_plan_context,
    integration: input.prescription_integration,
    anamnese: input.anamnese_context,
  }).toLowerCase();
  const endurance = !!input.is_endurance_athlete || /corr|run|triat|cicl|bike|nata|swim/.test(`${input.training_modality || ""} ${loadContext}`.toLowerCase());
  const stress = num(input.stress_score);
  const sleep = num(input.sleep_quality);
  const trainingHours = Math.max(0, num(input.training_hours_per_day) || 0);
  const restrictions = String(input.food_restrictions || "").toLowerCase();
  const budget = String(input.budget || "moderado").toLowerCase();
  const hasMicrowave = input.has_microwave === true || String(input.has_microwave).toLowerCase() === "true";

  const assumptions: string[] = [];
  if (isNaN(num(input.weight_kg))) assumptions.push("peso");
  if (isNaN(num(input.height_cm))) assumptions.push("altura");
  if (isNaN(num(input.age))) assumptions.push("idade");

  // TMB
  let tmb: number; let formula: string;
  if (!isNaN(bf) && bf > 0 && bf < 70) {
    const lbm = kg * (1 - bf / 100);
    tmb = 370 + 21.6 * lbm; formula = "katch_mcardle";
  } else {
    tmb = 10 * kg + 6.25 * cm - 5 * age + (female ? -161 : 5); formula = "mifflin_st_jeor";
  }
  tmb = r0(tmb);

  const af = ACTIVITY[(input.activity_level || "").toLowerCase()] ?? 1.55;
  const get = r0(tmb * af);

  const prof = macroProfile(objective, endurance);
  let effectiveAdjPct = prof.adjPct;
  const lowReadiness = /low|baixa|vermelh|red.flag|recupera.{0,12}baixa|dor severa/.test(loadContext);
  if (stress >= 8 || (sleep > 0 && sleep < 5) || lowReadiness) {
    effectiveAdjPct = prof.adjPct < 0 ? Math.max(prof.adjPct, -10) : Math.min(prof.adjPct, 5);
  }
  let target = r0(get * (1 + effectiveAdjPct / 100));

  // Pisos de segurança (linhas vermelhas BN)
  const floor = female ? 1200 : 1500;
  const warnings: string[] = [];
  if (target < floor) { warnings.push(`Alvo calórico abaixo do piso de segurança — elevado para ${floor} kcal (mínimo ${female ? "feminino" : "masculino"}).`); target = floor; }

  // Macros: proteína e gordura por g/kg; carbo preenche o restante (com piso para endurance).
  const proteinTotal = r0(prof.proteinGkg * kg);
  const fatTotal = r0(prof.fatGkg * kg);
  let carbsTotal = r0((target - proteinTotal * 4 - fatTotal * 9) / 4);
  const carbFloor = r0((endurance ? 3.0 : 2.0) * kg);
  if (carbsTotal < carbFloor) {
    carbsTotal = carbFloor;
    target = proteinTotal * 4 + carbsTotal * 4 + fatTotal * 9; // recalcula p/ bater os macros
    warnings.push("Carboidrato ajustado para o piso (substrato mínimo) — alvo calórico recalculado.");
  }

  const hydration = r0(kg * 37 + trainingHours * 500);

  const energy_summary: EnergySummary = {
    tmb_kcal: tmb, get_kcal: get, target_kcal: target, deficit_surplus_percent: effectiveAdjPct,
    protein_g_per_kg: prof.proteinGkg, protein_total_g: proteinTotal,
    carbs_g_per_kg: r1(carbsTotal / kg), carbs_total_g: carbsTotal,
    fat_g_per_kg: prof.fatGkg, fat_total_g: fatTotal,
    hydration_ml: hydration, formula_used: formula,
    calculation_notes: `TMB (${formula === "katch_mcardle" ? "Katch-McArdle" : "Mifflin-St Jeor"}) = ${tmb} kcal · fator atividade ${af} → GET ${get} kcal · ajuste ${effectiveAdjPct}% → alvo ${target} kcal. Hidratação ~${hydration} ml/dia.`,
  };

  const carb_cycling = {
    high_day_kcal: r0(target * 1.1), high_day_carbs_g: r0(carbsTotal * 1.25),
    moderate_day_kcal: target, moderate_day_carbs_g: carbsTotal,
    rest_day_kcal: r0(target * 0.9), rest_day_carbs_g: r0(carbsTotal * 0.7),
    note: "Mais carboidrato nos dias de treino pesado/longo; menos no descanso/deload, mantendo a proteína alta.",
  };
  if (sequence.phase === "acumulacao") {
    carb_cycling.high_day_carbs_g = r0(carb_cycling.high_day_carbs_g * 1.05);
    carb_cycling.note += " No bloco de acúmulo, concentre o acréscimo nos dias de maior volume.";
  } else if (sequence.phase === "intensificacao") {
    carb_cycling.high_day_carbs_g = r0(carb_cycling.high_day_carbs_g * 1.1);
    carb_cycling.note += " No bloco de intensificação, priorize carboidrato antes e depois das sessões-chave.";
  } else if (sequence.phase === "consolidacao") {
    carb_cycling.high_day_carbs_g = r0(carb_cycling.high_day_carbs_g * 0.9);
    carb_cycling.note += " Na consolidação, reduza carboidrato junto da carga, mantendo proteína e hidratação.";
  }

  const nutrition_tips = [
    { title: "Pré-treino", timing: "60 a 120 min antes", goal: "Energia sem pesar o estômago.", how_much: "Porção moderada de carboidrato + pouca proteína; pouca gordura/fibra se o treino for intenso.", examples: ["banana com iogurte", "pão/tapioca com ovos", "arroz/batata com frango em porção leve"], avoid: ["muita gordura", "muita fibra"] },
    { title: "Pós-treino", timing: "Até 2 h depois", goal: "Repor energia e apoiar a recuperação.", how_much: "Refeição completa: boa proteína + carboidrato proporcional ao treino + vegetais.", examples: ["arroz, feijão, frango e salada", "omelete com batata", "whey com fruta quando precisar de praticidade"], avoid: ["pular a refeição"] },
    { title: "Antes de dormir", timing: "30 a 90 min antes", goal: "Evitar fome noturna e favorecer recuperação.", how_much: "Algo leve com proteína e pouca gordura.", examples: ["iogurte", "ovos", "queijo branco", "whey com fruta pequena"], avoid: ["refeição muito grande perto de deitar"] },
    { title: "Dias de descanso", timing: "Ao longo do dia", goal: "Manter proteína e reduzir um pouco o carboidrato.", how_much: `Proteína em todas as refeições; carboidrato perto de ${carb_cycling.rest_day_carbs_g} g no dia.`, examples: ["carnes magras, ovos, legumes, saladas, frutas e carboidrato em porções menores"], avoid: ["exagero calórico em dia parado"] },
    { title: "Hidratação", timing: "Dia todo", goal: "Manter a performance e a recuperação.", how_much: `~${hydration} ml/dia + 500–750 ml por hora de treino; eletrólitos se suar muito.`, examples: ["água", "isotônico nas sessões longas"], avoid: ["chegar ao treino desidratado"] },
  ];

  if (stress >= 8 || (sleep > 0 && sleep < 5)) {
    warnings.push("Estresse alto / sono baixo: déficit ou superávit foi reduzido. Priorize rotina de sono e discuta suplementação com nutricionista ou médico.");
  }
  if (lowReadiness) warnings.push("Baixa prontidão ou sinal de dor no contexto integrado: estratégia calórica conservadora até revisão da equipe.");
  if (endurance && (objective.toLowerCase().includes("emagre"))) {
    warnings.push("Atleta de endurance: não fazer low-carb extremo nem jejum > 16h em fase de volume — o carboidrato é substrato obrigatório.");
  }
  if (assumptions.length) warnings.push(`Dados não informados (${assumptions.join(", ")}) — usei valores médios. Ajuste para mais precisão.`);
  warnings.push("Plano nutricional base (determinístico, metodologia BN). Não substitui nutricionista — havendo condição clínica, encaminhar a profissional com CRN.");

  const mealsPerDay = num(input.meals_per_day) || 5;

  return {
    plan_name: `Plano BN Nutri — ${objective}${input.student_name ? " | " + input.student_name : ""}`,
    objective,
    energy_summary,
    total_calories: target, protein_g: proteinTotal, carbs_g: carbsTotal, fat_g: fatTotal,
    carb_cycling,
    nutrition_tips,
    supplementation: buildSupplements(),
    substitutions: [
      { original: "Arroz branco (carboidrato)", alternatives: ["batata doce", "macarrão", "mandioca", "cuscuz"] },
      { original: includesAny(restrictions, ["vegetarian", "vegano", "vegan"]) ? "Tofu/leguminosas (proteína)" : "Frango (proteína)", alternatives: includesAny(restrictions, ["vegetarian", "vegano", "vegan"]) ? ["ovos", "tofu", "grão-de-bico", "lentilha"] : ["peixe", "ovos", "carne magra", "patinho"] },
      { original: "Fruta (carboidrato/vitaminas)", alternatives: ["banana", "maçã", "mamão", "laranja"] },
    ],
    periodized_blocks: [
      { weeks: "1-2", training_load: "base", nutrition_focus: "regularidade, hidratação e proteína diária", carb_strategy: "carboidrato moderado nos dias de treino, menor nos descansos", recovery_priority: "sono, água e refeição pós-treino completa" },
      { weeks: "3-4", training_load: "progressao", nutrition_focus: "carb cycling acompanhando os dias mais pesados", carb_strategy: "mais carboidrato em torno de MMII/tiros/longo", recovery_priority: "eletrólitos no suor alto e lanches práticos" },
      { weeks: "5-6", training_load: "consolidacao", nutrition_focus: "refinar timing e evitar queda de energia", carb_strategy: "manter carboidrato nos dias-chave, reduzir no deload", recovery_priority: "digestão, hidratação e feedback para o próximo ciclo" },
    ],
    meals: buildMeals(mealsPerDay, restrictions, budget, hasMicrowave, parseMealTimes(input.nutrition_context)),
    pre_race_gi_protocol: "Nas 2–4 h antes de prova/corrida intensa: priorize carboidrato de fácil digestão (banana, pão branco, arroz branco, whey/malto). Evite FODMAPs (feijão, brócolis, couve, leite) e fibra insolúvel.",
    intra_workout_protocol: endurance ? "Sessões > 75 min: 30–60 g de carboidrato/h; > 90 min: 60–90 g/h (2:1 malto:frutose). Hidratação com eletrólitos." : "Treinos de força: foque na hidratação; carboidrato intra só em sessões muito longas.",
    rest_day_adjustments: `Reduza o carboidrato para ~${carb_cycling.rest_day_carbs_g} g, mantenha a proteína (${proteinTotal} g) e a gordura pode subir um pouco para saúde hormonal.`,
    general_notes: `Orientações por momento (sem cardápio fechado nem gramas exatas no prato). Ajuste porções ao apetite e à rotina. Continuidade longitudinal: ciclo ${sequence.sequence_number}, fase ${sequence.phase}; proteína permanece estável e carboidrato acompanha a carga. Consistência > perfeição.`,
    program_sequence: sequence,
    warnings,
    generated_by: "bn_nutrition_engine_v1",
  };
}

export function assertNutritionPlanComplete(plan: NutritionPlan): void {
  if (!plan || typeof plan !== "object") throw new Error("nutrition plan inválido");
  const e = plan.energy_summary;
  if (!e || !(e.target_kcal > 0) || !(e.protein_total_g > 0) || !(e.carbs_total_g >= 0)) {
    throw new Error("nutrition plan inválido: energia/macros ausentes");
  }
  if (!Array.isArray(plan.meals) || plan.meals.length === 0) throw new Error("nutrition plan inválido: sem refeições");
}
