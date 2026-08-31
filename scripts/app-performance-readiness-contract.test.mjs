import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const queryPath = new URL("./app-performance-readiness.sql", import.meta.url);

test("performance readiness stays aggregate-only and fail-closed", async () => {
  const sql = await readFile(queryPath, "utf8");

  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|truncate|grant|revoke)\b/i);
  assert.match(sql, /'student_workout'::text, 'shell_ready'::text/);
  assert.match(sql, /'student_workout'::text, 'content_ready'::text/);
  assert.match(sql, /'trainer_whatsapp'::text, 'content_ready'::text/);
  assert.match(sql, /samples, 0\) >= 30/);
  assert.match(sql, /actor_days, 0\) >= 10/);
  assert.match(sql, /active_dates, 0\) >= 3/);
  assert.match(sql, /array\['xs', 'sm'\]::text\[\]/);
  assert.match(sql, /array\['xs', 'sm', 'lg', 'xl'\]::text\[\], true, true/);
  assert.match(sql, /sample\.viewport_bucket = any\(expected\.expected_viewports\)/);
  assert.match(sql, /compact_samples, 0\) >= 10/);
  assert.match(sql, /compact_actor_days, 0\) >= 3/);
  assert.match(sql, /compact_active_dates, 0\) >= 2/);
  assert.match(sql, /wide_samples, 0\) >= 10/);
  assert.match(sql, /wide_actor_days, 0\) >= 3/);
  assert.match(sql, /wide_active_dates, 0\) >= 2/);
  assert.match(sql, /expected_viewport_pct/);
  assert.match(sql, /bool_and\(segment_ready\) over \(\)/);
  assert.doesNotMatch(sql, /full_name|email|phone|student_id|user_id|\n\s*actor_bucket\s*,/i);
});
