# QA independente — continuidade 01/11/2026

Baseline 60fba11; testes preparados antes da implementação, sem gate final.
Escrita restrita a adversarial* nesta pasta; nenhuma fonte alterada.

Riscos a verificar com o executor:
- Não usar apenas maior cycle_number/end_date: importação tardia e data estendida não são ordem de publicação.
- Materialização em ciclo futuro não equivale a publicação efetiva hoje; slot vazio/bundle/ACK sozinho não substitui o anterior.
- cleared/superseded e workouts arquivados não retornam à execução via fallback.
- Decidir barreira de remoção: limpar a publicação mais recente pode ou não permitir retornar a outra antiga; não inventar essa política no teste.
- Offline posterior não deve ser convertido em treino digital; definir se encerra a continuidade digital anterior.
- Multimodalidade não deve escolher corrida como substituto de força.
- Preservar bloqueio do aluno inactive, owner/tenant, erros e respostas atrasadas; matrícula/datas não podem ser escritas para produzir continuidade.
- Sessão ativa continua vinculada ao workout original ou fica explicitamente indisponível, jamais reassociada ao novo.
- Semana de progressão deve ter limite definido após fim original, sem reiniciar ou avançar indefinidamente.

Fixtures sintéticas: 01/11; contrato válido até 01/01/2027; treino antigo terminou 31/10. Chamadas Supabase e sessões mockadas; helpers de seleção/portal reais. Não comprova backend/RLS; Pauli cobre sessão/cargas no servidor.
Arquivo de testes do executor recebido durante a preparação: studentPrescriptionContinuity.test.ts. Ele limita a mudança ao contrato vigente; contrato vencido NÃO é requisito presumido deste QA. Primeiro rascunho do fixture QA usava contrato vencido; ajustado antes do gate para separar essa hipótese do requisito confirmado de continuidade técnica. Uma execução de baseline com o rascunho inicial não constitui evidência do candidato final. Aguardar implementação/freeze do executor. Não alterar expectativas só para obter GREEN.

## Contrato WIP recebido

Executor criou `selectStudentDigitalContinuity` em prescriptionSchedule.ts e integração no portal. WIP observado mantém matrícula vigente, ordena etapas por start_date e falha fechado em empate; remoção iniciada é barreira, offline não substitui digital anterior. Estes são comportamentos observados, sem aceite final ainda. Reavaliar carried-over (ciclo de matrícula anterior) e compatibilidade de filtros mais estritos com workouts legados sem company_id. A guarda backend de Pauli ainda precisa concordar com a decisão de execução.

A primeira execução do rascunho (contrato vencido) terminou 7 RED/6 GREEN; não atribuir estes RED ao requisito já limitado pelo executor. Uma segunda execução usa contrato vigente mas foi iniciada antes de acrescentar seis casos de workout arquivado/aluno inativo; portanto precisa ser repetida completa após freeze. Não há gate.
