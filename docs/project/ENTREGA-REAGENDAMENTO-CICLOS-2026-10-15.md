# Reagendamento de ciclos com historico - 2026-10-15

## Pedido e causa

O professor deve conseguir corrigir a data de um ciclo mesmo depois de haver
treinos realizados. A definicao consultada no banco de producao confirmou
o bloqueio em `reschedule_training_cycles_from(uuid, uuid, date)`: a existencia
de qualquer `workout_sessions` ou `workout_logs` no ciclo selecionado ou nos
seguintes causava a excecao exibida na imagem. Nao era um bloqueio da interface.

## Alteracao

- Remover apenas essa rejeicao; manter a assinatura do RPC consumido pelo app.
- Ajustar as datas do ciclo selecionado e dos seguintes pela ordem cronologica,
  nao pelo numero do ciclo. Manter duracao e deslocar o fim da matricula.
- Se for o primeiro ciclo, sincronizar o inicio do treino na matricula usando
  a autorizacao privada da transacao ja existente, sem regenerar ciclos.
- Preservar identidades, exercicios, sessoes, datas reais de execucao, logs,
  cargas, feedbacks e versoes. Nenhum historico e apagado ou remapeado.
- Manter autorizacao de equipe da empresa, restricao entre empresas, locks,
  validacoes de datas invalidas/sobreposicao e exclusao dos ciclos superseded.
- Manter os gatilhos existentes: links interciclos nao preenchidos podem ser
  invalidados e entregas ainda nao enviadas reagendadas quando as datas mudam.
  Este RPC nao envia mensagens.

Escopo somente banco. Sem alteracao de frontend, Edge Function, motor ou cache.
Nenhum aluno/data real foi escolhido pelo usuario para uma alteracao especifica;
esta entrega nao reagenda registros reais por conta propria.

## Validacao e publicacao

Baseline `36e7c230ca6ea4b0e7294d2e66766518a8828dbd`.
Worktree `sett-load-save-release-20260928`.
Branch `codex/sett-load-save-release-20260928`.
Banco canonico `zshrcgbyhzxpnlccssyz`.

Contrato PostgreSQL/PGlite: 36/36 aprovados pelo executor e reexecutados pela
raiz. Inclui reproducao do erro com a funcao anterior, avancos/recuos com
sessoes concluidas e em andamento, snapshots integrais de workouts/sessoes/logs,
sincronizacao do primeiro ciclo, guardas reais de geracao e indices unicos,
permissoes negativas, sobreposicao, falha tardia com rollback atomico e
execucao do SQL de rollback com reaplicacao da migration nova.

Contratos existentes de supersessao semantica e entrega de biblioteca:
10/10 aprovados. Revisao independente final do delta SQL e canary aprovada sem
P1/P2; reexecucao independente final de 36/36 aprovada, inclusive rollback
manual. Nenhuma garantia de desempenho geral foi inferida.

Limites: schema sintetico minimo com helpers reais e shim local de JWT;
concorrencia multiconexao nao exercitada. Efeitos interciclos revisados no
gatilho vivo, nao simulados pelo contrato. Canary local/staging atualizado,
mas nao executado em producao. Nao equivale a teste em conta real de aluno.

Publicado no banco de producao, migration
`20261015091735_allow_reschedule_cycles_with_history`.
Commit de produto `e0046f3`, enviado para a branch. Arquivo local alinhado ao
identificador atribuido pelo ledger remoto depois da aplicacao.

Leitura pos-publicacao confirmou definicao exata da funcao testada,
SECURITY DEFINER e ACL anteriores preservados, EXECUTE anonimo negado,
EXECUTE autenticado permitido e zero autorizacoes privadas remanescentes.
Advisor de seguranca com os mesmos avisos/contagens antes e depois; isso
nao significa ausencia de riscos gerais no projeto. Os avisos preexistentes
nao foram alterados neste escopo.

Nao houve novo deploy Netlify: o app ja chama este RPC e a assinatura nao
mudou. A correcao esta efetiva no banco compartilhado pelo app publicado.

## Rollback

`rollback-reschedule-history-2026-10-15.sql` restaura a definicao anterior
capturada diretamente do banco. Aplicar somente como migration compensatoria
se necessario. Nao desfaz mudancas de data feitas depois da entrega nem altera
historico. Nenhuma tabela ou dado precisa ser excluido.

## Checklist Acumulado Do Escopo Atual

- Acesso da equipe a alunos/prescricoes: publicado e conferido na entrega
  de 2026-10-14, sem ampliar financeiro ou acesso entre empresas.
- Reagendamento com historico: publicado no banco, leitura de confirmacao e
  testes locais aprovados; nenhuma data real alterada para demonstracao.
- Benchmark do motor: aguardando investigacao em ambiente sem contencao;
  ultimo resultado 953,287 ms para teto de 500 ms. Motor nao alterado aqui.

Skill aplicada: ATENA e 121 Debugger Sistematico (Causa Raiz).
