import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { collectPages, requestJson, WearableHttpError } from "./http.ts";
import { isFreshScoredMetric, sanitizeWearablesForPrompt } from "./context.ts";
import {
  authorizeUrl,
  missingScopes,
  polarExternalUserId,
  providerRevocationRequest,
  REQUIRED_SCOPES,
  resolveGrantedScopes,
} from "./oauth.ts";
import { syncStrava } from "./providers.ts";
import {
  dedupeMetrics,
  localDate,
  normalizeWhoopRecord,
  normalizeWhoopWorkout,
  timezoneOffsetMinutes,
  whoopSleepDurationHours,
} from "./normalize.ts";

const device = {
  id: "device",
  student_id: "student",
  company_id: "company",
  provider: "whoop" as const,
};

Deno.test("OAuth URLs preserve state and request only declared scopes", () => {
  const url = new URL(
    authorizeUrl(
      "whoop",
      "client",
      "state-opaque",
      "https://example.test/callback",
    ),
  );
  assertEquals(url.searchParams.get("state"), "state-opaque");
  assertEquals(
    url.searchParams.get("scope")?.split(" "),
    REQUIRED_SCOPES.whoop,
  );
  assertEquals(missingScopes("whoop", ["read:recovery", "offline"]), [
    "read:cycles",
    "read:workout",
    "read:sleep",
  ]);
});

Deno.test("Strava callback and Polar documented response preserve granted scopes", () => {
  assertEquals(resolveGrantedScopes("strava", [], "read,activity:read_all"), [
    "read",
    "activity:read_all",
  ]);
  assertEquals(resolveGrantedScopes("polar", [], null), [
    "accesslink.read_all",
  ]);
  assertEquals(resolveGrantedScopes("oura", [], null), []);
});

Deno.test("Polar persists its external user id and revokes the registered user path", () => {
  assertEquals(polarExternalUserId({ "polar-user-id": 2278512 }), "2278512");
  assertEquals(polarExternalUserId({ x_user_id: 10579 }), "10579");
  const request = providerRevocationRequest(
    "polar",
    "sensitive-token",
    "client-id",
    "client-secret",
    "2278512",
  );
  assertEquals(
    request.url,
    "https://www.polaraccesslink.com/v3/users/2278512",
  );
  assertEquals(request.init.method, "DELETE");
  assertEquals(
    (request.init.headers as Record<string, string>).Authorization,
    "Bearer sensitive-token",
  );
});

Deno.test("Strava revocation uses the documented Basic-auth form contract", () => {
  const request = providerRevocationRequest(
    "strava",
    "sensitive-token",
    "client-id",
    "client-secret",
  );
  const headers = request.init.headers as Record<string, string>;
  assertEquals(request.url, "https://www.strava.com/oauth/revoke");
  assertEquals(request.init.method, "POST");
  assertEquals(
    headers.Authorization,
    `Basic ${btoa("client-id:client-secret")}`,
  );
  assertEquals(headers["Content-Type"], "application/x-www-form-urlencoded");
  assertEquals(
    new URLSearchParams(String(request.init.body)).get("token"),
    "sensitive-token",
  );
});

Deno.test("pagination follows provider next tokens without duplicating pages", async () => {
  const urls: string[] = [];
  let heartbeats = 0;
  const records = await collectPages<{ id: number }>(
    "https://example.test/items?limit=25",
    "nextToken",
    async (url) => {
      urls.push(url);
      return urls.length === 1
        ? { records: [{ id: 1 }], next_token: "page-2" }
        : { records: [{ id: 2 }], next_token: null };
    },
    40,
    async () => {
      heartbeats += 1;
    },
  );
  assertEquals(records, [{ id: 1 }, { id: 2 }]);
  assertEquals(new URL(urls[1]).searchParams.get("nextToken"), "page-2");
  assertEquals(heartbeats, 2);
});

Deno.test("WHOOP unscored/null values remain null and strain keeps 0..21 unit", () => {
  const pending = normalizeWhoopRecord(device, "cycle", {
    id: 1,
    start: "2026-08-14T01:00:00Z",
    timezone_offset: "-03:00",
    score_state: "PENDING_SCORE",
  });
  assertEquals(pending[0].value, null);
  assertEquals(pending[0].unit, "whoop_0_21");
  assertEquals(pending[0].date, "2026-08-13");
});

Deno.test("WHOOP workouts use provider local date and stable external id", () => {
  const workout = normalizeWhoopWorkout(device, {
    id: "workout-1",
    start: "2026-08-14T01:00:00Z",
    end: "2026-08-14T02:00:00Z",
    timezone_offset: "-03:00",
    score_state: "SCORED",
    sport_name: "running",
    score: { strain: 12.4, distance_meter: 5000 },
  });
  assertEquals(workout?.local_date, "2026-08-13");
  assertEquals(workout?.external_id, "workout-1");
  assertEquals(workout?.distance_km, 5);
  assertEquals(timezoneOffsetMinutes("-03:30"), -210);
  assertEquals(localDate("2026-01-01T01:00:00Z", "-03:00"), "2025-12-31");
});

Deno.test("WHOOP recovery inherits cycle local time instead of UTC creation date", () => {
  const recovery = normalizeWhoopRecord(device, "recovery", {
    cycle_id: 10,
    created_at: "2026-03-09T06:00:00Z",
    score_state: "SCORED",
    score: { recovery_score: 55 },
  }, { start: "2026-03-09T02:30:00Z", timezone_offset: "-04:00" });
  assertEquals(recovery[0].date, "2026-03-08");
  assertEquals(recovery[0].timezone_offset_minutes, -240);
});

Deno.test("WHOOP sleep duration sums sleep stages and excludes awake/no-data in-bed time", () => {
  assertEquals(
    whoopSleepDurationHours({
      total_in_bed_time_milli: 9 * 3_600_000,
      total_awake_time_milli: 60 * 60_000,
      total_no_data_time_milli: 30 * 60_000,
      total_light_sleep_time_milli: 4 * 3_600_000,
      total_slow_wave_sleep_time_milli: 90 * 60_000,
      total_rem_sleep_time_milli: 2 * 3_600_000,
    }),
    7.5,
  );
  assertEquals(
    whoopSleepDurationHours({ total_in_bed_time_milli: 1000 }),
    null,
  );
});

Deno.test("Strava sync paginates with after cursor and heartbeats every page", async () => {
  const urls: string[] = [];
  let heartbeats = 0;
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    start_date: "2026-08-14T10:00:00Z",
    start_date_local: "2026-08-14T07:00:00",
    moving_time: 600,
    distance: 1000,
    type: "Run",
  }));
  const result = await syncStrava(
    { ...device, provider: "strava" },
    "token",
    "2026-08-13T12:00:00Z",
    async () => {
      heartbeats += 1;
    },
    async (url) => {
      urls.push(url);
      return urls.length === 1 ? firstPage : [{
        id: 101,
        start_date: "2026-08-14T11:00:00Z",
        moving_time: 300,
        distance: 500,
        type: "Run",
      }];
    },
  );
  assertEquals(result.workouts.length, 101);
  assertEquals(heartbeats, 2);
  assertEquals(new URL(urls[0]).searchParams.get("after"), "1786536000");
  assertEquals(new URL(urls[1]).searchParams.get("page"), "2");
});

Deno.test("daily metric dedupe prefers scored main sleep over nap and pending records", () => {
  const base = {
    student_id: "student",
    company_id: "company",
    device_id: "device",
    date: "2026-08-14",
    recorded_at: "2026-08-14T10:00:00Z",
    timezone_offset_minutes: -180,
    metric: "sleep_duration",
    unit: "hours",
    source: "whoop" as const,
    external_id: "x",
  };
  const rows = dedupeMetrics([
    {
      ...base,
      value: null,
      score_state: "PENDING_SCORE",
      metadata: { nap: false },
    },
    { ...base, value: 1, score_state: "SCORED", metadata: { nap: true } },
    { ...base, value: 7.5, score_state: "SCORED", metadata: { nap: false } },
  ]);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].value, 7.5);
});

Deno.test("HTTP retries 429 and 5xx but fails closed on 401", async () => {
  let attempts = 0;
  const fetchImpl = (() => {
    attempts += 1;
    return Promise.resolve(
      attempts === 1
        ? new Response("", { status: 429, headers: { "retry-after": "0" } })
        : attempts === 2
        ? new Response("", { status: 503 })
        : Response.json({ ok: true }),
    );
  }) as typeof fetch;
  assertEquals(
    await requestJson("https://example.test", {}, {
      fetchImpl,
      sleep: async () => {},
      attempts: 3,
    }),
    { ok: true },
  );
  assertEquals(attempts, 3);

  await assertRejects(
    () =>
      requestJson("https://example.test", {}, {
        fetchImpl: (() =>
          Promise.resolve(new Response("", { status: 401 }))) as typeof fetch,
        sleep: async () => {},
      }),
    WearableHttpError,
    "provider_unauthorized",
  );
});

Deno.test("BNITO accepts only recent scored non-null wearable signals", () => {
  const now = new Date("2026-08-14T12:00:00Z");
  assertEquals(
    isFreshScoredMetric({
      date: "2026-08-14",
      value: 44,
      score_state: "SCORED",
    }, now),
    true,
  );
  assertEquals(
    isFreshScoredMetric({
      date: "2026-08-14",
      value: null,
      score_state: "SCORED",
    }, now),
    false,
  );
  assertEquals(
    isFreshScoredMetric({
      date: "2026-08-14",
      value: 0,
      score_state: "PENDING_SCORE",
    }, now),
    false,
  );
  assertEquals(
    isFreshScoredMetric({
      date: "2026-08-10",
      value: 20,
      score_state: "SCORED",
    }, now),
    false,
  );
});

Deno.test("BNITO Anthropic prompt context excludes stale, null and unscored metrics before serialization", () => {
  const sanitized = sanitizeWearablesForPrompt({
    student: { id: "student" },
    wearable_metrics: [
      {
        recorded_at: "2026-08-14T11:00:00Z",
        value: 61,
        score_state: "SCORED",
        marker: "fresh",
      },
      {
        recorded_at: "2026-08-10T11:00:00Z",
        value: 45,
        score_state: "SCORED",
        marker: "stale",
      },
      {
        recorded_at: "2026-08-14T11:00:00Z",
        value: null,
        score_state: "SCORED",
        marker: "null",
      },
      {
        recorded_at: "2026-08-14T11:00:00Z",
        value: 0,
        score_state: "PENDING_SCORE",
        marker: "pending",
      },
    ],
  }, new Date("2026-08-14T12:00:00Z"));
  const anthropicPromptContext = JSON.stringify(sanitized);
  assertEquals(sanitized.wearable_metrics?.length, 1);
  assertEquals(anthropicPromptContext.includes("fresh"), true);
  assertEquals(anthropicPromptContext.includes("stale"), false);
  assertEquals(anthropicPromptContext.includes("pending"), false);
  assertEquals(anthropicPromptContext.includes('"marker":"null"'), false);
});
