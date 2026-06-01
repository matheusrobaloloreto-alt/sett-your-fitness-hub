import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

interface ViewingCompany {
  id: string;
  name: string;
  tier: string;
  slug: string | null;
}

interface MasterContextType {
  viewingCompany: ViewingCompany | null;
  setViewingCompany: (company: ViewingCompany | null) => void;
  isViewingCompany: boolean;
  exitCompanyView: () => void;
}

const MasterContext = createContext<MasterContextType | undefined>(undefined);

export function MasterProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [viewingCompany, setViewingCompanyState] = useState<ViewingCompany | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("master_viewing_company");
    if (stored && role === "master") {
      try {
        setViewingCompanyState(JSON.parse(stored));
      } catch {
        localStorage.removeItem("master_viewing_company");
      }
    }
  }, [role]);

  // Clear if not master
  useEffect(() => {
    if (role && role !== "master") {
      localStorage.removeItem("master_viewing_company");
      setViewingCompanyState(null);
    }
  }, [role]);

  const setViewingCompany = (company: ViewingCompany | null) => {
    if (company) {
      localStorage.setItem("master_viewing_company", JSON.stringify(company));
    } else {
      localStorage.removeItem("master_viewing_company");
    }
    setViewingCompanyState(company);
  };

  const exitCompanyView = () => {
    setViewingCompany(null);
  };

  return (
    <MasterContext.Provider
      value={{
        viewingCompany,
        setViewingCompany,
        isViewingCompany: !!viewingCompany,
        exitCompanyView,
      }}
    >
      {children}
    </MasterContext.Provider>
  );
}

export function useMaster() {
  const context = useContext(MasterContext);
  if (context === undefined) {
    throw new Error("useMaster must be used within a MasterProvider");
  }
  return context;
}
