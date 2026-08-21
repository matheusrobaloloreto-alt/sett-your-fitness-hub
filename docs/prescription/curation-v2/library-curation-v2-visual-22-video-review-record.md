# Registro auditavel - revisao visual 22/22 high-signal

**Data do registro:** 2026-08-21
**Worktree:** `codex/bn-training-volume`
**Base recebida:** `65ac044`
**Escopo:** registrar a revisao visual dos 22 itens high-signal antes da etapa separada de `targets` e `volume_percentage`.
**Status:** documental. Nenhum CSV, target, coeficiente, `ready_for_upsert`, manifesto, SQL ou banco foi alterado.

## Veredito

O player real esta acessivel para 22/22 itens. Isso nao significa aprovacao tecnica automatica: a revisao visual libera 20 itens para uma etapa separada de proposta de `targets` e `volume_percentage`, e segura 2 itens.

| Saida da revisao visual | Quantidade | Efeito permitido agora |
|---|---:|---|
| `ADVANCE_TARGETS_VOLUME_STAGE` | 20 | Pode ir para artefato separado de proposta tecnica de `targets`/`volume_percentage`, mantendo `ready_for_upsert=false` ate QA independente. |
| `BLOCK_VIDEO_MISMATCH` | 1 | Nao avancar: o video de barra/muscle-up nao demonstra flexao de punho isolada. |
| `NO_ADVANCE_MEDIA_NAME_MISMATCH` | 1 | Nao avancar: a midia demonstra barra/polia, mas o nome exige Halteres. |
| **Total** | **22** | **0** linhas prontas para upsert nesta etapa. |

Itens retidos:

- `fd207a91-506b-466d-8d6c-d905e97e690a` - `BLOCK_VIDEO_MISMATCH`: video de barra/muscle-up, sem flexao de punho isolada demonstrada.
- `479eecd9-1642-4c4c-b9eb-b0a14f11af3a` - `NO_ADVANCE_MEDIA_NAME_MISMATCH`: nome `Flexao de Punho Halteres`; midia/parecer apontam mismatch por demonstracao em barra/polia.

Atualizacao relevante:

- `efde85ec-e714-44b9-928c-8db249f06c04` - setup resolvido como banco romano/45 graus; pode avancar para etapa separada de targets/volume, ainda sem alterar fonte ou marcar pronto para upsert.

## Fontes sanitizadas

| Fonte | Resultado |
|---|---:|
| `docs/prescription/curation-v2/library-curation-v2-target-signature-high-signal-review.csv` | 22/22 linhas, 22 IDs unicos, `ready_for_upsert=false` em todas. |
| `docs/prescription/curation-v2/library-curation-v2-catalog-snapshot.json` | 22/22 IDs encontrados; snapshot sanitizado com `contains_pii=false`; 926 exercicios. |
| `docs/prescription/curation-v2/library-curation-v2-reconciliation.csv` | 22/22 IDs encontrados; todos `unchanged` contra as fontes legadas locais. |
| Player embed YouTube read-only | 22/22 embeds responderam HTTP 200 em 2026-08-21. |
| YouTube oEmbed read-only | 22/22 titulos responderam HTTP 200 em 2026-08-21. |
| Parecer recebido | Usado para as decisoes visuais finais: 20 avancam; `fd207a91` bloqueia; `479eecd9` nao avanca; `efde85ec` resolvido. |

## Matriz sanitizada

| ID | Exercicio | Fonte | Assinatura atual contaminada | Equipamento local | Midia conferida | Decisao visual |
|---|---|---|---|---|---|---|
| `ae13d351-7019-4b7d-b0e6-cea4b8fea50d` | Cadeira Flexora com Flexao de Quadril | posterior de coxa | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | livre | `c3cng1WqREQ` - CADEIRA FLEXORA DO JEITO CERTO | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `4a8b14bf-d7a8-422d-932a-63a3af07e453` | Cadeira Flexora com Flexao de Quadril Unilateral | posterior de coxa | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | livre | `bdXGI3t7nFM` - CADEIRA FLEXORA - UNILATERAL | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `3bd15908-90de-4c6a-8c64-31ad3c75f845` | Coice Polia Baixa | gluteo | Triceps:primary:100 | cabo | `xGM6YEIXlJU` - GLUTEOS COICE NA POLIA | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `e6058264-060f-4e41-83ee-6810f38ca520` | Coice Polia Media | gluteo | Triceps:primary:100 | cabo | `ma9TcLtmBvY` - Gluteo coice na polia media | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `8fece0e9-3907-4f54-86b4-54a088cb0540` | Crucifixo Invertido com Peito no Banco | ombro | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | livre | `neiVTL2U5Qo` - CRUCIFIXO INVERSO HALTERES BANCO INCLINADO | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `8a461d7f-c174-4488-8dca-b4339ad26c81` | Crucifixo Invertido Cruzado Polia | ombro | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | cabo | `i4S5Rlx-b9I` - Posterior de Ombro Polia alta cabo cruzado | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `6e9fdaca-5bfb-420c-b5bf-5beddcce6c05` | Crucifixo Invertido Sentado | ombro | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | livre | `Z3hRQSnfcys` - CRUCIFIXO INVERTIDO COM HALTERES NO BANCO | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `b5265c3f-05a3-4fdc-834a-2b6f0c69d12b` | Crucifixo Invertido Unilateral Polia | ombro | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | cabo | `rJyUiN6Gkdg` - Executando CRUCIFIXO INVERTIDO UNILATERAL POLIA | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `efde85ec-e714-44b9-928c-8db249f06c04` | Extensao de Quadril Banco Romano com Flexao | gluteo | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | maquina | `l7SDw-10WzY` - Banco Romano; setup resolvido como romano/45 graus | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `a9307b76-a4e2-4305-b683-d86e59ae80b6` | Flexao de Punho 90 graus Polia Baixa | antebraco | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | cabo | `KI6HKLjwg0s` - Flexao de punho unilateral na polia baixa | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `dcc7c1f8-9e2e-4b4d-a91e-fbc96fd042fe` | Flexao de Punho com a Polia Atras | antebraco | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | cabo | `a67YWN7s9HY` - Flexao de punho com barra na polia por tras do corpo | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `479eecd9-1642-4c4c-b9eb-b0a14f11af3a` | Flexao de Punho Halteres | antebraco | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | halteres | `3PDPiCoWF-Y` - Como fazer flexao de punho; parecer indica midia barra/polia vs nome Halteres | `NO_ADVANCE_MEDIA_NAME_MISMATCH` |
| `fd207a91-506b-466d-8d6c-d905e97e690a` | Flexao de Punho na Barra Fixa ou Antebraco na Barra Fixa | antebraco | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | barra | `W_NaNuH6LxY` - variacoes de barra fixa/punho livre; sem flexao de punho isolada | `BLOCK_VIDEO_MISMATCH` |
| `9c2ad88a-1f2a-4c58-9455-a667d5331d09` | Flexao de Punho Polia Baixa | antebraco | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | cabo | `e1z3026KDLI` - FLEXAO DE PUNHO NA POLIA | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `7512d746-8861-45b3-9242-800df83c8810` | Flexao de Punho Unilateral Polia Alta | antebraco | Deltoide Anterior:secondary:50 / Peitoral:primary:100 / Triceps:secondary:50 | cabo | `X7Nr7jMS6DA` - Flexao de punho unilateral na polia | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `258bfac0-5456-462d-8530-a8204af6b8f8` | Gluteo Coice Polia Banco | gluteo | Triceps:primary:100 | cabo | `IIGMf2nFW5g` - Gluteo coice polia baixa no banco | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `b222ffd2-a90e-47a2-9924-a63381446069` | Remada Alta Barra | ombro | Biceps:secondary:50 / Deltoide Posterior:secondary:50 / Dorsal:primary:100 / Trapezio:secondary:50 | barra | `VE7UeEql8cc` - Remada alta como se deve | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `bc77dd8b-8a5b-49da-987b-2653991d1659` | Remada Alta Halteres | ombro | Biceps:secondary:50 / Deltoide Posterior:secondary:50 / Dorsal:primary:100 / Trapezio:secondary:50 | halteres | `TtJs7aWm7cA` - Remada Alta com Halteres | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `ce8529f2-dd0e-4c7c-8110-d2505d84bfe2` | Remada Alta Maquina | ombro | Biceps:secondary:50 / Deltoide Posterior:secondary:50 / Dorsal:primary:100 / Trapezio:secondary:50 | maquina | `_g45I_aXF-Q` - Movimento correto da remada alta | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `e2e6d537-a9ba-4feb-bd2d-f6b7591895c2` | Remada Alta no Smith | ombro | Biceps:secondary:50 / Deltoide Posterior:secondary:50 / Dorsal:primary:100 / Trapezio:secondary:50 | barra | `S8fmAVJaXZI` - Remada alta no smith | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `6c2e58df-666f-420a-81e2-192929555fdc` | Remada Alta Polia | ombro | Biceps:secondary:50 / Deltoide Posterior:secondary:50 / Dorsal:primary:100 / Trapezio:secondary:50 | cabo | `tm0IywBhIYM` - Como fazer remada alta | `ADVANCE_TARGETS_VOLUME_STAGE` |
| `bf33e722-9da1-4e32-af62-546bb5176c3a` | Rosca Scott Barra | biceps | Biceps:secondary:50 / Deltoide Posterior:secondary:50 / Dorsal:primary:100 / Trapezio:secondary:50 | barra | `WH6IgVJeK68` - Rosca Scott | `ADVANCE_TARGETS_VOLUME_STAGE` |

## Notas de midia mista

- `8a461d7f-c174-4488-8dca-b4339ad26c81`: midia e nome convergem para posterior de ombro em polia/cabo cruzado. Avanca para targets/volume, mas a etapa seguinte deve preservar a diferenca entre cabo cruzado e outras variacoes de crucifixo invertido.
- `6e9fdaca-5bfb-420c-b5bf-5beddcce6c05`: nome local diz sentado; titulo de midia fala halteres no banco. Avanca por familia visual, mas a proposta tecnica precisa confirmar setup sentado vs apoio no banco antes de definir percentuais.
- `ce8529f2-dd0e-4c7c-8110-d2505d84bfe2`: nome/equipamento local dizem maquina; titulo da midia e generico de remada alta. Avanca apenas para etapa separada, com obrigacao de verificar se a maquina altera amplitude, pegada ou risco de ombro.
- `6c2e58df-666f-420a-81e2-192929555fdc`: nome/equipamento local dizem polia/cabo; titulo da midia e generico. Avanca, mas a etapa de target/volume deve validar setup de polia e nao copiar a linha de barra/halteres/maquina.

## Gates para a proxima etapa

1. Criar artefato separado para `targets` e `volume_percentage`; este registro nao e arquivo de aplicacao.
2. Manter os 20 avancaveis com `ready_for_upsert=false` ate proposta tecnica revisada e QA independente.
3. Manter `fd207a91` bloqueado enquanto a evidencia visual for barra/muscle-up sem flexao isolada de punho.
4. Manter `479eecd9` fora do avanco enquanto a midia nao corresponder a Halteres.
5. Nao copiar imagens temporarias nem anexos de revisao para o repositorio.
6. Nao alterar CSV, targets, coeficientes, arquivos `ready`, manifestos, SQL ou banco nesta etapa.

## Checklist mecanico esperado

- 22 IDs unicos no high-signal review.
- 22/22 encontrados no snapshot sanitizado.
- 22/22 encontrados na reconciliation.
- 22/22 player embed acessivel.
- 20 `ADVANCE_TARGETS_VOLUME_STAGE`.
- 2 retidos: 1 `BLOCK_VIDEO_MISMATCH`, 1 `NO_ADVANCE_MEDIA_NAME_MISMATCH`.

## Nota sobre skill ATENA

Foi consultada a skill 1125 - Sistema de Curadoria de Conteudo como checklist de curadoria: distinguir fonte, sintese aplicavel e lacuna explicita. O template nao foi copiado; o uso pratico foi restringir este registro a fontes verificadas, parecer recebido e limites de aplicacao.
