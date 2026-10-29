import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { assertAssessmentFrameCoverage, defaultAssessmentProtocol, resolveAssessmentCapture } from '../../../supabase/functions/_shared/prescription/assessmentProtocol';

const source = readFileSync('supabase/functions/ai-functional-assessment/index.ts', 'utf8');
const ast = ts.createSourceFile('assessment.ts', source, ts.ScriptTarget.Latest, true);
const statements = new Map<string, ts.VariableStatement>();
function visit(node: ts.Node) {
  if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) statements.set(declaration.name.text, node);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const start = statements.get('companyProtocolCandidate');
const end = statements.get('effectiveExpectedMovements');
if (!start || !end) throw new Error('Actual assessment preflight not found');
const javascript = ts.transpileModule(source.slice(start.getStart(ast), end.end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
class LocalHttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const execute = new Function('input', 'readCompanyAssessmentProtocol', 'assertAssessmentFrameCoverage', 'resolveAssessmentCapture', 'HttpError', `return (async()=>{
  const supabaseAdmin={};const authorizedCompanyId='synthetic-company';
  const {frames,protocol_hint='',company_protocol_version,expected_movements=[],image_postura_frente,image_postura_lado,image_postura_costas,image_squat_frente,image_squat_lado,image_squat_costas}=input;
  ${javascript}\nreturn effectiveExpectedMovements;
})()`);
const protocol = defaultAssessmentProtocol();
function preflight(input: Record<string, unknown>, version = 2, selected = protocol) {
  const read = vi.fn(async () => ({ version, protocol: selected }));
  const result = execute(input, read, assertAssessmentFrameCoverage, resolveAssessmentCapture, LocalHttpError);
  return { read, result };
}

describe('actual assessment preflight envelope safety', () => {
  it.each(['image_postura_frente', 'image_postura_lado', 'image_postura_costas', 'image_squat_frente', 'image_squat_lado', 'image_squat_costas'])('requires published screening for a new %s envelope', async field => {
    const { read, result } = preflight({ [field]: 'synthetic-image', company_protocol_version: 2 });
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(read).toHaveBeenCalledOnce();
  });
  it('preserves text-only legacy flow without requiring image capture or loading a protocol', async () => {
    const { read, result } = preflight({ expected_movements: ['legacy text context'] });
    await expect(result).resolves.toEqual(['legacy text context']);
    expect(read).not.toHaveBeenCalled();
  });
  it('preserves legacy visual flow where no company protocol has been published', async () => {
    const { read, result } = preflight({ image_postura_frente: 'synthetic-image', expected_movements: ['legacy view'] }, 0);
    await expect(result).resolves.toEqual(['legacy view']);
    expect(read).toHaveBeenCalledOnce();
  });
  it('accepts complete canonical capture and rejects stale/missing versions or missing selected optional evidence', async () => {
    const selected = defaultAssessmentProtocol(); selected.tests.find(test => test.id === 'toe_touch')!.enabled = true;
    const capture = resolveAssessmentCapture(selected);
    const frames = capture.vistas.map(vista => ({ vista, data: 'synthetic-image' }));
    await expect(preflight({ frames, company_protocol_version: 2 }, 2, selected).result).resolves.toEqual(capture.vistas);
    for (const company_protocol_version of [undefined, 1]) await expect(preflight({ frames, company_protocol_version }, 2, selected).result).rejects.toMatchObject({ status: 409 });
    await expect(preflight({ frames: frames.slice(0, -1), company_protocol_version: 2 }, 2, selected).result).rejects.toMatchObject({ status: 400 });
  });
});
