import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { PrescriptionMethodologyEditor } from './PrescriptionMethodologyEditor';
import { normalizeCompanyProductSettings, type CompanyProductSettings } from '@/lib/prescriptionMethodology';
function Harness({ disabled = false }: { disabled?: boolean }) {
  const [settings, setSettings] = useState(normalizeCompanyProductSettings().prescription);
  return <><PrescriptionMethodologyEditor settings={settings} onChange={setSettings} disabled={disabled}/><output data-testid="policy">{JSON.stringify(settings)}</output></>;
}
const saved = () => JSON.parse(screen.getByTestId('policy').textContent!) as CompanyProductSettings['prescription'];
describe('bounded methodology editor', () => {
  it('edits valid weekly rules and progression, rejects unsafe values and never emits invalid settings', () => {
    render(<Harness/>);
    fireEvent.click(screen.getByText('Adicionar regra semanal'));
    fireEvent.change(screen.getByLabelText('volume_percent semana 1'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Fase semana 1'), { target: { value: 'acumulacao' } });
    fireEvent.change(screen.getByLabelText('Progressão entre ciclos'), { target: { value: 'maintain' } });
    expect(saved()).toMatchObject({ progression_mode: 'maintain', weekly_rules: [{ week: 1, volume_percent: 50, phase: 'acumulacao' }] });
    fireEvent.change(screen.getByLabelText('rir_min semana 1'), { target: { value: '0' } });
    expect(screen.getByRole('alert')).toHaveTextContent('inválida');
    expect(saved().weekly_rules[0].rir_min).toBe(3);
    fireEvent.click(screen.getByLabelText('dropset'));
    expect(saved().allowed_methods).not.toContain('dropset');
  });
  it('adds only explicit supported answer mappings and removes them', () => {
    render(<Harness/>);
    fireEvent.click(screen.getByText('Adicionar mapeamento'));
    expect(saved().answer_mappings).toEqual([]);
    fireEvent.change(screen.getByLabelText('Chave da pergunta extra'), { target: { value: 'extra_goal' } });
    fireEvent.change(screen.getByLabelText('Resposta exata'), { target: { value: 'Quero força' } });
    fireEvent.click(screen.getByText('Adicionar mapeamento'));
    expect(saved().answer_mappings).toEqual([{ source_key: 'extra_goal', answer: 'Quero força', target: 'objective', value: 'forca' }]);
    fireEvent.click(screen.getByLabelText('Remover mapeamento 1'));
    expect(saved().answer_mappings).toEqual([]);
  });
  it('respects disabled state supplied by the page during save/reload', () => {
    render(<Harness disabled/>);
    expect(screen.getByText('Adicionar regra semanal')).toBeDisabled();
    expect(screen.getByLabelText('Progressão entre ciclos')).toBeDisabled();
  });
});
