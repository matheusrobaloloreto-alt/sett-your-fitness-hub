import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const BACKENDS = {
  production: {
    projectRef: "zshrcgbyhzxpnlccssyz",
    publishableKeySha256: "3d887e5373f274d113cb3b6dd9f5b654ecce3bcfc3255bcb7d76c21498caf60c",
  },
  staging: {
    projectRef: "ifymocggowdlqqcxugko",
    publishableKeySha256: "b527094a4d6713e7bce1e82c5d4c4899ba08f9e249518f6aef8d281458673cd8",
  },
};
const DEPLOY_TARGET = process.env.SETT_DEPLOY_TARGET || "production";
const EXPECTED_BACKEND = BACKENDS[DEPLOY_TARGET];
if (!EXPECTED_BACKEND) {
  console.error(`SETT_DEPLOY_TARGET invalido: ${DEPLOY_TARGET}. Use production ou staging.`);
  process.exit(1);
}
const EXPECTED_PROJECT_REF = EXPECTED_BACKEND?.projectRef;
const EXPECTED_URL = EXPECTED_PROJECT_REF
  ? `https://${EXPECTED_PROJECT_REF}.supabase.co`
  : undefined;
const EXPECTED_PUBLISHABLE_KEY_SHA256 = EXPECTED_BACKEND?.publishableKeySha256;
const RETIRED_PROJECT_REF = "cxesec" + "xyrndveookvlzz";
const REJECTED_PUBLISHABLE_KEY_PREFIX = "sb_publishable_" + "okMxda";

const parseEnv = (contents) => {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    values[key] = value;
  }

  return values;
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const validateValues = (values, source, { requireAll = false } = {}) => {
  const errors = [];
  const required = ["VITE_SUPABASE_PROJECT_ID", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (requireAll) {
    for (const key of required) {
      if (!values[key]) errors.push(`${source}: ${key} ausente.`);
    }
  }

  if (values.SUPABASE_URL && values.SUPABASE_URL !== EXPECTED_URL) {
    errors.push(`${source}: SUPABASE_URL não aponta para o backend canônico.`);
  }
  if (values.VITE_SUPABASE_URL && values.VITE_SUPABASE_URL !== EXPECTED_URL) {
    errors.push(`${source}: VITE_SUPABASE_URL não aponta para o backend canônico.`);
  }
  if (values.VITE_SUPABASE_PROJECT_ID && values.VITE_SUPABASE_PROJECT_ID !== EXPECTED_PROJECT_REF) {
    errors.push(`${source}: VITE_SUPABASE_PROJECT_ID não é o projeto canônico.`);
  }
  if (
    values.VITE_SUPABASE_PUBLISHABLE_KEY &&
    sha256(values.VITE_SUPABASE_PUBLISHABLE_KEY) !== EXPECTED_PUBLISHABLE_KEY_SHA256
  ) {
    errors.push(`${source}: VITE_SUPABASE_PUBLISHABLE_KEY não pertence ao projeto canônico.`);
  }

  for (const [key, value] of Object.entries(values)) {
    if (value.includes(RETIRED_PROJECT_REF)) errors.push(`${source}: ${key} ainda referencia o Supabase aposentado.`);
    if (value.startsWith(REJECTED_PUBLISHABLE_KEY_PREFIX)) errors.push(`${source}: ${key} usa a chave publishable de outro projeto.`);
  }

  return errors;
};

const runtimeRoots = ["src", "public", "supabase/functions"];
const runtimeFiles = ["supabase/config.toml", "netlify.toml", "vite.config.ts", "vite.config.js"];
const textExtensions = new Set([".css", ".html", ".js", ".jsx", ".json", ".mjs", ".toml", ".ts", ".tsx"]);

const collectFiles = (path) => {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)));
};

const errors = [];

for (const envFile of [".env", ".env.local"]) {
  if (!existsSync(envFile)) continue;
  const envValues = parseEnv(readFileSync(envFile, "utf8"));
  if (DEPLOY_TARGET === "production") {
    errors.push(...validateValues(envValues, envFile, { requireAll: envFile === ".env" }));
  } else {
    // The tracked .env remains production-safe. In staging, process variables
    // must provide the complete isolated backend and take precedence in Vite.
    for (const [key, value] of Object.entries(envValues)) {
      if (value.includes(RETIRED_PROJECT_REF)) errors.push(`${envFile}: ${key} ainda referencia o Supabase aposentado.`);
      if (value.startsWith(REJECTED_PUBLISHABLE_KEY_PREFIX)) errors.push(`${envFile}: ${key} usa a chave publishable de outro projeto.`);
    }
  }
}

const processValues = Object.fromEntries(
  ["SUPABASE_URL", "VITE_SUPABASE_PROJECT_ID", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
if (Object.keys(processValues).length > 0 || DEPLOY_TARGET === "staging") {
  errors.push(...validateValues(processValues, "ambiente do build", { requireAll: DEPLOY_TARGET === "staging" }));
}

for (const file of [...runtimeRoots.flatMap(collectFiles), ...runtimeFiles.flatMap(collectFiles)]) {
  if (!textExtensions.has(extname(file))) continue;
  const contents = readFileSync(file, "utf8");
  if (contents.includes(RETIRED_PROJECT_REF)) errors.push(`${file}: contém a referência do Supabase aposentado.`);
  if (contents.includes(REJECTED_PUBLISHABLE_KEY_PREFIX)) errors.push(`${file}: contém a chave publishable rejeitada.`);
}

if (errors.length > 0) {
  console.error("\nBackend canônico inválido:\n");
  for (const error of errors) console.error(`- ${error}`);
  console.error("\nBuild interrompido antes de publicar uma versão conectada ao backend errado.\n");
  process.exit(1);
}

console.log(`Backend ${DEPLOY_TARGET} confirmado: ${EXPECTED_PROJECT_REF}.`);
