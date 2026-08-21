# MFIT → SETT/BN — relatório sanitizado de prontidão

**Data:** 2026-08-14
**Modo:** Chrome autenticado em leitura + dry-run local contra o banco canônico. Nenhum `--apply`, INSERT/UPDATE/DELETE remoto, migration, deploy ou push foi executado.

## Decisão executiva

**NO-GO para aplicar.** A extração das fichas ativas e o dry-run real foram concluídos e são reproduzíveis. A baseline encontrou **131 de 313 nomes distintos (41,85%)** por correspondência exata. Após reconciliação com o QA biomecânico, somente **37 aliases** permaneceram em alta confiança, elevando a cobertura para **168 de 313 (53,67%)**. Permanecem 143 nomes ausentes e 2 nomes ambíguos. O migrador continua falhando fechado: **46 planos bloqueados, zero operações candidatas e zero escrita**.

Não é seguro trocar a regra por fuzzy match: sem um mapa revisado, exercícios semanticamente diferentes podem ser associados silenciosamente.

## Escopo SETT/BN confirmado

| Métrica | Total |
|---|---:|
| Alunos na empresa | 69 |
| Alunos com status ativo | 53 |
| Matrículas operacionais ativas | 61 |
| Alunos elegíveis (aluno + matrícula ativos) | **48** |
| Ativos sem matrícula operacional | 5 |
| Matrículas ativas cujo aluno não está ativo | 9 |
| Exercícios visíveis (globais + BN) | 926 |

O contrato de elegibilidade usado foi `students.status IN ('active', 'awaiting_renewal')` e `enrollments.status IN ('active', 'awaiting_training', 'awaiting_renewal')`, sempre limitado à BN Performance Training. Nenhuma PII foi persistida no repositório ou neste relatório.

## Matching de alunos

Dos 48 elegíveis:

- **37 matches determinísticos**: 14 por telefone+e-mail, 21 por telefone e 2 por e-mail;
- 4 casos ambíguos, bloqueados;
- 7 sem correspondência;
- zero fuzzy match.

Os arquivos-fonte permaneceram fora do Git, com permissão local restrita. Hashes de integridade:

- clientes MFIT: `07933bfd5a61c8ecc6c32d15ce5704bcf30af9ecccb164e281083bb4606b5c2b`;
- matching consolidado: `18a09eaae22d3d1786fb58bbc180ee126ffa722233de04681646bc1d588941b9`;
- fichas ativas consolidadas: `6376f8576828a77a5848d58301cb7f6b2a34bfe95d87aec3b13538d94ec4b5f7`.

## Extração das fichas ativas

A navegação usou exclusivamente o Chrome já autenticado e ações read-only. A inspeção final recuperou sessões que inicialmente pareciam vazias porque a interface exigia `Expandir todos` antes de expor os exercícios.

| Métrica | Total |
|---|---:|
| Clientes com alguma ficha encontrada | 24 |
| Clientes com plano utilizável | 21 |
| Planos brutos | 47 |
| Planos ativos normalizados | 46 |
| Sessões | 164 |
| Ocorrências de exercícios | 1.269 |
| Sessões comprovadamente vazias após retry | 2 |
| Erros técnicos | 0 |
| IDs de cliente duplicados | 0 |

Somente prescrições ativas foram coletadas. Histórico concluído não foi incluído.

## Dry-run real e determinismo

O migrador foi executado duas vezes, sem `--apply`, com data de referência fixa `2026-08-14` e as mesmas fontes:

| Resultado | Dry-run 1 | Dry-run 2 |
|---|---:|---:|
| Alunos SETT elegíveis | 48 | 48 |
| Clientes MFIT no matching | 37 | 37 |
| Planos ativos | 46 | 46 |
| Nomes distintos necessários | 313 | 313 |
| Matches exatos no catálogo | 131 | 131 |
| Nomes ausentes | 180 | 180 |
| Nomes ambíguos | 2 | 2 |
| Cobertura | 41,85% | 41,85% |
| Planos bloqueados | 46 | 46 |
| Operações candidatas | 0 | 0 |

Após o hardening fail-closed de status e a releitura pré-apply, o dry-run foi repetido mais duas vezes. Removido apenas o timestamp `generated_at`, ambos geraram o mesmo SHA-256: `deaa32881fa8d83cf4014d8d3bd64b0d45a831d00e06f8503daabc9c370a98ad`.

## Atualização de aliases — 2026-08-17

O mapa versionado `docs/project/mfit-exercise-aliases.v1.json` contém somente nomes de exercícios e declara `contains_pii: false`. A revisão nominal inicial marcou 51 candidatos como `high`; a reconciliação biomecânica rebaixou 13 para média e bloqueou 1 como baixa. Os 14 rebaixamentos cobrem 34 ocorrências e permanecem inertes no mapa para auditoria:

| Classe | Quantidade | Decisão |
|---|---:|---|
| Alta confiança | 37 | Alias aprovado para dry-run |
| Média confiança | 52 | Bloqueado até conferência visual/técnica adicional |
| Baixa confiança | 28 | Bloqueado |
| Sem candidato sustentável | 63 | Bloqueado |
| Match exato ambíguo | 2 | Bloqueado até deduplicação/decisão humana |

O migrador aceita o mapa somente por `--exercise-aliases`. Cada alias executável precisa estar marcado como `approved` e `high`, ter fonte única após normalização e apontar para um `exercise_id` visível cujo nome ainda corresponda exatamente ao nome alvo versionado. Linhas `needs_review`/`blocked` são ignoradas e não entram no índice executável. Alias aprovado removido, renomeado, invisível ou fora do contrato bloqueia o lote.

Dois novos dry-runs read-only, com a mesma fonte e a mesma data de referência, produziram resultados operacionais idênticos:

| Resultado | Dry-run alias 1 | Dry-run alias 2 |
|---|---:|---:|
| Nomes necessários | 313 | 313 |
| Matches exatos + aliases | 168 | 168 |
| Matches por alias aprovado | 37 | 37 |
| Ausentes | 143 | 143 |
| Ambíguos | 2 | 2 |
| Aliases inválidos | 0 | 0 |
| Cobertura | 53,67% | 53,67% |
| Planos bloqueados | 46 | 46 |
| Operações candidatas | 0 | 0 |

Removido apenas `generated_at`, os dois relatórios pós-QA geraram o mesmo SHA-256: `9010427ebe269b4869c92ab56c341f154a107e111c7bcc4f04c4b3f48ac50f46`. Os arquivos operacionais continuam fora do Git e com permissão `0600`.

## Garantias já implementadas no migrador

1. Tenant e atividade validados de forma fail-closed.
2. Matching determinístico por telefone/e-mail/nome exato único; contradições e ambiguidades bloqueiam.
3. Somente fichas explicitamente ativas; status ausente/desconhecido ou histórico concluído não entra.
4. Preserva sessões, ordem, séries, repetições, carga, descanso, cadência, observações, métodos, grupos/bi-sets, alternativas e mídia.
5. Exige 100% de cobertura determinística do catálogo para o lote; não cria exercícios.
6. Append-only com IDs determinísticos; não sobrescreve treino SETT materializado.
7. Idempotência e divergência parcial cobertas por testes.
8. Relatórios sanitizados, sem PII.
9. Imediatamente antes de qualquer escrita, o migrador relê aluno e matrícula no banco vivo e bloqueia mudança de status, empresa ou ownership.

## Validações

- `node --test scripts/mfit-active-workouts-migration.test.mjs`: **31/31 aprovados**, incluindo mudança viva de status/empresa, linhas de revisão inertes, validação do mapa e bloqueio de alias obsoleto ou invisível.
- Dois dry-runs reais idênticos no conteúdo operacional.
- Extração reaberta e verificada após o falso bloqueio de sessões recolhidas pela interface.
- Nenhuma mutação remota foi solicitada pelo migrador.

## Riscos e próxima ação

Risco principal: 145 nomes ainda não têm resolução segura — 52 candidatos médios, 28 baixos, 63 sem candidato e 2 exatos ambíguos. O próximo passo é conferir os candidatos médios por vídeo/execução e decidir se faltam variantes reais no catálogo; itens sem evidência permanecem bloqueados. A inconsistência grave dos targets de `Rosca Scott Barra` deve ser corrigida/inspecionada antes de qualquer reconsideração desse alias.

Somente depois de obter 100% de cobertura e repetir o dry-run devem ser avaliados backup e aplicação em lotes pequenos. Qualquer `--apply` continua condicionado a autorização explícita.

## Checkpoint de aceleração — 2026-08-20

Os dois matches exatos ambíguos receberam revisão independente baseada em evidência versionada:

- `Levantamento Terra`: as duas linhas usam a mesma demonstração; foi escolhido o registro canônico já ligado à curadoria, enquanto a duplicata está sem metadata e sem alvo primário;
- `Agachamento Bulgaro`: as duas linhas usam a mesma demonstração; foi escolhido o registro já ligado aos alvos musculares e à curadoria, enquanto a duplicata está sem metadata e sem alvo primário.

Os overrides são explícitos (`match_scope=ambiguous_exact_override`), exigem `independent_review_status=approved` e continuam falhando fechado se o alvo não pertencer ao conjunto exato de duplicatas. O mapa agora contém 39 aliases executáveis e zero ambiguidade exata pendente. Isso projeta 170/313 nomes resolvidos, mas a nova cobertura só será declarada depois de repetir o dry-run real com os snapshots operacionais privados.

Validação local: **35/35 testes** do migrador. A fila média permanece com 52 itens; 51 ainda exigem evidência visual/técnica. Nenhum apply ou escrita remota foi executado.

### Evidência visual adicional

O Chrome autenticado foi reaberto em modo read-only e o vídeo de `Elevação de Quadril Unilateral` foi inspecionado quadro a quadro. A demonstração mostra ponte de glúteo unilateral no solo, sem implemento e com uma perna elevada; movimento, suporte, lateralidade e configuração correspondem ao alvo `Ponte de glúteo unilateral` do SETT. O alias foi promovido a `approved/high` com evidência e revisão independente.

Estado projetado do próximo dry-run: 40 aliases executáveis, 171/313 nomes resolvidos e 142 ainda sem resolução. A fila de evidência continua com 52 registros históricos, mas apenas 51 seguem pendentes de decisão e 50 ainda não possuem mídia MFIT observada. Os números operacionais continuam condicionados à repetição do dry-run real com os snapshots privados.

### Segundo lote visual read-only

Foram coletadas demonstrações adicionais para `Mobilidade de Tornozelo Semi Ajoelhado` e `Abdução de Quadril Máquina`. A primeira mostra avanço do joelho sobre o pé em posição semi-ajoelhada, sem implemento; a segunda mostra abdução bilateral sentada em máquina, com quadril próximo de 90°. As duas evidências apoiam os alvos propostos, mas permanecem `runtime_eligible=false` e `independent_review_status=pending` até um segundo revisor confirmar a equivalência.

A fila agora contém mídia MFIT em 4/52 itens; 48 ainda não têm mídia observada. Como nenhuma das duas novas linhas foi promovida, a projeção executável permanece em 40 aliases, 171/313 nomes resolvidos e 142 não resolvidos.

### Terceira evidência visual read-only

O vídeo público associado ao `media_id=569` foi recuperado e inspecionado em frames do início e da fase de puxada. A demonstração de `Puxada Neutra triangulo` mostra puxada vertical sentada na polia, bilateral, com pegada neutra em acessório triangular e apoio para as coxas. Isso sustenta o candidato `Puxada Neutra Polia`, mas a perda do detalhe do acessório no nome genérico ainda exige segundo revisor.

A linha passou de `needs_evidence` para `awaiting_independent_review`, mantendo `runtime_eligible=false`. A fila permanece com mídia em 4/52 itens, agora todos os quatro com vídeo acessível; são 3 aguardando revisão independente, 48 ainda sem evidência visual e apenas 1 alias executável. Nenhuma promoção ou escrita remota foi realizada.

### QA independente do lote visual

O segundo revisor auditou os três casos com mídia completa. Apenas `Abdução de Quadril Máquina` → `Cadeira Abdutora 90` atingiu equivalência determinística: a demonstração preserva movimento, máquina, postura sentada, apoio, bilateralidade e quadril próximo de 90°. O alias foi registrado como `approved/high` com `independent_review_status=approved`. Isso não aprova a curadoria clínica/prescritiva do alvo SETT, cujos metadados continuam em revisão separada.

`Puxada Neutra triangulo` → `Puxada Neutra Polia` e `Mobilidade de Tornozelo Semi Ajoelhado` → `Mobilidade de Tornozelo` permanecem bloqueados: os alvos genéricos ainda não provam, respectivamente, o acessório triangular/V-bar fechado e a postura semi-ajoelhada. Ambos passaram a `needs_more_evidence`, continuam `runtime_eligible=false` e exigem evidência do alvo ou um alvo específico.

Estado projetado do próximo dry-run: 41 aliases executáveis, 172/313 nomes resolvidos e 141 não resolvidos. A fila histórica mantém 52 itens; 2 estão aprovados, 2 possuem mídia mas ainda precisam de evidência do alvo e 48 ainda não possuem mídia observada. Não havia snapshots operacionais privados atuais no worktree ou diretórios temporários para repetir o dry-run real; nenhum apply ou escrita remota foi executado.

### Lote independente MFIT/SETT — 7 aliases visuais aprovados

QA biomecânica independente aprovou mais 7 aliases por evidência visual, sem curadoria de metadados do alvo SETT e sem escrita remota. Para cada linha, o MP4 público respondeu 200, o thumbnail foi observado, `observed_via=authenticated_read_only_browser`, `observed_at=2026-08-20`, `independent_review_status=approved`, `current_confidence=high`, `decision_status=approved_after_visual_review` e `runtime_eligible=true`.

| Source MFIT | `media_id` | Target SETT | Base factual da aprovação |
|---|---:|---|---|
| `Abdução de Quadril Unilateral com Caneleira` | 25 | `Abdução de Quadril com Caneleira` | Abdução unilateral de quadril com caneleira; diferença de suporte/postura aceita apenas para migração histórica. |
| `Puxada Aberta Barra reta` | 565 | `Puxada Pronada Polia` | Puxada vertical sentada na polia, barra longa, pegada aberta/pronada e apoio para coxas. |
| `Remada Baixa Triangulo` | 576 | `Remada Baixa Neutra` | Remada baixa sentada na polia com puxador triangular/fechado e pegada neutra. |
| `Pulldown Barra Reta` | 1104 | `Pulldown barra` | Pulldown de braços estendidos em polia alta com barra reta. |
| `Face Pull` | 1110 | `Face Pull Corda` | Face pull em pé na polia alta com corda, trajetória em direção à face. |
| `Tríceps na Polia com Barra Reta` | 415 | `Tríceps Polia Barra` | Extensão de cotovelo em pé na polia com barra curta reta. |
| `Flexão de Braços com Apoio` | 239 | `Flexão Aberta com Apoio do Joelho` | Flexão de braços no solo com joelhos apoiados e mãos em largura aberta/moderada. |

`Bom dia com Cabo de Vassoura` permanece bloqueado: a ocorrência visual observada era apenas `Bom Dia`, sem prova do implemento cabo de vassoura.

Estado projetado do próximo dry-run: 48 aliases executáveis, 179/313 nomes resolvidos e 134 não resolvidos. O mapa versionado projeta `approved_aliases=48`, `pending_medium=43` e `unresolved_total=134`; a fila de evidência projeta 11 itens com mídia observada e 41 ainda em `needs_more_evidence`. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### QA P0 MFIT/SETT — 2 aliases aprovados e 1 bloqueado

QA biomecânica independente revisou mais 3 candidatos P0 com mídia pública 200, thumbnail observado, `observed_via=authenticated_read_only_browser` e `observed_at=2026-08-20`.

| Source MFIT | `media_id` | Target SETT | Decisão | Base factual |
|---|---:|---|---|---|
| `Crucifixo Inverso com Halteres` | 215 | `Crucifixo Invertido Curvado` | `approved/high` | Crucifixo inverso curvado em pé com halteres; o vídeo SETT demonstra postura curvada com halteres. |
| `Ativação de Glúteo com Elevação Pélvica` | 1065 | `Ponte de glúteo` | `approved/high` | Ponte bilateral no solo, peso corporal e sem implemento; o vídeo SETT demonstra ponte bilateral no solo. |
| `Remada Fechada Unilateral` | 638 | `Remada Baixa Neutra Unilateral` | `needs_more_evidence` | Movimento baixo e lateralidade batem parcialmente, mas resistência elástica em pé difere materialmente de cabo sentado. |

`Remada Fechada Unilateral` permanece `runtime_eligible=false` e `independent_review_status=needs_more_evidence`; ela não entrou no mapa executável.

Estado projetado do próximo dry-run: 50 aliases executáveis, 181/313 nomes resolvidos e 132 não resolvidos. O mapa versionado projeta `approved_aliases=50`, `pending_medium=41` e `unresolved_total=132`; a fila de evidência projeta 14 itens com mídia observada e 38 ainda em `needs_more_evidence`. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### QA visual P1 MFIT/SETT — 4 aliases aprovados e 2 bloqueados

QA visual read-only revisou 6 candidatos P1 pela biblioteca MFIT autenticada, sem clicar `Adicionar ao treino`. Cada busca retornou heading exato para o card usado; variantes exibidas foram ignoradas. Todos os MP4s públicos responderam 200, os thumbnails foram observados, `observed_via=authenticated_read_only_browser` e `observed_at=2026-08-20`.

| Source MFIT | `media_id` | Target SETT | Decisão | Base factual |
|---|---:|---|---|---|
| `Deslocamento Lateral com Elástico` | 1085 | `Caminhada lateral com mini band` | `approved/high` | Deslocamento lateral com mini band/elástico nos membros inferiores, em postura semi-agachada. |
| `Tríceps Testa Barra Reta` | 558 | `Tríceps Testa Barra Banco Reto` | `approved/high` | Tríceps testa deitado em banco reto com barra reta. |
| `Agachamento Lateral Alternado` | 49 | `Cossack squat` | `approved/high` | Agachamento lateral profundo alternado, peso corporal, base ampla e uma perna estendida. |
| `Remada Máquina (Pegada Neutra)` | 540 | `Remada Cavalinho Máquina Neutra` | `approved/high` | Remada em máquina sentada com pegada neutra, suporte anterior e trajetória horizontal. |
| `Agachamento Sumô no Step com Halteres` | 78 | `Agachamento Sumô Halter` | `needs_more_evidence` | Source usa steps bilaterais, aumentando ROM; alvo observado é sumô com halter no solo, sem step. |
| `Abdominal Infra com as Pernas Flexionadas` | 332 | `Abdominal Infra Solo` | `needs_more_evidence` | Source preserva joelhos/pernas flexionadas; alvo observado usa pernas estendidas, mudando alavanca e dificuldade. |

Os dois bloqueados permanecem `runtime_eligible=false` e `independent_review_status=needs_more_evidence`; eles não entraram no mapa executável.

Estado projetado do próximo dry-run: 54 aliases executáveis, 185/313 nomes resolvidos e 128 não resolvidos. O mapa versionado projeta `approved_aliases=54`, `pending_medium=37` e `unresolved_total=128`; a fila de evidência projeta 20 itens com mídia observada e 32 ainda sem mídia observada. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### Materialização P2 — 4 APPROVE_ALIAS recebidos

Foram materializados somente os 4 `APPROVE_ALIAS` explicitamente aprovados no handoff, com evidência sanitizada de revisão independente (`evidence_type=sanitized_independent_review_handoff`), `independent_review_status=approved`, `current_confidence=high`, `decision_status=approved_after_visual_review` e `runtime_eligible=true`. Nenhuma curadoria clínica/prescritiva ou metadado do alvo SETT foi alterado.

| Source MFIT | Target SETT | Base factual sanitizada |
|---|---|---|
| `Abdução de Quadril em Pé com Caneleira` | `Abdução de Quadril com Caneleira` | Abdução de quadril e caneleira preservadas; postura em pé registrada como diferença aceita apenas para migração histórica. |
| `Abdução de Quadril na Polia Baixa Unilateral` | `Abdução de Quadril Polia` | Abdução de quadril, cabo/polia e unilateralidade preservadas; altura baixa registrada como diferença nominal aceita apenas para migração histórica. |
| `Crucifixo com Halteres` | `Crucifixo Reto Halteres` | Crucifixo e halteres preservados; alvo reto resolve a ausência de ângulo inclinado/declinado explícito. |
| `Puxada Articulada Aberta` | `Puxada Pronada Máquina` | Padrão de puxada, máquina e intenção aberta/pronada preservados; máquina articulada registrada como diferença aceita apenas para migração histórica. |

Permanecem bloqueados e fora do mapa executável: `Abdominal Supra no Solo Pés Altos`, `Bom dia com Cabo de Vassoura`, `Desenvolvimento Barra Reta` e `Remada Alta na Polia Alta com Corda`.

Estado projetado do próximo dry-run: 58 aliases executáveis, 189/313 nomes resolvidos e 124 não resolvidos. O mapa versionado projeta `approved_aliases=58`, `pending_medium=33` e `unresolved_total=124`; a fila de evidência projeta 24 itens com evidência MFIT/revisão e 28 ainda sem resolução suficiente. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### Materialização P2 Batch B — 4 APPROVE_ALIAS recebidos

Foram materializados somente os 4 `APPROVE_ALIAS` explicitamente aprovados no handoff Batch B, com evidência sanitizada de revisão independente (`evidence_type=sanitized_independent_review_handoff`), `independent_review_status=approved`, `current_confidence=high`, `decision_status=approved_after_visual_review` e `runtime_eligible=true`. Nenhuma curadoria clínica/prescritiva ou metadado do alvo SETT foi alterado.

| Source MFIT | Target SETT | Base factual sanitizada |
|---|---|---|
| `Remada Curvada com Barra Reta (Pegada Pronada)` | `Remada Curvada Pronada Barra` | Remada curvada com barra reta e pegada pronada preserva movimento, implemento e pegada para migração histórica. |
| `Remada Curvada com Barra Reta (Pegada Supinada)` | `Remada Curvada Supinada Barra` | Remada curvada com barra reta e pegada supinada preserva movimento, implemento e pegada para migração histórica. |
| `Rosca direta Banco Inclinado` | `Rosca Banco 45` | Rosca direta em banco inclinado preserva flexão de cotovelo e suporte inclinado no alvo SETT. |
| `Abdominal Infra com as Pernas Estendidas` | `Abdominal Infra Solo` | Abdominal infra no solo com pernas estendidas preserva padrão, suporte e alavanca do alvo SETT. |

Permanecem bloqueados e fora do mapa executável: `Remada Fechada com Halteres no Banco Inclinado`, `Rosca Direta Barra Reta`, `Abdominal com Rodinha Solo com Apoio` e `Afundo Alternado Smith`. Os dois primeiros e o abdominal seguem como revisão média não elegível no arquivo; `Afundo Alternado Smith` não possui alias executável nem item de evidência materializado no mapa local.

Estado projetado do próximo dry-run: 62 aliases executáveis, 193/313 nomes resolvidos e 120 não resolvidos. O mapa versionado projeta `approved_aliases=62`, `pending_medium=29` e `unresolved_total=120`; a fila de evidência projeta 28 itens com evidência MFIT/revisão e 24 ainda sem resolução suficiente. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### Materialização P2 Batch C — 2 APPROVE_ALIAS recebidos

Foram materializados somente os 2 `APPROVE_ALIAS` explicitamente aprovados no handoff Batch C, com evidência sanitizada de revisão independente (`evidence_type=sanitized_independent_review_handoff`), `independent_review_status=approved`, `current_confidence=high`, `decision_status=approved_after_visual_review` e `runtime_eligible=true`. Nenhuma curadoria clínica/prescritiva ou metadado do alvo SETT foi alterado.

| Source MFIT | Target SETT | Base factual sanitizada |
|---|---|---|
| `Desenvolvimento no Smith` | `Desenvolvimento Sentado Smith` | Desenvolvimento no Smith preserva empurrar vertical guiado, barra/máquina Smith e suporte sentado no alvo SETT. |
| `Prancha Isometrica com Trx` | `Prancha com pés no TRX` | Prancha isométrica com TRX preserva isometria de core, suspensão TRX e suporte com pés no TRX no alvo SETT. |

Permanecem bloqueados e fora do mapa executável: `Barra Fixa Gráviton (Pegada Aberta)`, `Desenvolvimento com Halteres (Pegada Neutra)`, `Encolhimento de Ombros no Smith Pela Frente` e `Remada Alta com Barra W`. Permanecem não revisados/sem decisão materializada: `Remada Alta na Polia Baixa com Barra Reta` e `Remada Curvada com Carga (Pegada Neutra)`.

Estado projetado do próximo dry-run: 64 aliases executáveis, 195/313 nomes resolvidos e 118 não resolvidos. O mapa versionado projeta `approved_aliases=64`, `pending_medium=27` e `unresolved_total=118`; a fila de evidência projeta 30 itens com evidência MFIT/revisão e 22 ainda sem resolução suficiente. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### Materialização P2 Batch D — 2 APPROVE_ALIAS recebidos

Foram materializados somente os 2 `APPROVE_ALIAS` explicitamente aprovados no handoff Batch D, com evidência sanitizada de revisão independente (`evidence_type=sanitized_independent_review_handoff`), `independent_review_status=approved`, `current_confidence=high`, `decision_status=approved_after_visual_review` e `runtime_eligible=true`. Nenhuma curadoria clínica/prescritiva ou metadado do alvo SETT foi alterado.

| Source MFIT | Target SETT | Base factual sanitizada |
|---|---|---|
| `Remada Alta na Polia Baixa com Barra Reta` | `Remada Alta Polia` | Remada alta, cabo/polia e barra reta preservados; altura baixa registrada como diferença aceita apenas para migração histórica. |
| `Remada Curvada com Carga (Pegada Neutra)` | `Remada Curvada Halteres Neutra` | Remada curvada e pegada neutra preservadas; `carga` foi resolvida para halteres neutros apenas pelo handoff aprovado. |

Permanecem bloqueados e fora do mapa executável: `Barra Fixa Gráviton (Pegada Aberta)`, `Desenvolvimento com Halteres (Pegada Neutra)`, `Encolhimento de Ombros no Smith Pela Frente`, `Remada Alta com Barra W`, `Remada Alta na Polia Alta com Corda` e `Remada Fechada com Halteres no Banco Inclinado`.

Estado projetado do próximo dry-run: 66 aliases executáveis, 197/313 nomes resolvidos e 116 não resolvidos. O mapa versionado projeta `approved_aliases=66`, `pending_medium=25` e `unresolved_total=116`; a fila de evidência projeta 32 itens com evidência MFIT/revisão e 20 ainda sem resolução suficiente. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### Materialização P2 Batch E — 3 APPROVE_ALIAS recebidos e 1 conflito preservado

Foram materializados somente 3 dos 4 `APPROVE_ALIAS` do handoff Batch E, com evidência sanitizada de revisão independente (`evidence_type=sanitized_independent_review_handoff`), `independent_review_status=approved`, `current_confidence=high`, `decision_status=approved_after_visual_review` e `runtime_eligible=true`. Nenhuma curadoria clínica/prescritiva ou metadado do alvo SETT foi alterado.

| Source MFIT | Target SETT | Base factual sanitizada |
|---|---|---|
| `Rosca Direta na Polia (Barra Reta)` | `Rosca Direta Polia Barra` | Rosca direta na polia com barra reta preserva flexão de cotovelo, cabo/polia e barra no alvo SETT. |
| `Sobe/Desce no Banco` | `Subida no caixote (step-up)` | Sobe/desce no banco preserva o padrão de step-up do alvo SETT; a diferença banco/caixote fica aceita apenas para migração histórica. |
| `Supino Máquina Inclinado (Pegada Neutra)` | `Supino Inclinado Máquina` | Supino inclinado em máquina preserva empurrar inclinado e máquina; pegada neutra fica aceita apenas para migração histórica. |

`Afundo Alternado no Smith` → `Afundo Smith` permanece bloqueado: há conflito com revisão anterior do Batch B, que havia mantido a linha fora do runtime por alternância/sequência/lateralidade. O alias segue `runtime_eligible=false`, `decision_status=blocked_after_visual_review` e `conflict_status=blocked_conflict`.

Estado projetado do próximo dry-run: 69 aliases executáveis, 200/313 nomes resolvidos e 113 não resolvidos. O mapa versionado projeta `approved_aliases=69`, `runtime_false_medium=22`, `blocked_after_visual_review=21`, `approved_pending_materialization=1`, `pending_medium=0`, `never_reviewed_medium=0` e `unresolved_total=113`. A fila de evidência mantém 35 itens com evidência MFIT/revisão, mas separa bloqueio visual de próxima revisão: 21 itens ficam `blocked_after_visual_review`, 1 item (`Tríceps Testa com Halteres` → `Tríceps Testa Halteres Banco Reto`) fica `approved_pending_materialization` sem alias criado, e nenhum item permanece `never_reviewed`. O dry-run real continua bloqueado até snapshots operacionais privados atuais estarem presentes; nenhum `--apply`, DB write ou dado pessoal foi usado.

### Saneamento do ledger médio — 2026-08-21

O ledger documental deixou de usar `pending_medium=22` como mistura de bloqueio runtime. A semântica atual é explícita:

| Campo | Valor | Semântica |
|---|---:|---|
| `runtime_false_medium` | 22 | Total médio ainda fora do runtime. |
| `blocked_after_visual_review` | 21 | Revisado visualmente e bloqueado com razão/proveniência sanitizada. |
| `approved_pending_materialization` | 1 | Revisado visualmente e aprovado para materialização futura, sem alias criado neste commit. |
| `pending_medium` | 0 | Próximos lotes não devem reselecionar itens já revisados. |
| `never_reviewed_medium` | 0 | Não há item médio sem primeira revisão após o checkpoint do Chrome. |

Compatibilidade runtime preservada: somente aliases `approved/high` continuam executáveis; `blocked_after_visual_review` e `approved_pending_materialization` permanecem `runtime_eligible=false` e fora do índice de aliases do migrador.

### Materialização final do aprovado pendente — 2026-08-21

`Tríceps Testa com Halteres` → `Tríceps Testa Halteres Banco Reto` foi materializado após revisão independente sanitizada (`contains_pii=false`) aprovar execução em banco reto com dois halteres, bilateral, preservando extensão de cotovelo/testa com halteres. O alias entrou no runtime apenas como `approved/high`; a linha histórica do ledger passou para `decision_status=approved_after_visual_review`, `runtime_eligible=true` e `observed_via=independent_review_handoff`.

Estado projetado do próximo dry-run: 70 aliases executáveis, 201/313 nomes resolvidos e 112 não resolvidos. O mapa versionado projeta `approved_aliases=70`, `runtime_false_medium=21`, `blocked_after_visual_review=21`, `approved_pending_materialization=0`, `pending_medium=0`, `never_reviewed_medium=0` e `unresolved_total=112`. A fila de evidência passa a 36 itens com evidência MFIT/revisão materializada. O dry-run real continua condicionado aos snapshots operacionais privados atuais; nenhum `--apply`, DB write, fuzzy matching, target-curation ou dado pessoal foi usado nesta materialização.
