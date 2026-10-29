import { useQuery } from "@tanstack/react-query";
import { fetchPublicPlatformCatalog } from "@/lib/platformSettingsClient";
export function usePlatformCatalog() {
  return useQuery({ queryKey: ["platform-product-catalog"], queryFn: fetchPublicPlatformCatalog, staleTime: 60_000, retry: 1 });
}
