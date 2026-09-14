#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildVideoPreparationManifest } from "./video-prepare-lib.mjs";

function makeTmp() {
  const root = join(tmpdir(), `sett-video-prepare-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function writeFixtureFile(path, size = 32) {
  writeFileSync(path, Buffer.alloc(size, path.length % 255));
}

test("preparo reconcilia recebidos com roteiro, hashes, duplicatas, bloqueios e destino", async () => {
  const root = makeTmp();
  try {
    const source = join(root, "recebidos");
    const staging = join(root, "_staging");
    const project = join(root, "docs/project/gravacao");
    mkdirSync(source, { recursive: true });
    mkdirSync(project, { recursive: true });
    const mapPath = join(project, "codigo-para-exercicio.json");
    writeFileSync(mapPath, JSON.stringify({
      "001": { id: "exercise-a", nome: "Agachamento" },
      "002": { id: "exercise-b", nome: "Remada" },
      "003": { id: "exercise-c", nome: "Supino" },
    }), "utf8");

    writeFixtureFile(join(source, "001-agachamento.mp4"), 40);
    writeFixtureFile(join(source, "001-agachamento-regravado.mp4"), 48);
    writeFixtureFile(join(source, "002-remada.mp4"), 52);
    writeFixtureFile(join(source, "999-antigo.mp4"), 56);
    writeFixtureFile(join(source, "sem-codigo.mp4"), 60);

    const inspect = async (file) => {
      if (file.includes("exercise-b")) {
        return { dur: 2, w: 480, h: 640, codec: "h264", pixFmt: "yuv420p", decodable: true };
      }
      return { dur: 12, w: 720, h: 1280, codec: "h264", pixFmt: "yuv420p", decodable: true };
    };

    const { manifest, manifestPath } = await buildVideoPreparationManifest({
      sourceDir: source,
      stagingRoot: staging,
      mapPath,
      runId: "run-test",
      inspect,
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    assert.equal(manifest.schema, "sett-video-preparation/v1");
    assert.equal(manifest.totals.source_files, 5);
    assert.equal(manifest.totals.ready, 1);
    assert.equal(manifest.totals.blocked, 1);
    assert.equal(manifest.totals.duplicate, 1);
    assert.equal(manifest.totals.stale_code, 1);
    assert.equal(manifest.totals.unmatched, 1);
    assert.equal(manifest.totals.missing, 1);

    const ready = manifest.items.find((item) => item.status === "ready");
    assert.equal(ready.code, "001");
    assert.equal(ready.destination.video_path, "biblioteca/exercise-a.mp4");
    assert.match(ready.sha256, /^[0-9a-f]{64}$/);

    const blocked = manifest.items.find((item) => item.code === "002");
    assert.equal(blocked.status, "blocked");
    assert.deepEqual(blocked.blockers, ["curto demais (2.0s)"]);

    const duplicate = manifest.items.find((item) => item.status === "duplicate");
    assert.equal(duplicate.exercise_id, "exercise-a");
    assert.equal(Boolean(duplicate.duplicate_of), true);

    const stale = manifest.items.find((item) => item.status === "stale_code");
    assert.equal(stale.source_name, "999-antigo.mp4");

    const persisted = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.deepEqual(persisted.totals, manifest.totals);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
