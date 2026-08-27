#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const htmlFiles = [
  "docs/project/gravacao/gravacao-modelo-1.html",
  "docs/project/gravacao/gravacao-modelo-2.html",
  "docs/project/gravacao/gravacao-modelo-3.html",
  "public/gravacao/modelo-1-67698060b9.html",
  "public/gravacao/modelo-2-57d17ab40a.html",
  "public/gravacao/modelo-3-13b57ff210.html",
];
const expectedCounts = [308, 309, 307, 308, 309, 307];

for (const [index, path] of htmlFiles.entries()) {
  const source = read(path);
  assert.doesNotMatch(source, /\bTOK\s*=/, `${path}: token operacional embutido`);
  assert.doesNotMatch(source, /RECORDING_TOKENS|x-webhook-secret|token:TOK/, `${path}: autenticação antiga presente`);
  assert.match(source, /signInWithPassword/, `${path}: login Supabase ausente`);
  assert.match(source, /Authorization':'Bearer '\+current\.access_token/, `${path}: JWT da sessão ausente`);
  assert.match(source, /action:'authorize-recording'/, `${path}: gate de operador ausente`);
  assert.match(source, /request_id:requestId/, `${path}: idempotência/replay id ausente`);
  assert.match(source, /mime_type:file\.type,size:file\.size/, `${path}: limites de upload ausentes`);
  assert.match(source, /data-id="[0-9a-f-]{36}"/, `${path}: vínculo exercício ausente`);
  assert.match(source, /Content-Security-Policy/, `${path}: CSP ausente`);
  const csp = (source.match(/Content-Security-Policy" content="([^"]+)/)?.[1] || "")
    .replaceAll("&#39;", "'");
  assert.match(csp, /script-src[^;]*sha256-/, `${path}: hash CSP ausente`);
  assert.match(source, /integrity="sha384-[^"]+"/, `${path}: SRI da dependência ausente`);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, `${path}: script inline sem hash CSP`);
  assert.match(source, /storage:window\.sessionStorage/, `${path}: sessão persistida fora da aba`);
  assert.match(source, /p\.replaceChildren\(media\)/, `${path}: player não usa DOM seguro`);
  assert.equal((source.match(/data-cod="\d{3}"/g) || []).length, expectedCounts[index], `${path}: exercícios divergiram`);
  const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter(Boolean);
  assert.equal(inlineScripts.length, 1, `${path}: quantidade inesperada de scripts inline`);
  new Script(inlineScripts[0], { filename: path });
  const digest = createHash("sha256").update(inlineScripts[0]).digest("base64");
  assert.match(csp, new RegExp(`sha256-${digest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${path}: hash CSP não corresponde ao script`);
}

for (let model = 1; model <= 3; model += 1) {
  const internal = read(`docs/project/gravacao/gravacao-modelo-${model}.html`);
  const publicName = htmlFiles[model + 2];
  assert.equal(read(publicName), internal, `modelo ${model}: cópia pública divergiu da interna`);
}

const codeMap = JSON.parse(read("docs/project/gravacao/codigo-para-exercicio.json"));
const edgeAllowlist = JSON.parse(read("supabase/functions/library-video-ingest/recording-exercise-allowlist.json"));
const retired = JSON.parse(read("docs/project/gravacao/roteiro-retirados.json"));
assert.equal(Object.keys(codeMap).length, 924, "mapa canônico deve manter 924 exercícios vivos");
assert.deepEqual(edgeAllowlist, codeMap, "allowlist da edge divergiu do mapa de gravação");
assert.deepEqual(retired.map((item) => item.codigo), ["355", "396"], "códigos retirados divergiram");
for (const item of retired) {
  assert.equal(item.motivo, "exercise_absent_from_live_library", "motivo de retirada inesperado");
  assert.equal(codeMap[item.codigo], undefined, `código retirado ${item.codigo} permaneceu no mapa`);
  for (const source of htmlFiles.map(read)) {
    assert.doesNotMatch(source, new RegExp(`data-cod="${item.codigo}"`), `código retirado ${item.codigo} permaneceu no HTML`);
  }
}

const edge = read("supabase/functions/library-video-ingest/index.ts");
assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']?:\s*["']\*["']/, "CORS wildcard reintroduzido");
assert.doesNotMatch(edge, /Deno\.env\.get\("RECORDING_TOKENS"\)/, "token legado reintroduzido");
assert.match(edge, /RECORDING_OPERATOR_USER_IDS/, "allowlist server-side ausente");
assert.match(edge, /RECORDING_COMPANY_ID/, "validação de tenant ausente");
assert.match(edge, /exercise-video-staging/, "bucket privado de triagem ausente");
assert.match(edge, /validateStagingBucketPolicy/, "policy de MIME\/tamanho ausente");
assert.match(edge, /replayGuard\.assertFresh/, "proteção de replay ausente");
assert.match(edge, /_requests\/\$\{operatorTag\}/, "reserva persistente de replay ausente");
assert.match(edge, /async function fetchLibraryRows[\s\S]*?\.range\(from, from \+ pageSize - 1\)/, "leitura paginada da biblioteca ausente");
assert.match(edge, /async function coverage[\s\S]*?fetchLibraryRows\(/, "cobertura pode voltar a truncar em 1.000 exercícios");

const cli = read("scripts/video-ingest.mjs");
assert.match(cli, /idsPublicados\.add\(item\.id\)/, "CLI não registra commits individuais concluídos");
assert.match(cli, /stagingNamesForSuccessfulCommits\(processedStaging, idsPublicados\)/, "CLI pode limpar staging sem commit individual");
assert.match(cli, /ausente\(s\) da biblioteca/, "CLI não distingue roteiro pendente de exercício ausente da biblioteca");

const hostingHeaders = read("public/_headers");
assert.match(hostingHeaders, /\/gravacao\/\*/, "rota de gravação sem headers dedicados");
assert.match(hostingHeaders, /Content-Security-Policy:\s*frame-ancestors 'none'/, "clickjacking não bloqueado no hosting");
assert.match(hostingHeaders, /X-Frame-Options:\s*DENY/, "fallback X-Frame-Options ausente");
assert.match(hostingHeaders, /X-Content-Type-Options:\s*nosniff/, "nosniff ausente no hosting");
assert.match(hostingHeaders, /Referrer-Policy:\s*no-referrer/, "referrer policy ausente no hosting");

const config = read("supabase/config.toml");
assert.match(config, /\[functions\.library-video-ingest\][\s\S]*?verify_jwt\s*=\s*false/, "config explícita da edge ausente");

console.log(`recording hardening: ${htmlFiles.length} HTMLs + edge + allowlist verificados`);
