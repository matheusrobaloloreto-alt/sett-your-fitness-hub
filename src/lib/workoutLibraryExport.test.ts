import { describe, expect, it, vi } from "vitest";
import { fetchLibraryExercises, prepareWorkoutLibraryExport } from "./workoutLibraryExport";
import type { WorkoutTemplateDraftWorkout } from "./workoutTemplateDraft";
import { INDIVIDUAL_WEEKLY_UI_VERSION, LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION } from "./weeklyStrengthPeriodization";

const library = [{ id: "canonical", name: "Agachamento", company_id: "company-a" }];
const workout = {
  id: "runtime-id", updated_at: "revision-token", title: "A", day_of_week: 3, sort_order: 7,
  custom_workout: { track: "manual" },
  exercises: [{ exercise_id: "canonical", exercise_name: "Agachamento", sets: "4", reps: "8-10", rest: "90s",
    mfit_protocol: { steps: [{ load: "livre", seconds: 3 }] }, tempo: "2020", method: "biset", group_id: "block-1",
    method_seconds: 3, exercise_order: 4, video_url: "https://example.test/video", video_path: "private/video.mp4",
    youtube_video_id: "video-id", thumbnail_url: "https://example.test/cover", set_types: ["normal", "failure"],
    unknown_metric: { reserve: 2 } }],
};
const prepare = <TWorkout extends WorkoutTemplateDraftWorkout>(workouts: TWorkout[], workoutIndex?: number) => prepareWorkoutLibraryExport({ workouts, workoutIndex, libraryExercises: library, companyId: "company-a" });

describe("workout library export", () => {
  it("clona todos os campos e remove apenas identidade de runtime sem alterar a origem", () => {
    const source = structuredClone(workout);
    const result = prepare([workout]);
    const expected = structuredClone(workout);
    delete expected.id;
    delete expected.updated_at;
    expect(result.workouts).toEqual([expected]);
    expect(result.issues).toEqual([]);
    const exported = result.workouts[0];
    exported.exercises[0].mfit_protocol.steps[0].seconds = 99;
    exported.custom_workout.track = "alterado";
    expect(workout).toEqual(source);
  });

  it("salva somente B e ignora a sessão A inválida", () => {
    const invalid = { ...workout, title: "A", exercises: [] };
    const selected = { ...workout, title: "B" };
    expect(prepare([invalid, selected], 1).issues).toEqual([]);
    expect(prepare([invalid, selected], 1).workouts.map((item) => item.title)).toEqual(["B"]);
    expect(prepare([invalid, selected]).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "empty_workout" })]));
  });

  it("ignora objeto malformado fora do recorte mas rejeita a seleção malformada", () => {
    expect(prepare([null, workout], 1).workouts).toHaveLength(1);
    expect(() => prepare([null, workout], 0)).toThrow("treino inválido");
  });

  it("preserva ordem do plano completo e não acrescenta weekly a legado", () => {
    const result = prepare([workout, { ...workout, title: "B" }]);
    expect(result.workouts.map((item) => item.title)).toEqual(["A", "B"]);
    expect(result.workouts[0].exercises[0]).not.toHaveProperty("weekly_prescription");
    expect(result.workouts[0].exercises[0]).not.toHaveProperty("weekly_ui_version");
  });

  it("mapeia aliases raw AI na cópia sem perder protocolo, métricas ou campos originais", () => {
    const raw = { name: "Treino AI", notes: "Plano original", custom: { keep: true }, exercises: [{
      library_exercise_name: "Agachamento", rest_seconds: 0, sets: 3, reps: "8", notes: "Nota",
      cues: "  Controle  ", biomechanical_note: "Biomecânica", mfit_protocol: { untouched: true },
      method: "dropset", group_id: "group", video_path: "private/video", set_types: ["warmup", "drop", "failure"],
    }] };
    const original = structuredClone(raw);
    const result = prepare([raw]);
    expect(result.issues).toEqual([]);
    expect(result.workouts[0]).toMatchObject({ name: "Treino AI", title: "Treino AI", notes: "Plano original", description: "Plano original", custom: { keep: true } });
    expect(result.workouts[0].exercises[0]).toMatchObject({ ...raw.exercises[0], exercise_name: "Agachamento", exercise_id: "canonical",
      rest: "0s", notes: "Nota\nControle", set_types: ["warmup", "normal", "failure"] });
    expect(result.workouts[0].exercises[0]).not.toHaveProperty("weekly_prescription");
    expect(result.workouts[0].exercises[0]).not.toHaveProperty("weekly_ui_version");
    expect(raw).toEqual(original);
  });

  it("preserva valores canônicos e usa biomechanical_note quando cues está vazio", () => {
    const source = { ...workout, name: "Alias", notes: "Alias da descrição", description: "Descrição canônica", exercises: [{
      ...workout.exercises[0], library_exercise_name: "Alias", rest_seconds: 120, notes: "Nota", cues: "  ", biomechanical_note: "Controle motor",
    }] };
    const result = prepare([source]);
    expect(result.workouts[0]).toMatchObject({ title: "A", description: "Descrição canônica" });
    expect(result.workouts[0].exercises[0]).toMatchObject({ exercise_name: "Agachamento", rest: "90s", notes: "Nota\nControle motor", cues: "  ", biomechanical_note: "Controle motor" });
    expect(source.exercises[0].notes).toBe("Nota");
  });

  it.each([
    { cues: "  Controle motor  ", biomechanical_note: "Alternativa" },
    { cues: "  ", biomechanical_note: "Controle motor" },
  ])("não duplica instruções em exportações consecutivas: %j", (aliases) => {
    const source = { ...workout, exercises: [{ ...workout.exercises[0], notes: "Nota original", ...aliases }] };
    const original = structuredClone(source);
    const first = prepare([source]);
    const firstCopy = structuredClone(first.workouts);
    const second = prepare(first.workouts);
    expect(first.workouts[0].exercises[0].notes).toBe("Nota original\nControle motor");
    expect(second.issues).toEqual([]);
    expect(second.workouts).toEqual(firstCopy);
    expect(first.workouts).toEqual(firstCopy);
    expect(source).toEqual(original);
  });

  it("preserva notas que já contêm a instrução dentro de uma frase", () => {
    const source = { ...workout, exercises: [{ ...workout.exercises[0], notes: "Priorize Controle motor durante o movimento.", cues: "Controle motor" }] };
    expect(prepare([source]).workouts[0].exercises[0].notes).toBe(source.exercises[0].notes);
  });

  it.each([LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION, INDIVIDUAL_WEEKLY_UI_VERSION])("normaliza apenas set types inválidos sem migrar %s", (version) => {
    const source = { ...workout, exercises: [{ ...workout.exercises[0], method: "dropset", set_types: ["warmup", "drop", "normal", "failure"],
      weekly_ui_version: version, weekly_prescription: [{ week: 5, sets: 9, tempo: "3030", set_types: ["failure", "unexpected", "warmup"], custom: { keep: true } }] }] };
    const original = structuredClone(source);
    const expected = structuredClone(source.exercises[0]);
    expected.set_types = ["warmup", "normal", "normal", "failure"];
    expected.weekly_prescription[0].set_types = ["failure", "normal", "warmup"];
    expect(prepare([source]).workouts[0].exercises).toEqual([expected]);
    expect(source).toEqual(original);
  });

  it.each(["title", "name", "description"])("rejeita %s malformado apenas na sessão selecionada", (field) => {
    const invalid = { ...workout, [field]: { invalid: true } };
    expect(() => prepare([invalid, workout], 0)).toThrow(/texto inválido/);
    expect(prepare([invalid, workout], 1).issues).toEqual([]);
  });

  it.each(["exercise_name", "library_exercise_name"])("rejeita %s malformado sem alterar o snapshot", (field) => {
    const invalid = { ...workout, exercises: [{ ...workout.exercises[0], [field]: { invalid: true } }] };
    const original = structuredClone(invalid);
    expect(() => prepare([invalid])).toThrow(/texto inválido/);
    expect(invalid).toEqual(original);
    expect(prepare([invalid, workout], 1).issues).toEqual([]);
  });

  it("aceita textos nulos e métricas numéricas sem apagar campos desconhecidos", () => {
    const source = { title: null, name: null, description: null, custom: { arbitrary: true }, exercises: [{
      exercise_id: "canonical", exercise_name: null, library_exercise_name: null, sets: 3, reps: 8, rest: 0, custom_metric: { arbitrary: true },
    }] };
    expect(prepare([source]).workouts[0]).toEqual(source);
  });

  it.each([LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION, INDIVIDUAL_WEEKLY_UI_VERSION])("preserva weekly %s e campos desconhecidos sem migração", (version) => {
    const exercise = { ...workout.exercises[0], weekly_ui_version: version,
      weekly_prescription: [{ week: 3, sets: 4, reps: "5", tempo: "3030", set_types: ["failure"], unknown_week: { code: "keep" } }] };
    const result = prepare([{ ...workout, exercises: [exercise] }]);
    expect(result.workouts[0].exercises).toEqual([exercise]);
    expect(result.workouts[0].exercises[0].weekly_prescription).not.toBe(exercise.weekly_prescription);
  });

  it("usa IDs canônicos sem perder protocolo e mídia", () => {
    const legacy = { ...workout, exercises: [{ ...workout.exercises[0], exercise_id: "old-id" }] };
    const result = prepare([legacy]);
    expect(result.repairs).toHaveLength(1);
    expect(result.workouts[0].exercises[0]).toMatchObject({ ...workout.exercises[0], exercise_id: "canonical" });
    expect(legacy.exercises[0].exercise_id).toBe("old-id");
    expect(prepare([{ ...workout, exercises: [{ ...workout.exercises[0], exercise_id: " canonical " }] }]).workouts[0].exercises[0].exercise_id).toBe("canonical");
  });

  it("bloqueia exercício invisível e aceita apenas catálogo da empresa ou global", () => {
    const hidden = [{ ...library[0], company_id: "company-b" }];
    const args = { workouts: [workout], companyId: "company-a", libraryExercises: hidden };
    expect(prepareWorkoutLibraryExport(args).issues[0].code).toBe("exercise_not_visible");
    expect(prepareWorkoutLibraryExport({ ...args, libraryExercises: [{ ...hidden[0], is_global: true }] }).issues).toEqual([]);
  });

  it.each([-1, 1, 0.5, NaN])("rejeita índice inválido %s sem exportar plano por fallback", (index) => {
    expect(() => prepare([workout], index)).toThrow("Selecione um treino válido");
  });

  it("bloqueia plano vazio e empresa ausente", () => {
    expect(prepare([]).issues[0].code).toBe("empty_training_plan");
    expect(() => prepareWorkoutLibraryExport({ workouts: [workout], companyId: "", libraryExercises: library })).toThrow();
  });

  it("carrega todas as páginas com filtro da empresa e catálogo global", async () => {
    const first = Array.from({ length: 1000 }, (_, index) => ({ ...library[0], id: `ex-${index}` }));
    const query = { select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: [library[0], { ...library[0], id: "hidden", company_id: "other" }] }) };
    query.select.mockReturnValue(query); query.or.mockReturnValue(query); query.order.mockReturnValue(query);
    const client = { from: vi.fn().mockReturnValue(query) };
    const result = await fetchLibraryExercises(client, "company-a");
    expect(result).toHaveLength(1001);
    expect(query.or.mock.calls).toEqual([["company_id.eq.company-a,is_global.eq.true"], ["company_id.eq.company-a,is_global.eq.true"]]);
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("propaga falha do catálogo sem escrever", async () => {
    const query = { select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ error: { message: "private error" } }) };
    query.select.mockReturnValue(query); query.or.mockReturnValue(query); query.order.mockReturnValue(query);
    await expect(fetchLibraryExercises({ from: vi.fn().mockReturnValue(query) }, "company-a")).rejects.toThrow("Não foi possível carregar");
  });
});
