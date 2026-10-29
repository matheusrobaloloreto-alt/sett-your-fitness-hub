import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { deniedCompanyFeatures, fetchCompanyEntitlements, unrestrictedMasterFeatures } from "@/lib/companyFeatureEntitlements";

export type CompanyTier = "basic" | "intermediate" | "advanced";

export interface CompanyFeatures {
  tier: CompanyTier;
  loading: boolean;
  // Prescription - all tiers
  hasPrescription: boolean;
  // Management - intermediate + advanced
  hasDashboard: boolean;
  hasRegistration: boolean;
  hasAnamnesis: boolean;
  hasStudents: boolean;
  hasAgenda: boolean;
  hasTeam: boolean;
  hasPlans: boolean;
  hasAppearance: boolean;
  // Financial - intermediate + advanced
  hasFinancial: boolean;
  // WhatsApp CRM - advanced only
  hasWhatsApp: boolean;
  hasAutomation: boolean;
}

export function useCompanyFeatures(): CompanyFeatures {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, contextLoading } = useMaster();
  const [tier, setTier] = useState<CompanyTier>("basic");
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState(deniedCompanyFeatures);
  const target = role === "master" ? viewingCompany?.id : companyId;
  const scope = `${user?.id ?? "none"}:${role}:${target ?? "none"}`;
  const [loadedScope, setLoadedScope] = useState("");

  useEffect(() => {
    let current = true;
    let requestVersion = 0;
    setTier("basic");
    setLoading(true);
    setFeatures(deniedCompanyFeatures);
    if (!user) {
      setLoading(false);
      return;
    }

    if (role === "master") {
      if (contextLoading) return;
      if (!target) {
        setTier("advanced");
        setFeatures(unrestrictedMasterFeatures);
        setLoadedScope(scope);
        setLoading(false);
        return;
      }
    }

    const fetchTier = async () => {
      const request = ++requestVersion;
      setLoading(true);
      try {
        const result = target ? await fetchCompanyEntitlements(target) : null;
        if (!current || request !== requestVersion) return;
        setTier(result?.tier ?? "basic");
        setFeatures(result?.features ?? deniedCompanyFeatures);
      } catch {
        if (!current || request !== requestVersion) return;
        setFeatures(deniedCompanyFeatures);
      }
      if (!current || request !== requestVersion) return;
      setLoadedScope(scope);
      setLoading(false);
    };

    void fetchTier();
    const refresh = () => { void fetchTier(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("company-feature-policy-changed", refresh);
    return () => {
      current = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("company-feature-policy-changed", refresh);
    };
  }, [contextLoading, role, user, target, scope]);

  return {
    tier: loadedScope === scope ? tier : "basic",
    loading: !!user && (loading || loadedScope !== scope),
    ...(user && loadedScope === scope && !(role === "master" && contextLoading) ? features : deniedCompanyFeatures),
  };
}
