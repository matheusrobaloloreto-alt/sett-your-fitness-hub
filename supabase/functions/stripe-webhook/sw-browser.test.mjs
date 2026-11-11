import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const shell =
  '<!doctype html><title>Set Training App</title><div id="root"></div><script type="module" src="/assets/index-synthetic123.js"></script>';
test("Chromium: SW retries a truncated 200 module and preserves healthy shell across 503/offline", async () => {
  let failure = false;
  let moduleRequests = 0;
  const sw = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
  const cacheName = sw.match(/const CACHE = "([^"]+)"/)[1];
  const server = createServer((req, res) => {
    if (req.url === "/sw.js") {
      res.writeHead(200, {
        "content-type": "application/javascript",
        "cache-control": "no-store",
      });
      res.end(sw);
    } else if (req.url === "/assets/retry-synthetic123.js") {
      moduleRequests++;
      if (moduleRequests === 1) {
        res.writeHead(200, { "content-type": "application/javascript", "content-length": "12000" });
        res.flushHeaders();
        res.write("export default ");
        setTimeout(() => res.destroy(), 30);
      } else {
        res.writeHead(200, { "content-type": "application/javascript" });
        res.end("export default 'recovered after body failure'");
      }
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
    assert.equal(await page.evaluate(async () => {
      const module = await import("/assets/retry-synthetic123.js");
      return module.default;
    }), "recovered after body failure");
    assert.equal(moduleRequests, 2);
    await page.waitForFunction(async (name) =>
      Boolean(await (await caches.open(name)).match("/assets/retry-synthetic123.js")), cacheName);
    assert.equal(await page.evaluate(async () =>
      (await fetch("/assets/retry-synthetic123.js")).text()), "export default 'recovered after body failure'");
    assert.equal(moduleRequests, 2);
    failure = true;
    await page.reload();
    assert.equal(await page.title(), "Set Training App");
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.title(), "Set Training App");
    assert.equal(await page.evaluate(() => window.syntheticShell), true);
    const status = await page.evaluate(async (name) => {
      const names = await caches.keys();
      const cache = await caches.open(name);
      return { names, status: (await cache.match("/"))?.status };
    }, cacheName);
    assert.equal(status.status, 200);
    assert.ok(status.names.includes(cacheName));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
