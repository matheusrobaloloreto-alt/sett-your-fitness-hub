# SETT Release Gate - 2026-09-10

## Escopo

Este registro cobre somente governanca de CI para a branch release. Nao altera feature de produto, schema, migracao, secrets, deploy, staging ou producao.

- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260910/release-governance`
- Branch local: `codex/sett-release-governance-20260910`
- Base solicitada: `a6cff4bcb72fecfd09d8f8e2a9ecd33a4c2e57fc`
- `origin/main`: `f959532f5a0a537d0a7c7b14cdb98f03297dd6ab`
- Relacao: `origin/main` e ancestral de `a6cff4b`; a release esta 35 commits a frente.

## Matriz de estagio e proveniencia

| Estagio | `origin/main` | Release `a6cff4b` | Gate requerido | Status em 2026-09-10 |
|---|---|---|---|---|
| Codigo local | `f959532f` (`docs: record pre-registration link audit`) | `a6cff4b` (`fix(finance): remove reconciled BN payment placeholders`) | Worktree isolada, status limpo antes de editar, sem WIP alheio | OK para edicao de governanca |
| Commit | Main remoto atual | Branch release-rc local/remota em `a6cff4b` | Commit separado com prefixo `codex:`; sem push automatico | Em andamento ate commit desta mudanca |
| Integracao | Nao recebeu os 35 commits da release | Release contem 35 commits sobre `origin/main` | CI em `main`, `codex/claude-compat` e `codex/sett-release-rc-*` | Gate criado; push nao executado |
| Staging | Fora deste escopo | Fora deste escopo | So promover apos CI verde e aprovacao | NO-GO provisorio |
| Producao | Fora deste escopo | Fora deste escopo | Deploy publico exige aprovacao explicita e rollback definido | NO-GO provisorio |

## Gates definidos

- Backend canonico: `npm run verify:backend`.
- TypeScript: `npx tsc -b --pretty false`, com teto temporario de 36 erros de baseline. Este repo usa `tsconfig.json` em formato solution-style (`files: []` com referencias para `tsconfig.app.json` e `tsconfig.node.json`), portanto `tsc -b` e o gate real; `tsc --noEmit` isolado no arquivo raiz nao valida os projetos referenciados. O gate falha se a divida aumentar ou se houver falha sem erro TS contavel.
- Lint: `npx eslint . --format json`, com baseline verificavel de 0 erros e 44 avisos. O gate falha em qualquer erro ou aumento dos avisos.
- Testes: `npm run test`.
- Build: `npm run build`.
- Bundle canonico: `dist` nao pode conter o projeto Supabase aposentado `cxesecxyrndveookvlzz` e precisa conter o backend canonico `zshrcgbyhzxpnlccssyz`.
- Whitespace: `git diff --check` roda sobre o intervalo do push atual; em `workflow_dispatch`, roda sobre o ultimo commit. Isso evita falso bloqueio por dividas historicas nao tocadas.

## Baseline observada

- `npm run verify:backend`: passou; backend production confirmado como `zshrcgbyhzxpnlccssyz`.
- `npx tsc -b --pretty false`: falhou na baseline com 36 erros existentes.
- `npx eslint . --format json`: 0 erros, 44 avisos existentes.
- `git diff --check` no worktree antes das edicoes: passou.
- `git diff --check origin/main..a6cff4b`: falha apenas em `supabase/migrations/20260909154800_fix_paid_renewal_cycle_window.sql:235` por linha em branco no EOF. Excecao historica: nao corrigir migracao ja aplicada apenas por whitespace dentro deste escopo.
- `npm run build`: passou; build e verificacao de bundle/performance concluidos.
- `npm run test`: falhou na suite completa local com 2/930 testes falhando sob carga:
  - `src/pages/admin/FinancialDashboard.test.tsx`: timeout em "retains all 18 missing-provider-ID cards as unresolved alongside authoritative installments".
  - `src/lib/prescription/engine.performance.test.ts`: mediana acima do budget de 500 ms em run completo.
- Evidencia complementar recebida do coordenador: os testes isolados passaram (`FinancialDashboard` 10/10; engine performance mediana 96.84 ms), indicando flakiness/carga na suite completa, nao aprovacao de release.

## Bloqueios NO-GO fora deste ownership

Estes itens foram reportados pelo QA do orquestrador pai e nao devem ser corrigidos nesta branch de governanca, porque exigem donos de dados, banco, produto ou documentacao canonica:

| Bloqueio | Dono requerido | Criterio objetivo de desbloqueio |
|---|---|---|
| PII nominal em manifestos/relatorio rastreados | Dono de privacidade/dados + release integrator | Manifestos e relatorios rastreados sem nomes de alunos/clientes ou dados pessoais diretos; evidencia anonima/hash quando necessario; diff revisado sem PII. |
| Rollback de vigencias falha com triggers vivos de `updated_at` | Dono de banco/rollback | Script de rollback validado em ambiente controlado com triggers ativos; prova de ida/volta sem drift indevido de `updated_at`; plano de recuperacao documentado. |
| Ledger de migrations tem sete pares de versoes nominais diferentes entre PROD e repo (inventario abaixo) | Dono de banco/migrations | Proveniencia reconciliada entre producao e repo; arquivos locais ou registro operacional refletem exatamente o aplicado; checksum/SQL revisado antes de qualquer promocao. |
| Suite completa vermelha em `engine.performance.test.ts` | Dono de performance/testes | Suite completa verde em run limpo, ou budget ajustado por decisao tecnica documentada com mediana/ambiente/limite novo. |
| Secao "Estagios" do relatorio canonico desatualizada | Dono de documentacao/release | Relatorio canonico atualizado separando local, commit, integracao, staging e producao, com blockers e proxima acao por item. |
| Timeout sob carga em `FinancialDashboard.test.tsx` | Dono frontend/testes financeiros | Suite completa verde sem timeout, ou teste estabilizado com causa documentada e cobertura equivalente mantida. |

### Inventario do drift nominal de migrations

O `supabase migration list --linked` e o `migration fetch` contra o projeto PROD explicitaram sete pares com versoes/nomes diferentes. Isto continua sendo bloqueio de proveniencia mesmo onde a comparacao do SQL reconstruido indicou equivalencia semantica:

| Repo local | Ledger/arquivo reconstruido de PROD | Observacao atual |
|---|---|---|
| `20260909152020_intercycle_manual_link_ready.sql` | `20260909152632_intercycle_manual_link_ready.sql` | Formatacao diferente; o `REVOKE` redundante do local aparece efetivado pela migration de hardening seguinte em PROD. Exige reconciliacao do dono. |
| `20260909152756_harden_intercycle_trigger_execute.sql` | `20260909152822_harden_intercycle_trigger_execute.sql` | Diferenca nominal; comparacao reconstruida sem mudanca material identificada alem da serializacao. |
| `20260909153727_fix_intercycle_invite_cycle_drift.sql` | `20260909155347_fix_intercycle_invite_cycle_drift.sql` | Diferenca nominal; comparacao reconstruida sem mudanca material identificada alem da serializacao. |
| `20260909154800_fix_paid_renewal_cycle_window.sql` | `20260909155351_fix_paid_renewal_cycle_window.sql` | Diferenca nominal; comparacao reconstruida sem mudanca material identificada alem da serializacao. |
| `20260909153732_repair_single_enrollment_cycle_overlap.sql` | `20260909155354_repair_single_enrollment_cycle_overlap.sql` | Diferenca nominal; comparacao reconstruida sem mudanca material identificada alem da serializacao. |
| `20260909225312_reconcile_bn_legacy_enrollment_terms.sql` | `20260909230806_reconcile_bn_legacy_enrollment_terms.sql` | SQL reconstruido equivalente, salvo timestamp/nome e ponto-e-virgula final; ainda requer reconciliacao formal do ledger. |
| `20260909230931_reconcile_bn_remaining_legacy_terms.sql` | `20260909231218_reconcile_bn_remaining_legacy_terms.sql` | SQL reconstruido equivalente, salvo timestamp/nome e ponto-e-virgula final; ainda requer reconciliacao formal do ledger. |

Nenhum arquivo de migration foi alterado ou reaplicado nesta branch de governanca.

## Integracao de Produto aprovada

O QA raiz aprovou a cadeia de Produto sem P0/P1/P2, e a Release Guardian integrou os commits na ordem revisada:

- `77e77e7` (`0bb8080` no branch de origem): endurecimento de conclusao de treino e acesso financeiro.
- `23b2a66` (`78f752c` no branch de origem): conclusao condicionada a logs duraveis.
- `9e58e87` (`8e576d9` no branch de origem): CAS de conclusao exige sessao `in_progress` do mesmo aluno e exatamente uma linha retornada.

P3 fechado na integracao: foi adicionado o teste explicito em que `completedRow.id` diverge da sessao solicitada. O fluxo falha fechado, preserva a sessao ativa local e nao concede XP. A cobertura foi adicionada sem alterar o contrato de producao; a suite integral continua sendo o gate final do HEAD.

Esta integracao e apenas local/branch release. Produto, Dados e o ledger/RPC/dispatcher de consentimento semanal estao integrados no codigo, mas staging e producao permanecem NO-GO ate a CI do HEAD passar, o rollout isolado seguir Edge -> migration -> frontend e os smokes autenticados de papeis/tenant e grant/revoke passarem.

## Rollback

Rollback desta mudanca de governanca:

1. Reverter o commit `codex:` desta branch.
2. Restaurar `.github/workflows/quality.yml` ao conteudo de `a6cff4b`.
3. Remover este documento se a decisao de gate for descartada.

Rollback de release/producao nao esta autorizado neste escopo. Para promocao futura, exigir commit aprovado, CI verde, plano de rollback de deploy, e validacao separada de staging/producao.

## Decisao provisoria

NO-GO para promocao da release em 2026-09-10.

Motivo: a lacuna de CI foi corrigida no nivel de governanca, mas a baseline integral ainda nao esta verde: TypeScript tem 36 erros existentes, lint tem 44 avisos existentes, a suite completa apresentou falhas sob carga, e o QA do orquestrador pai reportou bloqueios de PII, rollback, migrations e documentacao canonica. A proxima acao correta e rodar o novo workflow na branch release apos push autorizado e abrir tarefas separadas para zerar ou reduzir formalmente as dividas de TypeScript/lint, estabilizar os testes flaky e remover os bloqueios de release fora deste ownership.
