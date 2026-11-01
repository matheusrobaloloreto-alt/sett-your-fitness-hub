# Revisão semântica durante freeze — finding, sem correção runtime

## Estado e drift

Base 61ab2c8. Freeze atual: `worker-portal-freeze.sha256`, quatro arquivos conferidos 4/4. O recibo `worker-portal-tests.txt` registra 66/66 verdes em 19:47:47, source unchanged durante aquela execução.

Após os 65 verdes anteriores foram alterados **StudentPortal.tsx** e **StudentPortal.reads.test.tsx** para bloquear a expiração mesmo com cobertura válida em cache. Isso explica o drift contra o freeze anterior: portal fc92d210... -> ce8dd00a...; teste 0935a6f1... -> 113900a3.... Os dois arquivos do hook permaneceram b881367a... e 13ba7714.... Nenhum desses quatro arquivos foi alterado nesta revisão semântica.

## Resultado da sonda focada

Arquivo: `worker-portal-active-session.probe.tsx`.
Runner explícito: `worker-portal-semantic-probe.config.ts`.
Recibo: `worker-portal-semantic-probe-results.txt`: **1 passou / 1 falhou**, 19:51:33. Apenas dois casos; sem bateria ampla, build ou alteração da fonte. Extensão .probe.tsx para não acrescentar um RED automaticamente aos globs .test.tsx da regressão em andamento.

- PASS: selecionado vencido, cobertura válida previamente carregada e mantida em cache, política hide. Após mudar a data e renderizar, o treino é ocultado. O bypass apontado inicialmente não se reproduz no freeze ce8dd00a..., pois `awaitingDigitalPrescription = awaitingPrescription || expiredContinuation` já governa `workoutUnavailable`.
- FAIL [P1]: sessão existente e resolvida no mesmo treino próprio, matrícula vigente, ciclo vencido, política hide. O portal mostra apenas `Encerrar sessão ativa` (abandonar) e não apresenta a ação de finalizar a sessão já existente. A sonda espera o botão `Test finalizar` do mock de WorkoutTimer e recebe null.

## Causa e implicação do finding P1

Em `src/pages/student/StudentPortal.tsx:1554`, `selectedCycle && !workoutUnavailable` governa o bloco inteiro que contém o WorkoutTimer e o callback de finalização. Sob hide do treino vencido, esse bloco não monta, inclusive quando `activeWorkoutResolution.kind` é resolved e a sessão já está em andamento. O aviso pendente chama `handleAbandonSession`, não `handleFinishSession`.

Não foi observado apagamento de logs ou sessão. O finding é indisponibilidade da finalização na UI; o callback de conclusão continua definido, mas fica sem controle acessível. Os testes de conclusão exportados não cobrem esse gate de apresentação.

## Próximo passo sujeito à coordenação da raiz

Correção ainda NÃO implementada. Separar a proibição de iniciar nova sessão vencida da possibilidade de finalizar a sessão existente resolvida, mantendo vínculo aluno/empresa, matrícula e barreiras de arquivo/superseded/cleared. Não liberar genericamente todo o bloco por `session.isActive`, nem reabrir prescrição removida. Acrescentar e validar caso explícito da ação de finalizar; combinar o instante de mudança da fonte com a raiz antes de outro freeze/build.

## Reprodução

```sh
./node_modules/.bin/vitest run --config qa/configurable-continuity-20261101/worker-portal-semantic-probe.config.ts
```

Fixture sintético. Contrato do hook mockado para hide; integração real do componente e gates. Não constitui prova de RLS, gravação ou finalização nativa. Nenhuma chamada ao staging/produção.
