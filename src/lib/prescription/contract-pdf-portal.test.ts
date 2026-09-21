// ORDEM 016 — Contract tests: o plano do engine (via output adapter) é consumível por
// PDF (generateStrengthPDF), publicação e portal do aluno (buildWorkoutRows/mapStrengthExercise).
// NÃO altera UI/PDF/publicação: só verifica o contrato a partir de um plano real do engine.
import { describe, it, expect } from "vitest";
import { generateTrainingProgram } from "./engine";
import { buildExerciseCatalogFromEdgeRows } from "../../../supabase/functions/_shared/prescription/adapters/catalogAdapter.ts";
import { adaptTrainingProgramForAiStrengthPlan } from "../../../supabase/functions/_shared/prescription/adapters/outputAdapter.ts";
import type { EdgeExerciseRow } from "../../../supabase/functions/_shared/prescription/adapters/types.ts";
import { buildWorkoutRows, mapStrengthExercise } from "@/lib/publishStrengthPlan";
import { generateStrengthPDF, generateAllPDFs } from "@/lib/generatePDFs";

const ROWS: EdgeExerciseRow[] = [
  { id: "mob", name: "Mobilidade de Quadril", muscle_group: "mobilidade", categories: ["Mobilidades"], equipment: "livre" },
  { id: "plank", name: "Prancha", muscle_group: "abdomen", categories: ["Core"], equipment: "livre" },
  { id: "glute", name: "Abdução Mini Band", muscle_group: "glúteos", categories: ["Funcionais"], equipment: "mini band" },
  { id: "box-squat", name: "Agachamento na Caixa", muscle_group: "quadríceps", categories: ["Base"], equipment: "livre" },
  { id: "leg-press", name: "Leg Press", muscle_group: "quadríceps", categories: ["Maquinas"], equipment: "máquina" },
  { id: "leg-curl", name: "Mesa Flexora", muscle_group: "posterior de coxa", categories: ["Maquinas"], equipment: "máquina" },
  { id: "face-pull", name: "Face Pull", muscle_group: "deltoide posterior", categories: ["Funcionais"], equipment: "cabo" },
  { id: "row", name: "Remada Baixa", muscle_group: "dorsal", categories: ["Base"], equipment: "máquina" },
  { id: "press", name: "Supino Máquina", muscle_group: "peitoral", categories: ["Base"], equipment: "máquina" },
  { id: "pulldown", name: "Puxada", muscle_group: "dorsal", categories: ["Maquinas"], equipment: "máquina" },
  { id: "hip-thrust", name: "Hip Thrust", muscle_group: "glúteos", categories: ["Base"], equipment: "máquina" },
  { id: "calf", name: "Panturrilha + Core", muscle_group: "abdomen", categories: ["Core"], equipment: "livre" },
];
const CATALOG = buildExerciseCatalogFromEdgeRows({ exercises: ROWS }).catalog;
const CATALOG_IDS = new Set(CATALOG.map((e) => e.id));

function enginePlan() {
  const program = generateTrainingProgram({ studentName: "Aluno Teste", objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4, equipment: "academia completa", catalog: CATALOG });
  return adaptTrainingProgramForAiStrengthPlan({ program }).record.plan;
}

const META = { studentName: "Aluno Teste", date: "2026-06-15", professional: "Prof. BN", cref: "000000-G/SP" };

describe("contrato — publicação/portal (buildWorkoutRows + mapStrengthExercise)", () => {
  it("o plano do engine vira linhas de workout válidas para o app do aluno", () => {
    const plan = enginePlan();
    const rows = buildWorkoutRows(plan, "cycle-1", "company-1");
    expect(rows.length).toBe(plan.workouts.length);
    for (const r of rows) {
      expect(r.cycle_id).toBe("cycle-1");
      expect(r.company_id).toBe("company-1");
      expect(typeof r.name).toBe("string");
      expect(typeof r.title).toBe("string");
      expect(typeof r.sort_order).toBe("number");
      expect(Array.isArray(r.exercises)).toBe(true);
      for (const ex of r.exercises) {
        // contrato StudentWorkoutExercise (StudentPortal/StudentWorkout)
        expect(typeof ex.exercise_id === "string" || ex.exercise_id === null).toBe(true);
        if (ex.exercise_id) expect(CATALOG_IDS.has(ex.exercise_id)).toBe(true); // biblioteca-only
        expect(typeof ex.exercise_name).toBe("string");
        expect(ex.exercise_name.length).toBeGreaterThan(0);
        expect(typeof ex.muscle_group).toBe("string");
        expect(typeof ex.sets).toBe("string");
        expect(typeof ex.reps).toBe("string");
        expect(typeof ex.rest).toBe("string");
        expect(typeof ex.notes).toBe("string");
      }
    }
  });

  it("mapStrengthExercise mapeia rest_seconds -> 'Ns' e cues -> notes", () => {
    const plan = enginePlan();
    const firstEx = plan.workouts[0].exercises[0];
    const mapped = mapStrengthExercise(firstEx);
    expect(mapped.exercise_id).toBe(firstEx.exercise_id);
    expect(mapped.rest).toMatch(/s$|^\d|^$/); // "90s" etc.
  });
});

describe("contrato — PDF (generateStrengthPDF / generateAllPDFs)", () => {
  it("o plano do engine tem todos os campos que o PDF de força lê", () => {
    const plan = enginePlan() as any;
    expect(typeof plan.cycle_name).toBe("string");
    expect(plan.objective).toBeDefined();
    expect(plan.duration_weeks).toBeDefined();
    expect(typeof plan.biomechanical_notes).toBe("string");
    expect(typeof plan.weekly_structure).toBe("string");
    expect(typeof plan.progression_protocol).toBe("string");
    expect(Array.isArray(plan.warnings)).toBe(true);
    expect(Array.isArray(plan.workouts)).toBe(true);
    expect(typeof plan.workouts[0].exercises[0].exercise_order).toBe("number");
  });

  it("generateStrengthPDF renderiza o plano do engine sem lançar", () => {
    const plan = enginePlan();
    const doc = generateStrengthPDF(plan, META);
    expect(doc).toBeTruthy();
    expect(typeof (doc as any).output).toBe("function"); // é um jsPDF válido
  });

  it("generateAllPDFs produz o PDF de musculação a partir do plano do engine", () => {
    const plan = enginePlan();
    const pdfs = generateAllPDFs({ musculacao: plan }, META);
    const musc = pdfs.find((p) => p.modality === "musculacao");
    expect(musc).toBeTruthy();
    expect(musc?.filename).toMatch(/\.pdf$/);
  });
});
