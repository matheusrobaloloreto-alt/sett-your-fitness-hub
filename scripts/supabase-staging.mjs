#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_REF = "ifymocggowdlqqcxugko";
export const PROD_REF = "zshrcgbyhzxpnlccssyz";
const CONFIRM_ENV = "SETT_BN_STAGING_PROJECT_REF";
const WRITE_CONFIRM_ENV = "SETT_BN_STAGING_WRITE_CONFIRM";
const REF_ENV_KEYS = [
  "SUPABASE_PROJECT_REF",
  "SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_ID",
];
const INHERITABLE_REMOTE_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_ANON_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
];

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function parseProjectId(configText) {
  const match = configText.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  return match?.[1] || null;
}

function fail(message) {
  throw new Error(message);
}

export function runPreflight({
  root = repoRootFromHere(),
  env = process.env,
  requireLinked = false,
  requireWriteConfirm = false,
} = {}) {
  if (env[CONFIRM_ENV] !== STAGING_REF) {
    fail(`${CONFIRM_ENV} must be exactly ${STAGING_REF}`);
  }
  if (requireWriteConfirm && env[WRITE_CONFIRM_ENV] !== STAGING_REF) {
    fail(`${WRITE_CONFIRM_ENV} must be exactly ${STAGING_REF} for staging writes`);
  }

  for (const key of REF_ENV_KEYS) {
    const value = String(env[key] || "").trim();
    if (!value) continue;
    if (value === PROD_REF) fail(`${key} points to production (${PROD_REF})`);
    if (value !== STAGING_REF) fail(`${key} diverges from staging (${STAGING_REF})`);
  }
  for (const key of INHERITABLE_REMOTE_ENV_KEYS) {
    if (String(env[key] || "").trim()) {
      fail(`${key} must be unset for this staging wrapper; use ${CONFIRM_ENV} only`);
    }
  }

  const configPath = path.join(root, "supabase", "config.toml");
  const configText = readTextIfExists(configPath);
  if (!configText) fail("supabase/config.toml is missing");
  const configRef = parseProjectId(configText);
  if (configRef === STAGING_REF) {
    fail("canonical config must remain on production; use this staging wrapper instead");
  }
  if (configRef !== PROD_REF) {
    fail(`canonical config points to unexpected ref ${configRef || "(none)"}`);
  }

  const linkedPath = path.join(root, "supabase", ".temp", "project-ref");
  const linkedRef = readTextIfExists(linkedPath)?.trim() || null;
  if (linkedRef === PROD_REF) fail(`linked Supabase ref points to production (${PROD_REF})`);
  if (linkedRef && linkedRef !== STAGING_REF) {
    fail(`linked Supabase ref diverges from staging: ${linkedRef}`);
  }
  if (requireLinked && linkedRef !== STAGING_REF) {
    fail(`linked Supabase ref must be ${STAGING_REF}; run: supabase link --project-ref ${STAGING_REF}`);
  }

  return { configRef, linkedRef, stagingRef: STAGING_REF };
}

export function buildSupabaseArgs(command, env = process.env) {
  if (env[CONFIRM_ENV] !== STAGING_REF) {
    fail(`${CONFIRM_ENV} must be exactly ${STAGING_REF}`);
  }
  switch (command) {
    case "functions:list":
      return ["functions", "list", "--project-ref", STAGING_REF];
    case "secrets:list":
      return ["secrets", "list", "--project-ref", STAGING_REF];
    case "migration:list-linked":
      return ["migration", "list", "--linked"];
    case "db:push-dry-run-linked":
      return ["db", "push", "--dry-run", "--linked"];
    case "deploy:process-automation-sessions":
      if (env[WRITE_CONFIRM_ENV] !== STAGING_REF) {
        fail(`${WRITE_CONFIRM_ENV} must be exactly ${STAGING_REF} for staging writes`);
      }
      return [
        "functions",
        "deploy",
        "process-automation-sessions",
        "--project-ref",
        STAGING_REF,
        "--use-api",
      ];
    default:
      fail(`Supabase command is not allowlisted for staging wrapper: ${command}`);
  }
}

export function prepareSupabaseInvocation(command, {
  root = repoRootFromHere(),
  env = process.env,
} = {}) {
  const requireLinked = command === "migration:list-linked" || command === "db:push-dry-run-linked";
  const requireWriteConfirm = command === "deploy:process-automation-sessions";
  runPreflight({ root, env, requireLinked, requireWriteConfirm });
  return {
    args: buildSupabaseArgs(command, env),
    cwd: root,
  };
}

export function sanitizeSecretsOutput(output) {
  return output.replace(/\b[a-f0-9]{64}\b/gi, "[redacted-digest]");
}

export function extractDryRunMigrationVersions(output) {
  const versions = new Set();
  for (const match of output.matchAll(/(?:supabase\/migrations\/)?(\d{14})[_\s]/g)) {
    versions.add(match[1]);
  }
  return [...versions].sort();
}

export function sanitizeDbDryRunFailure(output) {
  const remoteOnlyVersions = [];
  const repairMatch = output.match(/supabase migration repair --status reverted ([0-9\s]+)/);
  if (repairMatch) {
    for (const version of repairMatch[1].trim().split(/\s+/)) {
      if (/^\d{14}$/.test(version)) remoteOnlyVersions.push(version);
    }
  }
  if (output.includes("Remote migration versions not found in local migrations directory")) {
    return `${JSON.stringify({
      error: "Remote migration versions not found in local migrations directory.",
      remoteOnlyVersions,
      repairApplied: false,
    }, null, 2)}\n`;
  }
  return sanitizeSecretsOutput(output);
}

function main() {
  const command = process.argv[2] || "preflight";
  const requireLinked = command === "migration:list-linked" || command === "db:push-dry-run-linked";
  const requireWriteConfirm = command === "deploy:process-automation-sessions";
  const result = runPreflight({ requireLinked, requireWriteConfirm });

  if (command === "preflight") {
    console.log(JSON.stringify({
      ok: true,
      configRef: result.configRef,
      linkedRef: result.linkedRef,
      stagingRef: result.stagingRef,
    }, null, 2));
    return;
  }

  const invocation = prepareSupabaseInvocation(command);
  const captureOutput = command === "secrets:list" || command === "db:push-dry-run-linked";
  const child = spawnSync("supabase", invocation.args, {
    cwd: invocation.cwd,
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: captureOutput ? "utf8" : undefined,
    env: process.env,
  });
  if (command === "secrets:list") {
    if (child.stdout) process.stdout.write(sanitizeSecretsOutput(child.stdout));
    if (child.stderr) process.stderr.write(sanitizeSecretsOutput(String(child.stderr)));
  }
  if (command === "db:push-dry-run-linked") {
    const output = `${child.stdout || ""}\n${child.stderr || ""}`;
    if (child.status === 0) {
      console.log(JSON.stringify({
        dryRunMigrations: extractDryRunMigrationVersions(output),
      }, null, 2));
    } else {
      process.stderr.write(sanitizeDbDryRunFailure(output));
    }
  }
  process.exit(child.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
