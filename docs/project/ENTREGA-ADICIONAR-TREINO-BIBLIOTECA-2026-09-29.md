# Adicionar treino da biblioteca sem substituir

Data: 29/09/2026. Baseline: `e84416f`.
Checkout: `sett-load-save-release-20260928`.
Execucao: ATENA/Codex; browser: Mill; revisao independente: Erdos.
Skill aplicada: 121, Debugger Sistematico (Causa Raiz).

## Escopo

- [x] Botao `Adicionar` direto no seletor de treinos da biblioteca quando o
  rascunho atual ja tem conteudo. A logica de append ja existia, mas estava
  disponivel apenas depois de `Usar este treino` abrir a confirmacao.
- [x] Acrescentar as sessoes importadas apos as sessoes existentes, sem apagar
  o rascunho atual nem alterar o template original.
- [x] Preservar `Usar este treino` e a confirmacao `Substituir treino atual`.
- [x] Persistir o conjunto completo somente em `Salvar Tudo`, usando o RPC de
  revisao atomica existente e o snapshot de concorrencia original.
- [x] Preservar metricas legadas nas sessoes existentes; inicializacao semanal
  somente nas novas sessoes importadas, sem migracao dos treinos ativos.
- [x] Impedir importacao/substituicao enquanto ha salvamento em andamento.
- [x] Manter acoes fora da grade rolavel da biblioteca, no rodape da janela;
  lista menor no mobile e conteudo rolavel, evitando botoes cortados.

Nenhuma alteracao de schema, politica, credencial, motor ou dados de alunos.
Os testes usam fixtures sinteticas e nao salvam prescricoes reais.

## Validacao

- Build local e gates de backend, rollout e desempenho: aprovados.
- Lint dos arquivos alterados: aprovado, sem warnings.
- Contratos de importacao, semanas legadas, editor e revisao: 43/43 aprovados.
- Novos testes montados: 2/2 aprovados; append salva todas as sessoes e suas
  metricas, enquanto cancelamento/substituicao mantem a confirmacao explicita.
- Primeira rodada montada: os oito casos anteriores passaram; dois novos
  falharam por seletores do teste. Seletores corrigidos, sem alterar o produto
  para contornar a falha. Uma reexecucao intermediaria identificou consulta fora
  da arvore acessivel de um modal aberto; corrigida no teste.
- TypeScript identificou `exact` invalido nos testes Testing Library; trocado
  por regex ancorada. Reexecucao TypeScript final aprovada.
- Revisao independente do produto: aprovada, com 10/10 testes montados apos a
  correcao do rodape e lint focado aprovado. Reexecucao root final: 10/10.
- Browser identificou botoes cortados no mobile: correcao aplicada no produto,
  sem relaxar asserts. Layout estrito passou em 1440/390/320 pixels.
- Browser final: 9/9 Playwright aprovados. Reexecucao independente do root:
  3/3 casos de Adicionar em 1440/390/320 pixels, com salvamento combinado,
  preservacao do rascunho e template imutavel. Capturas finais inspecionadas.
- Fixture anterior nao simulava a nova RPC de recuperacao dos exercicios
  legados. Atualizacao restrita ao ambiente sintetico, com ACK positivo,
  isolamento de empresa/ator e rejeicao de chamadas inesperadas. Revisao
  independente: aprovada; contrato sintetico 6/6 e tipos focados sem diagnosticos.

## Estagios e checklist acumulado

- [x] Implementacao integrada neste checkout e servidor local preservado em
  http://localhost:8096. HTTP 200 confirmado.
- [x] Commit local de codigo `3d86ab0`; integrado e publicado nesta entrega,
  sem push ou merge em `origin/main`.
- [x] Publicacao deste novo botao: autorizada pelo usuario em 29/09/2026 e
  concluida. Fonte publicada `3d86ab0`; novo build production e TypeScript
  aprovados, revisao independente, 10/10 testes montados e lint aprovados.
  Preview e producao conferidos; sem push ou merge em `origin/main` nesta demanda.
- [x] Recuperacao automatica de exercicios, historico e copia individual:
  publicados na entrega anterior, deploy `6abbb556098af04ac0d431e1`.
- [x] Ajustes anteriores e itens dispensados: continuam registrados nos
  relatorios abaixo, sem reabrir trabalho removido pelo usuario.
- [x] Confirmacao visual da assinatura no celular: confirmada pelo usuario em
  29/09/2026. Nenhum novo envio nesta demanda.

Relatorios acumulados:

- [Recuperacao da biblioteca e historico](ENTREGA-RECUPERACAO-BIBLIOTECA-2026-09-29.md).
- [Versoes antigas e copia individual](ENTREGA-HISTORICO-BIBLIOTECA-2026-09-29.md).
- [Demais ajustes e pendencias anteriores](ENTREGA-AJUSTES-2026-09-29.md).

## Publicacao de 29/09/2026

- Preview `6abbbd2fd721d900d38570d3`, estado `ready` confirmado.
- Producao `6abbbdd0a5843c00de1c7687`, estado `ready` e site correto confirmados
  pelo CLI em https://www.settapp.com.br.
- Nove arquivos criticos (HTML, service worker e sete chunks) conferidos por
  SHA256 e HTTP 200 na previa e no dominio principal, identicos ao build local.
- Reexecucao HTTP independente de Erdos em producao: 9/9 identicos, todos
  HTTP 200, service worker com `no-cache`; sessao encerrada sem escrita remota.
- Service worker permanece network-first para HTML e cache-first para assets
  com hash; nenhuma mudanca estrutural nesta entrega. `/sw.js` com `no-cache`.
- Browser production: tela de acesso renderizada em 390 e 1440 pixels, sem
  pageerror ou overflow horizontal. Nenhum login/submissao ou salvamento real.
- Evidencias preservadas em `output/additive-release-20260929/`.
- Primeiro comando de upload foi encerrado sem confirmar um deploy; segunda
  tentativa concluiu a previa. Envio production feito de copia isolada do build.
- Nenhuma migration, backfill, escrita de aluno ou envio de mensagem.

Os testes funcionais de Adicionar/Substituir foram locais e sinteticos; os
arquivos publicados sao os mesmos validados. Nao houve alteracao de uma
prescricao real para testar producao. Assinatura confirmada pelo usuario.

Rollback: republicar `6abbb556098af04ac0d431e1`; nenhum rollback de banco
necessario. Localmente, revert do commit `3d86ab0`.
