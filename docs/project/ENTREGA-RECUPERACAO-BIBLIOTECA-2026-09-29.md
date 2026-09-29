# Recuperacao automatica dos exercicios e publicacao do historico

Data: 29/09/2026. Baseline local: `2ca8229`. Producao anterior: `18e33b0`.
Checkout exclusivo: `sett-load-save-release-20260928`.
Owner: ATENA/Codex; banco/helper: Mill; QA independente: Erdos.
Skill aplicada: 121, Debugger Sistematico (Causa Raiz), e Netlify Deploy.

## Problema e correcao

O editor e a exportacao dependiam de referencias de exercicios visiveis na
biblioteca. O reparo anterior religava nomes encontrados, mas bloqueava uma
referencia que continuasse ausente. Agora esses fluxos compartilham a mesma
recuperacao antes da auditoria e da persistencia da prescricao/template:

- [x] Reconsultar o catalogo completo da empresa e os exercicios globais.
- [x] Reutilizar correspondencias existentes e corrigir referencias antigas.
- [x] Cadastrar os exercicios ausentes na biblioteca privada da empresa atual.
- [x] Confirmar o cadastro e reler sua visibilidade antes de salvar o plano.
- [x] Preservar series, repeticoes, descanso, cadencia, tipos, semanas, grupos,
  observacoes, midias e demais dados do rascunho; alterar somente a referencia.
- [x] Aceitar snapshots nomeados da biblioteca como rascunho; cadastrar somente
  quando o profissional efetivamente manda salvar, nao ao abrir/importar.
- [x] Usar o mesmo fluxo em salvar o ciclo, confirmar conflito, editar template e
  exportar uma versao antiga/plano completo/treino individual para a biblioteca.
- [x] Evitar duplicacao em chamadas concorrentes desta RPC e tentativas repetidas.
- [x] Descartar respostas antigas apos troca de ciclo, empresa, usuario ou pagina;
  um salvamento antigo nao desbloqueia nem altera um salvamento mais recente.
- [x] Renovar o cache do service worker para `sett-cache-v7`.

O cadastro e sempre da empresa, nunca global automaticamente. A RPC recebe apenas
nome e metadados permitidos; nao recebe ID privado de outra empresa, observacoes
do aluno, dados de saude ou identidade informada pelo cliente. Autenticacao,
membership, RLS e isolamento entre empresas continuam obrigatorios.

Nomes vazios, dados malformados, permissoes insuficientes e correspondencias
ambiguas continuam impedindo um falso salvamento. Nao se escolhe um exercicio
incerto nem se simula confirmacao do banco para esconder o erro.

## Validacao e gates

- Helper: 37 testes aprovados pelo executor e pela raiz.
- Editor montado, exportacao, importacao e helper: 80 testes aprovados pela raiz,
  incluindo 8 regressao do editor real com requests pendentes e trocas de rota.
- QA independente: 17 fluxos Playwright em 320, 390 e 1440 pixels; reexecucao root
  tambem 17/17. Nenhuma requisicao externa permitida nessas fixtures sinteticas.
- Migration: 13 testes PGlite independentes; PostgreSQL local 7/7 runtime e
  5/5 contratos pelo executor. Fixtures corrigidas para stdin/ACK explicito,
  limpeza segura apos timeout e menos aberturas repetidas de conexoes. Funcao
  SQL e helper permanecem identicos aos revisados; reexecucao root final 12/12
  aprovada, inclusive concorrencia em 3,10 s e replay em 483 ms.
- TypeScript, lint dos arquivos alterados e build local: aprovados apos os guards.
- Primeiro lote geral: 1409 aprovados, 1 falha no guard de rota anterior e 7
  PostgreSQL opt-in ignorados. Guard corrigido e coberto no editor montado.
- Segundo lote geral: 1412 aprovados, 5 falhas e 7 PostgreSQL opt-in ignorados.
  Quatro falhas foram timeouts e uma foi o benchmark sob carga. Reexecucao
  sequencial dos quatro arquivos envolvidos: 40/40 aprovados; CPU mediana do
  motor 411,51 ms, dentro do teto original de 500 ms. Nao aumentamos timeouts.
- O teste de paginacao foi tornado menos custoso no JSDOM, mantendo as 21 linhas,
  os botoes, o carregamento pendente e os intervalos de consulta. Duas rodadas
  independentes 8/8; root 8/8, com paginacao em 703 ms. Sem mudanca no produto.
- Verificador de publicacao: 13 checks offline independentes, incluindo recusa
  de redirects, porta alternativa, mismatch e cache inseguro. Fonte aprovada.

## Checklist acumulado e estagios

- Ajustes anteriores publicados: assinatura ON/OFF, templates multimidia,
  salvamento/finalizacao do aluno, anamnese, semanas e demais itens permanecem
  registrados em [entrega anterior](ENTREGA-AJUSTES-2026-09-29.md).
- Historico e copia por sessao: commit `2ca8229`, gate independente aprovado e
  publicado em producao nesta entrega;
  detalhamento em [historico/biblioteca](ENTREGA-HISTORICO-BIBLIOTECA-2026-09-29.md).
- Recuperacao automatica: integrada no checkout exclusivo, commit `c583c10`;
  fonte aprovada pelo QA independente, TypeScript/build/lint e PostgreSQL
  aprovados. Publicada em producao nesta entrega.
- Deploy das duas melhorias: autorizado na resposta mais recente do usuario e
  concluido. Migration aplicada; preview e producao conferidos por SHA256 dos
  nove arquivos criticos. Nenhum push ou merge em `origin/main` nesta tarefa.
- Confirmacao da assinatura no celular: aguardando conferencia do usuario;
  nenhuma mensagem adicional enviada nesta tarefa.
- Itens dispensados pelo usuario: continuam retirados, nao reabertos.

## Publicacao e rollback

Destino: https://www.settapp.com.br, Netlify `9a061d2e-ee2c-444b-aa69-fe262caf0246`,
Supabase `zshrcgbyhzxpnlccssyz`. Producao anterior conferida pelo CLI:
`6abb87d91ee4554a4dd518e5`, estado `ready`.

Ordem: gates locais/independentes -> migration additive revisada -> preview ->
conferencia de arquivos -> producao -> conferencia de arquivos/metadados.
Nao executar `db push` nem reaplicar migrations historicas indiscriminadamente.

Migration aplicada: `20260929125055_recover_workout_library_references.sql`.
Nome/timestamp alinhados ao registro efetivo do conector, sem reaplicar SQL.
Corpo da funcao instalado identico ao arquivo revisado, SECURITY INVOKER,
search_path fixo e EXECUTE anonimo bloqueado, conferidos por leitura de metadados.
Sem backfill, mudanca de politicas, publicacao global ou escrita em prescricoes.
Preview aprovado: `6abbb459cc45fb35ea00df4b`.
Producao publicada: `6abbb556098af04ac0d431e1`, estado `ready` confirmado pelo
CLI. HTML, service worker e sete chunks criticos sao identicos ao build local,
com SHA256 e HTTP 200 conferidos no dominio principal. Cache do service worker
responde com `no-cache`. Evidencias tecnicas locais em
`output/library-release-20260929/{preview,production}-verification.json`.
Servidor local preservado em http://localhost:8096, HTTP 200 confirmado.

Checklist de entrega:

- [x] Cadastro automatico dos exercicios ausentes na empresa antes de salvar.
- [x] Consulta das versoes antigas sem alterar a prescricao atual.
- [x] Copia do plano completo ou de um unico treino para a biblioteca.
- [x] Revisao independente, testes locais, migration, preview e producao.
- [ ] Confirmacao visual da assinatura no celular do usuario (aguardando).
  O teste autorizado anterior foi entregue; falta a conferencia do destinatario.
  Nao houve novo envio nem reabertura dos itens dispensados.

O endereco imutavel de um deploy antigo nao passa a mostrar a versao nova;
apos a publicacao, utilizar o dominio principal.

Rollback: republicar o deploy anterior e manter a funcao additive. Cadastros
criados legitimamente devem ser preservados. Se o plano falhar depois do cadastro,
o cadastro pode permanecer na biblioteca; uma tentativa posterior o reutiliza.
O lock deduplica chamadas desta RPC, nao todos os outros editores de catalogo.
As versoes historicas sao somente leitura e nunca restauram o treino ativo
automaticamente. Testes sinteticos nao equivalem a executar um salvamento real
na conta de um aluno; isso nao foi feito para validar esta entrega.
