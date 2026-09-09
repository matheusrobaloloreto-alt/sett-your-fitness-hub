# Auditoria dos oito conflitos atuais/futuros BN - 09/09/2026

## Escopo

Executor restrito aos oito conflitos atuais/futuros de ciclos BN. Auditoria inicial somente leitura e
reparo posterior de seis ciclos no Supabase PROD `zshrcgbyhzxpnlccssyz`, empresa `bn-performance-training`. Este relatório não cobre
Asaas nem as 22 vigências financeiras antigas, que ficam com a root.

Consulta reproduzível: `scripts/audit-bn-eight-current-conflicts.sql`.

Os identificadores abaixo são pseudônimos técnicos. Nomes, e-mails, telefones, CPF e URLs privadas
não foram gravados neste arquivo.

## Critério de classificação

- `Auto-corrigível`: reparo possível por regra determinística depois de backup, lock por tenant/aluno,
  snapshot antes/depois, dry-run e QA independente. Nenhum dado remoto foi alterado nesta fase.
- `Exige decisão`: há dois conteúdos reais concorrentes, vigência financeira fora do escopo, ou a
  escolha do ciclo canônico não é inferível com segurança só por logs/datas.
- `Fronteira 1d`: conflito inclusivo no mesmo dia de troca de ciclo; não é equivalência de treino.
- `Conteúdo usado`: há `workout_logs` ou `workout_sessions`; esse ciclo deve ser preservado como
  histórico visível.

## Resumo dos oito

| Aluno | Matrícula | Pares atuais/futuros | Dias sobrepostos | Uso real | Classificação |
| --- | --- | ---: | ---: | --- | --- |
| `c185b71eebc4` | `d735907ca436` | 2 | 42 | ciclo ativo com 10 logs | Auto-corrigível com cautela |
| `58ae9ed1ae96` | `2d93f08d4f16` | 3 | 3 | ciclo ativo com 39 logs e 3 sessões | Auto-corrigível |
| `a2b333166f30` | `3530d245ed22` | 3 | 12 | sem logs/sessões | Exige decisão |
| `810eb86647dd` | `078e2d2b9409` | 1 | 40 | conflito futuro sem uso; ciclo anterior tem uso fora do par | Auto-corrigível |
| `9b13411daadb` | `467cc79d6c5b` | 1 | 42 | sem uso no par; dois treinos enviados | Exige decisão |
| `c52d5aa0c08c` | `5f9de190f3c7` | 1 | 39 | ciclo ativo com 154 logs e 6 sessões | Auto-corrigível com cautela |
| `f84fb19bb252` | `7975a4d98a88` | 1 | 9 | sem logs/sessões | Exige decisão |
| `94573c61c69d` | `93c4213741e0` | 2 | 2 | ciclo ativo com 22 logs e 1 sessão | Auto-corrigível |

## Casos

### `c185b71eebc4` / `d735907ca436`

- Matrícula ativa `2026-09-01` a `2027-02-15`, plano semestral.
- Ciclo vazio/offline `Ciclo 1`, `2026-09-01` a `2026-10-12`, sobrepõe 40 dias o ciclo ativo.
- Ciclo ativo nomeado para outra pessoa, `2026-09-03` a `2026-10-14`, tem 4 treinos, 40 exercícios e
  10 logs; deve ser preservado.
- Ciclo vazio `Ciclo 2`, `2026-10-13` a `2026-11-23`, sobrepõe 2 dias o ciclo ativo.
- Alternativa segura: preservar o ciclo ativo usado; superseder/ajustar apenas ciclos vazios sem
  treinos/logs. Gate adicional: confirmar por fingerprint/UX que o nome errado do treino não causou
  entrega cruzada antes de qualquer reparo automático.

### `58ae9ed1ae96` / `2d93f08d4f16`

- Matrícula ativa `2026-03-09` a `2028-01-10`, plano anual.
- Três pares de fronteira de 1 dia: `2026-10-16`, `2026-11-27`, `2027-01-04`.
- O ciclo ativo tem 39 logs e 3 sessões; ciclos futuros têm conteúdo enviado, mas sem uso.
- Alternativa segura: corrigir fronteiras inclusivas apenas em ciclos futuros sem uso, preservando
  treinos e histórico.

### `a2b333166f30` / `3530d245ed22`

- Matrícula ativa `2026-02-19` a `2027-01-21`, plano Influenciador(a).
- Um conflito material de 10 dias entre ciclo ativo com 11 treinos/116 exercícios e ciclo futuro
  enviado com 3 treinos/31 exercícios.
- Dois conflitos adicionais são fronteiras de 1 dia entre ciclos futuros enviados.
- Não há logs/sessões; a escolha entre encerrar o ciclo ativo em `2026-09-06` ou iniciar o próximo em
  `2026-09-17` muda qual treino a aluna veria agora.
- Exige decisão de conteúdo/calendário antes de reparo.

### `810eb86647dd` / `078e2d2b9409`

- Matrícula ativa `2026-01-12` a `2026-12-14`, plano anual.
- Conflito de 40 dias entre placeholder vazio `2026-09-29` a `2026-11-09` e ciclo enviado `Cami 9`,
  `2026-10-01` a `2026-11-12`.
- O ciclo anterior usado encerra em `2026-09-28`; o par conflitante não tem logs/sessões.
- Alternativa segura: encerrar o placeholder vazio em `2026-09-30`, véspera do ciclo canônico
  `Cami 9`, mantendo o ciclo enviado e sem marcar histórico como `superseded`.

### `9b13411daadb` / `467cc79d6c5b`

- Matrícula ativa `2026-01-09` a `2026-12-11`, plano anual.
- Dois ciclos enviados começam em `2026-11-30`: um `Plano BN Engine` com 18 exercícios e outro `Ju 8`
  com 28 exercícios.
- O ciclo `Ju 8` termina em `2027-12-11`, muito além da matrícula atual, mas também possui conteúdo
  real.
- Exige decisão: a evidência técnica sugere erro de vigência ou duplicidade de geração, mas não define
  qual prescrição deve ser mantida.

### `c52d5aa0c08c` / `5f9de190f3c7`

- Matrícula ativa `2026-03-06` a `2027-07-23`, plano semestral.
- Ciclo antigo/completed `2026-08-31` a `2026-10-11`, 1 treino/7 exercícios, sem uso.
- Ciclo ativo `2026-09-03` a `2026-10-14`, 4 treinos/40 exercícios, 154 logs e 6 sessões; deve ser
  preservado.
- Alternativa segura: preservar o ciclo ativo usado e superseder/encerrar o ciclo antigo sem uso.
  Gate adicional: revisar o nome do ciclo ativo, que aponta para outra aluna.

### `f84fb19bb252` / `7975a4d98a88`

- Matrícula ativa `2025-12-12` a `2026-11-13`, plano anual.
- Conflito de 9 dias entre `Vi 7`, ativo/enviado, `2026-08-27` a `2026-10-16`, e ciclo futuro
  `2026-10-08` a `2026-11-18` com 6 treinos.
- Sem logs/sessões, mas ambos têm conteúdo real; o ciclo futuro também passa do fim financeiro atual.
- Exige decisão de calendário/contrato antes de reparo.

### `94573c61c69d` / `93c4213741e0`

- Matrícula ativa `2026-02-06` a `2027-01-08`, sem plano associado.
- Dois conflitos de fronteira de 1 dia: `2026-10-29` e `2026-12-10`.
- O ciclo ativo tem 22 logs e 1 sessão; ciclos futuros têm conteúdo enviado, mas sem uso.
- Alternativa segura: corrigir fronteiras inclusivas nos ciclos futuros sem uso, preservando histórico.

## Gates antes de qualquer reparo

1. Rodar `scripts/audit-bn-eight-current-conflicts.sql` e salvar snapshot local privado.
2. Confirmar zero alteração remota no dry-run e contar novamente oito conflitos atuais/futuros antes.
3. Para casos auto-corrigíveis: aplicar somente em ciclos vazios ou em início/fim de ciclo futuro sem
   logs/sessões; nunca alterar ciclo com `workout_logs`/`workout_sessions`.
4. Gravar auditoria com snapshot antes/depois e `batch_sha256`.
5. Recontar overlaps, treinos, logs e sessões após reparo.
6. QA independente com consulta read-only pós-reparo e teste de visibilidade do treino ativo.
7. Casos com dois conteúdos reais concorrentes só avançam após decisão explícita sobre ciclo canônico.

## Status

Aplicacao em producao concluida pela root na migration `20260909210329_repair_bn_three_safe_cycle_overlaps`,
apos GO independente e dry-run com rollback integral. Foram alteradas seis linhas em tres matriculas:
cinco fronteiras futuras de um dia e o fim de um placeholder vazio. Backup permanente privado em
`training_cycle_safe_overlap_repair_audit`, com before/after images e rollback fail-closed.

A verificacao imediata encontrou seis after-images exatas em tres matriculas. A revisao independente
pos-apply retornou GO: zero pares atuais/futuros nas tres reparadas, cinco matriculas com oito pares
remanescentes no tenant BN. Os 59 treinos, 142 logs, dez sessoes, tres matriculas e tres ciclos ativos
preservaram hashes integrais exatos. Owner dos seis alvos mais canonico correto; backup privado sob RLS.
Evidencia final em `AUDITORIA-2026-09-09-OITO-CONFLITOS-QA.md`. Nao houve novo smoke de UI autenticada;
a preservacao do treino foi verificada por dados, hashes e escopo das seis mudancas.
As oito classificacoes e contagens da tabela inicial representam o estado anterior ao reparo.

## Plano SQL preparado

Arquivos locais preparados:

- `scripts/repair-bn-eight-safe-cycles-dryrun.sql`: executa o mesmo fluxo do reparo dentro de uma
  transação e termina com `rollback`; executado em produção após STATICGO Anscombe.
- `scripts/repair-bn-eight-safe-cycles-apply.sql`: aplicado uma unica vez pela root com backup permanente em
  `training_cycle_safe_overlap_repair_audit`; repeticao e bloqueada pela repair_key e manifesto.
- `scripts/rollback-bn-eight-safe-cycles.sql`: restaura os ciclos a partir do backup, mas só se o
  hash atual ainda bater com o `after_sha256` gravado; falha fechado se alguém mexeu depois.

`beforeimagehash` calculado por SELECT read-only em produção:
`8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a`.

SHA-256 dos scripts para QA estática:

- `repair-bn-eight-safe-cycles-apply.sql`:
  `f9403ff70094fdad1d9478a0f9e3cf31f93637f3ec0ead27ab796c625583cf7f`.
- `repair-bn-eight-safe-cycles-dryrun.sql`:
  `f4f02915b99bc00195e00f19152721bf68e901b532a28bc6c9a7d929f3984a7f`.
- `rollback-bn-eight-safe-cycles.sql`:
  `9a6fd58a4b1778cd26b37a84e75ca267a70fa36190ae05be96fecc1fc44b6194`.

Revisão após apontamento da root: as contagens de `exercise_rows`, `workout_logs` e
`workout_sessions` foram separadas para evitar multiplicação por join caso algum alvo tenha logs no
futuro. O `beforeimagehash` acima foi recalculado com essa fórmula.

Validação local em scratch schema-only:

- `dryrun`: parseou, criou temporários, obteve locks e falhou fechado em
  `bn_safe_cycle_target_count_mismatch expected=6 actual=0`, esperado porque a scratch não contém os
  IDs reais.
- `apply`: parseou, criou auditoria local em transação, obteve locks e falhou fechado no mesmo gate
  de manifesto.
- `rollback`: depende da tabela pública de auditoria criada por um apply concluído; sem apply real,
  a scratch falha antes por ausência da tabela, como esperado.

Validação PROD dry-run após STATICGO Anscombe:

- Modo retornado: `DRY_RUN_ROLLBACK_ONLY`.
- `repair_key`: `bn_eight_safe_cycles_20260909`.
- `beforeimagehash`: `8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a`.
- `changed_cycles`: `6`.
- Pós-rollback read-only: tabela pública de auditoria ausente, resíduo `0`, `target_count=6`,
  `before_state_restored=true`.

### Alvos do plano seguro

| Matrícula | Ciclo | Ação | Gate principal |
| --- | --- | --- | --- |
| `2d93f08d4f16` | `24b181831b95` | `start_date` `2026-10-16` -> `2026-10-17` | futuro, pending, sem logs/sessões |
| `2d93f08d4f16` | `120347c569b4` | `start_date` `2026-11-27` -> `2026-11-28` | futuro, pending, sem logs/sessões |
| `2d93f08d4f16` | `d28979e23b2d` | `start_date` `2027-01-04` -> `2027-01-05` | futuro, pending, sem logs/sessões |
| `078e2d2b9409` | `0728d0cffd1f` | `end_date` `2026-11-09` -> `2026-09-30` | placeholder vazio: zero treinos, logs, sessões e dependências; canônico começa `2026-10-01` |
| `93c4213741e0` | `079fed89fe2a` | `start_date` `2026-10-29` -> `2026-10-30` | futuro, pending, sem logs/sessões/intercycle; preserva bundles/planos |
| `93c4213741e0` | `9fe14bd06b5e` | `start_date` `2026-12-10` -> `2026-12-11` | futuro, pending, sem logs/sessões |

### Dependências e leitura do app

- O app do aluno filtra ciclos `superseded` e `superseded_by_cycle_id`, e não mostra treinos futuros
  antes da data de início. Portanto o plano não apaga histórico nem libera treino antes da vigência.
- A RPC `reschedule_training_cycles_from` não foi usada porque desloca `enrollments.end_date`. O plano
  não altera `enrollments`, pagamentos, Asaas, workouts, logs ou sessões.
- O trigger `reconcile_intercycle_delivery_for_cycle_change` roda em update de `training_cycles`. Os
  seis alvos foram checados: não há anamneses/intercycle/invites/waivers vinculados a eles.
- O ciclo `079fed89fe2a` possui dependências de prescrição (`ai_plan_versions`, `ai_strength_plans`,
  `running_plans`, `prescription_bundles`, `prescription_bundle_items`), mas não tem uso real nem
  intercycle. Por isso o plano só muda `start_date`; não mexe em conteúdo nem FKs.

### Casos fora do plano seguro

- `3530d245ed22`: decisão de calendário/conteúdo pendente.
- `467cc79d6c5b`: dois ciclos enviados no mesmo início; precisa escolher prescrição canônica.
- `7975a4d98a88`: dois ciclos com conteúdo real e possível dependência financeira.
- `5f9de190f3c7`: fora deste lote por cautela tecnica; tem alias/nome de outro aluno e histórico real usado.
- `d735907ca436`: só pode entrar em etapa posterior se QA excluir conflito de template/entrega cruzada.
