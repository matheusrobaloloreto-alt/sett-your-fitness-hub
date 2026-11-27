import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BulkWorkoutWeekEditor } from './BulkWorkoutWeekEditor';

describe('bulk week dialog', () => {
 it('makes the week explicit, applies only filled fields and accepts zero rest', () => {
  const apply=vi.fn(); render(<BulkWorkoutWeekEditor week={3} title="Treino B" disabled={false} onApply={apply}/>);
  fireEvent.click(screen.getByRole('button',{name:'Edição em massa'}));
  expect(screen.getByRole('heading',{name:'Edição em massa · Semana 3'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Descanso (segundos)'),{target:{value:'0'}});
  fireEvent.click(screen.getByRole('button',{name:'Aplicar na semana 3'}));
  expect(apply).toHaveBeenCalledExactlyOnceWith({rest_seconds:0});
 });
 it('cancel does not apply changes', () => {
  const apply=vi.fn(); render(<BulkWorkoutWeekEditor week={1} title="Treino A" disabled={false} onApply={apply}/>);
  fireEvent.click(screen.getByRole('button',{name:'Edição em massa'}));
  fireEvent.change(screen.getByLabelText('Séries'),{target:{value:'4'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'})); expect(apply).not.toHaveBeenCalled();
 });
});
