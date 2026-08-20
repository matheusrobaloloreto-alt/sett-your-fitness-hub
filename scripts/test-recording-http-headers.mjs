#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/_headers"), "utf8");
const lines = source.split(/\r?\n/);
const routeIndex = lines.findIndex((line) => line.trim() === "/gravacao/*");
assert.notEqual(routeIndex, -1, "rota /gravacao/* ausente");

const headers = {};
for (const line of lines.slice(routeIndex + 1)) {
  if (!/^\s+/.test(line)) break;
  const separator = line.indexOf(":");
  if (separator < 0) continue;
  headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/gravacao/")) {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  }
  res.end("ok");
});
await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));

try {
  const address = server.address();
  assert(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/gravacao/modelo-1.html`);
  assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "no-store");
  console.log("recording headers: HTTP local staging harness aprovado");
} finally {
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
