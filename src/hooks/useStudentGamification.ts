import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CompanyProductSettings } from '@/lib/companyProductSettings';
interface PolicyClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
export function useStudentGamification({ studentId, companyId }: { studentId?: string; companyId?: string | null }) {
  const scope = `${studentId ?? ''}:${companyId ?? ''}`;
  const [result, setResult] = useState<{ scope: string; enabled: boolean; error: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    if (!studentId && !companyId) { setResult(null); return; }
    void (async () => {
      try {
        const { data, error } = await (supabase as unknown as PolicyClient).rpc('get_student_experience_policy', {
          _student_id: studentId ?? null, _company_id: companyId ?? null,
        });
        if (error && !['PGRST202', '42883'].includes(error.code ?? '')) throw error;
        const enabled = error ? true : (data as CompanyProductSettings['experience'] | null)?.gamification_enabled;
        if (typeof enabled !== 'boolean') throw new Error('Politica de gamificacao invalida.');
        if (current) setResult({ scope, enabled, error: null });
      } catch (failure) {
        if (current) setResult({ scope, enabled: false, error: failure instanceof Error ? failure.message : 'Politica de gamificacao indisponivel.' });
      }
    })();
    return () => { current = false; };
  }, [studentId, companyId, scope]);
  return { enabled: result?.scope === scope && result.enabled, error: result?.scope === scope ? result.error : null };
}
