#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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

const run = promisify(execFile);
const OLD_REQUEST = "11111111-1111-4111-8111-111111111111";
const NEW_REQUEST = "22222222-2222-4222-8222-222222222222";
const OPERATOR = "0123456789abcdef";

test("a take novo nunca reutiliza o cache local de um request antigo", () => {
  const oldName = `001__${OPERATOR}__${OLD_REQUEST}.mp4`;
  const newName = `001__${OPERATOR}__${NEW_REQUEST}.mp4`;
  const selected = selectLatestStagingItems([
    { name: oldName, created_at: "2026-08-20T10:00:00.000Z" },
    { name: newName, created_at: "2026-08-20T11:00:00.000Z" },
  ]);

  assert.deepEqual(selected.map((item) => item.name), [newName]);
  assert.equal(localStagingFileName(oldName), oldName);
  assert.equal(localStagingFileName(newName), newName);
  assert.notEqual(localStagingFileName(oldName), localStagingFileName(newName));
  assert.equal(stagingCodeFromName(newName), "001");
});

test("a limpeza remove somente o take processado cujo commit individual passou", () => {
  const oldName = `001__${OPERATOR}__${OLD_REQUEST}.mp4`;
  const newName = `001__${OPERATOR}__${NEW_REQUEST}.mp4`;
  const otherName = `002__${OPERATOR}__33333333-3333-4333-8333-333333333333.mp4`;

  const removable = stagingNamesForSuccessfulCommits([
    { exerciseId: "exercise-1", remoteName: newName },
    { exerciseId: "exercise-2", remoteName: otherName },
  ], new Set(["exercise-1"]));

  assert.deepEqual(removable, [newName]);
  assert(!removable.includes(oldName));
  assert(!removable.includes(otherName));
});

test("nomes remotos fora do contrato não viram caminho local", () => {
  assert.throws(() => localStagingFileName("../../take.mp4"), /inválido/i);
});

test("canário final 360x480 H264/yuv420p segue publicável", () => {
  const decision = decideVideoIngestSafety({
    dur: 12,
    w: 360,
    h: 480,
    codec: "h264",
    pixFmt: "yuv420p",
  });

  assert.equal(decision.ready, true);
  assert.deepEqual(decision.blockers, []);
  assert.deepEqual(decision.warnings, []);
});

test("original 480x360 válido vira aviso aceito, não bloqueio", () => {
  const decision = decideVideoIngestSafety({
    dur: 14,
    w: 480,
    h: 360,
    codec: "h264",
    pixFmt: "yuv420p",
  });

  assert.equal(decision.ready, true);
  assert.deepEqual(decision.blockers, []);
  assert.deepEqual(decision.warnings, ["resolução 480x360 aceita no limite 360p"]);
});

test("fonte WebM/VP9 decodável passa para elegibilidade de transcode", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bn-vp9-source-"));
  try {
    const source = join(dir, "source.webm");
    await run("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=480x360:rate=15",
      "-t", "4", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", source,
    ], { maxBuffer: 4 << 20 });

    const info = await inspectVideoSource(source);
    const decision = decideVideoIngestSafety(info);

    assert.equal(info.codec, "vp9");
    assert.equal(info.decodable, true);
    assert.equal(decision.ready, true);
    assert.deepEqual(decision.blockers, []);
    assert.deepEqual(decision.warnings, ["resolução 480x360 aceita no limite 360p"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("vídeos curtos, longos, corruptos, indecodáveis ou com dimensão inválida bloqueiam", () => {
  const cases = [
    [{ dur: 2.375, w: 480, h: 360, codec: "h264", pixFmt: "yuv420p" }, "curto demais (2.4s)"],
    [{ dur: 90.25, w: 480, h: 360, codec: "h264", pixFmt: "yuv420p" }, "longo demais (90.3s)"],
    [{ dur: 10, w: 480, h: 360, codec: "vp9", pixFmt: "yuv420p", decodable: false }, "ilegível/corrompido"],
    [{ dur: 10, w: 320, h: 480, codec: "h264", pixFmt: "yuv420p" }, "dimensão inválida (320x480)"],
    [null, "ilegível/corrompido"],
  ];

  for (const [info, expected] of cases) {
    const decision = decideVideoIngestSafety(info);
    assert.equal(decision.ready, false, expected);
    assert(decision.blockers.includes(expected), `${expected} deveria bloquear`);
  }
});

test("item bloqueado falha antes de qualquer sign/upload/commit", async () => {
  let signs = 0;
  let uploads = 0;
  let commits = 0;
  const blocked = { dur: 2.375, w: 480, h: 360, codec: "h264", pixFmt: "yuv420p" };

  assert.throws(() => {
    assertUploadableVideoMetadata(blocked);
    signs += 1;
    uploads += 1;
    commits += 1;
  }, /curto demais/);

  assert.equal(signs, 0);
  assert.equal(uploads, 0);
  assert.equal(commits, 0);
});

test("contrato do upload final permanece H264/yuv420p", () => {
  const args = buildUploadTranscodeArgs({
    recorte: [],
    src: "source.webm",
    outMp4: "out.mp4",
  });

  assert.deepEqual(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2), ["-c:v", "libx264"]);
  assert.deepEqual(args.slice(args.indexOf("-pix_fmt"), args.indexOf("-pix_fmt") + 2), ["-pix_fmt", "yuv420p"]);
});
