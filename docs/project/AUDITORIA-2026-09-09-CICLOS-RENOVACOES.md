# Auditoria de ciclos e renovacoes - 09/09/2026

## Escopo e evidencia

Consulta de producao no projeto canonico `zshrcgbyhzxpnlccssyz`, limitada a empresa
BN pelo slug e matriculas `active`, `awaiting_training` ou `awaiting_renewal`.
Inclui historico operacional; nao equivale a uma contagem de alunos ativos hoje.
Consulta reproduzivel: `scripts/audit-bn-cycle-renewals.sql` (somente leitura).
As referencias abaixo sao pseudonimos tecnicos, nao dados anonimos.

- 64 matriculas, 60 alunos, 312 ciclos nao substituidos.
- 22 alunos/matriculas com 72 pares sobrepostos.
- 14 matriculas possuem apenas sobreposicoes inteiramente anteriores a 09/09.
- 8 matriculas possuem ao menos um par atual/futuro sobreposto.
- Zero alunos com duas matriculas `active`/`awaiting_training` simultaneas.
- 22 matriculas terminam mais de 7 dias depois do ultimo ciclo visivel.
  Isso sinaliza revisao de vigencia; nao prova cobranca duplicada nem autoriza
  encurtar o periodo pago com base apenas nos ciclos existentes.
- Zero identificadores Asaas duplicados na tabela de pagamentos da BN.

## Casos com sobreposicao

| Matricula | Estado | Pares | Pares atuais/futuros | Pares de 1 dia |
| --- | --- | ---: | ---: | ---: |
| `3530d245ed22` | active | 6 | 3 | 3 |
| `2d93f08d4f16` | active | 3 | 3 | 3 |
| `93c4213741e0` | active | 6 | 2 | 5 |
| `d735907ca436` | active | 2 | 2 | 0 |
| `467cc79d6c5b` | active | 3 | 1 | 1 |
| `078e2d2b9409` | active | 1 | 1 | 0 |
| `5f9de190f3c7` | active | 1 | 1 | 0 |
| `7975a4d98a88` | active | 1 | 1 | 0 |
| `d389bc608edc` | active | 20 | 0 | 0 |
| `14b9857eb992` | awaiting_renewal | 7 | 0 | 1 |
| `df14c3d504f6` | active | 6 | 0 | 6 |
| `5d281f90c927` | active | 4 | 0 | 1 |
| `868b64104865` | awaiting_training | 2 | 0 | 0 |
| `99121ed7c350` | awaiting_renewal | 2 | 0 | 0 |
| `0f13e58e755f` | active | 1 | 0 | 0 |
| `5ae9920ce3fa` | active | 1 | 0 | 0 |
| `711a247b40da` | active | 1 | 0 | 0 |
| `7abd460affa5` | awaiting_renewal | 1 | 0 | 0 |
| `b7004e616eca` | active | 1 | 0 | 0 |
| `c6c818177b56` | active | 1 | 0 | 0 |
| `d9e31f3495bf` | awaiting_renewal | 1 | 0 | 0 |
| `ff5dc29279b7` | active | 1 | 0 | 0 |

## Planos somados

O commit `785fe54` corrigiu a geracao da renovacao para iniciar depois da
fronteira financeira, em vez de depois da cauda antiga de ciclos. A idempotencia
por pagamento permanece. Naquele momento, a renovacao ainda acrescentava o periodo
comprado ao fim financeiro existente quando ele estava no futuro; isso mantinha
dias pagos, mas tambem preservava uma data final legada possivelmente inflada.

O caso `6d6035153239` foi reparado: quatro ciclos renovados de 42 dias,
10/09/2026 a 24/02/2027, com historico e treinos preservados. A soma dos oito
ciclos no historico inclui quatro anteriores e quatro renovados.

O outro pagamento com lifecycle registrado, de 02/09, gerou cinco ciclos no
modelo antigo. Esses cinco ja estao substituidos pela quarentena anterior.
A matricula `2370076329b4` tem quatro ciclos visiveis de 03/09/2026 a 17/02/2027,
mas fim financeiro em 17/08/2027. Ha treino utilizado. A vigencia precisa ser
reconciliada com o contrato; nao foi alterada por esta auditoria.

Decisao de produto confirmada por Matheus em 09/09: a renovacao substitui o plano
atual, sem somar sua vigencia restante. O treino anteriormente publicado deve
continuar disponivel no app ate o professor publicar o novo. Implementacao publicada
em producao: nova matricula separada do historico e referencia explicita ao treino
anterior. Migrations `20260909165533`/`20260909165547` e Netlify
`6aa18fd8f0efb92020bd0577`, com QA independente aprovado. Detalhes em
`RENOVACAO-2026-09-09-SUBSTITUICAO.md`. As vigencias legadas acima nao foram
corrigidas retroativamente.

## Reagendamento

A RPC anterior verificava qualquer sobreposicao na matricula antes de avaliar
o ciclo escolhido e ordenava os ciclos pelo numero legado. Isso fazia conflitos
historicos bloquearem operacoes futuras validas e podia selecionar o antecessor
errado quando numeros importados nao seguiam as datas.

Correcao publicada em producao: migration `20260909160943` avalia cronologia e
colisao do conjunto efetivamente movido, preserva historico anterior e mantem
bloqueios de permissao, uso e colisao real. Tambem preserva o ciclo ativo anterior
quando o alvo e futuro, aceita no-op sem gravacao e rejeita datas invalidas.
Nao houve reparacao em massa de datas ou conteudo nesta etapa.

Validacao independente e canario comportamental:

- A funcao antiga falhou com o erro original sobre conflitos historicos.
- A funcao nova passou no banco real com fixtures sinteticos e rollback.
- Foram cobertos no-op, overlap/tie historico, numeros fora de ordem cronologica,
  ativo anterior preservado, colisao afetada, movimento para tras, tie afetado,
  negacao entre empresas, treino utilizado e limpeza de autorizacao de rebase.
- Nova leitura confirmou zero residuos em usuarios, empresas, alunos, matriculas,
  ciclos, treinos, sessoes e autorizacoes sinteticas.
- `anon` continua sem execute; usuarios autenticados seguem sujeitos ao guard
  de permissao da funcao.
- Rollback de codigo: `scripts/rollback-reschedule-chronological.sql`.

Isso corrige o bloqueio indevido causado por historico anterior; nao declara
resolvidos os 72 pares existentes. Os oito casos atuais/futuros exigem decisao
sobre o conteudo e as datas canonicas antes de reparacao individual.

## Fila preservada

O checklist integral permanece em
`RELATORIO-2026-08-27-FILA-ACUMULADA-SETT-BN.md`. Esta auditoria nao encerra os
casos com dependencias, referencias de exercicio, prescricoes ausentes, contatos
WhatsApp, videos, wearables, Sandbox adiado, staging ou revisao do motor.
