# SETT/BN - matriculas e leads, 09/10/2026

Checkout: `sett-load-save-release-20260928`.
Baseline desta continuacao: `0d786a6`.
Metodo: ATENA; Skill 121, Debugger Sistematico (Causa Raiz).

## Matriculas em producao

- A primeira aluna ficou com uma unica matricula ativa, contendo o ciclo vigente
  de 09/10 a 19/11, tres treinos e 35 exercicios. As duas matriculas anteriores
  foram concluidas, sem excluir historico.
- Continuacao autorizada pelo usuario: duas outras matriculas duplicadas,
  anteriormente inativas, foram concluidas com precondicoes e transacao.
  O perfil ja inativo permaneceu inativo. O outro perfil manteve sua matricula
  ativa e as 40 linhas de treinos historicos existentes.
- Auditoria posterior: zero pares de matriculas nao concluidas com datas
  sobrepostas. Nao foram alteradas datas, exercicios, pagamentos ou logins.
- Protecao contra novas sobreposicoes, ativacao controlada e exclusao somente
  de matriculas vazias/sem pagamento foram publicadas na entrega `0d786a6`.

## Validacao do acesso da aluna

- Consulta read-only com `role=authenticated` e identidade da aluna, dentro
  de transacao revertida: RLS permite ler os tres treinos e 35 exercicios do
  ciclo vigente da matricula ativa.
- Na visualizacao autorizada `/aluno/treino/:studentId`, em producao, os botoes
  A, B e C abriram respectivamente 12, 10 e 13 exercicios, no ciclo correto.
- Esta verificacao usa a sessao profissional para renderizar a visualizacao
  e a identidade da aluna apenas no replay de leitura RLS. Nao houve login
  no celular da aluna, redefinicao de senha ou criacao de sessao em seu nome.

## Esteira de cadastros

- Publicado: `Transformar em lead` substitui arquivamento/exclusao.
  A aba `Leads` inclui os cadastros movidos e os anteriormente arquivados.
  `Retomar contato` devolve o cadastro para Contato, sem envio de mensagens.
- A RPC valida empresa, permissao, etapa esperada e matricula operacional sob
  lock. Altera somente a etapa comercial; preserva respostas, perfil, status,
  pagamentos e matriculas. Nao reativa automaticamente perfis inativos.
- Consultas principais paginadas e consultas auxiliares em lotes de 100 IDs,
  com paginas de 160 resultados e ordenacao estavel. Falhas mostram alerta e
  removem cartoes desatualizados, sem inventar pendencias de anamnese/avaliacao.
  A segunda revisao independente encerrou o P2 identificado na primeira.
- QA de interface usa pessoas ficticias e backend simulado, sem movimentar
  cadastros reais para testar.

## Validacoes desta continuacao

- Build, typecheck e lint focado aprovados novamente apos a correcao dos lotes.
- PostgreSQL isolado/PGlite: 16 verificacoes de permissao, isolamento de empresa,
  conflitos, transformacao, retomada e preservacao aprovadas.
- Chromium: 17 testes aprovados pelo QA e reexecutados pela raiz, incluindo
  recarga, falha de RPC/confirmacao e layouts de 390 e 1440 pixels.
- Reexecucao Chromium apos o P2: 17/17 aprovados. Revisao independente:
  5/5 testes adicionais de lotes, paginas e falhas aprovados, sem bloqueadores.
- Suite integral inicial: 1437 passaram, 7 ignorados e 3 atingiram timeout de
  5 segundos durante build/QA concorrentes. O teste de midia fora deste escopo
  passou isolado (29/29).
- Suite final com budget de teste de 15 segundos, sem modificar configuracao:
  197/198 arquivos aprovados, 1444 testes aprovados, 7 ignorados e uma falha de
  espera de 1 segundo em `WorkoutBuilderRecovery` (arquivo nao alterado).
  A causa dessa falha isolada nao foi comprovada. Nao equivale a suite 100% verde.
- Reexecucao focada pela raiz com timeouts padrao: `WorkoutBuilderRecovery`,
  `registrationLeads` e `salesFunnelView`, 42/42 aprovados. O caso de adicionar
  e salvar treino foi repetido mais uma vez isoladamente e passou novamente.

## Publicacao

- Codigo: commit `5ba5937`, branch `codex/sett-load-save-release-20260928`.
- Banco: migration `20261009172654_registration_dormant_leads` aplicada;
  assinatura e ACL verificadas, `authenticated` permitido e `anon` bloqueado.
- Preview: `6ac924ee96879e14e5291a5f`; chunk `RegistrationManager-D4Z_kdtl.js`
  identico byte a byte ao build testado, contendo a acao e a RPC novas.
- Frontend principal: deploy `6ac926a677f56442466e1e2f`, em
  https://www.settapp.com.br. Chunk conferido byte a byte contra o build testado.
- Interface autenticada em producao: aba `Leads (10)` abriu, exibindo retomada
  de contato, sem alertas. Os antigos botoes de arquivar/excluir nao aparecem.
  Nenhum cadastro real foi movimentado para testar a funcionalidade.
- Segunda revisao independente aprovou o gate sem bloqueadores deste diff,
  preservando a ressalva da suite integral acima.

## Checklist acumulado e limites

- [x] Producao: os tres casos de matriculas, prevencao de novas sobreposicoes
  e controles manuais. Acesso aos treinos verificado como acima.
- [x] Producao: nova aba Leads, acao Transformar em lead, retomada de contato
  e preservacao de dados; testes focados e revisao independente aprovados.
- [ ] Validacao integral 100% verde (aguardando): uma falha de espera nao se
  reproduziu nas duas reexecucoes; confirmar na proxima rodada integral sem
  concorrencia pesada. Nao ha correcao de produto comprovadamente necessaria.
- Historico de biblioteca, versoes antigas, copia individual, importacao aditiva,
  assinatura e demais ajustes: ver os relatorios de entrega de 29/09/2026:
  [ajustes e checklist anterior](ENTREGA-AJUSTES-2026-09-29.md),
  [historico e copia individual](ENTREGA-HISTORICO-BIBLIOTECA-2026-09-29.md),
  [recuperacao da biblioteca](ENTREGA-RECUPERACAO-BIBLIOTECA-2026-09-29.md),
  [importacao aditiva](ENTREGA-ADICIONAR-TREINO-BIBLIOTECA-2026-09-29.md).
  A assinatura foi confirmada pelo usuario e os itens retirados do backlog
  seguem retirados; esta demanda nao os reabre.

## Rollback

- Frontend anterior a Leads: Netlify `6ac91abbe41b1eb709726fca`.
- As correcoes de matriculas preservam todas as linhas e o status anterior
  dos dois alvos esta no registro local privado de reparo. Uma reversao deve
  respeitar o guard de sobreposicao e escolher uma unica matricula vigente.
- Nenhum teste exige gravar, apagar ou publicar uma prescricao de aluno real.
