#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const IMPORT_VERSION = "mfit-active-workouts-v1";
export const MARKER_PREFIX = "mfit-import:v1:";
export const EXPECTED_SUPABASE_PROJECT_REF = "zshrcgbyhzxpnlccssyz";

const ACTIVE_ENROLLMENT_STATUSES = ["active", "awaiting_training", "awaiting_renewal"];
const ACTIVE_STUDENT_STATUSES = new Set(["active", "awaiting_renewal"]);
const INACTIVE_PLAN_STATUSES = new Set([
  "archived",
  "cancelled",
  "canceled",
  "completed",
  "deleted",
  "inactive",
  "inativo",
  "finalizado",
  "draft",
  "paused",
  "pending",
  "scheduled",
]);
const ACTIVE_PLAN_STATUSES = new Set([
  "active",
  "ativo",
  "current",
  "published",
  "vigente",
]);
const COLLECTION_ENVELOPES = ["data", "items", "results", "records", "rows", "hits", "payload"];
const PLAN_CONTAINER_KEYS = [
  "plans",
  "fichas",
  "training_plans",
  "trainingPlans",
  "workout_plans",
  "workoutPlans",
  "active_workouts",
  "activeWorkouts",
  "treinos_ativos",
  "treinosAtivos",
];
const SESSION_KEYS = ["workouts", "treinos", "sessions", "sessoes", "days", "dias", "trainingSessions"];
const EXERCISE_KEYS = ["exercises", "exercicios", "exercs", "movements", "movimentos", "items"];

const CORE_SCHEMA = {
  enrollments: ["id", "student_id", "company_id", "status", "created_at"],
  training_cycles: [
    "id",
    "enrollment_id",
    "student_id",
    "company_id",
    "cycle_number",
    "start_date",
    "end_date",
    "status",
    "name",
    "objective",
    "duration_weeks",
    "delivery_status",
  ],
  workouts: [
    "id",
    "cycle_id",
    "company_id",
    "name",
    "title",
    "description",
    "day_of_week",
    "sort_order",
    "exercises",
    "notes",
  ],
  exercise_library: [
    "id",
    "company_id",
    "name",
    "description",
    "muscle_group",
    "equipment",
    "difficulty",
    "is_global",
    "video_url",
    "thumbnail_url",
  ],
};
const NORMALIZED_SCHEMA = [
  "workout_id",
  "exercise_id",
  "exercise_name",
  "exercise_order",
  "sets",
  "reps",
  "rest_seconds",
  "notes",
];
const CREATED_EXERCISE_DESCRIPTION = "Importado do MFIT; revisar metadados e vídeo";
const SIMILARITY_THRESHOLD = 0.5;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFC").trim();
}

function valueAtPath(row, path) {
  let value = row;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = value[part];
  }
  return value;
}

function firstValue(row, paths) {
  for (const path of paths) {
    const value = valueAtPath(row, path);
    if (value !== undefined && value !== null && cleanText(value) !== "") return value;
  }
  return undefined;
}

function optionalBoolean(value, fallback = true) {
  if (value === undefined || value === null || cleanText(value) === "") return fallback;
  if (value === true || value === false) return value;
  const text = cleanText(value).toLocaleLowerCase("pt-BR");
  if (["true", "1", "yes", "sim", "complete", "completed", "captured"].includes(text)) return true;
  if (["false", "0", "no", "nao", "não", "incomplete", "incompleto", "partial"].includes(text)) return false;
  return false;
}

function firstArray(row, keys) {
  for (const key of keys) {
    const value = valueAtPath(row, key);
    if (Array.isArray(value)) return value;
  }
  return null;
}

function collectRows(payload, collectionKeys) {
  if (Array.isArray(payload)) return payload;
  const object = asObject(payload);
  if (!object) return [];
  for (const key of collectionKeys) {
    if (Array.isArray(object[key])) return object[key];
  }
  for (const key of COLLECTION_ENVELOPES) {
    if (object[key] !== undefined) {
      const nested = collectRows(object[key], collectionKeys);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function deterministicUuid(...parts) {
  const hex = sha256(parts.join("\u0000")).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function normalizePhone(value) {
  let digits = cleanText(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  return digits.length >= 10 && digits.length <= 11 ? digits : "";
}

export function normalizeEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeExactName(value) {
  return cleanText(value).replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function contactValues(row, paths, normalizer) {
  const values = [];
  for (const path of paths) {
    const value = valueAtPath(row, path);
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      const normalized = normalizer(item);
      if (normalized) values.push(normalized);
    }
  }
  return [...new Set(values)];
}

function normalizeContact(row) {
  return {
    phones: contactValues(
      row,
      [
        "phone",
        "phone_digits",
        "telefone",
        "whatsapp",
        "mobile",
        "mobile_phone",
        "phone_number",
        "contact.phone",
        "contact.whatsapp",
        "contato.telefone",
      ],
      normalizePhone,
    ),
    emails: contactValues(
      row,
      ["email", "mail", "contact.email", "contato.email", "user.email"],
      normalizeEmail,
    ),
    exact_name: normalizeExactName(
      firstValue(row, ["full_name", "name", "nome", "student_name", "client_name", "user.name"]),
    ),
  };
}

export function normalizeSettStudents(payload) {
  return collectRows(payload, ["students", "alunos", "clients", "clientes"])
    .map((raw, input_index) => {
      const row = asObject(raw) || {};
      const id = cleanText(firstValue(row, ["id", "student_id", "studentId", "uuid"]));
      if (!id) return null;
      return {
        id,
        company_id: cleanText(firstValue(row, ["company_id", "companyId", "empresa_id", "company.id"])),
        status: cleanText(firstValue(row, ["status", "state", "situacao", "situação"])).toLocaleLowerCase("pt-BR"),
        input_index,
        ...normalizeContact(row),
      };
    })
    .filter(Boolean);
}

export function normalizeMfitClients(payload) {
  return collectRows(payload, ["clients", "clientes", "students", "alunos"])
    .map((raw, input_index) => {
      const row = asObject(raw) || {};
      const contact = normalizeContact(row);
      const sourceId = cleanText(
        firstValue(row, ["id", "client_id", "clientId", "cliente_id", "clienteId", "objectID", "user_id"]),
      ) || `contact-${sha256(stableStringify(contact)).slice(0, 20)}`;
      return { source_id: sourceId, input_index, ...contact };
    });
}

function rawClientIds(row) {
  const scalarPaths = [
    "client_id",
    "clientId",
    "cliente_id",
    "clienteId",
    "student_id",
    "studentId",
    "aluno_id",
    "alunoId",
    "customer_id",
    "customerId",
    "client.id",
    "cliente.id",
    "student.id",
    "aluno.id",
    "customer.id",
  ];
  const arrayPaths = ["client_ids", "clientIds", "cliente_ids", "student_ids", "students"];
  const ids = scalarPaths.map((path) => cleanText(valueAtPath(row, path))).filter(Boolean);
  for (const path of arrayPaths) {
    const values = valueAtPath(row, path);
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      ids.push(cleanText(asObject(value)?.id ?? value));
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

function hasExerciseArray(row) {
  return Boolean(asObject(row) && firstArray(row, EXERCISE_KEYS));
}

function collectRawPlans(node, inherited, output) {
  if (Array.isArray(node)) {
    for (const item of node) collectRawPlans(item, inherited, output);
    return;
  }
  const row = asObject(node);
  if (!row) return;

  const ownClientIds = rawClientIds(row);
  const contact = normalizeContact(row);
  const nextContext = {
    client_ids: ownClientIds.length ? ownClientIds : inherited.client_ids,
    contact: contact.phones.length || contact.emails.length || contact.exact_name ? contact : inherited.contact,
  };

  for (const key of SESSION_KEYS) {
    const sessions = row[key];
    if (Array.isArray(sessions) && sessions.some(hasExerciseArray)) {
      output.push({ row, sessions, context: nextContext });
      return;
    }
  }

  if (hasExerciseArray(row)) {
    output.push({ row, sessions: [row], context: nextContext });
    return;
  }

  let traversed = false;
  for (const key of PLAN_CONTAINER_KEYS) {
    if (row[key] === undefined) continue;
    traversed = true;
    const wrapperId = cleanText(firstValue(row, ["id", "objectID", "uuid"]));
    const wrapperContext = nextContext.client_ids?.length || !wrapperId
      ? nextContext
      : { ...nextContext, client_ids: [wrapperId] };
    collectRawPlans(row[key], wrapperContext, output);
  }
  for (const key of [...COLLECTION_ENVELOPES, "clients", "clientes", "students", "alunos"]) {
    if (row[key] === undefined || PLAN_CONTAINER_KEYS.includes(key)) continue;
    traversed = true;
    collectRawPlans(row[key], nextContext, output);
  }

  if (!traversed) return;
}

function normalizeDayOfWeek(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value <= 6) return value;
    if (value === 7) return 0;
  }
  const text = cleanText(value).toLocaleLowerCase("pt-BR");
  if (/^\d+$/.test(text)) return normalizeDayOfWeek(Number(text));
  const days = {
    domingo: 0,
    sunday: 0,
    segunda: 1,
    "segunda-feira": 1,
    monday: 1,
    terca: 2,
    terça: 2,
    "terça-feira": 2,
    tuesday: 2,
    quarta: 3,
    "quarta-feira": 3,
    wednesday: 3,
    quinta: 4,
    "quinta-feira": 4,
    thursday: 4,
    sexta: 5,
    "sexta-feira": 5,
    friday: 5,
    sabado: 6,
    sábado: 6,
    saturday: 6,
  };
  return Object.hasOwn(days, text) ? days[text] : null;
}

function numericString(value, fallback = "") {
  if (Array.isArray(value)) return value.length ? String(value.length) : fallback;
  const text = cleanText(value);
  return text || fallback;
}

function uniqueNonEmptyText(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function mfitSeriesRows(row) {
  return (firstArray(row, ["series", "sets", "series_details", "seriesDetails"]) || [])
    .map(asObject)
    .filter(Boolean);
}

function parseMfitRepetition(value) {
  const text = cleanText(value);
  const match = /^(\d+)\s*(?:x|×)\s*(.+)$/i.exec(text);
  return match ? { sets: match[1], reps: match[2] } : { sets: "", reps: text };
}

function normalizeRest(row) {
  const seconds = firstValue(row, ["rest_seconds", "restSeconds", "interval_seconds", "intervalo_segundos", "intervalSeconds"]);
  if (seconds !== undefined) {
    const number = Number.parseInt(cleanText(seconds), 10);
    return Number.isFinite(number) ? `${Math.max(0, number)}s` : cleanText(seconds);
  }
  const rest = cleanText(firstValue(row, ["rest", "interval", "intervalo", "pause", "descanso", "intervalText"]));
  if (!rest) return "";
  return /^\d+$/.test(rest) ? `${rest}s` : rest;
}

function mfitProtocol(row) {
  const all = mfitSeriesRows(row);
  const actual = all.filter((item) => ![5, 6].includes(Number(firstValue(item, ["tipo", "type"]))));
  if (!actual.length) return null;

  const first = actual[0];
  const repetition = parseMfitRepetition(firstValue(first, ["repeticao", "reps", "repetitions", "rep_range"]));
  const rests = uniqueNonEmptyText(actual.map((item) => normalizeRest(item)));
  const tempos = uniqueNonEmptyText(actual.map((item) => cleanText(firstValue(item, ["cadencia", "tempo", "cadence"]))));
  const notes = uniqueNonEmptyText(actual.map((item) => cleanText(firstValue(item, ["obs", "notes", "observations", "observacoes", "observações"]))));
  const loads = uniqueNonEmptyText(actual.map((item) => cleanText(
    firstValue(item, ["load", "weight", "carga", "peso", "intensity", "intensidade"]),
  )));
  const series = actual.map((item) => {
    const itemRepetition = parseMfitRepetition(
      firstValue(item, ["repeticao", "reps", "repetitions", "rep_range"]),
    );
    return {
      reps: itemRepetition.reps,
      rest: normalizeRest(item),
      tempo: cleanText(firstValue(item, ["cadencia", "tempo", "cadence"])),
      load: cleanText(firstValue(item, ["load", "weight", "carga", "peso", "intensity", "intensidade"])),
      notes: cleanText(firstValue(item, ["obs", "notes", "observations", "observacoes", "observações"])),
    };
  });

  return {
    sets: repetition.sets || String(actual.length),
    reps: repetition.reps || numericString(firstValue(first, ["reps", "repetitions", "repeticoes"]), ""),
    rest: rests[0] || normalizeRest(first),
    tempo: tempos[0] || "",
    load: loads[0] || "",
    notes: notes.join(" | "),
    series,
  };
}

function normalizeMfitExercise(raw, index) {
  const row = asObject(raw) || {};
  const name = cleanText(
    firstValue(row, ["name", "nome", "exercise_name", "exerciseName", "exercise.name", "exercicio.nome"]),
  );
  if (!name) return null;
  const protocol = mfitProtocol(row);
  const setRows = mfitSeriesRows(row);
  const firstSet = asObject(setRows?.[0]) || {};
  const repetitionFromRow = parseMfitRepetition(
    firstValue(row, ["reps", "repetitions", "repeticoes", "repetições", "rep_range", "repetition"]),
  );
  const sets = protocol?.sets
    || repetitionFromRow.sets
    || (setRows?.length
    ? String(setRows.length)
    : numericString(firstValue(row, ["sets", "series", "set_count", "setCount", "qtd_series"]), "1"));
  const reps = protocol?.reps || repetitionFromRow.reps || numericString(
    firstValue(row, ["reps", "repetitions", "repeticoes", "repetições", "rep_range", "repetition"])
      ?? firstValue(firstSet, ["reps", "repetitions", "repeticoes"]),
    "",
  );
  const baseNotes = cleanText(firstValue(row, ["notes", "observations", "observacoes", "observações", "instructions", "obs"]));
  return {
    source_id: cleanText(
      firstValue(row, ["id", "exercise_id", "exerciseId", "exercicio_id", "objectID", "exercise.id"]),
    ) || `exercise-${index + 1}`,
    name,
    muscle_group: cleanText(
      firstValue(row, ["muscle_group", "muscleGroup", "group", "grupo", "exerciseGroup.nome", "category"]),
    ) || "geral",
    description: cleanText(firstValue(row, ["description", "descricao", "instructions", "instrucoes"])),
    equipment: cleanText(firstValue(row, ["equipment", "equipamento"])),
    difficulty: cleanText(firstValue(row, ["difficulty", "nivel", "level"])),
    video_url: cleanText(firstValue(row, ["video_url", "videoUrl", "urlMedia", "url_media", "media.url"])),
    thumbnail_url: cleanText(firstValue(row, ["thumbnail_url", "thumbnailUrl", "urlPoster", "url_poster"])),
    sets,
    reps,
    rest: protocol?.rest || normalizeRest({ ...row, ...firstSet }),
    notes: uniqueNonEmptyText([baseNotes, protocol?.notes]).join(" | "),
    method: cleanText(firstValue(row, ["method", "metodo", "training_method"])) || null,
    group_id: cleanText(firstValue(row, ["group_id", "groupId", "superset_id", "supersetId"])) || null,
    method_seconds: Number(firstValue(row, ["method_seconds", "methodSeconds"])) || null,
    tempo: protocol?.tempo || cleanText(firstValue(row, ["tempo", "cadence", "cadencia"])) || null,
    load: protocol?.load || cleanText(firstValue(row, ["load", "weight", "carga", "peso", "intensity", "intensidade"])) || null,
    mfit_protocol: protocol?.series?.length ? protocol.series : undefined,
    rir: cleanText(firstValue(row, ["rir", "reps_in_reserve"])) || null,
    set_types: Array.isArray(row.set_types) ? row.set_types.map(cleanText).filter(Boolean) : undefined,
    order: Number(firstValue(row, ["exercise_order", "exerciseOrder", "order", "ordem", "position"])) || index + 1,
  };
}

function groupExerciseRows(group) {
  return firstArray(group, ["exercises", "exercicios", "items"]) || [];
}

function methodForMfitGroup(count) {
  if (count === 2) return "biset";
  if (count === 3) return "triset";
  if (count >= 4) return "circuito";
  return null;
}

function withMfitNotes(row, extra) {
  const source = asObject(row) || {};
  const current = cleanText(firstValue(source, ["notes", "obs", "observations", "observacoes", "observações"]));
  return { ...source, obs: uniqueNonEmptyText([current, extra]).join(" | ") };
}

function splitCombinedMfitGroup(group) {
  const combined = [];

  for (const raw of groupExerciseRows(group)) {
    const row = asObject(raw) || {};
    const series = mfitSeriesRows(row);
    let activeExercise = null;
    let activeSeries = [];
    const flush = () => {
      if (!activeExercise) return;
      const normalized = normalizeMfitExercise({ ...activeExercise, series: activeSeries }, combined.length);
      if (normalized) combined.push(normalized);
      activeExercise = null;
      activeSeries = [];
    };

    for (const seriesRow of series) {
      const type = Number(firstValue(seriesRow, ["tipo", "type"]));
      const nested = asObject(firstValue(seriesRow, ["exercicio", "exercise"]));
      if (type === 6 && nested) {
        flush();
        activeExercise = nested;
        continue;
      }
      if (activeExercise) activeSeries.push(seriesRow);
    }

    flush();
    if (!series.some((seriesRow) => Number(firstValue(seriesRow, ["tipo", "type"])) === 6)) {
      const normalized = normalizeMfitExercise(row, combined.length);
      if (normalized) combined.push(normalized);
    }
  }

  return combined;
}

function normalizeMfitGroupedExercises(groups) {
  const output = [];
  const sortedGroups = groups
    .map(asObject)
    .filter(Boolean)
    .sort((a, b) => {
      const aOrder = Number(firstValue(a, ["order", "ordem", "position"])) || 0;
      const bOrder = Number(firstValue(b, ["order", "ordem", "position"])) || 0;
      return aOrder - bOrder;
    });

  for (const group of sortedGroups) {
    const type = Number(firstValue(group, ["type", "tipo"]));
    const items = groupExerciseRows(group);

    if (type === 1) {
      const combination = splitCombinedMfitGroup(group);
      const method = methodForMfitGroup(combination.length);
      const groupId = method
        ? `mfit-group-${cleanText(firstValue(group, ["id", "group_id", "groupId"])) || output.length + 1}`
        : null;
      for (const exercise of combination) {
        output.push({ ...exercise, method: method || exercise.method, group_id: groupId || exercise.group_id });
      }
      continue;
    }

    if (type === 2) {
      const [primary, ...alternatives] = items;
      const names = alternatives
        .map((candidate) => cleanText(firstValue(asObject(candidate) || {}, ["name", "nome", "exercise_name", "exerciseName"])))
        .filter(Boolean);
      const normalized = normalizeMfitExercise(
        withMfitNotes(primary, names.length ? `Alternativas MFIT: ${names.join(", ")}` : ""),
        output.length,
      );
      if (normalized) output.push(normalized);
      continue;
    }

    for (const raw of items) {
      const exercise = normalizeMfitExercise(raw, output.length);
      if (exercise) output.push(exercise);
    }
  }

  return output.map((exercise, index) => ({ ...exercise, order: index + 1 }));
}

function normalizeMfitSession(raw, index) {
  const row = asObject(raw) || {};
  const rawGroups = firstArray(row, ["exercs"]);
  const rawExercises = firstArray(row, EXERCISE_KEYS) || [];
  const exercises = rawGroups
    ? normalizeMfitGroupedExercises(rawGroups)
    : rawExercises
      .map(normalizeMfitExercise)
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
  return {
    source_id: cleanText(firstValue(row, ["id", "workout_id", "workoutId", "treino_id", "objectID"]))
      || `session-${index + 1}`,
    name: cleanText(firstValue(row, ["name", "nome", "title", "titulo"])) || `Treino ${index + 1}`,
    description: cleanText(firstValue(row, ["description", "descricao", "focus", "foco"])),
    notes: cleanText(firstValue(row, ["notes", "obs", "observations", "observacoes", "observações"])),
    day_of_week: normalizeDayOfWeek(firstValue(row, ["day_of_week", "dayOfWeek", "weekday", "dia_semana", "day"])),
    exercises,
  };
}

function explicitlyInactive(row) {
  if (row.active === false || row.is_active === false || row.isActive === false) return true;
  if (row.active === true || row.is_active === true || row.isActive === true) return false;
  const status = cleanText(firstValue(row, ["status", "state", "situacao", "situação"])).toLowerCase();
  // Fail closed: a plan needs either an explicit active flag or a known active status.
  if (!status) return true;
  return INACTIVE_PLAN_STATUSES.has(status) || !ACTIVE_PLAN_STATUSES.has(status);
}

export function normalizeMfitPlans(payload) {
  const rawPlans = [];
  collectRawPlans(payload, { client_ids: [], contact: null }, rawPlans);
  return rawPlans.flatMap(({ row, sessions, context }, input_index) => {
    const allSessions = sessions.map(normalizeMfitSession);
    const normalizedSessions = allSessions.filter((session) => session.exercises.length > 0);
    const derivedEmptySessionCount = allSessions.filter((session) => session.exercises.length === 0).length;
    const sourceEmptySessionCountValue = firstValue(row, [
      "source_empty_session_count",
      "sourceEmptySessionCount",
      "capture.empty_session_count",
      "capture.emptySessionCount",
    ]);
    const sourceSessionCount = Number(firstValue(row, [
      "source_session_count",
      "sourceSessionCount",
      "capture.session_count",
      "capture.sessionCount",
    ])) || allSessions.length;
    const capturedEmptySessionCount = Number(sourceEmptySessionCountValue);
    const planCore = {
      source_id: cleanText(firstValue(row, ["id", "plan_id", "planId", "ficha_id", "fichaId", "objectID"]))
        || `plan-${sha256(stableStringify(allSessions)).slice(0, 20)}`,
      name: cleanText(firstValue(row, ["name", "nome", "title", "titulo"])) || "Ficha MFIT",
      objective: cleanText(firstValue(row, ["objective", "objetivo", "goal", "focus"])),
      start_date: parseYmd(firstValue(row, ["start_date", "startDate", "data_inicio", "starts_at"])),
      end_date: parseYmd(firstValue(row, ["end_date", "endDate", "data_fim", "ends_at"])),
      duration_weeks: Number(firstValue(row, ["duration_weeks", "durationWeeks", "semanas", "weeks"])) || null,
      active: !explicitlyInactive(row),
      source_capture_complete: optionalBoolean(firstValue(row, [
        "source_capture_complete",
        "sourceCaptureComplete",
        "capture.complete",
        "captureComplete",
      ]), true),
      source_empty_session_count: Math.max(
        0,
        derivedEmptySessionCount,
        Number.isFinite(capturedEmptySessionCount) ? capturedEmptySessionCount : 0,
      ),
      source_session_count: Math.max(0, sourceSessionCount),
      sessions: normalizedSessions,
      contact: context.contact,
      input_index,
    };
    const ids = context.client_ids?.length ? context.client_ids : [""];
    return ids.map((client_id) => ({ ...planCore, client_id }));
  });
}

function buildValueIndex(rows, key) {
  const index = new Map();
  for (const row of rows) {
    const values = Array.isArray(row[key]) ? row[key] : [row[key]];
    for (const value of values.filter(Boolean)) {
      const bucket = index.get(value) || [];
      bucket.push(row);
      index.set(value, bucket);
    }
  }
  return index;
}

function uniqueCandidates(index, values) {
  const rows = new Map();
  for (const value of values || []) {
    for (const row of index.get(value) || []) rows.set(row.id ?? row.source_id, row);
  }
  return [...rows.values()];
}

function sameCandidate(left, right) {
  return (left?.id ?? left?.source_id) === (right?.id ?? right?.source_id);
}

function intersectCandidates(left, right) {
  return left.filter((candidate) => right.some((other) => sameCandidate(candidate, other)));
}

function matchContact(source, indexes, sourceNameCount = 1, options = {}) {
  const phoneCandidates = uniqueCandidates(indexes.phone, source.phones);
  const emailCandidates = uniqueCandidates(indexes.email, source.emails);

  if (phoneCandidates.length && emailCandidates.length) {
    const sharedCandidates = intersectCandidates(phoneCandidates, emailCandidates);
    if (sharedCandidates.length === 1) return { row: sharedCandidates[0], method: "phone_email" };
    if (sharedCandidates.length > 1) return { reason: "ambiguous_phone_email" };
    return { reason: "conflicting_phone_email" };
  }

  if (phoneCandidates.length === 1) return { row: phoneCandidates[0], method: "phone" };
  if (phoneCandidates.length > 1) return { reason: "ambiguous_phone" };
  if (emailCandidates.length === 1) return { row: emailCandidates[0], method: "email" };
  if (emailCandidates.length > 1) return { reason: "ambiguous_email" };

  if (source.exact_name) {
    const nameCandidates = indexes.name.get(source.exact_name) || [];
    if (nameCandidates.length > 1) return { reason: "ambiguous_name" };
    if (nameCandidates.length === 0) return { reason: "no_match" };
    if (options.identityContactOnly) return { reason: "name_only_match_disallowed" };
    if (sourceNameCount === 1) return { row: nameCandidates[0], method: "exact_unique_name" };
  }
  return { reason: "no_match" };
}

export function matchMfitClientsToSett(mfitClients, settStudents, options = {}) {
  const targetIndexes = {
    phone: buildValueIndex(settStudents, "phones"),
    email: buildValueIndex(settStudents, "emails"),
    name: buildValueIndex(settStudents, "exact_name"),
  };
  const sourceNameCounts = new Map();
  for (const client of mfitClients) {
    if (client.exact_name) sourceNameCounts.set(client.exact_name, (sourceNameCounts.get(client.exact_name) || 0) + 1);
  }

  const matches = new Map();
  for (const client of mfitClients) {
    const result = matchContact(client, targetIndexes, sourceNameCounts.get(client.exact_name) || 0, options);
    matches.set(client.source_id, result.row
      ? { student: result.row, method: result.method }
      : { reason: result.reason });
  }
  return matches;
}

function buildMfitClientLookup(clients) {
  const byId = new Map();
  for (const client of clients) {
    const bucket = byId.get(client.source_id) || [];
    bucket.push(client);
    byId.set(client.source_id, bucket);
  }
  const nameCounts = new Map();
  for (const client of clients) {
    if (client.exact_name) nameCounts.set(client.exact_name, (nameCounts.get(client.exact_name) || 0) + 1);
  }
  return {
    byId,
    indexes: {
      phone: buildValueIndex(clients, "phones"),
      email: buildValueIndex(clients, "emails"),
      name: buildValueIndex(clients, "exact_name"),
    },
    nameCounts,
  };
}

function resolvePlanClient(plan, lookup, options = {}) {
  if (plan.client_id) {
    const candidates = lookup.byId.get(plan.client_id) || [];
    if (candidates.length === 1) return { client: candidates[0] };
    if (candidates.length > 1) return { reason: "ambiguous_mfit_client_id" };
  }
  if (plan.contact) {
    const result = matchContact(plan.contact, lookup.indexes, lookup.nameCounts.get(plan.contact.exact_name) || 0, options);
    if (result.row) return { client: result.row };
    if (result.reason === "name_only_match_disallowed") return { reason: result.reason };
    return { reason: `plan_client_${result.reason}` };
  }
  return { reason: "plan_without_client" };
}

function parseYmd(value) {
  const text = cleanText(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function addDays(ymd, days) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function businessToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function normalizeCatalogName(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildExerciseAliasIndex(payload = { schema_version: 1, contains_pii: false, aliases: [] }) {
  const source = asObject(payload);
  if (!source || source.schema_version !== 1 || !Array.isArray(source.aliases)) {
    throw new Error("Exercise alias map must use schema_version 1 and an aliases array");
  }
  if (source.contains_pii !== false) {
    throw new Error("Exercise alias map must explicitly declare contains_pii=false");
  }

  const aliases = new Map();
  for (const raw of source.aliases) {
    const row = asObject(raw);
    const sourceName = cleanText(row?.source_name);
    const targetExerciseId = cleanText(row?.target_exercise_id);
    const targetName = cleanText(row?.target_name);
    const matchScope = cleanText(row?.match_scope) || "alias";
    const normalizedSource = normalizeCatalogName(sourceName);
    if (!normalizedSource || !targetName) throw new Error("Exercise alias names cannot be empty");
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(targetExerciseId)) {
      throw new Error("Exercise alias target_exercise_id must be a UUID");
    }
    if (!new Set(["alias", "ambiguous_exact_override"]).has(matchScope)) {
      throw new Error("Exercise alias match_scope is invalid");
    }
    if (row.status !== "approved" || row.confidence !== "high") continue;
    if (matchScope === "ambiguous_exact_override" && row.independent_review_status !== "approved") continue;
    if (aliases.has(normalizedSource)) throw new Error("Exercise alias sources must be unique after normalization");
    aliases.set(normalizedSource, {
      source_name: sourceName,
      target_exercise_id: targetExerciseId,
      target_name: targetName,
      match_scope: matchScope,
    });
  }
  return aliases;
}

function similarityTokens(value) {
  return [...new Set(normalizeCatalogName(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !new Set(["de", "da", "do", "das", "dos", "com", "sem", "em", "no", "na", "nos", "nas", "e"]).has(token)))];
}

function similarityScore(sourceName, candidateName) {
  const sourceTokens = similarityTokens(sourceName);
  const candidateTokens = similarityTokens(candidateName);
  if (!sourceTokens.length || !candidateTokens.length) return 0;
  const candidateSet = new Set(candidateTokens);
  const intersection = sourceTokens.filter((token) => candidateSet.has(token)).length;
  const denominator = Math.max(sourceTokens.length, candidateTokens.length);
  return Number((intersection / denominator).toFixed(2));
}

function tokenHasAny(tokens, values) {
  return values.some((value) => tokens.includes(value));
}

function obviousSimilarityIncompatibility(sourceExercise, candidate) {
  const source = similarityTokens([
    sourceExercise.name,
    sourceExercise.equipment,
    sourceExercise.muscle_group,
    sourceExercise.description,
  ].filter(Boolean).join(" "));
  const target = similarityTokens([
    candidate.name,
    candidate.equipment,
    candidate.muscle_group,
    candidate.description,
  ].filter(Boolean).join(" "));
  const equipmentGroups = [
    ["halter", "dumbbell"],
    ["maquina", "máquina"],
    ["polia", "cabo"],
    ["barra"],
    ["elastico", "elástico", "band", "mini"],
  ];
  const sourceGroups = equipmentGroups.filter((group) => tokenHasAny(source, group));
  const targetGroups = equipmentGroups.filter((group) => tokenHasAny(target, group));
  if (sourceGroups.length && targetGroups.length && !sourceGroups.some((group) => targetGroups.includes(group))) {
    return "equipment_or_pattern_incompatible";
  }
  if (source.includes("unilateral") && target.includes("bilateral")) return "lateralidade_incompatible";
  if (source.includes("bilateral") && target.includes("unilateral")) return "lateralidade_incompatible";
  const posturePairs = [
    ["deitado", "em-pe"],
    ["sentado", "deitado"],
    ["ajoelhado", "deitado"],
  ];
  for (const [left, right] of posturePairs) {
    if ((source.includes(left) && target.includes(right)) || (source.includes(right) && target.includes(left))) {
      return "posture_incompatible";
    }
  }
  return "";
}

function visibleCatalogRows(catalog, companyId) {
  return catalog.filter((row) => row.is_global === true || row.company_id === companyId);
}

function resolveSimilarityCandidate(catalog, companyId, exercise) {
  const candidates = visibleCatalogRows(catalog, companyId)
    .map((row) => ({
      row,
      score: similarityScore(exercise.name, row.name),
    }))
    .filter((item) => item.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) =>
      b.score - a.score
      || normalizeCatalogName(a.row.name).localeCompare(normalizeCatalogName(b.row.name), "pt-BR")
      || cleanText(a.row.id).localeCompare(cleanText(b.row.id)));
  if (!candidates.length) return { status: "missing", similarity_status: "below_threshold" };
  const best = candidates[0];
  const incompatibleReason = obviousSimilarityIncompatibility(exercise, best.row);
  const similarity = {
    source_name: exercise.name,
    candidate_exercise_id: best.row.id,
    candidate_name: best.row.name,
    status: incompatibleReason ? "blocked" : "requires_review",
    reason: incompatibleReason || "similarity_candidate_requires_review",
    score: best.score,
  };
  return incompatibleReason
    ? { status: "similarity_incompatible", similarity }
    : { status: "similarity_candidate", similarity };
}

function resolveCatalogExercise(catalog, companyId, sourceExercise, aliasIndex, options = {}) {
  const exercise = typeof sourceExercise === "string" ? { name: sourceExercise } : sourceExercise;
  const sourceName = exercise.name;
  const exact = catalogCandidates(catalog, companyId, sourceName);
  if (exact.length === 1) return { status: "matched", id: exact[0].id, match_method: "exact" };

  const alias = aliasIndex.get(normalizeCatalogName(sourceName));
  if (!alias) {
    if (exact.length > 1) return { status: "ambiguous" };
    return options.exerciseSimilarityFallback
      ? resolveSimilarityCandidate(catalog, companyId, exercise)
      : { status: "missing" };
  }
  const visibleTargets = [...new Map(catalog
    .filter((row) => row.id === alias.target_exercise_id)
    .filter((row) => row.is_global === true || row.company_id === companyId)
    .map((row) => [row.id, row])).values()];
  if (visibleTargets.length !== 1) return { status: "invalid_alias", alias_reason: "target_not_visible" };
  if (normalizeCatalogName(visibleTargets[0].name) !== normalizeCatalogName(alias.target_name)) {
    return { status: "invalid_alias", alias_reason: "target_name_mismatch" };
  }
  if (exact.length > 1 && alias.match_scope !== "ambiguous_exact_override") {
    return { status: "invalid_alias", alias_reason: "ambiguous_exact_override_scope_required" };
  }
  if (exact.length === 0 && alias.match_scope === "ambiguous_exact_override") {
    return { status: "invalid_alias", alias_reason: "ambiguous_exact_override_without_duplicates" };
  }
  if (exact.length > 1 && !exact.some((candidate) => candidate.id === visibleTargets[0].id)) {
    return { status: "invalid_alias", alias_reason: "ambiguous_exact_target_mismatch" };
  }
  return {
    status: "matched",
    id: visibleTargets[0].id,
    match_method: exact.length > 1 ? "approved_alias_exact_override" : "approved_alias",
  };
}

function createdExerciseTargetRow(companyId, sourceName) {
  const targetName = cleanText(sourceName);
  return {
    id: deterministicUuid(IMPORT_VERSION, "exercise-library", companyId, normalizeCatalogName(targetName)),
    company_id: companyId,
    name: targetName,
    description: CREATED_EXERCISE_DESCRIPTION,
    is_global: false,
  };
}

function targetActionFromRow(row, status) {
  return {
    source_name: row.name,
    target_exercise_id: row.id,
    target_name: row.name,
    company_id: row.company_id,
    status,
    description: row.description,
  };
}

function matchesCreatedTarget(existing, target) {
  return Boolean(existing)
    && existing.id === target.id
    && existing.company_id === target.company_id
    && existing.is_global === false
    && normalizeCatalogName(existing.name) === normalizeCatalogName(target.name)
    && cleanText(existing.description) === target.description;
}

function targetCollisionReason(existing, target) {
  if (!existing) return "";
  if (existing.company_id !== target.company_id || existing.is_global !== false) return "target_tenant_mismatch";
  if (normalizeCatalogName(existing.name) !== normalizeCatalogName(target.name)) return "target_id_collision";
  if (cleanText(existing.description) !== target.description) return "target_metadata_mismatch";
  return "";
}

function resolutionCanCreateTarget(resolution) {
  return ["missing", "similarity_candidate", "similarity_incompatible"].includes(resolution?.status);
}

function reasonForPlanResolutions(planResolutions, createMissingExerciseTargets) {
  if (planResolutions.some((item) => item?.status === "invalid_alias")) return "exercise_alias_invalid";
  if (planResolutions.some((item) => item?.status === "ambiguous")) return "ambiguous_exact_exercise_name";
  if (createMissingExerciseTargets && planResolutions.some((item) => item?.status === "target_creation_blocked")) {
    return "exercise_target_creation_blocked";
  }
  if (!createMissingExerciseTargets && planResolutions.some((item) => item?.status === "similarity_candidate")) {
    return "exercise_similarity_candidate_requires_review";
  }
  if (!createMissingExerciseTargets && planResolutions.some((item) => item?.status === "similarity_incompatible")) {
    return "exercise_similarity_incompatible";
  }
  if (planResolutions.some((item) => item?.status === "missing")) return "exercise_not_in_catalog";
  return "migration_batch_catalog_gate";
}

function chooseReusableEmptyCycle(enrollmentCycles, workoutsByCycle, startDate, endDate, today) {
  const closedStatuses = new Set([
    "cancelled",
    "canceled",
    "completed",
    "concluded",
    "finished",
    "inactive",
    "cancelado",
    "concluido",
    "concluído",
  ]);
  const candidates = enrollmentCycles
    .filter((cycle) => !closedStatuses.has(cleanText(cycle.status).toLocaleLowerCase("pt-BR")))
    .filter((cycle) => parseYmd(cycle.start_date) && parseYmd(cycle.end_date))
    .filter((cycle) => rangesOverlap(startDate, endDate, cycle.start_date, cycle.end_date))
    .filter((cycle) => (workoutsByCycle.get(cycle.id) || []).length === 0)
    .map((cycle) => {
      const exactRange = cycle.start_date === startDate && cycle.end_date === endDate;
      const containsToday = cycle.start_date <= today && today <= cycle.end_date;
      const isActive = cleanText(cycle.status).toLocaleLowerCase("pt-BR") === "active";
      return {
        cycle,
        score: (exactRange ? 8 : 0) + (containsToday ? 4 : 0) + (isActive ? 2 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || cleanText(a.cycle.id).localeCompare(cleanText(b.cycle.id)));

  if (!candidates.length) return { cycle: null, ambiguous: false };
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return { cycle: null, ambiguous: true };
  }
  return { cycle: candidates[0].cycle, ambiguous: false };
}

function isMaterialized(workout) {
  return Array.isArray(workout?.exercises) && workout.exercises.length > 0;
}

function markerFor(hash) {
  return `${MARKER_PREFIX}${hash}`;
}

function markerMatches(notes, marker) {
  return cleanText(notes).split("\n")[0] === marker;
}

function anonymousRef(...parts) {
  return sha256([IMPORT_VERSION, ...parts].join("\u0000")).slice(0, 12);
}

function chooseEnrollment(rows) {
  const priority = new Map(ACTIVE_ENROLLMENT_STATUSES.map((status, index) => [status, index]));
  return [...rows]
    .map((row) => ({ ...row, status: cleanText(row.status).toLocaleLowerCase("pt-BR") }))
    .filter((row) => priority.has(row.status))
    .sort((a, b) => {
      const rank = priority.get(a.status) - priority.get(b.status);
      if (rank) return rank;
      return cleanText(b.created_at).localeCompare(cleanText(a.created_at));
    })[0] || null;
}

function exerciseJson(exercise, exerciseId) {
  return {
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    muscle_group: exercise.muscle_group,
    sets: exercise.sets,
    reps: exercise.reps,
    rest: exercise.rest,
    notes: exercise.notes,
    video_url: exercise.video_url || null,
    video_path: null,
    thumbnail_url: exercise.thumbnail_url || null,
    ...(exercise.method ? { method: exercise.method } : {}),
    ...(exercise.group_id ? { group_id: exercise.group_id } : {}),
    ...(exercise.method_seconds ? { method_seconds: exercise.method_seconds } : {}),
    ...(exercise.tempo ? { tempo: exercise.tempo } : {}),
    ...(exercise.load ? { load: exercise.load } : {}),
    ...(exercise.mfit_protocol?.length ? { mfit_protocol: exercise.mfit_protocol } : {}),
    ...(exercise.rir ? { rir: exercise.rir } : {}),
    ...(exercise.set_types?.length ? { set_types: exercise.set_types } : {}),
  };
}

function restSeconds(rest) {
  const match = cleanText(rest).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function catalogCandidates(catalog, companyId, name) {
  const normalizedName = normalizeCatalogName(name);
  const own = catalog.filter((row) =>
    row.company_id === companyId
    && row.is_global !== true
    && normalizeCatalogName(row.name) === normalizedName);
  if (own.length) return own;
  return catalog.filter((row) => row.is_global === true && normalizeCatalogName(row.name) === normalizedName);
}

function summarizeResults(results) {
  const statuses = {};
  for (const result of results) statuses[result.status] = (statuses[result.status] || 0) + 1;
  return statuses;
}

function safeDbError(label, error) {
  const code = cleanText(error?.code) || "database_error";
  return new Error(`${label} failed (${code})`);
}

async function inBatches(values, callback, batchSize = 150) {
  const unique = [...new Set(values.filter(Boolean))];
  const rows = [];
  for (let index = 0; index < unique.length; index += batchSize) {
    rows.push(...await callback(unique.slice(index, index + batchSize)));
  }
  return rows;
}

async function fetchAllPages(queryFactory, label, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw safeDbError(label, error);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

export function createSupabaseAdapter(client, schema) {
  const normalizedColumns = schema.get("workout_exercises") || null;
  const normalizedAvailable = Boolean(
    normalizedColumns && NORMALIZED_SCHEMA.every((column) => normalizedColumns.has(column)),
  );
  const normalizedHasId = Boolean(normalizedColumns?.has("id"));

  const selectByIds = (table, select, column, ids) => inBatches(ids, async (batch) =>
    fetchAllPages(
      () => client.from(table).select(select).in(column, batch),
      `${table} select`,
    ));

  const insertIgnoringIds = async (table, rows, select = "id") => {
    if (!rows.length) return [];
    const output = [];
    for (let index = 0; index < rows.length; index += 200) {
      const batch = rows.slice(index, index + 200);
      const { data, error } = await client
        .from(table)
        .upsert(batch, { onConflict: "id", ignoreDuplicates: true })
        .select(select);
      if (error) throw safeDbError(`${table} insert`, error);
      output.push(...(data || []));
    }
    return output;
  };
  const insertStrict = async (table, rows, select = "id") => {
    if (!rows.length) return [];
    const output = [];
    for (let index = 0; index < rows.length; index += 200) {
      const batch = rows.slice(index, index + 200);
      const { data, error } = await client.from(table).insert(batch).select(select);
      if (error) throw safeDbError(`${table} insert`, error);
      output.push(...(data || []));
    }
    return output;
  };

  return {
    normalizedSupport: { available: normalizedAvailable, has_id: normalizedHasId },
    async getStudentsByIds(ids) {
      return selectByIds(
        "students",
        "id,company_id,status",
        "id",
        ids,
      );
    },
    async getEnrollments(studentIds) {
      return selectByIds(
        "enrollments",
        "id,student_id,company_id,status,created_at",
        "student_id",
        studentIds,
      );
    },
    async getCycles(enrollmentIds) {
      return selectByIds(
        "training_cycles",
        "id,enrollment_id,student_id,company_id,cycle_number,start_date,end_date,status,name,objective,duration_weeks,delivery_status",
        "enrollment_id",
        enrollmentIds,
      );
    },
    async getCyclesByIds(ids) {
      return selectByIds(
        "training_cycles",
        "id,enrollment_id,student_id,company_id,cycle_number,start_date,end_date,status,name,objective,duration_weeks,delivery_status",
        "id",
        ids,
      );
    },
    async getWorkouts(cycleIds) {
      return selectByIds(
        "workouts",
        "id,cycle_id,company_id,name,title,description,day_of_week,sort_order,exercises,notes",
        "cycle_id",
        cycleIds,
      );
    },
    async getWorkoutsByIds(ids) {
      return selectByIds(
        "workouts",
        "id,cycle_id,company_id,name,title,description,day_of_week,sort_order,exercises,notes",
        "id",
        ids,
      );
    },
    async getExercises(companyIds) {
      const globalRows = await fetchAllPages(
        () => client.from("exercise_library").select("id,company_id,name,description,muscle_group,equipment,is_global").eq("is_global", true),
        "exercise_library select",
      );
      const companyRows = [];
      for (const companyId of [...new Set(companyIds.filter(Boolean))]) {
        companyRows.push(...await fetchAllPages(
          () => client.from("exercise_library").select("id,company_id,name,description,muscle_group,equipment,is_global").eq("company_id", companyId),
          "exercise_library select",
        ));
      }
      return [...globalRows, ...companyRows];
    },
    async getExercisesByIds(ids) {
      return selectByIds(
        "exercise_library",
        "id,company_id,name,description,muscle_group,equipment,is_global",
        "id",
        ids,
      );
    },
    async getWorkoutExercises(workoutIds) {
      if (!normalizedAvailable) return [];
      const select = `${normalizedHasId ? "id," : ""}${NORMALIZED_SCHEMA.join(",")}`;
      return selectByIds("workout_exercises", select, "workout_id", workoutIds);
    },
    insertCycles(rows) {
      return insertIgnoringIds("training_cycles", rows, "id,enrollment_id,cycle_number");
    },
    insertWorkouts(rows) {
      return insertIgnoringIds("workouts", rows, "id,cycle_id,notes,exercises");
    },
    insertExercises(rows) {
      return insertStrict("exercise_library", rows, "id,company_id,name,description,is_global");
    },
    async insertWorkoutExercises(rows) {
      if (!normalizedAvailable || !rows.length) return [];
      if (normalizedHasId) return insertIgnoringIds("workout_exercises", rows, "id,workout_id");
      const { data, error } = await client.from("workout_exercises").insert(rows).select("workout_id");
      if (error) throw safeDbError("workout_exercises insert", error);
      return data || [];
    },
  };
}

export function validateSchema(schema) {
  const missing = [];
  for (const [table, columns] of Object.entries(CORE_SCHEMA)) {
    const available = schema.get(table);
    if (!available) {
      missing.push(`${table}.*`);
      continue;
    }
    for (const column of columns) {
      if (!available.has(column)) missing.push(`${table}.${column}`);
    }
  }
  if (missing.length) throw new Error(`Supabase schema contract missing: ${missing.join(", ")}`);

  const normalized = schema.get("workout_exercises");
  if (normalized) {
    const normalizedMissing = NORMALIZED_SCHEMA.filter((column) => !normalized.has(column));
    if (normalizedMissing.length) {
      throw new Error(`workout_exercises contract incomplete: ${normalizedMissing.join(", ")}`);
    }
  }
}

export async function fetchOpenApiSchema(url, key, fetchImpl = fetch) {
  const response = await fetchImpl(`${url.replace(/\/$/, "")}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Supabase OpenAPI unavailable (HTTP ${response.status})`);
  const spec = await response.json();
  const definitions = spec.definitions || spec.components?.schemas || {};
  return new Map(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      new Set(Object.keys(definition?.properties || {})),
    ]),
  );
}

function sameNormalizedRows(existing, expected) {
  if (existing.length !== expected.length) return false;
  const canonical = (row) => stableStringify({
    workout_id: row.workout_id,
    exercise_id: row.exercise_id,
    exercise_name: cleanText(row.exercise_name),
    exercise_order: Number(row.exercise_order) || 0,
    sets: Number(row.sets) || 0,
    reps: cleanText(row.reps),
    rest_seconds: Number(row.rest_seconds) || 0,
    notes: cleanText(row.notes),
  });
  return [...existing].map(canonical).sort().join("\n") === [...expected].map(canonical).sort().join("\n");
}

function normalizedRowIdentity(row, hasId) {
  return hasId
    ? cleanText(row.id)
    : `${cleanText(row.workout_id)}\u0000${Number(row.exercise_order) || 0}`;
}

function analyzeNormalizedRows(existing, expected, hasId) {
  const expectedByIdentity = new Map(expected.map((row) => [normalizedRowIdentity(row, hasId), row]));
  const seen = new Set();
  for (const row of existing) {
    const identity = normalizedRowIdentity(row, hasId);
    const expectedRow = expectedByIdentity.get(identity);
    if (!identity || seen.has(identity) || !expectedRow || !sameNormalizedRows([row], [expectedRow])) {
      return { conflict: true, missing: [] };
    }
    seen.add(identity);
  }
  return {
    conflict: false,
    missing: expected.filter((row) => !seen.has(normalizedRowIdentity(row, hasId))),
  };
}

function canonicalWorkout(row) {
  return stableStringify({
    id: cleanText(row.id),
    cycle_id: cleanText(row.cycle_id),
    company_id: cleanText(row.company_id),
    name: cleanText(row.name),
    title: cleanText(row.title),
    description: cleanText(row.description),
    day_of_week: row.day_of_week === null || row.day_of_week === undefined ? null : Number(row.day_of_week),
    sort_order: Number(row.sort_order) || 0,
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    notes: cleanText(row.notes),
  });
}

function analyzeWorkoutRows(existing, expected) {
  const expectedById = new Map(expected.map((row) => [row.id, row]));
  const seen = new Set();
  for (const row of existing) {
    const expectedRow = expectedById.get(row.id);
    if (!expectedRow || seen.has(row.id) || canonicalWorkout(row) !== canonicalWorkout(expectedRow)) {
      return { conflict: true, missing: [] };
    }
    seen.add(row.id);
  }
  return { conflict: false, missing: expected.filter((row) => !seen.has(row.id)) };
}

function workoutRowsForOperation(workouts, operation) {
  if (!operation.merge_overlap_into_active_cycle) return workouts;
  const expectedIds = new Set(operation.workouts.map((workout) => workout.id));
  return workouts.filter((workout) => expectedIds.has(workout.id));
}

function operationAlreadyMaterialized(workouts, operation) {
  const analysis = analyzeWorkoutRows(workoutRowsForOperation(workouts, operation), operation.workouts);
  return !analysis.conflict && analysis.missing.length === 0;
}

async function applyOperation(db, operation) {
  // Re-read live ownership immediately before any mutation. The input export is
  // only a matching source and must not authorize an apply after status changes.
  const liveStudent = (await db.getStudentsByIds([operation.cycle.student_id]))[0] || null;
  if (!liveStudent || !ACTIVE_STUDENT_STATUSES.has(cleanText(liveStudent.status).toLowerCase())) {
    return { status: "blocked", reason: "student_no_longer_active" };
  }
  if (liveStudent.company_id !== operation.cycle.company_id) {
    return { status: "blocked", reason: "live_student_company_mismatch" };
  }
  const liveEnrollment = (await db.getEnrollments([operation.cycle.student_id]))
    .find((row) => row.id === operation.cycle.enrollment_id) || null;
  if (!liveEnrollment || !ACTIVE_ENROLLMENT_STATUSES.includes(cleanText(liveEnrollment.status).toLowerCase())) {
    return { status: "blocked", reason: "enrollment_no_longer_active" };
  }
  if (
    liveEnrollment.student_id !== liveStudent.id
    || liveEnrollment.company_id !== liveStudent.company_id
    || liveEnrollment.company_id !== operation.cycle.company_id
  ) {
    return { status: "blocked", reason: "live_enrollment_company_mismatch" };
  }

  const exerciseTargetActions = [];
  const exerciseLibraryIdsCreated = [];
  for (const target of operation.exercise_targets || []) {
    const existingBefore = (await db.getExercisesByIds([target.id]))[0] || null;
    const beforeCollision = targetCollisionReason(existingBefore, target);
    if (beforeCollision) {
      return {
        status: "blocked",
        reason: "exercise_target_creation_blocked",
        exercise_target_actions: [{ ...targetActionFromRow(target, "blocked"), reason: beforeCollision }],
        exercise_library_ids_created: exerciseLibraryIdsCreated,
      };
    }
    if (matchesCreatedTarget(existingBefore, target)) {
      exerciseTargetActions.push(targetActionFromRow(target, "reused_created_target"));
      continue;
    }
    const freshVisibleCatalog = await db.getExercises([target.company_id]);
    const sameNameCollisions = catalogCandidates(freshVisibleCatalog, target.company_id, target.name)
      .filter((row) => row.id !== target.id);
    if (sameNameCollisions.length) {
      return {
        status: "blocked",
        reason: "exercise_target_creation_blocked",
        exercise_target_actions: [{ ...targetActionFromRow(target, "blocked"), reason: "target_name_collision" }],
        exercise_library_ids_created: exerciseLibraryIdsCreated,
      };
    }
    try {
      await db.insertExercises([target]);
    } catch (error) {
      const existingAfterConflict = (await db.getExercisesByIds([target.id]))[0] || null;
      const conflictReason = targetCollisionReason(existingAfterConflict, target) || "target_insert_conflict";
      if (!matchesCreatedTarget(existingAfterConflict, target)) {
        return {
          status: "blocked",
          reason: "exercise_target_creation_blocked",
          exercise_target_actions: [{ ...targetActionFromRow(target, "blocked"), reason: conflictReason }],
          exercise_library_ids_created: exerciseLibraryIdsCreated,
        };
      }
      exerciseTargetActions.push(targetActionFromRow(target, "reused_created_target"));
      continue;
    }
    const existingAfterInsert = (await db.getExercisesByIds([target.id]))[0] || null;
    if (!matchesCreatedTarget(existingAfterInsert, target)) {
      return {
        status: "partial_retry_required",
        reason: "exercise_target_insert_not_visible",
        exercise_target_actions: exerciseTargetActions,
        exercise_library_ids_created: exerciseLibraryIdsCreated,
      };
    }
    exerciseLibraryIdsCreated.push(target.id);
    exerciseTargetActions.push(targetActionFromRow(target, "created_target"));
  }
  const withExerciseTargetOutcome = (outcome) => ({
    ...outcome,
    exercise_target_actions: exerciseTargetActions,
    exercise_library_ids_created: exerciseLibraryIdsCreated,
  });

  const currentCycles = await db.getCyclesByIds([operation.cycle.id]);
  let cycle = currentCycles[0] || null;

  if (operation.merge_overlap_into_active_cycle) {
    const liveCycles = await db.getCycles([operation.cycle.enrollment_id]);
    const activeCoveringTargets = liveCycles.filter((row) =>
      cleanText(row.status).toLocaleLowerCase("pt-BR") === "active"
      && row.enrollment_id === operation.cycle.enrollment_id
      && row.company_id === operation.cycle.company_id
      && (!row.student_id || row.student_id === operation.cycle.student_id)
      && row.start_date <= operation.merge_reference_date
      && operation.merge_reference_date <= row.end_date);
    if (
      !cycle
      || activeCoveringTargets.length !== 1
      || activeCoveringTargets[0].id !== operation.cycle.id
    ) {
      return withExerciseTargetOutcome({
        status: "blocked",
        reason: "merge_overlap_active_cycle_changed_before_apply",
      });
    }
  }

  if (!cycle) {
    const siblingCycles = await db.getCycles([operation.cycle.enrollment_id]);
    const siblingWorkouts = await db.getWorkouts(siblingCycles.map((row) => row.id));
    const normalizedWorkoutIds = new Set();
    if (db.normalizedSupport.available && siblingWorkouts.length) {
      const normalizedRows = await db.getWorkoutExercises(siblingWorkouts.map((row) => row.id));
      for (const row of normalizedRows) normalizedWorkoutIds.add(row.workout_id);
    }
    const workoutsByCycle = new Map();
    for (const workout of siblingWorkouts) {
      const rows = workoutsByCycle.get(workout.cycle_id) || [];
      rows.push(workout);
      workoutsByCycle.set(workout.cycle_id, rows);
    }
    const conflict = siblingCycles.some((row) =>
      rangesOverlap(operation.cycle.start_date, operation.cycle.end_date, row.start_date, row.end_date)
      && (workoutsByCycle.get(row.id) || []).some((workout) =>
        isMaterialized(workout) || normalizedWorkoutIds.has(workout.id)));
    if (conflict) return withExerciseTargetOutcome({ status: "blocked", reason: "concurrent_materialized_cycle" });

    await db.insertCycles([operation.cycle]);
    cycle = (await db.getCyclesByIds([operation.cycle.id]))[0] || null;
    if (!cycle) return withExerciseTargetOutcome({ status: "partial_retry_required", reason: "cycle_insert_not_visible" });
  }

  if (cycle.enrollment_id !== operation.cycle.enrollment_id || cycle.company_id !== operation.cycle.company_id) {
    return withExerciseTargetOutcome({ status: "blocked", reason: "deterministic_cycle_collision" });
  }

  let currentWorkouts = await db.getWorkouts([cycle.id]);
  const workoutAnalysis = analyzeWorkoutRows(
    workoutRowsForOperation(currentWorkouts, operation),
    operation.workouts,
  );
  if (workoutAnalysis.conflict) {
    return withExerciseTargetOutcome({ status: "blocked", reason: "cycle_contains_different_workouts" });
  }

  if (workoutAnalysis.missing.length) await db.insertWorkouts(workoutAnalysis.missing);
  currentWorkouts = await db.getWorkouts([cycle.id]);
  if (!operationAlreadyMaterialized(currentWorkouts, operation)) {
    return withExerciseTargetOutcome({
      status: "partial_retry_required",
      reason: "workout_insert_incomplete",
    });
  }

  if (db.normalizedSupport.available) {
    const existingEntries = await db.getWorkoutExercises(operation.workouts.map((row) => row.id));
    const normalizedAnalysis = analyzeNormalizedRows(
      existingEntries,
      operation.workout_exercises,
      db.normalizedSupport.has_id,
    );
    if (normalizedAnalysis.conflict) {
      return withExerciseTargetOutcome({
        status: "blocked",
        reason: "normalized_mirror_conflict",
      });
    }
    if (normalizedAnalysis.missing.length) await db.insertWorkoutExercises(normalizedAnalysis.missing);
    const insertedEntries = await db.getWorkoutExercises(operation.workouts.map((row) => row.id));
    if (!sameNormalizedRows(insertedEntries, operation.workout_exercises)) {
      return withExerciseTargetOutcome({
        status: "partial_retry_required",
        reason: "normalized_mirror_incomplete",
      });
    }
  }

  return withExerciseTargetOutcome({
    status: "imported",
  });
}

export async function runMigration({
  settPayload,
  mfitClientsPayload,
  mfitWorkoutsPayload,
  exerciseAliasPayload = { schema_version: 1, contains_pii: false, aliases: [] },
  db,
  companyId,
  apply = false,
  partitionCompletePlans = false,
  identityContactOnly = false,
  exerciseSimilarityFallback = false,
  createMissingExerciseTargets = false,
  createNewCycleOnAmbiguousEmpty = false,
  mergeOverlapIntoActiveCycle = false,
  includePlanRefs = [],
  today = businessToday(),
  defaultDurationWeeks = 6,
}) {
  const parsedToday = parseYmd(today);
  if (!parsedToday) throw new Error("Invalid --today date; expected YYYY-MM-DD");
  const expectedCompanyId = cleanText(companyId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedCompanyId)) {
    throw new Error("A valid BN company UUID is required for tenant-scoped migration");
  }
  const durationFallback = Math.max(1, Number(defaultDurationWeeks) || 6);
  const students = normalizeSettStudents(settPayload);
  const activeStudents = students.filter((student) =>
    student.company_id === expectedCompanyId && ACTIVE_STUDENT_STATUSES.has(student.status));
  const clients = normalizeMfitClients(mfitClientsPayload);
  const allPlans = normalizeMfitPlans(mfitWorkoutsPayload);
  const plans = allPlans.filter((plan) => plan.active);
  const exerciseAliasIndex = buildExerciseAliasIndex(exerciseAliasPayload);
  const identityOptions = { identityContactOnly };
  const clientMatches = matchMfitClientsToSett(clients, activeStudents, identityOptions);
  const clientLookup = buildMfitClientLookup(clients);
  const results = [];
  const requestedPlanRefs = new Set(includePlanRefs.map(cleanText).filter(Boolean));

  const candidates = [];
  for (const plan of plans) {
    const clientResult = resolvePlanClient(plan, clientLookup, identityOptions);
    const ref = anonymousRef(plan.client_id || plan.input_index, plan.source_id);
    if (requestedPlanRefs.size && !requestedPlanRefs.has(ref)) {
      results.push({ ref, status: "skipped", reason: "outside_requested_batch", match_method: null, sessions: plan.sessions.length });
      continue;
    }
    if (!clientResult.client) {
      results.push({ ref, status: "skipped", reason: clientResult.reason, match_method: null, sessions: plan.sessions.length });
      continue;
    }
    const match = clientMatches.get(clientResult.client.source_id);
    if (!match?.student) {
      results.push({ ref, status: "skipped", reason: match?.reason || "unmatched_client", match_method: null, sessions: plan.sessions.length });
      continue;
    }
    candidates.push({ plan, client: clientResult.client, student: match.student, match_method: match.method, ref });
  }

  const studentIds = [...new Set(candidates.map((candidate) => candidate.student.id))];
  const enrollments = await db.getEnrollments(studentIds);
  const enrollmentsByStudent = new Map();
  for (const enrollment of enrollments) {
    const rows = enrollmentsByStudent.get(enrollment.student_id) || [];
    rows.push(enrollment);
    enrollmentsByStudent.set(enrollment.student_id, rows);
  }

  const selected = [];
  for (const candidate of candidates) {
    const enrollment = chooseEnrollment(enrollmentsByStudent.get(candidate.student.id) || []);
    if (!enrollment) {
      results.push({ ref: candidate.ref, status: "skipped", reason: "no_current_enrollment", match_method: candidate.match_method, sessions: candidate.plan.sessions.length });
      continue;
    }
    if (!enrollment.company_id) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "incomplete_enrollment_ownership", match_method: candidate.match_method, sessions: candidate.plan.sessions.length });
      continue;
    }
    if (enrollment.company_id !== expectedCompanyId) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "enrollment_outside_target_company", match_method: candidate.match_method, sessions: candidate.plan.sessions.length });
      continue;
    }
    if (candidate.student.company_id && candidate.student.company_id !== enrollment.company_id) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "student_enrollment_company_mismatch", match_method: candidate.match_method, sessions: candidate.plan.sessions.length });
      continue;
    }
    selected.push({ ...candidate, enrollment, company_id: enrollment.company_id });
  }

  const enrollmentIds = [...new Set(selected.map((candidate) => candidate.enrollment.id))];
  const cycles = await db.getCycles(enrollmentIds);
  const workouts = await db.getWorkouts(cycles.map((cycle) => cycle.id));
  const existingNormalizedRows = db.normalizedSupport.available && workouts.length
    ? await db.getWorkoutExercises(workouts.map((workout) => workout.id))
    : [];
  const normalizedWorkoutIds = new Set(existingNormalizedRows.map((row) => row.workout_id));
  const workoutHasMaterialization = (workout) => isMaterialized(workout) || normalizedWorkoutIds.has(workout.id);
  const catalog = await db.getExercises([...new Set(selected.map((candidate) => candidate.company_id))]);
  const exerciseResolution = new Map();
  for (const candidate of selected) {
    for (const exercise of candidate.plan.sessions.flatMap((session) => session.exercises)) {
      const normalizedName = normalizeCatalogName(exercise.name);
      const key = `${candidate.company_id}\u0000${normalizedName}`;
      if (exerciseResolution.has(key)) continue;
      exerciseResolution.set(
        key,
        resolveCatalogExercise(catalog, candidate.company_id, exercise, exerciseAliasIndex, {
          exerciseSimilarityFallback,
        }),
      );
    }
  }
  const exerciseCoverage = [...exerciseResolution.values()];
  const catalogMatched = exerciseCoverage.filter((item) => item.status === "matched").length;
  const catalogMissing = exerciseCoverage.filter((item) =>
    ["missing", "similarity_candidate", "similarity_incompatible"].includes(item.status)).length;
  const catalogAmbiguous = exerciseCoverage.filter((item) => item.status === "ambiguous").length;
  const catalogInvalidAliases = exerciseCoverage.filter((item) => item.status === "invalid_alias").length;
  const catalogSimilarityCandidates = exerciseCoverage.filter((item) => item.status === "similarity_candidate").length;
  const catalogSimilarityIncompatible = exerciseCoverage.filter((item) => item.status === "similarity_incompatible").length;
  const catalogSimilarityBelowThreshold = exerciseCoverage.filter((item) =>
    item.status === "missing" && item.similarity_status === "below_threshold").length;
  const catalogAliasMatched = exerciseCoverage
    .filter((item) => item.status === "matched" && item.match_method.startsWith("approved_alias")).length;
  const catalogNearestAliasMatched = exerciseCoverage
    .filter((item) => item.status === "matched" && item.match_method === "approved_alias").length;
  const catalogCoverageBlocked = catalogMissing > 0
    || catalogAmbiguous > 0
    || catalogInvalidAliases > 0
    || catalogSimilarityCandidates > 0
    || catalogSimilarityIncompatible > 0;
  const planResolutionsFor = (plan, companyId) => plan.sessions
    .flatMap((session) => session.exercises)
    .map((exercise) => exerciseResolution.get(`${companyId}\u0000${normalizeCatalogName(exercise.name)}`));
  const selectedPlanResolutionSets = selected.map((candidate) => planResolutionsFor(candidate.plan, candidate.company_id));
  const resolutionHasProjectedCoverage = (resolution) => resolution?.status === "matched"
    || (createMissingExerciseTargets && resolutionCanCreateTarget(resolution));
  const completePlansWithCatalogCoverage = selectedPlanResolutionSets
    .filter((resolutions) => resolutions.length > 0 && resolutions.every((item) => item?.status === "matched")).length;
  const blockedIncompletePlans = selectedPlanResolutionSets.length - completePlansWithCatalogCoverage;
  const completePlansWithProjectedCatalogCoverage = selectedPlanResolutionSets
    .filter((resolutions) => resolutions.length > 0 && resolutions.every(resolutionHasProjectedCoverage)).length;
  const blockedIncompleteProjectedPlans = selectedPlanResolutionSets.length
    - completePlansWithProjectedCatalogCoverage;
  const cyclesByEnrollment = new Map();
  const cyclesById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  const workoutsByCycle = new Map();
  for (const cycle of cycles) {
    const rows = cyclesByEnrollment.get(cycle.enrollment_id) || [];
    rows.push(cycle);
    cyclesByEnrollment.set(cycle.enrollment_id, rows);
  }
  for (const workout of workouts) {
    const rows = workoutsByCycle.get(workout.cycle_id) || [];
    rows.push(workout);
    workoutsByCycle.set(workout.cycle_id, rows);
  }

  const nextCycleNumber = new Map();
  for (const enrollmentId of enrollmentIds) {
    const max = Math.max(0, ...(cyclesByEnrollment.get(enrollmentId) || []).map((cycle) => Number(cycle.cycle_number) || 0));
    nextCycleNumber.set(enrollmentId, max + 1);
  }

  const reservedRanges = new Map();
  const operations = [];
  selected.sort((a, b) => `${a.enrollment.id}:${a.plan.source_id}`.localeCompare(`${b.enrollment.id}:${b.plan.source_id}`));

  for (const candidate of selected) {
    const { plan, enrollment, company_id: companyId } = candidate;
    if (plan.source_capture_complete === false || plan.source_empty_session_count > 0 || plan.sessions.length === 0) {
      results.push({
        ref: candidate.ref,
        status: "blocked",
        reason: "source_capture_incomplete",
        match_method: candidate.match_method,
        sessions: plan.sessions.length,
        source_capture_complete: plan.source_capture_complete,
        source_empty_session_count: plan.source_empty_session_count,
      });
      continue;
    }
    if (catalogCoverageBlocked) {
      const planResolutions = planResolutionsFor(plan, companyId);
      if (partitionCompletePlans) {
        const planHasFullCoverage = planResolutions.length > 0
          && planResolutions.every(resolutionHasProjectedCoverage);
        if (!planHasFullCoverage) {
          results.push({
            ref: candidate.ref,
            status: "blocked",
            reason: "partition_plan_catalog_incomplete",
            match_method: candidate.match_method,
            sessions: plan.sessions.length,
          });
          continue;
        }
      } else if (!createMissingExerciseTargets || planResolutions.some((item) =>
        item?.status !== "matched" && !resolutionCanCreateTarget(item))) {
        const reason = reasonForPlanResolutions(planResolutions, createMissingExerciseTargets);
        results.push({ ref: candidate.ref, status: "blocked", reason, match_method: candidate.match_method, sessions: plan.sessions.length });
        continue;
      }
    }
    const durationWeeks = Math.max(1, Number(plan.duration_weeks) || durationFallback);
    const startDate = plan.start_date || parsedToday;
    const endDate = plan.end_date && plan.end_date >= startDate
      ? plan.end_date
      : addDays(startDate, durationWeeks * 7 - 1);
    const normalizedPlan = {
      source_id: plan.source_id,
      name: plan.name,
      objective: plan.objective,
      start_date: startDate,
      end_date: endDate,
      sessions: plan.sessions,
    };
    const payloadHash = sha256(stableStringify(normalizedPlan));
    const marker = markerFor(payloadHash);
    const deterministicCycleId = deterministicUuid(IMPORT_VERSION, "cycle", companyId, enrollment.id, plan.source_id, payloadHash);
    const existingCycle = cyclesById.get(deterministicCycleId);
    const enrollmentCycles = cyclesByEnrollment.get(enrollment.id) || [];
    const markerWorkouts = enrollmentCycles
      .flatMap((cycle) => workoutsByCycle.get(cycle.id) || [])
      .filter((workout) => markerMatches(workout.notes, marker));

    const markerCycleIds = [...new Set(markerWorkouts.map((workout) => workout.cycle_id))];
    if (markerCycleIds.length > 1) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "marker_spans_multiple_cycles", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }
    const markerCycle = markerCycleIds.length ? cyclesById.get(markerCycleIds[0]) : null;
    if (existingCycle && markerCycle && existingCycle.id !== markerCycle.id) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "marker_cycle_mismatch", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    const deterministicWorkouts = existingCycle ? (workoutsByCycle.get(existingCycle.id) || []) : [];
    if (deterministicWorkouts.some((workout) => workoutHasMaterialization(workout) && !markerMatches(workout.notes, marker))) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "deterministic_cycle_has_workouts", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    const materializedOverlaps = enrollmentCycles.filter((cycle) =>
      cycle.id !== existingCycle?.id
      && cycle.id !== markerCycle?.id
      && rangesOverlap(startDate, endDate, cycle.start_date, cycle.end_date)
      && (workoutsByCycle.get(cycle.id) || []).some(workoutHasMaterialization));
    let mergeTargetCycle = null;
    if (mergeOverlapIntoActiveCycle && !existingCycle && !markerCycle && materializedOverlaps.length) {
      const activeCoveringTargets = materializedOverlaps.filter((cycle) =>
        cleanText(cycle.status).toLocaleLowerCase("pt-BR") === "active"
        && cycle.enrollment_id === enrollment.id
        && cycle.company_id === companyId
        && (!cycle.student_id || cycle.student_id === candidate.student.id)
        && cycle.start_date <= parsedToday
        && parsedToday <= cycle.end_date);
      if (activeCoveringTargets.length !== 1) {
        results.push({
          ref: candidate.ref,
          status: "blocked",
          reason: "merge_overlap_active_cycle_not_unique_or_not_covering",
          match_method: candidate.match_method,
          sessions: plan.sessions.length,
          marker: payloadHash.slice(0, 16),
        });
        continue;
      }
      [mergeTargetCycle] = activeCoveringTargets;
    }

    let reusableCycle = existingCycle || markerCycle || mergeTargetCycle
      ? { cycle: existingCycle || markerCycle || mergeTargetCycle, ambiguous: false }
      : chooseReusableEmptyCycle(enrollmentCycles, workoutsByCycle, startDate, endDate, parsedToday);
    if (reusableCycle.ambiguous && createNewCycleOnAmbiguousEmpty) {
      reusableCycle = { cycle: null, ambiguous: false };
    }
    if (reusableCycle.ambiguous) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "ambiguous_empty_cycle_reuse", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }
    const targetExistingCycle = existingCycle || markerCycle || mergeTargetCycle || reusableCycle.cycle;
    const mergingIntoActiveCycle = Boolean(
      mergeTargetCycle
      || (mergeOverlapIntoActiveCycle && markerCycle && markerWorkouts.length),
    );
    if (targetExistingCycle && (
      targetExistingCycle.enrollment_id !== enrollment.id
      || targetExistingCycle.company_id !== companyId
      || (targetExistingCycle.student_id && targetExistingCycle.student_id !== candidate.student.id)
    )) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "cycle_ownership_mismatch", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }
    const targetCycleId = targetExistingCycle?.id || deterministicCycleId;

    const overlapping = enrollmentCycles.some((cycle) =>
      cycle.id !== targetCycleId
      && rangesOverlap(startDate, endDate, cycle.start_date, cycle.end_date)
      && (workoutsByCycle.get(cycle.id) || []).some(workoutHasMaterialization));
    if (overlapping && !mergingIntoActiveCycle) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "overlapping_cycle_with_workouts", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }
    const reserved = reservedRanges.get(enrollment.id) || [];
    if (reserved.some((range) => rangesOverlap(startDate, endDate, range.start, range.end))) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "overlapping_plan_in_same_import", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    const exerciseIds = new Map();
    const exerciseTargetsById = new Map();
    for (const exercise of plan.sessions.flatMap((session) => session.exercises)) {
      const normalizedExerciseName = normalizeCatalogName(exercise.name);
      if (exerciseIds.has(normalizedExerciseName)) continue;
      const resolution = exerciseResolution.get(`${companyId}\u0000${normalizedExerciseName}`);
      if (resolution?.status === "matched") {
        exerciseIds.set(normalizedExerciseName, resolution.id);
        continue;
      }
      if (createMissingExerciseTargets && resolutionCanCreateTarget(resolution)) {
        const target = createdExerciseTargetRow(companyId, exercise.name);
        exerciseIds.set(normalizedExerciseName, target.id);
        exerciseTargetsById.set(target.id, target);
        continue;
      }
    }

    const cycleNumber = targetExistingCycle?.cycle_number || nextCycleNumber.get(enrollment.id);
    if (!targetExistingCycle) nextCycleNumber.set(enrollment.id, cycleNumber + 1);
    const hasOtherActiveCycle = enrollmentCycles.some((cycle) =>
      cycle.id !== targetCycleId && cleanText(cycle.status).toLocaleLowerCase("pt-BR") === "active");
    const newCycleStatus = endDate < parsedToday
      ? "completed"
      : startDate > parsedToday || hasOtherActiveCycle
        ? "pending"
        : "active";
    const cycle = targetExistingCycle || {
      id: targetCycleId,
      enrollment_id: enrollment.id,
      student_id: candidate.student.id,
      company_id: companyId,
      cycle_number: cycleNumber,
      start_date: startDate,
      end_date: endDate,
      status: newCycleStatus,
      name: plan.name,
      objective: plan.objective || null,
      duration_weeks: Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`) + 86400000) / (7 * 86400000))),
      delivery_status: "sent",
    };
    const existingTargetWorkouts = workoutsByCycle.get(targetCycleId) || [];
    const markerBaseSortOrders = markerWorkouts
      .map((workout) => {
        const sessionIndex = plan.sessions.findIndex((session, index) =>
          deterministicUuid(IMPORT_VERSION, "workout", targetCycleId, session.source_id, index) === workout.id);
        return sessionIndex >= 0 ? (Number(workout.sort_order) || 0) - sessionIndex - 1 : null;
      })
      .filter((value) => value !== null);
    const preservedMarkerBaseSortOrder = markerBaseSortOrders.length
      && new Set(markerBaseSortOrders).size === 1
      ? markerBaseSortOrders[0]
      : null;
    const mergeBaseSortOrder = mergingIntoActiveCycle
      ? preservedMarkerBaseSortOrder ?? Math.max(0, ...existingTargetWorkouts
          .filter((workout) => !markerMatches(workout.notes, marker))
          .map((workout) => Number(workout.sort_order) || 0))
      : 0;
    const workoutRows = plan.sessions.map((session, sessionIndex) => ({
      id: deterministicUuid(IMPORT_VERSION, "workout", targetCycleId, session.source_id, sessionIndex),
      cycle_id: targetCycleId,
      company_id: companyId,
      name: session.name,
      title: session.name,
      description: session.description || session.notes || null,
      day_of_week: session.day_of_week,
      sort_order: mergeBaseSortOrder + sessionIndex + 1,
      exercises: session.exercises.map((exercise) =>
        exerciseJson(exercise, exerciseIds.get(normalizeCatalogName(exercise.name)))),
      notes: [marker, session.notes].filter(Boolean).join("\n"),
    }));
    const normalizedRows = workoutRows.flatMap((workout, workoutIndex) =>
      plan.sessions[workoutIndex].exercises.map((exercise, exerciseIndex) => ({
        ...(db.normalizedSupport.has_id
          ? { id: deterministicUuid(IMPORT_VERSION, "workout-exercise", workout.id, exerciseIndex) }
          : {}),
        workout_id: workout.id,
        exercise_id: exerciseIds.get(normalizeCatalogName(exercise.name)),
        exercise_name: exercise.name,
        exercise_order: exerciseIndex,
        sets: Number.parseInt(exercise.sets, 10) || 0,
        reps: exercise.reps,
        rest_seconds: restSeconds(exercise.rest),
        notes: exercise.notes || null,
      })),
    );

    const expectedWorkoutIds = new Set(workoutRows.map((workout) => workout.id));
    const relevantExistingTargetWorkouts = mergingIntoActiveCycle
      ? existingTargetWorkouts.filter((workout) => expectedWorkoutIds.has(workout.id))
      : existingTargetWorkouts;
    const existingWorkoutAnalysis = analyzeWorkoutRows(relevantExistingTargetWorkouts, workoutRows);
    if (existingWorkoutAnalysis.conflict) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "cycle_contains_different_workouts", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    let repairKind = relevantExistingTargetWorkouts.length ? "partial_workouts" : null;
    if (existingWorkoutAnalysis.missing.length === 0) {
      if (!db.normalizedSupport.available) {
        results.push({ ref: candidate.ref, status: "already_imported", reason: null, match_method: candidate.match_method, sessions: plan.sessions.length, exercises: normalizedRows.length, marker: payloadHash.slice(0, 16) });
        continue;
      }
      const workoutIds = new Set(workoutRows.map((workout) => workout.id));
      const existingMirror = existingNormalizedRows.filter((row) => workoutIds.has(row.workout_id));
      const mirrorAnalysis = analyzeNormalizedRows(existingMirror, normalizedRows, db.normalizedSupport.has_id);
      if (mirrorAnalysis.conflict) {
        results.push({ ref: candidate.ref, status: "blocked", reason: "normalized_mirror_conflict", match_method: candidate.match_method, sessions: plan.sessions.length, exercises: normalizedRows.length, marker: payloadHash.slice(0, 16) });
        continue;
      }
      if (mirrorAnalysis.missing.length === 0) {
        results.push({ ref: candidate.ref, status: "already_imported", reason: null, match_method: candidate.match_method, sessions: plan.sessions.length, exercises: normalizedRows.length, marker: payloadHash.slice(0, 16) });
        continue;
      }
      repairKind = "normalized_mirror";
    }

    reserved.push({ start: startDate, end: endDate });
    reservedRanges.set(enrollment.id, reserved);
    operations.push({
      ref: candidate.ref,
      match_method: candidate.match_method,
      marker,
      marker_hash: payloadHash.slice(0, 16),
      repair_kind: repairKind,
      merge_overlap_into_active_cycle: mergingIntoActiveCycle,
      source_start_date: startDate,
      source_end_date: endDate,
      merge_reference_date: parsedToday,
      exercise_targets: [...exerciseTargetsById.values()],
      cycle,
      workouts: workoutRows,
      workout_exercises: normalizedRows,
    });
  }

  const exerciseTargetActions = [];
  const exerciseLibraryIdsCreated = [];
  for (const operation of operations) {
    if (!apply) {
      for (const target of operation.exercise_targets || []) {
        exerciseTargetActions.push(targetActionFromRow(target, "planned_created_target"));
      }
      results.push({
        ref: operation.ref,
        status: operation.repair_kind === "normalized_mirror"
          ? "planned_normalized_repair"
          : operation.repair_kind === "partial_workouts"
            ? "planned_partial_repair"
            : "planned",
        reason: null,
        match_method: operation.match_method,
        sessions: operation.workouts.length,
        exercises: operation.workout_exercises.length,
        marker: operation.marker_hash,
      });
      continue;
    }
    const outcome = await applyOperation(db, operation);
    exerciseTargetActions.push(...(outcome.exercise_target_actions || []));
    exerciseLibraryIdsCreated.push(...(outcome.exercise_library_ids_created || []));
    results.push({
      ref: operation.ref,
      status: outcome.status === "imported" && operation.repair_kind === "normalized_mirror"
        ? "normalized_repaired"
        : outcome.status === "imported" && operation.repair_kind === "partial_workouts"
          ? "partial_repaired"
          : outcome.status,
      reason: outcome.reason || null,
      match_method: operation.match_method,
      sessions: operation.workouts.length,
      exercises: operation.workout_exercises.length,
      marker: operation.marker_hash,
    });
  }

  const statuses = summarizeResults(results);
  const nameOnlyMatchesBlocked = results.filter((result) =>
    result.reason === "name_only_match_disallowed"
    || result.reason === "plan_client_name_only_match_disallowed").length;
  const sourceCaptureIncompletePlans = results.filter((result) =>
    result.reason === "source_capture_incomplete").length;
  const exerciseSimilarityCandidates = exerciseCoverage
    .map((item) => item.similarity)
    .filter(Boolean)
    .sort((a, b) =>
      cleanText(a.source_name).localeCompare(cleanText(b.source_name), "pt-BR")
      || cleanText(a.candidate_exercise_id).localeCompare(cleanText(b.candidate_exercise_id)));
  const exerciseTargetStatusPriority = new Map([
    ["created_target", 4],
    ["blocked", 3],
    ["reused_created_target", 2],
    ["planned_created_target", 1],
  ]);
  const exerciseCreatedTargetById = new Map();
  for (const action of exerciseTargetActions) {
    const current = exerciseCreatedTargetById.get(action.target_exercise_id);
    if (!current || (exerciseTargetStatusPriority.get(action.status) || 0)
      > (exerciseTargetStatusPriority.get(current.status) || 0)) {
      exerciseCreatedTargetById.set(action.target_exercise_id, action);
    }
  }
  const exerciseCreatedTargets = [...exerciseCreatedTargetById.values()].sort((a, b) =>
    cleanText(a.source_name).localeCompare(cleanText(b.source_name), "pt-BR")
    || cleanText(a.target_exercise_id).localeCompare(cleanText(b.target_exercise_id)));
  const createdTargetCount = exerciseCreatedTargets.filter((item) => item.status === "created_target").length;
  const plannedCreatedTargetCount = exerciseCreatedTargets.filter((item) => item.status === "planned_created_target").length;
  const reusedCreatedTargetCount = exerciseCreatedTargets.filter((item) => item.status === "reused_created_target").length;
  return {
    version: IMPORT_VERSION,
    mode: apply ? "apply" : "dry-run",
    generated_at: new Date().toISOString(),
    contains_pii: false,
    normalized_mirror: db.normalizedSupport.available
      ? (db.normalizedSupport.has_id ? "enabled_deterministic_ids" : "enabled_preflight")
      : "unavailable_deprecated_table",
    safeguards: [
      "no updates or deletes",
      "only one unambiguous empty overlapping cycle can be reused",
      createNewCycleOnAmbiguousEmpty
        ? "ambiguous empty cycles are left unchanged while a deterministic import cycle is appended"
        : "ambiguous empty cycles remain blocked",
      mergeOverlapIntoActiveCycle
        ? "overlap merge appends only deterministic workouts to exactly one active cycle that covers the audited reference date"
        : "materialized overlapping cycles remain blocked",
      "same marker and payload hash are a no-op",
      "exercise matching is accent/case tolerant within the visible company/global catalog",
      "only versioned high-confidence aliases with an exact visible target id and name are accepted",
      partitionCompletePlans
        ? createMissingExerciseTargets
          ? "explicit partition mode imports only plans with 100% exact or deterministic projected exercise-catalog coverage and blocks incomplete plans"
          : "explicit partition mode imports only plans with 100% deterministic exercise-catalog coverage and blocks incomplete plans"
        : "100% deterministic exercise-catalog coverage is required for the whole batch",
      createMissingExerciseTargets
        ? "exercise-library rows may be appended only as deterministic BN-tenant targets under explicit --create-missing-exercise-targets; no updates or deletes"
        : "exercise-library rows are never created or modified by this migration",
      requestedPlanRefs.size
        ? "only explicitly requested sanitized plan refs are eligible in this batch"
        : "no plan-ref batch filter is active",
      "only assigned active prescription plans are imported; completed-session history is out of scope",
    ],
    summary: {
      sett_students_read: students.length,
      sett_active_students_in_company: activeStudents.length,
      mfit_clients_read: clients.length,
      mfit_plans_read: allPlans.length,
      active_plans_considered: plans.length,
      requested_plan_refs: requestedPlanRefs.size,
      candidate_operations: operations.length,
      exercise_catalog_required: exerciseCoverage.length,
      exercise_catalog_matched: catalogMatched,
      exercise_catalog_missing: catalogMissing,
      exercise_catalog_ambiguous: catalogAmbiguous,
      exercise_catalog_invalid_aliases: catalogInvalidAliases,
      exercise_catalog_similarity_candidates: catalogSimilarityCandidates,
      exercise_catalog_similarity_incompatible: catalogSimilarityIncompatible,
      exercise_catalog_similarity_below_threshold: catalogSimilarityBelowThreshold,
      exercise_catalog_alias_matched: catalogAliasMatched,
      exercise_catalog_created_targets: createdTargetCount,
      exercise_catalog_planned_created_targets: plannedCreatedTargetCount,
      exercise_catalog_reused_created_targets: reusedCreatedTargetCount,
      created_target: createdTargetCount,
      nearest_alias: catalogNearestAliasMatched,
      exercise_aliases_loaded: exerciseAliasIndex.size,
      complete_plans_with_catalog_coverage: completePlansWithCatalogCoverage,
      blocked_incomplete_plans: blockedIncompletePlans,
      complete_plans_with_projected_catalog_coverage: completePlansWithProjectedCatalogCoverage,
      blocked_incomplete_projected_plans: blockedIncompleteProjectedPlans,
      name_only_matches_blocked: nameOnlyMatchesBlocked,
      source_capture_incomplete_plans: sourceCaptureIncompletePlans,
      exercise_catalog_coverage_percent: exerciseCoverage.length
        ? Number(((catalogMatched / exerciseCoverage.length) * 100).toFixed(2))
        : 100,
      exercises_to_create: createdTargetCount + plannedCreatedTargetCount,
      ...statuses,
    },
    exercise_similarity_candidates: exerciseSimilarityCandidates,
    exercise_created_targets: exerciseCreatedTargets,
    rollback_inventory: {
      exercise_library_ids_created: [...new Set(exerciseLibraryIdsCreated)].sort(),
    },
    results,
  };
}

function parseEnvOutput(output) {
  const values = {};
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export function resolveSupabaseConfig(env, cliEnv = {}) {
  const url = env.MFIT_SUPABASE_URL
    || env.TARGET_SUPABASE_URL
    || env.SUPABASE_URL
    || env.VITE_SUPABASE_URL
    || cliEnv.API_URL
    || cliEnv.SUPABASE_URL;
  const serviceRoleKey = env.MFIT_SUPABASE_SERVICE_ROLE_KEY
    || env.TARGET_SUPABASE_SERVICE_ROLE_KEY
    || env.SUPABASE_SERVICE_ROLE_KEY
    || cliEnv.SERVICE_ROLE_KEY;
  return { url: cleanText(url).replace(/\/$/, ""), serviceRoleKey: cleanText(serviceRoleKey) };
}

export function assertCanonicalSupabaseTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Supabase target URL is invalid");
  }
  const projectRef = parsed.hostname.split(".")[0];
  if (parsed.protocol !== "https:" || projectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error("Supabase target is not the canonical SETT project");
  }
}

function loadSupabaseConfig(env = process.env) {
  let config = resolveSupabaseConfig(env);
  if (config.url && config.serviceRoleKey) return config;

  const status = spawnSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.status === 0) config = resolveSupabaseConfig(env, parseEnvOutput(status.stdout));
  if (!config.url || !config.serviceRoleKey) {
    throw new Error(
      "Supabase credentials missing. Export MFIT_SUPABASE_URL and MFIT_SUPABASE_SERVICE_ROLE_KEY, "
      + "or run against a local project available through `supabase status -o env`.",
    );
  }
  return config;
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    help: false,
    settStudents: "",
    mfitClients: "",
    mfitWorkouts: "",
    exerciseAliases: "",
    companyId: "",
    report: "",
    confirmProject: "",
    today: "",
    durationWeeks: 6,
    partitionCompletePlans: false,
    identityContactOnly: false,
    exerciseSimilarityFallback: false,
    createMissingExerciseTargets: false,
    createNewCycleOnAmbiguousEmpty: false,
    mergeOverlapIntoActiveCycle: false,
    includePlanRefs: [],
  };
  const valueFlags = new Map([
    ["--sett-students", "settStudents"],
    ["--mfit-clients", "mfitClients"],
    ["--mfit-workouts", "mfitWorkouts"],
    ["--exercise-aliases", "exerciseAliases"],
    ["--company-id", "companyId"],
    ["--report", "report"],
    ["--confirm-project", "confirmProject"],
    ["--today", "today"],
    ["--duration-weeks", "durationWeeks"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--partition-complete-plans") {
      options.partitionCompletePlans = true;
      continue;
    }
    if (arg === "--identity-contact-only") {
      options.identityContactOnly = true;
      continue;
    }
    if (arg === "--exercise-similarity-fallback") {
      options.exerciseSimilarityFallback = true;
      continue;
    }
    if (arg === "--create-missing-exercise-targets") {
      options.createMissingExerciseTargets = true;
      continue;
    }
    if (arg === "--create-new-cycle-on-ambiguous-empty") {
      options.createNewCycleOnAmbiguousEmpty = true;
      continue;
    }
    if (arg === "--merge-overlap-into-active-cycle") {
      options.mergeOverlapIntoActiveCycle = true;
      continue;
    }
    if (arg === "--include-plan-ref" || arg.startsWith("--include-plan-ref=")) {
      const value = arg.includes("=") ? arg.split("=", 2)[1] : argv[++index];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --include-plan-ref");
      if (!/^[0-9a-f]{12}$/.test(value)) {
        throw new Error("--include-plan-ref must be a 12-character sanitized ref");
      }
      options.includePlanRefs.push(value);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [flag, inline] = arg.split("=", 2);
    const key = valueFlags.get(flag);
    if (!key) throw new Error("Unknown command-line argument");
    const value = inline ?? argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    options[key] = key === "durationWeeks" ? Number(value) : value;
  }
  if (!Number.isFinite(options.durationWeeks) || options.durationWeeks < 1) {
    throw new Error("--duration-weeks must be a positive number");
  }
  if (options.apply && options.confirmProject !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(`--apply requires --confirm-project ${EXPECTED_SUPABASE_PROJECT_REF}`);
  }
  options.includePlanRefs = [...new Set(options.includePlanRefs)];
  if (options.includePlanRefs.length > 5) {
    throw new Error("At most 5 --include-plan-ref values are allowed per batch");
  }
  if (options.apply && options.createMissingExerciseTargets && options.includePlanRefs.length === 0) {
    throw new Error("--apply with target creation requires 1-5 explicit --include-plan-ref values");
  }
  if (options.apply && options.createNewCycleOnAmbiguousEmpty && options.includePlanRefs.length === 0) {
    throw new Error("--apply with ambiguous-empty cycle creation requires 1-5 explicit --include-plan-ref values");
  }
  if (options.apply && options.mergeOverlapIntoActiveCycle && options.includePlanRefs.length === 0) {
    throw new Error("--apply with active-cycle overlap merge requires 1-5 explicit --include-plan-ref values");
  }
  return options;
}

const USAGE = `
Usage:
  node scripts/mfit-active-workouts-migration.mjs \\
    --sett-students <sett-students.json> \\
    --mfit-clients <mfit-clients.json> \\
    --mfit-workouts <mfit-active-workouts.json> \\
    [--exercise-aliases <mfit-exercise-aliases.v1.json>] \\
    --company-id <canonical-bn-company-uuid> \\
    [--partition-complete-plans] \\
    [--identity-contact-only] \\
    [--exercise-similarity-fallback] \\
    [--create-missing-exercise-targets] \\
    [--create-new-cycle-on-ambiguous-empty] \\
    [--merge-overlap-into-active-cycle] \\
    [--include-plan-ref <12-char-sanitized-ref>]... \\
    [--report <sanitized-report.json>] [--today YYYY-MM-DD] [--duration-weeks 6]
    [--apply --confirm-project ${EXPECTED_SUPABASE_PROJECT_REF}]

Safety:
  Dry-run is the default. Database writes require both --apply and the canonical project confirmation.
  Operational authorization from Matheus via ATENA is still mandatory before using those flags.
  Credentials are read from process environment or supabase status -o env; no .env file is read or written.
  By default, any unresolved exercise blocks the whole batch. --partition-complete-plans only allows
  plans with 100% deterministic catalog coverage to proceed and blocks incomplete plans.
  --identity-contact-only disables exact-name-only identity matching; phone/email evidence remains accepted.
  --exercise-similarity-fallback is audit-only: it records nearest visible tenant/global candidates and still blocks.
  --create-missing-exercise-targets explicitly appends deterministic BN-tenant exercise-library targets for eligible plans.
  --create-new-cycle-on-ambiguous-empty leaves all empty cycles untouched and appends the deterministic import cycle.
  --merge-overlap-into-active-cycle appends deterministic MFIT workouts only to one covering active cycle.
  Apply with target or cycle creation requires 1-5 explicit sanitized plan refs.
`;

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${label} is not valid readable JSON`);
  }
}

async function writeSanitizedReport(path, report) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!options.settStudents || !options.mfitClients || !options.mfitWorkouts || !options.companyId) {
    throw new Error("--sett-students, --mfit-clients, --mfit-workouts and --company-id are required");
  }

  const [settPayload, mfitClientsPayload, mfitWorkoutsPayload, exerciseAliasPayload] = await Promise.all([
    readJson(options.settStudents, "SETT students input"),
    readJson(options.mfitClients, "MFIT clients input"),
    readJson(options.mfitWorkouts, "MFIT workouts input"),
    options.exerciseAliases
      ? readJson(options.exerciseAliases, "MFIT exercise aliases input")
      : Promise.resolve({ schema_version: 1, contains_pii: false, aliases: [] }),
  ]);
  const config = loadSupabaseConfig();
  assertCanonicalSupabaseTarget(config.url);
  const schema = await fetchOpenApiSchema(config.url, config.serviceRoleKey);
  validateSchema(schema);
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const db = createSupabaseAdapter(client, schema);
  const report = await runMigration({
    settPayload,
    mfitClientsPayload,
    mfitWorkoutsPayload,
    exerciseAliasPayload,
    db,
    companyId: options.companyId,
    apply: options.apply,
    partitionCompletePlans: options.partitionCompletePlans,
    identityContactOnly: options.identityContactOnly,
    exerciseSimilarityFallback: options.exerciseSimilarityFallback,
    createMissingExerciseTargets: options.createMissingExerciseTargets,
    createNewCycleOnAmbiguousEmpty: options.createNewCycleOnAmbiguousEmpty,
    mergeOverlapIntoActiveCycle: options.mergeOverlapIntoActiveCycle,
    includePlanRefs: options.includePlanRefs,
    today: options.today || businessToday(),
    defaultDurationWeeks: options.durationWeeks,
  });
  if (options.report) await writeSanitizedReport(options.report, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const unsafeOutcomes = (report.summary.blocked || 0) + (report.summary.partial_retry_required || 0);
  return options.apply && unsafeOutcomes > 0 ? 2 : 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "MFIT migration failed"}\n`);
      process.exitCode = 1;
    });
}
