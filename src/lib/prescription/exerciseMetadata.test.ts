import { describe, expect, it, vi } from 'vitest';
import { prepareExerciseMetadata, saveExerciseMetadata } from './exerciseMetadata';

const source = { id: '00000000-0000-4000-8000-000000000001', company_id: 'company-a', is_global: false };
const equivalent = { id: '00000000-0000-4000-8000-000000000002', company_id: null, is_global: true };
const foreign = { id: '00000000-0000-4000-8000-000000000003', company_id: 'company-b', is_global: false };
const draft = { contraindications: 'dor lombar\nombro', regressions: 'Reduzir amplitude', equivalent_substitutes: [equivalent.id] };
describe('owned exercise technical metadata', () => {
  it('writes the canonical exercise id and real exercise_metadata columns', async () => {
    const payload = prepareExerciseMetadata(source, 'company-a', 'admin', [source, equivalent], draft);
    expect(payload).toEqual({ exercise_id: source.id, contraindications: ['dor lombar', 'ombro'], regressions: ['Reduzir amplitude'], equivalent_substitutes: [equivalent.id] });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    await saveExerciseMetadata({ from }, payload);
    expect(from).toHaveBeenCalledWith('exercise_metadata');
    expect(upsert).toHaveBeenCalledWith(payload, { onConflict: 'exercise_id' });
  });
  it('rejects global ownership, foreign source, student and foreign substitutes', () => {
    expect(() => prepareExerciseMetadata(equivalent, 'company-a', 'master', [source, equivalent], draft)).toThrow(/empresa/i);
    expect(() => prepareExerciseMetadata(source, 'company-b', 'admin', [source, equivalent], draft)).toThrow(/empresa/i);
    expect(() => prepareExerciseMetadata(source, 'company-a', 'student', [source, equivalent], draft)).toThrow(/permissao/i);
    expect(() => prepareExerciseMetadata(source, 'company-a', 'admin', [source, foreign], { ...draft, equivalent_substitutes: [foreign.id] })).toThrow(/substituicao/i);
    expect(() => prepareExerciseMetadata(source, 'company-a', 'admin', [source], { ...draft, equivalent_substitutes: ['nome de exercicio'] })).toThrow(/substituicao/i);
  });
});
