import { initializeNewWeeklyWorkoutDraft } from "@/lib/weeklyStrengthPeriodization";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkoutBuilder from "./WorkoutBuilder";

const mocks = vi.hoisted(() => ({
  role: "trainer", from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), getSession: vi.fn(),
  toast: vi.fn(), setPageContext: vi.fn(), register: vi.fn(), sign: vi.fn(), libraryProps: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke },
  auth: { getSession: mocks.getSession }, storage: { from: () => ({ createSignedUrl: mocks.sign }) },
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "10000000-0000-4000-8000-000000000001" },
  companyId: "20000000-0000-4000-8000-000000000001", role: mocks.role,
}) }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useAssistantName", () => ({ useAssistantName: () => "QA" }));
vi.mock("@/components/BnitoFloatingAssistant", () => ({
  useBnitoAssistant: () => ({ setPageContext: mocks.setPageContext }), BnitoContextButton: () => null,
}));
vi.mock("@/components/BenitoSprite", () => ({ BenitoSprite: () => null }));
vi.mock("@/components/body/BodyMap", () => ({ BodyMap: () => null }));
vi.mock("@/components/admin/PreRegistrationDetails", () => ({ PreRegistrationDetails: () => null }));
vi.mock("@/lib/preRegistrationData", () => ({ loadStudentPreRegistration: vi.fn().mockResolvedValue(null), updateStudentPreRegistration: vi.fn() }));

vi.mock("@/components/admin/SaveWorkoutToLibraryDialog", async (importOriginal) => {
 const actual = await importOriginal<typeof import("@/components/admin/SaveWorkoutToLibraryDialog")>();
 return { ...actual, SaveWorkoutToLibraryDialog: (props: import("@/components/admin/SaveWorkoutToLibraryDialog").SaveWorkoutToLibraryDialogProps) => {
   mocks.libraryProps(props);
   return <actual.SaveWorkoutToLibraryDialog {...props}/>;
 }};
});

const companyId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const recoveredId = "40000000-0000-4000-8000-000000000001";
type Row = Record<string, unknown>;
type Reply = { data: unknown; error: { code?: string; message?: string } | null };
type Query = {
  select: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  is: (...args: unknown[]) => Query;
  or: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query;
  eq: (key: string, value: unknown) => Query;
  range: (...args: unknown[]) => Promise<Reply>;
  maybeSingle: () => Promise<Reply>;
  then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
};
const clone = <T,>(value: T): T => structuredClone(value);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const sourceRows = (cycle: string): Row[] => [{
  id: `row-${cycle}`, updated_at: "2026-09-29T00:00:00Z", cycle_id: cycle,
  title: `Treino ${cycle} QA`, description: "Snapshot sintetico", sort_order: 0,
  exercises: [{ exercise_id: "", exercise_name: `Exercicio ${cycle} QA`, muscle_group: "Dorsal",
    sets: "3", reps: "8,6,4", rest: "0s", tempo: "3010", notes: "Legado intacto QA",
    set_types: ["normal", "normal", "falha"], method: null, group_id: null,
    mfit_protocol: { sequence: [1, 2] }, video_url: null, video_path: null }],
}];
let catalog: Row[];
let rows: Map<string, Row[]>;
let events: string[];
let templates: Row[];

function queryFor(table: string) {
  const filters = new Map<string, unknown>();
  const result = (): Reply => {
    switch (table) {
      case "muscle_groups": case "exercise_muscle_targets": return { data: [], error: null };
      case "exercise_library": return { data: clone(catalog), error: null };
      case "workout_templates": return { data: clone(templates), error: null };
      case "workouts": return { data: clone(rows.get(String(filters.get("cycle_id"))) || []), error: null };
      case "training_cycles": return { data: { cycle_number: 1, enrollment_id: `enrollment-${filters.get("id")}`, company_id: companyId, status: "active" }, error: null };
      case "enrollments": return { data: { student_id: "student-synthetic-qa", company_id: companyId }, error: null };
      case "students": return { data: { full_name: "Aluno sintetico QA", gender: "male" }, error: null };
      case "student_anamneses": case "functional_assessments": return { data: null, error: null };
      default: throw new Error(`Unexpected synthetic table ${table}`);
    }
  };
  const query: Query = {
    select: vi.fn(() => query), order: vi.fn(() => query), is: vi.fn(() => query),
    or: vi.fn(() => query), limit: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { filters.set(key, value); return query; }),
    range: vi.fn(async () => result()), maybeSingle: vi.fn(async () => result()),
    then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}

const recoveryAck = (id = recoveredId): Reply => ({ data: {
  ok: true, company_id: companyId, actor_id: actorId, created_count: 1,
  mappings: [{ input_index: 0, exercise_id: id }],
}, error: null });

function mountBuilder() {
  const tree = () => (<MemoryRouter initialEntries={["/admin/workouts/cycle-a?returnTo=%2Fdone"]}>
    <Link to="/admin/workouts/cycle-b?returnTo=%2Fdone">Outro ciclo QA</Link>
    <Routes>
      <Route path="/admin/workouts/:cycleId" element={<WorkoutBuilder />} />
      <Route path="/done" element={<p>Save confirmado QA</p>} />
    </Routes>
  </MemoryRouter>);
  const view = render(tree());
  return { ...view, rerenderBuilder: () => view.rerender(tree()) };
}
const saveButton = () => screen.getByRole("button", { name: /^Salvar Tudo$/ });
const waitForDraft = (cycle = "cycle-a") => waitFor(() => expect(screen.getByDisplayValue(`Treino ${cycle} QA`)).toBeInTheDocument());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = "trainer";
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External requests forbidden in synthetic Builder QA"); }));
  catalog = [];
  rows = new Map(["cycle-a", "cycle-b"].map((cycle) => [cycle, sourceRows(cycle)]));
  events = [];
  templates = [];
  mocks.from.mockImplementation(queryFor);
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: actorId } } }, error: null });
  mocks.register.mockImplementation(async (args: Row) => {
    const metadata = (args.p_exercises as Row[])[0];
    catalog.push({ ...clone(metadata), id: recoveredId, company_id: companyId, is_global: false });
    return recoveryAck();
  });
  mocks.invoke.mockImplementation(async (name: string) => {
    if (name !== "ai-validate-prescription") throw new Error(`Unexpected Edge call ${name}`);
    events.push("validate");
    return { data: { result: { status: "ok", warnings: [], blockers: [] } }, error: null };
  });
  mocks.rpc.mockImplementation(async (name: string, args: Row) => {
    if (name === "ensure_workout_library_references") {
      events.push("register");
      return mocks.register(args);
    }
    if (name !== "replace_cycle_workout_revision") throw new Error(`Unexpected RPC ${name}`);
    events.push("replace");
    const cycle = String(args.p_cycle_id);
    const saved = (args.p_workouts as Row[]).map((workout, index) => ({
      ...clone(workout), id: `saved-${cycle}-${index}`, updated_at: "2026-09-29T01:00:00Z", cycle_id: cycle,
    }));
    rows.set(cycle, saved);
    return { data: { cycle_id: cycle, revision_id: "revision-qa", workouts_created: saved.length,
      workout_rows: saved.map(({ id, updated_at }) => ({ id, updated_at })) }, error: null };
  });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('mounted selector destinations and persistence', () => {
 const setup = () => {
   catalog = ['one','two','three'].map((name, index) => ({
     id: '50000000-0000-4000-8000-00000000000'+index, name, muscle_group: 'Dorsal',
     company_id: companyId, is_global: false, video_url: 'https://example.com/'+name+'.mp4',
     youtube_video_id: 'abcdefghijk',
   }));
   catalog.push({id:recoveredId,name:'base',muscle_group:'Dorsal',company_id:companyId,is_global:false});
   rows.set('cycle-a', ['A','B','C'].map((name, index) => ({
     ...sourceRows('cycle-a')[0], id:'row-'+name, title:'Treino '+name, sort_order:index, exercises:[{...((sourceRows('cycle-a')[0].exercises as Row[])[0]),exercise_id:recoveredId,exercise_name:'base'}],
   })));
 };
 const openLibrary = async () => {
   fireEvent.click(screen.getByRole('button', {name:/^Adicionar$/}));
   return screen.findByRole('dialog', {name:'Biblioteca de exercícios'});
 };
 const choose = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', {name}), {button:0, ctrlKey:false});
 const closeLibrary = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', {name:/Ver treino completo/}));
 const add = async (dialog: HTMLElement, name: string) => {
   const watch = within(dialog).getByRole('button', {name:'Assistir '+name});
   const card = watch.parentElement!;
   fireEvent.click(within(card).getByRole('button', {name:'Adicionar ao treino'}));
 };
 it('watch is independent; rapid repeated addition changes only B and preserves A/C in payload', async () => {
   setup(); mountBuilder();
   await screen.findByDisplayValue('Treino A');
   choose('Treino B');
   const dialog = await openLibrary();
   const watch = await within(dialog).findByRole('button', {name:'Assistir one'});
   expect(watch.closest('button')?.parentElement?.closest('button')).toBeNull();
   fireEvent.click(watch);
   const video = await screen.findByRole('dialog', {name:'VÍDEO'});
   await waitFor(() => expect(video.querySelector('video')).toHaveAttribute('src','https://example.com/one.mp4'));
   expect(video.querySelector('iframe')).toBeNull();
   expect(mocks.rpc).not.toHaveBeenCalled();
   fireEvent.click(within(video).getByRole('button', {name:'Close'}));
   const button = within(watch.parentElement!).getByRole('button', {name:'Adicionar ao treino'});
   act(() => { fireEvent.click(button); fireEvent.click(button); });
   expect(within(dialog).getByText('2 exercício(s) no treino')).toBeInTheDocument();
   closeLibrary(dialog);
   await act(async()=>{fireEvent.click(saveButton());});
   expect(screen.getByText('Save confirmado QA'), JSON.stringify(mocks.toast.mock.calls)).toBeInTheDocument();
   const payload = mocks.rpc.mock.calls.find(([name]) => name === 'replace_cycle_workout_revision')![1].p_workouts;
   expect(payload.map((w: Row) => (w.exercises as Row[]).map(e => e.exercise_name))).toEqual([['base'], ['base','one'], ['base']]);
   expect(JSON.stringify(payload)).not.toContain('clientKey');
   expect(payload[0].exercises[0]).not.toHaveProperty('weekly_ui_version');
   expect(payload[1].exercises[1].weekly_prescription).toEqual([]);
   expect(mocks.invoke.mock.calls.every(([name]) => name === 'ai-validate-prescription')).toBe(true);
 }, 30000);
 it('removing A preserves B identity; removing selected B requires explicit C selection', async () => {
   setup(); mountBuilder(); await screen.findByDisplayValue('Treino A');
   choose('Treino B');
   let dialog = await openLibrary(); await add(dialog, 'two'); closeLibrary(dialog);
   choose('Treino A');
   fireEvent.click(screen.getByRole('button', {name:/Remover este treino/i}));
   expect(screen.getByText('Selecione um treino para editar ou adicionar exercícios.')).toBeInTheDocument();
   choose('Treino B');
   dialog = await openLibrary();
   expect(within(dialog).getByText('2 exercício(s) no treino')).toBeInTheDocument();
   await add(dialog, 'three'); closeLibrary(dialog);
   fireEvent.click(screen.getByRole('button', {name:/Remover este treino/i}));
   expect(screen.getByText('Selecione um treino para editar ou adicionar exercícios.')).toBeInTheDocument();
   choose('Treino C'); dialog = await openLibrary();
   expect(within(dialog).getByText('1 exercício(s) no treino')).toBeInTheDocument();
 }, 30000);
 it('new draft workout retains identity across edits and exports weekly metrics without UI keys', async () => {
   setup();
   rows.set('cycle-a', initializeNewWeeklyWorkoutDraft(rows.get('cycle-a') as Array<Row & { exercises: Array<{ sets: string; reps: string; rest: string; notes: string }> }>) as Row[]);
   mountBuilder(); await screen.findByDisplayValue('Treino A');
   fireEvent.click(screen.getByRole('button', {name:'Adicionar treino'}));
   const title = screen.getByDisplayValue('Treino D');
   expect(screen.getByRole('tab',{name:'Treino D'}).getAttribute('data-state')).toBe('active');
   fireEvent.change(title, {target:{value:'Nova sessão QA'}});
   const dialog = await openLibrary(); await add(dialog, 'three'); closeLibrary(dialog);
   const exported = mocks.libraryProps.mock.calls.at(-1)![0].workouts;
   expect(JSON.stringify(exported)).not.toContain('clientKey');
   expect(exported[3].title).toBe('Nova sessão QA');
   await act(async()=>{fireEvent.click(saveButton());});
   expect(screen.getByText('Save confirmado QA'), JSON.stringify(mocks.toast.mock.calls)).toBeInTheDocument();
   const payload = mocks.rpc.mock.calls.find(([name]) => name === 'replace_cycle_workout_revision')![1].p_workouts;
   expect(payload[3].title).toBe('Nova sessão QA');
   expect(payload[3].exercises[0]).toMatchObject({exercise_name:'three',sets:'3',reps:'12',rest:'60s'});
   expect(payload[3].exercises[0].weekly_prescription).toHaveLength(6);
   expect(JSON.stringify(payload)).not.toContain('clientKey');
 }, 30000);
 it('mounted private preview signs only with current authorization and ignores a result after route change', async () => {
   setup();
   vi.stubEnv('VITE_SUPABASE_URL','https://synthetic.supabase.co');
   catalog[0].video_path = 'company/private.mp4';
   const held = deferred<{data:{signedUrl:string};error:null}>();
   mocks.sign.mockReturnValue(held.promise);
   mountBuilder(); await screen.findByDisplayValue('Treino A');
   const dialog = await openLibrary();
   fireEvent.click(within(dialog).getByRole('button',{name:'Assistir one'}));
   const video = await screen.findByRole('dialog',{name:'VÍDEO'});
   await waitFor(()=>expect(mocks.sign).toHaveBeenCalledWith('company/private.mp4',300));
   expect(video.querySelector('video')).toBeNull();
   expect(mocks.rpc).not.toHaveBeenCalled();
   fireEvent.click(within(video).getByRole('button',{name:'Close'}));
   closeLibrary(dialog);
   fireEvent.click(screen.getByRole('link',{name:'Outro ciclo QA'}));
   await screen.findByDisplayValue('Treino cycle-b QA');
   await act(async()=>{held.resolve({data:{signedUrl:'https://synthetic.supabase.co/storage/v1/object/sign/exercises-videos/company/private.mp4?token=synthetic'},error:null});});
   expect(screen.queryByRole('dialog',{name:'VÍDEO'})).toBeNull();
   expect(mocks.rpc).not.toHaveBeenCalled();
   vi.unstubAllEnvs();
 },30000);

 it('blocks addition and success when the selected destination disappears while the picker stays open', async () => {
   setup(); mountBuilder(); await screen.findByDisplayValue('Treino A');
   choose('Treino B');
   const dialog = await openLibrary();
   const watch = within(dialog).getByRole('button',{name:'Assistir one'});
   fireEvent.click(screen.getByRole('button',{name:'Remover este treino',hidden:true}));
   mocks.toast.mockClear();
   const addButton = within(watch.parentElement!).getByRole('button',{name:'Adicionar ao treino'});
   expect(addButton).toBeDisabled();
   fireEvent.click(addButton);
   expect(mocks.toast).not.toHaveBeenCalled();
   expect(mocks.rpc).not.toHaveBeenCalled();
   expect(within(dialog).getByText('Selecione um treino para adicionar')).toBeInTheDocument();
   closeLibrary(dialog);
   choose('Treino A');
   expect(screen.getByRole('heading',{name:'EXERCÍCIOS (1)'})).toBeInTheDocument();
   choose('Treino C');
   expect(screen.getByRole('heading',{name:'EXERCÍCIOS (1)'})).toBeInTheDocument();
 },30000);

 it('preserves a YouTube-only demonstration through add, draft watch, library export and saved JSON', async () => {
   setup();
   catalog[0].video_url = null;
   catalog[0].video_path = null;
   mountBuilder(); await screen.findByDisplayValue('Treino A');
   const dialog = await openLibrary();
   await add(dialog,'one'); closeLibrary(dialog);
   const libraryPayload = JSON.parse(JSON.stringify(mocks.libraryProps.mock.calls.at(-1)![0].workouts));
   expect(libraryPayload[0].exercises[1]).toMatchObject({youtube_video_id:'abcdefghijk',video_url:null,video_path:null});
   fireEvent.click(screen.getByRole('button',{name:'Assistir one'}));
   const video = await screen.findByRole('dialog',{name:'VÍDEO'});
   await waitFor(()=>expect(video.querySelector('iframe')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/abcdefghijk'));
   expect(mocks.sign).not.toHaveBeenCalled();
   expect(mocks.rpc).not.toHaveBeenCalled();
   fireEvent.click(within(video).getByRole('button',{name:'Close'}));
   await act(async()=>{fireEvent.click(saveButton());});
   expect(screen.getByText('Save confirmado QA')).toBeInTheDocument();
   const saved = JSON.parse(JSON.stringify(mocks.rpc.mock.calls.find(([name])=>name === 'replace_cycle_workout_revision')![1].p_workouts));
   expect(saved[0].exercises[1]).toMatchObject({youtube_video_id:'abcdefghijk',video_url:null,video_path:null});
   expect(JSON.stringify(saved)).not.toContain('clientKey');
 },30000);
 it('invalidates a pending Storage preview when only the role changes for the same actor and tenant', async () => {
   setup(); vi.stubEnv('VITE_SUPABASE_URL','https://synthetic.supabase.co');
   catalog[0].video_path = 'company/private.mp4';
   const held = deferred<{data:{signedUrl:string};error:null}>();
   mocks.sign.mockReturnValue(held.promise);
   const view = mountBuilder(); await screen.findByDisplayValue('Treino A');
   const dialog = await openLibrary();
   fireEvent.click(within(dialog).getByRole('button',{name:'Assistir one'}));
   await screen.findByRole('dialog',{name:'VÍDEO'});
   await waitFor(()=>expect(mocks.sign).toHaveBeenCalledTimes(1));
   mocks.role = 'student';
   view.rerenderBuilder();
   await act(async()=>{held.resolve({data:{signedUrl:'https://synthetic.supabase.co/storage/v1/object/sign/exercises-videos/company/private.mp4?token=synthetic'},error:null});});
   expect(screen.queryByRole('dialog',{name:'VÍDEO'})).toBeNull();
   expect(document.querySelector('video[src*="token=synthetic"]')).toBeNull();
   expect(mocks.rpc).not.toHaveBeenCalled();
 },30000);

 it('discards pending validation after role loss with the same actor and tenant', async () => {
   setup();
   const validation = deferred<{data:{result:{status:string;warnings:unknown[];blockers:unknown[]}};error:null}>();
   mocks.invoke.mockReturnValue(validation.promise);
   const view = mountBuilder(); await screen.findByDisplayValue('Treino A');
   fireEvent.click(saveButton());
   await waitFor(()=>expect(mocks.invoke).toHaveBeenCalledTimes(1));
   mocks.role='student'; view.rerenderBuilder();
   await act(async()=>{validation.resolve({data:{result:{status:'ok',warnings:[],blockers:[]}},error:null});});
   expect(mocks.rpc.mock.calls.some(([name])=>name === 'replace_cycle_workout_revision')).toBe(false);
   expect(screen.queryByText('Save confirmado QA')).toBeNull();
 },30000);

});
