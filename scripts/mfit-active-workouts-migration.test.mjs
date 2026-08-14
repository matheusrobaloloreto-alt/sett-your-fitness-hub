import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKER_PREFIX,
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
    settPayload: {
      students: [{
        id: IDS.studentPhone,
        company_id: IDS.company,
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
            }],
          }],
        }],
      }],
    },
  };
}

class MemoryDb {
  constructor({ cycles = [], workouts = [], exercises = [], normalizedAvailable = true } = {}) {
    this.enrollments = [{
      id: IDS.enrollment,
      student_id: IDS.studentPhone,
      company_id: IDS.company,
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
    }];
    this.cycles = structuredClone(cycles);
    this.workouts = structuredClone(workouts);
    this.exercises = structuredClone(exercises);
    this.workoutExercises = [];
    this.normalizedSupport = { available: normalizedAvailable, has_id: normalizedAvailable };
    this.writes = { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 };
  }

  async getEnrollments(studentIds) {
    return this.enrollments.filter((row) => studentIds.includes(row.student_id));
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
  ]);
  assert.equal(dryRun.apply, false);
  assert.equal(parseArgs(["--apply", "--sett-students=a", "--mfit-clients=b", "--mfit-workouts=c"]).apply, true);
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
    { id: "phone", name: "Outro", phone: "+55 11 99999-0001", email: "email@example.test" },
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
  assert.equal(report.summary.exercises_to_create, 1);
  assert.deepEqual(db.writes, { exercises: 0, cycles: 0, workouts: 0, workoutExercises: 0 });

  const serialized = JSON.stringify(report);
  for (const pii of ["Pessoa Reservada", "11999990001", "sett@example.test", "mfit@example.test", IDS.studentPhone]) {
    assert.equal(serialized.includes(pii), false, `report leaked ${pii}`);
  }
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

test("new MFIT exercises receive the mandatory review marker", async () => {
  const input = baseInput();
  const db = new MemoryDb();
  const report = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });

  assert.equal(report.summary.imported, 1);
  assert.match(db.exercises[0].description, /Importado do MFIT; revisar metadados/);
});

test("apply is append-only and a second identical run is a no-op", async () => {
  const input = baseInput();
  const db = new MemoryDb();

  const first = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(first.summary.imported, 1);
  assert.deepEqual(db.writes, { exercises: 1, cycles: 1, workouts: 1, workoutExercises: 1 });
  assert.equal(db.exercises[0].name, "Supino MFIT Exato");
  assert.equal(db.exercises[0].company_id, IDS.company);
  assert.equal(db.exercises[0].is_global, false);
  assert.ok(db.workouts[0].notes.startsWith(MARKER_PREFIX));
  assert.equal(db.workoutExercises.length, db.workouts[0].exercises.length);

  const writesAfterFirst = structuredClone(db.writes);
  const second = await runMigration({ ...input, db, apply: true, today: "2026-08-10" });
  assert.equal(second.summary.already_imported, 1);
  assert.deepEqual(db.writes, writesAfterFirst);
  assert.equal(db.cycles.length, 1);
  assert.equal(db.workouts.length, 1);
  assert.equal(db.exercises.length, 1);
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
