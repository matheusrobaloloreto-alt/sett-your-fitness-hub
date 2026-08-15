import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const target = process.env.SETT_DEPLOY_TARGET || "production";
if (target !== "staging") {
  console.log("Staging deploy sanitizer: no-op outside staging.");
  process.exit(0);
}

const distRoot = realpathSync(resolve("dist"));
const recordingArtifact = resolve(distRoot, "gravacao");

// The recording artifact is an operator-only production tool. Its generated
// HTML intentionally contains production backend coordinates and an operational
// upload token, so it must never be copied into an isolated staging deploy.
// Source files remain untouched; only the freshly generated dist subtree is
// removed.
if (existsSync(recordingArtifact)) {
  const resolvedArtifact = realpathSync(recordingArtifact);
  if (!resolvedArtifact.startsWith(`${distRoot}${sep}`)) {
    throw new Error("Refusing to remove a staging artifact outside dist.");
  }
  rmSync(resolvedArtifact, { recursive: true });
}

const stagingProjectRef = "ifymocggowdlqqcxugko";
const forbiddenFragments = [
  "zshrcgbyhzxpnlccssyz",
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

console.log("Staging deploy sanitizer: operator artifact omitted and backend provenance confirmed.");
