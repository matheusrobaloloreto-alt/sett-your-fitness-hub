import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingHelp } from './SettingHelp';
const props = { label: 'Mensagem', what: 'Texto do evento.', edits: 'Até 6000 caracteres.', effect: 'Próximas ocorrências.' };
describe('setting help accessibility', () => {
  it('opens on hover and focus, closes on Escape, and never submits the enclosing form', () => {
    const submit = vi.fn();
    render(<form onSubmit={submit}><SettingHelp {...props} /></form>);
    const button = screen.getByRole('button', { name: 'Sobre Mensagem' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Texto do evento.');
    expect(screen.getByRole('tooltip').closest('form')).toBeNull();
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.mouseLeave(button.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Próximas ocorrências.');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.blur(button); fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});
