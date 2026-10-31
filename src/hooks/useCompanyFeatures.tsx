import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { deniedCompanyFeatures, fetchCompanyEntitlements, unrestrictedMasterFeatures } from "@/lib/companyFeatureEntitlements";

export type CompanyTier = "basic" | "intermediate" | "advanced";

export interface CompanyFeatures {
  tier: CompanyTier;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  retry: () => void;
  canSendWhatsApp: () => boolean;
  waitForWhatsAppValidation: () => Promise<boolean>;
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

// Ephemeral, shared only by mounted consumers of the exact identity/role/tenant.
// No persisted grants and no reuse after the last consumer leaves a scope.
export const FEATURE_VALIDATION_DEADLINE_MS = 15000;
type Snapshot = { tier: CompanyTier; loading: boolean; refreshing: boolean; error: string | null; features: typeof deniedCompanyFeatures };
type Entry = { snapshot: Snapshot; listeners: Set<() => void>; generation: number; pending: boolean; users: number; policyEvent?: Event };
const entries = new Map<string, Entry>();
const empty: Snapshot = { tier: "basic", loading: true, refreshing: false, error: null, features: deniedCompanyFeatures };
function publish(entry: Entry, snapshot: Snapshot) {
  entry.snapshot = snapshot;
  entry.listeners.forEach(listener => listener());
}
export function useCompanyFeatures(): CompanyFeatures {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, contextLoading } = useMaster();
  const target = role === "master" ? viewingCompany?.id : companyId;
  const scope = JSON.stringify([user?.id, role, target]);
  let entry = entries.get(scope);
  if (!entry) { entry = { snapshot: empty, listeners: new Set(), generation: 0, pending: false, users: 0 }; entries.set(scope, entry); }
  const active = entry;
  const snapshot = useSyncExternalStore(
    listener => { active.listeners.add(listener); return () => { active.listeners.delete(listener); }; },
    () => active.snapshot,
  );
  const userId = user?.id;
  const validate = useCallback(() => {
    if (active.pending || !userId || (role === "master" && contextLoading)) return;
    active.pending = true;
    const generation = ++active.generation;
    publish(active, { ...active.snapshot, refreshing: !active.snapshot.loading, error: null });
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), FEATURE_VALIDATION_DEADLINE_MS); });
    const result = role === "master" && !target
      ? Promise.resolve({ tier: "advanced" as const, features: unrestrictedMasterFeatures })
      : target ? fetchCompanyEntitlements(target) : Promise.resolve(null);
    void Promise.race([result, deadline]).then(value => {
      if (generation !== active.generation) return;
      publish(active, { tier: value?.tier ?? "basic", features: value?.features ?? deniedCompanyFeatures, loading: false, refreshing: false, error: null });
    }, () => {
      if (generation !== active.generation) return;
      publish(active, { ...active.snapshot, loading: false, refreshing: false, error: "Não foi possível validar o acesso. Tente novamente." });
    }).finally(() => {
      clearTimeout(timer);
      if (generation === active.generation) { active.pending = false; active.listeners.forEach(listener => listener()); }
    });
  }, [active, userId, role, target, contextLoading]);
  useEffect(() => {
    entries.set(scope, active);
    active.users++;
    if (active.users === 1) validate();
    const refresh = () => validate();
    const policyChanged = (event: Event) => {
      if (active.policyEvent === event) return;
      active.policyEvent = event;
      active.generation++; active.pending = false; validate();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("company-feature-policy-changed", policyChanged);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("company-feature-policy-changed", policyChanged);
      if (--active.users === 0) { active.generation++; active.pending = false; entries.delete(scope); active.listeners.forEach(listener => listener()); }
    };
  }, [scope, contextLoading, active, validate]);
  const waitForWhatsAppValidation = (): Promise<boolean> => new Promise(resolve => {
    const check = () => {
      if (entries.get(scope) !== active || !active.pending) {
        active.listeners.delete(check);
        resolve(entries.get(scope) === active && !active.snapshot.loading && !active.snapshot.error && active.snapshot.features.hasWhatsApp);
      }
    };
    active.listeners.add(check);
    check();
  });
  const blocked = !user || (role === "master" && contextLoading);
  return {
    tier: snapshot.tier,
    loading: !!user && (snapshot.loading || blocked),
    refreshing: snapshot.refreshing,
    error: snapshot.error,
    retry: validate,
    waitForWhatsAppValidation,
    // Read current store at dispatch time, including the focus-before-render gap.
    canSendWhatsApp: () => !blocked && entries.get(scope) === active && !active.pending && !active.snapshot.loading && !active.snapshot.error && active.snapshot.features.hasWhatsApp,
    ...(blocked ? deniedCompanyFeatures : snapshot.features),
  };
}
