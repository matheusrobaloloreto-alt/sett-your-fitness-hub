import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const mocks = vi.hoisted(() => ({
  auth: { companyId: '00000000-0000-0000-0000-000000000010', role: 'admin', user: { id: 'user' } },
  fetch: vi.fn(), save: vi.fn(), upload: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: { id: mocks.auth.companyId } }) }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => ({ hasAppearance: true, loading: false }) }));
vi.mock('@/lib/companyContent', async () => ({
  ...await vi.importActual<typeof import('@/lib/companyContent')>('@/lib/companyContent'),
  fetchCompanyContent: mocks.fetch, saveCompanyContent: mocks.save,
}));
vi.mock('@/lib/companyContentMedia', async () => ({ ...await vi.importActual<typeof import('@/lib/companyContentMedia')>('@/lib/companyContentMedia'), uploadCompanyMedia: mocks.upload }));
vi.mock('@/components/content/CompanyContentPreview', () => ({ CompanyContentPreview: () => null }));
import CompanyContentStudio from '@/pages/admin/CompanyContentStudio';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Studio belongs only to the canonical BN master menu', () => {
  it.each(['admin', 'trainer', 'coordinator', 'student', 'master'])('quarantines the company candidate for %s even with appearance and selected company', role => {
    mocks.auth.role = role;
    mocks.fetch.mockResolvedValue({ version: 0, document: { brand: {}, posts: [] } });
    render(<CompanyContentStudio />);
    expect(screen.getByRole('status')).toHaveTextContent('Studio disponível somente no menu master BN.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Enviar logo')).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(['admin', 'trainer', 'coordinator', 'student', 'master'])('canonical master route guard handles %s', role => {
    mocks.auth.role = role;
    render(<MemoryRouter initialEntries={['/master/bn-content']}><Routes>
      <Route path="/master/bn-content" element={<ProtectedRoute allowedRoles={['master']}><p>Canonical BN Studio</p></ProtectedRoute>} />
      <Route path="*" element={<p>Role dashboard</p>} />
    </Routes></MemoryRouter>);
    if (role === 'master') expect(screen.getByText('Canonical BN Studio')).toBeInTheDocument();
    else { expect(screen.queryByText('Canonical BN Studio')).not.toBeInTheDocument(); expect(screen.getByText('Role dashboard')).toBeInTheDocument(); }
  });
  it('removes the company route and menu without changing the canonical master gate', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const sidebar = readFileSync('src/components/AppSidebar.tsx', 'utf8');
    expect(app).not.toContain('CompanyContentStudio');
    expect(app).not.toContain('/admin/content-studio');
    expect(sidebar).not.toContain('/admin/content-studio');
    expect(app).toContain('<Route path="/master/bn-content" element={<ProtectedRoute allowedRoles={["master"]}><MasterBnContent /></ProtectedRoute>} />');
    expect(sidebar).toContain('{ title: "BN Content", url: "/master/bn-content", icon: Images }');
  });
});
