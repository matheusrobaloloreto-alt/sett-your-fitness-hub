import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { api, login } from './self-service-api.mjs';
import { sql, privateFile } from './self-service-local.mjs';

const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const source = readFileSync(new URL('../../supabase/functions/_shared/form-definitions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { defaultFormDefinition } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

export async function checked(endpoint, options = {}) {
  const result = await api(endpoint, options);
  assert.equal(result.ok, true, `${endpoint.split('?')[0]} HTTP ${result.status}: ${result.data?.code ?? ''} ${result.data?.message ?? ''}`);
  return result.data;
}

export async function feedbackDependencies() {
  // verifyProject in sql() rejects non-QA databases and networks before any DDL.
  sql(readFileSync(new URL('../../qa/self-service-feedback-dependencies.sql', import.meta.url), 'utf8'));
  const installed = new Set(sql("select tablename||':'||policyname from pg_policies where schemaname='public'").split('\n'));
  const statements = [];
  const addPolicies = (text, table) => {
    const re = /create policy (?:"([^"]+)"|(\w+))\s+on public\.(\w+)[\s\S]*?;/gi;
    for (const match of text.matchAll(re)) if (match[3] === table && !installed.has(`${table}:${match[1] ?? match[2]}`)) statements.push(match[0]);
  };
  addPolicies(migration('20260815061954_harden_goals_feedback_tenant_rls.sql'), 'cycle_feedback');
  const hardened = migration('20260815062126_remove_legacy_same_company_student_leaks.sql');
  addPolicies(hardened, 'workout_feedback');
  addPolicies(hardened, 'enrollments');
  // Import the actual parent-integrity triggers and actual server-side reply RPC.
  const integrity = hardened.slice(hardened.indexOf('create or replace function public.enforce_cycle_feedback_reference_integrity()'), hardened.indexOf('-- Strength, endurance and nutrition plans'));
  assert.ok(integrity.includes('enforce_workout_feedback_reference_integrity'));
  statements.push(integrity);
  const reply = migration('20260824114442_workout_feedback_trainer_replies.sql');
  statements.push(reply.slice(reply.indexOf('create or replace function public.guard_workout_feedback_reply_columns()')));
  for (const table of ['workouts','workout_logs','workout_sessions','training_cycles','nutrition_plans','running_plans','prescription_bundles','ai_strength_plans']) {
    statements.push(`alter table public.${table} enable row level security; grant select on public.${table} to authenticated; grant all on public.${table} to service_role;`);
    const policy = `feedback_fixture_${table}_read`;
    if (!installed.has(`${table}:${policy}`)) {
      const scope = table === 'workouts'
        ? `exists(select 1 from public.training_cycles tc join public.students s on s.id=tc.student_id where tc.id=workouts.cycle_id and s.company_id=tc.company_id and (s.user_id=auth.uid() or public.is_company_staff(auth.uid(),tc.company_id)))`
        : `exists(select 1 from public.students s where s.id=${table}.student_id and s.company_id=${table}.company_id and (s.user_id=auth.uid() or public.is_company_staff(auth.uid(),s.company_id)))`;
      statements.push(`create policy ${policy} on public.${table} for select to authenticated using(${scope});`);
    }
  }
  if (!installed.has('students:feedback_fixture_staff_read')) statements.push('create policy feedback_fixture_staff_read on public.students for select to authenticated using(public.is_company_staff(auth.uid(),company_id));');
  if (!installed.has('plans:feedback_fixture_plan_read')) statements.push('create policy feedback_fixture_plan_read on public.plans for select to authenticated using(public.is_company_staff(auth.uid(),company_id) or exists(select 1 from public.enrollments e join public.students s on s.id=e.student_id where e.plan_id=plans.id and s.user_id=auth.uid() and s.company_id=plans.company_id));');
  statements.push('grant select,insert on public.cycle_feedback to authenticated; grant select,insert on public.workout_feedback to authenticated; grant select on public.enrollments,public.plans to authenticated;');
  const directory = migration('20261014194335_company_staff_student_management.sql');
  const directoryStart = directory.indexOf('create or replace function public.get_company_student_staff_directory');
  const directoryEnd = directory.indexOf('-- Preserve financial mutation permissions', directoryStart);
  statements.push(directory.slice(directoryStart, directoryEnd));
  sql(`begin;\n${statements.join('\n')}\ncommit; notify pgrst, 'reload schema';`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await api('/rest/v1/workout_feedback?select=trainer_reply&limit=0', { admin: true });
    if (result.ok) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Feedback prerequisite schema cache unavailable');
}

export async function createFeedbackFixture(label, { withLogs = true, secondSession = false } = {}) {
  const id = randomUUID();
  const companyId = randomUUID(), foreignCompanyId = randomUUID();
  await checked('/rest/v1/companies', { method: 'POST', admin: true, body: [
    { id: companyId, name: `Synthetic Feedback ${label}`, slug: `feedback-${id}`, tier: 'advanced' },
    { id: foreignCompanyId, name: 'Synthetic Feedback Foreign', slug: `feedback-foreign-${id}`, tier: 'advanced' },
  ] });
  const people = {};
  for (const [key, role, company] of [['admin','admin',companyId],['trainer','trainer',companyId],['student','student',companyId],['otherStudent','student',companyId],['foreignTrainer','trainer',foreignCompanyId]]) {
    const fullName = key === 'trainer' ? 'Synthetic Feedback Professor' : `Synthetic Feedback ${key}`;
    const user = await checked('/auth/v1/admin/users', { method: 'POST', admin: true, body: {
      email: `feedback-${key.toLowerCase()}-${id}@self-service.invalid`, email_confirm: true, user_metadata: { full_name: fullName },
    } });
    people[key] = { id: user.id, email: user.email, company, fullName };
    sql(`insert into public.user_roles(user_id,role) values(${literal(user.id)},${literal(role)});
      insert into public.profiles(user_id,full_name) values(${literal(user.id)},${literal(fullName)}) on conflict(user_id) do update set full_name=excluded.full_name;
      ${role === 'student' ? '' : `insert into public.company_members(company_id,user_id) values(${literal(company)},${literal(user.id)});`}`);
  }
  const insert = async (table, body) => (await checked(`/rest/v1/${table}`, { method: 'POST', admin: true, body }))[0];
  const student = await insert('students', { company_id: companyId, user_id: people.student.id, full_name: 'Synthetic Feedback Student', email: people.student.email });
  const otherStudent = await insert('students', { company_id: companyId, user_id: people.otherStudent.id, full_name: 'Synthetic Feedback Other', email: people.otherStudent.email });
  const date = delta => new Date(Date.now() + delta * 86400000).toISOString().slice(0,10);
  const plan = await insert('plans', { company_id: companyId, name: 'Synthetic Feedback Plan', duration_days: 42, duration_weeks: 6, cycle_duration_days: 42 });
  const enrollment = await insert('enrollments', { company_id: companyId, student_id: student.id, plan_id: plan.id, trainer_id: people.trainer.id, status: 'active', start_date: date(-38), end_date: date(3) });
  const cycle = await insert('training_cycles', { company_id: companyId, student_id: student.id, enrollment_id: enrollment.id, status: 'active', start_date: date(-38), end_date: date(3), cycle_number: 1 });
  const workout = await insert('workouts', { company_id: companyId, cycle_id: cycle.id, title: 'Synthetic Feedback Workout', name: 'Synthetic Feedback Workout', exercises: [{ name: 'Synthetic squat', sets: 1, reps: '10', rest: 60 }], day_of_week: new Date().getDay() });
  const session = await insert('workout_sessions', { company_id: companyId, student_id: student.id, workout_id: workout.id, status: 'completed', session_date: date(-1), completed_at: new Date().toISOString(), duration_seconds: 600, total_volume: 100, total_sets_completed: 1, total_sets_prescribed: 1 });
  if (withLogs) await insert('workout_logs', { company_id: companyId, student_id: student.id, workout_id: workout.id, session_date: date(-1), exercise_index: 0, set_number: 1, weight: 10, reps_done: 10, completed: true, set_type: 'working' });
  const adminToken = (await login(people.admin)).access_token;
  const publish = async (kind, version, later = false) => {
    const definition = defaultFormDefinition(kind);
    definition.title = `Synthetic ${kind} V${version + 1}`;
    definition.fields.push({ key: 'extra_feedback_ui', label: 'Synthetic feedback detail', type: 'text', required: true, hidden: false, help: '', options: [] });
    if (later) definition.fields.push({ key: 'extra_later', label: 'Synthetic later detail', type: 'text', required: true, hidden: false, help: '', options: [] });
    return checked('/rest/v1/rpc/publish_company_form_definition', { method: 'POST', token: adminToken, body: { _company_id: companyId, _definition: definition, _expected_version: version } });
  };
  const cycleForm = await publish('cycle_feedback', 0);
  const workoutForm = await publish('workout_feedback', 0);
  const feedback = await insert('workout_feedback', { company_id: companyId, student_id: student.id, workout_session_id: session.id, workout_title: workout.title, difficulty: 5,
    notes: 'Percepção: Ideal\nSynthetic workout reflection', form_definition_id: workoutForm.id,
    instrument_answers: { perception: 'Bom', reflection: 'Synthetic workout reflection', extra_feedback_ui: 'Synthetic immutable workout answer' } });
  const otherEnrollment = await insert('enrollments', { company_id: companyId, student_id: otherStudent.id, plan_id: plan.id, trainer_id: people.trainer.id, status: 'active', start_date: date(-38), end_date: date(3) });
  const otherCycle = await insert('training_cycles', { company_id: companyId, student_id: otherStudent.id, enrollment_id: otherEnrollment.id, status: 'active', start_date: date(-38), end_date: date(3), cycle_number: 1 });
  let second = null;
  if (secondSession) {
    const secondWorkoutSession = await insert('workout_sessions', { company_id: companyId, student_id: student.id, workout_id: workout.id, status: 'completed', session_date: date(-1), completed_at: new Date().toISOString(), duration_seconds: 300, total_volume: 200, total_sets_completed: 2, total_sets_prescribed: 2 });
    const secondFeedback = await insert('workout_feedback', { company_id: companyId, student_id: student.id, workout_session_id: secondWorkoutSession.id, workout_title: workout.title, difficulty: 5,
      notes: 'Percepção: Bom\nSynthetic second workout reflection', form_definition_id: workoutForm.id,
      instrument_answers: { perception: 'Bom', reflection: 'Synthetic second workout reflection', extra_feedback_ui: 'Synthetic second immutable answer' } });
    second = { session: secondWorkoutSession, feedback: secondFeedback };
  }
  const result = { id, companyId, foreignCompanyId, people, student, otherStudent, enrollment, otherEnrollment, cycle, otherCycle, workout, session, feedback, cycleForm, workoutForm, second };
  privateFile(`feedback-${id}.private.json`, JSON.stringify(result));
  return { ...result, publish };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], 'dependencies', 'Usage: node scripts/qa/self-service-feedback-fixture.mjs dependencies');
  await feedbackDependencies();
  console.log('Explicit additive feedback UI prerequisites ready on isolated loopback QA only.');
}
