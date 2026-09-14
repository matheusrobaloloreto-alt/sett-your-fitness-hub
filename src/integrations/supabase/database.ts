import type { Database as GeneratedDatabase, Json } from "./types";

// Local migration contract not yet present in the generated production schema.
// Source: 20260910103000_weekly_contact_consent_ledger.sql. Remove this extension
// after the rollout and the next type generation; never hand-edit types.ts.
type PendingFunctions = {
  get_company_dashboard_snapshot: {
    Args: { _company_id: string };
    Returns: Json;
  };
  record_weekly_contact_consent: {
    Args: {
      _student_id: string;
      _event_type: string;
      _policy_version: string;
      _recipient_key: string | null;
      _source: string;
    };
    Returns: Json;
  };
  weekly_contact_consent_status: {
    Args: { _student_id: string; _recipient_key: string | null };
    Returns: Json;
  };
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: GeneratedDatabase["public"]["Functions"] & PendingFunctions;
  };
};
