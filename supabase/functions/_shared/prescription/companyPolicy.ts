import { normalizeCompanyProductSettings, type CompanyProductSettings } from '../company-product-settings.ts';
import type { PrescriptionInput } from './types.ts';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function inheritClinicalContext(input: PrescriptionInput): PrescriptionInput {
  const previous = record(record(record(input.previousPlanContext).engineMeta).clinical_context);
  if (!Object.keys(previous).length) return { ...input };
  const findings = (value: unknown): unknown[] => {
    const assessment = record(value);
    return [assessment.ohs_compensations, record(assessment.prescription_context).ohs_compensations, record(assessment.assessment_json).ohs_compensations].flatMap(items => Array.isArray(items) ? items : []);
  };
  const mergedValues = (...values: unknown[]): unknown[] => values.flatMap(value => Array.isArray(value) ? value : value == null ? [] : [value]);
  const mergeAssessmentFlags = (before: unknown, current: unknown): Record<string, unknown> => {
    const prior = record(before); const latest = record(current);
    const merged = { ...prior, ...latest };
    for (const key of ['red_yellow_flags', 'red_flags', 'yellow_flags']) {
      if (key in prior || key in latest) merged[key] = mergedValues(prior[key], latest[key]);
    }
    return merged;
  };
  const previousAssessment = record(previous.assessmentContext);
  const currentAssessment = record(input.assessmentContext);
  const assessment = mergeAssessmentFlags(previousAssessment, currentAssessment);
  for (const key of ['assessment_json', 'prescription_context']) {
    if (key in previousAssessment || key in currentAssessment) assessment[key] = mergeAssessmentFlags(previousAssessment[key], currentAssessment[key]);
  }
  // Only a structured snapshot written by this generation path is carried forward.
  // Clearing an unresolved safety flag requires a separate professional review workflow.
  return {
    ...input,
    restrictions: [previous.restrictions, input.restrictions].filter(Boolean),
    injuries: [previous.injuries, input.injuries].filter(Boolean),
    painEva: Math.max(Number(previous.painEva) || 0, Number(input.painEva) || 0),
    painReports: [...(Array.isArray(previous.painReports) ? previous.painReports : []), ...(input.painReports || [])],
    techniqueBreakdown: previous.techniqueBreakdown === true || input.techniqueBreakdown,
    assessmentContext: { ...assessment, ohs_compensations: [...findings(previous.assessmentContext), ...findings(input.assessmentContext)] },
    anamneseContext: { ...record(input.anamneseContext), longitudinal_clinical: previous.anamneseContext },
    prescriptionIntegration: {
      ...record(input.prescriptionIntegration),
      risk_screening: {
        ...record(record(input.prescriptionIntegration).risk_screening),
        red_flags: mergedValues(record(record(previous.prescriptionIntegration).risk_screening).red_flags, record(record(input.prescriptionIntegration).risk_screening).red_flags),
        yellow_flags: mergedValues(record(record(previous.prescriptionIntegration).risk_screening).yellow_flags, record(record(input.prescriptionIntegration).risk_screening).yellow_flags),
        pain_or_injury_text: mergedValues(record(record(previous.prescriptionIntegration).risk_screening).pain_or_injury_text, record(record(input.prescriptionIntegration).risk_screening).pain_or_injury_text),
      },
    },
  };
}

export function projectIntercycleInputs(input: PrescriptionInput, response: unknown): PrescriptionInput {
  const next = { ...input };
  if (!response || typeof response !== 'object') return next;
  const answer = response as Record<string, unknown>;
  if (answer.status !== 'completed') return next;
  if (answer.sensitive_consent !== true) throw new Error('Interciclos sem consentimento valido.');
  if (answer.goals_continue === false) {
    const goal = String(answer.new_goals || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const goals: Record<string, string> = { forca: 'forca', hipertrofia: 'hipertrofia', emagrecimento: 'emagrecimento', recomposicao: 'recomposicao', performance: 'performance', saude: 'saude' };
    if (!goals[goal]) throw new Error('Novo objetivo exige classificacao explicita pelo profissional.');
    next.objective = goals[goal];
  }
  if (answer.availability_changed === true) {
    if (Array.isArray(answer.available_days) && answer.available_days.length) {
      const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
      const days = answer.available_days.map(day => dayNames.indexOf(String(day).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
      if (days.some(day => day < 0) || new Set(days).size !== days.length || days.length < 2 || days.length > 6) throw new Error('Nova frequencia exige 2 a 6 dias distintos validos.');
      next.daysPerWeek = days.length;
      next.availableDays = days;
    }
    if (answer.session_duration_minutes != null) {
      const duration = Number(answer.session_duration_minutes);
      if (!Number.isInteger(duration) || duration < 5 || duration > 360) throw new Error('Duracao interciclos invalida.');
      next.sessionDurationMinutes = duration;
    }
    if (typeof answer.available_equipment === 'string' && answer.available_equipment.trim()) next.equipment = answer.available_equipment.trim().slice(0, 500);
    // A location alone cannot prove full equipment access.
    else if (typeof answer.training_location === 'string' && answer.training_location.trim()) throw new Error('Novo local exige equipamentos definidos pelo profissional.');
  }
  return next;
}

// Receives only a persisted, tenant/student-scoped initial questionnaire snapshot.
// No raw request, code, expression, clinical-field replacement or inferred answer is accepted.
export function projectAdditionalPrescriptionAnswers(
  input: PrescriptionInput, answers: unknown, policy: CompanyProductSettings['prescription'],
): PrescriptionInput {
  const mappings = normalizeCompanyProductSettings({ prescription: policy }).prescription.answer_mappings;
  const next = { ...input };
  if (!mappings.length) return next;
  const snapshot = record(answers);
  for (const source of new Set(mappings.map(mapping => mapping.source_key))) {
    const answer = snapshot[source];
    if (answer === undefined || answer === null || answer === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof answer)) throw new Error(`Resposta adicional exige revisão: ${source}`);
    const mapping = mappings.find(item => item.source_key === source && item.answer === String(answer));
    if (!mapping) throw new Error(`Resposta adicional sem mapeamento canônico: ${source}`);
    switch (mapping.target) {
      case 'objective': next.objective = mapping.value; break;
      case 'equipment': next.equipment = mapping.value; break;
      case 'sessionDurationMinutes': next.sessionDurationMinutes = Number(mapping.value); break;
      case 'daysPerWeek':
        if (input.availableDays?.length && input.availableDays.length !== Number(mapping.value)) throw new Error('Frequência adicional diverge dos dias disponíveis; revise com o profissional.');
        next.daysPerWeek = Number(mapping.value); break;
    }
  }
  return next;
}
