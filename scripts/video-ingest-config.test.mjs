import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  requestVideoIngest,
  resolveVideoIngestConfig,
} from "./video-ingest-config.mjs";

const productionRef = "zshrcgbyhzxpnlccssyz";
const stagingRef = "ifymocggowdlqqcxugko";
const productionKey = "sb_publishable_8hCHHItU79APt0pt7NrZcw_OPHCUd_d";
const stagingKey = process.env.TEST_STAGING_PUBLISHABLE_KEY;

test("target and project confirmation are mandatory", () => {
  assert.throws(() => resolveVideoIngestConfig({ env: {}, args: [] }), /SETT_DEPLOY_TARGET/);
  assert.throws(
    () => resolveVideoIngestConfig({
      env: { SETT_DEPLOY_TARGET: "production", VIDEO_INGEST_SECRET: "test-secret" },
      args: ["--confirm-project", stagingRef],
    }),
    /Confirme o projeto/,
  );
  assert.throws(
    () => resolveVideoIngestConfig({
      env: {
        SETT_DEPLOY_TARGET: "staging",
        VIDEO_INGEST_SECRET: "test-secret",
        VIDEO_INGEST_SUPABASE_URL: `https://${productionRef}.supabase.co`,
        VIDEO_INGEST_PUBLISHABLE_KEY: productionKey,
      },
      args: ["--confirm-project", stagingRef],
    }),
    /não corresponde/,
  );
});

test("staging requires isolated validated environment", { skip: !stagingKey }, () => {
  const config = resolveVideoIngestConfig({
    env: {
      SETT_DEPLOY_TARGET: "staging",
      VIDEO_INGEST_SECRET: "test-secret",
      VIDEO_INGEST_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
      VIDEO_INGEST_PUBLISHABLE_KEY: stagingKey,
    },
    args: ["--confirm-project", stagingRef],
  });
  assert.equal(config.target, "staging");
  assert.equal(config.projectRef, stagingRef);
  assert.equal(config.endpoint.includes(productionRef), false);
  assert.equal(config.endpoint, `https://${stagingRef}.supabase.co/functions/v1/library-video-ingest`);
});

test("request wrapper sends only to its resolved endpoint", async (t) => {
  let received = null;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received = {
      method: req.method,
      path: req.url,
      secret: req.headers["x-webhook-secret"],
      body: JSON.parse(body),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const result = await requestVideoIngest({
    endpoint: `http://127.0.0.1:${port}/functions/v1/library-video-ingest`,
    publishableKey: "public-test-key",
    secret: "server-test-secret",
  }, { action: "coverage" });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(received, {
    method: "POST",
    path: "/functions/v1/library-video-ingest",
    secret: "server-test-secret",
    body: { action: "coverage" },
  });
});
