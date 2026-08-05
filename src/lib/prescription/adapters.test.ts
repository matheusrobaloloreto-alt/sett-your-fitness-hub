import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { generateTrainingProgram } from "./engine";
import { buildPrescriptionInputFromEdgePayload } from "../../../supabase/functions/_shared/prescription/adapters/inputAdapter.ts";
import { buildExerciseCatalogFromEdgeRows } from "../../../supabase/functions/_shared/prescription/adapters/catalogAdapter.ts";
import { adaptTrainingProgramForAiStrengthPlan } from "../../../supabase/functions/_shared/prescription/adapters/outputAdapter.ts";
import type {
  EdgeExerciseRow,
  EdgeExerciseMetadataRow,
} from "../../../supabase/functions/_shared/prescription/adapters/types.ts";

// Linhas cruas mirando o que loadExerciseCatalog traz (+ equipment para os adapters/engine).
const EXERCISE_ROWS: EdgeExerciseRow[] = [
  { id: "mob-ankle", name: "Mobilidade de Tornozelo e Quadril", muscle_group: "mobilidade", equipment: "livre" },
  { id: "plank", name: "Prancha Frontal", muscle_group: "core", equipment: "livre" },
  { id: "dead-bug", name: "Dead Bug", muscle_group: "core", equipment: "livre" },
  { id: "glute-band", name: "Abdução de Quadril Mini Band", muscle_group: "glúteos", equipment: "mini band" },
  { id: "box-squat", name: "Agachamento na Caixa", muscle_group: "quadríceps", equipment: "livre" },
  { id: "leg-press", name: "Leg Press", muscle_group: "quadríceps", equipment: "máquina" },
  { id: "leg-curl", name: "Mesa Flexora", muscle_group: "posterior", equipment: "máquina" },
  { id: "thoracic-mob", name: "Mobilidade Torácica", muscle_group: "ombros", equipment: "livre" },
  { id: "face-pull", name: "Face Pull", muscle_group: "ombros", equipment: "cabo" },
  { id: "row", name: "Remada Baixa", muscle_group: "costas", equipment: "máquina" },
  { id: "machine-press", name: "Supino Máquina Pegada Neutra", muscle_group: "peitoral", equipment: "máquina" },
  { id: "lat-pulldown", name: "Puxada Frente", muscle_group: "costas", equipment: "máquina" },
  { id: "step-up", name: "Step Up Baixo", muscle_group: "glúteos", equipment: "livre" },
  { id: "hip-thrust", name: "Hip Thrust", muscle_group: "glúteos", equipment: "máquina" },
  { id: "rdl", name: "Terra Romeno", muscle_group: "posterior", equipment: "halteres" },
  { id: "calf-core", name: "Panturrilha em Pé + Core", muscle_group: "core", equipment: "livre" },
];
const METADATA: EdgeExerciseMetadataRow[] = [
  { exercise_id: "box-squat", pain_limitation_tags: ["joelho"], regressions: ["Reduzir amplitude"], equivalent_substitutes: ["leg-press"] },
  { exercise_id: "rdl", contraindications: ["lombar"] },
];

function buildCatalog() {
  return buildExerciseCatalogFromEdgeRows({ exercises: EXERCISE_ROWS, metadata: METADATA }).catalog;
}

describe("B2 — input adapter", () => {
  it("infere nível de musculação pelos meses e ignora nível de atividade diária", () => {
    const { input, warnings } = buildPrescriptionInputFromEdgePayload({
      payload: {
        objective: "hipertrofia",
        fitness_level: "muito ativo",
        experience_months: 18,
        days_per_week: 4,
      },
      catalog: buildCatalog(),
    });

    expect(input.fitnessLevel).toBe("intermediario");
    expect(input.experienceMonths).toBe(18);
    expect(warnings.some((warning) => warning.includes("18 meses"))).toBe(true);
  });

  it("infere intermediário pela continuidade quando não há meses informados", () => {
    const { input } = buildPrescriptionInputFromEdgePayload({
      payload: {
        objective: "hipertrofia",
        days_per_week: 4,
        previous_plan_context: { cycle_name: "Ciclo anterior" },
        program_sequence: { sequence_number: 3 },
      },
      catalog: buildCatalog(),
    });

    expect(input.fitnessLevel).toBe("intermediario");
  });

  it("lê nível e experiência quando o pré-cadastro entrega respostas aninhadas", () => {
    const { input, warnings } = buildPrescriptionInputFromEdgePayload({
      payload: {
        objective: "hipertrofia",
        days_per_week: 4,
        anamnese_context: {
          raw_answers: {
            nivel_musculacao: "Intermediário",
            tempo_treino_meses: "18",
          },
        },
      },
      catalog: buildCatalog(),
    });

    expect(input.fitnessLevel).toBe("intermediario");
    expect(input.experienceMonths).toBe(18);
    expect(warnings.some((warning) => warning.includes("default conservador 'iniciante'"))).toBe(false);
  });

  it("1) preserva dor estruturada EVA 4 sem depender de texto (e o engine trava progressão)", () => {
    const catalog = buildCatalog();
    const { input } = buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "avancado", days_per_week: 5, restrictions: "", painReports: [{ region: "joelho", eva: 4 }] },
      catalog,
    });
    expect(input.painReports?.[0]?.eva).toBe(4);
    const program = generateTrainingProgram(input);
    expect(program.progression_protocol.toLowerCase()).toContain("hold/regress");
  });

  it("2) preserva EVA > 5 e o engine classifica como severa (blocker + handoff)", () => {
    const catalog = buildCatalog();
    const { input } = buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "intermediario", days_per_week: 4, restrictions: "", painReports: [{ region: "joelho", eva: 7 }] },
      catalog,
    });
    expect(input.painReports?.[0]?.eva).toBe(7);
    const out = adaptTrainingProgramForAiStrengthPlan({ program: generateTrainingProgram(input) });
    expect(out.blocked).toBe(true);
    expect(out.handoff).toBe(true);
  });

  it("3) preserva endurance/corrida >= 3x", () => {
    const { input, warnings } = buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "intermediario", days_per_week: 4, is_endurance_athlete: true, running_days_context: { days_per_week: 3, sport: "corrida" } },
      catalog: buildCatalog(),
    });
    expect(input.isEnduranceAthlete).toBe(true);
    expect(input.runningDaysContext?.days_per_week).toBe(3);
    expect(warnings.some((w) => /sem frequencia/i.test(w))).toBe(false);
  });

  it("4) endurance sem frequência preserva sinal para warning de agenda", () => {
    const catalog = buildCatalog();
    const { input, warnings } = buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "intermediario", days_per_week: 4, is_endurance_athlete: true },
      catalog,
    });
    expect(input.isEnduranceAthlete).toBe(true);
    expect(warnings.some((w) => /sem frequencia/i.test(w))).toBe(true);
    const program = generateTrainingProgram(input);
    expect(program.validator.pre_save.warnings.some((w) => w.code === "endurance_agenda_missing")).toBe(true);
  });
});

describe("B3 — catalog adapter", () => {
  it("5) não inventa exercício (lista vazia => catálogo vazio + gap)", () => {
    const res = buildExerciseCatalogFromEdgeRows({ exercises: [] });
    expect(res.catalog).toEqual([]);
    expect(res.gaps.some((g) => g.startsWith("empty_catalog"))).toBe(true);
  });

  it("6) mantém exercise_id real", () => {
    const res = buildExerciseCatalogFromEdgeRows({ exercises: [{ id: "abc123", name: "Teste", muscle_group: "peitoral", equipment: "máquina" }] });
    expect(res.catalog[0]?.id).toBe("abc123");
    expect(res.catalog[0]?.name).toBe("Teste");
  });

  it("7) gap/warning quando metadado essencial está ausente", () => {
    const res = buildExerciseCatalogFromEdgeRows({
      exercises: [
        { id: "x1", name: "Sem meta", muscle_group: "peitoral", equipment: "máquina" },
        { id: "x2", name: "Sem grupo", equipment: null },
      ],
    });
    expect(res.warnings.some((w) => /no_safety_metadata/.test(w))).toBe(true);
    expect(res.gaps.some((g) => g.startsWith("no_muscle_group"))).toBe(true);
  });

  it("8) mapeia substitutes/regressions/contraindications quando presentes", () => {
    const catalog = buildCatalog();
    const box = catalog.find((e) => e.id === "box-squat")!;
    const rdl = catalog.find((e) => e.id === "rdl")!;
    expect(box.pain_limitation_tags).toContain("joelho");
    expect(box.regressions).toContain("Reduzir amplitude");
    expect(box.equivalent_substitutes).toContain("leg-press");
    expect(rdl.contraindications).toContain("lombar");
  });
});

describe("B4 — output adapter", () => {
  it("9) mantém campos antigos obrigatórios", () => {
    const program = generateTrainingProgram(buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "intermediario", days_per_week: 4 },
      catalog: buildCatalog(),
    }).input);
    const { record } = adaptTrainingProgramForAiStrengthPlan({ program });
    for (const k of ["cycle_name", "objective", "duration_weeks", "workouts", "periodization_blocks", "library_policy", "validator", "bnito_after_generation"] as const) {
      expect(record.plan[k]).toBeDefined();
    }
    // colunas do insert também derivadas
    expect(record.cycle_name).toBe(program.cycle_name);
    expect(record.duration_weeks).toBe(program.duration_weeks);
  });

  it("10) mantém campos novos aditivos", () => {
    const program = generateTrainingProgram(buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "intermediario", days_per_week: 4 },
      catalog: buildCatalog(),
    }).input);
    const { record } = adaptTrainingProgramForAiStrengthPlan({ program });
    for (const k of ["schemaVersion", "engineMeta", "validation", "explanations"] as const) {
      expect(record.plan[k]).toBeDefined();
    }
  });

  it("11) preserva blockers/handoff e não remove warnings", () => {
    const program = generateTrainingProgram(buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "iniciante", days_per_week: 3, restrictions: "", painReports: [{ region: "joelho", eva: 7 }] },
      catalog: buildCatalog(),
    }).input);
    const out = adaptTrainingProgramForAiStrengthPlan({ program });
    expect(out.blocked).toBe(true);
    expect(out.handoff).toBe(true);
    expect(out.blockers.length).toBeGreaterThan(0);
    expect(Array.isArray(out.warnings)).toBe(true);
  });

  it("12) contrato final é serializável em JSON (round-trip)", () => {
    const program = generateTrainingProgram(buildPrescriptionInputFromEdgePayload({
      payload: { objective: "hipertrofia", fitness_level: "intermediario", days_per_week: 4 },
      catalog: buildCatalog(),
    }).input);
    const { record } = adaptTrainingProgramForAiStrengthPlan({ program });
    const json = JSON.stringify(record);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed.plan.cycle_name).toBe(record.cycle_name);
    expect(parsed.plan.schemaVersion).toBe("bn-prescription-v1");
  });
});

describe("adapters — pureza Deno-safe e independência da edge", () => {
  // Caminho relativo à raiz do repo (cwd do vitest) — evita depender de import.meta.url (não-file:// sob vite).
  const adaptersDir = "supabase/functions/_shared/prescription/adapters/";
  const FILES = ["types.ts", "inputAdapter.ts", "catalogAdapter.ts", "outputAdapter.ts"];
  const read = (f: string) => readFileSync(adaptersDir + f, "utf8");
  const importsOf = (code: string) => [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

  it("13) adapters não importam React/DOM/Node nem libs externas e não usam globais de DOM", () => {
    for (const f of FILES) {
      const code = read(f);
      // imports só relativos
      for (const p of importsOf(code)) {
        expect(p.startsWith("./") || p.startsWith("../")).toBe(true);
      }
      // nada de react/react-dom/node:/npm:/http(s)/alias @ nos imports
      expect(/from\s+["'](react|react-dom|node:|npm:|https?:|@)/.test(code)).toBe(false);
      // sem globais de DOM/navegador
      expect(/\b(document|window|localStorage|navigator)\b/.test(code)).toBe(false);
    }
  });

  it("14) adapters não dependem da edge diretamente (só tipos do engine/adapters compartilhados)", () => {
    for (const f of FILES) {
      const code = read(f);
      // Prova de independência: TODO import resolve só a ../types.ts (tipos do engine compartilhado)
      // ou ./types.ts (tipos dos adapters) — nenhum import de edge function / index de função.
      for (const p of importsOf(code)) {
        expect(/(^\.\.\/types\.ts$|^\.\/types\.ts$)/.test(p)).toBe(true);
        expect(p.includes("ai-prescribe-workout")).toBe(false);
        expect(p.includes("/functions/")).toBe(false);
      }
    }
  });
});
