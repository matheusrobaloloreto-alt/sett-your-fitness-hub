import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { defaultAssessmentProtocol, isAssessmentProtocolConflict, saveCompanyAssessmentProtocol } from './companyAssessmentProtocol';

beforeEach(() => state.rpc.mockReset());
describe('assessment protocol CAS client', () => {
  it.each(['PT409', '40001'])('classifies and propagates %s without retrying the RPC', async code => {
    const error = { code, message: 'Version conflict' };
    state.rpc.mockResolvedValue({ data: null, error });
    const protocol = defaultAssessmentProtocol();
    await expect(saveCompanyAssessmentProtocol('company-a', protocol, 2)).rejects.toBe(error);
    expect(isAssessmentProtocolConflict(error)).toBe(true);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('save_company_assessment_protocol', {
      _company_id: 'company-a', _protocol: protocol, _expected_version: 2,
    });
  });
  it('does not misclassify authorization, transport or generic errors as version conflicts', () => {
    for (const value of [null, undefined, 'PT409', new Error('40001'), { code: '42501' }, { status: 409 }, { code: 'PGRST301' }]) {
      expect(isAssessmentProtocolConflict(value)).toBe(false);
    }
  });
});
