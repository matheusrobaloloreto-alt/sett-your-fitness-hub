# SETT - incidente WhatsApp - 19/10/2026

## Causa e evidencias

- O host Evolution configurado no SETT pertence ao projeto Railway existente
  `sett-evolution-api`. Os tres servicos (Evolution API, PostgreSQL e Redis)
  estavam sem deployments ativos; os tres volumes permaneciam presentes.
- A Railway inicialmente mostrava fatura pendente e todos os deployments
  pausados. As rotas publicas de conexao e listagem retornavam HTTP 404.
- Apos o usuario informar o pagamento, a pendencia de fatura desapareceu,
  mas o plano ainda mostrava `Trial expired` e `All deployments are paused`.
  Foi solicitada ao usuario a ativacao do plano na propria Railway.
- Nenhum pagamento, novo plano, exclusao de volume, recriacao de instancia,
  envio de mensagem ou reparo de historico foi executado nesta intervencao.

## Correcoes

- A tela distingue falha do provedor de desconexao real e mostra apenas
  mensagens/codigos seguros; nao expoe corpos externos, credenciais ou telefones.
- O diagnostico manual do provedor e restrito a administracao/master.
  Falha ao consultar automacoes nao aparece como ausencia de automacao.
- Erros de rede, autenticacao, limite, servidor ou resposta invalida preservam
  o estado persistido. Um HTTP 404 isolado nao comprova instancia inexistente:
  a listagem precisa estar saudavel e confirmar a ausencia do nome exato.
- Iniciar conexao so cria instancia apos ausencia confirmada. Atualizar QR
  nunca exclui, reinicia ou recria a instancia. Falta de QR tambem nao dispara
  recuperacao destrutiva; a tela consulta novamente e permite atualizacao manual.
- Respostas vazias ou inconsistentes de criacao nao sao tratadas como sucesso.
  A verificacao viva antes de enviar continua obrigatoria, preservando as
  validacoes de empresa, destinatario, assinatura e midia.
- Sem migracao de banco; JWT do `whatsapp-manager` permanece habilitado.

## Validacao e publicacao

- Raiz: 43 testes Vitest, 215 testes Deno dos helpers/handler e 56 casos de
  integracao de assinatura passaram. A suite de conexao (162 casos) foi
  reexecutada apos o ajuste de lint no teste, sem falhas. TypeScript do app,
  `deno check`, lint focado, `git diff --check` e build de producao passaram.
- Revisao independente final: aprovada, sem achados funcionais pendentes;
  43 Vitest e 219 Deno verificados pelo revisor, com nova execucao dos 162 casos
  e do lint apos o ajuste final. Publicacao do pacote completo: em andamento.
- Primeiro patch da tela publicado no Netlify:
  `6ad6410336195fa5234ecaa9` (commit `59c5e14`, service worker v11).
- Backend anterior confirmado antes da publicacao: `whatsapp-manager` v89,
  com verificacao JWT habilitada. Copia privada preservada fora do Git em
  `output/whatsapp-incident-20261019/backup-v89/`.

## Pendencias e recuperacao

- Bloqueado: ativacao da hospedagem pelo usuario. O pagamento da fatura, sozinho,
  nao demonstrou reativacao dos servicos na verificacao realizada.
- Apos ativacao: conferir deployments/volumes, saude dos endpoints e estado da
  instancia pelo SETT. Somente se realmente necessario, solicitar leitura do QR.
- Recebimento/envio em aparelho real nao foi validado nesta intervencao.
  Nao enviar mensagens a alunos para teste; qualquer canario exige destinatario
  identificado e autorizacao para aquela mensagem.
- Recuperacao do codigo: manter backup v89 privado e, se necessario, publicar
  uma correcao adiante limitada ao manager/tela. Nao restaurar volumes nem
  substituir dados de conversas. Nao publicar outras funcoes ou migracoes.
