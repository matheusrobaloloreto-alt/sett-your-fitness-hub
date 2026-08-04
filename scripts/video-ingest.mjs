#!/usr/bin/env node
/**
 * Ingestão dos vídeos gravados → biblioteca de exercícios (926 exercícios).
 *
 * Fluxo: baixa do Drive → casa arquivo↔exercício (código no nome, fallback por similaridade) →
 * QA (corrompido/duração/resolução/congelado) → comprime com ffmpeg (720p, sem áudio, faststart)
 * → gera a capa do próprio vídeo → sobe no bucket exercises-videos via signed URL → aponta o
 * exercício para o vídeo próprio (zerando o YouTube).
 *
 * Uso:
 *   node scripts/video-ingest.mjs --manifest drive.json          # baixa do Drive e processa
 *   node scripts/video-ingest.mjs --dir ~/Downloads/videos-bn    # pasta local
 *   node scripts/video-ingest.mjs --dir ... --dry-run            # matching + QA, sem enviar
 *   node scripts/video-ingest.mjs --status                       # cobertura e o que falta gravar
 *   node scripts/video-ingest.mjs --dir ... --jobs 6 --only 001,002
 *
 * O manifest do Drive é [{"name":"001-....mp4","id":"<fileId>"}] — a pasta precisa estar
 * compartilhada como "qualquer pessoa com o link".
 *
 * Retomável: pula o que já baixou e, por padrão, o que já tem vídeo próprio no app (--force refaz).
 * Requer: ffmpeg/ffprobe no PATH e o segredo em ~/.bn-video-ingest-secret.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname, basename, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SUPABASE_URL = "https://zshrcgbyhzxpnlccssyz.supabase.co";
const ANON = "sb_publishable_8hCHHItU79APt0pt7NrZcw_OPHCUd_d";
const FN = `${SUPABASE_URL}/functions/v1/library-video-ingest`;
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".hevc", ".mpg", ".mpeg", ".3gp"]);
const WORK = "/tmp/bn-video-ingest";

// Limites de QA — fora disso é quase sempre erro de gravação, não escolha do professor.
const DUR_MIN = 3, DUR_MAX = 90, ALTURA_MIN = 480;

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1] ?? true) : d; };
const DRY = args.includes("--dry-run");
const STATUS = args.includes("--status");
const FORCE = args.includes("--force");
const KEEP = args.includes("--keep-source");
const JOBS = Math.max(1, parseInt(flag("jobs", "4"), 10) || 4);
const MANIFEST = flag("manifest");
const DIR = flag("dir") || (MANIFEST ? join(WORK, "download") : null);
const ONLY = flag("only") ? String(flag("only")).split(",").map((s) => s.trim()) : null;
const MAP_FILE = flag("map", "docs/project/gravacao/codigo-para-exercicio.json");

const secret = readFileSync(join(homedir(), ".bn-video-ingest-secret"), "utf8").trim();
const call = async (body) => {
  const r = await fetch(FN, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON}`, "x-webhook-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${body.action}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
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

/** Executa `tarefa` sobre `itens` com no máximo `n` em paralelo. */
async function pool(itens, n, tarefa) {
  const out = new Array(itens.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (cursor < itens.length) {
      const i = cursor++;
      out[i] = await tarefa(itens[i], i);
    }
  }));
  return out;
}

const mapPath = resolve(process.cwd(), MAP_FILE);
const codeMap = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : {};

// ---------- --status: cobertura e o que ainda falta ----------
if (STATUS) {
  const cov = await call({ action: "coverage" });
  const lib = (await call({ action: "list" })).items;
  const comVideo = new Set(lib.filter((e) => e.video_path).map((e) => e.id));
  const faltam = Object.entries(codeMap).filter(([, v]) => !comVideo.has(v.id));
  console.log(`\nCobertura: ${cov.proprio}/${cov.total} com vídeo próprio`);
  console.log(`  MFIT: ${cov.mfit} · YouTube: ${cov.youtube} · sem vídeo: ${cov.sem_video}`);
  console.log(`\nAinda faltam gravar/importar: ${faltam.length}`);
  for (const [cod, v] of faltam.slice(0, 20)) console.log(`  ${cod} ${v.nome}`);
  if (faltam.length > 20) console.log(`  ... e mais ${faltam.length - 20}`);
  process.exit(0);
}
if (!DIR) { console.error("Faltou --dir <pasta>, --manifest <drive.json> ou --status"); process.exit(1); }

// ---------- 0. Baixar do Google Drive ----------
if (MANIFEST) {
  const entradas = JSON.parse(readFileSync(resolve(process.cwd(), MANIFEST), "utf8"));
  mkdirSync(DIR, { recursive: true });
  console.log(`Baixando ${entradas.length} arquivo(s) do Drive (${JOBS} em paralelo)...`);
  let baixados = 0, pulados = 0, erros = 0;
  await pool(entradas, JOBS, async (e) => {
    const destino = join(DIR, e.name);
    if (existsSync(destino) && statSync(destino).size > 10000) { pulados++; return; }
    try {
      // confirm=t evita a página de aviso do Drive em arquivos grandes.
      await run("curl", ["-sL", "--fail", "--max-time", "900", "-o", destino,
        `https://drive.usercontent.google.com/download?id=${e.id}&export=download&confirm=t`],
        { maxBuffer: 1 << 20 });
      if (statSync(destino).size < 10000) throw new Error("muito pequeno (pasta privada?)");
      if (++baixados % 25 === 0) console.log(`  ...${baixados} baixados`);
    } catch (err) {
      rmSync(destino, { force: true }); erros++;
      console.log(`  ✖ download ${e.name}: ${String(err.message || err).slice(0, 100)}`);
    }
  });
  console.log(`Download: ${baixados} novos, ${pulados} já existiam, ${erros} falharam.\n`);
}

// ---------- 1. Casar arquivos com exercícios ----------
const library = (await call({ action: "list" })).items;
const byId = new Map(library.map((e) => [e.id, e]));
const arquivos = readdirSync(DIR).filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()) && !f.startsWith("."));

const ambiguos = [], semMatch = [], duplicados = [];
const porExercicio = new Map(); // exercise_id → candidatos

for (const f of arquivos) {
  const nome = basename(f, extname(f));
  const cod = nome.match(/^(\d{3})\b/)?.[1];
  let alvo = null, como = null;
  if (cod && codeMap[cod] && byId.has(codeMap[cod].id)) {
    alvo = byId.get(codeMap[cod].id); como = `código ${cod}`;
  } else {
    const rank = library.map((e) => ({ e, s: similarity(nome, e.name) })).sort((a, b) => b.s - a.s);
    const [top, seg] = rank;
    if (top && top.s >= 0.62 && (!seg || top.s - seg.s >= 0.12)) { alvo = top.e; como = `nome (${top.s.toFixed(2)})`; }
    else if (top && top.s >= 0.45) { ambiguos.push({ arquivo: f, candidatos: rank.slice(0, 3).map((r) => `${r.e.name} (${r.s.toFixed(2)})`) }); continue; }
    else { semMatch.push(f); continue; }
  }
  const lista = porExercicio.get(alvo.id) || [];
  lista.push({ arquivo: f, ex: alvo, como, aderencia: similarity(nome, alvo.name) });
  porExercicio.set(alvo.id, lista);
}

// Mesmo exercício com mais de um arquivo: fica o nome mais fiel ao exercício
// (regravação costuma vir como "047-supino-reto-barra-2"; cópia solta perde do descritivo).
const casados = [];
for (const lista of porExercicio.values()) {
  lista.sort((a, b) => b.aderencia - a.aderencia || a.arquivo.localeCompare(b.arquivo));
  const [escolhido, ...resto] = lista;
  casados.push(escolhido);
  for (const r of resto) duplicados.push({ arquivo: r.arquivo, conflita_com: escolhido.arquivo, exercicio: escolhido.ex.name });
}

let alvos = ONLY ? casados.filter((m) => ONLY.some((c) => m.arquivo.startsWith(c))) : casados;
const jaTem = alvos.filter((m) => m.ex.video_path);
if (!FORCE && jaTem.length) alvos = alvos.filter((m) => !m.ex.video_path);

console.log(`Arquivos de vídeo encontrados: ${arquivos.length}`);
console.log(`  ✔ casados:     ${casados.length}`);
console.log(`  ? ambíguos:    ${ambiguos.length}`);
console.log(`  ✖ sem match:   ${semMatch.length}`);
if (duplicados.length) console.log(`  ⧉ duplicados:  ${duplicados.length} (2 arquivos p/ o mesmo exercício)`);
if (!FORCE && jaTem.length) console.log(`  ↷ já no app:   ${jaTem.length} (pulados; use --force para refazer)`);
for (const a of ambiguos.slice(0, 10)) console.log(`    ? ${a.arquivo} → ${a.candidatos.join(" | ")}`);
for (const u of semMatch.slice(0, 10)) console.log(`    ✖ ${u}`);
for (const d of duplicados.slice(0, 10)) console.log(`    ⧉ ${d.arquivo} e ${d.conflita_com} → ${d.exercicio}`);

// ---------- 2. QA + compressão + upload (paralelo) ----------
async function inspecionar(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { maxBuffer: 1 << 20 });
  const j = JSON.parse(stdout);
  const s = j.streams?.[0] || {};
  return { dur: parseFloat(j.format?.duration) || 0, w: s.width || 0, h: s.height || 0 };
}

async function processar(m) {
  const src = join(DIR, m.arquivo);
  const info = await inspecionar(src); // ffprobe falhando = arquivo corrompido → vira falha
  const avisos = [];
  if (info.dur < DUR_MIN) avisos.push(`curto demais (${info.dur.toFixed(1)}s)`);
  if (info.dur > DUR_MAX) avisos.push(`longo demais (${Math.round(info.dur)}s)`);
  if (Math.max(info.w, info.h) && Math.min(info.w, info.h) < ALTURA_MIN) avisos.push(`baixa resolução (${info.w}x${info.h})`);

  const outMp4 = join(WORK, `${m.ex.id}.mp4`);
  const outJpg = join(WORK, `${m.ex.id}.jpg`);
  // force_divisible_by=2: celular grava 1080x1920 e a redução daria 405px de largura,
  // dimensão ímpar que o H.264/yuv420p recusa. freezedetect no mesmo passe custa ~nada
  // e denuncia vídeo em que a câmera travou ou ninguém se moveu.
  const { stderr } = await run("ffmpeg", ["-y", "-loglevel", "info", "-i", src,
    "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,freezedetect=n=-60dB:d=2",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", outMp4], { maxBuffer: 32 << 20 });
  if (/freeze_start/.test(stderr || "")) avisos.push("trecho congelado (2s+ sem movimento)");

  const at = Math.max(0.5, (await inspecionar(outMp4)).dur / 3); // 1/3: movimento já acontecendo
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", outMp4,
    "-frames:v", "1", "-q:v", "4", outJpg], { maxBuffer: 1 << 20 });

  const base = `biblioteca/${m.ex.id}`;
  for (const [arq, path, tipo] of [[outMp4, `${base}.mp4`, "video/mp4"], [outJpg, `${base}.jpg`, "image/jpeg"]]) {
    const { signedUrl } = await call({ action: "sign", path });
    const r = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": tipo }, body: readFileSync(arq) });
    if (!r.ok) throw new Error(`upload ${path}: HTTP ${r.status}`);
  }
  const mb = statSync(outMp4).size / 1048576;
  rmSync(outMp4, { force: true }); rmSync(outJpg, { force: true });
  if (!KEEP) rmSync(src, { force: true }); // libera disco: 926 originais de celular passam de 30GB
  return {
    commit: { id: m.ex.id, video_path: `${base}.mp4`, thumbnail_url: `${SUPABASE_URL}/storage/v1/object/public/exercises-videos/${base}.jpg` },
    mb, avisos,
  };
}

if (DRY) {
  console.log(`\n[dry-run] rodando QA em ${alvos.length} arquivo(s), sem enviar nada...`);
  let ruins = 0;
  await pool(alvos, JOBS, async (m) => {
    try {
      const i = await inspecionar(join(DIR, m.arquivo));
      const av = [];
      if (i.dur < DUR_MIN) av.push(`curto (${i.dur.toFixed(1)}s)`);
      if (i.dur > DUR_MAX) av.push(`longo (${Math.round(i.dur)}s)`);
      if (Math.min(i.w, i.h) < ALTURA_MIN) av.push(`${i.w}x${i.h}`);
      if (av.length) { ruins++; console.log(`  ⚠ ${m.arquivo}: ${av.join(", ")}`); }
    } catch { ruins++; console.log(`  ✖ ${m.arquivo}: ilegível/corrompido`); }
  });
  console.log(`\n[dry-run] ${alvos.length - ruins} prontos, ${ruins} com problema. Nada foi enviado.`);
  process.exit(0);
}
if (!alvos.length) { console.log("\nNada novo a processar."); process.exit(0); }

mkdirSync(WORK, { recursive: true });
console.log(`\nProcessando ${alvos.length} vídeo(s) com ${JOBS} em paralelo...`);
const commits = [], falhas = [], comAviso = [];
let feitos = 0;
await pool(alvos, JOBS, async (m) => {
  try {
    const r = await processar(m);
    commits.push(r.commit);
    if (r.avisos.length) comAviso.push({ arquivo: m.arquivo, exercicio: m.ex.name, avisos: r.avisos });
    if (++feitos % 25 === 0 || feitos === alvos.length) console.log(`  ...${feitos}/${alvos.length}`);
  } catch (e) {
    falhas.push({ arquivo: m.arquivo, exercicio: m.ex.name, erro: String(e.message || e).slice(0, 160) });
  }
});

// ---------- 3. Confirmar no banco ----------
let atualizados = 0;
for (let k = 0; k < commits.length; k += 50) {
  atualizados += (await call({ action: "commit", items: commits.slice(k, k + 50) })).updated;
}
const cov = await call({ action: "coverage" });

console.log(`\n=== RESULTADO ===`);
console.log(`Publicados: ${atualizados}   Falhas: ${falhas.length}   Com aviso: ${comAviso.length}`);
for (const f of falhas.slice(0, 15)) console.log(`  ✖ ${f.arquivo} (${f.exercicio}): ${f.erro}`);
for (const a of comAviso.slice(0, 15)) console.log(`  ⚠ ${a.arquivo} (${a.exercicio}): ${a.avisos.join(", ")}`);
console.log(`\nCobertura: ${cov.proprio}/${cov.total} com vídeo próprio · ${cov.mfit} MFIT · ${cov.youtube} YouTube · ${cov.sem_video} sem vídeo`);

// Relatório para decidir o que regravar.
const linhas = [["situacao", "arquivo", "exercicio", "detalhe"]];
for (const f of falhas) linhas.push(["FALHA", f.arquivo, f.exercicio, f.erro]);
for (const a of comAviso) linhas.push(["AVISO", a.arquivo, a.exercicio, a.avisos.join("; ")]);
for (const a of ambiguos) linhas.push(["AMBIGUO", a.arquivo, "", a.candidatos.join(" | ")]);
for (const u of semMatch) linhas.push(["SEM_MATCH", u, "", "renomear com o código de 3 dígitos"]);
for (const d of duplicados) linhas.push(["DUPLICADO", d.arquivo, d.exercicio, `conflita com ${d.conflita_com}`]);
if (linhas.length > 1) {
  const out = join(WORK, "relatorio-ingest.csv");
  writeFileSync(out, linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "utf8");
  console.log(`\nPendências (${linhas.length - 1}) em ${out}`);
}
