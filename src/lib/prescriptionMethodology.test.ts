import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeCompanyProductSettings, parseSettingsRecord, readCompanyProductSettings, type SettingsReadClient } from '../../supabase/functions/_shared/company-product-settings';
import { projectAdditionalPrescriptionAnswers, projectIntercycleInputs } from '../../supabase/functions/_shared/prescription/companyPolicy';
import { buildWeeklyPeriodization } from '../../supabase/functions/_shared/prescription/weeklyPeriodization';
import { applyLongitudinalProgression } from '../../supabase/functions/_shared/prescription/longitudinalRules';
import { generateTrainingProgram } from '../../supabase/functions/_shared/prescription/engine';
import type { PrescriptionInput, TrainingWorkout } from '../../supabase/functions/_shared/prescription/types';
const policy = normalizeCompanyProductSettings().prescription;
const input: PrescriptionInput = { fitnessLevel: 'avancado', daysPerWeek: 3, catalog: [], objective: 'hipertrofia' };
const workout: TrainingWorkout = { name: 'Teste', day_of_week: 1, duration_min: 45, split_focus: 'forca', volume_load_estimate: 'Referência sintética', notes: '', exercises: ['forca_global', 'forca_especifica'].map((phase, i) => ({ exercise_id: `e${i}`, exercise_name: 'Supino máquina', library_exercise_name: 'Supino máquina', phase, muscle_group: 'peitoral', sets: 4, reps: '8-12', load_percent_1rm: null, rir: '3', rest_seconds: 90, tempo: '2020', exercise_order: i, cues: '', biomechanical_note: '' })) };
const mappings = [{ source_key: 'extra_duration', answer: 'Curto', target: 'sessionDurationMinutes' as const, value: '30' }];
describe('methodology validation and executable policy', () => {
  it('keeps defaults identical to the forward SQL contract without changing old migrations', () => {
    const sql = readFileSync('supabase/migrations/20261028090117_company_prescription_methodology.sql', 'utf8');
    const json = sql.match(/select '([\s\S]+?)'::jsonb;/)?.[1];
    expect(json).toBeDefined();
    const legacyDefaults = normalizeCompanyProductSettings();
    // Expiry policy was added in a separate column/wrapper; the legacy JSON codec stays unchanged.
    delete (legacyDefaults.prescription as Partial<typeof legacyDefaults.prescription>).expired_workout_behavior;
    expect(JSON.parse(json!)).toEqual(legacyDefaults);
    const expiryMigration = readFileSync('supabase/migrations/20261101223102_company_expired_workout_behavior.sql', 'utf8');
    expect(expiryMigration).toContain("expired_workout_behavior text not null default 'keep_until_replaced'");
    expect(normalizeCompanyProductSettings().prescription.expired_workout_behavior).toBe('keep_until_replaced');
  });
  it.each([
    { weekly_rules: [{ week: 0, phase: 'base', rir_min: 3, rir_max: 4, volume_percent: 80 }] },
    { weekly_rules: [{ week: 1, phase: 'injected', rir_min: 3, rir_max: 4, volume_percent: 80 }] },
    { weekly_rules: [{ week: 1, phase: 'base', rir_min: 1, rir_max: 4, volume_percent: 80 }] },
    { weekly_rules: [{ week: 1, phase: 'base', rir_min: 4, rir_max: 3, volume_percent: 80 }] },
    { weekly_rules: [{ week: 1, phase: 'base', rir_min: 3, rir_max: 4, volume_percent: 106 }] },
    { progression_mode: 'eval' }, { allowed_methods: ['unknown'] }, { allowed_methods: ['dropset', 'dropset'] },
    { answer_mappings: [{ ...mappings[0], target: 'painEva', value: '0' }] },
    { answer_mappings: [{ ...mappings[0], source_key: 'injuries' }] },
    { answer_mappings: [...mappings, ...mappings] },
    { answer_mappings: [{ ...mappings[0], value: '999' }] },
    { answer_mappings: [...mappings, { ...mappings[0], source_key: 'extra_other' }] },
  ])('rejects malformed policy %j', patch => {
    expect(() => normalizeCompanyProductSettings({ prescription: { ...policy, ...patch } })).toThrow();
  });
  it('reloads a serialized saved policy and changes actual weekly exercise doses without mutating history', async () => {
    const settings = normalizeCompanyProductSettings({ prescription: { ...policy, first_week_volume_multiplier: 1, allowed_methods: [], weekly_rules: [{ week: 1, phase: 'acumulacao', rir_min: 4, rir_max: 5, volume_percent: 50 }] } });
    const persisted = JSON.stringify({ settings, version: 2 });
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: JSON.parse(persisted), error: null }) }) }) }) } as unknown as SettingsReadClient;
    const reload = await readCompanyProductSettings(client, 'synthetic-company');
    const original = JSON.stringify(workout);
    const weekly = buildWeeklyPeriodization([workout], { ...input, companyPolicy: reload.settings.prescription });
    expect(weekly.workouts[0].exercises[0].weekly_prescription?.[0]).toMatchObject({ block: 'acumulacao', rir: '4-5' });
    expect(weekly.workouts[0].exercises.reduce((n, e) => n + e.weekly_prescription![0].sets, 0)).toBe(4);
    expect(weekly.workouts.flatMap(w => w.exercises).flatMap(e => e.weekly_prescription!).every(w => !w.method && !w.group_id)).toBe(true);
    expect(JSON.stringify(workout)).toBe(original);
    const result = generateTrainingProgram({ ...input, companyPolicy: reload.settings.prescription });
    reload.settings.prescription.weekly_rules[0].rir_min = 2;
    expect(result.engineMeta.company_policy?.weekly_rules[0].rir_min).toBe(4);
    expect(result.weekly_periodization[0]).toMatchObject({ volume_percent: 50, rir: '4-5' });
  });
  it('maintains sets between cycles or progresses only reps and preserves the clinical hold', () => {
    const previousPlanContext = { workouts: [workout] };
    const base = { ...input, previousPlanContext, blockNumber: 2 };
    const maintained = applyLongitudinalProgression([workout], { ...base, companyPolicy: { ...policy, progression_mode: 'maintain' } });
    const reps = applyLongitudinalProgression([workout], { ...base, companyPolicy: { ...policy, progression_mode: 'reps_only' } });
    expect(maintained.workouts[0].exercises[0]).toMatchObject({ sets: 4, reps: '8-12' });
    expect(reps.workouts[0].exercises[0]).toMatchObject({ sets: 4, reps: '9-13' });
    const held = applyLongitudinalProgression([workout], { ...base, painEva: 8, companyPolicy: { ...policy, progression_mode: 'reps_only' } });
    expect(held.hold).toBe(true);
    expect(held.workouts[0].exercises[0].reps).toBe('8-12');
    const deload = buildWeeklyPeriodization([workout], { ...base, deload: true, companyPolicy: { ...policy, weekly_rules: [{ week: 1, phase: 'intensificacao', rir_min: 2, rir_max: 2, volume_percent: 105 }] } });
    expect(deload.weeks[0]).toMatchObject({ block: 'deload', volume_percent: 50 });
  });
  it('maps supported persisted extras, leaves clinical context intact and gives intercycle precedence', () => {
    const source = { ...input, injuries: ['ombro'], painEva: 8, assessmentContext: { red_flags: ['dor no peito'] } };
    const mapped = projectAdditionalPrescriptionAnswers(source, { extra_duration: 'Curto' }, { ...policy, answer_mappings: mappings });
    expect(mapped).toMatchObject({ sessionDurationMinutes: 30, painEva: 8, injuries: ['ombro'], assessmentContext: source.assessmentContext });
    expect(source.sessionDurationMinutes).toBeUndefined();
    expect(() => projectAdditionalPrescriptionAnswers(source, { extra_duration: 'unknown' }, { ...policy, answer_mappings: mappings })).toThrow(/mapeamento/);
    expect(() => projectAdditionalPrescriptionAnswers(source, { extra_duration: ['Curto'] }, { ...policy, answer_mappings: mappings })).toThrow(/revisão/);
    expect(projectAdditionalPrescriptionAnswers(source, null, { ...policy, answer_mappings: mappings })).toEqual(source);
    expect(projectIntercycleInputs(mapped, { status: 'completed', sensitive_consent: true, availability_changed: true, session_duration_minutes: 60 }).sessionDurationMinutes).toBe(60);
    expect(parseSettingsRecord({ settings: { prescription: policy }, version: 1 }).settings.prescription.beginner_max_weekly_sets).toBe(21);
  });
});
