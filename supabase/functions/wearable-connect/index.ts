import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "oura" | "strava" | "polar" | "whoop" | "garmin" | "apple_health";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (Deno.env.get("APP_URL") || "https://www.settapp.com.br").replace(/\/$/, "");
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/wearable-connect/callback`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const CONNECTABLE_PROVIDERS: Provider[] = ["oura", "strava", "polar", "whoop"];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function appendQuery(urlValue: string, key: string, value: string) {
  const url = new URL(urlValue, APP_URL);
  if (url.origin !== new URL(APP_URL).origin) return appendQuery(`${APP_URL}/aluno`, key, value);
  url.searchParams.set(key, value);
  return url.toString();
}

function parseProvider(value: unknown): Provider | null {
  const provider = String(value || "") as Provider;
  return [...CONNECTABLE_PROVIDERS, "garmin", "apple_health"].includes(provider) ? provider : null;
}

function throwDbError(error: { message?: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message || "erro no banco"}`);
}

function providerSecrets(provider: Provider) {
  const prefix = provider === "apple_health" ? "APPLE_HEALTH" : provider.toUpperCase();
  return {
    clientId: Deno.env.get(`${prefix}_CLIENT_ID`) || "",
    clientSecret: Deno.env.get(`${prefix}_CLIENT_SECRET`) || "",
  };
}

async function requireStudent(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return null;
  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, company_id, full_name")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDbError(studentError, "Falha ao localizar o aluno");
  return student || null;
}

function authorizeUrl(provider: Provider, clientId: string, state: string) {
  const callback = encodeURIComponent(CALLBACK_URL);
  const encodedState = encodeURIComponent(state);
  if (provider === "oura") {
    return `https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${callback}&scope=${encodeURIComponent("email personal daily heartrate workout tag session spo2")}&state=${encodedState}`;
  }
  if (provider === "strava") {
    return `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${callback}&response_type=code&approval_prompt=auto&scope=${encodeURIComponent("read,activity:read_all")}&state=${encodedState}`;
  }
  if (provider === "polar") {
    return `https://flow.polar.com/oauth2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${callback}&scope=${encodeURIComponent("accesslink.read_all")}&state=${encodedState}`;
  }
  if (provider === "whoop") {
    return `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${callback}&response_type=code&scope=${encodeURIComponent("read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement offline")}&state=${encodedState}`;
  }
  return "";
}

async function exchangeCode(provider: Provider, code: string, clientId: string, clientSecret: string) {
  const endpoints: Partial<Record<Provider, string>> = {
    oura: "https://api.ouraring.com/oauth/token",
    strava: "https://www.strava.com/oauth/token",
    polar: "https://polarremote.com/v2/oauth2/token",
    whoop: "https://api.prod.whoop.com/oauth/oauth2/token",
  };
  const endpoint = endpoints[provider];
  if (!endpoint) throw new Error("Provedor sem troca OAuth web.");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK_URL,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (provider === "polar" || provider === "whoop") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  const response = await fetch(endpoint, { method: "POST", headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Falha OAuth ${provider}: ${payload.error_description || payload.error || response.status}`);
  }
  return payload;
}

async function registerPolarUser(accessToken: string, memberId: string) {
  const response = await fetch("https://www.polaraccesslink.com/v3/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ "member-id": memberId }),
  });
  if (response.status === 409) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Falha ao registrar usuário Polar: ${payload.message || response.status}`);
  return payload;
}

async function refreshAccessToken(device: any) {
  if (!device.refresh_token) return device.access_token as string;
  if (device.token_expires_at && new Date(device.token_expires_at).getTime() > Date.now() + 120_000) {
    return device.access_token as string;
  }
  const provider = device.provider as Provider;
  const { clientId, clientSecret } = providerSecrets(provider);
  const endpoints: Partial<Record<Provider, string>> = {
    oura: "https://api.ouraring.com/oauth/token",
    strava: "https://www.strava.com/oauth/token",
    polar: "https://polarremote.com/v2/oauth2/token",
    whoop: "https://api.prod.whoop.com/oauth/oauth2/token",
  };
  const endpoint = endpoints[provider];
  if (!endpoint || !clientId || !clientSecret) return device.access_token as string;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: device.refresh_token,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (provider === "whoop") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Não foi possível renovar ${provider}.`);
  const { error: refreshStoreError } = await admin.from("wearable_devices").update({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || device.refresh_token,
    token_expires_at: payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString() : null,
  }).eq("id", device.id);
  throwDbError(refreshStoreError, `Falha ao salvar token renovado de ${provider}`);
  return payload.access_token as string;
}

function formatPace(secondsPerKilometer: number | null) {
  if (!secondsPerKilometer || !Number.isFinite(secondsPerKilometer)) return null;
  const minutes = Math.floor(secondsPerKilometer / 60);
  const seconds = Math.round(secondsPerKilometer % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function isoDurationMinutes(value: unknown) {
  const match = String(value || "").match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return null;
  const minutes = Number(match[1] || 0) * 60 + Number(match[2] || 0) + Number(match[3] || 0) / 60;
  return Number.isFinite(minutes) ? Math.round(minutes) : null;
}

async function syncStrava(device: any, token: string) {
  const response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=50&page=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Strava respondeu ${response.status}.`);
  const activities = await response.json();
  const rows = (Array.isArray(activities) ? activities : []).map((item: any) => ({
    student_id: device.student_id,
    device_id: device.id,
    started_at: item.start_date,
    ended_at: item.start_date && item.elapsed_time ? new Date(new Date(item.start_date).getTime() + Number(item.elapsed_time) * 1000).toISOString() : null,
    duration_min: item.moving_time ? Math.round(Number(item.moving_time) / 60) : null,
    activity_type: item.sport_type || item.type || "activity",
    distance_km: item.distance ? Number(item.distance) / 1000 : null,
    calories: item.calories ?? null,
    avg_heart_rate: item.average_heartrate ?? null,
    max_heart_rate: item.max_heartrate ?? null,
    elevation_gain_m: item.total_elevation_gain ?? null,
    avg_pace: formatPace(item.average_speed ? 1000 / Number(item.average_speed) : null),
    source: "strava",
    external_id: String(item.id),
    metadata: item,
  }));
  if (rows.length) {
    const { error } = await admin.from("wearable_workouts").upsert(rows, { onConflict: "student_id,external_id,source" });
    throwDbError(error, "Falha ao salvar atividades do Strava");
  }
  return rows.length;
}

function dateRange(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function syncOura(device: any, token: string) {
  const { start, end } = dateRange();
  const resources = ["daily_sleep", "daily_readiness", "daily_activity"];
  let count = 0;
  for (const resource of resources) {
    const response = await fetch(`https://api.ouraring.com/v2/usercollection/${resource}?start_date=${start}&end_date=${end}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Oura ${resource} respondeu ${response.status}.`);
    const payload = await response.json();
    const rows = (payload.data || []).map((item: any) => ({
      student_id: device.student_id,
      device_id: device.id,
      date: item.day,
      metric: resource.replace("daily_", "") + "_score",
      value: Number(item.score ?? 0),
      unit: "score",
      source: "oura",
      metadata: item,
    })).filter((row: any) => row.date && Number.isFinite(row.value));
    if (rows.length) {
      const { error } = await admin.from("wearable_data").upsert(rows, { onConflict: "student_id,date,metric,source" });
      throwDbError(error, `Falha ao salvar ${resource} do Oura`);
    }
    count += rows.length;
  }
  return count;
}

async function syncWhoop(device: any, token: string) {
  const resources = [
    ["cycle", "strain"],
    ["recovery", "recovery_score"],
    ["activity/sleep", "sleep_performance"],
  ] as const;
  let count = 0;
  for (const [path, metric] of resources) {
    const response = await fetch(`https://api.prod.whoop.com/developer/v2/${path}?limit=25`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`WHOOP ${path} respondeu ${response.status}.`);
    const payload = await response.json();
    const records = payload.records || [];
    const rows = records.map((item: any) => {
      const score = item.score || {};
      const value = metric === "strain" ? score.strain : metric === "recovery_score" ? score.recovery_score : score.sleep_performance_percentage;
      return {
        student_id: device.student_id,
        device_id: device.id,
        date: String(item.start || item.created_at || "").slice(0, 10),
        metric,
        value: Number(value ?? 0),
        unit: "score",
        source: "whoop",
        metadata: item,
      };
    }).filter((row: any) => row.date && Number.isFinite(row.value));
    if (rows.length) {
      const { error } = await admin.from("wearable_data").upsert(rows, { onConflict: "student_id,date,metric,source" });
      throwDbError(error, `Falha ao salvar ${metric} do WHOOP`);
    }
    count += rows.length;
  }
  return count;
}

async function syncPolar(device: any, token: string) {
  const response = await fetch("https://www.polaraccesslink.com/v3/exercises", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Polar respondeu ${response.status}; confira o cadastro AccessLink do usuário.`);
  const activities = await response.json();
  const rows = (Array.isArray(activities) ? activities : []).map((item: any) => ({
    student_id: device.student_id,
    device_id: device.id,
    started_at: item.start_time,
    ended_at: null,
    duration_min: isoDurationMinutes(item.duration),
    activity_type: item.sport || "activity",
    distance_km: item.distance ? Number(item.distance) / 1000 : null,
    calories: item.calories ?? null,
    avg_heart_rate: item.heart_rate?.average ?? null,
    max_heart_rate: item.heart_rate?.maximum ?? null,
    source: "polar",
    external_id: String(item.id),
    metadata: item,
  }));
  if (rows.length) {
    const { error } = await admin.from("wearable_workouts").upsert(rows, { onConflict: "student_id,external_id,source" });
    throwDbError(error, "Falha ao salvar atividades do Polar");
  }
  return rows.length;
}

async function handleCallback(url: URL) {
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (!state || !code || providerError) {
    console.error("wearable callback rejected", { providerError, hasState: Boolean(state), hasCode: Boolean(code) });
    return Response.redirect(appendQuery(`${APP_URL}/aluno`, "wearable", providerError ? "denied" : "error"), 302);
  }
  const { data: oauthState, error: stateError } = await admin.from("wearable_oauth_states").select("*").eq("state", state).maybeSingle();
  if (stateError) {
    console.error("wearable callback state", stateError);
    return Response.redirect(appendQuery(`${APP_URL}/aluno`, "wearable", "error"), 302);
  }
  if (!oauthState || oauthState.consumed_at || new Date(oauthState.expires_at) < new Date()) {
    return Response.redirect(appendQuery(`${APP_URL}/aluno`, "wearable", "expired"), 302);
  }
  try {
    const provider = parseProvider(oauthState.provider);
    if (!provider || !CONNECTABLE_PROVIDERS.includes(provider)) throw new Error("Provedor OAuth inválido.");
    const { clientId, clientSecret } = providerSecrets(provider);
    if (!clientId || !clientSecret) throw new Error(`Credenciais de ${provider} não configuradas.`);
    const token = await exchangeCode(provider, code, clientId, clientSecret);
    const polarRegistration = provider === "polar"
      ? await registerPolarUser(token.access_token, String(oauthState.student_id))
      : null;
    const externalUserId = String(
      token.x_user_id || polarRegistration?.["polar-user-id"] || token.user_id || token.athlete?.id || token.id || "",
    ) || null;
    const { error: deviceError } = await admin.from("wearable_devices").upsert({
      student_id: oauthState.student_id,
      provider,
      device_name: provider.toUpperCase(),
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      token_expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
      external_user_id: externalUserId,
      is_active: true,
      last_sync_status: "connected",
      last_error: null,
    }, { onConflict: "student_id,provider" });
    throwDbError(deviceError, `Falha ao salvar conexão ${provider}`);
    const { error: consumeError } = await admin.from("wearable_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("state", state);
    throwDbError(consumeError, "Falha ao concluir autorização");
    return Response.redirect(appendQuery(oauthState.return_url || `${APP_URL}/aluno`, "wearable", "connected"), 302);
  } catch (error) {
    console.error("wearable callback", error);
    return Response.redirect(appendQuery(oauthState.return_url || `${APP_URL}/aluno`, "wearable", "error"), 302);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/callback")) return handleCallback(url);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const student = await requireStudent(req);
  if (!student) return json({ error: "Aluno não autenticado." }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  const provider = parseProvider(body.provider);

  if (action === "status") {
    const [devicesResult, metricsResult, workoutsResult] = await Promise.all([
      admin.from("wearable_devices").select("id, provider, device_name, is_active, last_sync_at, last_sync_status, last_error").eq("student_id", student.id),
      admin.from("wearable_data").select("date, metric, value, unit, source").eq("student_id", student.id).order("date", { ascending: false }).limit(40),
      admin.from("wearable_workouts").select("started_at, activity_type, duration_min, distance_km, avg_heart_rate, source").eq("student_id", student.id).order("started_at", { ascending: false }).limit(12),
    ]);
    throwDbError(devicesResult.error, "Falha ao carregar dispositivos");
    throwDbError(metricsResult.error, "Falha ao carregar métricas");
    throwDbError(workoutsResult.error, "Falha ao carregar atividades");
    return json({ devices: devicesResult.data || [], metrics: metricsResult.data || [], workouts: workoutsResult.data || [] });
  }

  if (action === "authorize") {
    if (!provider) return json({ error: "Provedor inválido." }, 400);
    if (provider === "apple_health") return json({ status: "requires_native_app", message: "Apple Saúde exige um aplicativo iOS com HealthKit; a versão web não pode ler esses dados diretamente." }, 200);
    if (provider === "garmin") return json({ status: "approval_required", message: "Garmin Health exige aprovação comercial do aplicativo antes de liberar a conexão." }, 200);
    if (!CONNECTABLE_PROVIDERS.includes(provider)) return json({ error: "Provedor inválido." }, 400);
    const { clientId, clientSecret } = providerSecrets(provider);
    if (!clientId || !clientSecret) return json({ status: "configuration_required", message: `A integração ${provider.toUpperCase()} está pronta no app, mas ainda precisa das credenciais do portal do fabricante.` }, 200);
    const state = crypto.randomUUID();
    const { error: stateInsertError } = await admin.from("wearable_oauth_states").insert({
      state,
      provider,
      student_id: student.id,
      return_url: `${APP_URL}/aluno`,
    });
    throwDbError(stateInsertError, "Falha ao iniciar a autorização");
    return json({ status: "ready", authorize_url: authorizeUrl(provider, clientId, state) });
  }

  if (action === "disconnect") {
    if (!provider) return json({ error: "Provedor inválido." }, 400);
    const { error } = await admin.from("wearable_devices").update({ is_active: false, access_token: null, refresh_token: null }).eq("student_id", student.id).eq("provider", provider);
    throwDbError(error, "Falha ao desconectar dispositivo");
    return json({ ok: true });
  }

  if (action === "sync") {
    if (!provider || !CONNECTABLE_PROVIDERS.includes(provider)) return json({ error: "Provedor inválido." }, 400);
    const { data: device, error: deviceError } = await admin.from("wearable_devices").select("*").eq("student_id", student.id).eq("provider", provider).eq("is_active", true).maybeSingle();
    throwDbError(deviceError, "Falha ao localizar dispositivo");
    if (!device) return json({ error: "Integração não conectada." }, 404);
    try {
      const token = await refreshAccessToken(device);
      const count = provider === "strava"
        ? await syncStrava(device, token)
        : provider === "oura"
          ? await syncOura(device, token)
          : provider === "whoop"
            ? await syncWhoop(device, token)
            : provider === "polar"
              ? await syncPolar(device, token)
              : 0;
      const { error: syncStoreError } = await admin.from("wearable_devices").update({ last_sync_at: new Date().toISOString(), last_sync_status: "success", last_error: null }).eq("id", device.id);
      throwDbError(syncStoreError, "Falha ao concluir sincronização");
      return json({ ok: true, imported: count });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na sincronização.";
      const { error: errorStoreError } = await admin.from("wearable_devices").update({ last_sync_status: "error", last_error: message }).eq("id", device.id);
      if (errorStoreError) console.error("wearable sync error status", errorStoreError);
      return json({ error: message }, 502);
    }
  }

  return json({ error: "Ação inválida." }, 400);
});
