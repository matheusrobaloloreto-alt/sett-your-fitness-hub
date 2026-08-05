// Tipos dos adapters da Fase B (B2/B3/B4). Puros e Deno-safe.
// NÃO ligam nada na edge — só preparam a tradução payload<->engine<->ai_strength_plans.
import type {
  ExerciseCatalogEntry,
  PrescriptionInput,
  PrescriptionValidationResult,
  TrainingProgram,
  ValidationWarning,
} from "../types.ts";

// ── B2: payload atual da edge ai-prescribe-workout ─────────────────────────
export interface EdgePrescriptionPayload {
  student_name?: unknown;
  objective?: unknown;
  fitness_level?: unknown;
  experience_months?: unknown;
  days_per_week?: unknown;
  duration_weeks?: unknown;
  equipment?: unknown;
  restrictions?: unknown;
  injuries?: unknown;
  block_number?: unknown;
  previous_plan_context?: unknown;
  previous_performance_context?: unknown;
  program_sequence?: {
    sequence_number?: unknown;
    total_cycles?: unknown;
    start_date?: unknown;
    end_date?: unknown;
    phase?: unknown;
  } | null;
  is_endurance_athlete?: unknown;
  assessment_context?: unknown;
  anamnese_context?: unknown;
  prescription_integration?: unknown;
  running_days_context?: { days_per_week?: unknown; sport?: unknown; schedule?: unknown; sessions?: unknown[] } | null;
  endurance_agenda?: unknown;
  notes?: unknown;
  // Dor estruturada — aceita ambas as convenções (camelCase e snake_case). Pode não existir no payload atual.
  painReports?: unknown;
  pain_reports?: unknown;
  painEva?: unknown;
  pain_eva?: unknown;
  techniqueBreakdown?: unknown;
  technique_breakdown?: unknown;
  deload?: unknown;
  [key: string]: unknown;
}

export interface InputAdapterResult {
  input: PrescriptionInput;
  warnings: string[];
}

// ── B3: linhas cruas do catálogo (exercise_library + targets + metadata) ───
export interface EdgeExerciseRow {
  id: string;
  name: string;
  description?: string | null;
  muscle_group?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  is_global?: boolean | null;
  company_id?: string | null;
}
export interface EdgeMuscleTargetRow {
  exercise_id: string;
  muscle_group_id?: string | null;
  role?: string | null;
  volume_percentage?: number | null;
}
export interface EdgeMuscleGroupRow { id: string; name: string; }
export interface EdgeExerciseMetadataRow {
  exercise_id: string;
  contraindications?: string[] | null;
  regressions?: string[] | null;
  progressions?: string[] | null;
  equivalent_substitutes?: string[] | null;
  pain_limitation_tags?: string[] | null;
}
export interface CatalogAdapterResult {
  catalog: ExerciseCatalogEntry[];
  warnings: string[];
  gaps: string[];
}

// ── B4: saída para ai_strength_plans + response ────────────────────────────
export interface AiStrengthPlanRecord {
  cycle_name: string;
  objective: string;
  duration_weeks: number;
  biomechanical_notes: string | null;
  plan: TrainingProgram; // JSON completo (campos antigos + aditivos), sem renomear/remover
}
export interface OutputAdapterResult {
  record: AiStrengthPlanRecord;
  plan: TrainingProgram;
  status: PrescriptionValidationResult["status"];
  blocked: boolean;   // edge futura deve responder 422 quando true
  handoff: boolean;   // há blocker/handoff severo ao professor
  blockers: ValidationWarning[];
  warnings: string[];
}
