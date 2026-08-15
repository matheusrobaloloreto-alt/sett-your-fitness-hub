export type ConnectableProvider = "oura" | "strava" | "polar" | "whoop";
export type Provider = ConnectableProvider | "garmin" | "apple_health";

export interface TokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  tokenType: string | null;
  scopes: string[];
  externalUserId: string | null;
}

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
}

export interface CredentialEnvelope {
  keyId: string;
  accessToken: EncryptedValue;
  refreshToken: EncryptedValue | null;
}

export interface WearableMetricRow {
  student_id: string;
  company_id: string;
  device_id: string;
  date: string;
  recorded_at: string | null;
  timezone_offset_minutes: number | null;
  metric: string;
  value: number | null;
  unit: string | null;
  score_state: string | null;
  source: ConnectableProvider;
  external_id: string | null;
  metadata: Record<string, unknown>;
}

export interface WearableWorkoutRow {
  student_id: string;
  company_id: string;
  device_id: string;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  timezone_offset_minutes: number | null;
  activity_type: string;
  duration_min: number | null;
  distance_km: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  elevation_gain_m: number | null;
  avg_pace: string | null;
  strain: number | null;
  source: ConnectableProvider;
  external_id: string;
  metadata: Record<string, unknown>;
}
