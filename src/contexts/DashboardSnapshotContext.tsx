import { createContext, useContext } from "react";
import type { CompanyDashboardSnapshot } from "@/lib/companyDashboardSnapshot";

export type { CompanyDashboardSnapshot } from "@/lib/companyDashboardSnapshot";

export const DashboardSnapshotContext = createContext<CompanyDashboardSnapshot | null>(null);

export function useDashboardSnapshot() {
  return useContext(DashboardSnapshotContext);
}
