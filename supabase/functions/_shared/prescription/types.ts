export type FitnessLevel = "iniciante" | "intermediario" | "avancado" | string;
export type PrescriptionObjective = "hipertrofia" | "forca" | "emagrecimento" | "recomposicao" | "performance" | string;
export type ValidationSeverity = "info" | "warning" | "blocker";
export type ValidationSource =
  | "biblioteca"
  | "volume"
  | "anamnese"
  | "avaliacao_funcional"
  | "objetivo"
  | "nivel"
  | "periodizacao"
  | "metodologia_bn";

export interface ExerciseTarget {
  muscle_group: string;
  role?: string | null;
  volume_percentage?: number | null;
}

export interface ExerciseCatalogEntry {
  id: string;
  name: string;
  description?: string | null;
  muscle_group?: string | null;
  difficulty?: string | null;
  equipment?: string | null;
  contraindications?: string[];
  regressions?: string[];
  progressions?: string[];
  equivalent_substitutes?: string[];
  pain_limitation_tags?: string[];
  targets?: ExerciseTarget[];
  movement_pattern?: string | null;
}

export interface PrescriptionInput {
  studentName?: unknown;
  objective?: PrescriptionObjective;
  fitnessLevel?: FitnessLevel;
  experienceMonths?: number | string | null;
  daysPerWeek?: number | string | null;
  durationWeeks?: number | string | null;
  equipment?: unknown;
  restrictions?: unknown;
  injuries?: unknown;
  painReports?: Array<{ region?: string; eva?: number | string | null; severity?: string | null }> | null;
  isEnduranceAthlete?: boolean;
  assessmentContext?: unknown;
  anamneseContext?: unknown;
  prescriptionIntegration?: unknown;
  runningDaysContext?: { days_per_week?: number | string | null; sport?: string | null; schedule?: unknown; sessions?: unknown[] } | null;
  enduranceAgenda?: unknown;
  blockNumber?: number | string | null;
  previousPlanContext?: unknown;
  previousPerformanceContext?: unknown;
  programSequence?: {
    sequence_number?: number | string | null;
    total_cycles?: number | string | null;
    start_date?: string | null;
    end_date?: string | null;
    phase?: string | null;
  } | null;
  notes?: unknown;
  painEva?: number | string | null;
  techniqueBreakdown?: boolean;
  deload?: boolean;
  catalog: ExerciseCatalogEntry[];
}

export interface MethodologyPreset {
  key: string;
  label: string;
  target_weekly_sets: string;
  reps: string;
  rir: string;
  methods_by_block: Record<string, string[]>;
  weeklySetRange: { min: number; max: number; beginnerMax?: number };
}

export interface RestrictionRule {
  key: string;
  label: string;
  active: boolean;
  affectedRegions: string[];
  avoidKeywords: string[];
  preferKeywords: string[];
  volumeMultiplier?: number;
  recommendation: string;
  explanationCode: string;
  severity?: "leve" | "moderada" | "severa";
  region?: "joelho" | "lombar" | "ombro" | "global";
  removePattern?: boolean;
  alertTeacher?: boolean;
}

export interface TrainingExercise {
  phase: string;
  exercise_id: string;
  exercise_name: string;
  library_exercise_name: string;
  muscle_group: string;
  sets: number;
  reps: string;
  load_percent_1rm: number | null;
  rir: string;
  rest_seconds: number;
  tempo: string;
  exercise_order: number;
  cues: string;
  biomechanical_note: string;
  regression?: string;
  progression?: string;
  method?: string | null;
  group_id?: string | null;
  method_seconds?: number | null;
  weekly_prescription?: WeeklyExercisePrescription[];
}

export interface WeeklyExercisePrescription {
  week: number;
  block: "base" | "acumulacao" | "intensificacao";
  sets: number;
  reps: string;
  rir: string;
  rest_seconds: number;
  tempo: string;
  method?: string | null;
  group_id?: string | null;
  method_seconds?: number | null;
  instruction: string;
}

export interface WeeklyPeriodizationWeek {
  week: number;
  block: "base" | "acumulacao" | "intensificacao";
  stimulus: string;
  rir: string;
  volume_percent: number;
  tempo_focus: string;
  method_focus: string;
  methods: string[];
  instruction: string;
}

export interface TrainingWorkout {
  name: string;
  day_of_week: number;
  duration_min: number;
  split_focus: string;
  exercises: TrainingExercise[];
  volume_load_estimate: string;
  notes: string;
}

export interface ValidationWarning {
  severity: ValidationSeverity;
  code: string;
  message: string;
  recommendation: string;
  source: ValidationSource;
}

export interface ValidationCorrection {
  code: string;
  message: string;
  applied: boolean;
  source: ValidationSource;
}

export interface VolumeReview {
  muscle_group: string;
  weekly_sets: number;
  status: "baixo" | "ok" | "alto";
  note: string;
}

export interface PrescriptionValidationResult {
  status: "ok" | "warnings" | "blocked";
  warnings: ValidationWarning[];
  corrections: ValidationCorrection[];
  blockers: ValidationWarning[];
  volume_review: VolumeReview[];
}

export interface PrescriptionExplanation {
  rule_id: string;
  category: "seguranca" | "priorizacao" | "nivel" | "volume" | "substituicao" | "progressao" | "deload";
  source: "anamnese" | "avaliacao_funcional" | "biblioteca" | "nivel" | "objetivo" | "feedback_aluno" | "validador";
  target: string;
  action: string;
  reason: string;
  severity?: "leve" | "moderada" | "severa";
}

export interface PeriodizationBlock {
  weeks: string;
  stimulus: string;
  methods: string[];
  progression_rule: string;
}

export interface TrainingProgram {
  schemaVersion: "bn-prescription-v1";
  engineMeta: {
    version: "v1";
    generated_at: string;
    requested_days: number;
    structured_days: number;
    split: string;
    library_only: true;
    sequence_number?: number;
    total_cycles?: number | null;
    sequence_phase?: string;
    previous_plan_used?: boolean;
  };
  cycle_name: string;
  objective: string;
  duration_weeks: number;
  block: string;
  program_sequence?: {
    sequence_number: number;
    total_cycles: number | null;
    phase: string;
    start_date: string | null;
    end_date: string | null;
    previous_plan_used: boolean;
  };
  methodology_preset: {
    key: string;
    label: string;
    why_selected: string;
    rules: MethodologyPreset;
  };
  generated_by: "bn_prescription_engine_v1";
  biomechanical_notes: string;
  workouts: TrainingWorkout[];
  library_policy: {
    only_library_exercises: true;
    catalog_count: number;
    gaps: string[];
    validation?: unknown;
  };
  periodization_blocks: PeriodizationBlock[];
  weekly_periodization: WeeklyPeriodizationWeek[];
  weekly_structure: string;
  progression_protocol: string;
  warnings: string[];
  validator: {
    pre_save: PrescriptionValidationResult;
  };
  validation: PrescriptionValidationResult;
  explanations: PrescriptionExplanation[];
  bnito_after_generation: {
    intent: "notify_student_prescription_ready";
    question_to_teacher: string;
    suggested_message: string;
  };
}

export interface PrescriptionEngineResult {
  program: TrainingProgram;
  explanations: PrescriptionExplanation[];
  validation: PrescriptionValidationResult;
}
