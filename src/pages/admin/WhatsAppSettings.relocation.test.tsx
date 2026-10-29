import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryRouter,useLocation} from 'react-router-dom';
import WhatsAppSettings from './WhatsAppSettings';
const state=vi.hoisted(()=>({role:'admin',companyId:'company-a'}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({isViewingCompany:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn()}}}));
afterEach(cleanup);
function Location(){const path=useLocation();return <output aria-label="Destino">{path.pathname+path.search}</output>}
it.each([['admin','admin'],['master','admin'],['coordinator','coordinator'],['trainer','trainer']])('redirects the old %s entry to centralized settings without creating a connection',async(role,prefix)=>{
 state.role=role;const request=vi.fn();vi.stubGlobal('fetch',request);render(<MemoryRouter initialEntries={[`/${prefix}/whatsapp`]}><WhatsAppSettings/><Location/></MemoryRouter>);expect(await screen.findByLabelText('Destino')).toHaveTextContent(`/${prefix}/settings?tab=integrations`);expect(request).not.toHaveBeenCalled();vi.unstubAllGlobals();
});
