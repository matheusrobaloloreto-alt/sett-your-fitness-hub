> ESTADO FINAL: gate independente LOCAL aprovado para os quatro arquivos do freeze da raiz. O corpo WIP abaixo preserva o diagnóstico anterior; ver fechamento final ao fim. Não aprova produção nem substitui build/browser da raiz.

# QA independente da continuidade — leitura WIP, sem gate final

Base 60fba11; escopo conforme ACCEPTANCE.md (Taís, contrato vigente; treino completed antigo até próximo digital iniciado). QA não alterou fontes; propriedade restrita a adversarial* nesta pasta. Nenhum acesso remoto/DDL/deploy.

## Evidência local

32/32 testes centrais passaram em adversarial-reviewed-wip-results.txt: 22 portal real com dependências externas mockadas + 10 helper real. Não comprovam banco/RLS/browser hospedado. Datas/identidades sintéticas. Sonda adicional de compatibilidade legacy concluída: um RED, separado dos 32 cenários centrais GREEN. Freeze não recebido.

## Leitura do desenho

- `prescriptionSchedule.ts:302-312`: vigência e identidade da matrícula preservadas; datas impossíveis, não finitas e intervalos invertidos do ciclo são excluídos; fim do treino pode ser passado. Não há extensão de datas. Limite do contrato permanece: isto não resolve Maria Gabriela com matrícula vencida.
- `:313-323`: apenas active/completed com conteúdo materializado; superseded/cleared fora da candidatura. Ordena start_date, não cycle_number, active ou maior end_date. Empates falham fechado. Remoção explícita iniciada posterior ou da mesma etapa barra fallback; futura não bloqueia antecipadamente. Superseded não retorna.
- `StudentPortal.tsx:663-729`: continuidade é decisão separada de projectPrescriptionCoverage. É possível manter treino disponível quando coverage está review por sobreposição com slot vazio. Os testes confirmam que isso NÃO contorna clear ou empate de materializações. Agenda não é reclassificada como coberta e o ACK de ciclo visto permanece condicionado à cobertura atual (:731-735).
- `StudentPortal.tsx:483,791-800`: continuidade é zerada no início de nova leitura; erro ou resposta obsoleta não publica estado parcial como portal disponível. Testes cobrem erro de training_cycles/workouts e resultado atrasado após troca de identidade/empresa.
- Sessão ativa: resolução é por workoutId original antes do default novo. Teste montado troca seleção default para a nova etapa sem mostrar exercícios novos como se fossem da sessão antiga. Resolver puro retorna stale quando o antigo não está na coleção, jamais substitui seu ID. Backend permanece responsabilidade do Pauli.
- Semana após fim original: periodization.ts:136 limita índice à última semana; weeklyStrengthPeriodization.ts:528 limita selectedWeek à duração. Não reinicia progressão automaticamente. Isso não é validação clínica de repetição prolongada.

## Atenção de compatibilidade — company_id nulo

Novo filtro `StudentPortal.tsx:628-639` exige company_id igual ao aluno na query e no readback. A base aceitava workout com company_id nulo vinculado a ciclo próprio; tipo gerado permite null (`types.ts:9862`) e start_workout_session local admite company_id nulo se ciclo/aluno/tenant conferem. Isso é uma redução observável de leitura para esse formato legado. Uma sonda independente monta ciclo atual e workout materializado com company_id null. Não demonstra existência desse dado em produção.

Relatório do Pauli (lido, não reexecutado por este QA) informa zero company_id nulo/divergente entre as 37 linhas do caso e que o core de gravação exige igualdade; portanto não tratar como impedimento comprovado para Taís nem propor enfraquecer tenant no servidor. Raiz deve classificar o formato legado: preservar consulta pelo ciclo estritamente validado, ou declarar explicitamente que fica indisponível e inventariar eventuais afetados. Não alterar fonte/fixture só para esconder a sonda.

## Limites e próximos passos

✅ Revisão WIP e 32 testes centrais GREEN.
✅ Erro inicial de fixture activeSession corrigido somente no QA (formatTime ausente); não era defeito do produto.
❌ Compatibilidade legacy (aguardando): sonda RED confirmada (um caso falha; demais não selecionados). Reprodução: ciclo próprio atual, workout não vazio e company_id null; antes visível pela base, agora indisponível no portal. Raiz deve decidir o tratamento desse formato legado; zero ocorrência no caso-alvo segundo Pauli. Resultado em adversarial-legacy-results.txt.
❌ Gate final (bloqueado): falta freeze da raiz/executor; reexecutar suíte final após fixar hashes. TSC/build/browser e integração são da raiz; backend sessão/cargas do Pauli.

Primeira versão de fixture QA testava contrato vencido; foi corrigida antes do gate para o escopo de ACCEPTANCE.md. Logs anteriores preservados, sem classificar aqueles RED como falha deste requisito.


## Fechamento final sobre o freeze da raiz

Manifesto: `output/continuity-20261101.private/source-freeze.json`, SHA256 `1e10192cd218da5052fbd7c9e2876a197bcc45aeb9a49bbce6300378c462af2f`.

✅ Quatro arquivos fonte/testes do executor: 4/4 hashes coincidem antes e depois; manifesto não mudou. Evidências: adversarial-final-pre-hashes.json e adversarial-final-post-hashes.json.
✅ Suíte independente completa: **33/33 PASS** (23 portal, 10 seletor). Comando: `npx vitest run --config qa/continuity-20261101/adversarial.vitest.config.ts --maxWorkers=1`. Resultado: adversarial-final-results.txt; exit 0.
✅ Legado antes RED agora GREEN: `company_id null` aceito apenas por cycle_id da coleção de ciclos cujo aluno/empresa foram validados; divergência não nula continua rejeitada no readback. Correção examinada em StudentPortal.tsx:626-641. Achado de compatibilidade anterior encerrado para estes hashes.
✅ Cobertos: último publicado após fim técnico; novo vazio; futuro; novo efetivo; clear/superseded/archive; datas inválidas; escopo; falha de leitura; resposta atrasada na troca de empresa; review por slot vazio sem contornar tombstone/empate; sessão ativa ligada ao workout original; invariância de datas na seleção.
✅ Fontes não alteradas por QA. Antes da execução final foi acrescentado somente query.or ao mock Supabase próprio, necessário para a API da query congelada; nenhuma expectativa dos 33 testes foi modificada. Primeira tentativa final foi interrompida para completar o mock; não é falha de produto. Hashes dos arquivos QA conferidos pré/pós da execução completa.
❌ Build, reexecução StudentPortal.reads e browser integrado (aguardando): pertencem à raiz, que informou build ativo e TSC app exit 0. Este QA não incorpora o resultado antigo de 316 PASS/1 FAIL como se fosse execução estável sobre este freeze.

**Decisão: aprovado o gate independente local de revisão e testes adversariais para os quatro hashes entregues.** Sem novo achado bloqueante no escopo avaliado. Preserva limite do contrato vigente; não concede continuidade de matrícula vencida nem altera a política comercial. Backend sessão/cargas: evidência e limites no relatório do Pauli, não reexecutados por este QA. Sem produção, deploy ou alegação universal de ausência de regressões. Alterações posteriores no freeze exigem reconferência apropriada.
