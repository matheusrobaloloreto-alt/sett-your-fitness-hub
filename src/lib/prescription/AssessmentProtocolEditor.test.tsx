import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAssessmentProtocol } from '../../../supabase/functions/_shared/prescription/assessmentProtocol';
import AssessmentProtocolEditor from './AssessmentProtocolEditor';
const state = vi.hoisted(() => ({ role: 'admin', fetch: vi.fn(), save: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: state.role }) }));
vi.mock('./companyAssessmentProtocol', async importOriginal => ({ ...await importOriginal<object>(), fetchCompanyAssessmentProtocol: (...args: unknown[]) => state.fetch(...args), saveCompanyAssessmentProtocol: (...args: unknown[]) => state.save(...args) }));
afterEach(cleanup);
beforeEach(() => {
  state.role = 'admin';
  let record = { protocol: defaultAssessmentProtocol(), version: 2 };
  state.fetch.mockReset().mockImplementation(async () => structuredClone(record));
  state.save.mockReset().mockImplementation(async (_company, protocol, expected) => { record = { protocol, version: expected + 1 }; return structuredClone(record); });
});
describe('approved structured assessment editor', () => {
  it('locks mandatory screening, edits labels/order/guidance and enables approved optional tests with OCC', async () => {
    render(<AssessmentProtocolEditor companyId="company-a" />);
    const mandatory = await screen.findByRole('checkbox', { name: 'Incluir Vista Anterior' });
    expect(mandatory).toBeChecked(); expect(mandatory).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rotulo de Vista Anterior'), { target: { value: 'Frente da empresa' } });
    fireEvent.change(screen.getByLabelText('Orientacoes de Vista Anterior'), { target: { value: 'Manter enquadramento completo' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir Toe Touch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subir Toe Touch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar protocolo' }));
    await screen.findByText('Protocolo salvo.');
    expect(state.save).toHaveBeenCalledWith('company-a', expect.objectContaining({ tests: expect.arrayContaining([expect.objectContaining({ id: 'posture_anterior', enabled: true, label: 'Frente da empresa', instructions: 'Manter enquadramento completo' }), expect.objectContaining({ id: 'toe_touch', enabled: true })]) }), 2);
    expect(state.save.mock.calls[0][1].tests.findIndex((test: { id: string }) => test.id === 'toe_touch')).toBe(8);
    expect(screen.getByText('Versao 3')).toBeInTheDocument();
  });
  it.each(['PT409', '40001'])('keeps a conflicting draft for %s without retrying and rejects editing after a read failure', async code => {
    state.save.mockRejectedValue({ code });
    const view = render(<AssessmentProtocolEditor companyId="company-a" />);
    const label = await screen.findByLabelText('Rotulo de Vista Anterior');
    fireEvent.change(label, { target: { value: 'Meu rascunho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar protocolo' }));
    await screen.findByText(/Conflito de versao/);
    expect(label).toHaveValue('Meu rascunho');
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Versao 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar protocolo' })).toBeEnabled();
    state.fetch.mockRejectedValue(new Error('read failed'));
    view.rerender(<AssessmentProtocolEditor companyId="company-b" />);
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar protocolo' })).not.toBeInTheDocument());
  });
  it('does not load or expose an editor for a trainer', () => {
    state.role = 'trainer'; const { container } = render(<AssessmentProtocolEditor companyId="company-a" />);
    expect(container).toBeEmptyDOMElement(); expect(state.fetch).not.toHaveBeenCalled();
  });
});
