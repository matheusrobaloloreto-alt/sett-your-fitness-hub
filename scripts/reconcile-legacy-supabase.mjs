#!/usr/bin/env node

import { chmod, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const LEGACY_REF = process.env.LEGACY_SUPABASE_REF || "cxesecxyrndveookvlzz";
const CURRENT_REF = process.env.CURRENT_SUPABASE_REF || "zshrcgbyhzxpnlccssyz";
const LEGACY_KEY = process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY;
const CURRENT_KEY = process.env.CURRENT_SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const BACKUP_ARG = process.argv.find((arg) => arg.startsWith("--backup="));
const BACKUP_PATH = BACKUP_ARG?.slice("--backup=".length)
  || `/tmp/sett-legacy-reconciliation-${new Date().toISOString().slice(0, 10)}.json`;

if (!LEGACY_KEY || !CURRENT_KEY) {
  throw new Error(
    "Set LEGACY_SUPABASE_SERVICE_ROLE_KEY and CURRENT_SUPABASE_SERVICE_ROLE_KEY before running.",
  );
}

const legacy = createClient(`https://${LEGACY_REF}.supabase.co`, LEGACY_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const current = createClient(`https://${CURRENT_REF}.supabase.co`, CURRENT_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\W/g, "");
}

function studentKeys(student) {
  return [...new Set([
    student.email,
    student.phone,
    student.whatsapp,
    student.cpf,
    `${student.full_name || ""}|${student.birth_date || ""}`,
  ].map(normalize).filter((key) => key.length >= 5))];
}

async function fetchAll(client, table, select = "*") {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

async function openApiColumns(ref, key) {
  const response = await fetch(`https://${ref}.supabase.co/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`OpenAPI ${ref}: HTTP ${response.status}`);
  const spec = await response.json();
  return new Map(
    Object.entries(spec.definitions || {}).map(([table, definition]) => [
      table,
      new Set(Object.keys(definition.properties || {})),
    ]),
  );
}

function keepColumns(row, columns) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => columns.has(key)),
  );
}

function remapCompany(row, companyMap) {
  if (!row.company_id) return row;
  const companyId = companyMap.get(row.company_id);
  if (!companyId) throw new Error(`No company mapping for legacy company ${row.company_id}`);
  return { ...row, company_id: companyId };
}

function assertNoNaturalConflicts(candidates, currentStudents) {
  const currentByKey = new Map();
  for (const student of currentStudents) {
    for (const key of studentKeys(student)) currentByKey.set(key, student.id);
  }
  for (const student of candidates) {
    const conflict = studentKeys(student).find((key) => currentByKey.has(key));
    if (conflict) {
      throw new Error(`Natural-key conflict remained for candidate ${student.id}`);
    }
  }
}

function buildCompanyMap(legacyStudents, currentStudents) {
  const currentById = new Map(currentStudents.map((student) => [student.id, student]));
  const votes = new Map();
  for (const student of legacyStudents) {
    const currentStudent = currentById.get(student.id);
    if (!currentStudent) continue;
    const key = `${student.company_id}->${currentStudent.company_id}`;
    votes.set(key, (votes.get(key) || 0) + 1);
  }

  const byLegacyCompany = new Map();
  for (const [key, count] of votes) {
    const [legacyCompany, currentCompany] = key.split("->");
    const previous = byLegacyCompany.get(legacyCompany);
    if (!previous || count > previous.count) {
      byLegacyCompany.set(legacyCompany, { currentCompany, count });
    }
  }

  const result = new Map();
  for (const [legacyCompany, mapping] of byLegacyCompany) {
    if (mapping.count < 2) {
      throw new Error(`Company mapping ${legacyCompany} has insufficient evidence`);
    }
    result.set(legacyCompany, mapping.currentCompany);
  }
  return result;
}

async function listAuthUserIds(client) {
  const ids = new Set();
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    for (const user of data.users) ids.add(user.id);
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function insertRows(table, rows) {
  if (!rows.length) return 0;
  const { error } = await current
    .from(table)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return rows.length;
}

async function listStorageObjects(client, bucket) {
  const files = [];
  const prefixes = [""];
  while (prefixes.length) {
    const prefix = prefixes.shift();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`${bucket} list: ${error.message}`);
      for (const item of data || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) files.push({ path, metadata: item.metadata || {} });
        else prefixes.push(path);
      }
      if ((data || []).length < 1000) break;
    }
  }
  return files;
}

async function copyLegacyStorage(bucket) {
  const objects = await listStorageObjects(legacy, bucket);
  let copied = 0;
  for (const object of objects) {
    const targetPath = `legacy-${LEGACY_REF}/${object.path}`;
    const { data, error } = await legacy.storage.from(bucket).download(object.path);
    if (error) throw new Error(`${bucket}/${object.path} download: ${error.message}`);
    const { error: uploadError } = await current.storage.from(bucket).upload(targetPath, data, {
      contentType: object.metadata.mimetype || object.metadata.contentType || data.type,
      upsert: false,
    });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
      throw new Error(`${bucket}/${targetPath} upload: ${uploadError.message}`);
    }
    if (!uploadError) copied += 1;
  }
  return { found: objects.length, copied };
}

function safeFileName(value, fallback) {
  const clean = String(value || fallback)
    .split("?")[0]
    .split("/")
    .pop()
    .replace(/[^\w.-]+/g, "_");
  return clean || fallback;
}

async function preserveEvaluationFiles(
  evaluations,
  studentMap,
  companyMap,
  legacyStudentCompanyById,
) {
  let copied = 0;
  for (const evaluation of evaluations) {
    if (!evaluation.file_url) continue;
    const studentId = studentMap.get(evaluation.student_id);
    const legacyCompanyId = evaluation.company_id
      || legacyStudentCompanyById.get(evaluation.student_id);
    const companyId = companyMap.get(legacyCompanyId);
    if (!studentId || !companyId) continue;

    const response = await fetch(evaluation.file_url);
    if (!response.ok) {
      throw new Error(`Evaluation ${evaluation.id} file: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const fileName = safeFileName(
      new URL(evaluation.file_url).pathname,
      `${evaluation.id}.bin`,
    );
    const filePath = `${companyId}/${studentId}/legacy-evaluations/${evaluation.id}-${fileName}`;
    const { error: uploadError } = await current.storage.from("student-files").upload(filePath, blob, {
      contentType: response.headers.get("content-type") || blob.type,
      upsert: true,
    });
    if (uploadError) throw new Error(`student-files upload: ${uploadError.message}`);

    const { error: fileError } = await current.from("student_files").upsert({
      student_id: studentId,
      company_id: companyId,
      file_path: filePath,
      file_name: fileName,
      kind: "assessment_report",
      source: `legacy_supabase_${LEGACY_REF}`,
      metadata: {
        legacy_evaluation_id: evaluation.id,
        legacy_file_url: evaluation.file_url,
        imported_at: new Date().toISOString(),
      },
    }, { onConflict: "student_id,file_path" });
    if (fileError) throw new Error(`student_files record: ${fileError.message}`);
    copied += 1;
  }
  return copied;
}

async function archiveUsefulWorkouts({
  legacyWorkouts,
  currentWorkouts,
  legacyCycles,
  legacyEnrollments,
  studentMap,
  companyMap,
}) {
  const currentWorkoutIds = new Set(currentWorkouts.map((workout) => workout.id));
  const cycleById = new Map(legacyCycles.map((cycle) => [cycle.id, cycle]));
  const enrollmentById = new Map(legacyEnrollments.map((enrollment) => [enrollment.id, enrollment]));
  const groups = new Map();

  for (const workout of legacyWorkouts) {
    if (currentWorkoutIds.has(workout.id)) continue;
    if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) continue;
    const cycle = cycleById.get(workout.cycle_id);
    const enrollment = cycle && enrollmentById.get(cycle.enrollment_id);
    const studentId = enrollment && studentMap.get(enrollment.student_id);
    const companyId = enrollment && companyMap.get(enrollment.company_id);
    if (!studentId || !companyId) continue;
    const key = `${companyId}:${studentId}`;
    if (!groups.has(key)) groups.set(key, { companyId, studentId, rows: [] });
    groups.get(key).rows.push({ workout, cycle, enrollment });
  }

  let archived = 0;
  for (const group of groups.values()) {
    const fileName = `legacy-training-history-${LEGACY_REF}.json`;
    const filePath = `${group.companyId}/${group.studentId}/${fileName}`;
    const data = new Blob([JSON.stringify({
      source_project: LEGACY_REF,
      imported_at: new Date().toISOString(),
      records: group.rows,
    }, null, 2)], { type: "application/json" });
    const { error: uploadError } = await current.storage.from("student-files").upload(filePath, data, {
      contentType: "application/json",
      upsert: true,
    });
    if (uploadError) throw new Error(`Workout archive upload: ${uploadError.message}`);
    const { error: fileError } = await current.from("student_files").upsert({
      student_id: group.studentId,
      company_id: group.companyId,
      file_path: filePath,
      file_name: fileName,
      kind: "other",
      source: `legacy_supabase_${LEGACY_REF}`,
      metadata: {
        workout_count: group.rows.length,
        exercise_count: group.rows.reduce(
          (total, row) => total + row.workout.exercises.length,
          0,
        ),
      },
    }, { onConflict: "student_id,file_path" });
    if (fileError) throw new Error(`Workout archive record: ${fileError.message}`);
    archived += group.rows.length;
  }
  return archived;
}

const currentColumns = await openApiColumns(CURRENT_REF, CURRENT_KEY);

const tables = [
  "students",
  "student_categories",
  "enrollments",
  "anamnesis",
  "student_evaluations",
  "student_body_limitations",
  "whatsapp_chats",
  "whatsapp_messages",
  "training_cycles",
  "workouts",
];

const legacyRows = {};
const currentRows = {};
for (const table of tables) {
  [legacyRows[table], currentRows[table]] = await Promise.all([
    fetchAll(legacy, table),
    fetchAll(current, table),
  ]);
}

const companyMap = buildCompanyMap(legacyRows.students, currentRows.students);
const legacyStudentCompanyById = new Map(
  legacyRows.students.map((student) => [student.id, student.company_id]),
);
const currentStudentById = new Map(currentRows.students.map((student) => [student.id, student]));
const currentStudentByKey = new Map();
for (const student of currentRows.students) {
  for (const key of studentKeys(student)) {
    if (!currentStudentByKey.has(key)) currentStudentByKey.set(key, student.id);
  }
}

const studentMap = new Map();
const missingStudents = [];
const candidateStudentByKey = new Map();
for (const student of legacyRows.students) {
  if (currentStudentById.has(student.id)) {
    studentMap.set(student.id, student.id);
    continue;
  }
  const naturalMatch = studentKeys(student)
    .map((key) => currentStudentByKey.get(key))
    .find(Boolean);
  if (naturalMatch) {
    studentMap.set(student.id, naturalMatch);
    continue;
  }
  const candidateMatch = studentKeys(student)
    .map((key) => candidateStudentByKey.get(key))
    .find(Boolean);
  if (candidateMatch) {
    studentMap.set(student.id, candidateMatch);
    continue;
  }
  studentMap.set(student.id, student.id);
  missingStudents.push(student);
  for (const key of studentKeys(student)) candidateStudentByKey.set(key, student.id);
}
assertNoNaturalConflicts(missingStudents, currentRows.students);

const currentAuthIds = await listAuthUserIds(current);
const currentCategoryIds = new Set(currentRows.student_categories.map((row) => row.id));
const referencedCategoryIds = new Set(missingStudents.map((student) => student.category_id).filter(Boolean));
const categoryCandidates = legacyRows.student_categories
  .filter((row) => referencedCategoryIds.has(row.id) && !currentCategoryIds.has(row.id))
  .map((row) => keepColumns(
    remapCompany(row, companyMap),
    currentColumns.get("student_categories"),
  ));
const availableCategoryIds = new Set([
  ...currentCategoryIds,
  ...categoryCandidates.map((row) => row.id),
]);

const studentCandidates = missingStudents.map((student) => {
  const mapped = keepColumns(remapCompany(student, companyMap), currentColumns.get("students"));
  if (mapped.user_id && !currentAuthIds.has(mapped.user_id)) mapped.user_id = null;
  if (mapped.category_id && !availableCategoryIds.has(mapped.category_id)) mapped.category_id = null;
  return mapped;
});

const missingStudentIds = new Set(missingStudents.map((student) => student.id));
const currentEnrollmentIds = new Set(currentRows.enrollments.map((row) => row.id));
const enrollmentCandidates = legacyRows.enrollments
  .filter((row) => missingStudentIds.has(row.student_id) && !currentEnrollmentIds.has(row.id))
  .map((row) => {
    const mapped = remapCompany(row, companyMap);
    mapped.student_id = studentMap.get(row.student_id);
    return keepColumns(mapped, currentColumns.get("enrollments"));
  });

function mappedHistoricalRows(table) {
  const currentIds = new Set(currentRows[table].map((row) => row.id));
  return legacyRows[table]
    .filter((row) => !currentIds.has(row.id) && studentMap.has(row.student_id))
    .map((row) => {
      const mapped = remapCompany(row, companyMap);
      mapped.student_id = studentMap.get(row.student_id);
      if ("evaluator_id" in mapped && mapped.evaluator_id && !currentAuthIds.has(mapped.evaluator_id)) {
        mapped.evaluator_id = null;
      }
      if ("created_by" in mapped && mapped.created_by && !currentAuthIds.has(mapped.created_by)) {
        mapped.created_by = null;
      }
      return keepColumns(mapped, currentColumns.get(table));
    });
}

const anamnesisCandidates = mappedHistoricalRows("anamnesis");
const evaluationCandidates = mappedHistoricalRows("student_evaluations");
const limitationCandidates = mappedHistoricalRows("student_body_limitations");

const currentChatById = new Map(currentRows.whatsapp_chats.map((chat) => [chat.id, chat]));
const currentMessageIds = new Set(currentRows.whatsapp_messages.map((message) => message.id));
const currentExternalMessageKeys = new Set(
  currentRows.whatsapp_messages
    .filter((message) => message.message_id_external)
    .map((message) => `${message.chat_id}:${message.message_id_external}`),
);
const messageCandidates = legacyRows.whatsapp_messages
  .filter((message) =>
    !currentMessageIds.has(message.id)
    && currentChatById.has(message.chat_id)
    && (
      !message.message_id_external
      || !currentExternalMessageKeys.has(`${message.chat_id}:${message.message_id_external}`)
    )
  )
  .map((message) => {
    const mapped = { ...message, company_id: currentChatById.get(message.chat_id).company_id };
    return keepColumns(mapped, currentColumns.get("whatsapp_messages"));
  });

const backup = {
  generated_at: new Date().toISOString(),
  legacy_project: LEGACY_REF,
  current_project: CURRENT_REF,
  company_mapping: Object.fromEntries(companyMap),
  candidates: {
    student_categories: categoryCandidates,
    students: studentCandidates,
    enrollments: enrollmentCandidates,
    anamnesis: anamnesisCandidates,
    student_evaluations: evaluationCandidates,
    student_body_limitations: limitationCandidates,
    whatsapp_messages: messageCandidates,
  },
};
await writeFile(BACKUP_PATH, JSON.stringify(backup, null, 2), "utf8");
await chmod(BACKUP_PATH, 0o600);

const summary = {
  mode: APPLY ? "apply" : "dry-run",
  backup: BACKUP_PATH,
  companyMappings: companyMap.size,
  rekeyedStudents: [...studentMap].filter(([oldId, newId]) => oldId !== newId).length,
  candidates: Object.fromEntries(
    Object.entries(backup.candidates).map(([table, rows]) => [table, rows.length]),
  ),
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

for (const [table, rows] of Object.entries(backup.candidates)) {
  await insertRows(table, rows);
}

const storage = {};
for (const bucket of ["whatsapp-media", "evaluations", "platform-assets"]) {
  storage[bucket] = await copyLegacyStorage(bucket);
}
storage.evaluationFilesToStudentFolders = await preserveEvaluationFiles(
  legacyRows.student_evaluations,
  studentMap,
  companyMap,
  legacyStudentCompanyById,
);
storage.archivedWorkoutRows = await archiveUsefulWorkouts({
  legacyWorkouts: legacyRows.workouts,
  currentWorkouts: currentRows.workouts,
  legacyCycles: legacyRows.training_cycles,
  legacyEnrollments: legacyRows.enrollments,
  studentMap,
  companyMap,
});

const postStudents = await fetchAll(current, "students");
const naturalCounts = new Map();
for (const student of postStudents) {
  for (const key of studentKeys(student)) {
    const scopedKey = `${student.company_id}:${key}`;
    naturalCounts.set(scopedKey, (naturalCounts.get(scopedKey) || 0) + 1);
  }
}
const duplicateNaturalKeys = [...naturalCounts.values()].filter((count) => count > 1).length;
if (duplicateNaturalKeys) {
  throw new Error(`Post-migration validation found ${duplicateNaturalKeys} duplicate natural keys`);
}

console.log(JSON.stringify({
  ...summary,
  storage,
  validation: {
    currentStudentsBefore: currentRows.students.length,
    currentStudentsAfter: postStudents.length,
    duplicateNaturalKeys,
  },
}, null, 2));
