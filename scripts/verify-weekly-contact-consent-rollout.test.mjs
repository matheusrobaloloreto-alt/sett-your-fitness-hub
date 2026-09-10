import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { verifyWeeklyContactConsentRollout } from "./verify-weekly-contact-consent-rollout.mjs";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const baseline = {
  edge: read("supabase/functions/process-automation-sessions/index.ts"),
  migration: read("supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql"),
  toggle: read("src/components/admin/WeeklyContactToggle.tsx"),
  rehearsal: read("scripts/rehearse-weekly-contact-consent-ledger.sql"),
};

const setDeclaration = /(export const PERMANENT_WEEKLY_CONTACT_ERROR_CODES = new Set\(\[)([\s\S]*?)(\]\);)/;

function mutatePermanentCodes(mutate) {
  const mutated = baseline.edge.replace(setDeclaration, (_declaration, start, body, end) => {
    return `${start}${mutate(body)}${end}`;
  });
  assert.notEqual(mutated, baseline.edge, "test mutation must change the permanent-code Set literal");
  return { ...baseline, edge: mutated };
}

test("rollout verifier accepts the exact permanent weekly-contact code Set", () => {
  assert.doesNotThrow(() => verifyWeeklyContactConsentRollout(baseline));
});

test("rollout verifier rejects a missing permanent weekly-contact code", () => {
  const sources = mutatePermanentCodes((body) => body.replace(
    '  "weekly_contact_recipient_mismatch",\n',
    "",
  ));
  assert.throws(
    () => verifyWeeklyContactConsentRollout(sources),
    /permanent weekly-contact error Set must equal exactly the five expected codes/,
  );
});

test("rollout verifier rejects an extra permanent weekly-contact code", () => {
  const sources = mutatePermanentCodes((body) => `${body}  "weekly_contact_unexpected",\n`);
  assert.throws(
    () => verifyWeeklyContactConsentRollout(sources),
    /permanent weekly-contact error Set must equal exactly the five expected codes/,
  );
});

test("rollout verifier rejects the transient consent-check code inside the permanent Set", () => {
  const sources = mutatePermanentCodes((body) => `${body}  "weekly_contact_consent_check_failed",\n`);
  assert.throws(
    () => verifyWeeklyContactConsentRollout(sources),
    /weekly_contact_consent_check_failed must remain retryable and outside the permanent Set/,
  );
});
