# Renovacao por substituicao - 09/09/2026

## Regra confirmada

Matheus definiu que renovar substitui o plano vigente; os dias remanescentes nao
sao acrescentados. O treino publicado anteriormente continua no app ate a entrega
do novo treino. Historico, exercicios, registros de carga e sessoes nao sao apagados.

- Pagamento confirmado: nova vigencia inicia na data comercial do pagamento,
  com fim inclusivo `inicio + duracao do plano - 1`.
- Renovacao administrativa: usa a data inicial escolhida pela equipe e a duracao
  calculada no servidor, nunca o fim acumulado da matricula anterior.
- A matricula anterior fica `completed`; a nova recebe seus proprios ciclos.
- `carried_over_cycle_id` referencia somente treino real, iniciado, nao removido,
  do mesmo aluno e empresa. Nao mistura genericamente matriculas antigas.
- Publicacao posterior ganha do treino herdado; um ciclo vazio seguinte nao faz
  o app voltar ao plano anterior. Remocao explicita bloqueia a recuperacao antiga,
  mas nao impede uma nova publicacao legitima.
- O primeiro pagamento continua sem antecipar o inicio do treino. Repetir o mesmo
  evento de pagamento retorna a matricula ja aplicada, sem uma segunda renovacao.

## Verificacao

Skill aplicada: 121, Debugger Sistematico (Causa Raiz).
Execucao separada entre backend, frontend e rotinas; revisao independente.

- Estrutura real exportada sem dados (schemas public/private/auth) e restaurada
  em banco local isolado com 158 tabelas publicas e zero alunos reais.
- Canario SQL: substituicao sem soma, datas inclusivas, preservacao do treino,
  pagamento repetido, renovacao repetida, nova publicacao, remocao, isolamento de
  empresa e leitura do aluno sob RLS. Transacao revertida integralmente.
- Canario da rotina de datas: falhou na funcao antiga ao reativar ciclo de
  matricula encerrada; passou com a nova funcao, com rollback.
- Navegador: 390 e 1440 px, usando o componente real StudentWorkout com respostas
  sinteticas interceptadas. Antes da correcao o treino anterior desaparecia;
  depois passou a continuidade, substituicao, proximo ciclo vazio e remocao.
- Suite geral: 143 arquivos / 908 testes verdes na primeira rodada; testes
  adicionais focados executados apos ajustes finais.
- TypeScript e build passaram; lint sem erros, 43 avisos preexistentes.
- Automacao interciclos: seis testes Deno, incluindo cancelamento de matricula
  encerrada e retry em erro temporario de consulta.
- Gate final: QA independente aprovado; 59 testes focados e tres contratos de
  renovacao passaram, mais dez contratos SQL/rotinas. Canario concorrente local
  confirmou replay do mesmo pagamento e uma unica matricula operacional.

## Limites

Esta entrega muda o fluxo de renovacoes. Nao reprocessa pagamentos antigos nem
encurta automaticamente as 22 vigencias sinalizadas pela auditoria de 09/09.
Os oito conflitos atuais/futuros continuam aguardando reconciliacao individual
de datas e conteudo. O relatorio acumulado preserva as demais tarefas do projeto.

## Operacao

- Base: `codex/sett-release-rc-20260826`, anterior `0b6487e`.
- Banco canonico: `zshrcgbyhzxpnlccssyz`; nao usar o link local implicito de staging.
- Migracoes: `20260909165533_replace_paid_renewal_enrollment.sql` e
  `20260909165547_guard_completed_enrollment_cycles.sql`.
- Canarios: `scripts/renewal-replacement-canary.sql` e
  `scripts/advance-training-cycles-guard-completed-enrollment-canary.sql`.
- Estado: publicado em producao apos gate independente aprovado.
- Netlify: `6aa18fd8f0efb92020bd0577`, ready em 09/09/2026 16:57 UTC,
  `https://www.settapp.com.br`. HTML aponta os mesmos assets do build aprovado;
  hashes SHA-256 de StudentPortal, StudentWorkout e prescriptionSchedule iguais
  aos locais. Smoke publico mobile: HTTP 200 e zero erros JavaScript.
- As duas migrations foram aplicadas com canarios sinteticos dentro da transacao
  e rollback das fixtures antes do commit. Contagens reais preservadas:
  69 matriculas, 460 ciclos, 557 treinos, 143 pagamentos; zero fixtures residuais.
- Edge Functions: `process-automation-sessions` v45 e `push-send` v120 ativas.
- O smoke publico nao equivale a uma renovacao real de aluno: o fluxo funcional
  foi validado por SQL/RLS e componente real com dados sinteticos, sem cobrancas.
