import { expect, type BrowserContext } from "@playwright/test";

export const backendOrigin = "https://sett-qa-fixture.supabase.co";
export const fixtureLogin = { email: "lia@example.test", password: "local-fixture-only" };
export const fixtureTime = "2026-11-09T15:00:00Z";
export const studentId = "00000000-0000-4000-8000-000000000101";
export const workoutId = "00000000-0000-4000-8000-000000000102";
export const workoutBId = "00000000-0000-4000-8000-000000000111";
export const sessionId = "00000000-0000-4000-8000-000000000103";
export const historyDate = "2026-11-06";
export const historyWorkoutTitle = "Treino B · Ciclo anterior";
export const historyExerciseName = "Remada do ciclo anterior";
export const priorSessionDate = "2026-11-08";
export const companyId = "00000000-0000-4000-8000-000000000104";
export const userId = "00000000-0000-4000-8000-000000000105";
export const enrollmentId = "00000000-0000-4000-8000-000000000106";
export const cycleId = "00000000-0000-4000-8000-000000000107";
const planId = "00000000-0000-4000-8000-000000000108";
const exerciseId = "00000000-0000-4000-8000-000000000109";
const feedbackId = "00000000-0000-4000-8000-000000000110";
export const historyCycleId = "00000000-0000-4000-8000-000000000112";
export const historyWorkoutId = "00000000-0000-4000-8000-000000000113";
const historySessionId = "00000000-0000-4000-8000-000000000114";
const foreignStudentId = "00000000-0000-4000-8000-000000000115";
const foreignCompanyId = "00000000-0000-4000-8000-000000000116";
const foreignCycleId = "00000000-0000-4000-8000-000000000117";
const foreignWorkoutId = "00000000-0000-4000-8000-000000000118";
export const priorEnrollmentId = "00000000-0000-4000-8000-000000000119";

type Row = Record<string, unknown>;
export type PortalScenario = "published" | "no-plan" | "inactive";

export function createLinenPortalFixture(
  scenario: PortalScenario,
  options: { twoWorkouts?: boolean; nutritionOutage?: boolean; history?: "current" | "renewal"; priorDayActive?: boolean } = {},
) {
  const state = {
    session: null as Row | null,
    logs: new Map<string, Row>(),
    feedback: null as Row | null,
    starts: [] as Row[],
    completions: [] as Row[],
    unexpectedRequests: [] as string[],
    nutritionOutage: Boolean(options.nutritionOutage),
    nutritionReads: 0,
    enrollmentReads: 0,
    activeSessionReads: [] as { context: string; id: unknown; scoped: boolean }[],
    sessionLogReads: [] as { context: string; student: string | null; workout: string | null; date: string | null }[],
    sessionLogBarrier: null as Promise<void> | null,
    prescriptionReads: [] as { table: string; query: Record<string, string> }[],
  };
  const user = { id: userId, email: fixtureLogin.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const encoded = (value: Row) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({ alg: "none", typ: "JWT" })}.${encoded({ aud: "authenticated", exp: 4102444800, sub: userId })}.fixture`;
  const auth = { access_token: token, refresh_token: "linen-test-refresh", expires_at: 4102444800,
    expires_in: 4102444800 - Date.parse(fixtureTime) / 1000, token_type: "bearer", user };
  const student = { id: studentId, user_id: userId, full_name: "Lia Fixture", company_id: companyId,
    status: scenario === "inactive" ? "inactive" : "active", weekly_workout_goal: 3 };
  const contractStart = options.history === "current" ? "2026-09-28" : options.priorDayActive ? priorSessionDate : "2026-11-09";
  const enrollment = { id: enrollmentId, student_id: studentId, company_id: companyId, plan_id: planId, status: "active",
    start_date: contractStart, training_start_date: contractStart,
    end_date: options.priorDayActive ? "2026-12-19" : "2026-12-20", created_at: fixtureTime };
  const cycle = { id: cycleId, enrollment_id: enrollmentId, student_id: studentId, company_id: companyId,
    start_date: options.priorDayActive ? priorSessionDate : "2026-11-09", end_date: enrollment.end_date, status: "active",
    cycle_number: options.history === "current" ? 2 : 1, duration_weeks: 6, delivery_status: "viewed" };
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
  const priorEnrollment = { ...enrollment, id: priorEnrollmentId, status: "completed",
    start_date: "2026-09-28", training_start_date: "2026-09-28", end_date: "2026-11-08",
    created_at: "2026-09-28T15:00:00Z" };
  const previousCycle = { ...cycle, id: historyCycleId, cycle_number: 1, status: "completed",
    enrollment_id: options.history === "renewal" ? priorEnrollment.id : enrollment.id,
    start_date: priorEnrollment.start_date, end_date: priorEnrollment.end_date };
  const previousWorkout = { ...workout, id: historyWorkoutId, cycle_id: historyCycleId,
    title: historyWorkoutTitle, name: "B", day_of_week: 5,
    exercises: [{ exercise_name: historyExerciseName, muscle_group: "Costas", sets: "3", reps: "12", rest: "60s" }] };
  const previousSession = { id: historySessionId, workout_id: historyWorkoutId, student_id: studentId, company_id: companyId,
    session_date: historyDate, started_at: `${historyDate}T14:00:00Z`, completed_at: `${historyDate}T14:40:00Z`,
    status: "completed", total_sets_completed: 3, total_sets_prescribed: 3, total_volume: 900, duration_seconds: 2400 };
  const cycleRows = [cycle, ...(options.history ? [previousCycle] : []),
    { ...previousCycle, id: foreignCycleId, student_id: foreignStudentId, company_id: foreignCompanyId }];
  const workoutRows = [workout,
    ...(options.twoWorkouts ? [{ ...workout, id: workoutBId, name: "B", title: "Treino B · Linho", sort_order: 1, day_of_week: 2 }] : []),
    ...(options.history ? [previousWorkout] : []),
    { ...previousWorkout, id: foreignWorkoutId, cycle_id: foreignCycleId, company_id: foreignCompanyId, title: "Treino de outro tenant" }];
  const nutrition = { id: planId, student_id: studentId, company_id: companyId, status: "active", created_at: fixtureTime,
    start_date: enrollment.start_date, end_date: enrollment.end_date, plan_name: "Plano alimentar Linho",
    target_water_ml: 2000, meals: [{ meal: "Café da manhã", eat: ["Iogurte com banana"] }] };
  const hasPlan = scenario !== "no-plan";
  const logKey = (row: Row) => `${row.workout_id}:${row.session_date}:${row.exercise_index}:${row.set_number}`;
  const seedSet = (date: string, weight: number, id = workoutId) => {
    const row = { id: crypto.randomUUID(), student_id: studentId, workout_id: id,
      exercise_index: 0, set_number: 1, weight, reps_done: 10, completed: true, session_date: date, revision: 1 };
    state.logs.set(logKey(row), row);
  };
  if (options.priorDayActive) {
    state.session = { id: sessionId, student_id: studentId, company_id: companyId, workout_id: workoutId,
      started_at: `${priorSessionDate}T15:00:00Z`, completed_at: null, session_date: priorSessionDate, status: "in_progress" };
    seedSet(priorSessionDate, 24);
    seedSet(fixtureTime.slice(0, 10), 99);
  }

  async function install(context: BrowserContext, appOrigin: string, label = "primary") {
    expect(new URL(appOrigin).hostname).toBe("127.0.0.1");
    await context.addInitScript((themeKey) => {
      if (!localStorage.getItem(themeKey)) localStorage.setItem(themeKey, "light");
    }, `sett-personal-theme-mode:user:${userId}`);
    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
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
      if (url.origin === appOrigin && ["GET", "HEAD"].includes(method)
        && !/^\/(rest|auth|functions|storage)\/v1\//.test(url.pathname)
        && !url.pathname.startsWith("/.netlify/")) return route.continue();
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
      const get = (rows: Row[], columns?: readonly string[]) => {
        // Apply the scalar filters used by portal queries after the fixture's RLS predicate.
        const filtered = rows.filter(row => [...url.searchParams].every(([column, filter]) => {
          const value = row[column];
          if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
          if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").includes(String(value));
          if (filter === "is.null") return value == null;
          if (filter === "not.is.null") return value != null;
          if (filter.startsWith("lte.")) return value != null && String(value) <= filter.slice(4);
          if (filter.startsWith("gte.")) return value != null && String(value) >= filter.slice(4);
          return true;
        })).slice(0, Number(url.searchParams.get("limit") ?? rows.length));
        const projected = columns ? filtered.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))) : filtered;
        return json(object ? projected[0] ?? null : projected);
      };
      const owned = (row: Row) => row.student_id === studentId && row.company_id === companyId;
      const started = (row: Row) => row.start_date == null || String(row.start_date) <= fixtureTime.slice(0, 10);
      const path = url.pathname;
      if (path === "/rest/v1/platform_settings" && method === "GET") {
        return get([{ company_id: companyId, platform_title: "BN Performance Training", layout_style: "classico" }]);
      }
      if (request.headers().authorization !== `Bearer ${token}`) return deny();
      if (path.startsWith("/rest/v1/rpc/") && method === "POST") {
        const rpc = path.split("/").at(-1);
        const body = request.postDataJSON() as Row | null;
        if (rpc === "get_user_role") return body?._user_id === userId ? json("student") : deny();
        if (rpc === "get_company_workout_expiry_policy") {
          return body?._company_id === companyId
            ? json({ company_id: companyId, version: 1, expired_workout_behavior: "keep_until_replaced" }) : deny();
        }
        if (rpc === "record_app_performance_sample") {
          return body?.p_company_id === companyId || body?.p_company_id === null ? json(null) : deny();
        }
        if (rpc === "get_company_ai_identity" || rpc === "get_company_form_definition") {
          return body?._company_id === companyId ? json(null) : deny();
        }
        if (rpc === "get_student_experience_policy") {
          const targetStudent = body?._student_id;
          const targetCompany = body?._company_id;
          const authorized = (targetStudent === studentId && (targetCompany == null || targetCompany === companyId))
            || (targetStudent == null && targetCompany === companyId);
          return authorized ? json({ gamification_enabled: false }) : deny();
        }
        if (rpc === "get_monthly_leaderboard") return body?._company_id === companyId ? json([]) : deny();
        if (rpc === "award_company_xp") {
          return body?._student_id === studentId && body?._event_type === "workout"
            && body?._source_id === sessionId && state.session?.status === "completed" ? json(null) : deny();
        }
        if (rpc === "check_and_unlock_achievements") {
          return body?._student_id === studentId && state.session?.status === "completed" ? json([]) : deny();
        }
        if (rpc === "start_workout_session") {
          if (scenario !== "published" || !body || body._student_id !== studentId || body._company_id !== companyId
            || ![workoutId, ...(options.twoWorkouts ? [workoutBId] : [])].includes(String(body._workout_id))
            || typeof body._request_id !== "string") return deny();
          state.starts.push(body);
          if (state.session?.status === "in_progress" && state.session.workout_id !== body._workout_id) {
            return json({ code: "PT409", message: "session_already_in_progress" }, 409);
          }
          state.session ??= { id: sessionId, student_id: studentId, company_id: companyId, workout_id: body._workout_id,
            started_at: fixtureTime, completed_at: null, session_date: "2026-11-09", status: "in_progress" };
          return json(state.session);
        }
        if (rpc === "save_workout_logs_if_current") {
          if (!Array.isArray(body?._rows) || body._rows.some(row => row.student_id !== studentId || row.workout_id !== workoutId)) return deny();
          const saved = body._rows.map((row: Row) => {
            const key = logKey(row);
            const previous = state.logs.get(key);
            const savedRow = { ...row, id: previous?.id ?? crypto.randomUUID(), revision: Number(previous?.revision ?? 0) + 1 };
            state.logs.set(key, savedRow);
            return savedRow;
          });
          return json({ saved, conflicts: [] });
        }
        if (rpc === "get_active_platform_ads") return json([]);
        return deny();
      }
      if (path === "/functions/v1/student-workout-feedback" && method === "POST") {
        const body = request.postDataJSON() as Row;
        if (state.session?.status !== "completed" || body.student_id !== studentId || body.workout_session_id !== sessionId) return deny();
        state.feedback = { id: feedbackId, student_id: studentId, company_id: companyId,
          workout_session_id: sessionId, notes: body.reflection, trainer_reply: null };
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
      if (table && ["students", "enrollments", "training_cycles", "workouts"].includes(table)) {
        state.prescriptionReads.push({ table, query: Object.fromEntries(url.searchParams) });
      }
      if (table === "students") return get([student]);
      if (table === "company_members") return get([{ company_id: companyId, companies: { tier: "advanced" } }]);
      if (table === "enrollments") {
        state.enrollmentReads++;
        return get(hasPlan ? [enrollment, ...(options.history === "renewal" ? [priorEnrollment] : [])].filter(owned) : []);
      }
      if (table === "training_cycles") return get(hasPlan ? cycleRows.filter(row => owned(row) && started(row)) : []);
      if (table === "plans") return get([{ id: planId, company_id: companyId, name: "Plano de teste",
        duration_days: options.history === "current" ? 84 : 42, duration_weeks: options.history === "current" ? 12 : 6, cycle_duration_days: 42 }]);
      if (table === "workouts") {
        const visibleCycles = new Set(cycleRows.filter(row => owned(row) && started(row)).map(row => row.id));
        const visibleWorkouts = hasPlan ? workoutRows.filter(row => visibleCycles.has(row.cycle_id) && row.company_id === companyId) : [];
        return get(visibleWorkouts, url.searchParams.get("select") === "id,cycle_id" ? ["id", "cycle_id"] : undefined);
      }
      if (table === "nutrition_plans") {
        state.nutritionReads++;
        return state.nutritionOutage
          ? json({ code: "53300", message: "Synthetic Nutri outage" }, 503)
          : get(hasPlan ? [nutrition].filter(row => owned(row) && started(row)) : []);
      }
      if (table === "workout_logs") {
        if (url.searchParams.has("workout_id") || url.searchParams.get("session_date")?.startsWith("eq.")) {
          state.sessionLogReads.push({ context: label, student: url.searchParams.get("student_id"),
            workout: url.searchParams.get("workout_id"), date: url.searchParams.get("session_date") });
          await state.sessionLogBarrier;
        }
        return get([...state.logs.values()].filter(row => row.student_id === studentId));
      }
      if (table === "workout_sessions") {
        if (url.searchParams.get("status") === "eq.in_progress") {
          state.activeSessionReads.push({ context: label, id: state.session?.id,
            scoped: url.searchParams.get("student_id") === `eq.${studentId}`
              && url.searchParams.get("company_id") === `eq.${companyId}` });
        }
        return get([...(state.session ? [state.session] : []), ...(options.history ? [previousSession] : []),
          { ...previousSession, id: foreignWorkoutId, workout_id: foreignWorkoutId, student_id: foreignStudentId,
            company_id: foreignCompanyId, status: "in_progress", completed_at: null }].filter(owned));
      }
      if (table === "workout_feedback") return get(state.feedback && owned(state.feedback) ? [state.feedback] : []);
      return get([]);
    });
  }

  return { install, state, seedSet };
}
