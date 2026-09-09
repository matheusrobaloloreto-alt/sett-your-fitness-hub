# Manifesto de vigencias legadas SETT/BN - 09/09/2026

## Veredito

**Atualizacao pos-apply:** as 21 matriculas comerciais foram encerradas neste
escopo. Dezoito vigencias foram corrigidas em dois lotes auditados e tres ja
tinham exatamente a duracao do plano, portanto permaneceram sem escrita. A
conta `d389bc608edc` continua excluida por ser plano de teste. O pos-audit em
producao confirmou `commercial_mismatches=0`, 18 after-images coincidentes,
RLS ativa e nenhum acesso de `anon`/`authenticated` a auditoria.

- Lote 1: 12 correcoes, repair key `bn_legacy_terms_20260909`.
- Lote 2: 6 correcoes, repair key `bn_remaining_legacy_terms_20260909`.
- Catharina foi reconciliada como BN PRO Anual: compra de R$ 2.500 em 12
  parcelas, preco anual historico e matricula anterior anual.
- Livia, Maura e Themis ja tinham 168 dias e nao foram modificadas.
- Nenhum ciclo, treino, log ou sessao foi atualizado pelos dois lotes; os
  dry-runs completos foram revertidos e os applies passaram por QA independente.

O texto abaixo preserva o manifesto pre-apply e suas cautelas como trilha de
auditoria; os buckets `BLOCK_*` ali descritos foram resolvidos pela verificacao
cruzada adicional ou fechados como sem mudanca necessaria.

Auditoria read-only concluida para as 22 matriculas da conferencia Asaas.
Nao houve escrita em banco, Asaas, pagamentos, ciclos, treinos, assinaturas,
acessos ou mensagens.

Resultado operacional:

- 9 matriculas tem evidencia fiscal/operacional suficiente para preparar dry-run
  de correcao material de vigencia.
- 3 matriculas tem evidencia suficiente apenas para normalizacao de fronteira
  legada de 1 dia.
- 7 matriculas dependem de contrato, diferimento, origem externa ou identidade
  fiscal antes de qualquer correcao automatica.
- 1 matricula tem pagamento forte, mas esta bloqueada por QA interno de treino
  antes de escrita financeira segura.
- 1 matricula nao precisa de alteracao de vigencia no estado atual, embora a
  origem manual precise ficar registrada.
- 1 matricula e conta/plano de teste e nao deve ser tratada como contrato
  comercial comum.

## Fontes e limites

- Base consultada: Supabase PROD `zshrcgbyhzxpnlccssyz`, tenant
  `bn-performance-training`, data comercial `2026-09-09`.
- O worktree estava linkado ao staging `ifymocggowdlqqcxugko`; `supabase db query --linked`
  no proprio worktree retorna fixtures sinteticas. Para PROD foi usado link temporario
  em `/tmp`, sem alterar o link local.
- Fonte fiscal: `docs/project/AUDITORIA-2026-09-09-ASAAS-VIGENCIAS.md`.
- Fonte de ciclo/renovacao: `docs/project/AUDITORIA-2026-09-09-CICLOS-RENOVACOES.md`,
  `docs/project/RENOVACAO-2026-09-09-SUBSTITUICAO.md`,
  `docs/project/AUDITORIA-2026-09-09-OITO-CONFLITOS*.md` e
  `docs/project/AUDITORIA-2026-09-09-ALIASES-CICLOS.md`.
- Consulta reproduzivel criada: `scripts/audit-bn-legacy-vigencias-dryrun.sql`.
- O SQL e somente leitura: `begin transaction read only; ... rollback;`.
- O manifesto abaixo usa referencias tecnicas pseudonimas. Nomes, CPF, email,
  telefone, URLs privadas e identificadores Asaas completos nao foram gravados.

Comando de verificacao executado:

```bash
supabase db query --linked --workdir /tmp/sett-prod-link.8YYGzw \
  -f /Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc/scripts/audit-bn-legacy-vigencias-dryrun.sql \
  -o json
```

## Criterio

`GO_DRY_RUN_VIGENCIA` significa que ha evidencia suficiente para preparar SQL
dry-run com backup, locks, before/after hashes, QA independente e rollback
fail-closed. Nao significa autorizacao para aplicar.

`GO_DRY_RUN_BORDER_1D` significa que a diferenca e apenas a fronteira inclusiva
legada de 1 dia; pode entrar em lote de normalizacao, mas com prioridade menor
e sem misturar com cortes materiais.

`BLOCK_EXTERNAL_*` significa que falta evidencia externa: contrato, diferimento,
origem manual/fora Asaas ou identidade fiscal. Aritmetica local nao substitui
essa prova.

`BLOCK_INTERNAL_TRAINING_QA` significa que a prova financeira e forte, mas a
escrita de vigencia ainda depende de preservar treino/conteudo sem ambiguidade.

## Manifesto

| Matricula | Decisao | Atual | Alvo candidato | Evidencia | Motivo / proximo passo |
| --- | --- | --- | --- | --- | --- |
| `b7004e616eca` | `GO_DRY_RUN_VIGENCIA` | `2026-03-16` -> `2027-02-15`; plano 168d; delta +169d | `2026-03-16` -> `2026-08-30` | CPF coincidente; compra confirmada `2026-03-16`; 6 pagamentos locais; 0 lifecycle aplicado | Preparar dry-run de corte material. Revalidar que ciclos/treinos posteriores nao precisam carry-over especial. |
| `df14c3d504f6` | `GO_DRY_RUN_VIGENCIA` | `2026-03-07` -> `2028-01-08`; plano 336d; delta +337d | `2026-03-07` -> `2027-02-05` | CPF coincidente; compra confirmada `2026-03-06`; 12 pagamentos locais | Termo de 673 dias para anual. Preparar dry-run; nao usar repasse de agosto como data de compra. |
| `f79808183ac6` | `GO_DRY_RUN_VIGENCIA` | `2026-06-02` -> `2027-02-08`; plano 168d; delta +84d | `2026-08-04` -> `2027-01-18` | CPF coincidente; compra nova confirmada `2026-08-04` | Usar modelo de substituicao por compra nova, preservando treino anterior ate nova publicacao. |
| `2d93f08d4f16` | `GO_DRY_RUN_VIGENCIA` | `2026-03-09` -> `2028-01-10`; plano 336d; delta +337d | `2026-03-09` -> `2027-02-07` | CPF coincidente; compra confirmada `2026-03-08`; 12 pagamentos locais | Termo de 673 dias para anual. Preparar dry-run; ciclos ja nao tem pares atuais/futuros apos reparo anterior. |
| `078e2d2b9409` | `GO_DRY_RUN_BORDER_1D` | `2026-01-12` -> `2026-12-14`; plano 336d; delta +1d | `2026-01-12` -> `2026-12-13` | CPF coincidente; compra confirmada `2026-01-12`; sem pagamento local | Normalizacao de fronteira legada de 1 dia. Nao e caso de duplicidade anual. |
| `711a247b40da` | `BLOCK_EXTERNAL_CONTRACT_OR_PLAN` | `2025-05-12` -> `2027-10-11`; plano SETT 168d; delta +715d | sem alvo | CPF coincidente; compra `2026-05-25`; 12 parcelas locais | Valor/parcelamento sugerem anual, mas SETT esta semestral. Contrato/plano correto define prazo. |
| `2370076329b4` | `GO_DRY_RUN_VIGENCIA` | `2026-03-03` -> `2027-08-17`; plano 168d; delta +365d | `2026-09-02` -> `2027-02-16` | CPF coincidente; compra nova `2026-09-02`; lifecycle local aplicado | Fim financeiro acumulado; ciclos visiveis vao ate `2027-02-17`. Dry-run deve decidir e documentar a fronteira de 1 dia entre financeiro e ciclos. |
| `2dbfaac06276` | `BLOCK_EXTERNAL_IDENTITY` | `2026-03-14` -> `2026-08-29`; plano 168d; delta +1d | sem alvo | Apenas candidato sem CPF coincidente | Nao atribuir contrato automaticamente. Exige identidade fiscal/documento externo. |
| `711ab66e14f5` | `BLOCK_EXTERNAL_DEFERMENT` | `2026-05-21` -> `2027-05-05`; plano 168d; delta +182d | sem alvo | CPF coincidente; compra `2026-05-21`; 6 pagamentos locais | Confirmar data inicial operacional/diferimento antes de encurtar. |
| `0f13e58e755f` | `GO_DRY_RUN_VIGENCIA` | `2026-06-15` -> `2027-05-16`; plano 168d; delta +168d | `2026-06-15` -> `2026-11-29` | CPF coincidente; compra `2026-06-15`; 6 pagamentos locais | Termo equivale exatamente a dois planos semestrais. Preparar dry-run. |
| `8dc8a2580782` | `BLOCK_EXTERNAL_DEFERMENT` | `2026-07-14` -> `2027-01-12`; plano 168d; delta +15d | sem alvo | CPF coincidente; Pix `2026-07-14`; 2 pagamentos locais | Data `2026-07-29` no app nao e a confirmacao; precisa validar se houve diferimento. |
| `f7047b8d00d2` | `BLOCK_EXTERNAL_ORIGIN` | `2026-08-17` -> `2027-01-31`; plano 168d; delta 0d | sem alvo | Nao localizado no export Asaas | Estado atual bate com plano; origem manual/fora Asaas precisa ser confirmada, sem escrita. |
| `5d281f90c927` | `GO_DRY_RUN_VIGENCIA` | `2026-04-21` -> `2027-03-22`; plano 168d; delta +168d | `2026-04-21` -> `2026-10-05` | CPF coincidente; compra `2026-04-21`; 7 pagamentos locais | Termo equivale a dois planos semestrais. Preparar dry-run. |
| `5ae9920ce3fa` | `GO_DRY_RUN_VIGENCIA` | `2026-03-30` -> `2027-03-01`; plano 168d; delta +169d | `2026-03-30` -> `2026-09-13` | CPF coincidente; compra `2026-03-30`; sem compra posterior no export | Termo de 337 dias sinaliza soma antiga. Preparar dry-run. |
| `241dfb3b3c96` | `GO_DRY_RUN_VIGENCIA` | `2026-03-20` -> `2027-02-19`; plano 168d; delta +169d | `2026-03-20` -> `2026-09-03` | CPF coincidente; compra `2026-03-20`; 6 pagamentos locais | Termo de 337 dias sinaliza soma antiga. O alvo coincide com ultimo ciclo visivel. |
| `d389bc608edc` | `NO_COMMERCIAL_ACTION_TEST` | `2026-06-21` -> `2027-08-14`; plano teste 42d; delta +378d | sem alvo | Conta/plano de teste; compra de valor teste | Nao tratar como contrato comercial comum. Separar de lote comercial. |
| `868b64104865` | `BLOCK_EXTERNAL_IDENTITY` | `2026-05-01` -> `2026-10-15`; plano 168d; delta 0d | sem alvo | Candidato sem CPF coincidente | CPF diverge; termo atual ja bate com plano. Nao vincular pagamento automaticamente. |
| `c6c818177b56` | `GO_DRY_RUN_BORDER_1D` | `2025-12-09` -> `2026-11-10`; plano 336d; delta +1d | `2025-12-09` -> `2026-11-09` | CPF/email coincidem; compra `2025-12-09` | Normalizacao de fronteira legada de 1 dia sob outro nome fiscal. |
| `14b9857eb992` | `GO_DRY_RUN_BORDER_1D` | `2025-07-11` -> `2026-06-12`; plano 336d; delta +1d | `2025-07-11` -> `2026-06-11` | CPF coincidente; compra `2025-07-11`; sem renovacao posterior | Normalizacao de fronteira legada de 1 dia, matricula ja em `awaiting_renewal`. |
| `5f9de190f3c7` | `BLOCK_INTERNAL_TRAINING_QA` | `2026-03-06` -> `2027-07-23`; plano 168d; delta +337d | financeiro candidato `2026-09-01` -> `2027-02-15` | CPF coincidente; compra nova `2026-09-01`; 7 pagamentos locais | Evidencia financeira forte, mas alias/conteudo de treino ainda bloqueia escrita segura. Concluir QA de preservacao antes do dry-run financeiro. |
| `572a44e1703c` | `BLOCK_EXTERNAL_DEFERMENT` | `2026-04-07` -> `2027-03-21`; plano 168d; delta +181d | sem alvo | CPF coincidente; compra `2026-04-04`; 6 pagamentos locais | Validar diferimento inicial antes de corrigir termino. |
| `40d31da36bcf` | `NO_CHANGE_CURRENT_TERM_MATCHES_PLAN` | `2026-07-14` -> `2026-12-28`; plano 168d; delta 0d | sem alvo | CPF coincidente; compra antiga `2026-01-13` | Termo atual bate com plano SETT. Export nao comprova renovacao manual de julho; registrar, nao escrever. |

## Ordem recomendada

1. Preparar um dry-run material somente para `GO_DRY_RUN_VIGENCIA`, com sublotes
   separados para compra antiga/soma legada e compra nova/substituicao.
2. Tratar `GO_DRY_RUN_BORDER_1D` em lote separado e opcional, para nao misturar
   normalizacao cosmetica com cortes materiais de acesso.
3. Resolver `BLOCK_EXTERNAL_*` com contrato, comprovante de diferimento,
   identidade fiscal ou comprovante de origem manual antes de qualquer SQL.
4. Resolver `5f9de190f3c7` com QA de treino/alias antes de mexer na vigencia.
5. Manter `d389bc608edc` fora de qualquer lote comercial.

## Gates obrigatorios antes de aplicar qualquer escrita

- Backup privado permanente antes/depois por matricula, protegido por RLS.
- Dry-run em transacao com as mesmas operacoes do apply e rollback integral.
- Hash deterministico de beforeimage por alvo.
- Lock por tenant/matricula/aluno.
- Validacao de plano, aluno, empresa, status, ciclos visiveis, treino usado,
  `workout_logs`, `workout_sessions`, carry-over e intercycle.
- QA independente pos-dry-run antes de qualquer apply.
- Rollback fail-closed por hash atual.
- Nenhum caminho operacional de lifecycle, webhook, sync ou get-payment-status
  deve ser chamado como leitura.

## Checklist acumulado do escopo

- ✅ Auditoria Asaas de 826 cobrancas e 22 matriculas lida como fonte fiscal, sem expor PII.
- ✅ PROD correto localizado; o link local do worktree estava em staging e foi isolado.
- ✅ Script SQL read-only criado em `scripts/audit-bn-legacy-vigencias-dryrun.sql`.
- ✅ Manifesto deterministico das 22 matriculas criado neste arquivo.
- ✅ Apply de 18 correcoes de vigencia concluido em producao, com dois dry-runs revertidos, dois GOs independentes e rollback fail-closed.
- ✅ Livia, Maura e Themis confirmadas sem mudanca: cada termo ja tinha exatamente 168 dias.
- ✅ Casos antes externos encerrados por evidencia cruzada de compra, plano e duracao; Catharina corrigida para anual.
- ✅ `5f9de190f3c7` corrigida financeiramente sem alterar o conflito de ciclos ou o treino historico.
- ✅ Conta de teste mantida fora do lote comercial, sem reinterpretacao como contrato real.
