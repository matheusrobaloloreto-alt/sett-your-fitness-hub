import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VersionedFormFields from './VersionedFormFields';
import { defaultFormDefinition } from '@/lib/formDefinitions';
describe('published form renderer',()=>{
  it('renders published order and labels and sends canonical choice values',()=>{
    const definition=defaultFormDefinition('intercycle');
    definition.fields[0].label='Seu ciclo';
    definition.fields[0].options[0].label='Excelente encaixe';
    const onChange=vi.fn();
    render(<VersionedFormFields definition={definition} answers={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Seu ciclo *'),{target:{value:'better'}});
    expect(onChange).toHaveBeenCalledWith('prescription_evaluation','better');
    expect(screen.getByRole('option',{name:'Excelente encaixe'})).toHaveValue('better');
    expect(screen.queryByLabelText('EVA (0 a 10) *')).not.toBeInTheDocument();
  });
});
