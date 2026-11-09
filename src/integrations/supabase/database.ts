import type { Database as GeneratedDatabase, Json } from "./types";

// Local migration contracts not yet present in the generated production schema.
// Remove these extensions after rollout and type generation.
type AssessmentMaterialReceiptRow = {
  student_id: string;
  company_id: string;
  received_on: string;
  material_reference: string;
  assessment_due_on: string;
  first_prescription_due_on: string;
  recorded_at: string;
  recorded_by: string;
};

type PendingTables = {
  assessment_material_receipts: {
    Row: AssessmentMaterialReceiptRow;
    Insert: never;
    Update: never;
    Relationships: [{
      foreignKeyName: "assessment_material_receipts_student_id_fkey";
      columns: ["student_id"];
      isOneToOne: true;
      referencedRelation: "students";
      referencedColumns: ["id"];
    }];
  };
};

type PendingFunctions = {
  record_assessment_material_receipt: {
    Args: { _company_id: string; _student_id: string; _received_on: string; _material_reference: string };
    Returns: AssessmentMaterialReceiptRow[];
  };
  activate_student_enrollment_manually: {
    Args: { _company_id: string; _student_id: string; _plan_id: string; _start_date: string; _reason: string };
    Returns: string;
  };
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
  public: Omit<GeneratedDatabase["public"], "Functions" | "Tables"> & {
    Tables: GeneratedDatabase["public"]["Tables"] & PendingTables;
    Functions: GeneratedDatabase["public"]["Functions"] & PendingFunctions;
  };
};
