# MFIT para SETT — reconciliação de produção em 2026-08-27

## Veredito

A migração avançou sem usar nome como prova de identidade e sem substituir exercícios por semelhança biomecanicamente duvidosa. Além do lote anterior de 3 planos, 9 treinos e 66 ocorrências, os oito planos que estavam bloqueados por identidade foram aplicados individualmente e estão reconhecidos como idempotentes no inventário global.

Uma nova captura autenticada em 2026-08-27 confirmou 264 clientes ativos no MFIT. Entre os 42 clientes que puderam ser vinculados com segurança ao SETT, foram auditados 87 planos ativos e 308 sessões: não houve plano adicionado, removido ou com metadado alterado desde 2026-08-26. Houve cinco mudanças reais de carga em dois planos; elas foram aplicadas em produção por um reconciliador com compare-and-swap e duas leituras posteriores.

Os dois clientes antes bloqueados foram liberados somente depois de prova independente: um único aluno SETT com nome exato, uma única conversa direta cujo telefone coincide com o MFIT, nome do contato confirmado pelo provedor e histórico de 89/75 mensagens recebidas. O reparo atualizou telefone e WhatsApp de 2/2 alunos, sem inventar contato, e os oito planos passaram por aplicação unitária e dois pós-audits cada.

O inventário global atual ainda não autoriza declarar "100% encerrado": 89 planos estão reconhecidos como `already_imported`; duas fichas com marcador de importação divergem do payload esperado e foram preservadas sem sobrescrita; uma ficha está com captura incompleta na origem; 195 planos não têm correspondência por telefone/e-mail com o recorte ativo do SETT.

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
- 2 planos já materializados com conteúdo divergente, bloqueados contra sobrescrita ou duplicação;
- 1 plano bloqueado porque a captura da origem está incompleta;
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

## Gates que continuam fechados

1. Não sobrescrever os dois planos com `cycle_contains_different_workouts`. A divergência prova que o conteúdo materializado no SETT não é idêntico ao payload esperado; próximo passo: revisão técnica lado a lado antes de decidir qual versão preservar.
2. Não importar o plano com `source_capture_incomplete`. Próximo passo: recapturar a ficha completa no MFIT e repetir os dry-runs.
3. Não importar os 195 planos sem correspondência de contato com o recorte ativo identificado no SETT. Próximo passo: vincular primeiro o aluno correto e confirmar que continua ativo no produto.
4. Curar vídeo, equipamento e metadados dos três exercícios criados. Isso não bloqueia a fidelidade do treino, mas permanece como acabamento de biblioteca.

## Código e estágio real

- Importador, reparo de identidade e alias: publicados na branch `codex/sett-release-rc-20260826`; `origin/main` não foi avançada nesta etapa operacional.
- Testes do importador: 78/78; testes do reparo de identidade: 11/11.
- Reconciliador incremental: código local testado; aplicação de dados executada e pós-auditada em produção.
- Banco de produção: lote anterior, cinco ajustes de carga, dois contatos e oito novos planos aplicados e pós-auditados.
- Dados privados: snapshots, backup e relatórios com PII mantidos fora do Git com permissão restrita.
