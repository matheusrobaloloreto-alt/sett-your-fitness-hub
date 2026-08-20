#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import {
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
