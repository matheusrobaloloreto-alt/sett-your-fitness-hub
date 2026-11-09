import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import ConnectionSettings from './ConnectionSettings';
const state=vi.hoisted(()=>({role:'trainer',companyId:'synthetic-a',hasWhatsApp:true,loading:false,allowed:true}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state}));
vi.mock('@/hooks/useCompanyFeatures',()=>({useCompanyFeatures:()=>state}));
vi.mock('@/hooks/useRolePermissions',()=>({useRolePermissions:()=>({canAccess:(module:string)=>module==='whatsapp'&&state.allowed})}));
vi.mock('./WhatsAppSettings',()=>({WhatsAppConnectionPanel:()=> <div data-testid="existing-whatsapp-panel">Painel existente</div>}));
beforeEach(()=>{state.role='trainer';state.companyId='synthetic-a';state.hasWhatsApp=true;state.loading=false;state.allowed=true});
afterEach(cleanup);
it.each(['trainer','coordinator'])('keeps %s diagnostics and chat without rendering administrator connection actions',role=>{
 state.role=role;render(<MemoryRouter><ConnectionSettings/></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Diagnóstico'})).toHaveAttribute('href','/suporte');
 expect(screen.getByRole('link',{name:'Abrir conversas'})).toHaveAttribute('href',`/${role}/whatsapp-chat`);
 expect(screen.queryByTestId('existing-whatsapp-panel')).not.toBeInTheDocument();
 expect(screen.queryByText(/cofre/i)).not.toBeInTheDocument();
});
it.each(['feature','permission','loading'])('keeps diagnostics but never mounts WhatsApp when %s is unavailable',reason=>{
 if(reason==='feature')state.hasWhatsApp=false;
 if(reason==='permission')state.allowed=false;
 if(reason==='loading')state.loading=true;
 render(<MemoryRouter><ConnectionSettings/></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Diagnóstico'})).toBeInTheDocument();
 expect(screen.queryByTestId('existing-whatsapp-panel')).not.toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'Abrir conversas'})).not.toBeInTheDocument();
});
it.each(['student','admin','master'])('does not render the staff-only settings for %s',role=>{
 state.role=role;render(<MemoryRouter><ConnectionSettings/></MemoryRouter>);
 expect(screen.getByRole('alert')).toBeInTheDocument();
 expect(screen.queryByTestId('existing-whatsapp-panel')).not.toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'Diagnóstico'})).not.toBeInTheDocument();
});
