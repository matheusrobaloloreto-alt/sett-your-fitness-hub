import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { supabase } from "@/integrations/supabase/client";
import { ensureWorkoutLibraryReferences } from "./workoutLibraryRecovery";
import { INDIVIDUAL_WEEKLY_UI_VERSION, LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION } from "./weeklyStrengthPeriodization";

const company = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const actor = "11111111-1111-1111-1111-111111111111";
const id = "22222222-2222-2222-2222-222222222222";
const hiddenId = "33333333-3333-3333-3333-333333333333";
const catalog = [{ id, name: "Agachamento", company_id: company, is_global: false }];
const source = [{ id: "workout-runtime", updated_at: "revision", title: "A", custom: { keep: true }, exercises: [{
  exercise_id: hiddenId, exercise_name: "Agachamento", muscle_group: "Quadríceps", sets: 3, reps: "8-10", rest: "90s",
  method: "dropset", tempo: "2020", notes: "Nota privada", cues: "Instrução privada", mfit_protocol: { keep: true },
  group_id: "group", video_url: "https://media.test/demo", unknown: { keep: true },
}] }];

function harness(initial: unknown[] = [], refreshed: unknown[] = catalog) {
  const query = { select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValueOnce({ data: initial }).mockResolvedValue({ data: refreshed }) };
  query.select.mockReturnValue(query); query.or.mockReturnValue(query); query.order.mockReturnValue(query);
  const ack = { ok: true, actor_id: actor, company_id: company, created_count: 1, mappings: [{ input_index: 0, exercise_id: id }] };
  const client = { from: vi.fn().mockReturnValue(query), rpc: vi.fn().mockResolvedValue({ data: ack, error: null }),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: actor } } }, error: null }) } };
  return { client, query, ack };
}
const run = (client: ReturnType<typeof harness>["client"], overrides = {}) => ensureWorkoutLibraryReferences(client, { workouts: source, companyId: company, expectedUserId: actor, ...overrides });

describe("workout library recovery", () => {
  it("accepts the existing generated Supabase client without a cast", () => {
    expectTypeOf<typeof supabase>().toExtend<Parameters<typeof ensureWorkoutLibraryReferences>[0]>();
  });

  it("refreshes catalog and reuses visible canonical matches without writing", async () => {
    const { client, query } = harness(catalog);
    const result = await run(client);
    expect(result.workouts[0].exercises[0]).toEqual({ ...source[0].exercises[0], exercise_id: id, video_path: null, thumbnail_url: null, youtube_video_id: null });
    expect(result.issues).toEqual([]);
    expect(result.createdCount).toBe(0);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(query.or).toHaveBeenCalledWith(`company_id.eq.${company},is_global.eq.true`);
  });

  it("creates only generic company metadata, confirms ACK then refreshes before returning", async () => {
    const original = structuredClone(source);
    const { client, query } = harness();
    const result = await run(client);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("ensure_workout_library_references", { p_company_id: company,
      p_exercises: [{ name: "Agachamento", muscle_group: "Quadríceps" }] });
    expect(query.range).toHaveBeenCalledTimes(2);
    expect(result.workouts[0]).toEqual({ ...source[0], exercises: [{ ...source[0].exercises[0], exercise_id: id }] });
    expect(result.resolvedDraft.workouts).toEqual(result.workouts);
    expect(result.createdCount).toBe(1);
    expect(result.repairs).toEqual([expect.objectContaining({ code: "legacy_exercise_relinked", fromExerciseId: hiddenId, toExerciseId: id })]);
    expect(source).toEqual(original);
    result.workouts[0].exercises[0].mfit_protocol.keep = false;
    expect(source).toEqual(original);
  });

  it("retains exact-match repairs together with new registration repairs for draft recovery", async () => {
    const secondId = "44444444-4444-4444-4444-444444444444";
    const newRow = { ...catalog[0], id: secondId, name: "Remada" };
    const { client, ack } = harness(catalog, [...catalog, newRow]);
    ack.mappings[0].exercise_id = secondId;
    const workouts = [{ ...source[0], exercises: [...source[0].exercises, { ...source[0].exercises[0], exercise_name: "Remada", exercise_id: "" }] }];
    const result = await run(client, { workouts });
    expect(result.repairs).toEqual([
      expect.objectContaining({ exerciseIndex: 0, fromExerciseId: hiddenId, toExerciseId: id }),
      expect.objectContaining({ exerciseIndex: 1, fromExerciseId: null, toExerciseId: secondId }),
    ]);
    expect(result.resolvedDraft.repairs).toEqual(result.repairs);
  });

  it.each([LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION, INDIVIDUAL_WEEKLY_UI_VERSION])("preserves weekly %s and every prescription field", async (version) => {
    const workouts = [{ ...source[0], exercises: [{ ...source[0].exercises[0], weekly_ui_version: version,
      set_types: ["warmup", "normal", "failure"], weekly_prescription: [{ week: 7, tempo: "3030", rest_seconds: 45, custom: { keep: true }, set_types: ["failure"] }] }] }];
    const result = await run(harness().client, { workouts });
    expect(result.workouts[0].exercises[0]).toEqual({ ...workouts[0].exercises[0], exercise_id: id });
  });

  it("handles missing id/raw AI name and explicit category metadata without inferring taxonomy", async () => {
    const { client } = harness();
    const workouts = [{ title: "AI", exercises: [{ library_exercise_name: "Agachamento", equipment: "Halter", category: "base", categories: ["base"], notes: "Privado" }] }];
    const result = await run(client, { workouts });
    expect(client.rpc.mock.calls[0][1].p_exercises).toEqual([{ name: "Agachamento", equipment: "Halter", category: "base", categories: ["base"] }]);
    expect(result.workouts[0].exercises[0]).toMatchObject({ library_exercise_name: "Agachamento", exercise_name: "Agachamento", exercise_id: id, notes: "Privado" });
  });

  it("never queries a foreign private reference and excludes foreign rows defensively", async () => {
    const foreign = [{ ...catalog[0], id: hiddenId, company_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }];
    const { client, query } = harness(foreign);
    const result = await run(client);
    expect(result.workouts[0].exercises[0].exercise_id).toBe(id);
    expect(query.or.mock.calls).toEqual([[`company_id.eq.${company},is_global.eq.true`], [`company_id.eq.${company},is_global.eq.true`]]);
    expect(client.rpc.mock.calls[0][1]).not.toHaveProperty("exercise_id");
  });

  it("blocks ambiguous visible names before RPC rather than guessing", async () => {
    const { client } = harness([{ ...catalog[0], muscle_group: "Quadríceps" }, { ...catalog[0], id: "44444444-4444-4444-4444-444444444444", muscle_group: "Quadríceps" }]);
    await expect(run(client)).rejects.toMatchObject({ code: "ambiguous" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("does not block an already visible id even when its name has ambiguous duplicates", async () => {
    const { client } = harness([catalog[0], { ...catalog[0], id: hiddenId }]);
    const workouts = [{ ...source[0], exercises: [{ ...source[0].exercises[0], exercise_id: id }] }];
    const result = await run(client, { workouts });
    expect(result.workouts).toEqual(workouts);
    expect(result.issues).toEqual([]);
    expect(result.repairs).toEqual([]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([null, {}, { ok: false }, { ok: true }, "invalid"])("rejects malformed ACK %j", async (data) => {
    const { client } = harness(); client.rpc.mockResolvedValue({ data, error: null });
    await expect(run(client)).rejects.toMatchObject({ code: "unconfirmed" });
  });

  it.each(["company", "actor", "mapping", "index", "count"])("rejects ACK mismatch %s", async (kind) => {
    const { client, ack } = harness();
    if (kind === "company") ack.company_id = hiddenId;
    if (kind === "actor") ack.actor_id = hiddenId;
    if (kind === "mapping") ack.mappings[0].exercise_id = "not-uuid";
    if (kind === "index") ack.mappings[0].input_index = 1;
    if (kind === "count") ack.created_count = 2;
    await expect(run(client)).rejects.toMatchObject({ code: "unconfirmed" });
  });

  it.each([{ rows: [] }, { rows: [{ ...catalog[0], company_id: hiddenId }] }, { rows: [{ ...catalog[0], name: "Outro exercício" }] }])("requires visible named catalog confirmation after ACK: %j", async ({ rows }) => {
    await expect(run(harness([], rows).client)).rejects.toMatchObject({ code: "unconfirmed" });
  });

  it.each(["23514", "42501", "network"])("does not consider registration/save successful on %s", async (kind) => {
    const { client } = harness();
    if (kind === "network") client.rpc.mockRejectedValue(new Error("provider internals"));
    else client.rpc.mockResolvedValue({ data: null, error: { code: kind, message: kind === "23514" ? "workout_library_recovery_ambiguous" : "private internals" } });
    await expect(run(client)).rejects.toMatchObject({ code: kind === "network" ? "transport" : kind === "42501" ? "forbidden" : "ambiguous" });
  });

  it("retries a lost response using refreshed catalog without another registration", async () => {
    const { client } = harness();
    client.rpc.mockRejectedValueOnce(new Error("lost response"));
    await expect(run(client)).rejects.toMatchObject({ code: "transport" });
    const result = await run(client);
    expect(result.workouts[0].exercises[0].exercise_id).toBe(id);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["initial", "catalog", "session", "rpc", "refresh"])("aborts stale scope at %s", async (stage) => {
    const { client, query, ack } = harness(); let current = stage !== "initial";
    if (stage === "catalog") query.range.mockReset().mockImplementationOnce(async () => { current = false; return { data: [] }; });
    if (stage === "session") client.auth.getSession.mockImplementationOnce(async () => ({ data: { session: { user: { id: actor } } }, error: null }))
      .mockImplementationOnce(async () => { current = false; return { data: { session: { user: { id: actor } } }, error: null }; });
    if (stage === "rpc") client.rpc.mockImplementationOnce(async () => { current = false; return { data: ack, error: null }; });
    if (stage === "refresh") query.range.mockReset().mockImplementationOnce(async () => ({ data: [] })).mockImplementationOnce(async () => { current = false; return { data: catalog }; });
    await expect(run(client, { isCurrent: () => current })).rejects.toMatchObject({ code: "stale" });
    if (["initial", "catalog", "session"].includes(stage)) expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects unexpected user before reads/writes and account change before RPC", async () => {
    const { client, query } = harness();
    await expect(run(client, { expectedUserId: hiddenId })).rejects.toMatchObject({ code: "forbidden" });
    expect(query.range).not.toHaveBeenCalled();
    const changed = harness();
    changed.client.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: actor } } }, error: null }).mockResolvedValue({ data: { session: { user: { id: hiddenId } } }, error: null });
    await expect(run(changed.client)).rejects.toMatchObject({ code: "forbidden" });
    expect(changed.client.rpc).not.toHaveBeenCalled();
  });

  it.each([{ exercise_name: "" }, { exercise_name: {} }, { exercise_name: "Agachamento", category: "invented" }, { exercise_name: "Agachamento", categories: ["invented"] }])("blocks invalid creation metadata %j without writes", async (exercise) => {
    const { client } = harness();
    await expect(run(client, { workouts: [{ title: "A", exercises: [exercise] }] })).rejects.toMatchObject({ code: "invalid" });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
