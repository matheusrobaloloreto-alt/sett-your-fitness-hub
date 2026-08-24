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
 *   SETT_DEPLOY_TARGET=production node scripts/video-ingest.mjs --confirm-project zshrcgbyhzxpnlccssyz --status
 *   SETT_DEPLOY_TARGET=production node scripts/video-ingest.mjs --confirm-project zshrcgbyhzxpnlccssyz --manifest drive.json
 *   SETT_DEPLOY_TARGET=production node scripts/video-ingest.mjs --confirm-project zshrcgbyhzxpnlccssyz --dir ~/Downloads/videos-bn --dry-run
 *   SETT_DEPLOY_TARGET=staging VIDEO_INGEST_SUPABASE_URL=https://ifymocggowdlqqcxugko.supabase.co \
 *     node scripts/video-ingest.mjs --confirm-project ifymocggowdlqqcxugko --staging --dry-run
 *
 * `--staging` seleciona a fila privada de gravações do backend já confirmado; não escolhe o
 * ambiente. URL, chave pública e segredo do staging devem ser fornecidos por env efêmero.
 *
 * O manifest do Drive é [{"name":"001-....mp4","id":"<fileId>"}] — a pasta precisa estar
 * compartilhada como "qualquer pessoa com o link".
 *
 * Retomável: pula o que já baixou e, por padrão, o que já tem vídeo próprio no app (--force refaz).
 * Requer: alvo/projeto explícitos, ffmpeg/ffprobe no PATH e segredo por canal seguro.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync, rmSync } from "node:fs";
import { join, extname, basename, resolve } from "node:path";
import { promisify } from "node:util";
import {
  assertUploadableVideoMetadata,
  buildUploadTranscodeArgs,
  decideVideoIngestSafety,
  inspectVideoSource,
  localStagingFileName,
  selectLatestStagingItems,
  stagingCodeFromName,
  stagingNamesForSuccessfulCommits,
} from "./video-ingest-safety.mjs";
import {
  requestVideoIngest,
  resolveVideoIngestConfig,
} from "./video-ingest-config.mjs";

const run = promisify(execFile);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".hevc", ".mpg", ".mpeg", ".3gp"]);
const WORK = "/tmp/bn-video-ingest";

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1] ?? true) : d; };
const ingestConfig = resolveVideoIngestConfig({ args });
console.log(`Video ingest target: ${ingestConfig.target} (${ingestConfig.projectRef}).`);
const DRY = args.includes("--dry-run");
const STATUS = args.includes("--status");
const STAGING = args.includes("--staging");
const stagingReadyNames = new Set();
const FORCE = args.includes("--force");
const KEEP = args.includes("--keep-source");
const NOTRIM = args.includes("--no-trim");
const JOBS = Math.max(1, parseInt(flag("jobs", "4"), 10) || 4);
const MANIFEST = flag("manifest");
const DIR = flag("dir") || (MANIFEST || STAGING ? join(WORK, "download") : null);
const ONLY = flag("only") ? String(flag("only")).split(",").map((s) => s.trim()) : null;
const MAP_FILE = flag("map", "docs/project/gravacao/codigo-para-exercicio.json");
const PRUNE_LEDGER = flag("prune-ledger");

const call = (body) => requestVideoIngest(ingestConfig, body);

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

if (PRUNE_LEDGER) {
  const operatorTags = String(PRUNE_LEDGER).split(",").map((tag) => tag.trim()).filter(Boolean);
  const result = await call({ action: "prune-recording-ledger", operator_tags: operatorTags });
  console.log(`Ledger expirado limpo: ${result.removed} reserva(s).`);
  process.exit(0);
}

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
if (!DIR) { console.error("Faltou --dir <pasta>, --staging, --manifest <drive.json> ou --status"); process.exit(1); }

// ---------- 0a. Baixar as gravações feitas pelo celular (área de triagem) ----------
if (STAGING) {
  const { items } = await call({ action: "list-recordings" });
  mkdirSync(DIR, { recursive: true });
  console.log(`Gravações aguardando: ${items.length}`);
  // Nome no storage: <codigo>__<operador-hash>__<request-id>.<ext>. Se o mesmo exercício foi gravado
  // mais de uma vez, vale o take mais recente — o modelo regravou porque não gostou do anterior.
  const baixar = selectLatestStagingItems(items);
  const antigos = items.length - baixar.length;
  if (antigos) console.log(`  ${antigos} take(s) antigo(s) ignorado(s) (regravação vence)`);
  await pool(baixar, JOBS, async (it) => {
    const localName = localStagingFileName(it.name);
    const destino = join(DIR, localName);
    if (existsSync(destino) && statSync(destino).size > 10000) {
      stagingReadyNames.add(localName);
      return;
    }
    try {
      await run("curl", ["-sL", "--fail", "--max-time", "900", "-o", destino, it.url], { maxBuffer: 1 << 20 });
      if (statSync(destino).size <= 10000) throw new Error("download incompleto");
      stagingReadyNames.add(localName);
    } catch (e) {
      rmSync(destino, { force: true });
      console.log(`  ✖ ${it.name}: ${String(e.message || e).slice(0, 90)}`);
    }
  });
  console.log(`Disponíveis ${stagingReadyNames.size} gravação(ões) selecionada(s) para processar.\n`);
}

// ---------- 0b. Baixar do Google Drive ----------
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
const arquivos = (STAGING ? [...stagingReadyNames] : readdirSync(DIR))
  .filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()) && !f.startsWith("."));

const ambiguos = [], semMatch = [], duplicados = [];
const porExercicio = new Map(); // exercise_id → candidatos

for (const f of arquivos) {
  const nome = basename(f, extname(f));
  const cod = STAGING
    ? stagingCodeFromName(f)
    : nome.match(/^(\d{3})(?=\D|$)/)?.[1];
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
/**
 * Onde o exercício realmente acontece dentro do vídeo.
 *
 * Todo vídeo de celular vem com gordura nas pontas: a pessoa toca em gravar e volta para a
 * posição, faz o movimento, e sobra mais um tanto até ela ir desligar. Mede-se o movimento
 * quadro a quadro (diferença entre quadros consecutivos → brilho médio dessa diferença) e
 * corta-se só as bordas paradas, preservando tudo que tem ação.
 *
 * Devolve null sempre que o corte for arriscado — melhor entregar o vídeo inteiro do que
 * decapitar a primeira repetição.
 */
async function detectarAcao(file, dur) {
  try {
    const { stderr } = await run("ffmpeg", ["-i", file, "-vf",
      "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
      "-an", "-f", "null", "-"], { maxBuffer: 64 << 20 });
    const amostras = [];
    const re = /pts_time:([\d.]+)[\s\S]*?lavfi\.signalstats\.YAVG=([\d.]+)/g;
    let m;
    while ((m = re.exec(stderr)) !== null) amostras.push([parseFloat(m[1]), parseFloat(m[2])]);
    if (amostras.length < 15) return null;

    const vals = amostras.map((a) => a[1]).sort((a, b) => a - b);
    const p = (q) => vals[Math.min(vals.length - 1, Math.floor(vals.length * q))];
    const piso = p(0.10);  // ruído do sensor com a cena parada
    const ref = p(0.90);   // movimento típico — percentil, não o máximo: um flash ou alguém
                           // passando na frente viraria um pico que engoliria o exercício inteiro
    if (ref <= piso * 1.5 || ref <= 0) return null; // vídeo homogêneo: nada a separar
    const limiar = piso + (ref - piso) * 0.25;

    const ativos = amostras.filter(([, v]) => v >= limiar).map(([t]) => t);
    if (ativos.length < 8) return null; // isometria (prancha) quase não gera diferença: não corta

    const MARGEM = 0.45; // um respiro antes e depois, para não cortar o início do movimento
    const ini = Math.max(0, ativos[0] - MARGEM);
    const fim = Math.min(dur, ativos[ativos.length - 1] + MARGEM);
    const nova = fim - ini;
    if (nova < 2.5) return null;             // sobrou pouco: a detecção provavelmente errou
    if (nova > dur - 0.8) return null;       // não havia gordura relevante
    if (nova < dur * 0.4) return null;       // cortaria mais de 60%: desconfia e mantém
    return { ini, fim, nova };
  } catch { return null; }
}

async function processar(m) {
  const src = join(DIR, m.arquivo);
  const info = await inspectVideoSource(src); // ffprobe/ffmpeg falhando = arquivo corrompido → vira falha
  const decisao = assertUploadableVideoMetadata(info);
  const avisos = [...decisao.warnings];

  const outMp4 = join(WORK, `${m.ex.id}.mp4`);
  const outJpg = join(WORK, `${m.ex.id}.jpg`);
  // Apara as bordas paradas antes de comprimir (nada de cortar no meio: repetição é conteúdo).
  const corte = NOTRIM ? null : await detectarAcao(src, info.dur);
  const recorte = corte ? ["-ss", corte.ini.toFixed(2), "-to", corte.fim.toFixed(2)] : [];
  if (corte) avisos.push(`aparado ${info.dur.toFixed(1)}s → ${corte.nova.toFixed(1)}s`);

  // force_divisible_by=2: celular grava 1080x1920 e a redução daria 405px de largura,
  // dimensão ímpar que o H.264/yuv420p recusa. freezedetect no mesmo passe custa ~nada
  // e denuncia vídeo em que a câmera travou ou ninguém se moveu. -an tira o áudio.
  const { stderr } = await run("ffmpeg", buildUploadTranscodeArgs({ recorte, src, outMp4 }), { maxBuffer: 32 << 20 });
  if (/freeze_start/.test(stderr || "")) avisos.push("trecho congelado (2s+ sem movimento)");

  const at = Math.max(0.5, (await inspectVideoSource(outMp4)).dur / 3); // 1/3: movimento já acontecendo
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", outMp4,
    "-frames:v", "1", "-q:v", "4", outJpg], { maxBuffer: 1 << 20 });

  const base = `biblioteca/${m.ex.id}`;
  for (const [arq, path, tipo] of [[outMp4, `${base}.mp4`, "video/mp4"], [outJpg, `${base}.jpg`, "image/jpeg"]]) {
    const bytes = statSync(arq).size;
    const { signed_url: signedUrl } = await call({ action: "sign", path, mime_type: tipo, size: bytes });
    const r = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": tipo }, body: readFileSync(arq) });
    if (!r.ok) throw new Error(`upload ${path}: HTTP ${r.status}`);
  }
  const mb = statSync(outMp4).size / 1048576;
  rmSync(outMp4, { force: true }); rmSync(outJpg, { force: true });
  if (!KEEP) rmSync(src, { force: true }); // libera disco: 926 originais de celular passam de 30GB
  return {
    commit: { id: m.ex.id, video_path: `${base}.mp4` },
    mb, avisos,
    remoteName: STAGING ? localStagingFileName(m.arquivo) : null,
  };
}

if (DRY) {
  console.log(`\n[dry-run] rodando QA em ${alvos.length} arquivo(s), sem enviar nada...`);
  let bloqueados = 0, comAvisoDry = 0;
  await pool(alvos, JOBS, async (m) => {
    try {
      const i = await inspectVideoSource(join(DIR, m.arquivo));
      const decisao = decideVideoIngestSafety(i);
      if (!decisao.ready) {
        bloqueados++;
        console.log(`  ✖ ${m.arquivo}: ${decisao.blockers.join(", ")}`);
      } else if (decisao.warnings.length) {
        comAvisoDry++;
        console.log(`  ⚠ ${m.arquivo}: ${decisao.warnings.join(", ")}`);
      }
    } catch {
      bloqueados++;
      console.log(`  ✖ ${m.arquivo}: ${decideVideoIngestSafety(null).blockers.join(", ")}`);
    }
  });
  console.log(`\n[dry-run] ${alvos.length - bloqueados} prontos, ${bloqueados} bloqueados, ${comAvisoDry} com aviso aceito. Nada foi enviado.`);
  process.exit(0);
}
if (!alvos.length) { console.log("\nNada novo a processar."); process.exit(0); }

mkdirSync(WORK, { recursive: true });
console.log(`\nProcessando ${alvos.length} vídeo(s) com ${JOBS} em paralelo...`);
const commits = [], processedStaging = [], falhas = [], comAviso = [];
let feitos = 0;
await pool(alvos, JOBS, async (m) => {
  try {
    const r = await processar(m);
    commits.push(r.commit);
    if (r.remoteName) {
      processedStaging.push({ exerciseId: r.commit.id, remoteName: r.remoteName });
    }
    if (r.avisos.length) comAviso.push({ arquivo: m.arquivo, exercicio: m.ex.name, avisos: r.avisos });
    if (++feitos % 25 === 0 || feitos === alvos.length) console.log(`  ...${feitos}/${alvos.length}`);
  } catch (e) {
    falhas.push({ arquivo: m.arquivo, exercicio: m.ex.name, erro: String(e.message || e).slice(0, 160) });
  }
});

// ---------- 3. Confirmar no banco ----------
let atualizados = 0;
const idsPublicados = new Set();
for (let k = 0; k < commits.length; k += 50) {
  const result = await call({ action: "commit", items: commits.slice(k, k + 50) });
  atualizados += result.updated;
  for (const item of result.results || []) {
    if (item.ok) idsPublicados.add(item.id);
  }
}
if (STAGING && atualizados && processedStaging.length) {
  // Só limpa a triagem depois que o vídeo está publicado: se algo falhar, o take original
  // continua lá para uma nova tentativa.
  const remover = stagingNamesForSuccessfulCommits(processedStaging, idsPublicados);
  if (remover.length) {
    for (let k = 0; k < remover.length; k += 100) {
      await call({ action: "remove-recordings", names: remover.slice(k, k + 100) });
    }
    console.log(`Triagem limpa: ${remover.length} arquivo(s) já publicado(s).`);
  }
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
