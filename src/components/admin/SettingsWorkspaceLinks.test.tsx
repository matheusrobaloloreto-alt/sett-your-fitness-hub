import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsWorkspaceLinks from './SettingsWorkspaceLinks';

afterEach(cleanup);
describe('company settings workspace navigation', () => {
  it('never exposes the company Studio link or its content copy', () => {
    render(<SettingsWorkspaceLinks />);
    const navigation = screen.getByRole('navigation', { name: 'Outras configurações da empresa' });
    expect(within(navigation).queryByRole('link', { name: /studio/i })).not.toBeInTheDocument();
    expect(within(navigation).queryByText('Conteúdo, identidade e exportação.')).not.toBeInTheDocument();
    expect(navigation.querySelector('a[href="/admin/content-studio"]')).toBeNull();
  });
  it('preserves the two company management destinations', () => {
    render(<SettingsWorkspaceLinks />);
    const links = within(screen.getByRole('navigation', { name: 'Outras configurações da empresa' })).getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/admin/governance', '/admin/operations']);
    expect(links[0]).toHaveTextContent('Administração da empresa');
    expect(links[1]).toHaveTextContent('Operação e relatórios');
  });
});
