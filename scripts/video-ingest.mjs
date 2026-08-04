#!/usr/bin/env node
/**
 * Ingestão dos vídeos gravados → biblioteca de exercícios.
 *
 * Fluxo: casa arquivo↔exercício (código no nome, fallback por similaridade) → comprime com
 * ffmpeg (720p, sem áudio, faststart) → gera capa do próprio vídeo → sobe no bucket
 * exercises-videos via signed URL → aponta o exercício para o vídeo próprio (zera YouTube).
 *
 * Uso:
 *   node scripts/video-ingest.mjs --dir ~/Downloads/videos-bn            # pasta local
 *   node scripts/video-ingest.mjs --manifest drive.json                  # baixa do Drive antes
 *   node scripts/video-ingest.mjs --dir ... --dry-run                    # só o relatório de matching
 *   node scripts/video-ingest.mjs --dir ... --only 001,002               # subconjunto
 *
 * O manifest do Drive é [{"name":"001-....mp4","id":"<fileId>"}] — a pasta precisa estar
 * compartilhada como "qualquer pessoa com o link". Os arquivos são baixados para --dir
 * (padrão /tmp/bn-video-ingest/download) e o fluxo segue igual ao da pasta local.
 *
 * Requer: ffmpeg no PATH e o segredo em ~/.bn-video-ingest-secret.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, statSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname, basename, resolve } from "node:path";

const SUPABASE_URL = "https://zshrcgbyhzxpnlccssyz.supabase.co";
const ANON = "sb_publishable_8hCHHItU79APt0pt7NrZcw_OPHCUd_d";
const FN = `${SUPABASE_URL}/functions/v1/library-video-ingest`;
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".hevc", ".mpg", ".mpeg"]);
const TMP = "/tmp/bn-video-ingest";

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1] ?? true) : d; };
const DRY = args.includes("--dry-run");
const MANIFEST = flag("manifest");
const DIR = flag("dir") || (MANIFEST ? "/tmp/bn-video-ingest/download" : null);
const ONLY = flag("only") ? String(flag("only")).split(",").map((s) => s.trim()) : null;
const MAP_FILE = flag("map", "docs/project/gravacao/codigo-para-exercicio.json");

if (!DIR) { console.error("Faltou --dir <pasta> ou --manifest <drive.json>"); process.exit(1); }

const secret = readFileSync(join(homedir(), ".bn-video-ingest-secret"), "utf8").trim();
const call = async (body) => {
  const r = await fetch(FN, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON}`, "x-webhook-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${body.action}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
};

const slug = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Similaridade por tokens (Dice) — só para o fallback quando não há código no nome. */
function similarity(a, b) {
  const ta = new Set(slug(a).split("-").filter((t) => t.length > 2));
  const tb = new Set(slug(b).split("-").filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

function ffprobeDuration(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
    return parseFloat(out.trim()) || 0;
  } catch { return 0; }
}

function transcode(input, outMp4, outJpg) {
  // 720p de altura máx (preserva vertical/horizontal), sem áudio, faststart para tocar sem baixar tudo.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input,
    // force_divisible_by=2: vídeo vertical de celular (1080x1920) cairia em 405px de largura,
    // dimensão ímpar que o H.264/yuv420p recusa.
    "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", outMp4]);
  const at = Math.max(0.5, ffprobeDuration(outMp4) / 3); // 1/3 do vídeo: já está executando o movimento
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", outMp4,
    "-frames:v", "1", "-q:v", "4", outJpg]);
}

async function uploadSigned(localFile, storagePath, contentType) {
  const { signedUrl } = await call({ action: "sign", path: storagePath });
  const body = readFileSync(localFile);
  const r = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!r.ok) throw new Error(`upload ${storagePath}: HTTP ${r.status} ${await r.text()}`);
  return storagePath;
}

// ---------- 0. Baixar do Google Drive (quando veio manifest) ----------
if (MANIFEST) {
  const entradas = JSON.parse(readFileSync(resolve(process.cwd(), MANIFEST), "utf8"));
  mkdirSync(DIR, { recursive: true });
  console.log(`Baixando ${entradas.length} arquivo(s) do Drive para ${DIR}...`);
  let baixados = 0, pulados = 0;
  for (const e of entradas) {
    const destino = join(DIR, e.name);
    if (existsSync(destino) && statSync(destino).size > 10000) { pulados++; continue; } // retomável
    try {
      // confirm=t evita a página de aviso do Drive em arquivos grandes.
      execFileSync("curl", ["-sL", "--fail", "-o", destino,
        `https://drive.usercontent.google.com/download?id=${e.id}&export=download&confirm=t`],
        { timeout: 600000 });
      if (statSync(destino).size < 10000) throw new Error("arquivo muito pequeno (link privado?)");
      baixados++;
      if (baixados % 25 === 0) console.log(`  ...${baixados} baixados`);
    } catch (err) {
      rmSync(destino, { force: true });
      console.log(`  ✖ ${e.name}: ${String(err.message || err).slice(0, 120)}`);
    }
  }
  console.log(`Download: ${baixados} novos, ${pulados} já existiam.\n`);
}

// ---------- 1. Casar arquivos com exercícios ----------
const mapPath = resolve(process.cwd(), MAP_FILE);
const codeMap = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : {};
const library = (await call({ action: "list" })).items;

const files = readdirSync(DIR).filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()) && !f.startsWith("."));
const matched = [], ambiguous = [], unmatched = [];

for (const f of files) {
  const name = basename(f, extname(f));
  const code = name.match(/^(\d{3})\b/)?.[1];
  if (code && codeMap[code]) {
    const ex = library.find((e) => e.id === codeMap[code].id);
    if (ex) { matched.push({ file: f, ex, how: `código ${code}`, score: 1 }); continue; }
  }
  const ranked = library.map((e) => ({ e, s: similarity(name, e.name) })).sort((a, b) => b.s - a.s);
  const [top, second] = ranked;
  if (top && top.s >= 0.62 && (!second || top.s - second.s >= 0.12)) {
    matched.push({ file: f, ex: top.e, how: `nome (${top.s.toFixed(2)})`, score: top.s });
  } else if (top && top.s >= 0.45) {
    ambiguous.push({ file: f, candidatos: ranked.slice(0, 3).map((r) => `${r.e.name} (${r.s.toFixed(2)})`) });
  } else unmatched.push(f);
}

const alvo = ONLY ? matched.filter((m) => ONLY.some((c) => m.file.startsWith(c))) : matched;

console.log(`\nArquivos de vídeo na pasta: ${files.length}`);
console.log(`  ✔ casados:    ${matched.length}${ONLY ? ` (processando ${alvo.length} por --only)` : ""}`);
console.log(`  ? ambíguos:   ${ambiguous.length}`);
console.log(`  ✖ sem match:  ${unmatched.length}`);
for (const a of ambiguous.slice(0, 15)) console.log(`    ? ${a.file} → ${a.candidatos.join(" | ")}`);
for (const u of unmatched.slice(0, 15)) console.log(`    ✖ ${u}`);
if (DRY) { console.log("\n[dry-run] nada foi enviado."); process.exit(0); }
if (!alvo.length) { console.log("\nNada a processar."); process.exit(0); }

// ---------- 2. Comprimir, subir e apontar ----------
mkdirSync(TMP, { recursive: true });
const commits = [], falhas = [];
let i = 0;
for (const m of alvo) {
  i++;
  const tag = `[${i}/${alvo.length}] ${m.ex.name}`;
  try {
    const src = join(DIR, m.file);
    const outMp4 = join(TMP, `${m.ex.id}.mp4`);
    const outJpg = join(TMP, `${m.ex.id}.jpg`);
    transcode(src, outMp4, outJpg);
    const mb = (statSync(outMp4).size / 1048576).toFixed(1);
    const base = `biblioteca/${m.ex.id}`;
    await uploadSigned(outMp4, `${base}.mp4`, "video/mp4");
    await uploadSigned(outJpg, `${base}.jpg`, "image/jpeg");
    const publicJpg = `${SUPABASE_URL}/storage/v1/object/public/exercises-videos/${base}.jpg`;
    commits.push({ id: m.ex.id, video_path: `${base}.mp4`, thumbnail_url: publicJpg });
    console.log(`  ✔ ${tag} — ${mb}MB (${m.how})`);
    rmSync(outMp4, { force: true }); rmSync(outJpg, { force: true });
  } catch (e) {
    falhas.push({ file: m.file, erro: String(e.message || e).slice(0, 200) });
    console.log(`  ✖ ${tag} — ${e.message}`);
  }
}

// ---------- 3. Confirmar no banco (em lotes) ----------
let atualizados = 0;
for (let k = 0; k < commits.length; k += 50) {
  const r = await call({ action: "commit", items: commits.slice(k, k + 50) });
  atualizados += r.updated;
}
const cov = await call({ action: "coverage" });
console.log(`\n=== RESULTADO ===`);
console.log(`Vídeos publicados: ${atualizados}   Falhas: ${falhas.length}`);
for (const f of falhas.slice(0, 10)) console.log(`  ✖ ${f.file}: ${f.erro}`);
console.log(`Cobertura da biblioteca: ${cov.proprio}/${cov.total} com vídeo próprio · ${cov.mfit} MFIT · ${cov.youtube} YouTube · ${cov.sem_video} sem vídeo`);
