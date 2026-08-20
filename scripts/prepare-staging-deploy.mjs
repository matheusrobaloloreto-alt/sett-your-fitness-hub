import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const target = process.env.SETT_DEPLOY_TARGET || "production";
if (target !== "staging") {
  console.log("Staging deploy sanitizer: no-op outside staging.");
  process.exit(0);
}

const distRoot = realpathSync(resolve("dist"));
const recordingArtifact = resolve(distRoot, "gravacao");
const productionProjectRef = "zshrcgbyhzxpnlccssyz";
const stagingProjectRef = "ifymocggowdlqqcxugko";
const productionUrl = `https://${productionProjectRef}.supabase.co`;
const stagingUrl = `https://${stagingProjectRef}.supabase.co`;

const parseEnv = (contents) => {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    values[key] = value;
  }
  return values;
};

const sha256Base64 = (value) => createHash("sha256").update(value).digest("base64");
const extractInlineScript = (html, page) => {
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) {
    throw new Error(`${page}: expected exactly one inline script, found ${matches.length}.`);
  }
  return matches[0][1];
};

// Vite copies the canonical production recording pages from public/. Staging
// receives isolated copies in dist only: source files are never rewritten.
if (!existsSync(recordingArtifact)) {
  throw new Error("Staging recording artifact is missing from dist.");
}
const resolvedArtifact = realpathSync(recordingArtifact);
if (!resolvedArtifact.startsWith(`${distRoot}${sep}`)) {
  throw new Error("Refusing to rewrite a staging artifact outside dist.");
}

const trackedEnv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const productionPublishableKey = trackedEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const stagingPublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!productionPublishableKey || !stagingPublishableKey) {
  throw new Error("Recording backend keys are missing for staging isolation.");
}
if (productionPublishableKey === stagingPublishableKey) {
  throw new Error("Refusing staging recording build with the production publishable key.");
}

const recordingPages = readdirSync(resolvedArtifact)
  .filter((entry) => entry.endsWith(".html"))
  .map((entry) => join(resolvedArtifact, entry));
if (recordingPages.length !== 3) {
  throw new Error(`Expected 3 recording pages in staging, found ${recordingPages.length}.`);
}

for (const page of recordingPages) {
  const source = readFileSync(page, "utf8");
  if (!source.includes(productionUrl) || !source.includes(productionPublishableKey)) {
    throw new Error(`${page}: canonical production coordinates are incomplete.`);
  }
  const sourceScript = extractInlineScript(source, page);
  const sourceDigest = sha256Base64(sourceScript);
  const sourceCspToken = `sha256-${sourceDigest}`;
  if (source.split(sourceCspToken).length - 1 !== 1) {
    throw new Error(`${page}: canonical CSP hash does not match its inline script.`);
  }

  const rewritten = source
    .replaceAll(productionProjectRef, stagingProjectRef)
    .replaceAll(productionPublishableKey, stagingPublishableKey);
  const rewrittenScript = extractInlineScript(rewritten, page);
  const rewrittenCspToken = `sha256-${sha256Base64(rewrittenScript)}`;
  const isolated = rewritten.replace(sourceCspToken, rewrittenCspToken);
  const finalScript = extractInlineScript(isolated, page);
  if (
    isolated.includes(productionProjectRef) ||
    isolated.includes(productionPublishableKey) ||
    !isolated.includes(stagingUrl) ||
    !isolated.includes(stagingPublishableKey) ||
    isolated.split(rewrittenCspToken).length - 1 !== 1 ||
    sha256Base64(finalScript) !== rewrittenCspToken.slice("sha256-".length)
  ) {
    throw new Error(`${page}: staging recording isolation did not converge.`);
  }
  writeFileSync(page, isolated);
}

const forbiddenFragments = [
  productionProjectRef,
  productionPublishableKey,
  "cxesecxyrndveookvlzz",
  "sb_publishable_okMxda",
];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
]);

const collectFiles = (path) => {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)));
};

let stagingReferenceFound = false;
const violations = [];
for (const file of collectFiles(distRoot)) {
  if (!textExtensions.has(extname(file))) continue;
  const contents = readFileSync(file, "utf8");
  if (contents.includes(stagingProjectRef)) stagingReferenceFound = true;
  for (const fragment of forbiddenFragments) {
    if (contents.includes(fragment)) {
      violations.push(`${file}: contains forbidden backend fragment`);
    }
  }
}

if (!stagingReferenceFound) {
  violations.push("dist: staging backend reference is missing");
}
if (violations.length > 0) {
  throw new Error(`Staging deploy sanitizer failed:\n${violations.join("\n")}`);
}

console.log("Staging deploy sanitizer: recording artifact isolated and backend provenance confirmed.");
