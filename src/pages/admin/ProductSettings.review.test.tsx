import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import ProductSettings from './ProductSettings';
import {DEFAULT_COMPANY_PRODUCT_SETTINGS} from '@/lib/companyProductSettings';
const mocks=vi.hoisted(()=>({fetch:vi.fn(),save:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({role:'admin',companyId:'synthetic-company'})}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({isViewingCompany:false,viewingCompany:null})}));
vi.mock('@/lib/companyProductSettings',async()=>({...await vi.importActual('@/lib/companyProductSettings'),fetchCompanyProductSettings:mocks.fetch,saveCompanyProductSettings:mocks.save}));
vi.mock('@/components/admin/FormDefinitionManager',()=>({default:()=>null}));
describe('independent central settings review',()=>{
  it('does not discard text typed while an earlier save is pending',async()=>{
    const initial=structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS);
    mocks.fetch.mockResolvedValue({settings:initial,version:1});
    let finish:(value:unknown)=>void=()=>{};
    mocks.save.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    render(<ProductSettings/>);
    const editor=await screen.findByLabelText('Mensagem');
    fireEvent.change(editor,{target:{value:'Primeiro rascunho'}});
    fireEvent.click(screen.getByRole('button',{name:/^Salvar$/}));
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
    const blocked=editor.matches(':disabled');
    if(!blocked)fireEvent.change(editor,{target:{value:'Edicao mais recente'}});
    await act(async()=>finish({settings:{...initial,messages:{...initial.messages,weekly_contact:'Primeiro rascunho'}},version:2}));
    expect(editor).toHaveValue(blocked?'Primeiro rascunho':'Edicao mais recente');
  });
});
