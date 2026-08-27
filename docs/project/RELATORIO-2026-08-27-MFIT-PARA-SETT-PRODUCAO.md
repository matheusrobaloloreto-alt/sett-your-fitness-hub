# MFIT para SETT — reconciliação de produção em 2026-08-27

## Veredito

A migração avançou sem usar nome como prova de identidade e sem substituir exercícios por semelhança biomecanicamente duvidosa. Além do lote anterior de 3 planos, 9 treinos e 66 ocorrências, os oito planos que estavam bloqueados por identidade foram aplicados individualmente e estão reconhecidos como idempotentes no inventário global.

Uma nova captura autenticada em 2026-08-27 confirmou 264 clientes ativos no MFIT. Entre os 42 clientes que puderam ser vinculados com segurança ao SETT, foram auditados 87 planos ativos e 308 sessões: não houve plano adicionado, removido ou com metadado alterado desde 2026-08-26. Houve cinco mudanças reais de carga em dois planos; elas foram aplicadas em produção por um reconciliador com compare-and-swap e duas leituras posteriores.

Os dois clientes antes bloqueados foram liberados somente depois de prova independente: um único aluno SETT com nome exato, uma única conversa direta cujo telefone coincide com o MFIT, nome do contato confirmado pelo provedor e histórico de 89/75 mensagens recebidas. O reparo atualizou telefone e WhatsApp de 2/2 alunos, sem inventar contato, e os oito planos passaram por aplicação unitária e dois pós-audits cada.

Uma auditoria composta posterior reconciliou as três exceções aparentes do inventário global. As duas fichas marcadas como divergentes contêm somente as cinco alterações de carga descritas acima, já aplicadas por compare-and-swap e confirmadas por duas leituras posteriores. A ficha marcada como captura incompleta tem quatro sessões: duas com conteúdo e duas comprovadamente vazias em recaptura autenticada da origem; ela já havia sido importada com a exceção explícita para sessões vazias verificadas e o pós-audit retorna `already_imported`. Resultado final do escopo identificável: 89 planos exatamente idempotentes + 2 reconciliados por carga + 1 com sessões vazias verificadas = 92/92 planos correspondentes tratados e 0 correspondente sem resolução.

## Resultado do lote novo

- 3/3 planos aplicados em produção;
- 3/3 identidades confirmadas por telefone;
- 9 sessões de treino criadas;
- 66 ocorrências de exercícios normalizadas;
- 3 novos exercícios criados com nome exato:

  - Flexão de Braço no Smith;
  - Plank with Forearm Support I Fitball;
  - Rosca Inversa com Halteres;

- nenhum candidato aproximado foi aceito como substituto;
- backup privado anterior à escrita concluído, com hash SHA-256 registrado fora do repositório;
- nenhuma atualização ou exclusão de treino/exercício existente.

## Verificação pós-aplicação dos oito planos liberados

Cada plano foi executado isoladamente e recebeu:

- duas simulações idênticas antes da escrita;
- aplicação com resultado `imported`;
- dois pós-audits com `already_imported`;
- 100% de cobertura do catálogo;
- 0 atualização ou exclusão de treino existente.

A reconciliação global também foi repetida duas vezes:

- 287 planos ativos na captura MFIT;
- 55 alunos ativos/aguardando renovação no recorte SETT;
- 89 planos reconhecidos imediatamente como já importados, incluindo os oito liberados;
- 2 planos reconhecidos pela auditoria composta como as cinco cargas já reconciliadas e pós-auditadas;
- 1 plano reconhecido como importado após recaptura confirmar duas sessões genuinamente vazias;
- 195 planos sem correspondência com o recorte ativo do SETT;
- 0 plano bloqueado apenas por nome entre os dois cadastros reparados;
- 0 nova operação candidata;
- 484/484 exercícios requeridos cobertos;
- 77 aliases aprovados carregados e 76 efetivamente usados neste recorte; o novo alias `Desenvolvimento Máquina (Pegada Neutra)` → `Desenvolvimento Neutro Máquina` preserva máquina, pegada neutra e padrão de empurrar vertical;
- hash normalizado idêntico nas duas execuções globais: `b797e6aba3aa9562ace0f93581e0ac27a2edbaa6be7a00987aca4ff09cb443ac`.

## Atualização incremental de 2026-08-27

- captura autenticada: 264 clientes ativos;
- recorte com identidade confiável: 42 clientes, 87 planos ativos e 308 sessões;
- 0 planos adicionados, removidos ou com metadado alterado no recorte;
- 5 cargas alteradas em 2 planos e 2 treinos;
- pré-auditoria direcionada: 2 marcadores, 6 treinos e 57 linhas normalizadas;
- duas execuções dry-run idênticas antes da escrita;
- aplicação em produção: 5/5 alterações;
- duas leituras pós-aplicação e duas novas execuções dry-run retornaram `already_applied`;
- diff profundo pré/pós: exatamente 10 valores primitivos esperados — carga no exercício e na prescrição semanal para cada uma das cinco alterações — e 0 caminho inesperado;
- nenhum treino foi criado, excluído ou reordenado nessa atualização.

O reconciliador incremental está em `scripts/mfit-active-workouts-reconcile.mjs`, acompanhado por quatro testes de contrato: escopo por marcador, idempotência, rejeição de slot duplicado e compare-and-swap com dupla pós-auditoria. Ele é separado do importador imutável original para não disfarçar uma atualização de carga como nova importação.

## Fechamento composto do escopo correspondente

- 89 planos exatamente idempotentes;
- 2 planos com cinco mudanças de carga verificadas contra o manifesto de reconciliação e dois pós-audits `already_applied`;
- 1 plano com duas sessões vazias verificadas na origem e pós-audit `already_imported`;
- 92/92 planos com identidade correspondente tratados;
- 0 plano correspondente sem resolução;
- 484/484 exercícios requeridos cobertos.

Os 195 planos sem correspondência de telefone/e-mail com o recorte ativo identificado no SETT permanecem fora do escopo de escrita: não são pendências de alunos ativos identificados no produto. Só entram no pipeline se uma evidência independente futura vincular o cliente MFIT a um aluno SETT ativo. Nome parecido, sozinho, continua insuficiente.

O acabamento de vídeo, equipamento e metadados dos três exercícios criados não bloqueia a fidelidade do treino e permanece na fila de curadoria da biblioteca.

## Código e estágio real

- Importador, reparo de identidade e alias: publicados na branch `codex/sett-release-rc-20260826`; `origin/main` não foi avançada nesta etapa operacional.
- Testes do importador: 78/78; testes do reparo de identidade: 11/11.
- Reconciliador incremental: código local testado; aplicação de dados executada e pós-auditada em produção.
- Banco de produção: lote anterior, cinco ajustes de carga, dois contatos e oito novos planos aplicados e pós-auditados; auditoria composta confirma 92/92 planos correspondentes tratados e não executou nova escrita.
- Dados privados: snapshots, backup e relatórios com PII mantidos fora do Git com permissão restrita.
