import {describe,it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({commercial:vi.fn(),product:vi.fn(),single:vi.fn(),eq:vi.fn()}));
vi.mock('./companyCommercialSettings',()=>({fetchCompanyCommercialSettings:mock.commercial,renderPreRegistrationInvite:(settings:{text:string},name:string,link:string)=>`${settings.text} ${name} ${link}`}));
vi.mock('./companyProductSettings',()=>({fetchCompanyProductSettings:mock.product}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:mock.eq})})}}));
import {prepareCompanyPreRegistrationDraft} from './companyInvitationDraft';
describe('company preregistration draft',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();mock.commercial.mockResolvedValue({settings:{text:'Convite configurado'}});
  mock.product.mockResolvedValue({settings:{brand:{company_name:'Studio Exemplo'}}});
  mock.eq.mockReturnValue({single:mock.single});mock.single.mockResolvedValue({data:{name:'Empresa A',slug:'empresa-a'},error:null});
 });
 it('consumes saved company identity/template and actual company link',async()=>{
  const message=await prepareCompanyPreRegistrationDraft('a','https://example.org/cadastro/empresa-a');
  expect(message).toBe('Convite configurado Studio Exemplo https://example.org/cadastro/empresa-a');
  expect(mock.commercial).toHaveBeenCalledWith('a');expect(mock.product).toHaveBeenCalledWith('a');expect(mock.eq).toHaveBeenCalledWith('id','a');
 });
 it('blocks stale cross-company links and failed identity reads',async()=>{
  await expect(prepareCompanyPreRegistrationDraft('a','https://example.org/cadastro/empresa-b')).rejects.toThrow(/empresa/);
  mock.single.mockResolvedValue({data:null,error:{code:'42501'}});
  await expect(prepareCompanyPreRegistrationDraft('a','https://example.org/cadastro/empresa-a')).rejects.toThrow(/identidade/);
 });
});
