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
