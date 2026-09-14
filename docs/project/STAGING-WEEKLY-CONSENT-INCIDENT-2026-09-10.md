# Incidente de staging — consentimento semanal — 2026-09-10

## Veredito final

**GO para staging; NO-GO para producao.** O rollout isolado foi concluido em Edge -> migration exata -> frontend, recebeu GO independente sem P0/P1/P2 e terminou sem envio WhatsApp, sem identidades sinteticas e sem referencias ao backend de producao no frontend servido.

O primeiro deploy frontend da repeticao controlada foi contaminado porque o CLI executou um novo build com ambiente de producao. Ele foi imediatamente substituido pelo deploy limpo e nao esta ativo. O artefato imutavel contaminado continua acessivel e permanece como **P3 de higiene operacional**, pendente de autorizacao explicita para exclusao.

Producao e `main` nao foram alteradas.

## Escopo e proveniencia

- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc`
- Branch: `codex/sett-release-rc-20260826`
- HEAD tecnico aprovado: `18d1b184`
- CI oficial do HEAD tecnico: run `34503464604`, verde
- Commit documental posterior: `332be4bc`
- CI oficial do commit documental: run `34506079234`, verde
- Supabase staging: `ifymocggowdlqqcxugko`
- Netlify staging: `wondrous-sunflower-10fc8f` (`2ced1972-fed1-4af3-9ad6-e5b9856ab409`)
- Supabase producao: `zshrcgbyhzxpnlccssyz` (somente leituras nesta rodada)
- Netlify producao: `9a061d2e-ee2c-444b-aa69-fe262caf0246` (nao alterado)

## Historico preservado

### Primeira tentativa: F2 falhou e houve rollback

A primeira F1 promoveu `process-automation-sessions` de v10 para v11. A Edge respondeu HTTP `503` com o contrato fail-closed esperado, pois staging nao tinha `AUTOMATION_CRON_SECRET` nem credenciais do provedor.

A F2 falhou com SQLSTATE `42703` porque o schema vivo nao tinha `students.country_code`. A migration estava em transacao e foi revertida integralmente. A Edge foi restaurada em v12 com fonte byte a byte igual ao snapshot v10, hash:

```text
0b7367df2e5ff2d2e1cb0f7db2db124f65f684d85c9daf2ed87003ebd285bbd2
```

O candidato foi corrigido para tolerar os dois schemas e provado em bancos efemeros com e sem a coluna, sempre com 16/16 invariantes.

### Desvio de sequenciamento: v13 -> v14

Uma nova F1 iniciou depois do GO tecnico de `b1f93a6`, mas uma ordem de freeze chegou durante a chamada de deploy. A v13 continha exatamente a fonte candidata, hash `ccd932b0915c865ea347b166f9b3e2e8adb4095ebc1ead67ba6ab864e32ac720`, e foi imediatamente substituida pela v14, novamente igual ao snapshot anterior. F2/F3 nao foram iniciadas nessa janela. O desvio foi de governanca, nao de identidade do codigo, e nao gerou envio.

## Rollout final controlado

### Preflight

- migration `20260910103000`: ausente antes da aplicacao;
- consentimento e quarentena: tabelas ausentes;
- `weekly_contact_enabled=true`: 1 registro legado;
- sessoes semanais despachaveis: 0;
- mensagens WhatsApp: 0;
- credenciais do dispatcher/provedor: ausentes;
- backup privado pre-rollout preservado em `/Users/macbookpro/.codex/private-backups/sett-staging-consent-preflight-20260910T1054`.

O drift historico do ledger impediu o uso de `supabase db push`; somente a migration-alvo revisada foi aplicada.

### F1 — Edge v15

`process-automation-sessions` v15 foi implantada com hash remoto/local identico:

```text
ccd932b0915c865ea347b166f9b3e2e8adb4095ebc1ead67ba6ab864e32ac720
```

O smoke retornou HTTP `503`, fail-closed pela ausencia de configuracao do dispatcher. Antes e depois: zero mensagens e zero sessoes semanais despachaveis.

### F2 — migration e smokes

A migration `20260910103000_weekly_contact_consent_ledger.sql` foi aplicada uma unica vez. O estado estrutural confirmou 7 RPCs, 3 triggers e 2 tabelas protegidas por RLS. O rehearsal passou 16/16 invariantes.

O smoke autenticado em transacao validou grant, revoke, status, troca de destinatario, retorno A -> B -> A, corrida de atualizacao de perfil e isolamento entre tenants. A transacao foi revertida, sem deixar usuario ou empresa sinteticos.

### F3 — incidente de bundle e repeticao limpa

O primeiro comando F3 permitiu que o Netlify reconstruisse o app e gerou o deploy contaminado `6aa2df49a35aa6165fa34c4e`. A varredura completa dos 9 recursos servidos encontrou:

- HTTP 200: 9/9;
- referencias a producao: 15;
- referencias a staging: 0;
- referencias legadas: 0.

O deploy estavel anterior foi restaurado. A F3 foi repetida com artefato ja construido e `--no-build`, gerando o deploy limpo ativo `6aa2e0fc48c66ff3ce35755d`. A varredura completa do deploy imutavel e da URL estavel encontrou:

- HTTP 200: 9/9;
- referencias a staging: 15;
- referencias a producao: 0;
- referencias legadas: 0.

## Estado final de staging

| Controle | Resultado |
|---|---:|
| Edge ativa | v15 |
| Migration-alvo no ledger | 1 |
| Eventos de consentimento | 0 |
| Linhas em quarentena | 1 |
| Autorizacoes privadas pendentes | 0 |
| Cache semanal habilitado | 0 |
| Sessoes semanais | 0 |
| Mensagens WhatsApp | 0 |
| Usuarios sinteticos | 0 |
| Deploy frontend ativo | `6aa2e0fc48c66ff3ce35755d` |

QA independente: **GO para staging**, sem P0/P1/P2.

## Fechamento posterior do gate de restore

Dados/Integracoes revisou independentemente o rehearsal de producao e deu **GO tecnico**. A ordem exata validada foi: `prod-auth-schema.sql` ate antes de `on_auth_user_created` -> `prod-public-private-schema.sql` completo -> restante de `prod-auth-schema.sql` -> `prod-public-private-data.sql` -> `prod-auth-data.sql` -> `RESET ALL`/`session_replication_role=origin` -> auditoria integral de FKs antes da migration. `replica` foi usado apenas na carga descartavel. Resultado: 344 FKs sem violacao/orfandade pre-migration, 16/16 invariantes, rollback oficial aprovado e 349 FKs finais validas/sem orfaos. PROD permaneceu somente leitura.

## P3 encerrado — deploy imutavel contaminado

O deploy `6aa2df49a35aa6165fa34c4e` nao era o publicado atual; o site ja apontava para `6aa2e0fc48c66ff3ce35755d`. Em 11/09, apos autorizacao explicita, foi executado exatamente:

```sh
netlify api deleteSiteDeploy --data '{"site_id":"2ced1972-fed1-4af3-9ad6-e5b9856ab409","deploy_id":"6aa2df49a35aa6165fa34c4e"}'
```

A exclusao retornou sucesso. A URL imutavel contaminada passou a HTTP 404, a listagem do site retornou zero ocorrencias desse deploy e o deploy limpo continuou HTTP 200.

## Estado por camada

| Camada | Estado real |
|---|---|
| Local | ✅ Implementacao e gates aprovados no SHA tecnico `18d1b184`. |
| Commit/remoto | ✅ Branch release enviada; documentacao posterior em `332be4bc`. |
| CI | ✅ `34503464604` no SHA tecnico e `34506079234` no commit documental. |
| Staging | ✅ Edge v15, migration, rehearsal, smoke autenticado e frontend limpo concluidos. |
| P3 staging | ✅ Deploy contaminado excluido com autorizacao; URL imutavel em HTTP 404, zero ocorrencias na listagem e deploy limpo preservado em HTTP 200. |
| Producao | ❌ Promocao nao executada (bloqueado). Motivo: GO tecnico de staging/rehearsal nao autoriza escrita/deploy em PROD. Proximo passo: autorizacao explicita sobre o pacote congelado, janela e rollback. |
