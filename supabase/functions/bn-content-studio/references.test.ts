import assert from "node:assert/strict";
import { fetchInstagramReference } from "./references.ts";

Deno.test("link import rejects unsafe targets without fetching and asks for a screenshot on inaccessible posts", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response("login", { status: 200 }); };
  for (const url of ["https://127.0.0.1/p/example", "https://evil.example/p/example", "https://user:pass@instagram.com/p/example"]) {
    await assert.rejects(() => fetchInstagramReference(url, fetcher), /reference_requires_upload/);
  }
  assert.equal(calls, 0);
  await assert.rejects(() => fetchInstagramReference("https://www.instagram.com/p/example/", fetcher), /reference_requires_upload/);
  assert.equal(calls, 1);
});
Deno.test("link import never follows an image URL outside the known CDN hosts", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response('<meta property="og:image" content="http://169.254.169.254/latest/">'); };
  await assert.rejects(() => fetchInstagramReference("https://www.instagram.com/p/example/", fetcher), /reference_requires_upload/);
  assert.equal(calls, 1);
});
