# Incidente de staging — consentimento semanal — 2026-09-10

## Veredito

**NO-GO. Staging esta congelado e producao nao foi alterada.** A fase de banco do rollout falhou porque a migration `20260910103000_weekly_contact_consent_ledger.sql` referencia `students.country_code`, coluna ausente no schema vivo de staging. A execucao ocorreu em transacao e foi revertida integralmente. A Edge Function alterada na fase anterior foi restaurada com fonte byte a byte igual ao snapshot pre-rollout.

Nenhum envio WhatsApp ocorreu. O frontend de staging nao foi publicado.

## Escopo e proveniencia

- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc`
- Branch: `codex/sett-release-rc-20260826`
- HEAD tecnico testado e enviado: `c7047e8aabf3848e256809b2bd93fb75220ca1c2`
- CI oficial: run `34499385925`, verde no HEAD tecnico
- Projeto Supabase de staging: `ifymocggowdlqqcxugko`
- Projeto Supabase de producao: `zshrcgbyhzxpnlccssyz` (nao alterado)
- Site Netlify isolado de staging: `wondrous-sunflower-10fc8f` (`2ced1972-fed1-4af3-9ad6-e5b9856ab409`)

## Preflight concluido

- Staging e producao foram confirmados como projetos distintos e `ACTIVE_HEALTHY`.
- A migration-alvo estava ausente em staging e producao antes da tentativa, com contagem zero confirmada duas vezes.
- O ledger de migrations apresentava drift relevante: 216 migrations locais, 174 remotas em staging, 168 correspondencias exatas, 48 apenas locais e 6 apenas remotas. Por isso, `supabase db push` foi descartado; a tentativa usou apenas o arquivo-alvo explicitamente revisado.
- Antes do rollout, `whatsapp_messages=0` e a fila semanal despachavel tinha zero sessoes.
- Staging nao tinha `AUTOMATION_CRON_SECRET` nem credenciais de provedor WhatsApp. O caminho de envio permaneceu indisponivel.
- O build local isolado para staging passou a sanitizacao: 31 referencias ao backend de staging, zero referencias ao backend de producao e zero referencias ao projeto legado. Esse build nao foi publicado.
- O deploy estavel que continua publicado em staging e `6a9a8b98b4456efe9a7530ac`, de 2026-09-04. O bundle atualmente publicado e inadequado para novos smokes porque ainda contem tres referencias ao backend de producao e nenhuma ao backend de staging.

## Backup privado

Snapshot pre-rollout preservado em:

`/Users/macbookpro/.codex/private-backups/sett-staging-consent-preflight-20260910T1054`

- Diretorio: permissao `700`
- Arquivos: permissao `600`
- Schema publico: `09d498fe3c6ed777904b6e5224e584f12bcdc994bc00428f76b5b0c56356d82a`
- Dados publicos: `b158e4caab45e5ec79cdce52b36015b35a9e78f5e979fb1b2571ac31e2a40871`
- Fonte anterior de `process-automation-sessions`: `0b7367df2e5ff2d2e1cb0f7db2db124f65f684d85c9daf2ed87003ebd285bbd2`

O `pg_dump` registrou avisos de FKs circulares em tabelas historicas, mas preservou dumps separados de schema e dados. O backup nao contem secrets adicionados por esta rodada e permanece fora do repositorio.

## Linha do tempo do rollout

### F1 — Edge Function

`process-automation-sessions` foi promovida em staging de v10 para v11. O smoke controlado retornou HTTP `503` com o contrato fail-closed `Automation dispatcher is not configured`, coerente com a ausencia de `AUTOMATION_CRON_SECRET`.

Antes e depois do smoke:

- mensagens WhatsApp: zero;
- sessoes semanais despachaveis: zero;
- chamadas ao provedor: impossiveis por falta de credenciais.

### F2 — migration exata

Foi executado apenas o arquivo-alvo:

```sh
supabase db query --linked --file supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql
```

A execucao falhou com SQLSTATE `42703`:

```text
column student.country_code does not exist
```

O erro ocorreu na referencia a `student.whatsapp, student.phone, student.country_code`. Como a migration estava em transacao, o banco realizou rollback automatico.

Pos-condicoes verificadas:

- tabela de consentimento: ausente;
- tabela de quarentena: ausente;
- ledger da migration-alvo: contagem zero;
- cache habilitado: permaneceu em 1, igual ao preflight;
- fila semanal despachavel: zero;
- `students.country_code`: ausente.

### F3 — frontend

Nao iniciada. Nenhum deploy Netlify foi feito.

## Restauracao da F1

A fonte pre-rollout da Edge Function foi republicada em staging. A versao operacional passou a v12 por ser um novo deploy, mas o conteudo de `process-automation-sessions` e byte a byte igual ao snapshot da v10:

```text
snapshot v10: 0b7367df2e5ff2d2e1cb0f7db2db124f65f684d85c9daf2ed87003ebd285bbd2
staging v12: 0b7367df2e5ff2d2e1cb0f7db2db124f65f684d85c9daf2ed87003ebd285bbd2
```

A fonte remota restaurada foi baixada para verificacao, hasheada e removida do diretorio temporario apos a comparacao.

## Estado atual por camada

| Camada | Estado real |
|---|---|
| Local | ✅ Implementacao e verificadores aprovados no HEAD tecnico `c7047e8`. |
| Commit/remoto | ✅ Cadeia tecnica enviada para `origin/codex/sett-release-rc-20260826`. |
| CI | ✅ Run `34499385925` verde. Suite local integral: 156/156 arquivos e 991/991 testes; foco Vitest 27/27; Deno 10/10 com permissoes explicitas; mutations 4/4; build aprovado. |
| Staging Edge | ✅ Restaurada para a fonte pre-rollout; versao v12, hash identico a v10. |
| Staging banco | ✅ Rollback transacional confirmado; ❌ contrato novo nao aplicado (bloqueado). |
| Staging frontend | ❌ Nao publicado (bloqueado). O deploy estavel atual continua contaminado por referencias de producao e nao pode servir de evidencia do rollout. |
| Producao | ✅ Intocada nesta rodada; ❌ promocao nao autorizada (bloqueado). |

## Gate obrigatorio para nova tentativa

Nao reaplicar F1, F2 ou F3 ate existir um novo hash de codigo que cumpra todos os itens abaixo:

1. migration compativel com a ausencia de `students.country_code`, ou prerequisite separado, explicitamente revisado e provado em staging;
2. QA raiz independente sem P0/P1/P2;
3. CI oficial verde no novo HEAD;
4. novo preflight confirmando schema, fila zero, backup e rollback;
5. rollout estrito Edge -> migration exata -> frontend isolado, parando fail-closed em qualquer divergencia;
6. smokes autenticados de tenant/papeis, grant/revoke, troca A->B, retorno A->B->A, revogacao concorrente e zero envio sem consentimento ou destinatario confiavel;
7. nenhuma utilizacao de `supabase db push` enquanto o drift do ledger nao estiver formalmente reconciliado;
8. producao somente depois de staging aprovado, rollback operacional e autorizacao explicita.
