# SETT/BN — integração para staging de 2026-08-15

## Decisão executiva

- **Branch local:** `codex/bn-release-staging-20260815`
- **Base imutável:** `0e20728ac32410b039708012d55db247e37379e5` (`origin/main` em 2026-08-15)
- **Destino remoto:** **NO-GO**. Não existe Supabase ou Netlify de staging separado e comprovado.
- **Produção:** não foi consultada para dados, alterada, publicada ou usada para migrations/OAuth.
- **MFIT:** commits exclusivos, dry-run e apply excluídos. Os dois scripts que já pertencem à base compartilhada foram preservados byte a byte e não executados.

Este documento aplica a skill ATENA nº 1098, **Checklist de Qualidade Antes da Entrega**, adaptada para uma integração de release com banco, Edge Functions e frontend.

## 1. Checklist completo

### Escopo e histórico

- [x] Worktree isolada criada diretamente da base remota exata.
- [x] Árvore canônica suja preservada sem edição (`artifacts/` permaneceu fora da worktree de release).
- [x] Commits compartilhados aplicados uma única vez e sem squash/amend.
- [x] Cadeias CRM, UX, Wearables, Volume e Deload preservadas em ordem.
- [x] Nenhum commit exclusivo de `codex/bn-mfit-data` integrado.
- [x] Único conflito textual, Volume × Deload, resolvido semanticamente e testado.
- [x] Colisão de versão de migration corrigida em commit próprio, sem combinar migrations.
- [x] Nenhuma versão de migration duplicada no diretório final.

### Qualidade de código

- [x] Testes Vitest completos: 62 arquivos, 450 testes aprovados.
- [x] Testes focados de CRM/UX, Wearables, prescrição, Volume e Deload aprovados.
- [x] TypeScript (`tsc --noEmit`) aprovado.
- [x] Backend canônico (`verify:backend`) aprovado.
- [x] Build Vite aprovado.
- [x] Testes e checks Deno da frente aprovados.
- [x] Verificador de ordem de migrations Wearables aprovado.
- [x] Lint global sem erros: 0 erros e 48 warnings históricos.
- [x] `git diff --check origin/main...HEAD` sem violações após commit de higiene.
- [x] `deno.lock` atualizado explicitamente; testes e checks Deno repetidos com `--frozen`.

### Banco e isolamento

- [x] Supabase de produção identificado e explicitamente bloqueado para esta fase.
- [x] Nenhum `db push`, `migration up`, SQL remoto, deploy de Edge Function ou leitura de dados de aluno executado.
- [x] Nenhum projeto legado reaproveitado como staging.
- [ ] Fresh-schema/replay em Postgres ou Supabase efêmero.
- [ ] Matriz RLS comportamental: aluno próprio, staff da empresa atual, staff da empresa antiga após A→B, master e cross-tenant.
- [ ] Rollback e concorrência reais: sync/maintenance/refresh, lease expirado/retomado e callback OAuth concorrente.
- [ ] Tipos Supabase regenerados a partir do schema validado.

Os quatro itens pendentes dependem de um banco descartável. Esta máquina não possui Docker, Colima, Podman, OrbStack ou servidor PostgreSQL local; nenhum ambiente remoto staging existe. Os contratos estáticos passam, mas não substituem o replay.

### Publicação e integrações externas

- [x] Webhooks Wearables permanecem OFF/fail-closed.
- [x] Nenhuma conta OAuth real conectada.
- [x] Nenhum app, secret, redirect URI ou keyring externo criado/alterado.
- [x] Nenhum push Git ou deploy Netlify/Supabase realizado.
- [x] Nenhuma mensagem enviada a Renan ou outro aluno.
- [ ] Destino staging remoto separado, nomeado e comprovado.

## 2. Pontos críticos — nunca podem passar

1. **Backend ambíguo:** `.env`, link Supabase e Netlify atuais apontam para produção. Um draft deploy do site atual ainda usaria dados reais e não conta como staging.
2. **Replay ausente:** migrations de RLS, credenciais e locks não podem ser promovidas só com testes de texto/fonte.
3. **Tipos incompletos:** `src/integrations/supabase/types.ts` contém o contrato de Volume, mas ainda não contém as novas tabelas Wearables. Não editar manualmente; regenerar apenas do schema efêmero/staging aprovado.
4. **Supabase remoto com falha:** a única branch remota encontrada foi `main` de produção, reportada pela CLI como `MIGRATIONS_FAILED`. Não usar esse estado para validar o release.
5. **MFIT fora do release:** não executar scripts, dry-run autenticado ou apply, nem integrar `62afa1c`, `4ad6e75`, `9b13665`, `209ac60` ou `b43c41f`.

## 3. Erros comuns prevenidos

- Aplicar somente os HEADs e omitir ancestrais necessários.
- Repetir a base compartilhada em cada cadeia de cherry-pick.
- Confundir site draft ligado ao backend real com staging isolado.
- Reutilizar o Supabase aposentado como banco descartável.
- Aceitar duas migrations com a mesma versão temporal porque os nomes completos diferem.
- Resolver Volume × Deload escolhendo apenas um lado do conflito.
- Chamar teste estático de RLS de teste comportamental.
- Regenerar `types.ts` contra produção ou editá-lo manualmente.
- Executar comandos MFIT só porque os scripts já existem na base.

## 4. Validação final e gate operator-gated

Antes de qualquer push/deploy:

1. Provisionar um runtime local de containers ou um projeto Supabase staging novo, separado e explicitamente autorizado.
2. Aplicar a cadeia completa em banco vazio e repetir o replay em banco já migrado.
3. Executar casos RLS A→B, rollback e concorrência de leases/callback.
4. Regenerar os tipos a partir desse ambiente e revisar o diff gerado.
5. Reexecutar testes completos, Deno, TypeScript, lint, build, backend guard e `diff-check`.
6. Obter revisão independente com decisão explícita `APPROVE`.
7. Só então solicitar autorização separada para push/deploy no destino staging comprovado.

Até esses passos, a decisão é **GO para revisão local da branch** e **NO-GO para migrations, push, deploy e OAuth externo**.

## 5. Inventário de commits

### Base compartilhada

`93b8268→394b68b`, `b1000bb→fe066d0`, `f0d0f82→7bfc226`, `6136350→4c9f233`, `2a2a9f9→a741fc3`.

### CRM

`76ae174→ddbc6fb`, `0e18702→af438ca`, `1750f72→07a508f`, `e99dffe→66bd8e5`, `f69eb00→36102fd`.

### UX

`0b1683a→8871647`, `ad9a99a→c0d691f`, `30b9203→012176e`, `714856e→7fd1354`, `fa1016a→92577cf`, `0867af8→b5119da`, `dea5c67→01d884b`, `4c2485f→854ad97`, `24a5782→536470e`, `4fd1540→19a51b5`, `b455ecf→7570e6a`, `6fe4e3a→7a8e7c2`, `4455ebf→acb57c6`.

### Wearables

`a3ff3f5→4113dad`, `71613ba→aee17cf`, `a58c6c2→d80011e`, `6941fad→7f18bb8`, `eaeaed1→fab94d1`, `abe2175→95c1f9f`, `231fd33→4311e81`, `6852d39→aad8c48`, `0e3434d→0a00f1b`, `3cc6789→110a3f7`, `bbcce2d→5ab62e7`.

### Volume

`3eb1252→8d2fd38`, `37561b7→ca36089`, `a202ad4→4fece47`.

### Deload

`24b14fb→375230f`, `afcc56c→6855736`, `1632aad→9827074`.

### Ajuste de release

`2d8da30` retimestampou somente a migration foundation de Wearables de `20260814120000` para `20260814121000`; a migration CRM permaneceu em `20260814120000`.
