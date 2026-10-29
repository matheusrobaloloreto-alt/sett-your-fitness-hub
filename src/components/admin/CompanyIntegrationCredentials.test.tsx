import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CompanyIntegrationCredentials from './CompanyIntegrationCredentials';
const state = vi.hoisted(() => ({ role: 'admin', companyId: 'a', isViewingCompany: false, viewingCompany: null as { id: string } | null }));
const api = vi.hoisted(() => ({ fetchIntegrationStatus: vi.fn(), saveIntegrationCredentials: vi.fn(), removeIntegrationCredentials: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => state }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => state }));
vi.mock('@/lib/companyIntegrationCredentials', () => api);
function statuses(version = 0) { return [
  { provider: 'asaas', configured: version > 0, mask: version > 0 ? '••••••••' : null, version, consumer_enabled: false },
  { provider: 'whatsapp_evolution', configured: false, mask: null, version: 0, consumer_enabled: false },
]; }
beforeEach(() => {
  vi.resetAllMocks(); state.role = 'admin'; state.companyId = 'a'; state.isViewingCompany = false; state.viewingCompany = null;
  api.fetchIntegrationStatus.mockResolvedValue(statuses());
  api.saveIntegrationCredentials.mockResolvedValue(statuses(1));
  api.removeIntegrationCredentials.mockResolvedValue(statuses());
});
afterEach(cleanup);
it('saves explicit Asaas environment, clears password, displays prepared only, and removes', async () => {
  render(<CompanyIntegrationCredentials companyId="a" />);
  const input = await screen.findByLabelText('Nova chave Asaas');
  expect(input).toHaveAttribute('type', 'password'); expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'synthetic-api-key-long' } });
  fireEvent.change(screen.getByLabelText('Ambiente Asaas'), { target: { value: 'production' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preparar Asaas' }));
  await screen.findByRole('status');
  expect(api.saveIntegrationCredentials).toHaveBeenCalledWith('a', 'asaas', { api_key: 'synthetic-api-key-long', environment: 'production' }, 0);
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue('');
  expect(screen.getByText(/Preparado — uso desativado/)).toHaveTextContent('••••••••');
  expect(document.body).not.toHaveTextContent('synthetic-api-key-long');
  fireEvent.click(screen.getByRole('button', { name: 'Remover Asaas' }));
  await screen.findByText('Credencial preparada removida.');
  expect(api.removeIntegrationCredentials).toHaveBeenCalledWith('a', 'asaas', 1);
});
it('prepares only supported Evolution bundle without provider connection action', async () => {
  render(<CompanyIntegrationCredentials companyId="a" />);
  fireEvent.change(await screen.findByLabelText('Nova chave WhatsApp Evolution'), { target: { value: 'synthetic-api-key-long' } });
  fireEvent.change(screen.getByLabelText('Base HTTPS Evolution'), { target: { value: 'https://provider.example/api' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preparar WhatsApp Evolution' }));
  await waitFor(() => expect(api.saveIntegrationCredentials).toHaveBeenCalledWith('a', 'whatsapp_evolution', { api_key: 'synthetic-api-key-long', base_url: 'https://provider.example/api' }, 0));
  expect(screen.getByLabelText('Nova chave WhatsApp Evolution')).toHaveValue('');
  expect(screen.queryByRole('button', { name: /conectar/i })).not.toBeInTheDocument();
});
it.each(['trainer', 'coordinator', 'student'])('denies %s before reading state', role => {
  state.role = role; render(<CompanyIntegrationCredentials companyId="a" />);
  expect(screen.getByRole('alert')).toBeInTheDocument(); expect(api.fetchIntegrationStatus).not.toHaveBeenCalled();
});
it('denies foreign admin and requires explicit master company', async () => {
  const view = render(<CompanyIntegrationCredentials companyId="b" />);
  expect(api.fetchIntegrationStatus).not.toHaveBeenCalled();
  state.role = 'master'; view.rerender(<CompanyIntegrationCredentials companyId="b" />);
  expect(api.fetchIntegrationStatus).not.toHaveBeenCalled();
  state.isViewingCompany = true; state.viewingCompany = { id: 'b' }; view.rerender(<CompanyIntegrationCredentials companyId="b" />);
  await screen.findByLabelText('Nova chave Asaas'); expect(api.fetchIntegrationStatus).toHaveBeenCalledWith('b');
});
it('clears password on conflict, keeps a safe message and explicitly reloads', async () => {
  api.saveIntegrationCredentials.mockRejectedValue(new Error('Outra pessoa alterou raw-sensitive-body'));
  render(<CompanyIntegrationCredentials companyId="a" />);
  fireEvent.change(await screen.findByLabelText('Nova chave Asaas'), { target: { value: 'synthetic-api-key-long' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preparar Asaas' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Recarregue');
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue(''); expect(document.body).not.toHaveTextContent('raw-sensitive');
  fireEvent.click(screen.getByRole('button', { name: 'Recarregar estado das integrações' }));
  await waitFor(() => expect(api.fetchIntegrationStatus).toHaveBeenCalledTimes(2));
});
it('hides raw backend errors and does not interpret unavailable state as no token', async () => {
  api.fetchIntegrationStatus.mockRejectedValue(new Error('raw-sensitive-body'));
  render(<CompanyIntegrationCredentials companyId="a" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('cofre');
  expect(document.body).not.toHaveTextContent('raw-sensitive'); expect(screen.queryByLabelText('Nova chave Asaas')).not.toBeInTheDocument();
});
it('discards late status/save results and drafts after tenant switch', async () => {
  let resolve!: (value: unknown) => void;
  api.saveIntegrationCredentials.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<CompanyIntegrationCredentials companyId="a" />);
  fireEvent.change(await screen.findByLabelText('Nova chave Asaas'), { target: { value: 'synthetic-api-key-long' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preparar Asaas' }));
  await waitFor(() => expect(api.saveIntegrationCredentials).toHaveBeenCalled());
  state.companyId = 'b'; view.rerender(<CompanyIntegrationCredentials companyId="b" />);
  await waitFor(() => expect(api.fetchIntegrationStatus).toHaveBeenCalledWith('b'));
  await act(async () => { resolve(statuses(1)); });
  expect(screen.queryByText(/Preparado — uso desativado/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue('');
});
it('ignores an initial state read that resolves after the company changes', async () => {
  let resolve!: (value: unknown) => void;
  api.fetchIntegrationStatus.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(<CompanyIntegrationCredentials companyId="a" />);
  state.companyId = 'b'; view.rerender(<CompanyIntegrationCredentials companyId="b" />);
  await screen.findByLabelText('Nova chave Asaas');
  await act(async () => { resolve(statuses(1)); });
  expect(screen.queryByText(/Preparado — uso desativado/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue('');
});
