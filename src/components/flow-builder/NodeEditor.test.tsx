import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NodeEditor } from './NodeEditor';

afterEach(cleanup);

it('shows the active weekly source and keeps the local text when linking the central template', () => {
  const onUpdate = vi.fn();
  const node = { id: 'message', type: 'content', position: { x: 0, y: 0 }, data: { message: 'Texto do bloco' } };
  const callbacks = { onUpdate, onDelete: vi.fn(), onClose: vi.fn() };
  const { rerender } = render(<NodeEditor node={node} triggerType="weekly_contact" {...callbacks} />);
  expect(screen.getByText('Origem: mensagem personalizada do bloco')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Usar mensagem semanal da empresa' }));
  expect(onUpdate).toHaveBeenLastCalledWith('message', { message: 'Texto do bloco', use_company_template: 'weekly_contact' });

  rerender(<NodeEditor node={{ ...node, data: onUpdate.mock.lastCall![1] }} triggerType="weekly_contact" {...callbacks} />);
  expect(screen.getByText('Origem: mensagem central da empresa')).toBeVisible();
  expect(screen.getByLabelText('Texto alternativo')).toHaveValue('Texto do bloco');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Usar mensagem semanal da empresa' }));
  expect(onUpdate).toHaveBeenLastCalledWith('message', { message: 'Texto do bloco', use_company_template: undefined });
});
