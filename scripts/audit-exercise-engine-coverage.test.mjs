import assert from "node:assert/strict";
import test from "node:test";
import { assertCanonicalSupabaseUrl } from "./lib/canonical-supabase-url.mjs";

test("accepts only the exact canonical HTTPS Supabase origin", () => {
  assert.equal(
    assertCanonicalSupabaseUrl("https://zshrcgbyhzxpnlccssyz.supabase.co"),
    "https://zshrcgbyhzxpnlccssyz.supabase.co",
  );
  for (const unsafe of [
    "http://zshrcgbyhzxpnlccssyz.supabase.co",
    "https://zshrcgbyhzxpnlccssyz.supabase.co.evil.example",
    "https://evil.example/zshrcgbyhzxpnlccssyz.supabase.co",
    "https://zshrcgbyhzxpnlccssyz.supabase.co@evil.example",
    "https://zshrcgbyhzxpnlccssyz.supabase.co:8443",
    "https://zshrcgbyhzxpnlccssyz.supabase.co/rest/v1",
    "https://zshrcgbyhzxpnlccssyz.supabase.co?redirect=evil",
  ]) {
    assert.throws(() => assertCanonicalSupabaseUrl(unsafe), /Refusing non-canonical|valid URL/);
  }
});
