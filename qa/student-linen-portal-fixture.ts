import { expect, type BrowserContext } from "@playwright/test";

export const backendOrigin = "https://sett-qa-fixture.supabase.co";
export const fixtureLogin = { email: "lia@example.test", password: "local-fixture-only" };
export const fixtureTime = "2026-11-09T15:00:00Z";
export const studentId = "00000000-0000-4000-8000-000000000101";
export const workoutId = "00000000-0000-4000-8000-000000000102";
export const sessionId = "00000000-0000-4000-8000-000000000103";
const companyId = "00000000-0000-4000-8000-000000000104";
const userId = "00000000-0000-4000-8000-000000000105";
const enrollmentId = "00000000-0000-4000-8000-000000000106";
const cycleId = "00000000-0000-4000-8000-000000000107";
const planId = "00000000-0000-4000-8000-000000000108";
const exerciseId = "00000000-0000-4000-8000-000000000109";
const feedbackId = "00000000-0000-4000-8000-000000000110";

type Row = Record<string, unknown>;
export type PortalScenario = "published" | "no-plan" | "inactive";

export function createLinenPortalFixture(scenario: PortalScenario) {
  const state = {
    session: null as Row | null,
    logs: new Map<string, Row>(),
    feedback: null as Row | null,
    starts: [] as Row[],
    completions: [] as Row[],
    unexpectedRequests: [] as string[],
  };
  const user = { id: userId, email: fixtureLogin.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const encoded = (value: Row) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({ alg: "none", typ: "JWT" })}.${encoded({ aud: "authenticated", exp: 4102444800, sub: userId })}.fixture`;
  const auth = { access_token: token, refresh_token: "linen-test-refresh", expires_at: 4102444800,
    expires_in: 4102444800 - Date.parse(fixtureTime) / 1000, token_type: "bearer", user };
  const student = { id: studentId, user_id: userId, full_name: "Lia Fixture", company_id: companyId,
    status: scenario === "inactive" ? "inactive" : "active", weekly_workout_goal: 3 };
  const enrollment = { id: enrollmentId, student_id: studentId, company_id: companyId, plan_id: planId, status: "active",
    start_date: "2026-11-09", end_date: "2026-12-20", training_start_date: "2026-11-09", created_at: fixtureTime };
  const cycle = { id: cycleId, enrollment_id: enrollmentId, student_id: studentId, company_id: companyId,
    start_date: enrollment.start_date, end_date: enrollment.end_date, status: "active",
    cycle_number: 1, duration_weeks: 6, delivery_status: "viewed" };
  const workout = { id: workoutId, company_id: companyId, cycle_id: cycleId, title: "Treino A · Linho",
    name: "A", sort_order: 0, day_of_week: 1, exercises: [{
      exercise_id: exerciseId, exercise_name: "Agachamento de teste", muscle_group: "Quadríceps", sets: "2", reps: "10",
      rest: "30s", weekly_ui_version: "individual-weeks-v2",
      weekly_prescription: [
        { week: 1, block: "base", sets: 2, reps: "10", rest_seconds: 30, tempo: "2020", rir: "3" },
        { week: 2, block: "base", sets: 4, reps: "8", rest_seconds: 45, tempo: "2020", rir: "3" },
      ],
    }],
  };
  const nutrition = { id: planId, student_id: studentId, company_id: companyId, status: "active", created_at: fixtureTime,
    start_date: enrollment.start_date, end_date: enrollment.end_date, plan_name: "Plano alimentar Linho",
    target_water_ml: 2000, meals: [{ meal: "Café da manhã", eat: ["Iogurte com banana"] }] };
  const hasPlan = scenario !== "no-plan";

  async function install(context: BrowserContext, appOrigin: string) {
    expect(new URL(appOrigin).hostname).toBe("127.0.0.1");
    await context.addInitScript((themeKey) => {
      if (!localStorage.getItem(themeKey)) localStorage.setItem(themeKey, "light");
    }, `sett-personal-theme-mode:user:${userId}`);
    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      if (url.host === new URL(appOrigin).host) {
        socket.connectToServer();
        return;
      }
      if (url.hostname !== new URL(backendOrigin).hostname) {
        state.unexpectedRequests.push(`WS ${url.hostname}${url.pathname}`);
        return socket.close();
      }
      socket.onMessage((message) => {
        if (typeof message !== "string") return;
        const { topic, ref, event } = JSON.parse(message);
        if (event === "phx_join" || event === "heartbeat") {
          socket.send(JSON.stringify({ topic, ref, event: "phx_reply", payload: { status: "ok", response: {} } }));
        }
      });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      if (url.origin === appOrigin && !/^\/(rest|auth|functions|storage)\/v1\//.test(url.pathname)) return route.continue();
      if (url.hostname === "fonts.googleapis.com" && method === "GET") return route.fulfill({ body: "", contentType: "text/css" });
      const deny = () => {
        state.unexpectedRequests.push(`${method} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
      };
      if (url.origin !== backendOrigin) return deny();
      const headers = {
        "Access-Control-Allow-Origin": appOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "authorization, apikey, content-type, prefer, x-client-info",
        "Access-Control-Expose-Headers": "Content-Range",
      };
      const json = (value: unknown, status = 200) => route.fulfill({ status, json: value, headers: {
        ...headers,
        ...(Array.isArray(value) && request.headers().prefer?.includes("count=exact")
          ? { "Content-Range": value.length ? `0-${value.length - 1}/${value.length}` : "*/0" } : {}),
      } });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.pathname === "/auth/v1/user" && method === "GET") return json(user);
      if (url.pathname === "/auth/v1/token" && method === "POST") {
        const body = request.postDataJSON() as Row;
        if (url.searchParams.get("grant_type") !== "password" || body.email !== fixtureLogin.email
          || body.password !== fixtureLogin.password) return deny();
        return json(auth);
      }
      const object = request.headers().accept?.includes("vnd.pgrst.object+json");
      const get = (rows: Row[]) => json(object ? rows[0] ?? null : rows);
      const path = url.pathname;
      if (path === "/rest/v1/platform_settings" && method === "GET") {
        return get([{ company_id: companyId, platform_title: "BN Performance Training", layout_style: "classico" }]);
      }
      if (request.headers().authorization !== `Bearer ${token}`) return deny();
      if (path.startsWith("/rest/v1/rpc/") && method === "POST") {
        const rpc = path.split("/").at(-1);
        const body = request.postDataJSON() as Row | null;
        if (rpc === "get_user_role") return json("student");
        if (rpc === "get_company_workout_expiry_policy") return json({ company_id: companyId, version: 1, expired_workout_behavior: "keep_until_replaced" });
        if (rpc === "start_workout_session") {
          if (scenario !== "published" || !body || body._student_id !== studentId || body._company_id !== companyId
            || body._workout_id !== workoutId || typeof body._request_id !== "string") return deny();
          state.starts.push(body);
          state.session ??= { id: sessionId, student_id: studentId, company_id: companyId, workout_id: workoutId,
            started_at: fixtureTime, session_date: "2026-11-09", status: "in_progress" };
          return json(state.session);
        }
        if (rpc === "save_workout_logs_if_current") {
          if (!Array.isArray(body?._rows) || body._rows.some(row => row.student_id !== studentId || row.workout_id !== workoutId)) return deny();
          const saved = body._rows.map((row: Row) => {
            const key = `${row.exercise_index}:${row.set_number}`;
            const previous = state.logs.get(key);
            const savedRow = { ...row, id: previous?.id ?? crypto.randomUUID(), revision: Number(previous?.revision ?? 0) + 1 };
            state.logs.set(key, savedRow);
            return savedRow;
          });
          return json({ saved, conflicts: [] });
        }
        if (rpc === "get_active_platform_ads") return json([]);
        return json(null);
      }
      if (path === "/functions/v1/student-workout-feedback" && method === "POST") {
        const body = request.postDataJSON() as Row;
        if (state.session?.status !== "completed" || body.student_id !== studentId || body.workout_session_id !== sessionId) return deny();
        state.feedback = { id: feedbackId, workout_session_id: sessionId, notes: body.reflection, trainer_reply: null };
        return json({ ok: true, persisted: true, delivered: false, feedback_id: feedbackId });
      }
      if (path === "/functions/v1/ai-student-bnito" && method === "POST") return json({});
      if (path === "/rest/v1/workout_sessions" && method === "PATCH") {
        const body = request.postDataJSON() as Row;
        if (state.session?.status !== "in_progress" || body.status !== "completed"
          || url.searchParams.get("id") !== `eq.${sessionId}` || url.searchParams.get("student_id") !== `eq.${studentId}`
          || url.searchParams.get("company_id") !== `eq.${companyId}` || url.searchParams.get("status") !== "eq.in_progress"
          || ![...state.logs.values()].some(log => log.completed === true)) return deny();
        state.completions.push(body);
        state.session = { ...state.session, ...body };
        return json({ id: sessionId });
      }
      if (method !== "GET" || !path.startsWith("/rest/v1/")) return deny();
      const table = path.split("/").at(-1);
      if (table === "students") return get([student]);
      if (table === "company_members") return get([{ company_id: companyId, companies: { tier: "advanced" } }]);
      if (table === "enrollments") return get(hasPlan ? [enrollment] : []);
      if (table === "training_cycles") return get(hasPlan ? [cycle] : []);
      if (table === "plans") return get([{ id: planId, name: "Plano de teste", duration_days: 42, duration_weeks: 6, cycle_duration_days: 42 }]);
      if (table === "workouts") return get(hasPlan ? [workout] : []);
      if (table === "nutrition_plans") return get(hasPlan ? [nutrition] : []);
      if (table === "workout_logs") return get([...state.logs.values()]);
      if (table === "workout_sessions") {
        const filter = url.searchParams.get("status");
        return get(state.session && (!filter || filter === `eq.${state.session.status}`) ? [state.session] : []);
      }
      if (table === "workout_feedback") return get(state.feedback ? [state.feedback] : []);
      return get([]);
    });
  }

  return { install, state };
}
