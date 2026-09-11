# SETT Release Gate — 2026-09-10

## Decisao atual

**GO para staging e GO tecnico do rehearsal de producao; NO-GO para escrita em producao e para `main`.** A release tecnica `18d1b184` passou CI e QA, o rollout isolado de staging foi concluido e Dados/Integracoes aprovou independentemente o restore, a migration e o rollback no clone fiel. O pacote de producao e os backups foram preparados sem escrita remota. A promocao continua bloqueada porque GO tecnico nao substitui autorizacao explicita nem a janela operacional.

O P3 do deploy imutavel contaminado de staging continua pendente de exclusao autorizada. Ele nao esta ativo e nao reduz o GO de staging, mas precisa ser removido antes do fechamento operacional.

## Proveniencia

- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc`
- Branch: `codex/sett-release-rc-20260826`
- `origin/main`: `f959532f5a0a537d0a7c7b14cdb98f03297dd6ab`
- HEAD tecnico aprovado: `18d1b184`
- CI tecnico: run `34503464604`, verde
- Commit documental posterior: `332be4bc`
- CI documental: run `34506079234`, verde
- Delta antes deste registro: 61 commits, 205 arquivos, 36.306 insercoes e 3.259 remocoes sobre `origin/main`.

O SHA tecnico, e nao o commit documental posterior, identifica o codigo/build aprovado.

## Gates tecnicos aprovados

- `npm run verify:backend`: backend canonico de producao confirmado.
- TypeScript: baseline controlada de 36 erros, sem aumento.
- ESLint: 0 erros e baseline controlada de 44 avisos, sem aumento.
- Vitest: 156/156 arquivos e 991/991 testes.
- Mutations do consentimento: 5/5 detectadas.
- Dispatcher Deno: 10/10 testes com permissoes explicitas.
- Build e performance de bundle: aprovados.
- Schemas efemeros com e sem `students.country_code`: 16/16 invariantes em ambos.
- QA independente do HEAD e de staging: sem P0/P1/P2.

O drift nominal do ledger de migrations continua proibindo `supabase db push`. Rollouts usam somente o arquivo-alvo revisado.

## Resultado de staging

- Edge `process-automation-sessions` v15, hash remoto/local `ccd932b0915c865ea347b166f9b3e2e8adb4095ebc1ead67ba6ab864e32ac720`.
- Migration `20260910103000` registrada exatamente uma vez.
- Rehearsal 16/16 e smoke autenticado de consentimento/tenant aprovados com rollback.
- Estado final: `consent=0`, `quarantine=1`, autorizacao privada/cache/sessoes semanais/mensagens/identidades sinteticas em zero.
- Frontend ativo: deploy `6aa2e0fc48c66ff3ce35755d`.
- Scan servido: 9/9 HTTP 200, 15 referencias de staging, zero de producao e zero legadas.

Detalhes e historico do F2 inicial, v13/v14 e F3 contaminado: `STAGING-WEEKLY-CONSENT-INCIDENT-2026-09-10.md`.

## P3 de staging — encerrado

O deploy contaminado `6aa2df49a35aa6165fa34c4e` nao estava publicado; o published deploy era `6aa2e0fc48c66ff3ce35755d`. Em 11/09, apos autorizacao explicita, o deploy contaminado foi excluido pelo comando auditado abaixo.

Acao exata executada:

```sh
netlify api deleteSiteDeploy --data '{"site_id":"2ced1972-fed1-4af3-9ad6-e5b9856ab409","deploy_id":"6aa2df49a35aa6165fa34c4e"}'
```

Pos-flight: URL imutavel contaminada em HTTP 404, zero ocorrencias na listagem do site e deploy limpo ainda HTTP 200.

## Preflight de producao — somente leitura

### Estado vivo

- Netlify publicado: `6aa1d3a7b9c96039394ee73d`, `ready`, em `https://www.settapp.com.br`.
- Edge `process-automation-sessions`: v45, ativa.
- Migration `20260910103000`: ausente.
- `students.country_code`: presente.
- `weekly_contact_enabled=true`: 1 registro legado.
- Fluxos semanais ativos: 2.
- Sessoes semanais despachaveis: 0; sessoes semanais totais: 1 historica.
- Mensagens WhatsApp: 14.355.
- Instancias WhatsApp conectadas: 1.
- Ledger/quarentena/autorizacao privada do novo contrato: ausentes.
- Nomes de configuracao requeridos presentes: 3/3; valores nao foram exibidos nem persistidos no repositorio.

Nenhuma escrita foi feita em PROD.

### Bundle congelado

Foi executado exatamente um build com `SETT_DEPLOY_TARGET=production npm run build`. O artefato esta fora do repositorio em:

`/Users/macbookpro/.codex/private-backups/sett-prod-consent-preflight-20260910T141910/dist-production`

- arquivos: 226;
- espaco alocado no filesystem: 10.903.552 bytes; soma dos arquivos: 10.289.087 bytes;
- scan completo: 31 referencias de producao, zero de staging e zero legadas;
- SHA-256 da arvore: `d2647253efae75c5538b8b1bcd2730efbdd5779714e6461f2de4449663205446`;
- SHA-256 do tar: `055bfbe93e076fe964527c429534780bf410c2d807503904db0f0b5b90181144`.

Comando futuro congelado, **nao executado**:

```sh
netlify deploy --prod --dir=/Users/macbookpro/.codex/private-backups/sett-prod-consent-preflight-20260910T141910/dist-production --no-build --site 9a061d2e-ee2c-444b-aa69-fe262caf0246 --message 'production: weekly consent rollout 18d1b18' --json
```

Antes de qualquer uso: recalcular o hash da arvore, reconfirmar o deploy publicado e repetir o preflight. Depois: varrer o deploy imutavel e a URL estavel antes dos smokes.

## Backups privados de producao

Diretorio: `/Users/macbookpro/.codex/private-backups/sett-prod-consent-preflight-20260910T141910`, permissao `700`; arquivos `600`.

| Artefato | SHA-256 | Bytes |
|---|---|---:|
| `prod-public-private-schema.sql` | `513bdc80bccc8527a1f6290a927863bff14d0957f14edaabe89f2b853d5b451b` | 870.482 |
| `prod-public-private-data.sql` | `20f227b9be529a9798fa97c4f8c48ca5e2feed037a45562a5c1775a519838398` | 18.914.379 |
| `prod-auth-schema.sql` | `245cbd97b48c28f41811ad8ebade27306e6124d00ef10f048992d9c9cf98a272` | 46.734 |
| `prod-auth-data.sql` | `01c271e55d6ec50ca756dce34fd04b0c3b0217be6e6bb0238f6db1f9e7ae9fdf` | 209.970 |
| Edge v45 `index.ts` | `8b45bbab2f49ae906848273299cf2642786eb81b9fbfcfa445f174c5ebb280b9` | — |

O aviso de FKs circulares do `pg_dump` exige `session_replication_role=replica` apenas durante a carga de dados do clone descartavel. O estado normal foi restabelecido e validado antes da migration.

## Rehearsal aprovado de migration e rollback

O primeiro clone sem o schema `auth` produziu aparente orfandade em `students.assigned_trainer_id`. A verificacao read-only de PROD provou que nao era inconsistencia real:

- usuarios em `auth.users`: 44;
- referencias orfas de `students.assigned_trainer_id`: 0;
- referencias orfas de `company_members.user_id`: 0;
- referencias orfas de `user_roles.user_id`: 0.

A FK correta e `public.students.assigned_trainer_id -> auth.users.id`.

O clone fiel restaurou os quatro dumps — schema e dados de `auth`, mais schema e dados de `public/private` — sem omitir a dependencia de identidade. A ordem obrigatoria para qualquer repeticao e:

1. criar somente o banco descartavel e as extensoes requeridas;
2. restaurar `prod-auth-schema.sql` ate imediatamente antes de `on_auth_user_created`;
3. restaurar `prod-public-private-schema.sql` completo;
4. restaurar o trecho restante de `prod-auth-schema.sql`, incluindo `on_auth_user_created` e o post-data de `auth`;
5. carregar `prod-public-private-data.sql` e depois `prod-auth-data.sql`, com `session_replication_role=replica` somente no clone descartavel;
6. executar `RESET ALL`, confirmar `session_replication_role=origin` e validar as FKs;
7. exigir auditoria dinamica de todas as FKs e anti-joins explicitos das referencias a `auth.users`, todos com zero violacoes/orfaos/não validados;
8. somente entao aplicar `20260910103000` e executar rehearsal/rollback.

Ao encerrar a carga pre-migration:

- `session_replication_role=origin`;
- FKs: 344/344 validadas;
- `ALTER TABLE ... VALIDATE CONSTRAINT` executado para todas as 344;
- auditoria dinamica: zero FKs invalidas, nao validadas ou orfas;
- os tres anti-joins com `auth.users` retornaram zero orfaos.

Baseline do clone: `legacy=1`, `active_flows=2`, `dispatchable=0`, `weekly_sessions=1`, `messages=14355`, `consent=0`, `quarantine=0`.

A migration foi aplicada numa copia do baseline; o rehearsal passou 16/16. Pos-migration: `legacy=0`, `active_flows=2`, `dispatchable=0`, `weekly_sessions=1`, `messages=14355`, `consent=0`, `quarantine=1`.

O rollback oficial foi ensaiado e aprovado. As sete metricas voltaram exatamente ao baseline, o ledger/quarentena ficaram ausentes e a auditoria pos-migration/rollback encontrou 349 FKs, todas validas e sem orfaos. Os dois bancos descartaveis foram removidos.

**Status do gate:** ✅ GO tecnico independente de Dados/Integracoes. Isso fecha o bloqueio do rehearsal, mas nao autoriza escrita em PROD.

Rollback operacional recomendado continua sendo aditivo e sem perda de dados: restaurar frontend anterior, republicar Edge v45 pelo snapshot e usar o fail-closed de `scripts/rollback-weekly-contact-consent-ledger.sql`, preservando ledger/evidencia. Restauracao integral do banco e ultimo recurso, pois perderia escritas posteriores ao snapshot.

## Janela curta F1 -> F2 e monitores zero-delta

A janela entre F1 e F2 deve ser curta e observada. Antes de F1, imediatamente antes de F2 e imediatamente depois de F2, registrar:

| Monitor | Baseline PROD | Delta permitido antes da conclusao |
|---|---:|---:|
| Fluxos semanais ativos | 2 | 0 |
| `weekly_contact_enabled=true` | 1 | 0 antes de F2; esperado 1 -> 0 na propria migration |
| Configuracoes requeridas presentes | 3/3 | 0 |
| Sessoes semanais despachaveis | 0 | 0 |

Se qualquer um dos dois fluxos, o booleano legado ou a presenca das configuracoes variar fora da transicao esperada da migration, interromper antes da proxima fase. Nao mostrar valores de segredo.

## Integracao em `main`

`origin/main` em `f959532f` e ancestral da branch release. Nenhuma atualizacao foi executada. Plano futuro, somente com autorizacao:

1. `git fetch origin` e exigir que `origin/main` continue exatamente em `f959532f`;
2. confirmar ancestralidade e CI verde no SHA release exato;
3. fazer fast-forward da branch release para `main`, sem merge commit e sem force;
4. aguardar a CI de `main` e interromper em qualquer divergencia.

O push normal deve rejeitar non-fast-forward; nunca usar `--force`.

## Estado por camada e proximas acoes

| Camada | Estado real |
|---|---|
| Local | ✅ Codigo `18d1b184`, bundle PROD congelado, quatro dumps privados e rehearsal independente concluidos. |
| Commit/branch | ✅ Registro enviado na branch release; `1bf946e83954283c4b3b954febed997976436c03` ficou identico ao upstream e a CI `34516912209` passou com testes, gates estaticos e build. |
| Staging | ✅ GO independente; deploy limpo ativo. |
| P3 staging | ✅ Deploy contaminado excluido com autorizacao; URL imutavel em HTTP 404, zero ocorrencias na listagem e deploy limpo preservado em HTTP 200. |
| Rehearsal PROD | ✅ GO tecnico independente: restore completo, 344 FKs pre-migration, 16/16 invariantes, rollback oficial e 349 FKs finais sem violacao. |
| `main` | ❌ Fast-forward nao executado (bloqueado). Motivo: exige autorizacao e revalidacao do SHA de `origin/main`. Proximo passo: executar o plano acima e aguardar CI de `main`. |
| Producao | ❌ Rollout nao executado (bloqueado). Motivo: exige autorizacao explicita e janela controlada; GO tecnico nao e autorizacao de escrita. Proximo passo: rehash/preflight, F1 -> F2 -> F3 com monitores zero-delta e parada fail-closed. |
