# Backend local — sequências WhatsApp

Owner: backend only; branch codex/sett-self-service-local-20261026, baseline 45b6c3a; preserve pre-existing dirty. No remote application, deploy or real sends. Root owns UI/integration; manual draft worker owns src copied-message paths.

## Plano curto
1. Extend pure TS and current SQL validator, preserve messages/CAS/history.
2. Private immutable media refs; frozen rendered sequence and ordered per-part intent/receipt.
3. Integrate funnel Lead/student, weekly worker/webhook and intercycle; manual manager action.
4. Focused contract/dispatch regression and SQL PGlite; root performs independent review and native staging gate.

## Upload and runtime contract
- Private bucket `whatsapp-media`; path `<companyId>/message-settings/<uuid>.<ext>`; `upsert:false`. Removing a draft part does not delete Storage. New restrictive policies deny client overwrite/delete of this namespace.
- Reference `{bucket,path,mimeType,fileName}`. No persisted URL. Image JPEG/PNG/WebP; video MP4; audio MPEG/MP4/OGG/WebM. At most 16 MiB per settings attachment. Runtime verifies private bucket, actual object metadata/size and initial file signature, then signs for 300 seconds (Supabase createSignedUrl).
- 1..10 configured parts; absent field/event means legacy, `{}` resets overrides, `[]` rejected. Four push strings excluded. Media caption may be empty.
- `whatsapp-manager` action `send-message-sequence`: `{companyId,chatId,studentId?,remoteJid,requestId,parts,signMessages?}`. Stable requestId 1..100 `[A-Za-z0-9_-]`. Caller must preserve requestId on retry and generate a new one only for a new deliberate occurrence. Normal manager Auth/tenant/chat/recipient/instance gates apply. Profile name resolved server-side; signMessages true applies the active professional signature before snapshot. Media must be referenced by saved current/historical company settings.
- Success `{success:true,sequenceComplete:true,requestId}` only after all receipts. Uncertain returns HTTP409/code `dispatch_uncertain`; pre-provider failure HTTP422/code `sequence_not_completed`. No provider fallback on uncertain responses.
- Audio captions/signatures become a separate text delivery immediately after audio; internal ledger therefore permits up to 20 delivery units while editor/config retain max10. Both units are acknowledged independently.

## SQL and dependency baseline for root staging gate
Migration CLI-created: `20261029122806_company_whatsapp_message_sequences.sql` **FROZEN** SHA-256 `b26eb3f2a2640502cb9bd90a40757a45e8d87a3feade8f05be0a92f6e5f5f438`; reviewed before root narrow apply.
Requires current company settings tables/defaults/save RPC, latest prescription methodology helpers/validator (`20261028090117`), private `storage.objects/buckets`, tenant helpers `has_role`, `is_company_staff`, `try_uuid`; WhatsApp chats; automation flow/session and intercycle tables from existing baseline.
Requires `lock_automation_dispatch_owner(text,uuid,uuid)` from automation recovery, with latest flow/intercycle lease/status/server-clock semantics; latest replacement in `20261028130000_communications_reconciliation.sql` additionally recognizes webhook. New sequence scope only binds flow/intercycle, passing `{kind,ownerId,leaseToken}`. Standalone funnel/manual/webhook occurrences use null scope and per-part fencing. Owner lock failure blocks claim/authorize; ACK can record a matching in-flight receipt after owner lease expiry without authorizing further sends.
CAS save RPC is not replaced. Validator is replaced in-place (same OID), all previous field logic retained; new trigger enforces real private media/tenant metadata before the CAS transaction commits history. No historical settings rewrite.
New RPCs are service_role only: snapshot_company_message_sequence, claim_company_message_part, authorize_company_message_part, ack_company_message_part, complete_intercycle_message_sequence. New tables RLS enabled and no client writes/read grants.
Snapshot freezes rendered text, media refs, recipient, instance, scope and metadata. First snapshot wins. Confirmed parts skipped; missing media before claim can retry. In-flight intent never automatically resets; timeout/503/missing receipt/ACK failure pauses. An uncertain part requires provider evidence and controlled technical reconciliation; no blind reset RPC exists.

## Consumers inventory / root handoff
Automatic: `_shared/sales-funnel.ts` sendFunnelWhatsAppMessage (fiscal_invite/payment_link/assessment_onboarding), sendPreRegistrationConfirmation (pre_registration_confirmation); callers public-registration, asaas-integration, asaas-webhook. Worker process-automation-sessions: weekly central opt-in and intercycle invite. Webhook executeFlow: weekly central opt-in. Custom flow nodes retain legacy text path.
Push-send eventMessage consumers: daily_reminder_title/body and new_workout_push_title/body unchanged.
Manual delegated: src/lib/studentChat.ts draftCompanyEventMessage/openStudentChat; RegistrationManager direct draft calls (first_contact/fiscal/payment/assessment/renewals); AnamnesisManager direct anamnesis draft; AdminDashboard and AtRiskStudents renewal actions; whatsappChatPanel/whatsappChatRequest transport; WhatsAppChat final confirmation. Root/manual worker must integrate all (see independent QA inventory).

## Validation limitations
PGlite is SQL contract evidence only; synthetic Auth/Storage primitives and single-process execution do not certify native Supabase Storage/JWT/concurrency. The SQL regression loads the real baseline recovery/lease functions (not a fake lock). Native application and HTTP readback belong to root's pinned staging window. Docker/Colima/shared localPG must not be restarted or mutated by this worker. No native success claimed.

## Freeze and review notes
- Uniform lock order: owner, then sequence, then part. Snapshot uses owner then advisory-creation lock then sequence. Claim/authorize fence the current owner before touching sequence. ACK only records a matching unique token/part receipt; it cannot authorize another send.
- Current validator is replaced in-place, preserving OID and all previous field logic. No rename/wrapper or CAS RPC replacement. Existing claim functions retain original predicates plus new ledger awareness: known snapshots avoid incorrect legacy adoption; in-flight parts park the owner.
- New `inspect_company_message_sequences(companyId)` is an authenticated same-company staff projection of uncertain occurrences with counts only. Root may integrate it into reconciliation UI; it returns no body/phone/media link. No technical resolution/retry RPC is exposed.
- Rendered manual parts use `validateRenderedMessageParts`; template parts use `validateMessageSequences`. Rendered text/links retain literal braces. Both enforce strict string type, shapes/count/private reference; secret-like content remains rejected. Global master is rechecked separately from company staff at each manual send boundary.
- Manual projections preserve sender_id, panel_manual origin and last_sender_id; automatic projections use automation origin. Projection errors follow durable ACK and never repeat provider calls.
- Legacy dispatch receipt checks prevent upgrading an already ACKed flow/webhook occurrence into a new sequence. Removed overrides still resume an existing frozen sequence. Intercycle metadata freezes token hash/expiry; current student opt-in, tenant/recipient/instance, cycle and enrollment are checked per pending part; expired original invite cannot silently become a different link.

## Focused reproducible commands
```sh
deno test --no-lock --allow-read --allow-env supabase/functions/_shared/message-sequence.test.ts supabase/functions/_shared/funnel-message-sequences.test.ts supabase/functions/process-automation-sessions/communications.test.ts supabase/functions/process-automation-sessions/intercycle-sequence.test.ts supabase/functions/whatsapp-manager/whatsappSignature.integration.test.ts
SETT_TEST_PGLITE_MODULE=/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/message_sequences_contract.test.mjs
deno check --no-lock supabase/functions/whatsapp-manager/index.ts supabase/functions/process-automation-sessions/index.ts supabase/functions/whatsapp-webhook/index.ts supabase/functions/_shared/sales-funnel.ts
```
The SQL test uses a fresh in-memory instance, creates no remote resources and does not touch Docker/shared localPG. Its checks cover legacy defaults, all ten events/max10, malformed shapes and media, CAS/history atomicity, ordered ACK/idempotency, actual baseline lease rotation, stale owner fencing and ambiguous recovery pause. Native concurrent session/Auth/Storage proof is explicitly delegated to root; the two root-owned hosted scripts were not changed.

## Rollback and remaining gate
No commit/push/deploy was made by backend worker. Local rollback must selectively remove this feature's additions while preserving pre-existing dirty code; never restore whole consumer files from HEAD. After migration application, prefer a forward fix; never remove frozen snapshots/receipts to recover uncertainty. Technical release/independent QA and native staging application remain root-owned. Production and real provider sends are outside authorization.

## Final local evidence
- Combined Deno command above: **89 passed, 0 failed** (12 sequence contract/runtime; 2 funnel Lead/student; 13 weekly worker/webhook; 1 intercycle frozen invitation; 61 manager signature/tenant/manual sequence regressions). Counts are from one combined run; earlier subset runs overlap and must not be summed.
- PGlite command above: **5 passed, 0 failed**, including actual baseline recovery functions and lease rotation. This does not certify multi-session native concurrency.
- Deno check of four changed consumer entrypoints/shared sender: passed. Scoped git diff --check: passed.
- Final per-file SHA-256 inventory is `2026-10-29-message-sequences-backend-files.sha256` alongside this document. Whole-file hashes include preserved previous changes; they do not mean the entire dirty diff belongs to this feature.
- Branch remains `codex/sett-self-service-local-20261026`, HEAD `45b6c3a`; backend worker made no commit/push/remote change, did not start/restart Docker/Colima and did not edit root-owned hosted tests.
- Mocks for legacy consumers now need an explicit `company_message_sequences -> null` row when absent; a catch-all fake chat row is not a valid snapshot. Root owns frontend mock/integration adjustments.
- Root still owes independent frozen-diff review, native staging apply/Auth/Storage/CAS and hybrid runtime evidence. No native/hosted success is claimed here.

## Follow-up: contact without an existing chat
Root requested support for `chatId:null` (first contact/Lead draft). Manager now validates recipient and active membership/instance, looks up the exact tenant+instance+direct recipient variants, and creates a chat before snapshot when absent. Unique creation conflict reloads the same scoped conversation. Existing chat/student links are never reassigned. Invalid/foreign student identity, ambiguous/failed lookup or persistence failure blocks dispatch. Success and post-resolution failure responses include `chatId`; requestId remains stable across retry, including a retry that again supplies chatId:null. `manualSequenceResult` already transports chatId; no frontend files were edited.

Latest targeted run: **67 manager tests passed, 0 failed** (the prior 61 plus six new contact-create/reuse/replay/race/persistence/identity cases). Deno check manager and scoped diff-check passed. Other backend suites from the combined 89-test run were unchanged and not repeated for this manager-only patch.
Manager SHA-256: `2a967b4e372b45d85834bbccc25bf9beeca6c813034dd099e9efd59cb9fd243f`. Migration remains frozen at `b26eb3f2a2640502cb9bd90a40757a45e8d87a3feade8f05be0a92f6e5f5f438`; no schema/runtime-module edits, remote writes or deploy occurred in this follow-up.
