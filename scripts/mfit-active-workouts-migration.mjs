#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const IMPORT_VERSION = "mfit-active-workouts-v1";
export const MARKER_PREFIX = "mfit-import:v1:";

const ACTIVE_ENROLLMENT_STATUSES = ["active", "awaiting_training", "awaiting_renewal"];
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

  return {
    sets: repetition.sets || String(actual.length),
    reps: repetition.reps || numericString(firstValue(first, ["reps", "repetitions", "repeticoes"]), ""),
    rest: rests[0] || normalizeRest(first),
    tempo: tempos[0] || "",
    notes: notes.join(" | "),
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
  const status = cleanText(firstValue(row, ["status", "state", "situacao", "situação"])).toLowerCase();
  return status ? INACTIVE_PLAN_STATUSES.has(status) : false;
}

export function normalizeMfitPlans(payload) {
  const rawPlans = [];
  collectRawPlans(payload, { client_ids: [], contact: null }, rawPlans);
  return rawPlans.flatMap(({ row, sessions, context }, input_index) => {
    const normalizedSessions = sessions.map(normalizeMfitSession).filter((session) => session.exercises.length > 0);
    if (!normalizedSessions.length) return [];
    const planCore = {
      source_id: cleanText(firstValue(row, ["id", "plan_id", "planId", "ficha_id", "fichaId", "objectID"]))
        || `plan-${sha256(stableStringify(normalizedSessions)).slice(0, 20)}`,
      name: cleanText(firstValue(row, ["name", "nome", "title", "titulo"])) || "Ficha MFIT",
      objective: cleanText(firstValue(row, ["objective", "objetivo", "goal", "focus"])),
      start_date: parseYmd(firstValue(row, ["start_date", "startDate", "data_inicio", "starts_at"])),
      end_date: parseYmd(firstValue(row, ["end_date", "endDate", "data_fim", "ends_at"])),
      duration_weeks: Number(firstValue(row, ["duration_weeks", "durationWeeks", "semanas", "weeks"])) || null,
      active: !explicitlyInactive(row),
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

function matchContact(source, indexes, sourceNameCount = 1) {
  const phoneCandidates = uniqueCandidates(indexes.phone, source.phones);
  if (phoneCandidates.length === 1) return { row: phoneCandidates[0], method: "phone" };
  if (phoneCandidates.length > 1) return { reason: "ambiguous_phone" };

  const emailCandidates = uniqueCandidates(indexes.email, source.emails);
  if (emailCandidates.length === 1) return { row: emailCandidates[0], method: "email" };
  if (emailCandidates.length > 1) return { reason: "ambiguous_email" };

  if (source.exact_name && sourceNameCount === 1) {
    const nameCandidates = indexes.name.get(source.exact_name) || [];
    if (nameCandidates.length === 1) return { row: nameCandidates[0], method: "exact_unique_name" };
    if (nameCandidates.length > 1) return { reason: "ambiguous_name" };
  }
  return { reason: "no_match" };
}

export function matchMfitClientsToSett(mfitClients, settStudents) {
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
    const result = matchContact(client, targetIndexes, sourceNameCounts.get(client.exact_name) || 0);
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

function resolvePlanClient(plan, lookup) {
  if (plan.client_id) {
    const candidates = lookup.byId.get(plan.client_id) || [];
    if (candidates.length === 1) return { client: candidates[0] };
    if (candidates.length > 1) return { reason: "ambiguous_mfit_client_id" };
  }
  if (plan.contact) {
    const result = matchContact(plan.contact, lookup.indexes, lookup.nameCounts.get(plan.contact.exact_name) || 0);
    if (result.row) return { client: result.row };
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
    ...(exercise.method ? { method: exercise.method } : {}),
    ...(exercise.group_id ? { group_id: exercise.group_id } : {}),
    ...(exercise.method_seconds ? { method_seconds: exercise.method_seconds } : {}),
    ...(exercise.tempo ? { tempo: exercise.tempo } : {}),
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

  const selectByIds = (table, select, column, ids) => inBatches(ids, async (batch) => {
    const { data, error } = await client.from(table).select(select).in(column, batch);
    if (error) throw safeDbError(`${table} select`, error);
    return data || [];
  });

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

  return {
    normalizedSupport: { available: normalizedAvailable, has_id: normalizedHasId },
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
        () => client.from("exercise_library").select("id,company_id,name,is_global").eq("is_global", true),
        "exercise_library select",
      );
      const companyRows = [];
      for (const companyId of [...new Set(companyIds.filter(Boolean))]) {
        companyRows.push(...await fetchAllPages(
          () => client.from("exercise_library").select("id,company_id,name,is_global").eq("company_id", companyId),
          "exercise_library select",
        ));
      }
      return [...globalRows, ...companyRows];
    },
    async getExercisesByIds(ids) {
      return selectByIds("exercise_library", "id,company_id,name,is_global", "id", ids);
    },
    async getWorkoutExercises(workoutIds) {
      if (!normalizedAvailable) return [];
      const select = `${normalizedHasId ? "id," : ""}${NORMALIZED_SCHEMA.join(",")}`;
      return selectByIds("workout_exercises", select, "workout_id", workoutIds);
    },
    insertExercises(rows) {
      return insertIgnoringIds("exercise_library", rows, "id,company_id,name,is_global");
    },
    insertCycles(rows) {
      return insertIgnoringIds("training_cycles", rows, "id,enrollment_id,cycle_number");
    },
    insertWorkouts(rows) {
      return insertIgnoringIds("workouts", rows, "id,cycle_id,notes,exercises");
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

function normalizedRowsFromMaterializedWorkouts(workouts, hasId) {
  return workouts.flatMap((workout) => (Array.isArray(workout.exercises) ? workout.exercises : []).map((exercise, index) => ({
    ...(hasId
      ? { id: deterministicUuid(IMPORT_VERSION, "workout-exercise", workout.id, index) }
      : {}),
    workout_id: workout.id,
    exercise_id: exercise.exercise_id,
    exercise_name: cleanText(exercise.exercise_name || exercise.name),
    exercise_order: index,
    sets: Number.parseInt(cleanText(exercise.sets), 10) || 0,
    reps: cleanText(exercise.reps),
    rest_seconds: restSeconds(exercise.rest),
    notes: cleanText(exercise.notes) || null,
  })));
}

function operationAlreadyMaterialized(workouts, operation) {
  if (workouts.length !== operation.workouts.length) return false;
  const byId = new Map(workouts.map((row) => [row.id, row]));
  return operation.workouts.every((expected) => {
    const existing = byId.get(expected.id);
    return existing && markerMatches(existing.notes, operation.marker) && isMaterialized(existing);
  });
}

async function applyOperation(db, operation) {
  const currentCycles = await db.getCyclesByIds([operation.cycle.id]);
  let cycle = currentCycles[0] || null;

  if (!cycle) {
    const siblingCycles = await db.getCycles([operation.cycle.enrollment_id]);
    const siblingWorkouts = await db.getWorkouts(siblingCycles.map((row) => row.id));
    const workoutsByCycle = new Map();
    for (const workout of siblingWorkouts) {
      const rows = workoutsByCycle.get(workout.cycle_id) || [];
      rows.push(workout);
      workoutsByCycle.set(workout.cycle_id, rows);
    }
    const conflict = siblingCycles.some((row) =>
      rangesOverlap(operation.cycle.start_date, operation.cycle.end_date, row.start_date, row.end_date)
      && (workoutsByCycle.get(row.id) || []).some(isMaterialized));
    if (conflict) return { status: "blocked", reason: "concurrent_materialized_cycle" };

    await db.insertCycles([operation.cycle]);
    cycle = (await db.getCyclesByIds([operation.cycle.id]))[0] || null;
    if (!cycle) return { status: "partial_retry_required", reason: "cycle_insert_not_visible" };
  }

  if (cycle.enrollment_id !== operation.cycle.enrollment_id || cycle.company_id !== operation.cycle.company_id) {
    return { status: "blocked", reason: "deterministic_cycle_collision" };
  }

  let currentWorkouts = await db.getWorkouts([cycle.id]);
  if (currentWorkouts.length) {
    if (!operationAlreadyMaterialized(currentWorkouts, operation)) {
      return { status: "blocked", reason: "cycle_contains_different_workouts" };
    }
  } else {
    await db.insertWorkouts(operation.workouts);
    currentWorkouts = await db.getWorkoutsByIds(operation.workouts.map((row) => row.id));
    if (!operationAlreadyMaterialized(currentWorkouts, operation)) {
      return { status: "partial_retry_required", reason: "workout_insert_incomplete" };
    }
  }

  if (db.normalizedSupport.available) {
    const existingEntries = await db.getWorkoutExercises(operation.workouts.map((row) => row.id));
    if (existingEntries.length) {
      if (!sameNormalizedRows(existingEntries, operation.workout_exercises)) {
        return { status: "partial_retry_required", reason: "normalized_mirror_conflict" };
      }
    } else {
      await db.insertWorkoutExercises(operation.workout_exercises);
      const insertedEntries = await db.getWorkoutExercises(operation.workouts.map((row) => row.id));
      if (!sameNormalizedRows(insertedEntries, operation.workout_exercises)) {
        return { status: "partial_retry_required", reason: "normalized_mirror_incomplete" };
      }
    }
  }

  return { status: "imported" };
}

export async function runMigration({
  settPayload,
  mfitClientsPayload,
  mfitWorkoutsPayload,
  db,
  apply = false,
  today = businessToday(),
  defaultDurationWeeks = 6,
}) {
  const parsedToday = parseYmd(today);
  if (!parsedToday) throw new Error("Invalid --today date; expected YYYY-MM-DD");
  const durationFallback = Math.max(1, Number(defaultDurationWeeks) || 6);
  const students = normalizeSettStudents(settPayload);
  const clients = normalizeMfitClients(mfitClientsPayload);
  const allPlans = normalizeMfitPlans(mfitWorkoutsPayload);
  const plans = allPlans.filter((plan) => plan.active);
  const clientMatches = matchMfitClientsToSett(clients, students);
  const clientLookup = buildMfitClientLookup(clients);
  const results = [];

  const candidates = [];
  for (const plan of plans) {
    const clientResult = resolvePlanClient(plan, clientLookup);
    const ref = anonymousRef(plan.client_id || plan.input_index, plan.source_id);
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
    if (candidate.student.company_id && candidate.student.company_id !== enrollment.company_id) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "student_enrollment_company_mismatch", match_method: candidate.match_method, sessions: candidate.plan.sessions.length });
      continue;
    }
    selected.push({ ...candidate, enrollment, company_id: enrollment.company_id });
  }

  const enrollmentIds = [...new Set(selected.map((candidate) => candidate.enrollment.id))];
  const cycles = await db.getCycles(enrollmentIds);
  const workouts = await db.getWorkouts(cycles.map((cycle) => cycle.id));
  const catalog = await db.getExercises([...new Set(selected.map((candidate) => candidate.company_id))]);
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
  const newExercises = new Map();
  const operations = [];
  selected.sort((a, b) => `${a.enrollment.id}:${a.plan.source_id}`.localeCompare(`${b.enrollment.id}:${b.plan.source_id}`));

  for (const candidate of selected) {
    const { plan, enrollment, company_id: companyId } = candidate;
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

    if (markerWorkouts.length === plan.sessions.length && markerWorkouts.every(isMaterialized)) {
      const expectedMirror = normalizedRowsFromMaterializedWorkouts(markerWorkouts, db.normalizedSupport.has_id);
      if (!db.normalizedSupport.available) {
        results.push({ ref: candidate.ref, status: "already_imported", reason: null, match_method: candidate.match_method, sessions: plan.sessions.length, exercises: expectedMirror.length, marker: payloadHash.slice(0, 16) });
        continue;
      }
      const existingMirror = await db.getWorkoutExercises(markerWorkouts.map((workout) => workout.id));
      if (sameNormalizedRows(existingMirror, expectedMirror)) {
        results.push({ ref: candidate.ref, status: "already_imported", reason: null, match_method: candidate.match_method, sessions: plan.sessions.length, exercises: expectedMirror.length, marker: payloadHash.slice(0, 16) });
        continue;
      }
      if (existingMirror.length > 0) {
        results.push({ ref: candidate.ref, status: "blocked", reason: "normalized_mirror_conflict", match_method: candidate.match_method, sessions: plan.sessions.length, exercises: expectedMirror.length, marker: payloadHash.slice(0, 16) });
        continue;
      }
      if (apply) {
        await db.insertWorkoutExercises(expectedMirror);
        const repairedMirror = await db.getWorkoutExercises(markerWorkouts.map((workout) => workout.id));
        if (!sameNormalizedRows(repairedMirror, expectedMirror)) {
          results.push({ ref: candidate.ref, status: "partial_retry_required", reason: "normalized_mirror_incomplete", match_method: candidate.match_method, sessions: plan.sessions.length, exercises: expectedMirror.length, marker: payloadHash.slice(0, 16) });
          continue;
        }
        results.push({ ref: candidate.ref, status: "normalized_repaired", reason: null, match_method: candidate.match_method, sessions: plan.sessions.length, exercises: expectedMirror.length, marker: payloadHash.slice(0, 16) });
      } else {
        results.push({ ref: candidate.ref, status: "planned_normalized_repair", reason: null, match_method: candidate.match_method, sessions: plan.sessions.length, exercises: expectedMirror.length, marker: payloadHash.slice(0, 16) });
      }
      continue;
    }
    if (markerWorkouts.length) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "incomplete_existing_marker", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    const deterministicWorkouts = existingCycle ? (workoutsByCycle.get(existingCycle.id) || []) : [];
    if (deterministicWorkouts.some(isMaterialized)) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "deterministic_cycle_has_workouts", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    const reusableCycle = existingCycle
      ? { cycle: existingCycle, ambiguous: false }
      : chooseReusableEmptyCycle(enrollmentCycles, workoutsByCycle, startDate, endDate, parsedToday);
    if (reusableCycle.ambiguous) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "ambiguous_empty_cycle_reuse", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }
    const targetExistingCycle = existingCycle || reusableCycle.cycle;
    const targetCycleId = targetExistingCycle?.id || deterministicCycleId;

    const overlapping = enrollmentCycles.some((cycle) =>
      cycle.id !== targetCycleId
      && rangesOverlap(startDate, endDate, cycle.start_date, cycle.end_date)
      && (workoutsByCycle.get(cycle.id) || []).some(isMaterialized));
    if (overlapping) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "overlapping_cycle_with_workouts", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }
    const reserved = reservedRanges.get(enrollment.id) || [];
    if (reserved.some((range) => rangesOverlap(startDate, endDate, range.start, range.end))) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "overlapping_plan_in_same_import", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
    }

    const exerciseIds = new Map();
    const exerciseRowsForPlan = new Map();
    let exerciseConflict = false;
    for (const exercise of plan.sessions.flatMap((session) => session.exercises)) {
      if (exerciseIds.has(exercise.name)) continue;
      const candidatesByName = catalogCandidates(catalog, companyId, exercise.name);
      if (candidatesByName.length > 1) {
        exerciseConflict = true;
        break;
      }
      if (candidatesByName.length === 1) {
        exerciseIds.set(exercise.name, candidatesByName[0].id);
        continue;
      }
      const key = `${companyId}\u0000${exercise.name}`;
      const existingDraft = newExercises.get(key) || exerciseRowsForPlan.get(key);
      const id = existingDraft?.id || deterministicUuid(IMPORT_VERSION, "exercise", companyId, exercise.name);
      const sourceMarker = sha256(`${companyId}\u0000${exercise.source_id}\u0000${exercise.name}`).slice(0, 16);
      const description = [exercise.description, "Importado do MFIT; revisar metadados", `Marker: mfit-exercise:v1:${sourceMarker}`]
        .filter(Boolean)
        .join("\n");
      const row = existingDraft || {
        id,
        company_id: companyId,
        name: exercise.name,
        description,
        muscle_group: exercise.muscle_group,
        equipment: exercise.equipment || null,
        difficulty: exercise.difficulty || "intermediate",
        video_url: exercise.video_url || null,
        thumbnail_url: exercise.thumbnail_url || null,
        is_global: false,
      };
      exerciseRowsForPlan.set(key, row);
      exerciseIds.set(exercise.name, id);
    }
    if (exerciseConflict) {
      results.push({ ref: candidate.ref, status: "blocked", reason: "ambiguous_exact_exercise_name", match_method: candidate.match_method, sessions: plan.sessions.length, marker: payloadHash.slice(0, 16) });
      continue;
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
    const workoutRows = plan.sessions.map((session, sessionIndex) => ({
      id: deterministicUuid(IMPORT_VERSION, "workout", targetCycleId, session.source_id, sessionIndex),
      cycle_id: targetCycleId,
      company_id: companyId,
      name: session.name,
      title: session.name,
      description: session.description || session.notes || null,
      day_of_week: session.day_of_week,
      sort_order: sessionIndex + 1,
      exercises: session.exercises.map((exercise) => exerciseJson(exercise, exerciseIds.get(exercise.name))),
      notes: [marker, session.notes].filter(Boolean).join("\n"),
    }));
    const normalizedRows = workoutRows.flatMap((workout, workoutIndex) =>
      plan.sessions[workoutIndex].exercises.map((exercise, exerciseIndex) => ({
        ...(db.normalizedSupport.has_id
          ? { id: deterministicUuid(IMPORT_VERSION, "workout-exercise", workout.id, exerciseIndex) }
          : {}),
        workout_id: workout.id,
        exercise_id: exerciseIds.get(exercise.name),
        exercise_name: exercise.name,
        exercise_order: exerciseIndex,
        sets: Number.parseInt(exercise.sets, 10) || 0,
        reps: exercise.reps,
        rest_seconds: restSeconds(exercise.rest),
        notes: exercise.notes || null,
      })),
    );

    for (const [key, row] of exerciseRowsForPlan) newExercises.set(key, row);
    reserved.push({ start: startDate, end: endDate });
    reservedRanges.set(enrollment.id, reserved);
    operations.push({
      ref: candidate.ref,
      match_method: candidate.match_method,
      marker,
      marker_hash: payloadHash.slice(0, 16),
      cycle,
      workouts: workoutRows,
      workout_exercises: normalizedRows,
    });
  }

  let createdExercises = 0;
  if (apply && newExercises.size) {
    const rows = [...newExercises.values()];
    await db.insertExercises(rows);
    const verified = await db.getExercisesByIds(rows.map((row) => row.id));
    const byId = new Map(verified.map((row) => [row.id, row]));
    for (const row of rows) {
      const actual = byId.get(row.id);
      if (!actual || actual.company_id !== row.company_id || cleanText(actual.name) !== row.name || actual.is_global === true) {
        throw new Error("Exercise insert verification failed without overwriting existing rows");
      }
    }
    createdExercises = rows.length;
  }

  for (const operation of operations) {
    if (!apply) {
      results.push({
        ref: operation.ref,
        status: "planned",
        reason: null,
        match_method: operation.match_method,
        sessions: operation.workouts.length,
        exercises: operation.workout_exercises.length,
        marker: operation.marker_hash,
      });
      continue;
    }
    const outcome = await applyOperation(db, operation);
    results.push({
      ref: operation.ref,
      status: outcome.status,
      reason: outcome.reason || null,
      match_method: operation.match_method,
      sessions: operation.workouts.length,
      exercises: operation.workout_exercises.length,
      marker: operation.marker_hash,
    });
  }

  const statuses = summarizeResults(results);
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
      "materialized overlapping cycles are blocked",
      "only one unambiguous empty overlapping cycle can be reused",
      "same marker and payload hash are a no-op",
      "exercise matching is accent/case tolerant within the visible company/global catalog",
      "new exercises preserve the exact MFIT name and are flagged for metadata review",
    ],
    summary: {
      sett_students_read: students.length,
      mfit_clients_read: clients.length,
      mfit_plans_read: allPlans.length,
      active_plans_considered: plans.length,
      candidate_operations: operations.length,
      exercises_to_create: newExercises.size,
      exercises_created_or_verified: apply ? createdExercises : 0,
      ...statuses,
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
    report: "",
    today: "",
    durationWeeks: 6,
  };
  const valueFlags = new Map([
    ["--sett-students", "settStudents"],
    ["--mfit-clients", "mfitClients"],
    ["--mfit-workouts", "mfitWorkouts"],
    ["--report", "report"],
    ["--today", "today"],
    ["--duration-weeks", "durationWeeks"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
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
  return options;
}

const USAGE = `
Usage:
  node scripts/mfit-active-workouts-migration.mjs \\
    --sett-students <sett-students.json> \\
    --mfit-clients <mfit-clients.json> \\
    --mfit-workouts <mfit-active-workouts.json> \\
    [--report <sanitized-report.json>] [--today YYYY-MM-DD] [--duration-weeks 6] [--apply]

Safety:
  Dry-run is the default. Database writes are reachable only with --apply.
  Credentials are read from process environment or supabase status -o env; no .env file is read or written.
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
  if (!options.settStudents || !options.mfitClients || !options.mfitWorkouts) {
    throw new Error("--sett-students, --mfit-clients and --mfit-workouts are required");
  }

  const [settPayload, mfitClientsPayload, mfitWorkoutsPayload] = await Promise.all([
    readJson(options.settStudents, "SETT students input"),
    readJson(options.mfitClients, "MFIT clients input"),
    readJson(options.mfitWorkouts, "MFIT workouts input"),
  ]);
  const config = loadSupabaseConfig();
  const schema = await fetchOpenApiSchema(config.url, config.serviceRoleKey);
  validateSchema(schema);
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const db = createSupabaseAdapter(client, schema);
  const report = await runMigration({
    settPayload,
    mfitClientsPayload,
    mfitWorkoutsPayload,
    db,
    apply: options.apply,
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
