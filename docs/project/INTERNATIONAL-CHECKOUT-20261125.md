# International checkout — 2026-11-25

## Authorization and boundary

User authorized general foreign registration/payment implementation and staging validation. No production deployment, no real charges, no support communication. Production Asaas international capability remains unverified/unapproved. WhatsApp WIP in the checkout is unrelated and must not be bundled.

## Provider evidence (Sandbox only)

- Existing Sandbox key authenticated successfully with read-only customers request, HTTP 200.
- Synthetic customer created once with foreignCustomer=true and notificationDisabled=true, WITHOUT CPF/CNPJ, HTTP 200.
- CREDIT_CARD payment for this synthetic customer created once, amount BRL 5, HTTP 200, PENDING, with invoiceUrl.
- Browser verified hosted invoice only asks card number/holder/expiry/security code, no CPF or Brazilian postal code.
- Official synthetic approval Visa returned CONFIRMED, HTTP 200, without creditCardHolderInfo.
- Separate intentional synthetic attempt using the official refusal Mastercard also returned CONFIRMED. Therefore provider decline scenario is NOT validated; account/provider test behavior must be resolved. No automatic retries or real cards used.
- Provider fixtures are deliberately separate from SETT student/enrollment fixtures, so these checks alone do NOT prove SETT webhook or enrollment E2E.

## Reference baseline

- Fiscal/check-out/React existing tests: 24 passed.
- Payment business/installment tests: 6 passed.
- Deno Asaas environment/cancellation/projection/installment webhook helpers: 18 passed.
- Staging project verified ACTIVE_HEALTHY; required Asaas secret names exist. Secret presence does not prove deployed configuration or feature enablement.

## Release gates still required

- Frontend and Edge API payload/capability/errors must match.
- Review migration and public context if persistent payer fields are added.
- Independent review, tests, application typecheck and build.
- Staging-only deployment and synthetic registration, checkout, repeated webhook and renewal checks.
- Verify no duplicate customer/payment/enrollment and old workout remains available.
- Full international card rejection in provider Sandbox remains separate from local mocked rejection coverage.
- Production remains unchanged and foreign capability off until Asaas authorization confirmed.

## Current documentation

https://docs.asaas.com/reference/criar-novo-cliente
https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito
https://docs.asaas.com/docs/faq-sandbox
https://central.ajuda.asaas.com/hc/pt-br/articles/31972902909851-Como-receber-pagamentos-internacionais

## Final implemented candidate and staging evidence

Branch: `codex/sett-international-checkout-20261125`, based on `6d81d5e`.

- Named country selectors (249 ISO assignments), separate payer country, foreign document/address/E.164 phone. Brazilian flow remains separate; international flow uses the hosted card invoice, one installment in BRL.
- Explicit server capability `ASAAS_FOREIGN_CUSTOMERS_ENABLED`, default off. Only staging was enabled. Both supported provider environments are recognized; production remains unchanged and requires account approval before enabling/deploying.
- Checkout reserves a unique order before side effects, and a persistent per-student claim prevents cross-checkout customer creation races. Ambiguous customer POSTs stay pending reconciliation rather than retrying blindly.
- Foreign billing does not invoke the existing automatic Brazilian NFS-e path. This is not an international tax-invoicing implementation; that fiscal path remains outside the validated checkout.
- Migration `20261125102603_international_payer_billing` applied once to staging; four nullable fields verified. Existing data preserved in PGlite rehearsal; invalid document type/length values rejected.
- `asaas-integration`, `public-payment-context`, and `asaas-webhook` deployed ONLY to staging. Previous function sources backed up under `/tmp/sett-international-qa/rollback`.
- Isolated frontend build excludes unrelated WhatsApp WIP. Packaged bundle contains only staging Supabase origin. Final draft deploy: `6b06bc23968b620cd3f3dffc`, staging Netlify site `76f74d7a-952b-432b-bb1c-07c639575e6e`.
- Hosted context and foreign profile save returned 200. Disabled capability returned expected 503 before any payment. Enabled capability generated the hosted Sandbox invoice. Two simultaneous known retries both returned `reused:true` with one payment.
- Actual Sandbox card payment confirmed. Authenticated manual genuine-payment webhook produced one enrollment; two simultaneous event replays returned duplicate=true. This proves the handler, NOT automatic provider delivery.
- Hosted renewal canary passed: two payments, two enrollments total, exactly one active; old cycle/workout byte-identical by SHA-256 before/after, carry-over eligible; same renewal checkout reused the same invoice and replay was duplicate=true. Evidence `/tmp/sett-international-qa/renewal-evidence.json`.
- Browser verified hosted form and named-country options, without Pix or Brazilian CPF requirement for foreign payer. Portal/Safari visual carry-over remains separate from database preservation evidence.

## Validation accounting

- Focused frontend final owner run: 45 tests passed; independent root focused pre-country run: 41 passed.
- General bounded run: 330 suites and 2874 tests passed; 23 suites initially failed because test environment lacked Vite variables or Node web storage shadowed jsdom. Independent rerun of those 23 suites with fake `.invalid` environment and isolated worker web storage: 351 tests passed. No product code was changed for the runner issue. Existing skipped tests remain skipped (10).
- Backend latest independent review/regression: 32 passed; checkout source/runtime contract: 20 passed. Deno checks and frontend build passed. Final application TypeScript and targeted lint passed.
- Resource note: default parallel full suite was interrupted without a complete verdict; only the subsequent bounded execution plus failed-suite rerun count as evidence. Disk pressure also caused a discarded temporary package-copy attempt. Shared dependencies were reused, not reinstalled.

## Remaining gates, no production authorization

1. Production Asaas international account approval, not requested because user forbids support contact.
2. Real provider refusal scenario: official refusal card unexpectedly confirmed in this Sandbox account. Local mocked refusal passes do not resolve that.
3. Automatic provider-to-staging webhook delivery must be separately observed; manual authenticated replay is validated.
4. International fiscal document handling and any country/provider restrictions must be resolved before claiming worldwide coverage.
5. No production deployment or real customer/payment changes in this task.
