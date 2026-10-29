import { describe, expect, it, vi } from 'vitest';
import { loadCompanyPDFMeta } from './pdfMeta';
import { generateStrengthPDF } from '@/lib/generatePDFs';

const db = vi.hoisted(() => ({ reads: [] as string[], fail: false }));
vi.mock('@/lib/companyProductSettings', () => ({ fetchCompanyProductSettings: async (company: string) => ({ settings: { brand: { company_name: `Empresa ${company}`, professional_name: `Profissional ${company}`, professional_registration: `Registro ${company}` } } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => ({ select: () => ({ eq: (_key: string, company: string) => ({ maybeSingle: async () => { db.reads.push(`${table}:${company}`); return db.fail ? { data: null, error: new Error('read failed') } : { data: table === 'companies' ? { name: company } : { logo_url: null }, error: null }; } }) }) }) } }));
describe('PDF metadata consuming company settings', () => {
  it('queries only the selected company and produces a different document for each tenant', async () => {
    db.fail = false; db.reads = [];
    const base = { studentName: 'Sintetico', date: '26/10/2026' };
    const first = await loadCompanyPDFMeta('Aurora', base);
    const second = await loadCompanyPDFMeta('Boreal', base);
    const pdf = generateStrengthPDF({}, second).output();
    expect(first.company).toBe('Empresa Aurora');
    expect(pdf).toContain('Empresa Boreal'); expect(pdf).toContain('Profissional Boreal');
    expect(pdf).not.toContain('Aurora'); expect(pdf).not.toContain('Matheus Loreto');
    expect(db.reads).toEqual(['platform_settings:Aurora', 'companies:Aurora', 'platform_settings:Boreal', 'companies:Boreal']);
  });
  it('fails closed on a missing company or failed identity read', async () => {
    await expect(loadCompanyPDFMeta('', { studentName: 'Teste', date: '' })).rejects.toThrow(/Empresa/);
    db.fail = true;
    await expect(loadCompanyPDFMeta('Aurora', { studentName: 'Teste', date: '' })).rejects.toThrow('read failed');
    db.fail = false;
  });
});
