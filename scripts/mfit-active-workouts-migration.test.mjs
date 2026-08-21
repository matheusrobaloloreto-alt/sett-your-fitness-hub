import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  MARKER_PREFIX,
  assertCanonicalSupabaseTarget,
  buildExerciseAliasIndex,
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

test("CLI remains dry-run unless --apply is explicit", () => {
  const dryRun = parseArgs([
    "--sett-students", "sett.json",
    "--mfit-clients", "clients.json",
    "--mfit-workouts", "workouts.json",
    "--exercise-aliases", "aliases.json",
    "--company-id", IDS.company,
  ]);
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
  assert.doesNotMatch(adapter, /insertIgnoringIds\("exercise_library"/);
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

  assert.equal(aliasPayload.summary.approved_aliases, 62);
  assert.equal(aliasPayload.summary.pending_medium, 29);
  assert.equal(aliasPayload.summary.blocked_ambiguous_exact, 0);
  assert.equal(aliasPayload.summary.unresolved_total, 120);
  assert.deepEqual(aliasPayload.review_queue.ambiguous_exact, []);

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
  assert.equal(broomstickGoodMorning?.decision_status, "needs_evidence");
  assert.equal(broomstickGoodMorning?.runtime_eligible, false);

  const stillBlockedAliases = [
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
  assert.equal(unilateralBandRow?.decision_status, "needs_more_evidence");
  assert.equal(unilateralBandRow?.independent_review_status, "needs_more_evidence");
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
    assert.equal(queueRow?.decision_status, "needs_more_evidence");
    assert.equal(queueRow?.independent_review_status, "needs_more_evidence");
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
    assert.equal(evidence?.decision_status, "needs_more_evidence");
    assert.equal(evidence?.independent_review_status, "needs_more_evidence");
    assert.equal(evidence?.runtime_eligible, false);
  }

  const currentHash = createHash("sha256").update(aliasText).digest("hex");
  assert.equal(queuePayload.source_snapshot.alias_map_sha256, currentHash);
  assert.equal(queuePayload.items.length, 52);
  assert.equal(queuePayload.items.filter((item) => item.runtime_eligible).length, 23);
});
