import { ASSESSMENT_ENGINE_VERSION } from '../assessment/engine.ts';
export const ASSESSMENT_CATALOG_VERSION = 'sett-approved-assessment-v1';
export const ASSESSMENT_SCALE_ID = 'functional_severity_v1';
export const APPROVED_ASSESSMENT_TESTS = [
  { id: 'posture_anterior', canonical: 'Vista Anterior', required: true },
  { id: 'posture_lateral_d', canonical: 'Vista Lateral D', required: true },
  { id: 'posture_posterior', canonical: 'Vista Posterior', required: true },
  { id: 'posture_lateral_e', canonical: 'Vista Lateral E', required: true },
  { id: 'ohs_anterior', canonical: 'Vista Anterior OHS', required: true },
  { id: 'ohs_lateral_1', canonical: 'Vista Lateral OHS 1', required: true },
  { id: 'ohs_posterior', canonical: 'Vista Posterior OHS', required: true },
  { id: 'ohs_lateral_2', canonical: 'Vista Lateral OHS 2', required: true },
  { id: 'air_squat', canonical: 'Air Squat', required: false },
  { id: 'toe_touch', canonical: 'Toe Touch', required: false },
  { id: 'lunge', canonical: 'Lunge alternado', required: false },
  { id: 'shoulder_flexion', canonical: 'Shoulder Flexion', required: false },
  { id: 'march', canonical: 'Marcha estacionaria', required: false },
  { id: 'balance_d', canonical: 'Equilibrio unipodal D', required: false },
  { id: 'balance_e', canonical: 'Equilibrio unipodal E', required: false },
] as const;
export interface CompanyAssessmentProtocol {
  catalog_version: typeof ASSESSMENT_CATALOG_VERSION;
  engine_version: typeof ASSESSMENT_ENGINE_VERSION;
  scale_id: typeof ASSESSMENT_SCALE_ID;
  tests: Array<{ id: string; enabled: boolean; label: string; instructions: string }>;
}
export function defaultAssessmentProtocol(): CompanyAssessmentProtocol {
  return { catalog_version: ASSESSMENT_CATALOG_VERSION, engine_version: ASSESSMENT_ENGINE_VERSION, scale_id: ASSESSMENT_SCALE_ID, tests: APPROVED_ASSESSMENT_TESTS.map(test => ({ id: test.id, enabled: test.required, label: test.canonical, instructions: '' })) };
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function normalizeAssessmentProtocol(input: unknown): CompanyAssessmentProtocol {
  if (!object(input) || Object.keys(input).length !== 4 || Object.keys(input).some(key => !['catalog_version','engine_version','scale_id','tests'].includes(key))) throw new Error('Campo de protocolo nao permitido.');
  if (input.scale_id !== ASSESSMENT_SCALE_ID) throw new Error('Escala clinica imutavel.');
  if (input.catalog_version !== ASSESSMENT_CATALOG_VERSION || input.engine_version !== ASSESSMENT_ENGINE_VERSION) throw new Error('Catalogo ou criterios clinicos invalidos.');
  if (!Array.isArray(input.tests) || input.tests.length !== APPROVED_ASSESSMENT_TESTS.length) throw new Error('Catalogo incompleto.');
  const seen = new Set<string>();
  const tests = input.tests.map(entry => {
    if (!object(entry) || Object.keys(entry).length !== 4 || Object.keys(entry).some(key => !['id','enabled','label','instructions'].includes(key))) throw new Error('Campo de teste nao permitido.');
    const definition = APPROVED_ASSESSMENT_TESTS.find(test => test.id === entry.id);
    if (!definition || seen.has(definition.id)) throw new Error('Catalogo desconhecido ou duplicado.');
    seen.add(definition.id);
    if (typeof entry.enabled !== 'boolean' || (definition.required && !entry.enabled)) throw new Error('Teste obrigatorio nao pode ser ocultado.');
    if (typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 120 || typeof entry.instructions !== 'string' || entry.instructions.length > 600) throw new Error('Rotulo ou orientacao invalida.');
    return { id: definition.id, enabled: entry.enabled, label: entry.label.trim(), instructions: entry.instructions };
  });
  return { catalog_version: ASSESSMENT_CATALOG_VERSION, engine_version: ASSESSMENT_ENGINE_VERSION, scale_id: ASSESSMENT_SCALE_ID, tests };
}
export function resolveAssessmentCapture(input: unknown): {
  label: string; hint: string; description: string;
  vistas: string[]; labels: string[]; instructions: string[]; fractions: number[];
} {
  const protocol = normalizeAssessmentProtocol(input);
  const enabled = protocol.tests.filter(test => test.enabled);
  return {
    label: 'Protocolo da empresa', hint: 'company_approved_v1', description: 'Postura, OHS e testes complementares selecionados.',
    vistas: enabled.map(test => APPROVED_ASSESSMENT_TESTS.find(definition => definition.id === test.id)!.canonical),
    labels: enabled.map(test => test.label), instructions: enabled.map(test => test.instructions),
    fractions: enabled.map((_, index) => 0.05 + index * (0.9 / Math.max(1, enabled.length - 1))),
  };
}
export function assertAssessmentProtocolCoverage(views: unknown, input: unknown): void {
  const protocol = normalizeAssessmentProtocol(input);
  const present = new Set(Array.isArray(views) ? views.filter((view): view is string => typeof view === 'string') : []);
  for (const test of APPROVED_ASSESSMENT_TESTS.filter(test => test.required)) {
    if (!present.has(test.canonical)) throw new Error(`Teste obrigatorio ausente: ${test.canonical}`);
  }
  for (const test of protocol.tests.filter(test => test.enabled)) {
    const definition = APPROVED_ASSESSMENT_TESTS.find(entry => entry.id === test.id)!;
    if (!present.has(definition.canonical)) throw new Error(`Teste selecionado ausente: ${definition.canonical}`);
  }
}
export function assertAssessmentFrameCoverage(frames: unknown, input: unknown): void {
  const views = Array.isArray(frames) ? frames.filter(frame => object(frame)
    && ((typeof frame.data === 'string' && frame.data.trim().length > 0)
      || (typeof frame.base64 === 'string' && frame.base64.trim().length > 0)))
    .map(frame => frame.vista) : [];
  assertAssessmentProtocolCoverage(views, input);
}
export interface AssessmentProtocolRecord { protocol: CompanyAssessmentProtocol; version: number; updated_at?: string | null; updated_by?: string | null; }
export interface AssessmentProtocolReader {
  from(table: 'company_assessment_protocols'): { select(columns: string): { eq(key: 'company_id', value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> } } };
}
export function parseAssessmentProtocolRecord(value: unknown): AssessmentProtocolRecord {
  if (!object(value) || !Number.isSafeInteger(value.version) || Number(value.version) < 0) throw new Error('Versao de protocolo invalida.');
  return { protocol: normalizeAssessmentProtocol(value.protocol), version: Number(value.version), updated_at: typeof value.updated_at === 'string' ? value.updated_at : null, updated_by: typeof value.updated_by === 'string' ? value.updated_by : null };
}
export async function readCompanyAssessmentProtocol(client: AssessmentProtocolReader, companyId: string): Promise<AssessmentProtocolRecord> {
  if (!companyId) throw new Error('Empresa obrigatoria.');
  const { data, error } = await client.from('company_assessment_protocols').select('protocol,version,updated_at,updated_by').eq('company_id', companyId).maybeSingle();
  if (error && !['42P01','PGRST205'].includes(error.code || '')) throw new Error(error.message);
  return data ? parseAssessmentProtocolRecord(data) : { protocol: defaultAssessmentProtocol(), version: 0, updated_at: null, updated_by: null };
}
