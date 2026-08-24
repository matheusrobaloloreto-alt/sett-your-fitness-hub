#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUploadableVideoMetadata,
  decideVideoIngestSafety,
  localStagingFileName,
  selectLatestStagingItems,
  stagingCodeFromName,
  stagingNamesForSuccessfulCommits,
} from "./video-ingest-safety.mjs";

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

test("vídeos curtos, longos, corruptos, com codec inválido ou dimensão inválida bloqueiam", () => {
  const cases = [
    [{ dur: 2.375, w: 480, h: 360, codec: "h264", pixFmt: "yuv420p" }, "curto demais (2.4s)"],
    [{ dur: 90.25, w: 480, h: 360, codec: "h264", pixFmt: "yuv420p" }, "longo demais (90.3s)"],
    [{ dur: 10, w: 480, h: 360, codec: "vp9", pixFmt: "yuv420p" }, "codec incompatível (vp9)"],
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
