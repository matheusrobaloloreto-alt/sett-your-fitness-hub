# Plano manual auditável — high-signal target signatures

**Worktree:** `codex/bn-training-volume`
**Fonte primária:** `docs/prescription/curation-v2/library-curation-v2-target-signature-high-signal-review.csv`
**Escopo:** 22 linhas high-signal, agrupadas em exatamente 6 famílias operacionais.
**Status:** plano documental; nenhum CSV, banco, target, role ou coeficiente foi alterado.

## Guardrails

- Não inferir músculo, role, coeficiente, contraindicação, substituto, progressão ou regressão sem evidência manual.
- Não marcar `ready_for_upsert=true` neste plano; todas as 22 linhas permanecem `ready_for_upsert=false` na fonte.
- Não editar `exercise_id` nem `exercise_name`.
- Toda família exige executor técnico e QA independente antes de qualquer approved manifest.
- O defeito confirmado é contaminação de assinatura de targets; a correção precisa de evidência por exercício/variação, não de substituição em lote.

## Conferência de contagem

| Família | Quantidade |
|---|---:|
| Flexoras | 2 |
| Extensão de quadril/glúteos | 4 |
| Crucifixo invertido | 4 |
| Flexão de punho | 6 |
| Remada alta | 5 |
| Rosca Scott | 1 |
| **Total** | **22** |

## Fonte linha a linha

| Linha CSV | Família | Exercise ID | Nome | Defeito atual confirmado |
|---:|---|---|---|---|
| 2 | Flexoras | `ae13d351-7019-4b7d-b0e6-cea4b8fea50d` | Cadeira Flexora com Flexão de Quadril | Fonte posterior de coxa com assinatura repetida dominada por peitoral. |
| 3 | Flexoras | `4a8b14bf-d7a8-422d-932a-63a3af07e453` | Cadeira Flexora com Flexão de Quadril Unilateral | Fonte posterior de coxa com assinatura repetida dominada por peitoral. |
| 4 | Extensão de quadril/glúteos | `3bd15908-90de-4c6a-8c64-31ad3c75f845` | Coice Polia Baixa | Fonte glúteo com assinatura de tríceps primário. |
| 5 | Extensão de quadril/glúteos | `e6058264-060f-4e41-83ee-6810f38ca520` | Coice Polia Média | Fonte glúteo com assinatura de tríceps primário. |
| 6 | Crucifixo invertido | `8fece0e9-3907-4f54-86b4-54a088cb0540` | Crucifixo Invertido com Peito no Banco | Fonte ombro com assinatura repetida dominada por peitoral. |
| 7 | Crucifixo invertido | `8a461d7f-c174-4488-8dca-b4339ad26c81` | Crucifixo Invertido Cruzado Polia | Fonte ombro com assinatura repetida dominada por peitoral. |
| 8 | Crucifixo invertido | `6e9fdaca-5bfb-420c-b5bf-5beddcce6c05` | Crucifixo Invertido Sentado | Fonte ombro com assinatura repetida dominada por peitoral. |
| 9 | Crucifixo invertido | `b5265c3f-05a3-4fdc-834a-2b6f0c69d12b` | Crucifixo Invertido Unilateral Polia | Fonte ombro com assinatura repetida dominada por peitoral. |
| 10 | Extensão de quadril/glúteos | `efde85ec-e714-44b9-928c-8db249f06c04` | Extensão de Quadril Banco Romano com Flexão | Fonte glúteo com assinatura repetida dominada por peitoral. |
| 11 | Flexão de punho | `a9307b76-a4e2-4305-b683-d86e59ae80b6` | Flexão de Punho 90 graus Polia Baixa | Fonte antebraço com assinatura repetida dominada por peitoral. |
| 12 | Flexão de punho | `dcc7c1f8-9e2e-4b4d-a91e-fbc96fd042fe` | Flexão de Punho com a Polia Atrás | Fonte antebraço com assinatura repetida dominada por peitoral. |
| 13 | Flexão de punho | `479eecd9-1642-4c4c-b9eb-b0a14f11af3a` | Flexão de Punho Halteres | Fonte antebraço com assinatura repetida dominada por peitoral. |
| 14 | Flexão de punho | `fd207a91-506b-466d-8d6c-d905e97e690a` | Flexão de Punho na Barra Fixa ou Antebraço na Barra Fixa | Fonte antebraço com assinatura repetida dominada por peitoral. |
| 15 | Flexão de punho | `9c2ad88a-1f2a-4c58-9455-a667d5331d09` | Flexão de Punho Polia Baixa | Fonte antebraço com assinatura repetida dominada por peitoral. |
| 16 | Flexão de punho | `7512d746-8861-45b3-9242-800df83c8810` | Flexão de Punho Unilateral Polia Alta | Fonte antebraço com assinatura repetida dominada por peitoral. |
| 17 | Extensão de quadril/glúteos | `258bfac0-5456-462d-8530-a8204af6b8f8` | Glúteo Coice Polia Banco | Fonte glúteo com assinatura de tríceps primário. |
| 18 | Remada alta | `b222ffd2-a90e-47a2-9924-a63381446069` | Remada Alta Barra | Fonte ombro com assinatura repetida dominada por costas. |
| 19 | Remada alta | `bc77dd8b-8a5b-49da-987b-2653991d1659` | Remada Alta Halteres | Fonte ombro com assinatura repetida dominada por costas. |
| 20 | Remada alta | `ce8529f2-dd0e-4c7c-8110-d2505d84bfe2` | Remada Alta Máquina | Fonte ombro com assinatura repetida dominada por costas. |
| 21 | Remada alta | `e2e6d537-a9ba-4feb-bd2d-f6b7591895c2` | Remada Alta no Smith | Fonte ombro com assinatura repetida dominada por costas. |
| 22 | Remada alta | `6c2e58df-666f-420a-81e2-192929555fdc` | Remada Alta Polia | Fonte ombro com assinatura repetida dominada por costas. |
| 23 | Rosca Scott | `bf33e722-9da1-4e32-af62-546bb5176c3a` | Rosca Scott Barra | Fonte bíceps com assinatura repetida dominada por costas. |

## Família 1 — Flexoras

**Linhas/IDs:** CSV linhas 2–3; 2 exercícios.

**Defeito atual:** flexoras/posterior de coxa carregam assinatura repetida de peitoral, deltoide anterior e tríceps. Isso indica provável contaminação de template, não revisão técnica válida.

**Campos que exigem revisão manual:**

- `targets`
- `role`
- `is_primary`
- `volume_percentage`
- variação bilateral vs unilateral
- `movement_pattern`, se ausente ou incompatível
- metadados de segurança relacionados a quadril/joelho/lombar, se o vídeo indicar necessidade

**Fontes/evidências necessárias:**

- vídeo ou demonstração oficial do exercício;
- tipo de máquina/cadeira;
- posição do quadril;
- amplitude de flexão de joelho;
- unilateralidade real;
- suporte/apoio que altere demanda lombar ou pélvica.

**Sequência executor → QA:**

1. Executor confere vídeo e cataloga o padrão mecânico sem alterar o CSV high-signal.
2. Executor propõe targets/roles/coeficientes em artefato de retorno separado, mantendo `ready_for_upsert=false`.
3. QA independente compara proposta contra vídeo, nome, fonte `source_muscle_group` e catálogo de grupos musculares existentes.
4. QA rejeita qualquer proposta baseada apenas no nome.

**Critérios de aceite:**

- assinatura contaminada de peitoral/tríceps/deltoide anterior removida apenas após evidência;
- bilateral e unilateral revisados separadamente;
- nenhum músculo novo inventado;
- justificativa técnica por linha.

**Critérios de rejeição:**

- ausência de vídeo/setup;
- coeficiente escolhido por intuição;
- proposta em lote sem diferenciar unilateralidade;
- `ready_for_upsert=true`.

**Dry-run:**

- validar que as 2 linhas continuam presentes e únicas;
- rodar return guard sobre arquivo de retorno;
- gerar apenas SQL noop, com zero execução de banco.

## Família 2 — Extensão de quadril/glúteos

**Linhas/IDs:** CSV linhas 4, 5, 10 e 17; 4 exercícios, incluindo 3 coices e 1 banco romano.

**Defeito atual:** os três coices aparecem com tríceps primário; o banco romano aparece com assinatura repetida dominada por peitoral.

**Campos que exigem revisão manual:**

- `targets`
- `role`
- `is_primary`
- `volume_percentage`
- `movement_pattern`
- `risk_region`
- `suggested_contraindications`, se houver evidência de risco lombar/quadril;
- regressões/progressões/equivalentes, se já existirem no catálogo e forem evidenciados.

**Fontes/evidências necessárias:**

- vídeo de Coice Polia Baixa;
- vídeo de Coice Polia Média;
- vídeo de Glúteo Coice Polia Banco;
- vídeo de Extensão de Quadril Banco Romano com Flexão;
- posição do tronco e pelve;
- joelho flexionado ou estendido;
- direção da resistência;
- amplitude final;
- suporte do banco romano e presença de flexão combinada.

**Sequência executor → QA:**

1. Executor separa coice baixo, coice médio, coice no banco e banco romano como variações distintas.
2. Executor documenta diferenças mecânicas antes de qualquer proposta de targets.
3. QA revisa se a variação “com flexão” muda a leitura do banco romano.
4. QA bloqueia cópia automática entre as quatro linhas.

**Critérios de aceite:**

- nenhum target de tríceps/peitoral remanescente sem justificativa evidenciada;
- cada variação tem evidência própria;
- riscos lombar/quadril considerados sem inventar contraindicação;
- proposta mantém `ready_for_upsert=false` até aprovação posterior.

**Critérios de rejeição:**

- tratar todos os glúteos como idênticos;
- corrigir só pelo nome;
- não diferenciar polia baixa/média/banco;
- inferir coeficiente sem vídeo.

**Dry-run:**

- contagem de 4 IDs únicos;
- return guard;
- approved manifest vazio enquanto não houver aprovação humana completa;
- SQL noop apenas.

## Família 3 — Crucifixo invertido

**Linhas/IDs:** CSV linhas 6–9; 4 exercícios.

**Defeito atual:** crucifixos invertidos de ombro carregam assinatura de peitoral, deltoide anterior e tríceps.

**Campos que exigem revisão manual:**

- `targets`
- `role`
- `is_primary`
- `volume_percentage`
- variação com peito no banco, sentado, cruzado polia e unilateral polia;
- `movement_pattern`;
- metadados de segurança de ombro/escápula, se evidenciados.

**Fontes/evidências necessárias:**

- vídeo de cada variação;
- plano do movimento;
- direção da resistência;
- pegada;
- amplitude;
- posição escapular;
- suporte torácico ou sentado;
- unilateralidade real.

**Sequência executor → QA:**

1. Executor identifica se cada linha é realmente crucifixo invertido e não exercício mislabeled.
2. Executor propõe correção por variação, sem copiar cegamente.
3. QA confere se há evidência para escápula/ombro e se peitoral/tríceps são contaminação.
4. QA rejeita proposta sem vídeo.

**Critérios de aceite:**

- assinatura de empurrar removida quando não demonstrada;
- variações de polia/banco/sentado/unilateral tratadas separadamente;
- nenhum target novo inventado;
- justificativa por exercício.

**Critérios de rejeição:**

- manter peitoral/tríceps por cluster;
- aprovar por semelhança textual;
- falta de evidência visual.

**Dry-run:**

- contagem de 4 IDs únicos;
- validação de retorno;
- SQL noop;
- checagem de que nenhum item virou `ready_for_upsert=true`.

## Família 4 — Flexão de punho

**Linhas/IDs:** CSV linhas 11–16; 6 exercícios.

**Defeito atual:** exercícios de antebraço/flexão de punho carregam assinatura de peitoral, deltoide anterior e tríceps.

**Campos que exigem revisão manual:**

- `targets`
- `role`
- `is_primary`
- `volume_percentage`
- identificação do target disponível no catálogo;
- variação polia baixa, polia atrás, halteres, barra fixa/antebraço, unilateral polia alta;
- `movement_pattern` e `risk_region`, se ausentes ou incompatíveis;
- segurança de punho/cotovelo, se evidenciada.

**Fontes/evidências necessárias:**

- vídeo de cada variação;
- posição do antebraço;
- pegada;
- sentido da resistência;
- amplitude;
- distinção entre flexão dinâmica de punho e sustentação/isometria;
- confirmação dos grupos musculares existentes no catálogo antes de preencher targets.

**Sequência executor → QA:**

1. Executor separa flexão dinâmica de punho de variações que possam ser sustentação/antebraço na barra.
2. Executor confirma nomes de músculos disponíveis antes de qualquer proposta.
3. QA independente valida se o movimento é realmente flexão de punho.
4. QA rejeita target inexistente ou inferido.

**Critérios de aceite:**

- assinatura contaminada de peitoral/deltoide/tríceps removida;
- variações com polia/halter/barra tratadas individualmente;
- target existe no catálogo;
- coeficiente justificado por evidência.

**Critérios de rejeição:**

- inventar grupo muscular;
- tratar “barra fixa ou antebraço” como flexão de punho sem vídeo;
- aprovar por nome;
- marcar `ready_for_upsert=true`.

**Dry-run:**

- contagem de 6 IDs únicos;
- return guard;
- approved manifest deve permanecer vazio sem aprovação;
- SQL noop apenas.

## Família 5 — Remada alta

**Linhas/IDs:** CSV linhas 18–22; 5 exercícios.

**Defeito atual:** remadas altas com fonte ombro carregam assinatura dominada por costas/dorsal, com bíceps, deltoide posterior e trapézio secundários. Pode haver contribuição real de alguns grupos conforme execução, mas a assinatura atual precisa ser revalidada por evidência, não mantida por cluster.

**Campos que exigem revisão manual:**

- `targets`
- `role`
- `is_primary`
- `volume_percentage`
- variação barra, halteres, máquina, Smith e polia;
- `movement_pattern`;
- `risk_region`;
- metadados de segurança de ombro, se evidenciados por amplitude/rotação/pegada.

**Fontes/evidências necessárias:**

- vídeo de cada variação;
- largura da pegada;
- altura final da puxada;
- trajetória da barra/halter/cabo;
- rotação do ombro;
- carga guiada vs livre;
- instruções/cues do exercício.

**Sequência executor → QA:**

1. Executor confirma se cada linha é remada alta e não remada para costas mislabeled.
2. Executor propõe targets por variação e documenta risco/execução.
3. QA avalia coerência da fonte ombro vs assinatura atual.
4. QA rejeita dorsal primário se a evidência não sustentar.

**Critérios de aceite:**

- assinatura coerente com a execução demonstrada;
- variações de equipamento não colapsadas em uma única decisão;
- segurança de ombro considerada;
- nenhuma alteração sem fonte.

**Critérios de rejeição:**

- manter dorsal primário por dominância do cluster;
- corrigir em lote;
- ausência de vídeo;
- coeficientes sem justificativa.

**Dry-run:**

- contagem de 5 IDs únicos;
- teste de retorno;
- manifest noop;
- checagem posterior de impacto em volume de ombro/costas antes de aplicação real.

## Família 6 — Rosca Scott

**Linhas/IDs:** CSV linha 23; 1 exercício.

**Defeito atual:** Rosca Scott Barra, fonte bíceps, carrega assinatura dominada por costas/dorsal com deltoide posterior/trapézio/bíceps secundário.

**Campos que exigem revisão manual:**

- `targets`
- `role`
- `is_primary`
- `volume_percentage`
- variação barra;
- segurança de cotovelo/punho, se evidenciada;
- equivalentes/regressões/progressões, se houver base no catálogo.

**Fontes/evidências necessárias:**

- vídeo ou demonstração da Rosca Scott Barra;
- tipo de barra;
- apoio no banco Scott;
- amplitude de cotovelo;
- pegada;
- confirmação de target disponível no catálogo.

**Sequência executor → QA:**

1. Executor confirma execução e apoio do braço no banco Scott.
2. Executor propõe correção com justificativa individual.
3. QA confere se qualquer target de costas/trapézio/deltoide posterior remanescente tem evidência.
4. QA rejeita aprovação sem confirmação visual.

**Critérios de aceite:**

- assinatura compatível com a execução demonstrada;
- nenhum resíduo de costas por template;
- justificativa técnica registrada;
- `ready_for_upsert=false` até validação formal.

**Critérios de rejeição:**

- manter dorsal/trapézio sem evidência;
- aprovar sem vídeo;
- inventar target/role/coeficiente.

**Dry-run:**

- contagem de 1 ID;
- return guard;
- SQL noop apenas;
- approved manifest vazio sem revisão completa.

## Gates dry-run globais

1. Confirmar exatamente 22 linhas e 22 IDs únicos.
2. Confirmar exatamente 6 famílias e contagens `2/4/4/6/5/1`.
3. Confirmar que nenhuma linha do CSV fonte foi editada.
4. Confirmar que toda proposta externa mantém `ready_for_upsert=false` até QA formal.
5. Rodar return guard contra arquivo de retorno, se houver.
6. Gerar apenas SQL noop; não executar SQL.
7. Conferir que approved manifest só contém linhas `approved + ready_for_upsert=true`; nesta fase deve permanecer vazio.
8. QA independente deve revisar 100% das 22 linhas antes de qualquer upsert.

## Critério de bloqueio

Bloquear o lote se qualquer uma destas condições ocorrer:

- contagem diferente de 22;
- família ausente ou com contagem divergente;
- ID duplicado;
- target, role ou coeficiente proposto sem evidência;
- `ready_for_upsert=true` antes de revisão humana completa;
- tentativa de aplicação em staging/produção sem SQL noop e QA independente.
