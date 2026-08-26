# SDD 2026-08-26 - SETT Integrations CRM

## Escopo e ownership

- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/crm-integrations`
- Branch: `codex/sett-crm-integrations-20260826`
- HEAD inicial: `202a8531ab2dc0ae05600ae1a6dc28c7b7c477df`
- Limites: sem push, sem deploy, sem migrations/apply, sem Supabase remoto, sem OAuth real, sem chamada Evolution e sem envio real.

## RED

- `supabase/functions/_shared/provider-error-redaction.test.ts`
  - Falhou primeiro por módulo inexistente.
  - Com stub inseguro, falhou por ecoar corpo bruto com telefone/JID, bearer, api_key, secret e token.
- `supabase/functions/process-automation-sessions/index.test.ts`
  - Novo caso `weekly automation provider errors do not expose raw provider bodies`.
  - Depois de corrigir o fake para chegar ao provider, falhou com erro cru: `Evolution 502: phone ... token=... secret=...`.

## GREEN

- Adicionado `supabase/functions/_shared/provider-error-redaction.ts`.
- `whatsapp-manager` agora consome o corpo de erro do provider sem devolvê-lo e responde `details` como `provider_status_<status>:<code>` em:
  - `send-message`
  - `send-media`
- `process-automation-sessions` passou a lançar erro sanitizado em falha de provider, evitando persistir PII/segredo em `dispatch_error`.
- Logs dos dois caminhos preservam apenas `providerStatus` e `providerCode`, além dos metadados internos já existentes.

## Refactor

- Reuso do helper de redaction entre envio manual e dispatcher.
- Nenhuma mudança em UI do aluno, motor de força, MFIT, vídeos, migrations, env ou integrações remotas.

## Auditoria dos itens pedidos

- P1 `whatsapp-manager`: corrigido localmente. Resposta e logs de `send-message`/`send-media` não ecoam corpo bruto do provider.
- Dedupe de contatos + feedback de treino: já coberto na base atual por `workoutFeedbackLoop.test.ts`, `whatsappIdentity.test.ts` e `whatsappRecipientSafety.test.ts`; mantido sem send real.
- Follow-up de contatos antigos CRM: dispatcher já usa claim atômico via `claim_automation_sessions`, cadência/consentimento por fluxo semanal e recipient binding. Gap corrigido: erro de provider sanitizado antes de virar `dispatch_error`.
- Editor cardio corrida/ciclismo/natação: validado como presente na base atual (`CardioPlanEditor`, `update-running-plan-draft`, `cardio-plan-update`). Contratos focados passaram; sem mudança de UI.
- Wearables/Strava/Polar: inventário local confirmou `wearable-connect`, OAuth state, credenciais cifradas, leases, revogação e testes existentes. Nenhum secret lido/impresso; ausência de secrets reais permanece bloqueio externo para OAuth real.

## Validações locais

- `npx -y deno test --no-config --no-npm supabase/functions/_shared/provider-error-redaction.test.ts`
- `npx -y deno test --no-config --no-npm supabase/functions/process-automation-sessions/index.test.ts`
- `npx -y deno test --no-config --no-npm supabase/functions/_shared/provider-error-redaction.test.ts supabase/functions/process-automation-sessions/index.test.ts supabase/functions/_shared/whatsappIdentity.test.ts supabase/functions/_shared/wearables/crypto.test.ts supabase/functions/_shared/wearables/wearables.test.ts`
- `npx -y deno check --no-config --no-npm supabase/functions/whatsapp-manager/index.ts supabase/functions/process-automation-sessions/index.ts supabase/functions/update-running-plan-draft/index.ts supabase/functions/wearable-connect/index.ts`
- `npm test -- src/lib/whatsappRecipientSafety.test.ts src/lib/workoutFeedbackLoop.test.ts src/lib/cardioPlanEdgeContract.test.ts src/lib/cardioPlanPersistence.test.ts src/lib/wearablesMigration.test.ts`
- `npm test` -> 91 files / 639 tests passed.
- `npx tsc --noEmit`
- `npm run lint` -> 0 errors / 49 inherited warnings.
- `npm run verify:backend` -> canonical backend `zshrcgbyhzxpnlccssyz`.
- `npm run build` -> passed; retained existing large-chunk warnings.
- `git diff --check`

## Baselines e bloqueios

- `npm ci` foi necessário porque `vitest` não estava instalado; instalou `node_modules` local sem alterar lockfile.
- `npm ci` reportou baseline de `2 high severity vulnerabilities`; não rodei `npm audit fix` porque isso muda dependências fora do escopo.
- `deno fmt --check` em `whatsapp-manager`/dispatcher falha por formatação histórica ampla; não reformatei para evitar diff massivo fora do escopo. Deno check/tests passaram nas Edge functions afetadas.

## Estágios reais

- Local: GREEN nos testes focados, full Vitest, TypeScript, lint, verify backend e build.
- Commit: local criado; HEAD final registrado no handoff.
- Integração: não realizada.
- Staging: não realizado.
- Produção: não realizado.
