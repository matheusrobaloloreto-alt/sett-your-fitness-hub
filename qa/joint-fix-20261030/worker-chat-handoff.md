# Worker CHAT+FOCUS — freeze local 2026-10-30

Workspace: /Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix
Baseline detached: 04c7cd3f7e1bbcf732c017b032f1a21a32b48a46
Stage: local only. No commit/push/deploy/migration/DB write/secrets/lockfile/SW changes.
Skills applied: matt-engineering-workflow and systematic-debugging.

## Change

- Real hook uses ephemeral shared store keyed by user/role/company. First-load is distinct from same-scope refresh; focus requests deduplicate. Policy changes supersede older generations. No persisted grants. Last consumer cleanup invalidates old ACKs.
- 15-second validation deadline; explicit error and retry. Last valid snapshot only preserves existing composition; operational getter blocks dispatch while pending/error. Async dispatch boundaries wait for same-scope validation and check mounted identity again. No retry of dispatched/uncertain requests was introduced.
- Panel and FeatureRoute retain mounted children during refresh, using disabled fieldset plus inert for interaction blocking. Revocation/unavailable scope unmounts; role/user/company changes clear panel requests.
- Native file input change captures a file returned during pending validation in React state. Recovery requires an explicit click after validation; no auto-send. Pending file is cleared on cancel or identity/tenant/conversation change.
- Existing protected login/preflight, signatures, media/sequence contracts and uncertain ACK locks remain intact. Backend/protocol unchanged.

## Evidence

RED: copied former reproduction to src/components/chat-focus-regression.test.tsx and ran against original production files: 1 failed, duringRefreshComposerPresent=false, afterIdenticalRefreshComposerPresent=false, unmounts=1.
GREEN original reproduction: during=true, after=true, unmounts=0.
Integration tests use real provider + real hook + mocked Supabase RPC (only inner diagnostic chat mocked). Real WhatsAppChat file-return test uses real hook and mocked RPC/network.

Initial targeted regression run: 31/31 in six files passed (/tmp/sett-chat-focus-tests.log).
Final focused freeze run: 16/16 in three files passed (/tmp/sett-chat-focus-freeze-tests.log): chat-focus-regression (10), useCompanyFeatures (5), WhatsAppChat.focus (1).
Expanded final regression: 33/33 across six files passed (/tmp/sett-chat-focus-final-tests.log).
Targeted ESLint: /tmp/sett-chat-focus-freeze-lint.log, clean. git diff --check passed.

Covered: pending focus/identical ACK, dedup across consumers, dispatch pause, reject/retry, timeout/late ACK after revocation, user/company/role/logout change, explicit close/cancel, waiter cancellation, file preservation/no send while blocked, protected login ACK/token and uncertain ACK, sequence locks.

## Limits and handoff

Native browser filechooser and integrated UI/layout QA remain with root at the prepared preview; no claim of real provider delivery. No production action authorized/performed. The app-wide TSC attempt was stopped due to concurrent resource load; no TSC pass claimed. No full suite/build run. Radix Dialog description warning remains in existing panel tests.
Do not revert other workers or root changes (CLAUDE, StudentPortal/history, whatsappRecipientSafety test, outputs).
Rollback: root may revert only the worker-owned patches listed below after preserving any subsequent integration edits.

## Frozen paths and SHA256

- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/hooks/useCompanyFeatures.tsx` — `01ac72976c883dda881922aef87af1e527bfa2bc6026bdd2f08e0aa1db88a5ae`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/components/WhatsAppChatPanel.tsx` — `a1928b2f521d24176882ec49191e6313b64806589eb240252e8c0062c2f65dd2`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/components/FeatureRoute.tsx` — `a0492285f4315e67e00496dbb10bf9943915306f6fb43b0bb7d7bf7ac64549ab`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/pages/admin/WhatsAppChat.tsx` — `7b18c5d67580cf311ad86c65a333d46984d61f2acdc2b2dbf060a738931e8b79`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/components/chat-focus-regression.test.tsx` — `cd6d22a21f6b170c133b464a6cb74b2b2327660d5938730365563a07e0556262`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/pages/admin/WhatsAppChat.focus.test.tsx` — `fed8d38134b70a646289660356ca01d46e455328013622cc7a381ef1fd858b39`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/pages/admin/WhatsAppChat.loginAccess.test.tsx` — `0033d62cb37fcd89b9eebc673578a753ea7e82557353b4ee89b1da6b69bfd746`

## Reopened freeze — independent async-wait finding (2026-10-30)

Previous freeze revoked by root. Read INDEPENDENT-REVIEW.md end to end and ran the unchanged QA adversarial.test.tsx.
RED reproduced locally: 2 failed / 1 passed (/tmp/sett-chat-async-red.log). Both discard and recipient-navigation cases posted the stale protected send after validation ACK.

Changed only WhatsAppChat.tsx plus the worker-owned WhatsAppChat.focus.test.tsx in this follow-up:
- Suspended operations carry a recipient generation checked before and after commercial-validation wait. Scope includes identity, tenant, chat, canonical recipient phone/student, draft recipient and navigation request. Returning A -> B -> A does not revive the old generation.
- Protected sends capture the login-draft generation; after await they recheck generation, draft identity, owner and studentLoginSendPayload against the live target immediately before POST. Explicit discard/replacement cancels the pending protected POST.
- Ordinary cancellation cannot restore the old text/reply into the new conversation.
- Template and sequence dispatches repeat existing scope/version checks after the wait. Sequence requestStarted is set only at actual invocation, preserving the distinction between cancellation before dispatch and uncertain delivery.
- Added real-chat ordinary A -> B -> A regression with zero POST and preservation of the newer composer text. Independent QA assertions/files were not edited.

GREEN unchanged adversarial tests: 3/3 (/tmp/sett-chat-async-freeze-adversarial.log).
Worker regression run: 34/34 across the same six files (/tmp/sett-chat-async-regressions.log).
Final frozen-code regression: 34/34 across six files passed (/tmp/sett-chat-async-freeze-regressions.log).
ESLint follow-up log: /tmp/sett-chat-async-freeze-lint.log; git diff --check passes.
Stage still local only, HEAD unchanged. Root owns independent re-run/native filechooser/build/integration gate. No sends to providers/students, production changes, commit/push/deploy/DB writes occurred.

### Replacement SHA256 for changed files

- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/pages/admin/WhatsAppChat.tsx` — `93c7e6a4633f7b49d07f8d66af3f85aaafabe78530a69e0e4c1816e6446fa956`
- `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix/src/pages/admin/WhatsAppChat.focus.test.tsx` — `b853c6e0142b3475bdf685fc9ec303f766a484f48b9c25e805f88820db74192e`
