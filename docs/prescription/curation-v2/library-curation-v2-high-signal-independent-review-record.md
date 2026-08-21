# Registro auditavel - parecer independente high-signal 22/22

**Data do registro:** 2026-08-21
**Worktree:** `codex/bn-training-volume`
**Base:** `59daa8c`
**Escopo:** documentar o parecer independente recebido para as 22 linhas high-signal de assinatura de alvos.
**Status:** documental. Nenhum CSV, target, percentual, `ready_for_upsert`, manifesto, SQL ou banco foi alterado.

## Veredito

O parecer independente foi registrado como:

| Status do parecer | Quantidade | Efeito permitido agora |
|---|---:|---|
| `CONFIRMED_CORRECTION` | 20 | Correção confirmada apenas como contaminação de assinatura de targets; não cria coeficientes, roles, SQL nem `ready_for_upsert=true`. |
| `BLOCK_NEEDS_VIDEO/METADATA` | 2 | Bloqueado antes de qualquer proposta porque a evidencia de video/setup/metadados ainda nao resolve a variacao real. |
| **Total** | **22** | **0** linhas prontas para upsert nesta etapa. |

Os dois bloqueios sao:

- `efde85ec-e714-44b9-928c-8db249f06c04` - Extensão de Quadril Banco Romano com Flexão.
- `fd207a91-506b-466d-8d6c-d905e97e690a` - Flexão de Punho na Barra Fixa ou Antebraço na Barra Fixa.

## Evidencia conferida

| Fonte | Resultado |
|---|---:|
| `library-curation-v2-target-signature-high-signal-review.csv` | 22/22 linhas presentes, 22 IDs unicos, `ready_for_upsert=false` em todas. |
| `library-curation-v2-catalog-snapshot.json` | 22/22 IDs encontrados no snapshot sanitizado; snapshot com 926 exercicios e `contains_pii=false`. |
| `library-curation-v2-reconciliation.csv` | 22/22 IDs encontrados; todos `unchanged` contra o legado. |
| `docs/project/gravacao/shot-list-completo.csv` | 22/22 IDs encontrados com URL YouTube de shot-list. |
| YouTube oEmbed read-only | 22/22 URLs responderam HTTP 200 em 2026-08-21. |
| Video local proprio | 0/22 com `video_url`/`video_path` local no snapshot. |
| Backup de video de 2026-08-04 | 2/22 presentes: `4a8b14bf-d7a8-422d-932a-63a3af07e453`, `fd207a91-506b-466d-8d6c-d905e97e690a`. |

## Matriz do parecer independente

| Familia | Exercise ID | Nome | Evidencia atual | Parecer | Recomendacao registrada |
|---|---|---|---|---|---|
| Flexoras | `ae13d351-7019-4b7d-b0e6-cea4b8fea50d` | Cadeira Flexora com Flexão de Quadril | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "CADEIRA FLEXORA DO JEITO CERTO: Evite lesões e maximize o resultado nos posteriores!" | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Flexoras | `4a8b14bf-d7a8-422d-932a-63a3af07e453` | Cadeira Flexora com Flexão de Quadril Unilateral | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "CADEIRA FLEXORA - UNILATERAL"; backup yt `RYCqCZhHh74`. | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Extensão de quadril/glúteos | `3bd15908-90de-4c6a-8c64-31ad3c75f845` | Coice Polia Baixa | Assinatura atual: `Tríceps:primary:100`; oEmbed 200: "GLÚTEO COICE NA POLIA". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Extensão de quadril/glúteos | `e6058264-060f-4e41-83ee-6810f38ca520` | Coice Polia Média | Assinatura atual: `Tríceps:primary:100`; oEmbed 200: "Glúteo coice na polia média". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Crucifixo invertido | `8fece0e9-3907-4f54-86b4-54a088cb0540` | Crucifixo Invertido com Peito no Banco | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "CRUCIFIXO INVERSO HALTERES (BANCO INCLINADO) - APRENDA COMO FAZER CORRETAMENTE". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Crucifixo invertido | `8a461d7f-c174-4488-8dca-b4339ad26c81` | Crucifixo Invertido Cruzado Polia | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Posterior de Ombro Polia alta (cabo cruzado)". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Crucifixo invertido | `6e9fdaca-5bfb-420c-b5bf-5beddcce6c05` | Crucifixo Invertido Sentado | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "CRUCIFIXO INVERTIDO COM HALTERES NO BANCO: COMO FAZER CORRETAMENTE? #musculação #academia #treino". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Crucifixo invertido | `b5265c3f-05a3-4fdc-834a-2b6f0c69d12b` | Crucifixo Invertido Unilateral Polia | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Executando CRUCIFIXO INVERTIDO UNILATERAL POLIA". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Extensão de quadril/glúteos | `efde85ec-e714-44b9-928c-8db249f06c04` | Extensão de Quadril Banco Romano com Flexão | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Como GANHAR BUMBUM e FORTALECER LOMBAR no Banco Romano"; sem video local; sem backup proprio neste arquivo. | `BLOCK_NEEDS_VIDEO/METADATA` | Bloquear ate confirmar demonstracao/setup do banco romano, flexao combinada, suporte, amplitude e risco lombar/quadril; sem target, role ou coeficiente. |
| Flexão de punho | `a9307b76-a4e2-4305-b683-d86e59ae80b6` | Flexão de Punho 90 graus Polia Baixa | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Flexão de punho unilateral na polia baixa - Prof. Matheus Gomes #academia #musculação". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Flexão de punho | `dcc7c1f8-9e2e-4b4d-a91e-fbc96fd042fe` | Flexão de Punho com a Polia Atrás | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Flexão de punho com barra na polia por trás do corpo - Prof. Matheus Gomes #gym #academia #fitness". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Flexão de punho | `479eecd9-1642-4c4c-b9eb-b0a14f11af3a` | Flexão de Punho Halteres | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Como fazer flexão de punho". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Flexão de punho | `fd207a91-506b-466d-8d6c-d905e97e690a` | Flexão de Punho na Barra Fixa ou Antebraço na Barra Fixa | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "10 VARIAÇÕES DE BARRA FIXA I PUNHO LIVRE treino em casa (2018)"; backup yt `GQXElQ9XDQ4`; sem video local. | `BLOCK_NEEDS_VIDEO/METADATA` | Bloquear ate diferenciar flexao dinamica de punho, antebraco na barra/sustentacao/isometria, pegada e target existente no catalogo; sem target, role ou coeficiente. |
| Flexão de punho | `9c2ad88a-1f2a-4c58-9455-a667d5331d09` | Flexão de Punho Polia Baixa | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "FLEXÃO DE PUNHO NA POLIA". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Flexão de punho | `7512d746-8861-45b3-9242-800df83c8810` | Flexão de Punho Unilateral Polia Alta | Assinatura atual: `Deltoide Anterior:secondary:50 | Peitoral:primary:100 | Tríceps:secondary:50`; oEmbed 200: "Flexão de punho unilateral na polia". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Extensão de quadril/glúteos | `258bfac0-5456-462d-8530-a8204af6b8f8` | Glúteo Coice Polia Banco | Assinatura atual: `Tríceps:primary:100`; oEmbed 200: "Glúteo coice polia baixa no banco #glúteos". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Remada alta | `b222ffd2-a90e-47a2-9924-a63381446069` | Remada Alta Barra | Assinatura atual: `Bíceps:secondary:50 | Deltoide Posterior:secondary:50 | Dorsal:primary:100 | Trapézio:secondary:50`; oEmbed 200: "Remada alta como se deve". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Remada alta | `bc77dd8b-8a5b-49da-987b-2653991d1659` | Remada Alta Halteres | Assinatura atual: `Bíceps:secondary:50 | Deltoide Posterior:secondary:50 | Dorsal:primary:100 | Trapézio:secondary:50`; oEmbed 200: "Remada Alta com Halteres". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Remada alta | `ce8529f2-dd0e-4c7c-8110-d2505d84bfe2` | Remada Alta Máquina | Assinatura atual: `Bíceps:secondary:50 | Deltoide Posterior:secondary:50 | Dorsal:primary:100 | Trapézio:secondary:50`; oEmbed 200: "Aprenda o Movimento Correto da Remada Alta". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Remada alta | `e2e6d537-a9ba-4feb-bd2d-f6b7591895c2` | Remada Alta no Smith | Assinatura atual: `Bíceps:secondary:50 | Deltoide Posterior:secondary:50 | Dorsal:primary:100 | Trapézio:secondary:50`; oEmbed 200: "Remada alta no smith". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Remada alta | `6c2e58df-666f-420a-81e2-192929555fdc` | Remada Alta Polia | Assinatura atual: `Bíceps:secondary:50 | Deltoide Posterior:secondary:50 | Dorsal:primary:100 | Trapézio:secondary:50`; oEmbed 200: "Como fazer remada alta". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |
| Rosca Scott | `bf33e722-9da1-4e32-af62-546bb5176c3a` | Rosca Scott Barra | Assinatura atual: `Bíceps:secondary:50 | Deltoide Posterior:secondary:50 | Dorsal:primary:100 | Trapézio:secondary:50`; oEmbed 200: "NUNCA MAIS ERRE NA ROSCA SCOTT #treino #musculacao #hipertrofia #laerciorefundini #academia". | `CONFIRMED_CORRECTION` | Correção targets-only da assinatura contaminada; sem coeficientes; manter `ready_for_upsert=false`. |

## Gates antes de qualquer `ready_for_upsert=true`

1. Manter este registro como evidencia documental; nao editar a fila high-signal, snapshot, reconciliation, manifesto, SQL ou banco.
2. Para os 20 `CONFIRMED_CORRECTION`, criar artefato de retorno separado se e somente se houver proposta tecnica revisavel; como este parecer e targets-only sem coeficientes, ele nao basta para upsert.
3. Para os 2 `BLOCK_NEEDS_VIDEO/METADATA`, obter demonstracao/setup/metadados suficientes antes de qualquer target, role ou coeficiente.
4. Validar 22/22 IDs unicos e contagens familiares `2/4/4/6/5/1`.
5. Rodar return guard no eventual arquivo de retorno.
6. Approved manifest deve conter somente linhas `approved + ready_for_upsert=true`; nesta etapa deve permanecer vazio.
7. Gerar apenas SQL noop ate existir aprovacao humana completa, QA independente e backup de staging.
8. QA independente deve revisar 100% das linhas propostas antes de qualquer upsert.

## Nota sobre a skill ATENA usada

Foi consultada a skill 1125 - Sistema de Curadoria de Conteúdo como checklist de curadoria: distinguir fonte, sintese aplicavel e nao inventar evidencia. O template nao foi copiado; o uso pratico foi restringir este registro a fontes verificadas e lacunas explicitas.
