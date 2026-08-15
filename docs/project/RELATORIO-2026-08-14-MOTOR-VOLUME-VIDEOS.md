# SETT/BN — auditoria do motor, volume e mídia dos 926 exercícios

**Data:** 2026-08-14
**Escopo:** auditoria read-only do Supabase canônico e correções locais de cálculo. Nenhum dado remoto, migration, deploy ou bulk update foi aplicado.

## Decisão executiva

Os **926 exercícios estão ligados ao motor por `exercise_muscle_targets`**, mas a cobertura ainda não equivale a uma taxonomia biomecânica pronta para produção:

- 716 exercícios têm somente um alvo;
- apenas 210 têm múltiplos alvos;
- a escala de `volume_percentage` mistura frações (`0.5`, `1`) e percentuais (`20`, `50`, `100`);
- 489 exercícios não têm contraindicações nem tags de dor, então o motor depende do fallback por palavras-chave;
- a taxonomia tem 40 grupos, enquanto as recomendações usam somente 12 nomes amplos e o RPC anterior fazia join textual exato.

Portanto, **não deve haver bulk update automático dos alvos**. O código local corrige a interpretação dos dados existentes; o enriquecimento dos 716 exercícios de alvo único precisa de revisão técnica por famílias de movimento.

## Cobertura do motor

| Métrica | Resultado |
|---|---:|
| Exercícios na biblioteca | 926 |
| Linhas de alvo muscular | 1.390 |
| Exercícios com ao menos um alvo | **926 (100%)** |
| Alvos primários | 926 |
| Alvos secundários | 464 |
| Conflitos `role` × `is_primary` | 0 |
| Exercícios com 1 alvo | 716 |
| Exercícios com 2 alvos | 37 |
| Exercícios com 3 alvos | 92 |
| Exercícios com 4 alvos | 81 |
| Linhas de metadata | 926 |
| Sem contraindicação e sem tag de dor | 489 |
| Sem `muscle_group_id` na biblioteca | 9 |
| Sem equipamento | 9 |
| Sem dificuldade | 0 |
| Overrides por empresa | 0 |

Distribuição da escala histórica:

| `volume_percentage` | Linhas |
|---:|---:|
| 0,5 | 444 |
| 1 | 363 |
| 20 | 3 |
| 30 | 10 |
| 40 | 6 |
| 50 | 1 |
| 100 | 563 |

## Inconsistências de cálculo encontradas

1. O motor determinístico contava apenas `exercise.muscle_group` e descartava os demais alvos.
2. A conversão catálogo → treino removia `targets` do plano gerado.
3. Prescrição e validação dividiam todo valor por 100; assim `0.5` virava `0.005` e `1` virava `0.01`.
4. O RPC `get_weekly_volume` multiplicava o secundário diretamente pelo valor; assim `50` podia virar fator 50.
5. O RPC ignorava `company_exercise_volumes` e não encontrava aliases como Dorsal/Costas, Peitoral/Peito e Deltoide/Ombros.
6. `WorkoutAnalysis` usava `0.5` fixo para todo alvo secundário e arredondava cada contribuição isoladamente.
7. A tela do aluno atribuía LOAD a um único `muscle_group`, confundindo carga externa com exposição muscular.

## Regra implementada localmente

`volume_percentage` é interpretado como coeficiente de exposição de séries:

- `0 <= x <= 1` → `x`;
- `1 < x <= 100` → `x / 100`;
- ausente + primário → `1`;
- ausente + secundário → `0,5`;
- negativo, acima de 100, NaN ou infinito → erro, sem correção silenciosa.

O valor `1` representa 100% por necessidade de compatibilidade com a base viva. Essa ambiguidade deve ser eliminada no futuro com uma coluna canônica 0..1, versionada.

Métricas mantidas separadas:

- **séries fracionárias de trabalho por grupamento:** soma de séries × coeficiente de exposição;
- **LOAD externo:** soma de carga registrada × repetições realizadas, por semana.

O LOAD não é repartido entre músculos: não há dados cinéticos suficientes para afirmar que uma porcentagem da carga externa pertence a cada grupamento. A soma das exposições musculares também não é apresentada como total bruto do treino, pois uma série composta pode contribuir para mais de um grupo.

## Mudanças locais preparadas

- O motor passa `targets` do catálogo para o treino e conta múltiplos grupamentos.
- Prescrição e validação usam a mesma normalização de escala.
- O painel do aluno mantém o LOAD semanal e mostra, separadamente, séries fracionárias por grupamento.
- A análise da treinadora mostra séries prescritas/semana e realizadas/semana por grupamento, sem arredondamento prematuro.
- Migration local substitui `get_weekly_volume`, aplica overrides por empresa, normaliza a escala e agrega aliases em grupos canônicos.
- A migration deduplica pai/filho/alias por ocorrência de exercício usando a maior exposição, evitando dupla contagem.
- Constraints locais `NOT VALID` passam a bloquear novos percentuais fora de 0..100 e roles fora de `primary|secondary`, sem reescrever a base atual.
- A coerência `role` ↔ `is_primary` também é exigida para novos alvos; secundários são persistidos com `is_primary=false`.
- A edição de alvos usa um único RPC transacional: valida todo o payload antes do `DELETE` e qualquer falha no `INSERT` restaura o estado anterior.
- As telas de aluno e treinadora obtêm alvos efetivos por RPC vinculado ao `student_id`; o override é sempre filtrado pela empresa viva do aluno, sem consulta direta cross-tenant.
- A análise da treinadora considera somente logs `completed=true` e usa a interseção entre período solicitado, início/fim do ciclo e hoje como denominador efetivo.
- O limitador de volume recalcula todas as exposições ponderadas após remover cada série física, inclusive quando o excesso existe apenas em alvo secundário.
- Se todos os exercícios contribuintes tiverem apenas uma série, o limitador remove o contribuinte de maior prioridade de redução até cumprir o teto; ele não declara ajuste mantendo `after > cap`.
- Prescrição e validação aplicam, em paridade, `role` e `volume_percentage` dos overrides por empresa.
- Script read-only `scripts/audit-exercise-engine-coverage.mjs` torna a auditoria agregada reproduzível sem imprimir nomes ou PII.
- Antes de aceitar service role, o auditor exige exatamente a origem HTTPS `zshrcgbyhzxpnlccssyz.supabase.co`, sem porta, caminho, query ou credenciais embutidas.

## Taxonomia e próximos dados

Existem aliases/níveis concorrentes, por exemplo: Dorsal/Costas, Peitoral/Peito, Core/Abdominais/Abdômen, Panturrilha/Panturrilhas, Glúteo/Glúteo Máximo/Glúteo Médio/Glúteos e variantes de Deltoide/Ombros. A migration local resolve o nível de relatório; ela não inventa novos pesos.

Próximo lote de dados recomendado:

1. agrupar os 716 exercícios de alvo único por padrão de movimento;
2. priorizar compostos e movimentos com maior uso;
3. propor alvos secundários apenas por papel (`secondary`) e default explícito de 0,5;
4. revisar por biomecânica/cinesiologia;
5. gerar relatório de diff e ambiguidades;
6. solicitar autorização antes de qualquer escrita remota.

## Vídeos e demonstrações

| Métrica | Resultado |
|---|---:|
| Exercícios com alguma fonte | **926/926** |
| IDs YouTube válidos | 906 |
| URLs diretas HTTPS | 165 |
| MP4 CloudFront entre as URLs diretas | 144 |
| URLs diretas YouTube | 21 |
| `video_path` preenchido | 0 |
| Sem thumbnail persistida | 762 |
| IDs YouTube duplicados | 72 |
| Exercícios afetados por ID duplicado | 179 |

A ausência de thumbnail persistida não significa ausência de vídeo, pois a UI pode derivá-la do YouTube. Os 72 IDs compartilhados exigem QA editorial: podem representar variações legítimas do mesmo movimento, mas também podem esconder demonstração incorreta.

Essas contagens comprovam **cobertura de referência**, não playback validado. Nenhum dos 926 vídeos foi declarado reproduzível ou semanticamente correto apenas por possuir URL/ID.

Plano de QA de mídia antes de considerar a biblioteca validada:

1. abrir no app uma amostra estratificada dos 144 MP4 CloudFront, 21 URLs diretas YouTube e IDs YouTube da biblioteca;
2. revisar 100% dos 72 clusters de ID duplicado, comparando nome/variação do exercício com a demonstração;
3. verificar carregamento, play, mute, seek, retorno após suspensão e comportamento móvel;
4. conferir título completo, execução demonstrada, equipamento, lateralidade e variação;
5. registrar por exercício `approved|rejected|needs_review`, revisor, data e motivo;
6. corrigir somente após relatório de diff e autorização, sem substituir IDs em massa por similaridade de nome.

Foi identificado ainda um bug de integração: a tela do aluno consultava `youtube_video_id`, mas o descartava ao montar `videoMap`. A frente de UX corrigiu isso no commit `ad9a99a`, com teste de integração, além de preservar o título completo no modal/cartão.

## Parecer técnico

A revisão especializada aprovou a normalização apenas como **modelo de exposição fracionária de séries**, não como medida direta de estímulo ou distribuição biomecânica do LOAD. O default secundário 0,5 deve permanecer heurística explícita e versionada, sem ajuste automático de prescrição. Não se deve inferir pesos específicos por EMG isolada, anatomia intuitiva ou somar pai e filhos da taxonomia.

## Validações locais

- auditoria read-only executada novamente: reproduziu 926 exercícios, 1.390 alvos e todas as contagens deste relatório;
- testes-alvo Vitest (`volumeStats`, configuração atômica de alvos, segurança de integração e paridade de overrides): **23/23**;
- teste do auditor Node: **1/1**;
- `deno test .../volumeRules.test.ts`: **5/5**;
- `npx tsc --noEmit`: aprovado;
- `deno check` das funções `ai-prescribe-workout` e `ai-validate-prescription`: aprovado;
- `npm run build` (inclui `verify:backend`): aprovado;
- ESLint dos arquivos alterados: zero erros e zero warnings;
- suíte completa: **337/338 testes executados aprovados**, em 46 arquivos aprovados. A única falha de asserção (`deload` exigindo RIR `4-5` em todos os exercícios) foi reproduzida sem estas mudanças no commit-base `2a2a9f9`; não é regressão deste lote. Uma suíte adicional (`dietPdf`) não chegou a carregar no worktree por restrição do Vite ao `node_modules` compartilhado, enquanto o build completo passa.

A migration recebeu revisão estática e não foi aplicada a banco local ou remoto; sua execução permanece condicionada a autorização e validação em ambiente de homologação.

## Bloqueios para produção

- migration ainda não aplicada;
- nenhum bulk update de alvos autorizado;
- 716 exercícios de alvo único aguardam revisão de cobertura;
- 489 exercícios com metadata de segurança incompleta;
- 179 exercícios com IDs de vídeo compartilhados aguardam QA amostral/editorial.
