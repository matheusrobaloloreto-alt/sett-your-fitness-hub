import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decryptTokens,
  encryptTokens,
  parseKeyring,
  sanitizeError,
} from "../_shared/wearables/crypto.ts";
import { requestJson, WearableHttpError } from "../_shared/wearables/http.ts";
import {
  authorizeUrl,
  createOAuthState,
  exchangeAuthorizationCode,
  missingScopes,
  refreshProviderToken,
  REQUIRED_SCOPES,
  resolveGrantedScopes,
  revokeProviderToken,
} from "../_shared/wearables/oauth.ts";
import { localDate } from "../_shared/wearables/normalize.ts";
import {
  type SyncDevice,
  syncOura,
  type SyncResult,
  syncWhoop,
} from "../_shared/wearables/providers.ts";
import type {
  ConnectableProvider,
  CredentialEnvelope,
  Provider,
  TokenBundle,
} from "../_shared/wearables/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") || "https://www.settapp.com.br")
  .replace(/\/$/, "");
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/wearable-connect/callback`;
const PRIVACY_VERSION = "wearables-v1-2026-08-14";
const CONNECTABLE: ConnectableProvider[] = ["oura", "strava", "polar", "whoop"];
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseProvider(value: unknown): Provider | null {
  const provider = String(value ?? "") as Provider;
  return [...CONNECTABLE, "garmin", "apple_health"].includes(provider)
    ? provider
    : null;
}

function providerSecrets(provider: ConnectableProvider) {
  const prefix = provider.toUpperCase();
  return {
    clientId: Deno.env.get(`${prefix}_CLIENT_ID`) ?? "",
    clientSecret: Deno.env.get(`${prefix}_CLIENT_SECRET`) ?? "",
  };
}

function tokenConfiguration() {
  const activeKeyId = Deno.env.get("WEARABLE_TOKEN_ACTIVE_KEY_ID") ?? "";
  const rawKeyring = Deno.env.get("WEARABLE_TOKEN_KEYS") ?? "";
  if (!activeKeyId || !rawKeyring) return null;
  try {
    return { activeKeyId, keyring: parseKeyring(rawKeyring, activeKeyId) };
  } catch {
    return null;
  }
}

function appendQuery(urlValue: string, key: string, value: string) {
  const fallback = new URL("/aluno", APP_URL);
  let url: URL;
  try {
    url = new URL(urlValue, APP_URL);
  } catch {
    url = fallback;
  }
  if (url.origin !== fallback.origin) url = fallback;
  url.searchParams.set(key, value);
  return url.toString();
}

function dbError(error: { message?: string } | null, code: string) {
  if (error) throw new Error(`${code}:${error.message ?? "database_error"}`);
}

async function requireStudent(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return null;
  const { data, error } = await admin.from("students").select(
    "id, company_id, user_id",
  ).eq("user_id", authData.user.id).order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  dbError(error, "student_lookup_failed");
  return data ? { ...data, actor_user_id: authData.user.id } : null;
}

async function storeCredentials(
  deviceId: string,
  tokens: TokenBundle,
  version?: number,
) {
  const configuration = tokenConfiguration();
  if (!configuration) throw new Error("config_required");
  const envelope = await encryptTokens(
    tokens,
    configuration.keyring,
    configuration.activeKeyId,
    deviceId,
  );
  const row = {
    device_id: deviceId,
    key_id: envelope.keyId,
    access_token_ciphertext: envelope.accessToken.ciphertext,
    access_token_iv: envelope.accessToken.iv,
    refresh_token_ciphertext: envelope.refreshToken?.ciphertext ?? null,
    refresh_token_iv: envelope.refreshToken?.iv ?? null,
    token_expires_at: tokens.expiresAt,
    token_type: tokens.tokenType,
    updated_at: new Date().toISOString(),
    rotated_at: new Date().toISOString(),
    ...(version ? { version: version + 1 } : {}),
  };
  const query = version
    ? admin.from("wearable_credentials").update(row).eq("device_id", deviceId)
      .eq("version", version)
    : admin.from("wearable_credentials").upsert(row, {
      onConflict: "device_id",
    });
  const { data, error } = await query.select("version").maybeSingle();
  dbError(error, "credential_store_failed");
  if (version && !data) throw new Error("refresh_version_conflict");
}

async function loadCredentials(deviceId: string) {
  const configuration = tokenConfiguration();
  if (!configuration) throw new Error("config_required");
  const { data, error } = await admin.from("wearable_credentials").select("*")
    .eq("device_id", deviceId).maybeSingle();
  dbError(error, "credential_load_failed");
  if (!data) throw new Error("reauthorization_required");
  const envelope: CredentialEnvelope = {
    keyId: data.key_id,
    accessToken: {
      ciphertext: data.access_token_ciphertext,
      iv: data.access_token_iv,
    },
    refreshToken: data.refresh_token_ciphertext && data.refresh_token_iv
      ? { ciphertext: data.refresh_token_ciphertext, iv: data.refresh_token_iv }
      : null,
  };
  return {
    ...await decryptTokens(envelope, configuration.keyring, deviceId),
    expiresAt: data.token_expires_at,
    version: Number(data.version),
  };
}

async function acquireLease(
  deviceId: string,
  purpose: "sync" | "refresh",
  holder: string,
  seconds = 90,
) {
  const { data, error } = await admin.rpc("acquire_wearable_lease", {
    p_device_id: deviceId,
    p_purpose: purpose,
    p_holder: holder,
    p_ttl_seconds: seconds,
  });
  dbError(error, "lease_acquire_failed");
  return Boolean(data);
}

async function releaseLease(
  deviceId: string,
  purpose: "sync" | "refresh",
  holder: string,
) {
  const { error } = await admin.rpc("release_wearable_lease", {
    p_device_id: deviceId,
    p_purpose: purpose,
    p_holder: holder,
  });
  if (error) {
    console.error("wearable lease release failed", {
      purpose,
      code: error.code,
    });
  }
}

async function validAccessToken(device: SyncDevice, holder: string) {
  let credentials = await loadCredentials(device.id);
  if (
    !credentials.expiresAt ||
    new Date(credentials.expiresAt).getTime() > Date.now() + 120_000
  ) return credentials.accessToken;
  if (!credentials.refreshToken) throw new Error("reauthorization_required");
  if (!await acquireLease(device.id, "refresh", holder, 60)) {
    throw new Error("refresh_in_progress");
  }
  try {
    credentials = await loadCredentials(device.id);
    if (
      !credentials.expiresAt ||
      new Date(credentials.expiresAt).getTime() > Date.now() + 120_000
    ) return credentials.accessToken;
    const secrets = providerSecrets(device.provider);
    if (!secrets.clientId || !secrets.clientSecret) {
      throw new Error("config_required");
    }
    const refreshed = await refreshProviderToken(
      device.provider,
      credentials.refreshToken!,
      secrets.clientId,
      secrets.clientSecret,
    );
    await storeCredentials(device.id, refreshed, credentials.version);
    return refreshed.accessToken;
  } finally {
    await releaseLease(device.id, "refresh", holder);
  }
}

async function syncLegacyProvider(
  device: SyncDevice,
  token: string,
): Promise<SyncResult> {
  if (device.provider === "polar") {
    try {
      await requestJson("https://www.polaraccesslink.com/v3/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ "member-id": device.student_id }),
      });
    } catch (error) {
      if (!(error instanceof WearableHttpError) || error.status !== 409) {
        throw error;
      }
    }
  }
  const url = device.provider === "strava"
    ? "https://www.strava.com/api/v3/athlete/activities?per_page=50&page=1"
    : "https://www.polaraccesslink.com/v3/exercises";
  const activities = await requestJson<Record<string, any>[]>(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const workouts = (Array.isArray(activities) ? activities : []).flatMap(
    (item) => {
      const startedAt = String(item.start_date ?? item.start_time ?? "");
      const externalId = String(item.id ?? "");
      if (!startedAt || !externalId) return [];
      const durationSeconds = Number(item.moving_time ?? 0);
      return [{
        student_id: device.student_id,
        company_id: device.company_id,
        device_id: device.id,
        started_at: startedAt,
        ended_at: durationSeconds
          ? new Date(new Date(startedAt).getTime() + durationSeconds * 1000)
            .toISOString()
          : null,
        local_date: localDate(startedAt, "Z") ?? startedAt.slice(0, 10),
        timezone_offset_minutes: 0,
        activity_type: String(
          item.sport_type ?? item.type ?? item.sport ?? "activity",
        ),
        duration_min: device.provider === "strava"
          ? Math.round(durationSeconds / 60)
          : null,
        distance_km: item.distance == null
          ? null
          : Number(item.distance) / 1000,
        calories: item.calories == null ? null : Number(item.calories),
        avg_heart_rate: item.average_heartrate ?? item.heart_rate?.average ??
          null,
        max_heart_rate: item.max_heartrate ?? item.heart_rate?.maximum ?? null,
        elevation_gain_m: item.total_elevation_gain ?? null,
        avg_pace: null,
        strain: null,
        source: device.provider,
        external_id: externalId,
        metadata: {},
      }];
    },
  );
  return {
    metrics: [],
    workouts,
    watermarks: { [device.provider]: new Date().toISOString() },
  };
}

async function persistSync(device: SyncDevice, result: SyncResult) {
  if (result.metrics.length) {
    const { error } = await admin.from("wearable_data").upsert(result.metrics, {
      onConflict: "device_id,date,metric",
    });
    dbError(error, "metric_upsert_failed");
  }
  if (result.workouts.length) {
    const { error } = await admin.from("wearable_workouts").upsert(
      result.workouts,
      { onConflict: "device_id,external_id" },
    );
    dbError(error, "workout_upsert_failed");
  }
  for (const [resource, watermark] of Object.entries(result.watermarks)) {
    const { error } = await admin.from("wearable_sync_cursors").upsert({
      device_id: device.id,
      resource,
      watermark,
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "device_id,resource" });
    dbError(error, "cursor_upsert_failed");
  }
}

async function handleCallback(url: URL) {
  const state = url.searchParams.get("state") ?? "";
  if (!state) {
    return Response.redirect(
      appendQuery(`${APP_URL}/aluno`, "wearable", "error"),
      302,
    );
  }
  const { data: oauthState, error: stateError } = await admin.rpc(
    "consume_wearable_oauth_state",
    { p_state: state },
  );
  if (stateError || !oauthState) {
    return Response.redirect(
      appendQuery(`${APP_URL}/aluno`, "wearable", "expired"),
      302,
    );
  }
  const returnUrl = oauthState.return_url || `${APP_URL}/aluno`;
  const provider = parseProvider(oauthState.provider);
  const code = url.searchParams.get("code");
  if (
    !provider || !CONNECTABLE.includes(provider as ConnectableProvider) ||
    !code || url.searchParams.get("error")
  ) {
    return Response.redirect(appendQuery(returnUrl, "wearable", "denied"), 302);
  }
  try {
    const connectable = provider as ConnectableProvider;
    const secrets = providerSecrets(connectable);
    const configuration = tokenConfiguration();
    if (!secrets.clientId || !secrets.clientSecret || !configuration) {
      throw new Error("config_required");
    }
    const requested = Array.isArray(oauthState.requested_scopes)
      ? oauthState.requested_scopes.map(String)
      : [];
    if (requested.join(" ") !== REQUIRED_SCOPES[connectable].join(" ")) {
      throw new Error("oauth_scope_state_mismatch");
    }
    const tokens = await exchangeAuthorizationCode(
      connectable,
      code,
      secrets.clientId,
      secrets.clientSecret,
      CALLBACK_URL,
    );
    const granted = resolveGrantedScopes(
      connectable,
      tokens.scopes,
      url.searchParams.get("scope"),
    );
    const missing = missingScopes(connectable, granted);
    const { data: currentStudent, error: studentError } = await admin.from(
      "students",
    ).select("id").eq("id", oauthState.student_id).eq(
      "user_id",
      oauthState.actor_user_id,
    ).eq("company_id", oauthState.company_id).eq("status", "active")
      .maybeSingle();
    dbError(studentError, "oauth_actor_revalidation_failed");
    if (!currentStudent) throw new Error("oauth_actor_no_longer_active");
    const { data: existingDevice, error: existingError } = await admin.from(
      "wearable_devices",
    ).select("id").eq("student_id", oauthState.student_id).eq(
      "provider",
      connectable,
    ).maybeSingle();
    dbError(existingError, "device_lookup_failed");
    const deviceId = existingDevice?.id ?? crypto.randomUUID();
    const envelope = await encryptTokens(
      { ...tokens, scopes: granted },
      configuration.keyring,
      configuration.activeKeyId,
      deviceId,
    );
    const { data: committedDeviceId, error: commitError } = await admin.rpc(
      "commit_wearable_connection",
      {
        p_device_id: deviceId,
        p_student_id: oauthState.student_id,
        p_actor_user_id: oauthState.actor_user_id,
        p_company_id: oauthState.company_id,
        p_provider: connectable,
        p_granted_scopes: granted,
        p_required_scopes: REQUIRED_SCOPES[connectable],
        p_key_id: envelope.keyId,
        p_access_ciphertext: envelope.accessToken.ciphertext,
        p_access_iv: envelope.accessToken.iv,
        p_refresh_ciphertext: envelope.refreshToken?.ciphertext ?? null,
        p_refresh_iv: envelope.refreshToken?.iv ?? null,
        p_token_expires_at: tokens.expiresAt,
        p_token_type: tokens.tokenType,
        p_privacy_version: PRIVACY_VERSION,
      },
    );
    dbError(commitError, "connection_commit_failed");
    if (!committedDeviceId) throw new Error("connection_commit_failed");
    return Response.redirect(
      appendQuery(
        returnUrl,
        "wearable",
        missing.length ? "partial_scope" : "connected",
      ),
      302,
    );
  } catch (error) {
    const safeCode = sanitizeError(error);
    console.error("wearable callback failed", { code: safeCode, provider });
    return Response.redirect(
      appendQuery(
        returnUrl,
        "wearable",
        safeCode === "config_required" ? "config_required" : "error",
      ),
      302,
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const url = new URL(req.url);
  if (url.pathname.endsWith("/webhook")) {
    return json({ error: "webhooks_disabled" }, 404);
  }
  if (req.method === "GET" && url.pathname.endsWith("/callback")) {
    return handleCallback(url);
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const student = await requireStudent(req);
  if (!student) return json({ error: "student_unauthenticated" }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "status");
  const provider = parseProvider(body.provider);

  if (action === "status") {
    const [devices, metrics, workouts] = await Promise.all([
      admin.from("wearable_devices").select(
        "id,provider,device_name,is_active,connection_status,granted_scopes,required_scopes,last_sync_at,last_sync_status,last_error_code,last_error,revocation_status,revoked_at",
      ).eq("student_id", student.id),
      admin.from("wearable_data").select(
        "date,recorded_at,metric,value,unit,score_state,source",
      ).eq("student_id", student.id).order("date", { ascending: false }).limit(
        80,
      ),
      admin.from("wearable_workouts").select(
        "started_at,local_date,activity_type,duration_min,distance_km,avg_heart_rate,strain,source",
      ).eq("student_id", student.id).order("started_at", { ascending: false })
        .limit(20),
    ]);
    dbError(devices.error, "device_status_failed");
    dbError(metrics.error, "metric_status_failed");
    dbError(workouts.error, "workout_status_failed");
    const configured = Object.fromEntries(CONNECTABLE.map((item) => {
      const secrets = providerSecrets(item);
      return [
        item,
        Boolean(
          secrets.clientId && secrets.clientSecret && tokenConfiguration(),
        ),
      ];
    }));
    const now = Date.now();
    return json({
      devices: (devices.data ?? []).map((device) => ({
        ...device,
        connection_status: device.is_active && device.last_sync_at &&
            now - new Date(device.last_sync_at).getTime() > 36 * 60 * 60 * 1000
          ? "stale"
          : device.connection_status,
      })),
      metrics: metrics.data ?? [],
      workouts: workouts.data ?? [],
      configuration: configured,
      webhooks: "disabled",
    });
  }

  if (action === "authorize") {
    if (!provider) return json({ error: "provider_invalid" }, 400);
    if (provider === "apple_health") {
      return json({
        status: "requires_native_app",
        message: "Apple Saúde exige aplicativo iOS com HealthKit.",
      });
    }
    if (provider === "garmin") {
      return json({
        status: "approval_required",
        message: "Garmin Health exige aprovação comercial do aplicativo.",
      });
    }
    if (!CONNECTABLE.includes(provider as ConnectableProvider)) {
      return json({ error: "provider_invalid" }, 400);
    }
    const connectable = provider as ConnectableProvider;
    const secrets = providerSecrets(connectable);
    if (!secrets.clientId || !secrets.clientSecret || !tokenConfiguration()) {
      return json({
        status: "config_required",
        message:
          `A integração ${connectable.toUpperCase()} ainda requer configuração segura do servidor.`,
      });
    }
    const state = createOAuthState();
    const { error } = await admin.from("wearable_oauth_states").insert({
      state,
      student_id: student.id,
      actor_user_id: student.actor_user_id,
      company_id: student.company_id,
      provider: connectable,
      requested_scopes: REQUIRED_SCOPES[connectable],
      return_url: `${APP_URL}/aluno`,
    });
    dbError(error, "oauth_state_store_failed");
    return json({
      status: "ready",
      authorize_url: authorizeUrl(
        connectable,
        secrets.clientId,
        state,
        CALLBACK_URL,
      ),
    });
  }

  if (action === "sync") {
    if (!provider || !CONNECTABLE.includes(provider as ConnectableProvider)) {
      return json({ error: "provider_invalid" }, 400);
    }
    const { data, error } = await admin.from("wearable_devices").select(
      "id,student_id,company_id,provider,granted_scopes,required_scopes,is_active",
    ).eq("student_id", student.id).eq("provider", provider).eq(
      "is_active",
      true,
    ).maybeSingle();
    dbError(error, "device_lookup_failed");
    if (!data) return json({ error: "connection_missing" }, 404);
    const missing = missingScopes(
      provider as ConnectableProvider,
      data.granted_scopes ?? [],
    );
    if (missing.length) {
      return json({ error: "partial_scope", missing_scopes: missing }, 409);
    }
    const holder = crypto.randomUUID();
    if (!await acquireLease(data.id, "sync", holder, 180)) {
      return json({ error: "sync_in_progress" }, 409);
    }
    try {
      await admin.from("wearable_devices").update({
        connection_status: "syncing",
        last_sync_status: "syncing",
        last_error: null,
        last_error_code: null,
      }).eq("id", data.id);
      const device = data as SyncDevice;
      const token = await validAccessToken(device, holder);
      const { data: cursor } = await admin.from("wearable_sync_cursors").select(
        "watermark",
      ).eq("device_id", data.id).eq("resource", provider).maybeSingle();
      const heartbeat = async () => {
        if (!await acquireLease(data.id, "sync", holder, 180)) {
          throw new Error("sync_lease_lost");
        }
      };
      const result = provider === "oura"
        ? await syncOura(device, token, cursor?.watermark ?? null, heartbeat)
        : provider === "whoop"
        ? await syncWhoop(device, token, cursor?.watermark ?? null, heartbeat)
        : await syncLegacyProvider(device, token);
      await persistSync(device, result);
      const completedAt = new Date().toISOString();
      await admin.from("wearable_devices").update({
        connection_status: "connected",
        last_sync_at: completedAt,
        last_sync_status: "success",
        last_error: null,
        last_error_code: null,
      }).eq("id", data.id);
      return json({
        ok: true,
        imported: result.metrics.length + result.workouts.length,
        metrics: result.metrics.length,
        workouts: result.workouts.length,
        synced_at: completedAt,
      });
    } catch (error) {
      const code = sanitizeError(error);
      const revoked = error instanceof WearableHttpError &&
        error.status === 401;
      await admin.from("wearable_devices").update({
        connection_status: revoked
          ? "revoked"
          : code === "config_required"
          ? "config_required"
          : "error",
        last_sync_status: "error",
        last_error_code: code,
        last_error: code,
      }).eq("id", data.id);
      return json(
        { error: code },
        revoked ? 401 : code === "config_required" ? 503 : 502,
      );
    } finally {
      await releaseLease(data.id, "sync", holder);
    }
  }

  if (action === "disconnect") {
    if (!provider || !CONNECTABLE.includes(provider as ConnectableProvider)) {
      return json({ error: "provider_invalid" }, 400);
    }
    const { data: device, error } = await admin.from("wearable_devices").select(
      "id,provider",
    ).eq("student_id", student.id).eq("provider", provider).maybeSingle();
    dbError(error, "device_lookup_failed");
    if (!device) return json({ ok: true, revocation_status: "not_connected" });
    let revocationStatus = "succeeded";
    try {
      const credentials = await loadCredentials(device.id);
      const secrets = providerSecrets(provider as ConnectableProvider);
      await revokeProviderToken(
        provider as ConnectableProvider,
        credentials.accessToken,
        secrets.clientId,
      );
    } catch (error) {
      revocationStatus = "pending";
      console.error("wearable revoke failed", {
        provider,
        code: sanitizeError(error),
      });
    }
    const now = new Date();
    if (revocationStatus === "succeeded") {
      await admin.from("wearable_credentials").delete().eq(
        "device_id",
        device.id,
      );
    }
    await admin.from("wearable_devices").update({
      is_active: false,
      connection_status: revocationStatus === "succeeded"
        ? "revoked"
        : "revocation_pending",
      revocation_status: revocationStatus,
      revoked_at: revocationStatus === "succeeded" ? now.toISOString() : null,
      revocation_retry_after: revocationStatus === "pending"
        ? new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        : null,
      credential_delete_after: revocationStatus === "pending"
        ? new Date(now.getTime() + 30 * 86_400_000).toISOString()
        : null,
      last_error_code: revocationStatus === "pending"
        ? "provider_revocation_failed"
        : null,
      last_error: revocationStatus === "pending"
        ? "provider_revocation_failed"
        : null,
    }).eq("id", device.id);
    if (revocationStatus === "succeeded") {
      await admin.from("wearable_consents").insert({
        device_id: device.id,
        student_id: student.id,
        company_id: student.company_id,
        provider,
        event_type: "revoked",
        scopes: [],
        privacy_version: PRIVACY_VERSION,
        metadata: { provider_revocation: revocationStatus },
      });
    }
    return json(
      {
        ok: revocationStatus === "succeeded",
        revocation_status: revocationStatus,
      },
      revocationStatus === "succeeded" ? 200 : 202,
    );
  }

  if (action === "delete_data") {
    if (!provider || !CONNECTABLE.includes(provider as ConnectableProvider)) {
      return json({ error: "provider_invalid" }, 400);
    }
    if (body.confirm_phrase !== "EXCLUIR DADOS") {
      return json({ error: "explicit_confirmation_required" }, 400);
    }
    const { data: device, error } = await admin.from("wearable_devices").select(
      "id",
    ).eq("student_id", student.id).eq("provider", provider).maybeSingle();
    dbError(error, "device_lookup_failed");
    if (!device) return json({ ok: true, deleted: 0 });
    const [metrics, workouts] = await Promise.all([
      admin.from("wearable_data").delete().eq("device_id", device.id).select(
        "id",
      ),
      admin.from("wearable_workouts").delete().eq("device_id", device.id)
        .select("id"),
    ]);
    dbError(metrics.error, "metric_delete_failed");
    dbError(workouts.error, "workout_delete_failed");
    await admin.from("wearable_sync_cursors").delete().eq(
      "device_id",
      device.id,
    );
    await admin.from("wearable_events").delete().eq("device_id", device.id);
    await admin.from("wearable_consents").insert({
      device_id: device.id,
      student_id: student.id,
      company_id: student.company_id,
      provider,
      event_type: "data_deleted",
      scopes: [],
      privacy_version: PRIVACY_VERSION,
      metadata: { actor_user_id: student.actor_user_id },
    });
    return json({
      ok: true,
      deleted: (metrics.data?.length ?? 0) + (workouts.data?.length ?? 0),
      retained: ["consent_ledger", "connection_status"],
    });
  }

  return json({ error: "action_invalid" }, 400);
});
