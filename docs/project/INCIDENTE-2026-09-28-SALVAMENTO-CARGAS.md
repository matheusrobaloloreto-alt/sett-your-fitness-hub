# SETT/BN: incidente de salvamento das cargas

## Status atual

As duas pendencias desta continuacao foram concluidas em producao em 28/09/2026:
protecao duravel de exclusao/renumeracao e publicacao isolada das melhorias de
cargas, apos corrigir os bloqueios TypeScript e fechar o gate geral.

- Backend canonico: zshrcgbyhzxpnlccssyz; ambas as migracoes constam no ledger vivo.
- Frontend: https://www.settapp.com.br, deploy 6aba24b3dac3130087edcc22, ready.
- Publicado em 2026-09-28T08:26:29.144Z; commit de codigo local d8e76f3.
- Preview conferido: 6aba233fd74a19324b6f9f0e. Nao houve push nesta entrega.
- WIP de WhatsApp preservado e excluido da publicacao; prescricoes antigas
  nao foram convertidas para o novo modelo semanal.
- O usuario confirmou o salvamento no celular antes desta publicacao adicional.
  Finalizacao/cronometro e a matriz integral de dispositivos seguem pendentes.

## Causa comprovada

O app oferece dificuldade (RPE) 7.5, 8.5 e 9.5, mas a coluna e a RPC
save_workout_logs_if_current usavam smallint. A conversao de texto 9.5 para
smallint abortava o lote inteiro com SQLSTATE 22P02. A mensagem do app atribuía
incorretamente o erro a conexao.

Consulta dos logs de producao nesta rodada, janela padrao de 24 horas:
- 386 respostas HTTP 400 na RPC de cargas, 25 respostas HTTP 200.
- 386 erros PostgreSQL invalid input syntax for type smallint: 9.5.
- A reproducao controlada SELECT '7.5'::smallint tambem retornou 22P02.
- Nenhum dado pessoal de aluno foi necessario para identificar a causa.

Metodo: skill 121, Debugger Sistematico; revisao independente do frontend e SQL.

## Escopo da correcao

- Migracao 20260928065519_workout_logs_fractional_rpe_idempotency.sql:
  coluna e parser RPE numericos, sem arredondar registros; limites 1 a 10.
- Reenvio de uma serie com todos os valores identicos ao banco confirma a
  persistencia sem duplicar a linha ou incrementar a revisao. Valores diferentes
  continuam sujeitos a CAS e conflitos de outro dispositivo.
- Autorizacao por aluno/empresa, grants, limites e preflight atomico preservados.
- Retry do frontend nao repete erros permanentes de validacao/autorizacao.
- Revisao do frontend cobre exclusao em voo, troca de dia e limpeza de cargas.
- Nenhuma prescricao antiga e convertida para o novo modelo semanal.
- Alteracoes anteriores de WhatsApp nao fazem parte da migracao de cargas.

## Primeira rodada (historico)

Esta secao registra a primeira correcao e seus bloqueios naquele momento.
O estado atual e os gates encerrados estao nas secoes Status atual e Continuacao.

- Backend aplicado em producao em 28/09/2026, versao 20260928065519.
  A causa RPE fracionario foi corrigida sem depender de uma atualizacao do cliente.
- Catalogo vivo: RPE numeric; RPC security definer e search_path preservados;
  anon continua sem EXECUTE, authenticated continua com EXECUTE.
- MD5 do corpo da RPC publicada: b4224ae85274ba037c9c5f46020f00aa.
  SHA-256 da migracao revisada: a55d647f7fe5e546b798d5126abcc2e466fc616fcc03be6585cc7f5f8a043f82.
- Teste da RPC viva sob identidade de aluno, com BEGIN/ROLLBACK: RPE 9.5
  salvo, replay identico preservando id/revisao, escrita diferente com revisao
  antiga bloqueada. Nenhuma alteracao permanente nas cargas do aluno.
  Um segundo teste vivo, tambem revertido, confirmou que um ator sem acesso
  ao aluno nao pode confirmar nem mesmo um replay identico.
- Contrato PostgreSQL/PGlite: 38/38; o codigo anterior falhou em 15 casos.
  Inclui RPE 7.5/8.5/9.5, limites, lote atomico, tenant e bloqueio de anon.
  E um schema sintetico: nao substitui testes concorrentes multi-conexao/RLS vivo.
- Vitest focado apos a ultima correcao: 82/82, incluindo sessao e feedback.
- Revisao independente SQL aprovada; achado frontend de confirmacao manual
  durante edicao corrigido e coberto por teste de regressao.
  A mesma limpeza foi aplicada ao tombstone de uma serie removida durante
  essa confirmacao; teste adicional verifica identidade/revisao e flag limpa.
  A serie deslocada tambem limpa a flag somente quando seu proprio predecessor
  recebe ACK exato; segue sem id/revisao, como insert protegido pelos tombstones.
- Revisao independente final do frontend: gate funcional local aprovado,
  67/67 testes e reproducao do filtro/guard do portal com origem + destino.
  Guardas de conflito, identidade, data e transacao preservadas. Essa aprovacao
  e focada, nao uma aprovacao da publicacao geral do app.
- ESLint dos arquivos de cargas: zero erros, tres avisos preexistentes de hooks
  no portal. git diff --check passou.
- Build de producao reexecutado apos a ultima patch: passou, incluindo gates
  de backend canonico, consentimento semanal e bundle. Build nao executa a
  checagem TypeScript completa e nao substitui o gate geral abaixo.
- A suite geral da revisao teve 1243 aprovados e 9 falhas: seis timeouts em
  templates/calendario e tres casos draft/request que passaram na reexecucao
  focada. A suite geral nao deve ser declarada aprovada.
- TypeScript do app completo continua com tres erros preexistentes fora deste
  escopo: engine.test.ts:342 e WorkoutBuilder.tsx:329/671.
- As melhorias adicionais do frontend permanecem locais. Nenhum deploy de
  interface, push ou commit nesta correcao; WIP de WhatsApp preservado.
- Servidor local reiniciado e HTTP 200 confirmado em http://localhost:8080/.
  A interface local inclui WIP anterior; nao deve ser promovida em bloco.
- Salvamento em dispositivo real confirmado pelo usuario em 28/09/2026.
  Esta confirmacao nao substitui a auditoria geral do cronometro/finalizacao.

## Risco separado encontrado

Exclusoes/renumeracoes tinham risco ABA: uma revisao reiniciava em 1 ao
recriar a linha, permitindo confundir uma tentativa antiga com a substituicao.
Corrigido em producao pela migracao 20260928074406_workout_log_batch_receipts.sql:
- Revisoes globais nao reutilizadas, incluindo INSERT/UPDATE diretos.
- Recibo duravel por lote, atomico com as exclusoes/substituicoes.
- Replay identico so confirma o resultado se o pos-estado ainda coincide.
  Edicoes posteriores devolvem conflito atual sem reexecutar a exclusao.
- Autorizacao antes de consultar recibos; tabela, core e sequence privados.
- Todos os lotes travam workouts na mesma ordem, evitando a inversao herdada.
- SHA-256 aprovado independentemente: 46b34ba80f8d5f9879ee865897eca94bdfae6403f2b66c6188cbd6d335b9b0e3.
- MD5 vivo wrapper: f967cc7e0866ed2d74caa890d1122b2d; core RPE preservado.
- 36/36 testes SQL aprovados e reexecutados pelo main; inclui replay apos COMMIT.
- Canary vivo com BEGIN/ROLLBACK passou: fractional RPE, renumeracao/replay,
  exclusao antiga negada, replay apos edicao em conflito, ator anonimo negado.
  Nenhuma carga/receipt de teste persistiu. Sequence pode ter lacunas, intencionalmente.
- Limite: testes locais SQL sao single-connection; nao provam concorrencia
  multiconexao. Ledger ainda nao tem politica automatica de retencao.

## Continuacao: frontend e gate geral

Release isolado em sett-load-save-release-20260928, baseline 648a4a6:
- Tres erros TypeScript corrigidos em engine.test.ts e WorkoutBuilder.tsx.
  A mudanca do teste preserva a deteccao de valor bruto invalido; nenhum motor
  clinico ou conversor de prescricoes antigas foi modificado.
- Frontend: fila de salvamento serializada, retry limitado a falhas transitorias,
  data atual de negocio, persistencia de valores zerados e confirmacao manual
  de conflitos. ACKs antigos nao apagam edicoes mais novas nem vinculam a
  identidade de uma serie excluida a sua substituta.
- Correcao adicional encontrada no gate: a contagem de series extras podia
  ressurgir apos ACK antigo durante uma exclusao em voo. O efeito real do
  Portal agora projeta rascunhos/tombstones sem modificar a copia autoritativa
  do banco e espera a restauracao do backup local antes de inferir contagens.
- Cinco testes React do efeito real passaram, incluindo ACK antigo, conflito,
  falha de transporte/reabertura e substituicao por outra identidade.
  Estes testes nao equivalem a uma montagem integral do Portal no celular.
- Revisao independente final aprovada para SQL, efeito do Portal e escopo do
  pacote. Main reexecutou testes; o gate nao se apoia apenas no executor.
- 64/64 arquivos relacionados ao WhatsApp identicos ao baseline no release.
  O pacote estatico revisado nao inclui SQL, logs, secrets ou arquivos de QA.
- Playwright existente da grade de cargas: 3/3 em 320/360/390px, sem overflow
  ou erros JS. A fixture e sintetica; nao e prova de todos os fluxos do Portal.

Gates finais, apos a ultima correcao de codigo:
- npx tsc --noEmit -p tsconfig.app.json: exit 0.
- npm run lint: exit 0; zero erros, 43 avisos no projeto.
- Vitest geral: 186 arquivos, 1239 testes aprovados, zero falhas.
  Comando: npx vitest run --config output/vitest-isolated.config.mts
  --pool=threads --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000.
  Configuracao temporaria permite ler o worker PDF nos node_modules
  compartilhados. Concorrencia reduzida evita disputa de CPU; o limite do
  teste de desempenho nao foi alterado (mediana CPU 429.21 ms, teto 500 ms).
- npm run build: exit 0, com verificacoes de backend canonico, consentimento
  semanal e desempenho do bundle. Reexecutado apos a ultima mudanca no Portal.
- git diff --check e git diff --cached --check: aprovados.
- Commit local d8e76f3 contem somente os 18 arquivos explicitamente revisados;
  artefatos output/test-results e WIP de WhatsApp nao foram incluidos.

Publicacao e verificacao remota:
- Preview e producao publicados por CLI no site existente, usando somente
  dist e --no-build. Configuracao remota sem functions_dir; preview ready,
  required_functions vazio. Nenhuma Edge Function Supabase foi publicada.
- O deploy anterior permaneceu o mesmo antes da promocao; o novo ID foi
  confirmado como published_deploy do site oficial, estado ready.
- HTTP 200 em / e /aluno; referencias a JS/CSS coincidem com o build local.
- SHA-256 remoto igual ao local para JS inicial, CSS, StudentPortal e sw.js.
  StudentPortal-kFjwjB_d.js:
  fb5184265e97ae7c87b39c0f92ea854d8ba14da7c5d10428f5b7cfff0a0c433a.
  Cache publicado: sett-cache-v5; sw.js:
  388faf4f3fd328a73db81740fbec42a6cbf0b17e33ea90d32e66a0e50deb8840.
- Pos-deploy: MD5 vivo do wrapper/core e grants privados continuam iguais aos
  revisados; anon nao executa a RPC, app nao executa core nem le receipts.
- Limite declarado: a inspeção visual remota nao foi concluida, pois o
  navegador integrado sofreu timeout e ficou indisponivel. HTTP/hashes nao
  substituem QA visual autenticado; nao foi alegada validacao integral 100%.

## Backup e rollback

- Antes da correcao, o corpo da RPC em producao correspondia a migracao anterior
  20260825210000_enforce_workout_set_types_wnf.sql (MD5 do corpo
  e5910ed52937ee4d2d6a58f00a45eccb), que permanece preservada.
- Tabela auditada: 856 kB, aproximadamente 2441 registros no catalogo.
- Conversao smallint -> numeric e sem perda; nao altera cargas, reps ou planos.
- Timeout de lock 5s/statement 30s para abortar se o banco estiver ocupado.
- scripts/rollback-workout-log-replay-20260928.sql restaura o comportamento
  anterior de CAS, mantendo armazenamento e parser numericos. Nunca converter
  de volta para smallint: isso perderia fracoes e reintroduziria o incidente.
- scripts/rollback-workout-log-batch-receipts-20260928.sql restaura o core
  RPE/idempotencia comum como RPC publica, mantendo sequence/revisoes globais
  e receipts privados. Nunca resetar revisoes. Executar somente como migracao
  revisada se houver incidente. Deploy frontend anterior para rollback:
  6ab645e65ee8430390ab3f92, site 9a061d2e-ee2c-444b-aa69-fe262caf0246.
  E uma contingencia degradada: perde recibos duraveis e a ordem de locks do
  wrapper. Preferir correcao forward. Nenhum rollback foi executado.

## Pendencias acumuladas

O inventario anterior permanece em ENTREGA-2026-09-28-ASSINATURA-TEMPLATES-MIDIA.md.
Os itens abaixo nao devem ser tratados como conclusoes desta correcao focada.

- ✅ Cargas com dificuldade fracionaria: corrigido e validado no backend de producao.
- ✅ Reenvio identico de series comuns: confirmado sem duplicar ou incrementar revisao, em producao.
- ✅ Melhorias adicionais do frontend: gate geral aprovado e deploy isolado em producao, sem WIP de WhatsApp.
- ✅ Exclusao/renumeracao idempotente e risco ABA P1: corrigido e canary validado em producao.
- ✅ Salvamento no dispositivo real: usuario confirmou funcionamento.
- ❌ Finalizacao/cronometro no dispositivo real (aguardando): salvamento confirmado; ainda falta prova especifica de finalizacao e recuperacao.
- ❌ Videos (bloqueado): depende de gravacoes; receber, vincular e conferir.
- ❌ Motor de prescricao/progressao/renovacao (aguardando): falta validacao completa; validar regras e perfil de teste, sem migrar prescricoes antigas.
- ❌ Auditoria integral aluno/professor desktop/mobile (aguardando): falta matriz completa; executar por perfil/tela/dispositivo.
- ❌ Cadencia com treinador atribuido, Matheus (aguardando): falta entrega comprovada; implementar e conferir exibicao.
- ❌ Manual tecnico BN, Bruna (bloqueado): depende de conteudo tecnico; obter e validar.
- ❌ Treino ABCDE Taisa e comunicacao (aguardando): falta entrega comprovada; confirmar ficha/destinatario e comprovar entrega, feedback e visibilidade.
- ❌ Git/historico de migracoes (aguardando): drift anterior permanece; reconciliar sem aplicar historico indiscriminadamente. Esta migracao foi alinhada a versao real.
- ❌ Hardening Supabase anterior (aguardando): findings nao revalidados nesta rodada; revisar por prioridade.
- ❌ Assinaturas e templates multimidia (aguardando): codigo local testado, sem publicacao; publicar backend/interface e validar destinatario real.
- ❌ WhatsApp: idempotencia de entrega/limpeza de uploads (aguardando): envios incertos/arquivos sem referencia; reconciliar e aplicar retencao segura.
- ✅ Tipagem geral e suite completa deste release: zero erros TypeScript/lint, 1239 testes aprovados e build final aprovado.
- ❌ Concorrencia SQL multiconexao e retencao de receipts (aguardando): contratos locais sao serializados e ledger nao tem limpeza automatica; executar testes simultaneos em ambiente controlado e definir politica segura de retencao.
