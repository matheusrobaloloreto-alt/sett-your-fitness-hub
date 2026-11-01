import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type StudentPrescriptionPolicyScope = { companyId: string; studentId: string; userId: string };
type ExpiredWorkoutBehavior = 'keep_until_replaced' | 'hide_on_expiry';
type Policy = StudentPrescriptionPolicyScope & { behavior: ExpiredWorkoutBehavior };
interface StrictPolicyClient {
 rpc(name: 'get_company_workout_expiry_policy', args: { _company_id: string }): PromiseLike<{ data: unknown; error: unknown }>;
}
// The RPC validates the authenticated student's company on the server and
// applies the legacy default only when the settings row is actually absent.
const client = supabase as unknown as StrictPolicyClient;
export const studentPrescriptionPolicyQueryKey = (scope: StudentPrescriptionPolicyScope | null) =>
 ['company-experience-policy', scope?.companyId ?? 'none', 'student-prescription-strict', scope?.userId ?? '', scope?.studentId ?? ''] as const;

/** No client-side fallback: RLS-hidden rows and infrastructure errors cannot grant keep. */
export async function readStudentPrescriptionPolicy(scope: StudentPrescriptionPolicyScope): Promise<Policy> {
 if (!scope.companyId || !scope.studentId || !scope.userId) throw new Error('Prescription policy scope unavailable');
 const { data, error } = await client.rpc('get_company_workout_expiry_policy', { _company_id: scope.companyId });
 if (error) throw new Error('Prescription policy unavailable');
 if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Prescription policy invalid');
 const row = data as Record<string, unknown>;
 if (row.company_id !== scope.companyId || !Number.isSafeInteger(row.version) || Number(row.version) < 0) throw new Error('Prescription policy scope unavailable');
 const behavior = row.expired_workout_behavior;
 if (behavior !== 'keep_until_replaced' && behavior !== 'hide_on_expiry') throw new Error('Prescription policy invalid');
 return { ...scope, behavior };
}

export function useStudentPrescriptionPolicy(scope: StudentPrescriptionPolicyScope | null) {
 const scopeKey = JSON.stringify([scope?.companyId, scope?.studentId, scope?.userId]);
 const queryClient = useQueryClient();
 const studentId = scope?.studentId;
 const userId = scope?.userId;
 const companyId = scope?.companyId;
 const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
 const [refreshingScope, setRefreshingScope] = useState<string | null>(null);
 const query = useQuery({
  queryKey: studentPrescriptionPolicyQueryKey(scope),
  queryFn: () => readStudentPrescriptionPolicy(scope!),
  enabled: Boolean(scope), staleTime: 0, retry: false,
  refetchOnMount: 'always', refetchOnWindowFocus: false,
 });
 const refetch = query.refetch;
 const retry = useCallback(async () => {
  if (!companyId || !studentId || !userId) return;
  setRefreshingScope(scopeKey);
  try {
   // Invalidate an initial request too: refetch alone may deduplicate a request
   // that started before the settings save when no cached data exists yet.
   await queryClient.cancelQueries({ queryKey: studentPrescriptionPolicyQueryKey({ companyId, studentId, userId }), exact: true });
   if (currentScope.current !== scopeKey) return;
   await refetch({ cancelRefetch: true });
  }
  finally { if (currentScope.current === scopeKey) setRefreshingScope(null); }
 }, [scopeKey, refetch, queryClient, companyId, studentId, userId]);
 useEffect(() => {
  if (!companyId) return;
  const changed = (event: Event) => {
   const changedCompany = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
   if (!changedCompany || changedCompany === companyId) void retry();
  };
  const focused = () => { void retry(); };
  window.addEventListener('company-product-settings-changed', changed);
  window.addEventListener('focus', focused);
  return () => {
   window.removeEventListener('company-product-settings-changed', changed);
   window.removeEventListener('focus', focused);
  };
 }, [companyId, retry]);
 const data = query.data;
 const sameScope = data && scope && data.companyId === scope.companyId && data.userId === scope.userId && data.studentId === scope.studentId;
 const loading = Boolean(scope && (query.isPending || query.fetchStatus !== 'idle' || refreshingScope === scopeKey));
 return {
  allowContinuity: Boolean(sameScope && query.isSuccess && !query.error && !loading && data.behavior === 'keep_until_replaced'),
  loading, error: query.error, retry,
 };
}
