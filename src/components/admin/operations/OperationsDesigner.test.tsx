import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OperationsDesigner from '@/pages/admin/OperationsDesigner';
import { CompanyOperationsReports } from './OperationsConsumers';
import { defaultOperations } from '@/lib/companyOperations';
const state=vi.hoisted(()=>({role:'admin',companyId:'company-a'}));
const features=vi.hoisted(()=>({loading:false,hasRegistration:true,hasDashboard:true}));
vi.mock('@/hooks/useCompanyFeatures',()=>({useCompanyFeatures:()=>features}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({isViewingCompany:false})}));
const api=vi.hoisted(()=>({fetchCompanyOperations:vi.fn(),fetchOperationMetrics:vi.fn(),saveCompanyOperations:vi.fn()}));
vi.mock('@/lib/companyOperationsStore',()=>api);
let stored={settings:defaultOperations(),version:0};
function mount(consumer=false){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{consumer?<CompanyOperationsReports companyId="company-a"/>:<OperationsDesigner/>}</QueryClientProvider>);}
beforeEach(()=>{
 features.hasDashboard=true;features.hasRegistration=true;
 stored={settings:defaultOperations(),version:0};state.role='admin';state.companyId='company-a';vi.clearAllMocks();
 api.fetchCompanyOperations.mockImplementation(async()=>structuredClone(stored));
 api.fetchOperationMetrics.mockResolvedValue({active:3,pending:1,inactive:2,awaiting_renewal:0});
 api.saveCompanyOperations.mockImplementation(async(companyId,settings,version)=>{
  if(companyId!=='company-a'||version!==stored.version)throw new Error('Conflito. Recarregue.');
  stored={settings:structuredClone(settings),version:version+1};return structuredClone(stored);
 });
});
afterEach(cleanup);
it('edits, saves, reads back and renders the saved report in the actual dashboard consumer',async()=>{
 mount();await screen.findByText('Etapas do funil');
 fireEvent.change(screen.getByDisplayValue(defaultOperations().stages.find(s=>s.code==='contacted')!.label),{target:{value:'Conversa iniciada'}});
 fireEvent.click(screen.getByText('Adicionar relatório'));
 fireEvent.click(screen.getByText('Salvar operação'));
 await screen.findByText('Salvo e relido do servidor.');
 expect(stored.settings.stages.find(s=>s.code==='contacted')?.label).toBe('Conversa iniciada');
 expect(stored.version).toBe(1);
 cleanup();mount(true);
 expect(await screen.findByText('3')).toBeInTheDocument();
 expect(screen.getByText('Alunos ativos')).toBeInTheDocument();
});
it('preserves the draft after a conflict and reloads the server version explicitly',async()=>{
 mount();await screen.findByText('Etapas do funil');
 fireEvent.change(screen.getByDisplayValue(defaultOperations().stages.find(s=>s.code==='contacted')!.label),{target:{value:'Local'}});
 stored={settings:defaultOperations(),version:2};stored.settings.stages.find(s=>s.code==='contacted')!.label='Outra edição';
 fireEvent.click(screen.getByText('Salvar operação'));
 await screen.findByText('Conflito. Recarregue.');
 expect(screen.getByLabelText('Rótulo Local')).toHaveValue('Local');
 fireEvent.click(screen.getByText('Recarregar do servidor'));
 await waitFor(()=>expect(screen.getByLabelText('Rótulo Outra edição')).toHaveValue('Outra edição'));
});
it('refuses the editor for a coordinator',()=>{state.role='coordinator';mount();expect(screen.getByRole('alert')).toHaveTextContent('Apenas administradores');expect(api.fetchCompanyOperations).not.toHaveBeenCalled();});
it('does not display invented metrics when the aggregate source fails',async()=>{
 stored.settings.reports=[{id:'active',title:'Meu indicador',metric:'active',display:'count'}];stored.version=1;
 api.fetchOperationMetrics.mockRejectedValue(new Error('Denied'));
 mount(true);expect(await screen.findByRole('alert')).toHaveTextContent('indisponíveis');expect(screen.queryByText('0')).not.toBeInTheDocument();
});

it("hides reports and avoids aggregate calls when dashboard is disabled",()=>{features.hasDashboard=false;mount(true);expect(api.fetchOperationMetrics).not.toHaveBeenCalled();expect(screen.queryByLabelText("Relatórios operacionais")).not.toBeInTheDocument();});
