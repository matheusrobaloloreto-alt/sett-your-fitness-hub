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
- [x] Commit local desta entrega; sem push, preview remoto ou deploy novo.
- [ ] Publicacao deste novo botao (aguardando): ainda local, sem deploy ou push
  nesta demanda; proxima acao e publicar apos os gates e autorizacao especifica.
- [x] Recuperacao automatica de exercicios, historico e copia individual:
  publicados na entrega anterior, deploy `6abbb556098af04ac0d431e1`.
- [x] Ajustes anteriores e itens dispensados: continuam registrados nos
  relatorios abaixo, sem reabrir trabalho removido pelo usuario.
- [ ] Confirmacao visual da assinatura no celular (aguardando): falta a
  conferencia do destinatario; nenhum novo envio nesta demanda.

Relatorios acumulados:

- [Recuperacao da biblioteca e historico](ENTREGA-RECUPERACAO-BIBLIOTECA-2026-09-29.md).
- [Versoes antigas e copia individual](ENTREGA-HISTORICO-BIBLIOTECA-2026-09-29.md).
- [Demais ajustes e pendencias anteriores](ENTREGA-AJUSTES-2026-09-29.md).

Rollback: revert do commit desta entrega; nenhum rollback de banco necessario.
