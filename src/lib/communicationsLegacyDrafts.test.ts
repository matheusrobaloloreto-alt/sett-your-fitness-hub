import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '../../supabase/functions/_shared/company-product-settings';
import { draftCompanyEventMessage, openStudentChat } from './studentChat';
const mocks=vi.hoisted(()=>({settings:vi.fn(),panel:vi.fn(()=>true),from:vi.fn(),invoke:vi.fn()}));
vi.mock('@/lib/companyProductSettings',()=>({fetchCompanyProductSettings:mocks.settings}));
vi.mock('@/lib/whatsappChatPanel',()=>({requestWhatsAppChatPanel:mocks.panel}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from,functions:{invoke:mocks.invoke}}}));
afterEach(()=>vi.clearAllMocks());

for(const event of ['renewal_due','renewal_overdue','anamnesis_invite','first_contact','fiscal_invite'] as const) {
  it(`actual ${event} draft consumes scoped settings and only opens an editable internal draft`,async()=>{
    mocks.settings.mockImplementation(async(company:string)=>({version:4,settings:{...DEFAULT_COMPANY_PRODUCT_SETTINGS,brand:{...DEFAULT_COMPANY_PRODUCT_SETTINGS.brand,company_name:company},messages:{...DEFAULT_COMPANY_PRODUCT_SETTINGS.messages,[event]:'{{empresa}}: {{primeiro_nome}} {{link}}'}}}));
    const navigate=vi.fn();
    for(const companyId of ['company-a','company-b']) {
      await openStudentChat({navigate,routePrefix:'admin',chatId:'chat',phone:'+5548999999999',contactName:'Synthetic',countryCode:'BR',message:'Fallback',companyId,messageEvent:event,messageValues:{primeiro_nome:'Ana',link:'https://example.invalid/opaque'}});
      expect(mocks.panel).toHaveBeenLastCalledWith(expect.objectContaining({mode:'draft',prefillMessage:`${companyId}: Ana https://example.invalid/opaque`}));
      expect(mocks.settings).toHaveBeenLastCalledWith(companyId);
    }
    expect(mocks.from).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
  });
}
it('unpublished settings preserve fallback; failed configuration read never pretends to apply settings',async()=>{
  mocks.settings.mockResolvedValueOnce({version:0,settings:DEFAULT_COMPANY_PRODUCT_SETTINGS});
  expect(await draftCompanyEventMessage('company-a','renewal_due',{},'Legacy fallback')).toBe('Legacy fallback');
  mocks.settings.mockRejectedValueOnce(new Error('settings denied'));
  await expect(draftCompanyEventMessage('company-a','renewal_due',{},'Fallback')).rejects.toThrow('settings denied');
  expect(mocks.panel).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();
});
it('missing company fails before any navigation or message preparation',async()=>{
  await expect(openStudentChat({navigate:vi.fn(),routePrefix:'admin',message:'Fallback',messageEvent:'renewal_due'})).rejects.toThrow('company_id_required');
  expect(mocks.settings).not.toHaveBeenCalled();expect(mocks.panel).not.toHaveBeenCalled();
});
