import { supabase } from '@/integrations/supabase/client';
import { fetchCompanyProductSettings } from '@/lib/companyProductSettings';
import type { PDFMeta } from '@/lib/generatePDFs';

export async function loadCompanyPDFMeta(companyId: string, base: Pick<PDFMeta, 'studentName' | 'date'>): Promise<PDFMeta> {
  if (!companyId) throw new Error('Empresa obrigatoria para gerar documento.');
  const { settings } = await fetchCompanyProductSettings(companyId);
  const { data, error } = await supabase.from('platform_settings').select('logo_url').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  const { data: company, error: companyError } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle();
  if (companyError) throw companyError;
  const meta: PDFMeta = { ...base, company: settings.brand.company_name || company?.name || '', professional: settings.brand.professional_name, cref: settings.brand.professional_registration };
  const logo = data?.logo_url;
  if (typeof logo === 'string' && /^data:image\/(png|jpeg);base64,/i.test(logo) && logo.length < 2_000_000) meta.logoDataUrl = logo;
  else if (typeof logo === 'string' && /^https:\/\//i.test(logo)) {
    try {
      const response = await fetch(logo, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
      if (response.ok && /image\/(png|jpeg)/i.test(response.headers.get('content-type') || '')) {
        const blob = await response.blob();
        if (blob.size <= 1_500_000) meta.logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
        });
      }
    } catch { /* A failed logo cannot substitute another company's logo or identity. */ }
  }
  return meta;
}
