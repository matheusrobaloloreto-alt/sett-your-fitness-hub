import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { generateTrainingProgram } from './engine';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '../../../supabase/functions/_shared/company-product-settings';
import { inheritClinicalContext, projectIntercycleInputs } from '../../../supabase/functions/_shared/prescription/companyPolicy';
import { prescriptionRiskText } from '../../../supabase/functions/_shared/prescription/clinicalContext';
import { defaultAssessmentProtocol, assertAssessmentFrameCoverage, resolveAssessmentCapture } from '../../../supabase/functions/_shared/prescription/assessmentProtocol';
import type { PrescriptionInput } from './types';

const base: PrescriptionInput = { objective: 'hipertrofia', fitnessLevel: 'iniciante', daysPerWeek: 2, catalog: [], equipment: 'halteres', companyPolicy: DEFAULT_COMPANY_PRODUCT_SETTINGS.prescription };

describe('independent prescribed policy and persisted safety review', () => {
  it('keeps Sunday from persisted intercyle availability in the actual engine calendar', () => {
    const projected = projectIntercycleInputs(base, { status: 'completed', sensitive_consent: true, availability_changed: true, available_days: ['Dom', 'Qua'], available_equipment: 'halteres' });
    expect(projected.availableDays).toEqual([0, 3]);
    const program = generateTrainingProgram(projected);
    expect(program.workouts.map(workout => workout.day_of_week)).toEqual([0, 3]);
  });

  it('does not erase a persisted assessment red flag with a newer empty assessment object', () => {
    const previous = generateTrainingProgram({ ...base, assessmentContext: { red_yellow_flags: [{ tipo: 'red', sinal: 'dor no peito', conduta: 'revisao profissional' }] } });
    const next = inheritClinicalContext({ ...base, previousPlanContext: previous, assessmentContext: { red_yellow_flags: [] } });
    expect(prescriptionRiskText(next)).toContain('dor no peito');
  });

  it('changes only the future plan, preserving the serialized old plan and effective old policy', () => {
    const previous = generateTrainingProgram({ ...base, companyPolicy: { ...base.companyPolicy!, default_cadence: '3010' } });
    const before = JSON.stringify(previous);
    const next = generateTrainingProgram({ ...base, previousPlanContext: previous, companyPolicy: { ...base.companyPolicy!, default_cadence: '4020' } });
    expect(JSON.stringify(previous)).toBe(before);
    expect(previous.engineMeta.company_policy?.default_cadence).toBe('3010');
    expect(next.engineMeta.company_policy?.default_cadence).toBe('4020');
  });

  it('applies the published mandatory assessment protocol to a new legacy-image envelope too', async () => {
    // Execute the actual endpoint preflight statements, without importing its model/network runtime.
    const source = readFileSync('supabase/functions/ai-functional-assessment/index.ts', 'utf8');
    const ast = ts.createSourceFile('assessment.ts', source, ts.ScriptTarget.Latest, true);
    const declarations = new Map<string, ts.VariableStatement>();
    const visit = (node: ts.Node) => {
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const start = declarations.get('companyProtocolCandidate');
    const end = declarations.get('effectiveExpectedMovements');
    expect(start).toBeDefined(); expect(end).toBeDefined();
    const preflight = source.slice(start!.getStart(ast), end!.end);
    const js = ts.transpileModule(preflight, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const read = vi.fn(async () => ({ version: 2, protocol: defaultAssessmentProtocol() }));
    class LocalHttpError extends Error { constructor(public status: number, message: string) { super(message); } }
    const execute = new Function('readCompanyAssessmentProtocol', 'assertAssessmentFrameCoverage', 'resolveAssessmentCapture', 'HttpError', `return (async()=>{const supabaseAdmin={}; const authorizedCompanyId='synthetic-company'; const frames=undefined; const protocol_hint=''; const company_protocol_version=2; const expected_movements=[]; const image_postura_frente='synthetic-image', image_postura_lado='synthetic-image', image_postura_costas='synthetic-image', image_squat_frente='synthetic-image', image_squat_lado='synthetic-image', image_squat_costas='synthetic-image'; ${js}\nreturn effectiveExpectedMovements;})()`);
    await expect(execute(read, assertAssessmentFrameCoverage, resolveAssessmentCapture, LocalHttpError)).rejects.toMatchObject({ status: 400 });
    expect(read).toHaveBeenCalledWith({}, 'synthetic-company');
  });
});
