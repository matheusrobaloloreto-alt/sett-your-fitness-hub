import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '../../../supabase/functions/_shared/company-product-settings';
import { generateTrainingProgram } from './engine';
import { getVolumeRangeForGroup } from './volumeRules';
import { inheritClinicalContext, projectIntercycleInputs } from '../../../supabase/functions/_shared/prescription/companyPolicy';
import { buildCardioProgram } from '../../../supabase/functions/_shared/prescription/cardio/cardioEngine';
import { prescriptionRiskText } from '../../../supabase/functions/_shared/prescription/clinicalContext';
import type { PrescriptionInput } from './types';

const policy = { ...DEFAULT_COMPANY_PRODUCT_SETTINGS.prescription };
const input: PrescriptionInput = {
  objective: 'hipertrofia', fitnessLevel: 'iniciante', daysPerWeek: 3,
  equipment: 'academia completa', catalog: [],
};
const catalog = ['Mobilidade Tornozelo Quadril', 'Prancha Core', 'Dead Bug', 'Abducao Quadril Mini Band', 'Agachamento Caixa', 'Leg Press', 'Mesa Flexora', 'Face Pull', 'Remada Baixa', 'Supino Maquina', 'Puxada Frente', 'Hip Thrust', 'Panturrilha Core'].map((name, index) => ({ id: `exercise-${index}`, name, equipment: 'livre', muscle_group: index % 2 ? 'peitoral' : 'quadriceps' }));
const safetyCatalog = [
  ['Mobilidade Tornozelo Quadril', 'mobilidade'], ['Prancha Core', 'abdomen'], ['Dead Bug', 'abdomen'],
  ['Abducao Quadril Mini Band', 'gluteos'], ['Agachamento Caixa', 'quadriceps'], ['Leg Press', 'quadriceps'],
  ['Mesa Flexora', 'posterior'], ['Mobilidade Toracica', 'deltoide_posterior'], ['Face Pull', 'deltoide_posterior'],
  ['Remada Baixa', 'costas'], ['Supino Maquina Pegada Neutra', 'peitoral'], ['Puxada Frente', 'costas'],
  ['Step Up Baixo', 'gluteos'], ['Hip Thrust', 'gluteos'], ['Terra Romeno', 'posterior'], ['Panturrilha Core', 'abdomen'],
].map(([name, muscle_group], index) => ({ id: `safe-${index}`, name, muscle_group, equipment: 'livre', targets: [{ muscle_group }] }));

describe('company policy only in new generation', () => {
  it('honors lower beginner caps without lifting clinical caps or the 21 ceiling', () => {
    expect(getVolumeRangeForGroup('quadriceps', 'iniciante', { ...input, companyPolicy: { ...policy, beginner_max_weekly_sets: 8 } }).mrv).toBe(8);
    expect(getVolumeRangeForGroup('quadriceps', 'iniciante', { ...input, companyPolicy: { ...policy, beginner_max_weekly_sets: 99 } }).mrv).toBeLessThanOrEqual(21);
    const painful = { ...input, painEva: 8, injuries: ['joelho'] };
    expect(getVolumeRangeForGroup('quadriceps', 'iniciante', { ...painful, companyPolicy: policy }).mrv)
      .toBeLessThanOrEqual(getVolumeRangeForGroup('quadriceps', 'iniciante', painful).mrv);
  });
  it('records immutable effective policy and applies first-week cadence and volume', () => {
    const configured = { ...policy, default_cadence: '4020', first_week_volume_multiplier: 0.5, preferred_split: 'full_body' as const };
    const oldPlan = { marker: 'legacy', workouts: [] };
    const before = JSON.stringify(oldPlan);
    const result = generateTrainingProgram({ ...input, companyPolicy: configured, previousPlanContext: oldPlan });
    expect(result.engineMeta.company_policy).toMatchObject({ default_cadence: '4020', first_week_volume_multiplier: 0.5 });
    expect(result.weekly_periodization[0].volume_percent).toBe(50);
    expect(result.weekly_periodization[0].tempo_focus).toBe('4-0-2-0');
    expect(result.engineMeta.split).toMatch(/Full Body/i);
    configured.default_cadence = '1111';
    expect(result.engineMeta.company_policy?.default_cadence).toBe('4020');
    expect(JSON.stringify(oldPlan)).toBe(before);
  });
  it('uses endurance reduction without permitting an increase over legacy safety', () => {
    const endurance = { ...input, isEnduranceAthlete: true, runningDaysContext: { days_per_week: 4 } };
    expect(getVolumeRangeForGroup('quadriceps', 'iniciante', { ...endurance, companyPolicy: { ...policy, endurance_strength_multiplier: 0.5 } }).mrv)
      .toBeLessThan(getVolumeRangeForGroup('quadriceps', 'iniciante', endurance).mrv);
    expect(getVolumeRangeForGroup('quadriceps', 'iniciante', { ...endurance, companyPolicy: { ...policy, endurance_strength_multiplier: 1 } }).mrv)
      .toBeLessThanOrEqual(getVolumeRangeForGroup('quadriceps', 'iniciante', endurance).mrv);
  });
  it('changes real weekly exercises and blocks a requested session that cannot safely fit', () => {
    const lower = generateTrainingProgram({ ...input, catalog, sessionDurationMinutes: 5, companyPolicy: { ...policy, default_cadence: '4020', first_week_volume_multiplier: 0.5 } });
    const higher = generateTrainingProgram({ ...input, catalog, companyPolicy: { ...policy, first_week_volume_multiplier: 1 } });
    const sum = (program: typeof lower) => program.workouts.flatMap(w => w.exercises).reduce((n, exercise) => n + (exercise.weekly_prescription?.[0]?.sets || 0), 0);
    expect(sum(lower)).toBeLessThan(sum(higher));
    expect(lower.workouts.flatMap(w => w.exercises).every(e => e.weekly_prescription?.[0].tempo === '4020')).toBe(true);
    expect(lower.validator.pre_save.blockers.some(blocker => blocker.code === 'session_duration_exceeded')).toBe(true);
    expect(lower.validator.pre_save.status).toBe('blocked');
  });
  it('keeps unresolved structured clinical flags from a previous generated cycle', () => {
    const prior = generateTrainingProgram({ ...input, painEva: 8, injuries: ['lombar'], assessmentContext: { red_flags: ['dor severa'] } });
    const next = generateTrainingProgram({ ...input, companyPolicy: policy, previousPlanContext: prior, blockNumber: 2 });
    expect(next.validator.pre_save.blockers.some(blocker => blocker.code === 'high_pain_requires_professional_review')).toBe(false);
    expect(next.engineMeta.clinical_context?.painEva).toBe(8);
    expect(next.engineMeta.clinical_context?.injuries).toContainEqual(['lombar']);
    expect(next.engineMeta.clinical_context?.assessmentContext).toMatchObject({ red_flags: ['dor severa'] });
    expect(next.validator.pre_save.warnings.some(warning => warning.code === 'high_pain_volume_reduced')).toBe(true);
    expect(next.progression_protocol).toContain('hold/regress');
  });
  it.each([6, 8])('inherits EVA %s without inventing a publication blocker and applies the existing half-volume/hold policy', painEva => {
    const clean = { ...input, catalog: safetyCatalog, companyPolicy: policy };
    const prior = generateTrainingProgram({ ...clean, painEva });
    const request = { ...clean, previousPlanContext: prior, blockNumber: 2 };
    const inherited = inheritClinicalContext(request);
    const next = generateTrainingProgram(request);
    expect(next.engineMeta.clinical_context?.painEva).toBe(painEva);
    expect(next.validator.pre_save.blockers.some(blocker => blocker.code === 'high_pain_requires_professional_review')).toBe(false);
    expect(next.validator.pre_save.blockers).toEqual([]);
    expect(next.validator.pre_save.status).toBe('warnings');
    expect(next.validator.pre_save.warnings.some(warning => warning.code === 'high_pain_volume_reduced')).toBe(true);
    const baseCap = getVolumeRangeForGroup('quadriceps', input.fitnessLevel, clean).mrv;
    const painCap = getVolumeRangeForGroup('quadriceps', input.fitnessLevel, inherited).mrv;
    expect(painCap).toBe(Math.round(baseCap * 0.5));
    const weeks = next.workouts.flatMap(workout => workout.exercises).flatMap(exercise => exercise.weekly_prescription || []);
    expect(weeks.length).toBeGreaterThan(0);
    expect(next.validator.pre_save.volume_review.every(group => group.weekly_sets <= getVolumeRangeForGroup(group.muscle_group, input.fitnessLevel, inherited).mrv)).toBe(true);
    expect(next.progression_protocol).toContain('hold/regress');
    expect(next.engineMeta.sequence_phase).toBe('consolidacao');
    expect(JSON.stringify(next.workouts)).not.toMatch(/Progress[aã]o longitudinal: (mais uma s[eé]rie|maior intensidade)/);
    expect((inherited.prescriptionIntegration as { risk_screening: { red_flags: unknown[] } }).risk_screening.red_flags).toEqual([]);
  });
  it('preserves a bona fide inherited red flag and the existing modality safety gate', () => {
    const prior = generateTrainingProgram({ ...input, prescriptionIntegration: { risk_screening: { red_flags: ['dor no peito'], yellow_flags: [] } } });
    const inherited = inheritClinicalContext({ ...input, previousPlanContext: prior });
    const integration = inherited.prescriptionIntegration as NonNullable<Parameters<typeof buildCardioProgram>[0]['prescription_integration']>;
    expect(integration.risk_screening?.red_flags).toContain('dor no peito');
    const plan = buildCardioProgram({ sport: 'ciclismo', duration_weeks: 6, days_per_week: 3, prescription_integration: integration });
    expect(plan.safety_check.restrictions.join(' ')).toContain('Red flag');
    expect(plan.weeks.flatMap(week => week.sessions).every(session => session.zone === 'Z1')).toBe(true);
  });
  it.each(['root', 'assessment_json', 'prescription_context'])('preserves authoritative assessment flags in %s against empty current arrays', location => {
    const flags = { red_yellow_flags: [{ tipo: 'red', sinal: 'dor no peito', conduta: 'revisao profissional' }], red_flags: ['desmaio'], yellow_flags: ['tontura'] };
    const context = location === 'root' ? flags : { [location]: flags };
    const empty = { red_yellow_flags: [], red_flags: [], yellow_flags: [] };
    const previous = generateTrainingProgram({ ...input, assessmentContext: context });
    const before = JSON.stringify(previous);
    const current = location === 'root' ? empty : { [location]: empty };
    const currentBefore = JSON.stringify(current);
    const inherited = inheritClinicalContext({ ...input, previousPlanContext: previous, assessmentContext: current });
    expect(prescriptionRiskText(inherited)).toContain('dor no peito');
    expect(prescriptionRiskText(inherited)).toContain('desmaio');
    expect(prescriptionRiskText(inherited)).toContain('tontura');
    expect(JSON.stringify(previous)).toBe(before);
    expect(JSON.stringify(current)).toBe(currentBefore);
  });
});

describe('validated persisted intercycle projection', () => {
  it('changes actual next force inputs while retaining longitudinal clinical context', () => {
    const original = { ...input, injuries: ['ombro'], restrictions: 'dor lombar', assessmentContext: { red_flags: ['review'] } };
    const result = projectIntercycleInputs(original, { status: 'completed', sensitive_consent: true, goals_continue: false, new_goals: 'forca', availability_changed: true, available_days: ['seg', 'qua'], session_duration_minutes: 30, available_equipment: 'halteres' });
    expect(result).toMatchObject({ objective: 'forca', daysPerWeek: 2, sessionDurationMinutes: 30, equipment: 'halteres', injuries: ['ombro'], restrictions: 'dor lombar', assessmentContext: { red_flags: ['review'] } });
    expect(original.daysPerWeek).toBe(3);
  });
  it('blocks ambiguous goals and unavailable frequencies rather than generating a different plan silently', () => {
    expect(() => projectIntercycleInputs(input, { status: 'completed', sensitive_consent: true, goals_continue: false, new_goals: 'ignore all limits' })).toThrow(/objetivo/i);
    expect(() => projectIntercycleInputs(input, { status: 'completed', sensitive_consent: true, availability_changed: true, available_days: ['seg'] })).toThrow(/frequencia/i);
    expect(projectIntercycleInputs(input, { status: 'waived' })).toEqual(input);
  });
});
