import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const target = new URL(process.argv[2]);
if (target.protocol !== "https:" || target.username || target.password || target.search
  || target.port || target.hash || target.pathname !== "/"
  || !(target.hostname === "www.settapp.com.br" || /^[a-f0-9]+--bn-performance-webapp-matheus\.netlify\.app$/.test(target.hostname))) {
  throw new Error("Use only the canonical production or immutable deploy URL.");
}
const assets = await readdir("dist/assets");
const prefixes = ["WorkoutBuilder-", "workoutVolume-", "workoutRevision-",
  "WorkoutLibrary-", "StudentDetail-", "StudentPortal-", "WhatsAppChat-"];
const selected = prefixes.flatMap((prefix) => {
  const files = assets.filter((name) => name.startsWith(prefix) && name.endsWith(".js"));
  if (files.length !== 1) throw new Error(`Missing or ambiguous built chunk ${prefix}`);
  return files.map((name) => `assets/${name}`);
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const results = [];
for (const file of ["index.html", "sw.js", ...selected]) {
  const bytes = await readFile(path.join("dist", file));
  const response = await fetch(new URL(file === "index.html" ? "/" : `/${file}`, target), {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
  });
  const remote = Buffer.from(await response.arrayBuffer());
  const expected = hash(bytes);
  const actual = hash(remote);
  if (response.status !== 200 || expected !== actual) throw new Error(`Published mismatch ${file}: HTTP ${response.status}`);
  if (file === "sw.js" && !response.headers.get("cache-control")?.includes("no-cache")) {
    throw new Error("Service worker must not be cached without revalidation.");
  }
  results.push({ file, status: response.status, bytes: bytes.length, sha256: expected });
}
const report = { checkedAt: new Date().toISOString(), target: target.origin, files: results };
await mkdir("output/library-release-20260929", { recursive: true });
const name = target.hostname === "www.settapp.com.br" ? "production" : "preview";
await writeFile(`output/library-release-20260929/${name}-verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ target: target.origin, verifiedFiles: results.length, identical: true }));
