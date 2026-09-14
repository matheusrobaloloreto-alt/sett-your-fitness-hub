# Reparo BN de exercise_id orfaos - 2026-09-14

## Veredito

Reparo conservador concluido em producao. Somente os 184 IDs classificados como `restauravel` por evidencia deterministica foram recriados na `exercise_library`; workouts, ciclos, logs e sessoes nao foram alterados.

## Resultado

- Antes: 293 IDs ausentes em 1.424 slots visiveis.
- Aplicado: 184 IDs em 845 slots, divididos em 8 lotes.
- Escopo: 164 exercicios globais comprovados pelo roster e 20 restritos a BN.
- Volume: 88 alvos musculares primarios criados com peso fixo de 100%; 96 exercicios sem alvo anatomico deterministico permaneceram sem volume inventado.
- Depois: 109 IDs ausentes em 579 slots, sendo 37 ambiguos e 72 sem fonte deterministica.

## Gates

- Auditoria live read-only e pseudonimizada: aprovada.
- Testes Node: 12/12 aprovados.
- Rehearsal transacional do primeiro lote: 25/25 insercoes, seguido de rollback.
- QA independente: primeiro NO-GO por resolucao de nomes musculares; correcao aplicada e re-review final com GO.
- Pos-flight live: 184/184 linhas de biblioteca, 88/88 targets, 164 globais e 20 BN.

## Seguranca e rollback

Cada lote usa lock, hash do audit, confirmacao do projeto, limite de 25 IDs/150 slots, CAS da contagem de slots e aborta se qualquer linha ou target divergir. Os oito manifests de rollback ficam fora do repositorio, com permissao restrita, em `~/.codex/private/sett-exercise-repair-20260914/`.

Os 109 IDs restantes nao podem ser restaurados automaticamente. Exigem escolha da variante tecnica ou uma fonte canonica adicional; fuzzy matching continua proibido.
