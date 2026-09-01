import { describe, expect, it } from "vitest";
import { generateTrainingProgram } from "./engine";
import type { ExerciseCatalogEntry, PrescriptionInput } from "./types";

const GROUPS = ["quadriceps", "posterior", "gluteos", "costas", "peitoral", "ombros", "core"];
const EQUIPMENT = ["maquina", "cabo", "halteres", "barra", "livre"];
const NAMES = [
  "Agachamento controle motor",
  "Leg press unilateral",
  "Mesa flexora posterior",
  "Hip thrust gluteos",
  "Remada baixa costas",
  "Supino maquina peitoral",
  "Face pull ombros",
  "Prancha core",
  "Mobilidade tornozelo quadril",
  "Puxada frente",
];

function buildCatalog(size = 1_200): ExerciseCatalogEntry[] {
  return Array.from({ length: size }, (_, index) => {
    const group = GROUPS[index % GROUPS.length];
    const equipment = EQUIPMENT[index % EQUIPMENT.length];
    return {
      id: `exercise-${index}`,
      name: `${NAMES[index % NAMES.length]} ${index}`,
      description: "Exercicio tecnico da biblioteca completa com amplitude controlada e progressao conservadora.",
      muscle_group: group,
      difficulty: index % 3 === 0 ? "iniciante" : index % 3 === 1 ? "intermediario" : "avancado",
      equipment,
      contraindications: index % 11 === 0 ? ["joelho", "lombar"] : [],
      regressions: ["Reduzir amplitude e carga"],
      progressions: ["Progredir repeticoes antes da carga"],
      equivalent_substitutes: [`exercise-${(index + 10) % size}`],
      pain_limitation_tags: index % 13 === 0 ? ["joelho"] : [],
      movement_pattern: index % 2 === 0 ? "multiarticular" : "isolado_acessorio",
      targets: [{ muscle_group: group, role: "primary", volume_percentage: 100 }],
    };
  });
}

function benchmarkInput(): PrescriptionInput {
  return {
    objective: "hipertrofia",
    fitnessLevel: "avancado",
    daysPerWeek: 6,
    durationWeeks: 6,
    equipment: "academia completa",
    restrictions: "dor moderada no joelho EVA 3 e cautela lombar",
    painEva: 3,
    painReports: [{ region: "joelho", eva: 3 }],
    assessmentContext: {
      ohs_compensations: [{ key: "dynamic_valgus", presente: true, severidade: "moderada" }],
    },
    catalog: buildCatalog(),
  };
}

describe("BN Prescription Engine compute budget", () => {
  it("gera a carga máxima do Studio sem reprocessar o catálogo até esgotar o compute da Edge", () => {
    const input = benchmarkInput();

    generateTrainingProgram(input); // aquece o runtime/imports antes da medição
    const samples = Array.from({ length: 3 }, () => {
      const startedAt = performance.now();
      const program = generateTrainingProgram(input);
      const elapsedMs = performance.now() - startedAt;

      expect(program.library_policy.catalog_count).toBe(1_200);
      expect(program.workouts.length).toBeGreaterThanOrEqual(4);
      expect(program.library_policy.only_library_exercises).toBe(true);
      return elapsedMs;
    }).sort((left, right) => left - right);

    const medianMs = samples[1];
    console.info(`prescription_engine_benchmark median_ms=${medianMs.toFixed(2)} samples_ms=${samples.map((sample) => sample.toFixed(2)).join(",")}`);
    // Vitest executa arquivos em paralelo; a folga evita falsos negativos por
    // contenção sem permitir retorno ao baseline anterior (> 550 ms isolado).
    expect(medianMs).toBeLessThan(500);
  });
});
