import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const shell =
  '<!doctype html><title>Set Training App</title><div id="root"></div><script type="module" src="/assets/index-synthetic123.js"></script>';
test("Chromium: production SW preserves healthy shell across 503/offline and activation", async () => {
  let failure = false;
  const sw = readFileSync(new URL("../../../public/sw.js", import.meta.url));
  const server = createServer((req, res) => {
    if (req.url === "/sw.js") {
      res.writeHead(200, {
        "content-type": "application/javascript",
        "cache-control": "no-store",
      });
      res.end(sw);
    } else if (req.url === "/assets/index-synthetic123.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end("window.syntheticShell=true");
    } else {
      res.writeHead(failure ? 503 : 200, {
        "content-type": "text/html",
        "cache-control": "no-cache",
      });
      res.end(failure ? "unavailable" : shell);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            { once: true },
          )
        );
      }
    });
    await page.reload();
    assert.equal(await page.title(), "Set Training App");
    failure = true;
    await page.reload();
    assert.equal(await page.title(), "Set Training App");
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.title(), "Set Training App");
    assert.equal(await page.evaluate(() => window.syntheticShell), true);
    const status = await page.evaluate(async () => {
      const names = await caches.keys();
      const cache = await caches.open("sett-cache-v13");
      return { names, status: (await cache.match("/"))?.status };
    });
    assert.equal(status.status, 200);
    assert.ok(status.names.includes("sett-cache-v13"));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
