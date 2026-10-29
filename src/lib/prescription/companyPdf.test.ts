import { describe, expect, it } from 'vitest';
import { generateAssessmentPDF, generateStrengthPDF } from '@/lib/generatePDFs';
import { generateTrainingProgram } from './engine';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '../../../supabase/functions/_shared/company-product-settings';

describe('company PDF identity', () => {
  const meta = { studentName: 'Aluno Sintetico', date: '26/10/2026', company: 'Empresa Aurora', professional: 'Profissional Teste', cref: '12345-X' };
  it('does not leak an engine brand through a real newly generated company plan', () => {
    const plan = generateTrainingProgram({ objective: 'hipertrofia', fitnessLevel: 'iniciante', daysPerWeek: 2, companyPolicy: DEFAULT_COMPANY_PRODUCT_SETTINGS.prescription, catalog: [{ id: 'synthetic', name: 'Agachamento Prancha Remada Supino Mobilidade', muscle_group: 'quadriceps', equipment: 'livre' }] });
    expect(generateStrengthPDF(plan, meta).output()).not.toMatch(/\bBN\b|BN Performance|Matheus Loreto|040718/);
  });
  for (const [name, generate] of [['strength', generateStrengthPDF], ['assessment', generateAssessmentPDF]] as const) {
    it(`${name} renders configured identity without another company fallback`, () => {
      const text = generate({}, meta).output();
      expect(text).toContain('Empresa Aurora');
      expect(text).toContain('Profissional Teste');
      expect(text).toContain('12345-X');
      expect(text).not.toMatch(/\(BN\)|BN Performance|Matheus Loreto|040718/);
    });
    it(`${name} never invents missing professional identity`, () => {
      const text = generate({}, { studentName: 'Teste', date: '26/10/2026' }).output();
      expect(text).not.toMatch(/\(BN\)|BN Performance|Matheus Loreto|040718/);
    });
  }
});
