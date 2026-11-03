import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import FormDefinitionManager from './FormDefinitionManager';
import {defaultFormDefinition} from '@/lib/formDefinitions';
import {toast} from 'sonner';
const {fetchForm,publish}=vi.hoisted(()=>({fetchForm:vi.fn(),publish:vi.fn()}));
vi.mock('@/lib/formDefinitions',async()=>{const actual=await vi.importActual<typeof import('@/lib/formDefinitions')>('@/lib/formDefinitions');return {...actual,defaultFormDefinition:(kind:Parameters<typeof actual.defaultFormDefinition>[0])=>{const form=actual.defaultFormDefinition(kind);return {...form,fields:form.fields.slice(0,2)};},fetchFormDefinition:fetchForm,publishFormDefinition:publish};});
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
describe('FormDefinitionManager tenant request lifecycle',()=>{
  beforeEach(()=>{fetchForm.mockReset();publish.mockReset();vi.mocked(toast.error).mockClear();});
  it.each(['PT409','40001'])('preserves the dirty draft and version on CAS conflict %s',async code=>{
    const form=defaultFormDefinition('initial');
    fetchForm.mockResolvedValue({id:'a-v1',version:1,definition:form});
    publish.mockRejectedValue({code,message:'form_version_conflict'});
    render(<FormDefinitionManager companyId="a"/>);
    const title=screen.getByLabelText('Título');
    await waitFor(()=>expect(title).toBeEnabled());
    fireEvent.change(title,{target:{value:'Rascunho ainda nao publicado'}});
    fireEvent.click(screen.getByRole('button',{name:'Publicar versão'}));
    await waitFor(()=>expect(toast.error).toHaveBeenCalledWith('Conflito de versão. Rascunho mantido; recarregue antes de publicar.'));
    expect(title).toHaveValue('Rascunho ainda nao publicado');
    expect(screen.getByText('Versão 1')).toBeInTheDocument();
    expect(title).toBeEnabled();
    expect(publish).toHaveBeenCalledOnce();
    expect(fetchForm).toHaveBeenCalledOnce();
  });
  it('discards an earlier company delayed publication response after context changes',async()=>{
    const a=defaultFormDefinition('initial');a.title='Empresa A';
    const b=defaultFormDefinition('initial');b.title='Empresa B';
    fetchForm.mockImplementation((company:string)=>Promise.resolve({id:company,version:1,definition:company==='a'?a:b}));
    let resolveSave:(value:unknown)=>void=()=>{};
    publish.mockReturnValue(new Promise(resolve=>{resolveSave=resolve;}));
    const {rerender}=render(<FormDefinitionManager companyId="a" />);
    await waitFor(()=>expect(screen.getByLabelText('Título')).toHaveValue('Empresa A'));
    fireEvent.click(screen.getByRole('button',{name:'Publicar versão'}));
    rerender(<FormDefinitionManager companyId="b" />);
    await waitFor(()=>expect(screen.getByLabelText('Título')).toHaveValue('Empresa B'));
    await act(async()=>resolveSave({id:'a-v2',version:2,definition:{...a,title:'A atrasada'}}));
    expect(screen.getByLabelText('Título')).toHaveValue('Empresa B');
    expect(screen.getByText('Versão 1')).toBeInTheDocument();
  });
  it('blocks every editing control and publication when loading fails',async()=>{
    fetchForm.mockRejectedValue(new Error('offline'));
    render(<FormDefinitionManager companyId="a" />);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Recarregar'})).toBeEnabled());
    expect(screen.getByRole('button',{name:'Publicar versão'})).toBeDisabled();
    expect(screen.getByLabelText('Título')).toBeDisabled();
    for(const input of document.querySelectorAll('section input')) expect(input).toBeDisabled();
    for(const button of document.querySelectorAll('section fieldset button'))expect(button).toBeDisabled();
    expect(publish).not.toHaveBeenCalled();
  });
});


describe('FormDefinitionManager compact question editor',()=>{
  beforeEach(()=>{fetchForm.mockReset();publish.mockReset();});
  const setup=async()=>{
    const form=defaultFormDefinition('initial');
    form.fields=form.fields.slice(0,1);
    form.fields.push({key:'extra_choices',label:'Preferência de horário',type:'select',required:false,hidden:false,help:'Escolha um horário',options:[{value:'am',label:'Manhã'},{value:'pm',label:'Tarde'}]});
    fetchForm.mockResolvedValue({id:'a-v7',version:7,definition:form});
    publish.mockImplementation(async(_company,definition)=>({id:'a-v8',version:8,definition}));
    render(<FormDefinitionManager companyId="a"/>);
    await waitFor(()=>expect(screen.getByLabelText('Título')).toBeEnabled());
    return form;
  };
  it('keeps edited options attached to their key after reordering and publishes the same contract',async()=>{
    const original=await setup();
    const card=screen.getByRole('article',{name:'Pergunta 2: Preferência de horário'});
    const alternatives=within(card).getByText('Alternativas (2)').closest('details')!;
    expect(alternatives.open).toBe(false);
    fireEvent.click(within(card).getByText('Alternativas (2)'));
    fireEvent.change(screen.getByLabelText('Alternativa extra_choices 1'),{target:{value:'Manhã cedo'}});
    fireEvent.click(within(card).getByRole('button',{name:'Alternativa'}));
    fireEvent.change(screen.getByLabelText('Valor extra_choices 3'),{target:{value:'night'}});
    fireEvent.change(screen.getByLabelText('Alternativa extra_choices 3'),{target:{value:'Noite'}});
    fireEvent.click(within(card).getByRole('button',{name:'Mover Preferência de horário para cima'}));
    const reordered=screen.getAllByRole('article');
    expect(reordered[0]).toHaveAccessibleName('Pergunta 1: Preferência de horário');
    expect(within(reordered[0]).getByLabelText('Ordem 1')).toHaveTextContent('1');
    expect(within(reordered[0]).getByRole('button',{name:'Mover Preferência de horário para cima'})).toBeDisabled();
    expect(within(reordered[0]).getByText('Alternativas (3)').closest('details')).toBe(alternatives);
    fireEvent.click(screen.getByRole('button',{name:'Publicar versão'}));
    await waitFor(()=>expect(publish).toHaveBeenCalledOnce());
    expect(publish).toHaveBeenCalledWith('a',{...original,fields:[{...original.fields[1],options:[{value:'am',label:'Manhã cedo'},{value:'pm',label:'Tarde'},{value:'night',label:'Noite'}]},original.fields[0]]},7);
  });
  it('retains hidden and required constraints and core field locks',async()=>{
    const form=await setup();
    const cards=screen.getAllByRole('article');
    expect(within(cards[0]).queryByRole('button',{name:/Excluir/})).not.toBeInTheDocument();
    expect(within(cards[0]).getByLabelText('Obrigatória')).toBeDisabled();
    expect(within(cards[0]).getByLabelText('Oculta')).toBeDisabled();
    fireEvent.click(within(cards[1]).getByLabelText('Oculta'));
    expect(within(cards[1]).getByLabelText('Oculta')).toBeChecked();
    fireEvent.click(within(cards[1]).getByLabelText('Obrigatória'));
    expect(within(cards[1]).getByLabelText('Oculta')).not.toBeChecked();
    expect(within(cards[1]).getByLabelText('Oculta')).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Publicar versão'}));
    await waitFor(()=>expect(publish).toHaveBeenCalledOnce());
    expect(publish.mock.calls[0][1].fields[0]).toEqual(form.fields[0]);
    expect(publish.mock.calls[0][1].fields[1]).toMatchObject({key:'extra_choices',required:true,hidden:false});
  });
  it('uses friendly headings, responsive cards and contextual help for the editable controls',async()=>{
    await setup();
    const grid=screen.getByLabelText('Perguntas do formulário');
    expect(grid).toHaveClass('grid','grid-cols-1','lg:grid-cols-2','gap-3');
    const card=screen.getByRole('article',{name:'Pergunta 2: Preferência de horário'});
    expect(within(card).getByRole('heading')).toHaveTextContent('Preferência de horário');
    expect(within(card).getByRole('heading')).not.toHaveTextContent('extra_choices');
    // Verify that the editor provides the three required explanations to the shared help API.
    for(const label of ['Pergunta: Preferência de horário','Ajuda: Preferência de horário','Obrigatória: Preferência de horário','Oculta: Preferência de horário','Tipo: Preferência de horário']){
      expect(within(card).getByRole('button',{name:`Sobre ${label}`})).toBeInTheDocument();
    }
    fireEvent.click(within(card).getByRole('button',{name:'Sobre Pergunta: Preferência de horário'}));
    const help=screen.getByRole('tooltip');
    expect(help).toHaveTextContent('Texto da pergunta apresentado ao aluno.');
    expect(help).toHaveTextContent('Altera a redação sem mudar a identificação da pergunta.');
    expect(help).toHaveTextContent('Após publicar, o aluno verá o novo texto; a chave permanece a mesma.');
  });
  it('locks standard option values while allowing their visible labels to change',async()=>{
    const form=defaultFormDefinition('initial');
    fetchForm.mockResolvedValue({id:'a-v1',version:1,definition:form});
    publish.mockImplementation(async(_company,definition)=>({id:'a-v2',version:2,definition}));
    render(<FormDefinitionManager companyId="a"/>);
    await waitFor(()=>expect(screen.getByLabelText('Título')).toBeEnabled());
    const card=screen.getAllByRole('article')[1];
    fireEvent.click(within(card).getByText('Alternativas (2)'));
    expect(screen.getByLabelText('Valor gender 1')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Alternativa gender 1'),{target:{value:'Novo texto'}});
    fireEvent.click(screen.getByRole('button',{name:'Publicar versão'}));
    await waitFor(()=>expect(publish).toHaveBeenCalledOnce());
    expect(publish.mock.calls[0][1].fields[1]).toEqual({...form.fields[1],options:[{...form.fields[1].options[0],label:'Novo texto'},form.fields[1].options[1]]});
  });
});
