import { describe, expect, it } from 'vitest';
import { APPROVED_ASSESSMENT_TESTS, defaultAssessmentProtocol, normalizeAssessmentProtocol, resolveAssessmentCapture, assertAssessmentProtocolCoverage, assertAssessmentFrameCoverage } from '../../../supabase/functions/_shared/prescription/assessmentProtocol';
import { buildDeterministicAssessmentJson } from '../../../supabase/functions/_shared/assessment/engine';

describe('approved company assessment protocol', () => {
  it('uses the existing eight mandatory canonical views and optionally selects approved extra tests', () => {
    const settings = defaultAssessmentProtocol();
    const baseline = resolveAssessmentCapture(settings);
    expect(baseline.vistas).toHaveLength(8);
    expect(baseline.vistas).toContain('Vista Anterior OHS');
    const optional = settings.tests.find(test => !APPROVED_ASSESSMENT_TESTS.find(entry => entry.id === test.id)?.required)!;
    optional.enabled = true; optional.label = 'Teste adicional da empresa'; optional.instructions = 'Orientacao visivel ao profissional';
    settings.tests.reverse();
    const changed = resolveAssessmentCapture(normalizeAssessmentProtocol(settings));
    expect(changed.vistas).toHaveLength(9);
    expect(changed.labels).toContain('Teste adicional da empresa');
    expect(changed.vistas).not.toContain('Teste adicional da empresa');
    expect(changed.instructions).toContain('Orientacao visivel ao profissional');
  });
  it('rejects hidden mandatory screening, unknown tests, duplicate IDs and changed risk scales or criteria', () => {
    const settings = defaultAssessmentProtocol();
    settings.tests[0].enabled = false;
    expect(() => normalizeAssessmentProtocol(settings)).toThrow(/obrigatorio/i);
    expect(() => normalizeAssessmentProtocol({ ...defaultAssessmentProtocol(), scale_id: 'inventada' })).toThrow(/escala/i);
    expect(() => normalizeAssessmentProtocol({ ...defaultAssessmentProtocol(), risk_threshold: 99 })).toThrow(/campo/i);
    const duplicate = defaultAssessmentProtocol(); duplicate.tests[1].id = duplicate.tests[0].id;
    expect(() => normalizeAssessmentProtocol(duplicate)).toThrow(/catalogo/i);
    const unknown = defaultAssessmentProtocol(); unknown.tests[0].id = 'novo-teste-clinico';
    expect(() => normalizeAssessmentProtocol(unknown)).toThrow(/catalogo/i);
  });
  it('requires all mandatory technical views even when presentation labels are changed', () => {
    const settings = defaultAssessmentProtocol(); settings.tests[0].label = 'Rotulo alterado';
    const capture = resolveAssessmentCapture(settings);
    expect(() => assertAssessmentProtocolCoverage(capture.vistas, settings)).not.toThrow();
    expect(() => assertAssessmentProtocolCoverage(capture.vistas.slice(1), settings)).toThrow(/obrigatorio/i);
    expect(() => assertAssessmentProtocolCoverage(['Rotulo alterado', ...capture.vistas.slice(1)], settings)).toThrow(/obrigatorio/i);
  });
  it('keeps existing clinical scores and risk flags when company presentation is customized', () => {
    const original = defaultAssessmentProtocol();
    const custom = defaultAssessmentProtocol(); custom.tests.reverse(); custom.tests[0].label = 'Rotulo empresarial'; custom.tests[0].instructions = 'Nao alterar limiares';
    const common = { frameRefs: [{ frameId: 'qa', vista: 'Vista Anterior OHS' }], queixa_principal: 'Dor forte no joelho EVA 7', reason: 'test', frame_findings: [{ frameId: 'qa', vista: 'Vista Anterior OHS', findings: [{ descricao: 'Valgo dinamico', gravidade: 'Severa' }] }] };
    const baseline = buildDeterministicAssessmentJson({ ...common, expected_movements: resolveAssessmentCapture(original).vistas });
    const changed = buildDeterministicAssessmentJson({ ...common, expected_movements: resolveAssessmentCapture(custom).vistas });
    expect(changed.score_funcional).toEqual(baseline.score_funcional);
    expect(changed.red_yellow_flags).toEqual(baseline.red_yellow_flags);
    expect(changed.ohs_compensations).toEqual(baseline.ohs_compensations);
    expect(JSON.stringify(changed)).not.toContain('Rotulo empresarial');
  });
  it('does not accept a mandatory view name without image evidence', () => {
    const protocol = defaultAssessmentProtocol();
    const frames = resolveAssessmentCapture(protocol).vistas.map(vista => ({ vista, data: 'synthetic-image' }));
    expect(() => assertAssessmentFrameCoverage(frames, protocol)).not.toThrow();
    frames[0].data = '   ';
    expect(() => assertAssessmentFrameCoverage(frames, protocol)).toThrow(/obrigatorio/i);
    expect(() => assertAssessmentFrameCoverage([{ vista: frames[0].vista, base64: 'synthetic-image' }, ...frames.slice(1)], protocol)).not.toThrow();
  });
});
