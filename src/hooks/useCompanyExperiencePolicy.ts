import { useQuery } from '@tanstack/react-query';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, fetchCompanyProductSettings } from '@/lib/companyProductSettings';

export function useCompanyExperiencePolicy(companyId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['company-experience-policy', companyId ?? 'none'],
    queryFn: () => fetchCompanyProductSettings(companyId!),
    enabled: Boolean(companyId),
    staleTime: 0,
  });
  return { ...query, policy: query.data?.settings.experience ?? DEFAULT_COMPANY_PRODUCT_SETTINGS.experience };
}
