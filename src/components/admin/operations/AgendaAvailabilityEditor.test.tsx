import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Editor from './AgendaAvailabilityEditor';
import { AgendaAvailabilityLayer } from './AgendaAvailabilityLayer';
import { defaultAgendaAvailability } from '@/lib/companyAgendaAvailability';
const access=vi.hoisted(()=>({role:'admin',companyId:'a',hasAgenda:true,loading:false}));
const api=vi.hoisted(()=>({fetchAgendaAvailability:vi.fn(),saveAgendaAvailability:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>access}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({isViewingCompany:false})}));
vi.mock('@/hooks/useCompanyFeatures',()=>({useCompanyFeatures:()=>access}));
vi.mock('@/lib/companyAgendaAvailabilityStore',()=>api);
let stored={settings:defaultAgendaAvailability(),version:0};
function mount(layer=false){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{layer?<AgendaAvailabilityLayer companyId="a" month="2026-11" selectedDate="2026-11-02"/>:<Editor/>}</QueryClientProvider>);}
beforeEach(()=>{
 vi.clearAllMocks();access.role='admin';access.companyId='a';access.hasAgenda=true;access.loading=false;stored={settings:defaultAgendaAvailability(),version:0};
 api.fetchAgendaAvailability.mockImplementation(async()=>structuredClone(stored));
 api.saveAgendaAvailability.mockImplementation(async(companyId,settings,version)=>{
  if(companyId!=='a'||version!==stored.version)throw new Error('Outra pessoa alterou a disponibilidade. Recarregue antes de salvar.');
  stored={settings:structuredClone(settings),version:version+1};return structuredClone(stored);
 });
});
afterEach(cleanup);
it('saves weekly windows, reads back, and the real agenda layer consumes them after remount',async()=>{
 mount();await screen.findByText('Repetição semanal');
 fireEvent.click(screen.getByText('Adicionar janela Segunda'));
 fireEvent.change(screen.getByLabelText('Início Segunda 1'),{target:{value:'10:00'}});
 fireEvent.click(screen.getByText('Salvar disponibilidade'));
 await screen.findByText('Disponibilidade salva e relida do servidor.');
 expect(stored.version).toBe(1);
 cleanup();mount(true);
 expect(await screen.findByText(/10:00–17:00/)).toBeInTheDocument();
 expect(screen.getByText(/Não cria agendamentos automáticos/)).toBeInTheDocument();
});
it('persists a closed-day exception that overrides weekly availability in the actual layer',async()=>{
 stored.settings.weekly=[{weekday:1,start:'09:00',end:'17:00'}];
 mount();await screen.findByText('Repetição semanal');
 fireEvent.click(screen.getByText('Adicionar exceção'));
 fireEvent.change(screen.getByLabelText('Data da exceção 1'),{target:{value:'2026-11-02'}});
 fireEvent.click(screen.getByText('Salvar disponibilidade'));
 await screen.findByText('Disponibilidade salva e relida do servidor.');
 cleanup();mount(true);
 expect(await screen.findByText(/Indisponível nesta data/)).toBeInTheDocument();
 expect(screen.queryByText(/09:00–17:00/)).not.toBeInTheDocument();
});
it('preserves a stale draft after conflict and reloads the server version',async()=>{
 mount();await screen.findByText('Repetição semanal');
 fireEvent.change(screen.getByLabelText('Fuso da disponibilidade'),{target:{value:'UTC'}});
 stored={settings:defaultAgendaAvailability(),version:2};
 fireEvent.click(screen.getByText('Salvar disponibilidade'));
 await screen.findByText(/Outra pessoa alterou a disponibilidade/);
 expect(screen.getByLabelText('Fuso da disponibilidade')).toHaveValue('UTC');
 fireEvent.click(screen.getByText('Recarregar disponibilidade'));
 await waitFor(()=>expect(screen.getByLabelText('Fuso da disponibilidade')).toHaveValue('America/Sao_Paulo'));
});
it('denies editing for a trainer and avoids reads when hasAgenda is disabled',()=>{
 access.role='trainer';mount();expect(screen.getByRole('alert')).toHaveTextContent('Apenas administradores');
 expect(api.fetchAgendaAvailability).not.toHaveBeenCalled();cleanup();access.role='admin';access.hasAgenda=false;mount(true);
 expect(api.fetchAgendaAvailability).not.toHaveBeenCalled();
});
it('shows an error rather than empty availability if the server denies a read',async()=>{
 api.fetchAgendaAvailability.mockRejectedValueOnce(new Error('Forbidden'));
 mount(true);expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
 expect(screen.queryByLabelText('Janelas de disponibilidade')).not.toBeInTheDocument();
});
