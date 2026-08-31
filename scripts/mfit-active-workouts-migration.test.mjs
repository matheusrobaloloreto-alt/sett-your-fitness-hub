import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  IMPORT_VERSION,
  MARKER_PREFIX,
  assertCanonicalSupabaseTarget,
  buildExerciseAliasIndex,
  createSupabaseAdapter,
  deterministicUuid,
  matchMfitClientsToSett,
  normalizeMfitClients,
  normalizeMfitPlans,
  normalizeSettStudents,
  parseArgs,
  runMigration,
} from "./mfit-active-workouts-migration.mjs";

const IDS = {
  company: "10000000-0000-4000-8000-000000000001",
  studentPhone: "20000000-0000-4000-8000-000000000001",
  studentEmail: "20000000-0000-4000-8000-000000000002",
  studentName: "20000000-0000-4000-8000-000000000003",
  enrollment: "30000000-0000-4000-8000-000000000001",
  studentNameOnly: "20000000-0000-4000-8000-000000000006",
  enrollmentNameOnly: "30000000-0000-4000-8000-000000000006",
  studentPartitionComplete: "20000000-0000-4000-8000-000000000011",
  studentPartitionMissing: "20000000-0000-4000-8000-000000000012",
  enrollmentPartitionComplete: "30000000-0000-4000-8000-000000000011",
  enrollmentPartitionMissing: "30000000-0000-4000-8000-000000000012",
};

function baseInput() {
  return {
    companyId: IDS.company,
    settPayload: {
      students: [{
        id: IDS.studentPhone,
        company_id: IDS.company,
        status: "active",
        full_name: "Pessoa Reservada",
        phone: "+55 (11) 99999-0001",
        email: "sett@example.test",
      }],
    },
    mfitClientsPayload: {
      clients: [{
        id: "mfit-client-1",
        name: "Nome Diferente",
        phone: "11999990001",
        email: "mfit@example.test",
      }],
    },
    mfitWorkoutsPayload: {
      clients: [{
        id: "mfit-client-1",
        fichas: [{
          id: "plan-active-1",
          name: "Hipertrofia MFIT",
          status: "active",
          start_date: "2026-08-10",
          end_date: "2026-09-20",
          workouts: [{
            id: "session-a",
            name: "Treino A",
            day_of_week: 1,
            exercises: [{
              id: "mfit-exercise-1",
              name: "Supino MFIT Exato",
              group: "Peitoral",
              sets: 3,
              reps: "10-12",
              rest_seconds: 60,
              notes: "Controle técnico",
              video_url: "https://media.example/supino",
              thumbnail_url: "https://media.example/supino-thumb",
            }],
          }],
        }],
      }],
    },
  };
}

function partitionInput() {
  return {
    companyId: IDS.company,
    settPayload: {
      students: [
        {
          id: IDS.studentPartitionComplete,
          company_id: IDS.company,
          status: "active",
          full_name: "Aluno Completo",
          phone: "11999990011",
        },
        {
          id: IDS.studentPartitionMissing,
          company_id: IDS.company,
          status: "active",
          full_name: "Aluno Incompleto",
          phone: "11999990012",
        },
      ],
    },
    mfitClientsPayload: {
      clients: [
        { id: "mfit-partition-complete", name: "Aluno Completo", phone: "11999990011" },
        { id: "mfit-partition-missing", name: "Aluno Incompleto", phone: "11999990012" },
      ],
    },
    mfitWorkoutsPayload: {
      clients: [
        {
          id: "mfit-partition-complete",
          fichas: [{
            id: "plan-complete",
            name: "Plano Completo",
            status: "active",
            start_date: "2026-08-10",
            workouts: [{
              id: "session-complete-a",
              name: "Treino Completo A",
              exercises: [{
                id: "exercise-complete",
                name: "Supino MFIT Exato",
                sets: 3,
                reps: "10",
              }],
            }],
          }],
        },
        {
          id: "mfit-partition-missing",
          fichas: [{
            id: "plan-missing",
            name: "Plano Incompleto",
            status: "active",
            start_date: "2026-08-10",
            workouts: [{
              id: "session-missing-a",
              name: "Treino Incompleto A",
              exercises: [{
                id: "exercise-missing",
                name: "Exercício Sem Catálogo",
                sets: 3,
                reps: "10",
              }],
            }],
          }],
        },
      ],
    },
  };
}

function nameOnlyInput() {
  return {
    companyId: IDS.company,
    settPayload: {
      students: [{
        id: IDS.studentNameOnly,
        company_id: IDS.company,
        status: "active",
        full_name: "Nome Somente Identidade",
      }],
    },
    mfitClientsPayload: {
      clients: [{
        id: "mfit-name-only-client",
        name: "Nome Somente Identidade",
      }],
    },
    mfitWorkoutsPayload: {
      clients: [{
        id: "mfit-name-only-client",
        fichas: [{
          id: "plan-name-only",
          name: "Plano Name Only",
          status: "active",
          start_date: "2026-08-10",
          workouts: [{
            id: "session-name-only",
            name: "Treino Name Only",
            exercises: [{
              id: "exercise-name-only",
              name: "Supino MFIT Exato",
              sets: 3,
              reps: "10",
            }],
          }],
        }],
      }],
    },
  };
}

function sourceCompletenessInput(workouts, sourceFields = {}) {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0] = {
    ...input.mfitWorkoutsPayload.clients[0].fichas[0],
    ...sourceFields,
    workouts,
  };
  return input;
}

class MemoryDb {
  constructor({
    cycles = [],
    workouts = [],
    exercises = [
      {
        id: "60000000-0000-4000-8000-000000000099",
        company_id: null,
        name: "Supino MFIT Exato",
        is_global: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000098",
        company_id: null,
        name: "Remada MFIT Exata",
        is_global: true,
      },
    ],
    workoutExercises = [],
    normalizedAvailable = true,
    students = [{ id: IDS.studentPhone, company_id: IDS.company, status: "active" }],
    enrollments = [{
      id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
    }],
    enrollmentsAfterFirstRead = null,
  } = {}) {
    this.enrollments = structuredClone(enrollments);
    this.enrollmentsAfterFirstRead = enrollmentsAfterFirstRead
      ? structuredClone(enrollmentsAfterFirstRead)
      : null;
    this.enrollmentReads = 0;
    this.students = structuredClone(students);
    this.cycles = structuredClone(cycles);
    this.workouts = structuredClone(workouts);
    this.exercises = structuredClone(exercises);
    this.workoutExercises = structuredClone(workoutExercises);
    this.normalizedSupport = { available: normalizedAvailable, has_id: normalizedAvailable };
    this.writes = { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 };
  }

  async getEnrollments(studentIds) {
    this.enrollmentReads += 1;
    const rows = this.enrollmentsAfterFirstRead && this.enrollmentReads > 1
      ? this.enrollmentsAfterFirstRead
      : this.enrollments;
    return rows.filter((row) => studentIds.includes(row.student_id));
  }

  async getStudentsByIds(ids) {
    return this.students.filter((row) => ids.includes(row.id));
  }

  async getCycles(enrollmentIds) {
    return this.cycles.filter((row) => enrollmentIds.includes(row.enrollment_id));
  }

  async getCyclesByIds(ids) {
    return this.cycles.filter((row) => ids.includes(row.id));
  }

  async getWorkouts(cycleIds) {
    return this.workouts.filter((row) => cycleIds.includes(row.cycle_id));
  }

  async getWorkoutsByIds(ids) {
    return this.workouts.filter((row) => ids.includes(row.id));
  }

  async getExercises(companyIds) {
    return this.exercises.filter((row) => row.is_global || companyIds.includes(row.company_id));
  }

  async getExercisesByIds(ids) {
    return this.exercises.filter((row) => ids.includes(row.id));
  }

  async getWorkoutExercises(workoutIds) {
    return this.workoutExercises.filter((row) => workoutIds.includes(row.workout_id));
  }

  async insertExercises(rows) {
    for (const row of rows) {
      if (!this.exercises.some((existing) => existing.id === row.id)) {
        this.exercises.push(structuredClone(row));
        this.writes.exercises += 1;
      }
    }
    return rows;
  }

  async insertCycles(rows) {
    for (const row of rows) {
      if (!this.cycles.some((existing) => existing.id === row.id)) {
        this.cycles.push(structuredClone(row));
        this.writes.cycles += 1;
      }
    }
    return rows;
  }

  async insertWorkouts(rows) {
    for (const row of rows) {
      if (!this.workouts.some((existing) => existing.id === row.id)) {
        this.workouts.push(structuredClone(row));
        this.writes.workouts += 1;
      }
    }
    return rows;
  }

  async insertWorkoutExercises(rows) {
    for (const row of rows) {
      if (!this.workoutExercises.some((existing) => existing.id === row.id)) {
        this.workoutExercises.push(structuredClone(row));
        this.writes.workoutExercises += 1;
      }
    }
    return rows;
  }
}

class ConcurrentExerciseInsertDb extends MemoryDb {
  async insertExercises(rows) {
    for (const row of rows) {
      if (!this.exercises.some((existing) => existing.id === row.id)) {
        this.exercises.push(structuredClone(row));
      }
    }
    const error = new Error("duplicate key value violates unique constraint");
    error.code = "23505";
    throw error;
  }
}

class ConcurrentNameCollisionDb extends MemoryDb {
  constructor(options) {
    super(options);
    this.exerciseCatalogReads = 0;
  }

  async getExercises(companyIds) {
    this.exerciseCatalogReads += 1;
    if (this.exerciseCatalogReads === 1) return [];
    return super.getExercises(companyIds);
  }
}

class InvisibleCycleAfterTargetDb extends MemoryDb {
  async insertCycles(rows) {
    this.writes.cycles += rows.length;
    return rows;
  }
}

class CyclesChangedBeforeApplyDb extends MemoryDb {
  constructor(options) {
    super(options);
    this.cyclesAfterFirstRead = structuredClone(options.cyclesAfterFirstRead || []);
    this.cycleReads = 0;
  }

  async getCycles(enrollmentIds) {
    this.cycleReads += 1;
    const rows = this.cycleReads > 1 ? this.cyclesAfterFirstRead : this.cycles;
    return rows.filter((row) => enrollmentIds.includes(row.enrollment_id));
  }
}

class NormalizedOverlapChangedBeforeApplyDb extends MemoryDb {
  constructor(options) {
    super(options);
    this.normalizedAfterFirstRead = structuredClone(options.normalizedAfterFirstRead || []);
    this.normalizedReads = 0;
  }

  async getWorkoutExercises(workoutIds) {
    this.normalizedReads += 1;
    const rows = this.normalizedReads > 1 ? this.normalizedAfterFirstRead : this.workoutExercises;
    return rows.filter((row) => workoutIds.includes(row.workout_id));
  }
}

const WORKOUT_EXERCISES_SCHEMA = new Set([
  "id",
  "workout_id",
  "exercise_id",
  "exercise_name",
  "exercise_order",
  "sets",
  "reps",
  "rest_seconds",
  "notes",
]);

class FakeSupabaseClient {
  constructor(tables = {}, options = {}) {
    this.tables = tables;
    this.options = options;
    this.calls = [];
  }

  from(table) {
    return new FakeSupabaseQuery(this, table);
  }
}

class FakeSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.selected = "*";
    this.filters = [];
    this.rangeValue = null;
  }

  select(columns) {
    this.selected = columns;
    return this;
  }

  in(column, values) {
    this.filters.push({ op: "in", column, values: [...values] });
    return this;
  }

  eq(column, value) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  range(from, to) {
    this.rangeValue = { from, to };
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    this.client.calls.push({
      table: this.table,
      selected: this.selected,
      filters: structuredClone(this.filters),
      range: this.rangeValue ? { ...this.rangeValue } : null,
    });
    const fail = this.client.options.failOn?.({
      table: this.table,
      filters: this.filters,
      range: this.rangeValue,
    });
    if (fail) return { data: null, error: fail };
    let rows = [...(this.client.tables[this.table] || [])];
    for (const filter of this.filters) {
      if (filter.op === "in") rows = rows.filter((row) => filter.values.includes(row[filter.column]));
      if (filter.op === "eq") rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    rows = this.rangeValue
      ? rows.slice(this.rangeValue.from, this.rangeValue.to + 1)
      : rows.slice(0, 1000);
    return { data: rows, error: null };
  }
}

test("CLI remains dry-run unless --apply is explicit", () => {
  const dryRun = parseArgs([
    "--sett-students", "sett.json",
    "--mfit-clients", "clients.json",
    "--mfit-workouts", "workouts.json",
    "--exercise-aliases", "aliases.json",
    "--company-id", IDS.company,
  ], { source_empty_session_count: 0 });
  assert.equal(dryRun.apply, false);
  assert.equal(dryRun.exerciseAliases, "aliases.json");
  assert.throws(
    () => parseArgs(["--apply", "--sett-students=a", "--mfit-clients=b", "--mfit-workouts=c"]),
    /requires --confirm-project/,
  );
  assert.equal(parseArgs([
    "--apply",
    `--confirm-project=${EXPECTED_SUPABASE_PROJECT_REF}`,
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).apply, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--partition-complete-plans",
  ]).partitionCompletePlans, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--identity-contact-only",
  ]).identityContactOnly, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).exerciseSimilarityFallback, false);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--exercise-similarity-fallback",
  ]).exerciseSimilarityFallback, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).createMissingExerciseTargets, false);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--create-missing-exercise-targets",
  ]).createMissingExerciseTargets, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).createNewCycleOnAmbiguousEmpty, false);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--create-new-cycle-on-ambiguous-empty",
  ]).createNewCycleOnAmbiguousEmpty, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).mergeOverlapIntoActiveCycle, false);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--merge-overlap-into-active-cycle",
  ]).mergeOverlapIntoActiveCycle, true);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).allowVerifiedEmptySourceSessions, false);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--allow-verified-empty-source-sessions",
  ]).allowVerifiedEmptySourceSessions, true);
  assert.throws(
    () => parseArgs([
      "--apply",
      `--confirm-project=${EXPECTED_SUPABASE_PROJECT_REF}`,
      "--sett-students=a",
      "--mfit-clients=b",
      "--mfit-workouts=c",
      `--company-id=${IDS.company}`,
      "--create-new-cycle-on-ambiguous-empty",
    ]),
    /requires 1-5 explicit --include-plan-ref/,
  );
  assert.throws(
    () => parseArgs([
      "--apply",
      `--confirm-project=${EXPECTED_SUPABASE_PROJECT_REF}`,
      "--sett-students=a",
      "--mfit-clients=b",
      "--mfit-workouts=c",
      `--company-id=${IDS.company}`,
      "--allow-verified-empty-source-sessions",
    ]),
    /requires 1-5 explicit --include-plan-ref/,
  );
  assert.throws(
    () => parseArgs([
      "--apply",
      `--confirm-project=${EXPECTED_SUPABASE_PROJECT_REF}`,
      "--sett-students=a",
      "--mfit-clients=b",
      "--mfit-workouts=c",
      `--company-id=${IDS.company}`,
      "--merge-overlap-into-active-cycle",
    ]),
    /requires 1-5 explicit --include-plan-ref/,
  );
  assert.deepEqual(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--include-plan-ref=abc123def456",
    "--include-plan-ref=0123456789ab",
  ]).includePlanRefs, ["abc123def456", "0123456789ab"]);
  assert.throws(
    () => parseArgs([
      "--apply",
      `--confirm-project=${EXPECTED_SUPABASE_PROJECT_REF}`,
      "--create-missing-exercise-targets",
      "--sett-students=a",
      "--mfit-clients=b",
      "--mfit-workouts=c",
      `--company-id=${IDS.company}`,
    ]),
    /requires 1-5 explicit --include-plan-ref values/,
  );
});

test("only the canonical SETT Supabase project is accepted", () => {
  assert.doesNotThrow(() => assertCanonicalSupabaseTarget(
    `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`,
  ));
  assert.throws(
    () => assertCanonicalSupabaseTarget("https://noncanonical.supabase.co"),
    /not the canonical SETT project/,
  );
  assert.throws(
    () => assertCanonicalSupabaseTarget(`http://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`),
    /not the canonical SETT project/,
  );
});

test("matching follows phone, then email, then exact unique name", () => {
  const students = normalizeSettStudents({ students: [
    { id: IDS.studentPhone, full_name: "Alvo Telefone", phone_digits: "11999990001", email: "wrong-phone@example.test" },
    { id: IDS.studentEmail, full_name: "Alvo Email", phone: "11999990002", email: "email@example.test" },
    { id: IDS.studentName, full_name: "Nome Exato Único" },
    { id: "20000000-0000-4000-8000-000000000004", full_name: "Nome Duplicado" },
    { id: "20000000-0000-4000-8000-000000000005", full_name: "Nome Duplicado" },
  ] });
  const clients = normalizeMfitClients({ clients: [
    { id: "phone", name: "Outro", phone: "+55 11 99999-0001", email: "unmatched@example.test" },
    { id: "email", name: "Outro 2", email: "EMAIL@example.test" },
    { id: "name", name: "Nome Exato Único" },
    { id: "duplicate", name: "Nome Duplicado" },
  ] });
  const matches = matchMfitClientsToSett(clients, students);
  assert.equal(matches.get("phone").student.id, IDS.studentPhone);
  assert.equal(matches.get("phone").method, "phone");
  assert.equal(matches.get("email").student.id, IDS.studentEmail);
  assert.equal(matches.get("email").method, "email");
  assert.equal(matches.get("name").student.id, IDS.studentName);
  assert.equal(matches.get("name").method, "exact_unique_name");
  assert.equal(matches.get("duplicate").reason, "ambiguous_name");
});

test("contradictory phone and email identifiers are blocked", () => {
  const students = normalizeSettStudents({ students: [
    { id: IDS.studentPhone, full_name: "Alvo Telefone", phone: "11999990001" },
    { id: IDS.studentEmail, full_name: "Alvo Email", email: "email@example.test" },
  ] });
  const clients = normalizeMfitClients({ clients: [{
    id: "conflict",
    name: "Pessoa Conflitante",
    phone: "11999990001",
    email: "email@example.test",
  }] });

  const match = matchMfitClientsToSett(clients, students).get("conflict");
  assert.equal(match.student, undefined);
  assert.equal(match.reason, "conflicting_phone_email");
});

test("identity-contact-only blocks exact-name-only matching while default behavior still accepts it", async () => {
  const input = nameOnlyInput();
  const db = new MemoryDb({
    students: [{ id: IDS.studentNameOnly, company_id: IDS.company, status: "active" }],
    enrollments: [{
      id: IDS.enrollmentNameOnly,
      student_id: IDS.studentNameOnly,
      company_id: IDS.company,
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
    }],
  });

  const defaultRun = await runMigration({ ...input, db, today: "2026-08-10" });
  assert.equal(defaultRun.summary.planned, 1);
  assert.equal(defaultRun.summary.name_only_matches_blocked, 0);
  assert.equal(defaultRun.results[0].match_method, "exact_unique_name");

  const contactOnlyRun = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    identityContactOnly: true,
  });
  assert.equal(contactOnlyRun.summary.candidate_operations, 0);
  assert.equal(contactOnlyRun.summary.skipped, 1);
  assert.equal(contactOnlyRun.summary.name_only_matches_blocked, 1);
  assert.equal(contactOnlyRun.results[0].reason, "name_only_match_disallowed");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("identity-contact-only only counts exact-name-only matches that would have found one SETT student", async () => {
  const students = normalizeSettStudents({ students: [
    { id: IDS.studentNameOnly, full_name: "Nome Único Contact Only" },
    { id: "20000000-0000-4000-8000-000000000021", full_name: "Nome Ambíguo Contact Only" },
    { id: "20000000-0000-4000-8000-000000000022", full_name: "Nome Ambíguo Contact Only" },
  ] });
  const clients = normalizeMfitClients({ clients: [
    { id: "unique", name: "Nome Único Contact Only" },
    { id: "missing", name: "Nome Sem SETT Contact Only" },
    { id: "ambiguous", name: "Nome Ambíguo Contact Only" },
  ] });

  const matches = matchMfitClientsToSett(clients, students, { identityContactOnly: true });
  assert.equal(matches.get("unique").reason, "name_only_match_disallowed");
  assert.equal(matches.get("missing").reason, "no_match");
  assert.equal(matches.get("ambiguous").reason, "ambiguous_name");

  const input = nameOnlyInput();
  input.settPayload.students = [
    { id: IDS.studentNameOnly, company_id: IDS.company, status: "active", full_name: "Nome Único Contact Only" },
    {
      id: "20000000-0000-4000-8000-000000000021",
      company_id: IDS.company,
      status: "active",
      full_name: "Nome Ambíguo Contact Only",
    },
    {
      id: "20000000-0000-4000-8000-000000000022",
      company_id: IDS.company,
      status: "active",
      full_name: "Nome Ambíguo Contact Only",
    },
  ];
  input.mfitClientsPayload.clients = [
    { id: "mfit-contact-only-unique", name: "Nome Único Contact Only" },
    { id: "mfit-contact-only-missing", name: "Nome Sem SETT Contact Only" },
    { id: "mfit-contact-only-ambiguous", name: "Nome Ambíguo Contact Only" },
  ];
  const basePlan = input.mfitWorkoutsPayload.clients[0].fichas[0];
  input.mfitWorkoutsPayload.clients = [
    { id: "mfit-contact-only-unique", fichas: [{ ...structuredClone(basePlan), id: "plan-contact-only-unique" }] },
    { id: "mfit-contact-only-missing", fichas: [{ ...structuredClone(basePlan), id: "plan-contact-only-missing" }] },
    { id: "mfit-contact-only-ambiguous", fichas: [{ ...structuredClone(basePlan), id: "plan-contact-only-ambiguous" }] },
  ];

  const report = await runMigration({
    ...input,
    db: new MemoryDb(),
    today: "2026-08-10",
    identityContactOnly: true,
  });
  assert.equal(report.summary.name_only_matches_blocked, 1);
  assert.deepEqual(
    report.results.map((result) => result.reason).sort(),
    ["ambiguous_name", "name_only_match_disallowed", "no_match"],
  );
});

test("source completeness keeps an all-empty active plan visible and blocks it", async () => {
  const input = sourceCompletenessInput([{
    id: "session-empty-only",
    name: "Treino vazio capturado",
    exercises: [],
  }]);
  const plans = normalizeMfitPlans(input.mfitWorkoutsPayload);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].source_capture_complete, true);
  assert.equal(plans[0].source_empty_session_count, 1);
  assert.equal(plans[0].sessions.length, 0);

  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, today: "2026-08-10" });
  assert.equal(report.summary.mfit_plans_read, 1);
  assert.equal(report.summary.active_plans_considered, 1);
  assert.equal(report.summary.candidate_operations, 0);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.source_capture_incomplete_plans, 1);
  assert.equal(report.summary.complete_plans_with_catalog_coverage, 0);
  assert.equal(report.results[0].reason, "source_capture_incomplete");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("blocks an implausibly long MFIT source window before creating a duplicate cycle", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].end_date = "2027-12-11";
  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, today: "2026-08-10" });
  assert.equal(report.summary.candidate_operations, 0);
  assert.equal(report.results[0].status, "blocked");
  assert.equal(report.results[0].reason, "source_range_anomaly");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("source completeness blocks a zero-session normalized plan even when explicit empty count is zero", async () => {
  const input = sourceCompletenessInput([{
    id: "session-malformed-empty-count-zero",
    name: "Treino sem exercício válido",
    exercises: [{ id: "nameless-exercise", sets: 3, reps: "10" }],
  }], { source_empty_session_count: 0 });
  const plans = normalizeMfitPlans(input.mfitWorkoutsPayload);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].source_empty_session_count, 1);
  assert.equal(plans[0].source_session_count, 1);
  assert.equal(plans[0].sessions.length, 0);

  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(report.summary.candidate_operations, 0);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.source_capture_incomplete_plans, 1);
  assert.equal(report.results[0].reason, "source_capture_incomplete");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("source completeness blocks a partial empty session instead of applying the rest of the plan", async () => {
  const input = sourceCompletenessInput([
    {
      id: "session-complete",
      name: "Treino completo",
      exercises: [{
        id: "exercise-complete",
        name: "Supino MFIT Exato",
        sets: 3,
        reps: "10",
      }],
    },
    {
      id: "session-empty-partial",
      name: "Treino vazio parcial",
      exercises: [],
    },
  ], { source_empty_session_count: 0 });
  const plans = normalizeMfitPlans(input.mfitWorkoutsPayload);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].source_empty_session_count, 1);
  assert.equal(plans[0].sessions.length, 1);

  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(report.summary.candidate_operations, 0);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.source_capture_incomplete_plans, 1);
  assert.equal(report.results[0].reason, "source_capture_incomplete");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("explicit verified-empty flag imports only non-empty sessions and audits the source empties", async () => {
  const input = sourceCompletenessInput([
    {
      id: "session-complete",
      name: "Treino completo",
      exercises: [{
        id: "exercise-complete",
        name: "Supino MFIT Exato",
        sets: 3,
        reps: "10",
      }],
    },
    {
      id: "session-verified-empty",
      name: "Treino vazio verificado",
      exercises: [],
    },
  ], { source_capture_complete: true, source_empty_session_count: 1 });
  const db = new MemoryDb();
  const blockedByDefault = await runMigration({
    ...input,
    db: new MemoryDb(),
    today: "2026-08-10",
  });
  const requestedRef = blockedByDefault.results[0].ref;
  assert.equal(blockedByDefault.results[0].reason, "source_capture_incomplete");

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    allowVerifiedEmptySourceSessions: true,
    includePlanRefs: [requestedRef],
  });

  assert.equal(report.summary.imported, 1);
  assert.equal(report.summary.source_capture_incomplete_plans, 0);
  assert.equal(report.summary.verified_empty_source_sessions_accepted_plans, 1);
  assert.equal(report.results[0].verified_empty_source_sessions, 1);
  assert.equal(db.writes.workouts, 1);
  assert.equal(db.writes.workoutExercises, 1);
});

test("verified-empty exception remains ref-scoped and cannot override incomplete capture evidence", async () => {
  const partialInput = sourceCompletenessInput([
    {
      id: "session-complete",
      name: "Treino completo",
      exercises: [{ id: "exercise-complete", name: "Supino MFIT Exato", sets: 3, reps: "10" }],
    },
    { id: "session-empty", name: "Treino vazio", exercises: [] },
  ], { source_capture_complete: true, source_empty_session_count: 1 });
  const preflight = await runMigration({ ...partialInput, db: new MemoryDb(), today: "2026-08-10" });
  const requestedRef = preflight.results[0].ref;

  const withoutRef = await runMigration({
    ...partialInput,
    db: new MemoryDb(),
    today: "2026-08-10",
    allowVerifiedEmptySourceSessions: true,
  });
  assert.equal(withoutRef.results[0].reason, "source_capture_incomplete");

  const explicitIncomplete = sourceCompletenessInput(partialInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts, {
    source_capture_complete: false,
    source_empty_session_count: 1,
  });
  const falseCapture = await runMigration({
    ...explicitIncomplete,
    db: new MemoryDb(),
    today: "2026-08-10",
    allowVerifiedEmptySourceSessions: true,
    includePlanRefs: [requestedRef],
  });
  assert.equal(falseCapture.results[0].reason, "source_capture_incomplete");
});

test("explicit unknown source_capture_complete values fail closed while absent values remain complete", () => {
  const absent = normalizeMfitPlans(baseInput().mfitWorkoutsPayload);
  assert.equal(absent[0].source_capture_complete, true);

  const unknown = sourceCompletenessInput([{
    id: "session-unknown-capture-flag",
    name: "Treino com flag desconhecida",
    exercises: [{
      id: "exercise-unknown-capture-flag",
      name: "Supino MFIT Exato",
      sets: 3,
      reps: "10",
    }],
  }], { source_capture_complete: "talvez" });
  const plans = normalizeMfitPlans(unknown.mfitWorkoutsPayload);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].source_capture_complete, false);
});

test("source_capture_complete=false blocks a plan even when every normalized session has exercises", async () => {
  const input = sourceCompletenessInput([
    {
      id: "session-complete-but-flagged",
      name: "Treino completo mas captura incompleta",
      exercises: [{
        id: "exercise-complete-but-flagged",
        name: "Supino MFIT Exato",
        sets: 3,
        reps: "10",
      }],
    },
  ], { source_capture_complete: false });
  const plans = normalizeMfitPlans(input.mfitWorkoutsPayload);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].source_capture_complete, false);
  assert.equal(plans[0].source_empty_session_count, 0);

  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(report.summary.candidate_operations, 0);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.source_capture_incomplete_plans, 1);
  assert.equal(report.results[0].reason, "source_capture_incomplete");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("unknown MFIT plan statuses fail closed", () => {
  const input = baseInput().mfitWorkoutsPayload;
  input.clients[0].fichas[0].status = "mystery-state";
  assert.equal(normalizeMfitPlans(input)[0].active, false);
});

test("MFIT plans without status or explicit active flag fail closed", () => {
  const input = baseInput().mfitWorkoutsPayload;
  delete input.clients[0].fichas[0].status;
  assert.equal(normalizeMfitPlans(input)[0].active, false);
});

test("MFIT client wrappers and active ficha sessions are normalized", () => {
  const plans = normalizeMfitPlans(baseInput().mfitWorkoutsPayload);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].client_id, "mfit-client-1");
  assert.equal(plans[0].sessions[0].exercises[0].name, "Supino MFIT Exato");
  assert.equal(plans[0].sessions[0].exercises[0].rest, "60s");
});

test("default dry-run plans inserts but performs zero writes and emits no PII", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.summary.planned, 1);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 100);
  assert.equal(report.summary.exercises_to_create, 0);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });

  const serialized = JSON.stringify(report);
  for (const pii of ["Pessoa Reservada", "11999990001", "sett@example.test", "mfit@example.test", IDS.studentPhone]) {
    assert.equal(serialized.includes(pii), false, `report leaked ${pii}`);
  }
});

test("only active students in the explicit BN tenant are eligible", async () => {
  const inactiveInput = baseInput();
  inactiveInput.settPayload.students[0].status = "inactive";
  const inactiveDb = new MemoryDb();
  const inactive = await runMigration({ ...inactiveInput, db: inactiveDb, today: "2026-08-10" });
  assert.equal(inactive.summary.sett_active_students_in_company, 0);
  assert.equal(inactive.summary.skipped, 1);
  assert.deepEqual(inactiveDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });

  const otherTenantInput = baseInput();
  otherTenantInput.settPayload.students[0].company_id = "10000000-0000-4000-8000-000000000999";
  const otherTenantDb = new MemoryDb();
  const otherTenant = await runMigration({ ...otherTenantInput, db: otherTenantDb, today: "2026-08-10" });
  assert.equal(otherTenant.summary.sett_active_students_in_company, 0);
  assert.equal(otherTenant.summary.skipped, 1);
  assert.deepEqual(otherTenantDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("the database adapter exposes append-only mutations and no update or delete call", async () => {
  const source = await readFile(new URL("./mfit-active-workouts-migration.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export function createSupabaseAdapter");
  const end = source.indexOf("export function validateSchema", start);
  assert.ok(start >= 0 && end > start, "database adapter source region not found");
  const adapter = source.slice(start, end);
  assert.doesNotMatch(adapter, /\.(?:update|delete)\s*\(/);
  assert.match(adapter, /\.upsert\(/);
  assert.match(adapter, /ignoreDuplicates:\s*true/);
  assert.match(adapter, /async getExercisesByIds\(ids\)/);
  assert.match(adapter, /insertExercises\(rows\)/);
  assert.match(adapter, /insertStrict\("exercise_library"/);
  assert.doesNotMatch(adapter, /insertIgnoringIds\("exercise_library"/);
});

test("database adapter paginates ID reads without truncating rows beyond 1000", async () => {
  const workoutExerciseRows = Array.from({ length: 1205 }, (_, index) => ({
    id: `we-${String(index).padStart(4, "0")}`,
    workout_id: "workout-big",
    exercise_id: `exercise-${index}`,
    exercise_name: `Exercise ${index}`,
    exercise_order: index,
    sets: 3,
    reps: "10",
    rest_seconds: 60,
    notes: null,
  }));
  const workoutRows = Array.from({ length: 1205 }, (_, index) => ({
    id: `workout-${String(index).padStart(4, "0")}`,
    cycle_id: "cycle-big",
    company_id: IDS.company,
    name: `Treino ${index}`,
    title: `Treino ${index}`,
    description: null,
    day_of_week: null,
    sort_order: index,
    exercises: [],
    notes: null,
  }));
  const client = new FakeSupabaseClient({
    workout_exercises: workoutExerciseRows,
    workouts: workoutRows,
  });
  const adapter = createSupabaseAdapter(client, new Map([
    ["workout_exercises", WORKOUT_EXERCISES_SCHEMA],
  ]));

  const workoutExercises = await adapter.getWorkoutExercises(["workout-big"]);
  const workouts = await adapter.getWorkouts(["cycle-big"]);

  assert.equal(workoutExercises.length, 1205);
  assert.equal(workoutExercises.at(-1).id, "we-1204");
  assert.equal(workouts.length, 1205);
  assert.equal(workouts.at(-1).id, "workout-1204");
  assert.deepEqual(
    client.calls
      .filter((call) => call.table === "workout_exercises")
      .map((call) => call.range),
    [{ from: 0, to: 999 }, { from: 1000, to: 1999 }],
  );
  assert.deepEqual(
    client.calls
      .filter((call) => call.table === "workouts")
      .map((call) => call.range),
    [{ from: 0, to: 999 }, { from: 1000, to: 1999 }],
  );
});

test("database adapter keeps ID batches at 150 while paginating each batch", async () => {
  const ids = Array.from({ length: 151 }, (_, index) => `workout-${index}`);
  const workoutRows = ids.map((id, index) => ({
    id,
    cycle_id: "cycle-batched",
    company_id: IDS.company,
    name: id,
    title: id,
    description: null,
    day_of_week: null,
    sort_order: index,
    exercises: [],
    notes: null,
  }));
  const paginatedCycleRows = Array.from({ length: 1001 }, (_, index) => ({
    id: `cycle-row-${index}`,
    cycle_id: "cycle-batched",
    company_id: IDS.company,
    name: `cycle row ${index}`,
    title: `cycle row ${index}`,
    description: null,
    day_of_week: null,
    sort_order: index,
    exercises: [],
    notes: null,
  }));
  const client = new FakeSupabaseClient({ workouts: [...workoutRows, ...paginatedCycleRows] });
  const adapter = createSupabaseAdapter(client, new Map([
    ["workout_exercises", WORKOUT_EXERCISES_SCHEMA],
  ]));

  const rows = await adapter.getWorkoutsByIds(ids);
  const cycleRows = await adapter.getWorkouts(["cycle-batched"]);

  assert.equal(rows.length, 151);
  assert.equal(cycleRows.length, 1152);
  const inCalls = client.calls.filter((call) => call.table === "workouts" && call.filters[0].column === "id");
  assert.equal(inCalls[0].filters[0].values.length, 150);
  assert.equal(inCalls[1].filters[0].values.length, 1);
  assert.deepEqual(inCalls.map((call) => call.range), [
    { from: 0, to: 999 },
    { from: 0, to: 999 },
  ]);
  assert.deepEqual(
    client.calls
      .filter((call) => call.table === "workouts" && call.filters[0].column === "cycle_id")
      .map((call) => call.range),
    [{ from: 0, to: 999 }, { from: 1000, to: 1999 }],
  );
});

test("database adapter preserves paginated read errors", async () => {
  const client = new FakeSupabaseClient({
    workout_exercises: Array.from({ length: 1205 }, (_, index) => ({
      id: `we-${index}`,
      workout_id: "workout-error",
      exercise_id: `exercise-${index}`,
      exercise_name: `Exercise ${index}`,
      exercise_order: index,
      sets: 3,
      reps: "10",
      rest_seconds: 60,
      notes: null,
    })),
  }, {
    failOn: ({ table, range }) =>
      table === "workout_exercises" && range?.from === 1000
        ? { code: "PGRST_TIMEOUT" }
        : null,
  });
  const adapter = createSupabaseAdapter(client, new Map([
    ["workout_exercises", WORKOUT_EXERCISES_SCHEMA],
  ]));

  await assert.rejects(
    () => adapter.getWorkoutExercises(["workout-error"]),
    /workout_exercises select failed \(PGRST_TIMEOUT\)/,
  );
});

test("an exact company-scoped exercise is reused without creating or changing it", async () => {
  const input = baseInput();
  const existingExercise = {
    id: "60000000-0000-4000-8000-000000000001",
    company_id: IDS.company,
    name: "Supino MFIT Exato",
    is_global: false,
    description: "Curadoria SETT preservada",
  };
  const db = new MemoryDb({ exercises: [existingExercise] });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.imported, 1);
  assert.equal(report.summary.exercises_to_create, 0);
  assert.equal(db.writes.exercises, 0);
  assert.equal(db.exercises[0].description, "Curadoria SETT preservada");
  assert.equal(db.workouts[0].exercises[0].exercise_id, existingExercise.id);
});

test("exercise lookup ignores accents, case and repeated whitespace", async () => {
  const input = baseInput();
  const existingExercise = {
    id: "60000000-0000-4000-8000-000000000002",
    company_id: IDS.company,
    name: "SÚPINO   mfit exato",
    is_global: false,
    description: "Curadoria SETT preservada",
  };
  const db = new MemoryDb({ exercises: [existingExercise] });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.imported, 1);
  assert.equal(report.summary.exercises_to_create, 0);
  assert.equal(db.writes.exercises, 0);
  assert.equal(db.workouts[0].exercises[0].exercise_id, existingExercise.id);
});

test("a compatible empty SETT cycle is reused and remains idempotent", async () => {
  const input = baseInput();
  const reusableCycleId = "40000000-0000-4000-8000-000000000010";
  const db = new MemoryDb({
    cycles: [{
      id: reusableCycleId,
      enrollment_id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      cycle_number: 2,
      start_date: "2026-08-10",
      end_date: "2026-09-20",
      status: "active",
    }],
  });

  const first = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(first.summary.imported, 1);
  assert.equal(db.writes.cycles, 0);
  assert.equal(db.workouts.length, 1);
  assert.equal(db.workouts[0].cycle_id, reusableCycleId);

  const writesAfterFirst = structuredClone(db.writes);
  const second = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(second.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterFirst);
});

test("equally plausible empty cycles block import instead of guessing", async () => {
  const input = baseInput();
  const db = new MemoryDb({
    cycles: [
      {
        id: "40000000-0000-4000-8000-000000000020",
        enrollment_id: IDS.enrollment,
        student_id: IDS.studentPhone,
        company_id: IDS.company,
        cycle_number: 2,
        start_date: "2026-08-10",
        end_date: "2026-09-20",
        status: "pending",
      },
      {
        id: "40000000-0000-4000-8000-000000000021",
        enrollment_id: IDS.enrollment,
        student_id: IDS.studentPhone,
        company_id: IDS.company,
        cycle_number: 3,
        start_date: "2026-08-10",
        end_date: "2026-09-20",
        status: "pending",
      },
    ],
  });

  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "ambiguous_empty_cycle_reuse");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("explicit ambiguous-empty flag appends a deterministic cycle without touching empty cycles", async () => {
  const input = baseInput();
  const emptyCycles = [
    {
      id: "40000000-0000-4000-8000-000000000020",
      enrollment_id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      cycle_number: 2,
      start_date: "2026-08-10",
      end_date: "2026-09-20",
      status: "pending",
    },
    {
      id: "40000000-0000-4000-8000-000000000021",
      enrollment_id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      cycle_number: 3,
      start_date: "2026-08-10",
      end_date: "2026-09-20",
      status: "pending",
    },
  ];
  const db = new MemoryDb({ cycles: emptyCycles });

  const first = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createNewCycleOnAmbiguousEmpty: true,
  });

  assert.equal(first.summary.imported, 1);
  assert.equal(db.writes.cycles, 1);
  assert.equal(db.writes.workouts, 1);
  assert.equal(db.cycles.length, 3);
  assert.deepEqual(db.cycles.slice(0, 2), emptyCycles);
  assert.ok(!emptyCycles.some((cycle) => cycle.id === db.workouts[0].cycle_id));

  const writesAfterFirst = structuredClone(db.writes);
  const second = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createNewCycleOnAmbiguousEmpty: true,
  });
  assert.equal(second.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterFirst);
});

test("a missing exercise blocks the whole batch and never changes the library", async () => {
  const input = baseInput();
  const db = new MemoryDb({ exercises: [] });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 0);
  assert.equal(report.summary.exercise_catalog_missing, 1);
  assert.equal(report.results[0].reason, "exercise_not_in_catalog");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
  assert.equal(db.exercises.length, 0);
});

test("default catalog gate still blocks every selected plan when any exercise is unresolved", async () => {
  const input = partitionInput();
  const db = new MemoryDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000099",
      company_id: null,
      name: "Supino MFIT Exato",
      is_global: true,
    }],
    students: [
      { id: IDS.studentPartitionComplete, company_id: IDS.company, status: "active" },
      { id: IDS.studentPartitionMissing, company_id: IDS.company, status: "active" },
    ],
    enrollments: [
      {
        id: IDS.enrollmentPartitionComplete,
        student_id: IDS.studentPartitionComplete,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: IDS.enrollmentPartitionMissing,
        student_id: IDS.studentPartitionMissing,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  });

  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.summary.candidate_operations, 0);
  assert.equal(report.summary.planned || 0, 0);
  assert.equal(report.summary.blocked, 2);
  assert.equal(report.summary.complete_plans_with_catalog_coverage, 1);
  assert.equal(report.summary.blocked_incomplete_plans, 1);
  assert.deepEqual(new Set(report.results.map((row) => row.reason)), new Set([
    "migration_batch_catalog_gate",
    "exercise_not_in_catalog",
  ]));
});

test("partition-complete-plans plans and applies only plans with full catalog coverage", async () => {
  const input = partitionInput();
  const db = new MemoryDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000099",
      company_id: null,
      name: "Supino MFIT Exato",
      is_global: true,
    }],
    students: [
      { id: IDS.studentPartitionComplete, company_id: IDS.company, status: "active" },
      { id: IDS.studentPartitionMissing, company_id: IDS.company, status: "active" },
    ],
    enrollments: [
      {
        id: IDS.enrollmentPartitionComplete,
        student_id: IDS.studentPartitionComplete,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: IDS.enrollmentPartitionMissing,
        student_id: IDS.studentPartitionMissing,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  });

  const dryRun = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    partitionCompletePlans: true,
  });

  assert.equal(dryRun.summary.candidate_operations, 1);
  assert.equal(dryRun.summary.planned, 1);
  assert.equal(dryRun.summary.blocked, 1);
  assert.equal(dryRun.summary.complete_plans_with_catalog_coverage, 1);
  assert.equal(dryRun.summary.blocked_incomplete_plans, 1);
  assert.deepEqual(dryRun.results.map((row) => row.status).sort(), ["blocked", "planned"]);
  assert.equal(dryRun.results.find((row) => row.status === "blocked").reason, "partition_plan_catalog_incomplete");

  const applied = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    partitionCompletePlans: true,
  });
  assert.equal(applied.summary.imported, 1);
  assert.equal(applied.summary.blocked, 1);
  assert.equal(db.writes.cycles, 1);
  assert.equal(db.writes.workouts, 1);
  assert.equal(db.writes.workoutExercises, 1);

  const writesAfterApply = structuredClone(db.writes);
  const repeated = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    partitionCompletePlans: true,
  });
  assert.equal(repeated.summary.already_imported, 1);
  assert.equal(repeated.summary.blocked, 1);
  assert.deepEqual(db.writes, writesAfterApply);
});

test("only approved high-confidence aliases are executable and reviewed rows stay inert", () => {
  const valid = {
    schema_version: 1,
    contains_pii: false,
    aliases: [{
      source_name: "Supino legado",
      target_exercise_id: "60000000-0000-4000-8000-000000000099",
      target_name: "Supino MFIT Exato",
      status: "approved",
      confidence: "high",
    }],
  };
  assert.equal(buildExerciseAliasIndex(valid).size, 1);
  assert.equal(
    buildExerciseAliasIndex({ ...valid, aliases: [{ ...valid.aliases[0], status: "needs_review", confidence: "medium" }] }).size,
    0,
  );
  assert.equal(
    buildExerciseAliasIndex({
      ...valid,
      aliases: [{ ...valid.aliases[0], status: "blocked_after_visual_review", confidence: "medium" }],
    }).size,
    0,
  );
  assert.throws(
    () => buildExerciseAliasIndex({ ...valid, aliases: [valid.aliases[0], { ...valid.aliases[0], source_name: "SÚPINO LEGADO" }] }),
    /unique after normalization/,
  );
  assert.throws(() => buildExerciseAliasIndex({ ...valid, contains_pii: true }), /contains_pii=false/);
});

test("an approved alias resolves only to its exact visible catalog id and name", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Supino legado";
  input.exerciseAliasPayload = {
    schema_version: 1,
    contains_pii: false,
    aliases: [{
      source_name: "Supino legado",
      target_exercise_id: "60000000-0000-4000-8000-000000000099",
      target_name: "Supino MFIT Exato",
      status: "approved",
      confidence: "high",
    }],
  };
  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.summary.exercise_catalog_coverage_percent, 100);
  assert.equal(report.summary.exercise_catalog_alias_matched, 1);
  assert.equal(report.summary.nearest_alias, 1);
  assert.equal(report.summary.exercise_aliases_loaded, 1);
  assert.equal(report.summary.planned, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("an exact-duplicate override stays inert until independent review is approved", async () => {
  const input = baseInput();
  input.exerciseAliasPayload = {
    schema_version: 1,
    contains_pii: false,
    aliases: [{
      source_name: "Supino MFIT Exato",
      target_exercise_id: "60000000-0000-4000-8000-000000000097",
      target_name: "Supino MFIT Exato",
      status: "approved",
      confidence: "high",
      match_scope: "ambiguous_exact_override",
      independent_review_status: "pending",
    }],
  };
  const db = new MemoryDb({
    exercises: [
      {
        id: "60000000-0000-4000-8000-000000000099",
        company_id: null,
        name: "Supino MFIT Exato",
        is_global: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000097",
        company_id: null,
        name: "Supino MFIT Exato",
        is_global: true,
      },
    ],
  });

  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.summary.exercise_aliases_loaded, 0);
  assert.equal(report.summary.exercise_catalog_ambiguous, 1);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 0);
  assert.equal(report.summary.blocked, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("a stale or invisible alias target fails closed", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Supino legado";
  input.exerciseAliasPayload = {
    schema_version: 1,
    contains_pii: false,
    aliases: [{
      source_name: "Supino legado",
      target_exercise_id: "60000000-0000-4000-8000-000000000099",
      target_name: "Nome antigo divergente",
      status: "approved",
      confidence: "high",
    }],
  };
  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.summary.exercise_catalog_invalid_aliases, 1);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 0);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "exercise_alias_invalid");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("similarity fallback is off by default and never authorizes writes", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Supino MFIT Exato Inclinado";
  const db = new MemoryDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000099",
      company_id: null,
      name: "Supino MFIT Exato",
      muscle_group: "Peitoral",
      equipment: "Banco",
      is_global: true,
    }],
  });

  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.exercise_catalog_missing, 1);
  assert.equal(report.summary.exercise_catalog_similarity_candidates, 0);
  assert.equal(report.results[0].reason, "exercise_not_in_catalog");
  assert.deepEqual(report.exercise_similarity_candidates, []);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("similarity fallback records a deterministic visible candidate above threshold", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Cavalinho";
  const db = new MemoryDb({
    exercises: [
      {
        id: "60000000-0000-4000-8000-000000000097",
        company_id: null,
        name: "Remada Cavalinho B",
        muscle_group: "Costas",
        equipment: "Barra",
        is_global: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000096",
        company_id: null,
        name: "Remada Cavalinho A",
        muscle_group: "Costas",
        equipment: "Barra",
        is_global: true,
      },
    ],
  });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    exerciseSimilarityFallback: true,
  });

  assert.equal(report.summary.exercise_catalog_missing, 1);
  assert.equal(report.summary.exercise_catalog_similarity_candidates, 1);
  assert.equal(report.summary.exercise_catalog_similarity_below_threshold, 0);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 0);
  assert.equal(report.results[0].reason, "exercise_similarity_candidate_requires_review");
  assert.deepEqual(report.exercise_similarity_candidates, [{
    source_name: "Remada Cavalinho",
    candidate_exercise_id: "60000000-0000-4000-8000-000000000096",
    candidate_name: "Remada Cavalinho A",
    status: "requires_review",
    reason: "similarity_candidate_requires_review",
    score: 0.67,
  }]);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("similarity fallback ignores exercises outside tenant/global visibility", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Puxada Neutra Polia";
  const db = new MemoryDb({
    exercises: [
      {
        id: "60000000-0000-4000-8000-000000000080",
        company_id: "10000000-0000-4000-8000-999999999999",
        name: "Puxada Neutra Polia Privada Outra Empresa",
        muscle_group: "Costas",
        equipment: "Polia",
        is_global: false,
      },
      {
        id: "60000000-0000-4000-8000-000000000081",
        company_id: null,
        name: "Puxada Neutra na Polia",
        muscle_group: "Costas",
        equipment: "Polia",
        is_global: true,
      },
    ],
  });

  const report = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    exerciseSimilarityFallback: true,
  });

  assert.equal(report.summary.exercise_catalog_similarity_candidates, 1);
  assert.equal(report.exercise_similarity_candidates[0].candidate_exercise_id, "60000000-0000-4000-8000-000000000081");
  assert.equal(report.results[0].reason, "exercise_similarity_candidate_requires_review");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("similarity fallback fails closed below threshold and on obvious incompatibility", async () => {
  const belowThresholdInput = baseInput();
  belowThresholdInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Abdução Misteriosa";
  const belowThresholdDb = new MemoryDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000099",
      company_id: null,
      name: "Supino MFIT Exato",
      muscle_group: "Peitoral",
      equipment: "Banco",
      is_global: true,
    }],
  });
  const belowThreshold = await runMigration({
    ...belowThresholdInput,
    db: belowThresholdDb,
    today: "2026-08-10",
    exerciseSimilarityFallback: true,
  });

  assert.equal(belowThreshold.summary.exercise_catalog_similarity_candidates, 0);
  assert.equal(belowThreshold.summary.exercise_catalog_similarity_below_threshold, 1);
  assert.equal(belowThreshold.results[0].reason, "exercise_not_in_catalog");

  const incompatibleInput = baseInput();
  incompatibleInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0] = {
    id: "mfit-exercise-unsafe",
    name: "Remada Unilateral com Halter",
    group: "Costas",
    equipment: "Halter",
    sets: 3,
    reps: "10",
  };
  const incompatibleDb = new MemoryDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000088",
      company_id: null,
      name: "Remada Unilateral Máquina",
      muscle_group: "Costas",
      equipment: "Máquina",
      is_global: true,
    }],
  });
  const incompatible = await runMigration({
    ...incompatibleInput,
    db: incompatibleDb,
    today: "2026-08-10",
    exerciseSimilarityFallback: true,
  });

  assert.equal(incompatible.summary.exercise_catalog_similarity_incompatible, 1);
  assert.equal(incompatible.results[0].reason, "exercise_similarity_incompatible");
  assert.deepEqual(incompatible.exercise_similarity_candidates, [{
    source_name: "Remada Unilateral com Halter",
    candidate_exercise_id: "60000000-0000-4000-8000-000000000088",
    candidate_name: "Remada Unilateral Máquina",
    status: "blocked",
    reason: "equipment_or_pattern_incompatible",
    score: 0.67,
  }]);
  assert.deepEqual(belowThresholdDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
  assert.deepEqual(incompatibleDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("explicit target creation appends a tenant exercise and separates nearest alias from created target", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0] = {
    id: "mfit-exercise-created-target",
    name: "Remada Unilateral com Halter",
    group: "Costas",
    equipment: "Halter",
    sets: 3,
    reps: "10",
  };
  const expectedId = deterministicUuid(
    IMPORT_VERSION,
    "exercise-library",
    IDS.company,
    "remada unilateral com halter",
  );
  const db = new MemoryDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000088",
      company_id: null,
      name: "Remada Unilateral Máquina",
      muscle_group: "Costas",
      equipment: "Máquina",
      is_global: true,
    }],
  });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    exerciseSimilarityFallback: true,
    createMissingExerciseTargets: true,
  });

  assert.equal(report.summary.imported, 1);
  assert.equal(report.summary.exercise_catalog_created_targets, 1);
  assert.equal(report.summary.exercises_to_create, 1);
  assert.equal(report.summary.exercise_catalog_reused_created_targets, 0);
  assert.equal(report.exercise_similarity_candidates[0].candidate_exercise_id, "60000000-0000-4000-8000-000000000088");
  assert.deepEqual(report.exercise_created_targets, [{
    source_name: "Remada Unilateral com Halter",
    target_exercise_id: expectedId,
    target_name: "Remada Unilateral com Halter",
    company_id: IDS.company,
    status: "created_target",
    description: "Importado do MFIT; revisar metadados e vídeo",
  }]);
  assert.deepEqual(report.rollback_inventory.exercise_library_ids_created, [expectedId]);
  assert.equal(db.writes.exercises, 1);
  assert.equal(db.writes.cycles, 1);
  assert.equal(db.writes.workouts, 1);
  assert.equal(db.writes.workoutExercises, 1);
  assert.deepEqual(db.exercises.find((row) => row.id === expectedId), {
    id: expectedId,
    company_id: IDS.company,
    name: "Remada Unilateral com Halter",
    description: "Importado do MFIT; revisar metadados e vídeo",
    is_global: false,
  });
});

test("explicit target creation dry-run plans deterministic target and workout without writes", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Unilateral com Halter";
  const expectedId = deterministicUuid(
    IMPORT_VERSION,
    "exercise-library",
    IDS.company,
    "remada unilateral com halter",
  );
  const db = new MemoryDb({ exercises: [] });

  const dryRun = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(dryRun.summary.planned, 1);
  assert.equal(dryRun.summary.exercise_catalog_planned_created_targets, 1);
  assert.equal(dryRun.summary.exercises_to_create, 1);
  assert.deepEqual(dryRun.exercise_created_targets, [{
    source_name: "Remada Unilateral com Halter",
    target_exercise_id: expectedId,
    target_name: "Remada Unilateral com Halter",
    company_id: IDS.company,
    status: "planned_created_target",
    description: "Importado do MFIT; revisar metadados e vídeo",
  }]);
  assert.deepEqual(dryRun.rollback_inventory.exercise_library_ids_created, []);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("partition mode treats explicit deterministic targets as complete projected coverage", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Unilateral com Halter";
  const db = new MemoryDb({ exercises: [] });

  const dryRun = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    partitionCompletePlans: true,
    createMissingExerciseTargets: true,
  });

  assert.equal(dryRun.summary.planned, 1);
  assert.equal(dryRun.summary.complete_plans_with_projected_catalog_coverage, 1);
  assert.equal(dryRun.summary.blocked_incomplete_projected_plans, 0);
  assert.equal(dryRun.summary.exercise_catalog_planned_created_targets, 1);
  assert.equal(dryRun.summary.blocked || 0, 0);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("dry-run reports one unique planned target when multiple plans share the same missing name", async () => {
  const input = partitionInput();
  const sharedName = "Remada Unilateral com Halter";
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = sharedName;
  input.mfitWorkoutsPayload.clients[1].fichas[0].workouts[0].exercises[0].name = sharedName;
  const db = new MemoryDb({
    exercises: [],
    students: [
      { id: IDS.studentPartitionComplete, company_id: IDS.company, status: "active" },
      { id: IDS.studentPartitionMissing, company_id: IDS.company, status: "active" },
    ],
    enrollments: [
      {
        id: IDS.enrollmentPartitionComplete,
        student_id: IDS.studentPartitionComplete,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: IDS.enrollmentPartitionMissing,
        student_id: IDS.studentPartitionMissing,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  });

  const dryRun = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    partitionCompletePlans: true,
    createMissingExerciseTargets: true,
  });

  assert.equal(dryRun.summary.planned, 2);
  assert.equal(dryRun.summary.exercise_catalog_planned_created_targets, 1);
  assert.equal(dryRun.summary.exercises_to_create, 1);
  assert.equal(dryRun.exercise_created_targets.length, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("an explicit sanitized plan-ref selector limits target and workout operations", async () => {
  const input = partitionInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada A Sem Catálogo";
  input.mfitWorkoutsPayload.clients[1].fichas[0].workouts[0].exercises[0].name = "Remada B Sem Catálogo";
  const db = new MemoryDb({
    exercises: [],
    students: [
      { id: IDS.studentPartitionComplete, company_id: IDS.company, status: "active" },
      { id: IDS.studentPartitionMissing, company_id: IDS.company, status: "active" },
    ],
    enrollments: [
      {
        id: IDS.enrollmentPartitionComplete,
        student_id: IDS.studentPartitionComplete,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: IDS.enrollmentPartitionMissing,
        student_id: IDS.studentPartitionMissing,
        company_id: IDS.company,
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  });
  const inventory = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    partitionCompletePlans: true,
    createMissingExerciseTargets: true,
  });
  const requestedRef = inventory.results.find((result) => result.status === "planned")?.ref;
  assert.match(requestedRef, /^[0-9a-f]{12}$/);

  const batch = await runMigration({
    ...input,
    db,
    today: "2026-08-10",
    partitionCompletePlans: true,
    createMissingExerciseTargets: true,
    includePlanRefs: [requestedRef],
  });

  assert.equal(batch.summary.requested_plan_refs, 1);
  assert.equal(batch.summary.planned, 1);
  assert.equal(batch.summary.exercise_catalog_planned_created_targets, 1);
  assert.equal(batch.results.filter((result) => result.reason === "outside_requested_batch").length, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("target creation blocks a concurrent same-name exercise at a different id", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Unilateral com Halter";
  const db = new ConcurrentNameCollisionDb({
    exercises: [{
      id: "60000000-0000-4000-8000-000000000077",
      company_id: IDS.company,
      name: "Remada Unilateral com Halter",
      description: "Criado em corrida concorrente",
      is_global: false,
    }],
  });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "exercise_target_creation_blocked");
  assert.equal(report.exercise_created_targets[0].reason, "target_name_collision");
  assert.deepEqual(report.rollback_inventory.exercise_library_ids_created, []);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("target creation blocks deterministic id collisions and tenant mismatches before any write", async () => {
  const sourceName = "Remada Unilateral com Halter";
  const expectedId = deterministicUuid(
    IMPORT_VERSION,
    "exercise-library",
    IDS.company,
    "remada unilateral com halter",
  );
  const collisionInput = baseInput();
  collisionInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = sourceName;
  const collisionDb = new MemoryDb({
    exercises: [{
      id: expectedId,
      company_id: IDS.company,
      name: "Nome divergente já existente",
      is_global: false,
    }],
  });

  const collision = await runMigration({
    ...collisionInput,
    db: collisionDb,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(collision.summary.blocked, 1);
  assert.equal(collision.results[0].reason, "exercise_target_creation_blocked");
  assert.equal(collision.exercise_created_targets[0].status, "blocked");
  assert.equal(collision.exercise_created_targets[0].reason, "target_id_collision");
  assert.deepEqual(collisionDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });

  const tenantInput = baseInput();
  tenantInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = sourceName;
  const tenantDb = new MemoryDb({
    exercises: [{
      id: expectedId,
      company_id: "10000000-0000-4000-8000-999999999999",
      name: sourceName,
      is_global: false,
    }],
  });

  const tenantMismatch = await runMigration({
    ...tenantInput,
    db: tenantDb,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(tenantMismatch.summary.blocked, 1);
  assert.equal(tenantMismatch.exercise_created_targets[0].reason, "target_tenant_mismatch");
  assert.deepEqual(tenantDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });

  const metadataInput = baseInput();
  metadataInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = sourceName;
  const metadataDb = new ConcurrentNameCollisionDb({
    exercises: [{
      id: expectedId,
      company_id: IDS.company,
      name: sourceName,
      description: "Descrição divergente",
      is_global: false,
    }],
  });

  const metadataMismatch = await runMigration({
    ...metadataInput,
    db: metadataDb,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(metadataMismatch.summary.blocked, 1);
  assert.equal(metadataMismatch.exercise_created_targets[0].reason, "target_metadata_mismatch");
  assert.deepEqual(metadataDb.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("rollback inventory retains a created target when a later apply preflight becomes partial", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Unilateral com Halter";
  const expectedId = deterministicUuid(
    IMPORT_VERSION,
    "exercise-library",
    IDS.company,
    "remada unilateral com halter",
  );
  const db = new InvisibleCycleAfterTargetDb({ exercises: [] });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(report.summary.partial_retry_required, 1);
  assert.equal(report.results[0].reason, "cycle_insert_not_visible");
  assert.deepEqual(report.rollback_inventory.exercise_library_ids_created, [expectedId]);
  assert.equal(report.exercise_created_targets[0].status, "created_target");
  assert.deepEqual(db.writes, { exercises: 1, cycles: 1, workouts: 0, workoutExercises: 0 });
});

test("concurrent duplicate target insert re-reads and becomes a no-op when identity matches", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Unilateral com Halter";
  const expectedId = deterministicUuid(
    IMPORT_VERSION,
    "exercise-library",
    IDS.company,
    "remada unilateral com halter",
  );
  const db = new ConcurrentExerciseInsertDb({ exercises: [] });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(report.summary.imported, 1);
  assert.equal(report.summary.exercise_catalog_reused_created_targets, 1);
  assert.equal(report.exercise_created_targets[0].status, "reused_created_target");
  assert.deepEqual(report.rollback_inventory.exercise_library_ids_created, []);
  assert.equal(db.exercises.find((row) => row.id === expectedId)?.name, "Remada Unilateral com Halter");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 1, workouts: 1, workoutExercises: 1 });
});

test("created target import is idempotent on partial retry", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Remada Unilateral com Halter";
  const db = new MemoryDb({ exercises: [] });

  const first = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(first.summary.imported, 1);
  assert.equal(first.summary.exercise_catalog_created_targets, 1);
  const writesAfterFirst = structuredClone(db.writes);

  const second = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
  });

  assert.equal(second.summary.already_imported, 1);
  assert.equal(second.summary.exercise_catalog_created_targets, 0);
  assert.deepEqual(second.rollback_inventory.exercise_library_ids_created, []);
  assert.deepEqual(db.writes, writesAfterFirst);
});

test("an approved high-confidence alias can select one exact duplicate explicitly", async () => {
  const input = baseInput();
  const preferredId = "60000000-0000-4000-8000-000000000097";
  input.exerciseAliasPayload = {
    schema_version: 1,
    contains_pii: false,
    aliases: [{
      source_name: "Supino MFIT Exato",
      target_exercise_id: preferredId,
      target_name: "Supino MFIT Exato",
      status: "approved",
      confidence: "high",
      match_scope: "ambiguous_exact_override",
      independent_review_status: "approved",
    }],
  };
  const db = new MemoryDb({
    exercises: [
      {
        id: "60000000-0000-4000-8000-000000000099",
        company_id: null,
        name: "Supino MFIT Exato",
        is_global: true,
      },
      {
        id: preferredId,
        company_id: null,
        name: "Súpino MFIT Exato",
        is_global: true,
      },
    ],
  });

  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.summary.exercise_catalog_ambiguous, 0);
  assert.equal(report.summary.exercise_catalog_alias_matched, 1);
  assert.equal(report.summary.nearest_alias, 0);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 100);
  assert.equal(report.summary.planned, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("an exact-duplicate override fails closed when its target is not one of the duplicates", async () => {
  const input = baseInput();
  input.exerciseAliasPayload = {
    schema_version: 1,
    contains_pii: false,
    aliases: [{
      source_name: "Supino MFIT Exato",
      target_exercise_id: "60000000-0000-4000-8000-000000000096",
      target_name: "Supino MFIT Exato alternativo",
      status: "approved",
      confidence: "high",
      match_scope: "ambiguous_exact_override",
      independent_review_status: "approved",
    }],
  };
  const db = new MemoryDb({
    exercises: [
      {
        id: "60000000-0000-4000-8000-000000000099",
        company_id: null,
        name: "Supino MFIT Exato",
        is_global: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000097",
        company_id: null,
        name: "Supino MFIT Exato",
        is_global: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000096",
        company_id: null,
        name: "Supino MFIT Exato alternativo",
        is_global: true,
      },
    ],
  });

  const report = await runMigration({ ...input, db, today: "2026-08-10" });

  assert.equal(report.summary.exercise_catalog_invalid_aliases, 1);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 0);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "exercise_alias_invalid");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("apply rechecks the live student status immediately before writing", async () => {
  const input = baseInput();
  const db = new MemoryDb({
    students: [{ id: IDS.studentPhone, company_id: IDS.company, status: "inactive" }],
  });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "student_no_longer_active");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("apply rechecks live student and enrollment company ownership", async () => {
  const input = baseInput();
  const db = new MemoryDb({
    students: [{
      id: IDS.studentPhone,
      company_id: "10000000-0000-4000-8000-000000000999",
      status: "active",
    }],
  });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "live_student_company_mismatch");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("apply blocks an enrollment that became inactive before writing", async () => {
  const input = baseInput();
  const db = new MemoryDb({
    enrollmentsAfterFirstRead: [{
      id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      status: "inactive",
      created_at: "2026-08-01T00:00:00Z",
    }],
  });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "enrollment_no_longer_active");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("apply blocks an enrollment transferred to another company before writing", async () => {
  const input = baseInput();
  const db = new MemoryDb({
    enrollmentsAfterFirstRead: [{
      id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: "10000000-0000-4000-8000-000000000999",
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
    }],
  });
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "live_enrollment_company_mismatch");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("apply is append-only and a second identical run is a no-op", async () => {
  const input = baseInput();
  const db = new MemoryDb();

  const first = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(first.summary.imported, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 1, workouts: 1, workoutExercises: 1 });
  assert.equal(db.exercises[0].name, "Supino MFIT Exato");
  assert.equal(db.exercises[0].is_global, true);
  assert.ok(db.workouts[0].notes.startsWith(MARKER_PREFIX));
  assert.equal(db.workouts[0].exercises[0].video_url, "https://media.example/supino");
  assert.equal(db.workouts[0].exercises[0].thumbnail_url, "https://media.example/supino-thumb");
  assert.equal(db.workoutExercises.length, db.workouts[0].exercises.length);

  const writesAfterFirst = structuredClone(db.writes);
  const second = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(second.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterFirst);
  assert.equal(db.cycles.length, 1);
  assert.equal(db.workouts.length, 1);
  assert.equal(db.exercises.length, 2);
});

test("reparented marker workouts remain idempotent when IDs were generated from the old cycle", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const writesAfterFirst = structuredClone(db.writes);
  const oldCycle = structuredClone(db.cycles[0]);
  const canonicalCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000071",
    cycle_number: oldCycle.cycle_number + 1,
    name: "Ciclo canonico ativo",
  };
  db.cycles.push(canonicalCycle);
  for (const workout of db.workouts) {
    workout.cycle_id = canonicalCycle.id;
  }

  const repeated = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(repeated.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterFirst);
  assert.equal(db.workouts.length, 1);
  assert.equal(db.workouts[0].cycle_id, canonicalCycle.id);
  assert.ok(db.workouts[0].notes.startsWith(MARKER_PREFIX));
  assert.equal(db.workoutExercises[0].workout_id, db.workouts[0].id);
});

test("reparented marker workouts repair a missing normalized mirror with preserved real workout IDs", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const oldCycle = structuredClone(db.cycles[0]);
  const canonicalCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000074",
    cycle_number: oldCycle.cycle_number + 1,
  };
  db.cycles.push(canonicalCycle);
  for (const workout of db.workouts) {
    workout.cycle_id = canonicalCycle.id;
  }
  const preservedWorkoutId = db.workouts[0].id;
  db.workoutExercises = [];
  const writesBeforeRepair = structuredClone(db.writes);

  const repair = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(repair.summary.normalized_repaired, 1);
  assert.equal(repair.summary.already_imported || 0, 0);
  assert.equal(db.writes.workoutExercises, writesBeforeRepair.workoutExercises + 1);
  assert.equal(db.writes.cycles, writesBeforeRepair.cycles);
  assert.equal(db.writes.workouts, writesBeforeRepair.workouts);
  assert.equal(db.workoutExercises[0].workout_id, preservedWorkoutId);
  assert.equal(db.workoutExercises[0].id, deterministicUuid(IMPORT_VERSION, "workout-exercise", preservedWorkoutId, 0));
});

test("reparented marker workouts still block on a separate materialized overlap", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const oldCycle = structuredClone(db.cycles[0]);
  const canonicalCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000075",
    cycle_number: oldCycle.cycle_number + 1,
  };
  const overlappingCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000076",
    cycle_number: oldCycle.cycle_number + 2,
  };
  db.cycles.push(canonicalCycle, overlappingCycle);
  for (const workout of db.workouts) {
    workout.cycle_id = canonicalCycle.id;
  }
  db.workouts.push({
    id: "50000000-0000-4000-8000-000000000076",
    cycle_id: overlappingCycle.id,
    company_id: IDS.company,
    notes: "manual SETT workout",
    exercises: [{ exercise_name: "Treino existente" }],
  });
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[0].reason, "overlapping_cycle_with_workouts");
  assert.deepEqual(db.writes, writesBeforeRetry);
});

test("reparented marker workouts reserve their range before another same-batch reparented marker", async () => {
  const firstInput = baseInput();
  firstInput.mfitWorkoutsPayload.clients[0].fichas[0].id = "plan-active-a";
  const secondInput = baseInput();
  secondInput.mfitWorkoutsPayload.clients[0].fichas[0] = {
    ...secondInput.mfitWorkoutsPayload.clients[0].fichas[0],
    id: "plan-active-b",
    name: "Forca MFIT",
    workouts: [{
      ...secondInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0],
      id: "session-b",
      name: "Treino B",
    }],
  };
  const firstDb = new MemoryDb();
  const secondDb = new MemoryDb();
  await runMigration({ ...firstInput, db: firstDb, apply: true, today: "2026-08-10" });
  await runMigration({ ...secondInput, db: secondDb, apply: true, today: "2026-08-10" });
  const canonicalCycle = {
    ...firstDb.cycles[0],
    id: "40000000-0000-4000-8000-000000000078",
    cycle_number: 3,
  };
  const db = new MemoryDb({
    cycles: [
      firstDb.cycles[0],
      secondDb.cycles[0],
      canonicalCycle,
    ],
    workouts: [
      { ...firstDb.workouts[0], cycle_id: canonicalCycle.id },
      { ...secondDb.workouts[0], cycle_id: canonicalCycle.id },
    ],
    workoutExercises: [
      ...firstDb.workoutExercises,
      ...secondDb.workoutExercises,
    ],
  });
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas = [
    firstInput.mfitWorkoutsPayload.clients[0].fichas[0],
    secondInput.mfitWorkoutsPayload.clients[0].fichas[0],
  ];
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(retry.summary.already_imported, 1);
  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[1].reason, "overlapping_plan_in_same_import");
  assert.deepEqual(db.writes, writesBeforeRetry);
});

test("reparented marker workouts block when the preserved marker hides divergent workout content", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const oldCycle = structuredClone(db.cycles[0]);
  const canonicalCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000072",
    cycle_number: oldCycle.cycle_number + 1,
  };
  db.cycles.push(canonicalCycle);
  for (const workout of db.workouts) {
    workout.cycle_id = canonicalCycle.id;
  }
  db.workouts[0].title = "Treino divergente com marker preservado";
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[0].reason, "marker_payload_mismatch");
  assert.deepEqual(db.writes, writesBeforeRetry);
});

test("reparented marker workouts fail closed when sort order drifted during reparenting", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const oldCycle = structuredClone(db.cycles[0]);
  const canonicalCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000077",
    cycle_number: oldCycle.cycle_number + 1,
  };
  db.cycles.push(canonicalCycle);
  for (const workout of db.workouts) {
    workout.cycle_id = canonicalCycle.id;
    workout.sort_order += 1;
  }
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[0].reason, "marker_payload_mismatch");
  assert.deepEqual(db.writes, writesBeforeRetry);
});

test("reparented marker workouts block when the normalized mirror diverges", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const oldCycle = structuredClone(db.cycles[0]);
  const canonicalCycle = {
    ...oldCycle,
    id: "40000000-0000-4000-8000-000000000073",
    cycle_number: oldCycle.cycle_number + 1,
  };
  db.cycles.push(canonicalCycle);
  for (const workout of db.workouts) {
    workout.cycle_id = canonicalCycle.id;
  }
  db.workoutExercises[0].reps = "1";
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[0].reason, "normalized_mirror_conflict");
  assert.deepEqual(db.writes, writesBeforeRetry);
});

test("a repeated run repairs only a missing normalized mirror", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const writesAfterCanonicalInsert = structuredClone(db.writes);
  db.workoutExercises = [];

  const repair = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(repair.summary.normalized_repaired, 1);
  assert.equal(db.writes.exercises, writesAfterCanonicalInsert.exercises);
  assert.equal(db.writes.cycles, writesAfterCanonicalInsert.cycles);
  assert.equal(db.writes.workouts, writesAfterCanonicalInsert.workouts);
  assert.equal(db.writes.workoutExercises, writesAfterCanonicalInsert.workoutExercises + 1);
  assert.equal(db.workoutExercises.length, db.workouts[0].exercises.length);
});

test("a repeated run fills a partially missing normalized mirror", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises.push({
    id: "mfit-exercise-2",
    name: "Remada MFIT Exata",
    sets: 3,
    reps: "8-10",
    rest_seconds: 75,
  });
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const writesAfterCanonicalInsert = structuredClone(db.writes);
  db.workoutExercises.pop();

  const repair = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(repair.summary.normalized_repaired, 1);
  assert.equal(db.writes.workoutExercises, writesAfterCanonicalInsert.workoutExercises + 1);
  assert.equal(db.workoutExercises.length, 2);
});

test("a repeated run repairs missing deterministic workouts after a partial failure", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts.push({
    id: "session-b",
    name: "Treino B",
    day_of_week: 3,
    exercises: [{
      id: "mfit-exercise-2",
      name: "Remada MFIT Exata",
      sets: 3,
      reps: "8-10",
      rest_seconds: 75,
    }],
  });
  const db = new MemoryDb();
  await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const removedWorkout = db.workouts.find((workout) => workout.name === "Treino B");
  db.workouts = db.workouts.filter((workout) => workout.id !== removedWorkout.id);
  db.workoutExercises = db.workoutExercises.filter((row) => row.workout_id !== removedWorkout.id);
  const writesAfterPartialState = structuredClone(db.writes);

  const repair = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(repair.summary.partial_repaired, 1);
  assert.equal(db.writes.cycles, writesAfterPartialState.cycles);
  assert.equal(db.writes.exercises, writesAfterPartialState.exercises);
  assert.equal(db.writes.workouts, writesAfterPartialState.workouts + 1);
  assert.equal(db.writes.workoutExercises, writesAfterPartialState.workoutExercises + 1);
  assert.equal(db.workouts.length, 2);
  assert.equal(db.workoutExercises.length, 2);
});

test("normalized-only materialization blocks an overlapping import", async () => {
  const input = baseInput();
  const existingCycleId = "40000000-0000-4000-8000-000000000030";
  const existingWorkoutId = "50000000-0000-4000-8000-000000000030";
  const db = new MemoryDb({
    cycles: [{
      id: existingCycleId,
      enrollment_id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      cycle_number: 1,
      start_date: "2026-08-01",
      end_date: "2026-09-15",
      status: "active",
    }],
    workouts: [{
      id: existingWorkoutId,
      cycle_id: existingCycleId,
      company_id: IDS.company,
      name: "Treino normalizado",
      notes: "manual SETT workout",
      exercises: [],
    }],
    workoutExercises: [{
      id: "70000000-0000-4000-8000-000000000030",
      workout_id: existingWorkoutId,
      exercise_id: "60000000-0000-4000-8000-000000000030",
      exercise_name: "Treino existente",
      exercise_order: 0,
      sets: 3,
      reps: "10",
      rest_seconds: 60,
      notes: null,
    }],
  });

  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "overlapping_cycle_with_workouts");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("normalized-equivalent exercise names reuse one existing library row", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises.push({
    id: "mfit-exercise-alias",
    name: "SÚPINO   MFIT EXATO",
    sets: 3,
    reps: "10-12",
  });
  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.exercises_to_create, 0);
  assert.equal(report.summary.exercise_catalog_coverage_percent, 100);
  assert.equal(db.exercises.length, 2);
  assert.equal(db.workouts[0].exercises[0].exercise_id, db.workouts[0].exercises[1].exercise_id);
});

test("an overlapping materialized SETT cycle blocks import without mutations", async () => {
  const input = baseInput();
  const existingCycleId = "40000000-0000-4000-8000-000000000001";
  const db = new MemoryDb({
    cycles: [{
      id: existingCycleId,
      enrollment_id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      cycle_number: 1,
      start_date: "2026-08-01",
      end_date: "2026-09-15",
      status: "active",
    }],
    workouts: [{
      id: "50000000-0000-4000-8000-000000000001",
      cycle_id: existingCycleId,
      company_id: IDS.company,
      notes: "manual SETT workout",
      exercises: [{ exercise_name: "Treino existente" }],
    }],
  });

  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "overlapping_cycle_with_workouts");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
  assert.equal(db.workouts[0].exercises[0].exercise_name, "Treino existente");
});

test("CLI keeps pending-overlap cycle creation available for diagnosis but freezes apply", () => {
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
  ]).createPendingCycleOnOverlap, false);
  assert.equal(parseArgs([
    "--sett-students=a",
    "--mfit-clients=b",
    "--mfit-workouts=c",
    `--company-id=${IDS.company}`,
    "--create-pending-cycle-on-overlap",
  ]).createPendingCycleOnOverlap, true);
  assert.throws(
    () => parseArgs([
      "--apply",
      `--confirm-project=${EXPECTED_SUPABASE_PROJECT_REF}`,
      "--sett-students=a",
      "--mfit-clients=b",
      "--mfit-workouts=c",
      `--company-id=${IDS.company}`,
      "--create-pending-cycle-on-overlap",
      "--include-plan-ref=0123456789ab",
    ]),
    /temporarily disabled for apply/,
  );
});

test("explicit pending-overlap mode appends a deterministic pending cycle and preserves the active overlap", async () => {
  const input = baseInput();
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000061",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const activeWorkout = {
    id: "50000000-0000-4000-8000-000000000061",
    cycle_id: activeCycle.id,
    company_id: IDS.company,
    notes: "manual SETT workout",
    exercises: [{ exercise_name: "Treino existente" }],
  };
  const db = new MemoryDb({ cycles: [activeCycle], workouts: [activeWorkout] });
  const defaultRun = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  const requestedRef = defaultRun.results[0].ref;
  assert.equal(defaultRun.results[0].reason, "overlapping_cycle_with_workouts");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });

  const first = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createPendingCycleOnOverlap: true,
    includePlanRefs: [requestedRef],
  });

  assert.equal(first.summary.imported, 1);
  assert.equal(first.summary.pending_overlap_cycles_created, 1);
  assert.equal(first.results[0].overlap_import_mode, "created_pending_cycle_on_overlap");
  assert.equal(db.writes.cycles, 1);
  assert.equal(db.writes.workouts, 1);
  assert.equal(db.writes.workoutExercises, 1);
  assert.deepEqual(db.cycles[0], activeCycle);
  assert.deepEqual(db.workouts[0], activeWorkout);
  const pendingCycle = db.cycles.find((row) => row.id !== activeCycle.id);
  assert.equal(pendingCycle.status, "pending");
  assert.equal(pendingCycle.enrollment_id, IDS.enrollment);
  assert.equal(pendingCycle.company_id, IDS.company);
  assert.equal(db.workouts[1].cycle_id, pendingCycle.id);
  assert.ok(db.workouts[1].notes.startsWith(MARKER_PREFIX));

  const writesAfterFirst = structuredClone(db.writes);
  const second = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createPendingCycleOnOverlap: true,
    includePlanRefs: [requestedRef],
  });
  assert.equal(second.summary.already_imported, 1);
  assert.equal(second.results[0].overlap_import_mode, "created_pending_cycle_on_overlap");
  assert.deepEqual(db.writes, writesAfterFirst);
  assert.equal(db.cycles.filter((row) => row.status === "active").length, 1);
});

test("pending-overlap mode fails closed when live overlap disappears before apply", async () => {
  const input = baseInput();
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000062",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const db = new CyclesChangedBeforeApplyDb({
    cycles: [activeCycle],
    cyclesAfterFirstRead: [],
    workouts: [{
      id: "50000000-0000-4000-8000-000000000062",
      cycle_id: activeCycle.id,
      company_id: IDS.company,
      notes: "manual SETT workout",
      exercises: [{ exercise_name: "Treino existente" }],
    }],
  });
  const dryRun = await runMigration({
    ...input,
    db: new MemoryDb({
      cycles: [activeCycle],
      workouts: [{
        id: "50000000-0000-4000-8000-000000000062",
        cycle_id: activeCycle.id,
        company_id: IDS.company,
        notes: "manual SETT workout",
        exercises: [{ exercise_name: "Treino existente" }],
      }],
    }),
    today: "2026-08-10",
  });
  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createPendingCycleOnOverlap: true,
    includePlanRefs: [dryRun.results[0].ref],
  });
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "pending_overlap_changed_before_apply");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("pending-overlap drift blocks before creating projected exercise targets", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0].exercises[0].name = "Alvo pendente inexistente";
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000065",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const activeWorkout = {
    id: "50000000-0000-4000-8000-000000000065",
    cycle_id: activeCycle.id,
    company_id: IDS.company,
    notes: "manual SETT workout",
    exercises: [{ exercise_name: "Treino existente" }],
  };
  const preflight = await runMigration({
    ...input,
    db: new MemoryDb({ cycles: [activeCycle], workouts: [activeWorkout] }),
    today: "2026-08-10",
    createMissingExerciseTargets: true,
    createPendingCycleOnOverlap: true,
  });
  const db = new CyclesChangedBeforeApplyDb({
    cycles: [activeCycle],
    cyclesAfterFirstRead: [],
    workouts: [activeWorkout],
  });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createMissingExerciseTargets: true,
    createPendingCycleOnOverlap: true,
    includePlanRefs: [preflight.results.find((row) => row.status === "planned").ref],
  });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results.find((row) => row.status === "blocked").reason, "pending_overlap_changed_before_apply");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("pending-overlap mode fails closed when normalized-only overlap payload changes before apply", async () => {
  const input = baseInput();
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000064",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const activeWorkout = {
    id: "50000000-0000-4000-8000-000000000064",
    cycle_id: activeCycle.id,
    company_id: IDS.company,
    notes: "manual normalized-only workout",
    exercises: [],
  };
  const normalized = {
    id: "70000000-0000-4000-8000-000000000064",
    workout_id: activeWorkout.id,
    exercise_id: "60000000-0000-4000-8000-000000000099",
    exercise_name: "Supino MFIT Exato",
    exercise_order: 0,
    sets: 3,
    reps: "10",
    rest_seconds: 60,
    notes: "original",
  };
  const db = new NormalizedOverlapChangedBeforeApplyDb({
    cycles: [activeCycle],
    workouts: [activeWorkout],
    workoutExercises: [normalized],
    normalizedAfterFirstRead: [{ ...normalized, reps: "20" }],
  });
  const defaultRun = await runMigration({ ...input, db: new MemoryDb({ cycles: [activeCycle], workouts: [activeWorkout], workoutExercises: [normalized] }), today: "2026-08-10" });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createPendingCycleOnOverlap: true,
    includePlanRefs: [defaultRun.results[0].ref],
  });

  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "pending_overlap_changed_before_apply");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("pending-overlap mode blocks deterministic payload divergence without mutating overlap rows", async () => {
  const input = baseInput();
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000063",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const activeWorkout = {
    id: "50000000-0000-4000-8000-000000000063",
    cycle_id: activeCycle.id,
    company_id: IDS.company,
    notes: "manual SETT workout",
    exercises: [{ exercise_name: "Treino existente" }],
  };
  const db = new MemoryDb({ cycles: [activeCycle], workouts: [activeWorkout] });
  const dryRun = await runMigration({ ...input, db, today: "2026-08-10" });
  await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createPendingCycleOnOverlap: true,
    includePlanRefs: [dryRun.results[0].ref],
  });
  const imported = db.workouts.find((row) => row.notes?.startsWith(MARKER_PREFIX));
  imported.title = "payload divergente";
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    createPendingCycleOnOverlap: true,
    includePlanRefs: [dryRun.results[0].ref],
  });

  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[0].reason, "cycle_contains_different_workouts");
  assert.deepEqual(db.writes, writesBeforeRetry);
  assert.deepEqual(db.cycles[0], activeCycle);
  assert.deepEqual(db.workouts[0], activeWorkout);
});

test("explicit overlap merge appends deterministic workouts to one covering active cycle", async () => {
  const input = baseInput();
  const existingCycle = {
    id: "40000000-0000-4000-8000-000000000001",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const existingWorkout = {
    id: "50000000-0000-4000-8000-000000000001",
    cycle_id: existingCycle.id,
    company_id: IDS.company,
    notes: "manual SETT workout",
    sort_order: 4,
    exercises: [{ exercise_name: "Treino existente" }],
  };
  const db = new MemoryDb({ cycles: [existingCycle], workouts: [existingWorkout] });

  const first = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });

  assert.equal(first.summary.imported, 1);
  assert.equal(db.writes.cycles, 0);
  assert.equal(db.writes.workouts, 1);
  assert.equal(db.cycles.length, 1);
  assert.deepEqual(db.cycles[0], existingCycle);
  assert.deepEqual(db.workouts[0], existingWorkout);
  assert.equal(db.workouts[1].cycle_id, existingCycle.id);
  assert.equal(db.workouts[1].sort_order, 5);

  const writesAfterFirst = structuredClone(db.writes);
  const second = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  assert.equal(second.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterFirst);
});

test("overlap merge keeps an earlier marker idempotent after another plan is appended", async () => {
  const firstInput = baseInput();
  const secondInput = baseInput();
  secondInput.mfitWorkoutsPayload.clients[0].fichas[0] = {
    ...secondInput.mfitWorkoutsPayload.clients[0].fichas[0],
    id: "plan-active-2",
    name: "Força MFIT",
    workouts: [{
      ...secondInput.mfitWorkoutsPayload.clients[0].fichas[0].workouts[0],
      id: "session-b",
      name: "Treino B",
    }],
  };
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000051",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const db = new MemoryDb({
    cycles: [activeCycle],
    workouts: [{
      id: "50000000-0000-4000-8000-000000000051",
      cycle_id: activeCycle.id,
      company_id: IDS.company,
      notes: "manual SETT workout",
      sort_order: 4,
      exercises: [{ exercise_name: "Treino existente" }],
    }],
  });

  const first = await runMigration({
    ...firstInput,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  const second = await runMigration({
    ...secondInput,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  assert.equal(first.summary.imported, 1);
  assert.equal(second.summary.imported, 1);
  const writesAfterBoth = structuredClone(db.writes);

  const repeatedFirst = await runMigration({
    ...firstInput,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  assert.equal(repeatedFirst.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterBoth);
});

test("overlap merge blocks unless exactly one active cycle covers the reference date", async () => {
  const input = baseInput();
  const cycle = (id, status) => ({
    id,
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: Number(id.slice(-1)) || 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status,
  });
  const workout = (id, cycleId) => ({
    id,
    cycle_id: cycleId,
    company_id: IDS.company,
    notes: "manual SETT workout",
    exercises: [{ exercise_name: "Treino existente" }],
  });

  for (const db of [
    new MemoryDb({
      cycles: [cycle("40000000-0000-4000-8000-000000000041", "completed")],
      workouts: [workout("50000000-0000-4000-8000-000000000041", "40000000-0000-4000-8000-000000000041")],
    }),
    new MemoryDb({
      cycles: [
        cycle("40000000-0000-4000-8000-000000000041", "active"),
        cycle("40000000-0000-4000-8000-000000000042", "active"),
      ],
      workouts: [
        workout("50000000-0000-4000-8000-000000000041", "40000000-0000-4000-8000-000000000041"),
        workout("50000000-0000-4000-8000-000000000042", "40000000-0000-4000-8000-000000000042"),
      ],
    }),
  ]) {
    const report = await runMigration({
      ...input,
      db,
      apply: true,
      today: "2026-08-10",
      mergeOverlapIntoActiveCycle: true,
    });
    assert.equal(report.summary.blocked, 1);
    assert.equal(report.results[0].reason, "merge_overlap_active_cycle_not_unique_or_not_covering");
    assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
  }
});

test("overlap merge blocks deterministic workout payload divergence without touching existing rows", async () => {
  const input = baseInput();
  const cycle = {
    id: "40000000-0000-4000-8000-000000000043",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const db = new MemoryDb({
    cycles: [cycle],
    workouts: [{
      id: "50000000-0000-4000-8000-000000000043",
      cycle_id: cycle.id,
      company_id: IDS.company,
      notes: "manual SETT workout",
      sort_order: 1,
      exercises: [{ exercise_name: "Treino existente" }],
    }],
  });
  await runMigration({ ...input, db, apply: true, today: "2026-08-10", mergeOverlapIntoActiveCycle: true });
  const imported = db.workouts.find((row) => row.notes?.startsWith("mfit-import:v1:"));
  imported.title = "Conteúdo divergente";
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  assert.equal(retry.summary.blocked, 1);
  assert.equal(retry.results[0].reason, "cycle_contains_different_workouts");
  assert.deepEqual(db.writes, writesBeforeRetry);
});

test("overlap merge partial retry appends only the missing deterministic workout", async () => {
  const input = baseInput();
  input.mfitWorkoutsPayload.clients[0].fichas[0].workouts.push({
    id: "session-b",
    name: "Treino B",
    day_of_week: 3,
    exercises: [{
      id: "mfit-exercise-2",
      name: "Remada MFIT Exata",
      sets: 3,
      reps: "8-10",
      rest_seconds: 75,
    }],
  });
  const cycle = {
    id: "40000000-0000-4000-8000-000000000044",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const manualWorkout = {
    id: "50000000-0000-4000-8000-000000000044",
    cycle_id: cycle.id,
    company_id: IDS.company,
    notes: "manual SETT workout",
    sort_order: 4,
    exercises: [{ exercise_name: "Treino existente" }],
  };
  const db = new MemoryDb({ cycles: [cycle], workouts: [manualWorkout] });
  await runMigration({ ...input, db, apply: true, today: "2026-08-10", mergeOverlapIntoActiveCycle: true });
  const removed = db.workouts.find((row) => row.name === "Treino B");
  db.workouts = db.workouts.filter((row) => row.id !== removed.id);
  db.workoutExercises = db.workoutExercises.filter((row) => row.workout_id !== removed.id);
  const writesBeforeRetry = structuredClone(db.writes);

  const retry = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  assert.equal(retry.summary.partial_repaired, 1);
  assert.equal(db.writes.cycles, writesBeforeRetry.cycles);
  assert.equal(db.writes.workouts, writesBeforeRetry.workouts + 1);
  assert.equal(db.writes.workoutExercises, writesBeforeRetry.workoutExercises + 1);
  assert.deepEqual(db.cycles[0], cycle);
  assert.deepEqual(db.workouts[0], manualWorkout);
  assert.deepEqual(
    db.workouts.filter((row) => row.notes?.startsWith("mfit-import:v1:")).map((row) => row.sort_order),
    [5, 6],
  );
});

test("overlap merge fails closed when the active target changes before apply", async () => {
  const input = baseInput();
  const activeCycle = {
    id: "40000000-0000-4000-8000-000000000045",
    enrollment_id: IDS.enrollment,
    student_id: IDS.studentPhone,
    company_id: IDS.company,
    cycle_number: 1,
    start_date: "2026-08-01",
    end_date: "2026-09-20",
    status: "active",
  };
  const db = new CyclesChangedBeforeApplyDb({
    cycles: [activeCycle],
    cyclesAfterFirstRead: [{ ...activeCycle, status: "completed" }],
    workouts: [{
      id: "50000000-0000-4000-8000-000000000045",
      cycle_id: activeCycle.id,
      company_id: IDS.company,
      notes: "manual SETT workout",
      exercises: [{ exercise_name: "Treino existente" }],
    }],
  });

  const report = await runMigration({
    ...input,
    db,
    apply: true,
    today: "2026-08-10",
    mergeOverlapIntoActiveCycle: true,
  });
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.results[0].reason, "merge_overlap_active_cycle_changed_before_apply");
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });
});

test("MFIT native exercise groups preserve protocol, media and bi-sets", () => {
  const plans = normalizeMfitPlans({
    clients: [{
      id: "mfit-client-native",
      fichas: [{
        id: "plan-native",
        status: "active",
        name: "Native",
        workouts: [{
          id: "session-native",
          client_id: "mfit-client-native",
          nome: "Treino Native",
          exercs: [
            {
              id: "ordinary",
              type: 0,
              order: 1,
              exercises: [{
                id: "exercise-1",
                name: "Mobilidade",
                urlMedia: "https://media.example/video",
                urlPoster: "https://media.example/thumb",
                series: [{ tipo: 0, repeticao: "2 x 10", intervalSeconds: 30, cadencia: "3-1-1-0", obs: "Controle" }],
              }],
            },
            {
              id: "combo",
              type: 1,
              order: 2,
              exercises: [{
                id: "combo-row",
                series: [
                  { tipo: 6, exercicio: { id: "exercise-2", name: "Remada" } },
                  { tipo: 0, repeticao: "3 x 12", intervalText: "45s", cadencia: "2-0-2-0", obs: "Escápulas" },
                  { tipo: 6, exercicio: { id: "exercise-3", name: "Supino" } },
                  { tipo: 0, repeticao: "3 x 10", intervalSeconds: 45 },
                ],
              }],
            },
          ],
        }],
      }],
    }],
  });

  const session = plans[0].sessions[0];
  assert.equal(session.exercises.length, 3);
  assert.deepEqual(
    {
      sets: session.exercises[0].sets,
      reps: session.exercises[0].reps,
      rest: session.exercises[0].rest,
      tempo: session.exercises[0].tempo,
    },
    { sets: "2", reps: "10", rest: "30s", tempo: "3-1-1-0" },
  );
  assert.equal(session.exercises[0].video_url, "https://media.example/video");
  assert.equal(session.exercises[0].thumbnail_url, "https://media.example/thumb");
  assert.equal(session.exercises[1].method, "biset");
  assert.equal(session.exercises[2].method, "biset");
  assert.equal(session.exercises[1].group_id, session.exercises[2].group_id);
  assert.equal(session.exercises[1].reps, "12");
  assert.equal(session.exercises[2].rest, "45s");
});

test("MFIT mounted exercise objects preserve insertion order, combinations and alternatives", () => {
  const plans = normalizeMfitPlans({
    plans: [{
      id: "plan-mounted",
      client_id: "mfit-client-mounted",
      active: true,
      source_capture_complete: true,
      workouts: [{
        id: "session-mounted",
        exerciciosMontados: {
          first: [{ id: "ordinary", name: "Mobilidade", isCombinado: false, series: [{ tipo: 0, repeticao: "2 x 10" }] }],
          second: [
            { id: "combo-a", name: "Remada", isCombinado: "true", series: [{ tipo: 0, repeticao: "3 x 12" }] },
            { id: "combo-b", name: "Supino", isCombinado: "true", series: [{ tipo: 0, repeticao: "3 x 10" }] },
          ],
          third: [
            { id: "primary", name: "Leg press", isCombinado: false, series: [{ tipo: 0, repeticao: "3 x 10" }] },
            { id: "alternative", name: "Agachamento guiado", isCombinado: false, series: [{ tipo: 0, repeticao: "3 x 10" }] },
          ],
          fourth: [
            { id: "combo-number-a", name: "Rosca", isCombinado: 1, series: [{ tipo: 0, repeticao: "3 x 12" }] },
            { id: "combo-number-b", name: "Tríceps", isCombinado: 1, series: [{ tipo: 0, repeticao: "3 x 12" }] },
          ],
        },
      }],
    }],
  });

  assert.equal(plans.length, 1);
  const exercises = plans[0].sessions[0].exercises;
  assert.deepEqual(
    exercises.map((exercise) => exercise.name),
    ["Mobilidade", "Remada", "Supino", "Leg press", "Rosca", "Tríceps"],
  );
  assert.equal(exercises[1].method, "biset");
  assert.equal(exercises[2].method, "biset");
  assert.equal(exercises[1].group_id, exercises[2].group_id);
  assert.match(exercises[3].notes, /Alternativas MFIT: Agachamento guiado/);
  assert.equal(exercises[4].method, "biset");
  assert.equal(exercises[5].method, "biset");
  assert.equal(exercises[4].group_id, exercises[5].group_id);
});

test("MFIT alternatives retain the primary exercise and a review note", () => {
  const plans = normalizeMfitPlans({
    clients: [{
      id: "mfit-client-alternative",
      fichas: [{
        id: "plan-alternative",
        status: "active",
        workouts: [{
          id: "session-alternative",
          exercs: [{
            type: 2,
            exercises: [
              { id: "primary", name: "Leg press", series: [{ tipo: 0, repeticao: "3 x 10" }] },
              { id: "alternative", name: "Agachamento guiado", series: [{ tipo: 0, repeticao: "3 x 10" }] },
            ],
          }],
        }],
      }],
    }],
  });

  const exercises = plans[0].sessions[0].exercises;
  assert.equal(exercises.length, 1);
  assert.equal(exercises[0].name, "Leg press");
  assert.match(exercises[0].notes, /Alternativas MFIT: Agachamento guiado/);
});

test("versioned exact-duplicate overrides stay explicit, reviewed and traceable", async () => {
  const aliasPath = new URL("../docs/project/mfit-exercise-aliases.v1.json", import.meta.url);
  const evidencePath = new URL("../docs/project/mfit-exact-duplicate-evidence.v1.json", import.meta.url);
  const queuePath = new URL("../docs/project/mfit-medium-evidence-queue.v1.json", import.meta.url);
  const [aliasText, evidenceText, queueText] = await Promise.all([
    readFile(aliasPath, "utf8"),
    readFile(evidencePath, "utf8"),
    readFile(queuePath, "utf8"),
  ]);
  const aliasPayload = JSON.parse(aliasText);
  const evidencePayload = JSON.parse(evidenceText);
  const queuePayload = JSON.parse(queueText);
  const aliasIndex = buildExerciseAliasIndex(aliasPayload);

  assert.equal(aliasPayload.summary.approved_aliases, 77);
  assert.equal(aliasPayload.summary.runtime_false_medium, 21);
  assert.equal(aliasPayload.summary.blocked_after_visual_review, 21);
  assert.equal(aliasPayload.summary.approved_pending_materialization, 0);
  assert.equal(aliasPayload.summary.pending_medium, 0);
  assert.equal(aliasPayload.summary.never_reviewed_medium, 0);
  assert.equal(aliasPayload.summary.blocked_ambiguous_exact, 0);
  assert.equal(aliasPayload.summary.unresolved_total, 109);
  assert.deepEqual(aliasPayload.review_queue.ambiguous_exact, []);
  assert.deepEqual(aliasPayload.review_queue.medium, []);
  assert.deepEqual(aliasPayload.review_queue.approved_pending_materialization, []);

  const blockedVisualQueue = queuePayload.items.filter(
    (row) => row.decision_status === "blocked_after_visual_review",
  );
  const approvedPendingQueue = queuePayload.items.filter(
    (row) => row.decision_status === "approved_pending_materialization",
  );
  assert.equal(queuePayload.summary.runtime_false_medium, 21);
  assert.equal(queuePayload.summary.blocked_after_visual_review, 21);
  assert.equal(queuePayload.summary.approved_pending_materialization, 0);
  assert.equal(queuePayload.summary.never_reviewed_medium, 0);
  assert.equal(blockedVisualQueue.length, 21);
  assert.equal(approvedPendingQueue.length, 0);
  assert.ok(blockedVisualQueue.every((row) => row.runtime_eligible === false));

  const afundoConflict = aliasPayload.aliases.find((row) => row.source_name === "Afundo Alternado no Smith");
  assert.equal(afundoConflict?.status, "blocked_after_visual_review");
  assert.equal(afundoConflict?.runtime_eligible, false);
  assert.equal(afundoConflict?.conflict_status, "blocked_conflict");

  for (const sourceName of ["Levantamento Terra", "Agachamento Bulgaro"]) {
    const alias = aliasIndex.get(sourceName.toLocaleLowerCase("pt-BR"));
    assert.equal(alias.match_scope, "ambiguous_exact_override");
    const evidence = evidencePayload.resolutions.find((row) => row.source_name === sourceName);
    assert.equal(evidence?.status, "approved_by_independent_review");
  }

  const unilateralBridge = aliasIndex.get("elevacao de quadril unilateral");
  assert.equal(unilateralBridge?.target_exercise_id, "a21397db-be10-492f-9e1b-42994ac9d79f");
  const unilateralEvidence = queuePayload.items.find((row) => row.source_name === "Elevação de Quadril Unilateral");
  assert.equal(unilateralEvidence?.decision_status, "approved_after_visual_review");
  assert.equal(unilateralEvidence?.independent_review_status, "approved");
  assert.match(unilateralEvidence?.mfit_media_evidence?.video_url || "", /^https:\/\//);

  const seatedHipAbduction = aliasIndex.get("abducao de quadril maquina");
  assert.equal(seatedHipAbduction?.target_exercise_id, "8d9c8d95-ca83-4b41-aece-ded54f6711c7");
  const seatedHipAbductionAlias = aliasPayload.aliases.find(
    (row) => row.source_name === "Abdução de Quadril Máquina",
  );
  assert.equal(seatedHipAbductionAlias?.independent_review_status, "approved");
  const seatedHipAbductionEvidence = queuePayload.items.find(
    (row) => row.source_name === "Abdução de Quadril Máquina",
  );
  assert.equal(seatedHipAbductionEvidence?.decision_status, "approved_after_visual_review");
  assert.equal(seatedHipAbductionEvidence?.independent_review_status, "approved");
  assert.equal(seatedHipAbductionEvidence?.runtime_eligible, true);

  const visuallyApprovedAliases = [
    {
      sourceName: "Abdução de Quadril Unilateral com Caneleira",
      normalizedSource: "abducao de quadril unilateral com caneleira",
      targetExerciseId: "e789f3da-6de9-4be5-b039-adfb38f8a955",
      targetName: "Abdução de Quadril com Caneleira",
      mediaId: "25",
    },
    {
      sourceName: "Puxada Aberta Barra reta",
      normalizedSource: "puxada aberta barra reta",
      targetExerciseId: "f0d967d8-ff18-4881-8c28-aca104bf5ac6",
      targetName: "Puxada Pronada Polia",
      mediaId: "565",
    },
    {
      sourceName: "Remada Baixa Triangulo",
      normalizedSource: "remada baixa triangulo",
      targetExerciseId: "0db0d50d-5d72-4ade-97f2-3ec1c64218d8",
      targetName: "Remada Baixa Neutra",
      mediaId: "576",
    },
    {
      sourceName: "Pulldown Barra Reta",
      normalizedSource: "pulldown barra reta",
      targetExerciseId: "afbe8bbe-2cf2-4404-a609-7c9647ec3eeb",
      targetName: "Pulldown barra",
      mediaId: "1104",
    },
    {
      sourceName: "Face Pull",
      normalizedSource: "face pull",
      targetExerciseId: "c5888208-17b3-4b1a-9b20-6b1214c89b6d",
      targetName: "Face Pull Corda",
      mediaId: "1110",
    },
    {
      sourceName: "Tríceps na Polia com Barra Reta",
      normalizedSource: "triceps na polia com barra reta",
      targetExerciseId: "d06f7cc9-380d-4fb1-9b60-5bd92a25dc22",
      targetName: "Tríceps Polia Barra",
      mediaId: "415",
    },
    {
      sourceName: "Flexão de Braços com Apoio",
      normalizedSource: "flexao de bracos com apoio",
      targetExerciseId: "be707dcf-d4cc-4788-8d23-551f5730e971",
      targetName: "Flexão Aberta com Apoio do Joelho",
      mediaId: "239",
    },
    {
      sourceName: "Crucifixo Inverso com Halteres",
      normalizedSource: "crucifixo inverso com halteres",
      targetExerciseId: "cad889ac-c8da-4654-b27a-41555e10f212",
      targetName: "Crucifixo Invertido Curvado",
      mediaId: "215",
    },
    {
      sourceName: "Ativação de Glúteo com Elevação Pélvica",
      normalizedSource: "ativacao de gluteo com elevacao pelvica",
      targetExerciseId: "a5d763eb-d779-49bc-acd4-665438ab4e01",
      targetName: "Ponte de glúteo",
      mediaId: "1065",
    },
    {
      sourceName: "Deslocamento Lateral com Elástico",
      normalizedSource: "deslocamento lateral com elastico",
      targetExerciseId: "e6a748f5-2993-4f31-9e58-cb68e6ed8381",
      targetName: "Caminhada lateral com mini band",
      mediaId: "1085",
    },
    {
      sourceName: "Tríceps Testa Barra Reta",
      normalizedSource: "triceps testa barra reta",
      targetExerciseId: "043b569d-b13d-4ff7-9d4e-a552ff9d85ef",
      targetName: "Tríceps Testa Barra Banco Reto",
      mediaId: "558",
    },
    {
      sourceName: "Tríceps Testa com Halteres",
      normalizedSource: "triceps testa com halteres",
      targetExerciseId: "883f77a1-c25f-4626-aed5-9d18c8955508",
      targetName: "Tríceps Testa Halteres Banco Reto",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Agachamento Lateral Alternado",
      normalizedSource: "agachamento lateral alternado",
      targetExerciseId: "2e04727d-35b1-4053-8733-ed0cec7da94f",
      targetName: "Cossack squat",
      mediaId: "49",
    },
    {
      sourceName: "Remada Máquina (Pegada Neutra)",
      normalizedSource: "remada maquina (pegada neutra)",
      targetExerciseId: "f0705159-aa86-407c-a27e-170374012831",
      targetName: "Remada Cavalinho Máquina Neutra",
      mediaId: "540",
    },
    {
      sourceName: "Abdução de Quadril em Pé com Caneleira",
      normalizedSource: "abducao de quadril em pe com caneleira",
      targetExerciseId: "e789f3da-6de9-4be5-b039-adfb38f8a955",
      targetName: "Abdução de Quadril com Caneleira",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Abdução de Quadril na Polia Baixa Unilateral",
      normalizedSource: "abducao de quadril na polia baixa unilateral",
      targetExerciseId: "fb5c8403-d675-4928-8d39-cec23fc7054b",
      targetName: "Abdução de Quadril Polia",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Crucifixo com Halteres",
      normalizedSource: "crucifixo com halteres",
      targetExerciseId: "430e38a3-2815-45b1-af80-712184dd17c2",
      targetName: "Crucifixo Reto Halteres",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Puxada Articulada Aberta",
      normalizedSource: "puxada articulada aberta",
      targetExerciseId: "592cf519-f2f5-4f82-9d10-8c2005851cbb",
      targetName: "Puxada Pronada Máquina",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Remada Curvada com Barra Reta (Pegada Pronada)",
      normalizedSource: "remada curvada com barra reta (pegada pronada)",
      targetExerciseId: "8fb786df-8ccc-4223-bbea-5fec0fb06c49",
      targetName: "Remada Curvada Pronada Barra",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Remada Curvada com Barra Reta (Pegada Supinada)",
      normalizedSource: "remada curvada com barra reta (pegada supinada)",
      targetExerciseId: "15e3ad55-f384-4e29-be43-b63cb85a9a5c",
      targetName: "Remada Curvada Supinada Barra",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Rosca direta Banco Inclinado",
      normalizedSource: "rosca direta banco inclinado",
      targetExerciseId: "867a6df5-d665-43ac-b297-d46c2b667741",
      targetName: "Rosca Banco 45",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Abdominal Infra com as Pernas Estendidas",
      normalizedSource: "abdominal infra com as pernas estendidas",
      targetExerciseId: "2b6e19be-6b4d-44d6-af4b-04f7a09bef60",
      targetName: "Abdominal Infra Solo",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Remada Alta na Polia Baixa com Barra Reta",
      normalizedSource: "remada alta na polia baixa com barra reta",
      targetExerciseId: "6c2e58df-666f-420a-81e2-192929555fdc",
      targetName: "Remada Alta Polia",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Remada Curvada com Carga (Pegada Neutra)",
      normalizedSource: "remada curvada com carga (pegada neutra)",
      targetExerciseId: "ec464c13-8653-4ec4-83b6-0f4ac5855c4a",
      targetName: "Remada Curvada Halteres Neutra",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Rosca Direta na Polia (Barra Reta)",
      normalizedSource: "rosca direta na polia (barra reta)",
      targetExerciseId: "d154f0c1-5df4-4fd4-a487-3cfcaee43988",
      targetName: "Rosca Direta Polia Barra",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Sobe/Desce no Banco",
      normalizedSource: "sobe/desce no banco",
      targetExerciseId: "a67f2841-bf56-477d-8743-405c34d8360d",
      targetName: "Subida no caixote (step-up)",
      evidenceType: "sanitized_independent_review_handoff",
    },
    {
      sourceName: "Supino Máquina Inclinado (Pegada Neutra)",
      normalizedSource: "supino maquina inclinado (pegada neutra)",
      targetExerciseId: "be15aca9-9af9-4e55-8c54-288689feb7cd",
      targetName: "Supino Inclinado Máquina",
      evidenceType: "sanitized_independent_review_handoff",
    },
  ];

  for (const expected of visuallyApprovedAliases) {
    const alias = aliasIndex.get(expected.normalizedSource);
    assert.equal(alias?.target_exercise_id, expected.targetExerciseId);
    assert.equal(alias?.target_name, expected.targetName);
    assert.equal(alias?.match_scope, "alias");

    const aliasRow = aliasPayload.aliases.find((row) => row.source_name === expected.sourceName);
    assert.equal(aliasRow?.target_exercise_id, expected.targetExerciseId);
    assert.equal(aliasRow?.target_name, expected.targetName);
    assert.equal(aliasRow?.status, "approved");
    assert.equal(aliasRow?.confidence, "high");
    assert.equal(aliasRow?.independent_review_status, "approved");
    assert.equal(aliasRow?.approved_after_visual_review, true);
    if (expected.mediaId) {
      assert.equal(aliasRow?.media_id, expected.mediaId);
    } else {
      assert.equal(aliasRow?.evidence_source, "approve_alias_handoff_2026-08-21");
    }

    const queueRow = queuePayload.items.find((row) => row.source_name === expected.sourceName);
    assert.equal(queueRow?.proposed_target_exercise_id, expected.targetExerciseId);
    assert.equal(queueRow?.proposed_target_name, expected.targetName);
    assert.equal(queueRow?.current_confidence, "high");
    assert.equal(queueRow?.decision_status, "approved_after_visual_review");
    assert.equal(queueRow?.independent_review_status, "approved");
    assert.equal(queueRow?.runtime_eligible, true);
    if (expected.mediaId) {
      assert.equal(queueRow?.mfit_media_evidence?.media_id, expected.mediaId);
      assert.equal(queueRow?.mfit_media_evidence?.video_url_verified_200, true);
      assert.equal(queueRow?.mfit_media_evidence?.thumbnail_observed, true);
      assert.equal(queueRow?.mfit_media_evidence?.observed_via, "authenticated_read_only_browser");
      assert.equal(queueRow?.mfit_media_evidence?.observed_at, "2026-08-20");
    } else {
      assert.equal(queueRow?.mfit_media_evidence?.evidence_type, expected.evidenceType);
      assert.equal(queueRow?.mfit_media_evidence?.observed_via, "independent_review_handoff");
      assert.equal(queueRow?.mfit_media_evidence?.observed_at, "2026-08-21");
    }
    assert.ok(queueRow?.mfit_media_evidence?.visual_finding);
  }

  const broomstickGoodMorning = queuePayload.items.find(
    (row) => row.source_name === "Bom dia com Cabo de Vassoura",
  );
  assert.equal(broomstickGoodMorning?.decision_status, "blocked_after_visual_review");
  assert.equal(broomstickGoodMorning?.runtime_eligible, false);

  const stillBlockedAliases = [
    {
      sourceName: "Barra Fixa Gráviton (Pegada Aberta)",
      normalizedSource: "barra fixa graviton (pegada aberta)",
    },
    {
      sourceName: "Desenvolvimento com Halteres (Pegada Neutra)",
      normalizedSource: "desenvolvimento com halteres (pegada neutra)",
    },
    {
      sourceName: "Encolhimento de Ombros no Smith Pela Frente",
      normalizedSource: "encolhimento de ombros no smith pela frente",
    },
    {
      sourceName: "Remada Alta com Barra W",
      normalizedSource: "remada alta com barra w",
    },
    {
      sourceName: "Abdominal Supra no Solo Pés Altos",
      normalizedSource: "abdominal supra no solo pes altos",
    },
    {
      sourceName: "Bom dia com Cabo de Vassoura",
      normalizedSource: "bom dia com cabo de vassoura",
    },
    {
      sourceName: "Desenvolvimento Barra Reta",
      normalizedSource: "desenvolvimento barra reta",
    },
    {
      sourceName: "Remada Alta na Polia Alta com Corda",
      normalizedSource: "remada alta na polia alta com corda",
    },
    {
      sourceName: "Remada Fechada com Halteres no Banco Inclinado",
      normalizedSource: "remada fechada com halteres no banco inclinado",
    },
    {
      sourceName: "Afundo Alternado no Smith",
      normalizedSource: "afundo alternado no smith",
    },
    {
      sourceName: "Rosca Direta Barra Reta",
      normalizedSource: "rosca direta barra reta",
    },
    {
      sourceName: "Abdominal com Rodinha Solo com Apoio",
      normalizedSource: "abdominal com rodinha solo com apoio",
    },
  ];
  for (const { sourceName, normalizedSource } of stillBlockedAliases) {
    const queueRow = queuePayload.items.find((row) => row.source_name === sourceName);
    assert.equal(aliasIndex.has(normalizedSource), false);
    assert.equal(queueRow?.runtime_eligible, false);
  }

  assert.equal(aliasIndex.has("afundo alternado smith"), false);
  assert.equal(aliasPayload.aliases.some((row) => row.source_name === "Afundo Alternado Smith"), false);
  assert.equal(queuePayload.items.some((row) => row.source_name === "Afundo Alternado Smith"), false);

  const unilateralBandRow = queuePayload.items.find((row) => row.source_name === "Remada Fechada Unilateral");
  assert.equal(aliasIndex.has("remada fechada unilateral"), false);
  assert.equal(unilateralBandRow?.decision_status, "blocked_after_visual_review");
  assert.equal(unilateralBandRow?.independent_review_status, "blocked");
  assert.equal(unilateralBandRow?.runtime_eligible, false);
  assert.equal(unilateralBandRow?.mfit_media_evidence?.media_id, "638");
  assert.equal(unilateralBandRow?.mfit_media_evidence?.video_url_verified_200, true);
  assert.equal(unilateralBandRow?.mfit_media_evidence?.thumbnail_observed, true);
  assert.ok(unilateralBandRow?.mfit_media_evidence?.mismatch?.includes("implement_or_resistance"));
  assert.ok(unilateralBandRow?.mfit_media_evidence?.mismatch?.includes("support_or_posture"));

  const p1BlockedAliases = [
    {
      sourceName: "Agachamento Sumô no Step com Halteres",
      normalizedSource: "agachamento sumo no step com halteres",
      mediaId: "78",
      mismatch: "machine_configuration",
    },
    {
      sourceName: "Abdominal Infra com as Pernas Flexionadas",
      normalizedSource: "abdominal infra com as pernas flexionadas",
      mediaId: "332",
      mismatch: "range_or_lever_arm",
    },
  ];

  for (const expected of p1BlockedAliases) {
    assert.equal(aliasIndex.has(expected.normalizedSource), false);
    const queueRow = queuePayload.items.find((row) => row.source_name === expected.sourceName);
    assert.equal(queueRow?.decision_status, "blocked_after_visual_review");
    assert.equal(queueRow?.independent_review_status, "blocked");
    assert.equal(queueRow?.runtime_eligible, false);
    assert.equal(queueRow?.mfit_media_evidence?.media_id, expected.mediaId);
    assert.equal(queueRow?.mfit_media_evidence?.video_url_verified_200, true);
    assert.equal(queueRow?.mfit_media_evidence?.thumbnail_observed, true);
    assert.equal(queueRow?.mfit_media_evidence?.observed_via, "authenticated_read_only_browser");
    assert.equal(queueRow?.mfit_media_evidence?.observed_at, "2026-08-20");
    assert.ok(queueRow?.mfit_media_evidence?.mismatch?.includes(expected.mismatch));
  }

  for (const sourceName of ["Puxada Neutra triangulo", "Mobilidade de Tornozelo Semi Ajoelhado"]) {
    const evidence = queuePayload.items.find((row) => row.source_name === sourceName);
    assert.equal(evidence?.decision_status, "blocked_after_visual_review");
    assert.equal(evidence?.independent_review_status, "blocked");
    assert.equal(evidence?.runtime_eligible, false);
  }

  const currentHash = createHash("sha256").update(aliasText).digest("hex");
  assert.equal(queuePayload.source_snapshot.alias_map_sha256, currentHash);
  assert.equal(queuePayload.items.length, 52);
  assert.equal(queuePayload.items.filter((item) => item.runtime_eligible).length, 31);
});

test("final low and no-candidate QA materialization stays narrow and auditable", async () => {
  const aliasPath = new URL("../docs/project/mfit-exercise-aliases.v1.json", import.meta.url);
  const ledgerPath = new URL("../docs/project/mfit-low-no-candidate-qa-ledger.v1.json", import.meta.url);
  const [aliasText, ledgerText] = await Promise.all([
    readFile(aliasPath, "utf8"),
    readFile(ledgerPath, "utf8"),
  ]);
  const aliasPayload = JSON.parse(aliasText);
  const ledgerPayload = JSON.parse(ledgerText);
  const aliasIndex = buildExerciseAliasIndex(aliasPayload);

  assert.equal(aliasPayload.summary.approved_aliases, 77);
  assert.equal(aliasPayload.summary.blocked_low, 27);
  assert.equal(aliasPayload.summary.blocked_no_candidate, 61);
  assert.equal(aliasPayload.summary.unresolved_total, 109);
  assert.equal(aliasPayload.summary.runtime_false_medium, 21);
  assert.equal(aliasPayload.summary.blocked_after_visual_review, 21);
  assert.equal(aliasPayload.summary.approved_pending_materialization, 0);
  assert.equal(aliasPayload.review_queue.low.length, 26);
  assert.equal(aliasPayload.review_queue.no_candidate.length, 61);

  const approvedForHistoricalAlias = [
    {
      sourceName: "Supino Reto com Barra Reta",
      normalizedSource: "supino reto com barra reta",
      targetExerciseId: "b61721db-87fe-41d8-b13e-f6b5833b8550",
      targetName: "Supino Reto Barra",
      rejectedTargetId: "8738b381-20aa-48cf-8475-264a24f7a289",
      rejectedReason: "duplicate_catalog_delta/no_metadata/no_primary_target",
    },
    {
      sourceName: "Flexão Nórdica Inversa",
      normalizedSource: "flexao nordica inversa",
      targetExerciseId: "672c0d1e-59af-46c1-b3ec-d3135a745b1b",
      targetName: "Nórdico Reverso",
      rejectedTargetId: "1c97bc1e-2dfe-4f83-b329-49ca21a8350a",
      rejectedReason: "compound_biset_not_standalone_target",
    },
  ];

  for (const expected of approvedForHistoricalAlias) {
    assert.equal(aliasPayload.review_queue.low.includes(expected.sourceName), false);
    assert.equal(aliasPayload.review_queue.no_candidate.includes(expected.sourceName), false);

    const aliasRow = aliasPayload.aliases.find((row) => row.source_name === expected.sourceName);
    assert.equal(aliasRow?.target_exercise_id, expected.targetExerciseId);
    assert.equal(aliasRow?.target_name, expected.targetName);
    assert.equal(aliasRow?.status, "approved");
    assert.equal(aliasRow?.confidence, "high");
    assert.equal(aliasRow?.match_scope, "alias");
    assert.equal(aliasRow?.independent_review_status, "approved_for_historical_alias");
    assert.equal(aliasRow?.evidence_source, "qa_mfit_candidate_review_2026-08-24");
    assert.match(aliasRow?.rationale || "", /hist[oó]ric/iu);
    assert.match(aliasRow?.rationale || "", /prescritiv/iu);

    const rejected = aliasRow?.rejected_candidates?.find(
      (candidate) => candidate.target_exercise_id === expected.rejectedTargetId,
    );
    assert.equal(rejected?.rejection_reason, expected.rejectedReason);

    const runtimeAlias = aliasIndex.get(expected.normalizedSource);
    assert.equal(runtimeAlias?.target_exercise_id, expected.targetExerciseId);
    assert.equal(runtimeAlias?.target_name, expected.targetName);
    assert.equal(runtimeAlias?.match_scope, "alias");
  }

  const approvedRows = aliasPayload.aliases.filter(
    (row) => row.evidence_source === "qa_mfit_candidate_review_2026-08-24",
  );
  assert.equal(approvedRows.length, 2);

  assert.equal(ledgerPayload.schema_version, 1);
  assert.equal(ledgerPayload.contains_pii, false);
  assert.deepEqual(ledgerPayload.summary, {
    total_reviewed: 90,
    approve_alias: 3,
    block: 45,
    needs_target_creation: 42,
  });
  assert.equal(ledgerPayload.items.length, 90);
  assert.equal(new Set(ledgerPayload.items.map((item) => item.source_name)).size, 90);
  assert.deepEqual(
    ledgerPayload.items
      .filter((item) => item.decision === "APPROVE_ALIAS")
      .map((item) => item.source_name)
      .sort(),
    ["Banco Supino Reto", "Flexão Nórdica Inversa", "Supino Reto com Barra Reta"],
  );
  assert.ok(ledgerPayload.items.every((item) => item.rationale && !item.runtime_eligible));

  const currentHash = createHash("sha256").update(aliasText).digest("hex");
  assert.equal(ledgerPayload.source_snapshot.alias_map_sha256, currentHash);
});

test("linked own-video aliases require exact reviewed targets and sanitized evidence", async () => {
  const aliasPath = new URL("../docs/project/mfit-exercise-aliases.v1.json", import.meta.url);
  const evidencePath = new URL("../docs/project/mfit-linked-own-video-alias-evidence.v1.json", import.meta.url);
  const [aliasText, evidenceText] = await Promise.all([
    readFile(aliasPath, "utf8"),
    readFile(evidencePath, "utf8"),
  ]);
  const aliasPayload = JSON.parse(aliasText);
  const evidencePayload = JSON.parse(evidenceText);
  const aliasIndex = buildExerciseAliasIndex(aliasPayload);
  const expectedAliases = [
    {
      sourceName: "Passada com Halteres",
      normalizedSource: "passada com halteres",
      targetExerciseId: "4161c89d-9db9-473f-97ca-acf4ac83b968",
      targetName: "Passada Halteres",
    },
    {
      sourceName: "Búlgaro com Halter",
      normalizedSource: "bulgaro com halter",
      targetExerciseId: "7fa7c63d-5642-4d41-acd3-f3e468e53370",
      targetName: "Agachamento búlgaro",
    },
    {
      sourceName: "Agachamento Sumo com Kettlebell",
      normalizedSource: "agachamento sumo com kettlebell",
      targetExerciseId: "df795cb5-06d1-49a9-848f-ac7b186ff807",
      targetName: "Agachamento Sumô Halter",
    },
    {
      sourceName: "Banco Supino Reto",
      normalizedSource: "banco supino reto",
      targetExerciseId: "b61721db-87fe-41d8-b13e-f6b5833b8550",
      targetName: "Supino Reto Barra",
    },
  ];

  assert.equal(aliasPayload.summary.approved_aliases, 77);
  assert.equal(aliasPayload.summary.blocked_no_candidate, 61);
  assert.equal(aliasPayload.summary.unresolved_total, 109);
  assert.equal(evidencePayload.schema_version, 1);
  assert.equal(evidencePayload.contains_pii, false);
  assert.equal(evidencePayload.runtime_policy, "reviewed_aliases_only");
  assert.equal(evidencePayload.items.length, expectedAliases.length);
  assert.equal(
    evidencePayload.source_snapshot.private_evidence_file,
    "mfit-linked-own-video-approved4-evidence-20260826.json",
  );
  assert.match(evidencePayload.source_snapshot.private_evidence_sha256, /^[0-9a-f]{64}$/);
  assert.match(
    evidencePayload.source_snapshot.deterministic_dry_run_sha256_json_stringify_without_generated_at,
    /^[0-9a-f]{64}$/,
  );

  for (const expected of expectedAliases) {
    const matchingRows = aliasPayload.aliases.filter(
      (row) => row.source_name.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR")
        === expected.normalizedSource,
    );
    assert.equal(matchingRows.length, 1);
    assert.equal(matchingRows[0].target_exercise_id, expected.targetExerciseId);
    assert.equal(matchingRows[0].target_name, expected.targetName);
    assert.equal(matchingRows[0].status, "approved");
    assert.equal(matchingRows[0].confidence, "high");
    assert.equal(matchingRows[0].independent_review_status, "approved");
    assert.equal(matchingRows[0].runtime_eligible, true);
    assert.equal(aliasPayload.review_queue.no_candidate.includes(expected.sourceName), false);
    assert.equal(aliasPayload.review_queue.low.includes(expected.sourceName), false);

    const runtimeAlias = aliasIndex.get(expected.normalizedSource);
    assert.equal(runtimeAlias?.target_exercise_id, expected.targetExerciseId);
    assert.equal(runtimeAlias?.target_name, expected.targetName);

    const evidence = evidencePayload.items.find((row) => row.source_name === expected.sourceName);
    assert.equal(evidence?.target_exercise_id, expected.targetExerciseId);
    assert.equal(evidence?.target_name, expected.targetName);
    assert.equal(evidence?.source_video_reviewed, true);
    assert.equal(evidence?.target_own_video_linked, true);
    assert.equal(evidence?.biomechanical_review_status, "approved_high");
    assert.equal(evidence?.runtime_eligible, true);
  }

  assert.equal(
    new Set(aliasPayload.aliases.map((row) => row.source_name.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR"))).size,
    aliasPayload.aliases.length,
  );
});
