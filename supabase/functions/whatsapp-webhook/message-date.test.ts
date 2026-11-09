import { messageDate } from "./index.ts";

Deno.test("provider history keeps its timestamp across provider encodings", () => {
  const expected = "2026-11-09T10:23:00.000Z";
  const ms = Date.parse(expected);
  for (const value of [ms, ms / 1000, String(ms / 1000), expected,
    { low: (ms / 1000) | 0, high: 0, unsigned: true },
    { low: ms | 0, high: Math.floor(ms / 4294967296), unsigned: true },
  ]) {
    if (messageDate(value)?.toISOString() !== expected) throw new Error("Provider timestamp drift");
  }
});

Deno.test("malformed provider history timestamps are never interpreted as now", () => {
  for (const value of [null, false, [], "", "0", "2026-11-09", "invalid", { low: 3.1, high: 0 }]) {
    if (messageDate(value) !== null) throw new Error("Invalid provider timestamp accepted");
  }
});
