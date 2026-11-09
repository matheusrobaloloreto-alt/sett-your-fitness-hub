import { describe, it, expect, vi, afterEach } from "vitest";
import {
  publishStrengthPlanToStudent,
  publishStrengthDraftToStudent,
  buildPublishDecisionLog,
  mapStrengthExercise,
  buildTrainingCycleMetadata,
  buildWorkoutRows,
} from "./publishStrengthPlan";
import { INDIVIDUAL_WEEKLY_UI_VERSION } from "./weeklyStrengthPeriodization";

describe("buildPublishDecisionLog", () => {
  it("uses the existing prescricao source and classifies publish in the payload", () => {
    expect(buildPublishDecisionLog({
      studentId: "student-1",
      companyId: "company-1",
      readiness: "incompleto",
      edited: true,
      noLibrary: 2,
      workouts: 3,
    })).toEqual({
      student_id: "student-1",
      company_id: "company-1",
      source: "prescricao",
      summary: "prontidão: incompleto · 2 fora da biblioteca · editado pelo professor",
      payload: {
        kind: "publish",
        readiness: "incompleto",
        edited: true,
        no_library: 2,
        workouts: 3,
      },
    });
  });
});

describe("buildTrainingCycleMetadata", () => {
  it("usa apenas colunas reais de training_cycles; o vínculo do pacote fica na tabela de bundles", () => {
    const patch = buildTrainingCycleMetadata({ cycle_name: "Ciclo seguro", objective: "hipertrofia" }, 6, 2, "active");

    expect(patch).toEqual({
      status: "active",
      name: "Ciclo seguro",
      objective: "hipertrofia",
      duration_weeks: 6,
      delivery_status: "sent",
    });
    expect(patch).not.toHaveProperty("bundle_id");
  });
});

describe("mapStrengthExercise", () => {
  it("converte o exercício da IA para o formato do app do aluno (tudo string)", () => {
    const out = mapStrengthExercise({
      exercise_id: "abc",
      exercise_name: "Prancha Frontal",
      muscle_group: "Abdominais",
      sets: 3,
      reps: "20s",
      rest_seconds: 30,
      cues: "Glúteo contraído",
      biomechanical_note: "Estabilizadores",
    });
    expect(out).toEqual({
      exercise_id: "abc",
      exercise_name: "Prancha Frontal",
      muscle_group: "Abdominais",
      sets: "3",
      reps: "20s",
      rest: "30s",
      notes: "Glúteo contraído",
      // Campos de método/sistema de treino carregados pro app do aluno (badge explicado).
      method: null,
      group_id: null,
      method_seconds: null,
    });
  });

  it("usa fallbacks: library_exercise_name, biomechanical_note e campos vazios", () => {
    const out = mapStrengthExercise({
      library_exercise_name: "Agachamento",
      biomechanical_note: "Joelho alinhado",
    });
    expect(out.exercise_name).toBe("Agachamento");
    expect(out.exercise_id).toBeNull();
    expect(out.sets).toBe("");
    expect(out.reps).toBe("");
    expect(out.rest).toBe("");
    expect(out.notes).toBe("Joelho alinhado");
  });

  it("preserva a prescrição semanal que o app do aluno executa", () => {
    const out = mapStrengthExercise({
      exercise_id: "abc",
      exercise_name: "Remada Baixa",
      sets: 3,
      reps: "10-12",
      rest_seconds: 60,
      weekly_prescription: [
        {
          week: 5,
          block: "intensificacao",
          sets: 3,
          reps: "10-12",
          rir: "2",
          rest_seconds: 45,
          tempo: "2010",
          method: "biset",
          group_id: "m5_1",
          method_seconds: null,
          method_reason: "selected_safe_pair",
          set_types: ["normal", "normal", "normal"],
          instruction: "Execute o par em sequência.",
        },
      ],
    });

    expect(out.weekly_prescription).toEqual([
      expect.objectContaining({
        week: 5,
        block: "intensificacao",
        tempo: "2010",
        method: "biset",
        group_id: "m5_1",
        method_reason: "selected_safe_pair",
        set_types: ["normal", "normal", "normal"],
      }),
    ]);
    expect(out.weekly_ui_version).toBe(INDIVIDUAL_WEEKLY_UI_VERSION);
  });

  it("publica novas semanas com cadência padrão e tipos alinhados às séries", () => {
    const out = mapStrengthExercise({
      exercise_id: "abc",
      exercise_name: "Supino",
      sets: 3,
      reps: "8-10",
      set_types: ["warmup"],
      weekly_prescription: [{
        week: 1,
        block: "base",
        sets: 3,
        reps: "8-10",
        rir: "3",
        rest_seconds: 60,
        tempo: "",
        instruction: "Controle o movimento.",
      }],
    });

    expect(out.weekly_prescription?.[0]).toMatchObject({
      tempo: "2020",
      set_types: ["warmup", "normal", "normal"],
    });
  });

  it("normaliza payload legado e nunca publica drop como tipo de série", () => {
    const out = mapStrengthExercise({
      exercise_id: "legacy",
      exercise_name: "Cadeira Extensora",
      sets: 3,
      reps: "12",
      set_types: ["warmup", "normal", "drop"],
      method: "dropset",
      weekly_prescription: [{
        week: 4,
        block: "acumulacao",
        sets: 3,
        reps: "12",
        rir: "2",
        rest_seconds: 60,
        tempo: "2010",
        method: "dropset",
        set_types: ["normal", "normal", "drop"],
        instruction: "Drop-set na última série.",
      }],
    });
    expect(out.method).toBe("dropset");
    expect(out.set_types).toEqual(["warmup", "normal", "normal"]);
    expect(out.weekly_prescription?.[0].set_types).toEqual(["normal", "normal", "normal"]);
  });
});

describe("buildWorkoutRows", () => {
  const plan = {
    cycle_name: "Ciclo X",
    workouts: [
      {
        name: "Treino A",
        notes: "Foco core",
        day_of_week: 1,
        exercises: [
          { exercise_id: "e2", exercise_name: "B", exercise_order: 2, sets: 3, reps: "10" },
          { exercise_id: "e1", exercise_name: "A", exercise_order: 1, sets: 4, reps: "8" },
        ],
      },
      { name: "Treino B", day_of_week: 3, exercises: [] },
    ],
  };

  it("cria uma linha por sessão, com cycle_id/company_id e sort_order", () => {
    const rows = buildWorkoutRows(plan, "cyc-1", "co-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cycle_id: "cyc-1", company_id: "co-1", title: "Treino A", day_of_week: 1, sort_order: 1, description: "Foco core" });
    expect(rows[1]).toMatchObject({ name: "Treino B", sort_order: 2, day_of_week: 3 });
  });

  it("ordena exercícios por exercise_order", () => {
    const rows = buildWorkoutRows(plan, "cyc-1", "co-1");
    expect(rows[0].exercises.map((e) => e.exercise_name)).toEqual(["A", "B"]);
  });

  it("retorna [] quando o plano não tem workouts", () => {
    expect(buildWorkoutRows({}, "c", "co")).toEqual([]);
  });
});

const publishDb = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => publishDb.current.from(table), rpc: (...args: any[]) => publishDb.current.rpc(...args) } }));
afterEach(() => vi.useRealTimers());
function publisherFixture(overrides: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = { enrollments: [{ id: 'enr', company_id: 'co', student_id: 's', status: 'awaiting_training', start_date: '2026-01-01', end_date: '2026-12-31' }], training_cycles: [], workouts: [], ...overrides };
  const mutations: any[] = [];
  const db = { mutations, tables, rpc: vi.fn(async (_name: string, args: any): Promise<{ data: Record<string, unknown> | null; error: { code: string; message: string } | null }> => { mutations.push({ table: 'rpc', args }); return { data: { cycle_id: args.p_cycle_id, revision_id: 'rev', workouts_created: args.p_workouts.length, workout_ids: args.p_workouts.map((_: any, i: number) => `w${i}`) }, error: null }; }), from(table: string) {
    let operation = 'read', payload: any, single = false; const filters: Array<(row: any) => boolean> = [];
    const query: any = { select: () => query, eq: (k: string,v: any) => {filters.push(r=>r[k]===v);return query;}, neq: (k: string,v: any) => {filters.push(r=>r[k]!==v);return query;}, in: (k: string,v: any[]) => {filters.push(r=>v.includes(r[k]));return query;}, is: (k: string,v: any) => {filters.push(r=>(r[k]??null)===v);return query;}, order: () => query, limit: () => query,
      insert: (v: any) => {operation='insert';payload=v;return query;}, update: (v: any) => {operation='update';payload=v;return query;}, maybeSingle: () => {single=true;return query;}, single: () => {single=true;return query;},
      then: (resolve: any) => { let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r))); if(operation!=='read'){mutations.push({table,operation,payload});if(operation==='insert'){rows=[{id:`new-${table}`,...payload}];tables[table]??=[];tables[table].push(...rows);}}return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve); }
    };return query;
  }};publishDb.current=db;vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));return db;
}
const publishPlan={workouts:[{name:'A',exercises:[{exercise_name:'Synthetic squat',sets:3,reps:10}]}]};
const scheduled={id:'slot',enrollment_id:'enr',student_id:'s',company_id:'co',cycle_number:18,start_date:'2026-10-01',end_date:'2026-11-11',status:'pending'};
describe('publisher real database seam',()=>{
 it('requires explicit cycle when an agenda exists, before any mutation',async()=>{const db=publisherFixture({training_cycles:[scheduled]});await expect(publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co'})).rejects.toThrow(/selecione.*ciclo/i);expect(db.mutations).toEqual([]);});
 it('does not create a duplicate enrollment for current awaiting_training',async()=>{const db=publisherFixture();const result=await publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co'});expect(result.enrollmentId).toBe('enr');expect(result.createdEnrollment).toBe(false);expect(db.mutations.filter(x=>x.table==='enrollments')).toHaveLength(0);});
 it('fails ambiguous current enrollments before mutations',async()=>{const db=publisherFixture({enrollments:[{id:'e1',company_id:'co',student_id:'s',status:'active',start_date:'2026-01-01',end_date:'2026-12-31'},{id:'e2',company_id:'co',student_id:'s',status:'active',start_date:'2026-09-01',end_date:'2027-09-01'}]});await expect(publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co'})).rejects.toThrow(/selecione.*ciclo/i);expect(db.mutations).toEqual([]);});
 it('explicit target wins and preserves its number and dates',async()=>{const db=publisherFixture({training_cycles:[scheduled]});const result=await publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co',targetCycleId:'slot'});expect(result.cycleId).toBe('slot');expect(db.mutations.filter(x=>x.table==='training_cycles'&&x.operation==='insert')).toHaveLength(0);expect(db.tables.training_cycles[0]).toMatchObject({cycle_number:18,start_date:'2026-10-01'});});
 it('requires explicit overwrite approval before even touching bundle',async()=>{const db=publisherFixture({training_cycles:[scheduled],workouts:[{id:'old',cycle_id:'slot',updated_at:'t',exercises:[{exercise_name:'Old'}]}]});await expect(publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co',targetCycleId:'slot'})).rejects.toThrow(/substitui/i);expect(db.mutations).toEqual([]);});
 it('offline-prescribed target is protected even without digital workouts',async()=>{const db=publisherFixture({training_cycles:[{...scheduled,prescribed_offline_at:'2026-10-01'}]});await expect(publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co',targetCycleId:'slot'})).rejects.toThrow(/substitui/i);expect(db.mutations).toEqual([]);});
});

it('publisher ignores expired and foreign enrollments in favor of current awaiting_training',async()=>{
 const db=publisherFixture({enrollments:[{id:'expired',company_id:'co',student_id:'s',status:'active',start_date:'2025-01-01',end_date:'2025-12-31'},{id:'foreign',company_id:'other',student_id:'s',status:'active',start_date:'2026-01-01',end_date:'2026-12-31'},{id:'current',company_id:'co',student_id:'s',status:'awaiting_training',start_date:'2026-01-01',end_date:'2026-12-31'}]});
 const result=await publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co'});expect(result.enrollmentId).toBe('current');expect(result.createdEnrollment).toBe(false);expect(db.tables.enrollments).toHaveLength(3);
});
it('explicit replacement consent publishes into the selected cycle with revision CAS',async()=>{
 const db=publisherFixture({training_cycles:[scheduled],workouts:[{id:'old',cycle_id:'slot',updated_at:'version-1',exercises:[{exercise_name:'Old'}]}]});
 await publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co',targetCycleId:'slot',replaceTargetCycle:true});expect(db.rpc).toHaveBeenCalledWith('replace_cycle_workout_revision',expect.objectContaining({p_cycle_id:'slot',p_expected_rows:[{id:'old',updated_at:'version-1'}]}));
});

it('rejects foreign target or bundle before mutation',async()=>{
 const db=publisherFixture({training_cycles:[{...scheduled,company_id:'foreign'}]});
 await expect(publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co',targetCycleId:'slot'})).rejects.toThrow(/selecione/i);expect(db.mutations).toEqual([]);
 const other=publisherFixture({prescription_bundles:[{id:'foreign-bundle',company_id:'other',student_id:'s'}]});
 await expect(publishStrengthPlanToStudent({plan:publishPlan,studentId:'s',companyId:'co',bundleId:'foreign-bundle'})).rejects.toThrow(/pacote/i);expect(other.mutations).toEqual([]);
});


describe("protected Studio draft publication", () => {
  const input = {
    draftId: "draft",
    draftVersion: "2026-11-06T12:00:00Z",
    bundleId: "bundle",
    cycleId: "slot",
    companyId: "co",
    plan: publishPlan,
  };

  it("sends one atomic request with the reviewed plan and its version", async () => {
    const db = publisherFixture();
    db.rpc.mockResolvedValueOnce({
      data: { cycle_id: "slot", revision_id: "new", bundle_id: "bundle", strength_plan_id: "draft",
        workouts_created: 1, current: true, scheduled: false, replayed: false, workout_ids: ["new"] },
      error: null,
    });
    await expect(publishStrengthDraftToStudent(input)).resolves.toEqual({
      workoutsCreated: 1, current: true, scheduled: false, replayed: false,
    });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("publish_studio_strength_draft", {
      p_draft_id: input.draftId, p_cycle_id: input.cycleId, p_expected_draft_updated_at: input.draftVersion,
      p_plan: input.plan, p_workouts: [{ title: "A", description: null, day_of_week: null,
        exercises: [expect.objectContaining({ exercise_name: "Synthetic squat", sets: "3" })] }],
    });
    expect(db.mutations).toEqual([]);
  });

  it("orienta a revisão da nova Anamnese interciclos quando o servidor bloqueia a publicação", async () => {
    const db = publisherFixture();
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "studio_strength_intercycle_review_required" },
    });

    await expect(publishStrengthDraftToStudent(input)).rejects.toThrow(
      "Revise a nova Anamnese interciclos com o treinador antes de publicar. O rascunho foi preservado.",
    );
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.mutations).toEqual([]);
  });

  it("reports an unconfirmed response without attempting a fallback write", async () => {
    const db = publisherFixture();
    await expect(publishStrengthDraftToStudent(input)).rejects.toThrow(/não confirmou/i);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.mutations.map(mutation => mutation.table)).toEqual(["rpc"]);
  });

  it("rejects a plan with an empty workout before publishing", async () => {
    const db = publisherFixture();
    await expect(publishStrengthDraftToStudent({
      ...input, plan: { workouts: [{ name: "A", exercises: [] }] },
    })).rejects.toThrow(/inclua exercícios/i);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
