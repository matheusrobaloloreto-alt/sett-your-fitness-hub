# MFIT para SETT — reconciliação de produção em 2026-08-27

## Veredito

A importação acumulada fechou 87 planos ativos elegíveis do recorte MFIT disponível, sem importar por nome apenas e sem substituir exercícios por semelhança duvidosa. O lote novo desta rodada adicionou 3 planos, 9 treinos e 66 ocorrências de exercícios. Três exercícios ausentes foram criados com os nomes exatos da origem.

Uma nova captura autenticada em 2026-08-27 confirmou 264 clientes ativos no MFIT. Entre os 42 clientes que puderam ser vinculados com segurança ao SETT, foram auditados 87 planos ativos e 308 sessões: não houve plano adicionado, removido ou com metadado alterado desde 2026-08-26. Houve cinco mudanças reais de carga em dois planos; elas foram aplicadas em produção por um reconciliador com compare-and-swap e duas leituras posteriores.

Esta evidência não significa que todo o MFIT esteja encerrado: oito planos de dois clientes permanecem bloqueados porque só existe correspondência por nome, e 192 planos pertencem a pessoas sem correspondência na base ativa do SETT usada nesta auditoria. Uma revisão logada dos dois cadastros no MFIT em 2026-08-27 confirmou que os campos de e-mail e WhatsApp estão vazios na própria origem.

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

## Verificação pós-aplicação

O mesmo lote foi executado duas vezes em modo somente leitura depois da aplicação:

- 3 planos retornaram `already_imported`;
- 0 operações candidatas;
- 0 exercícios a criar;
- 100% de cobertura do catálogo para o lote;
- hash normalizado idêntico nas duas execuções: `68bb23a215fec9ef035098316f3851430fd7e0d3a3cc8bb8cb850e6a94268c05`.

A reconciliação global também foi repetida duas vezes:

- 287 planos ativos na captura MFIT;
- 55 alunos ativos/aguardando renovação no recorte SETT;
- 86 planos reconhecidos imediatamente como já importados;
- 1 plano já tratado por auditoria específica de sessões vazias, mas bloqueado no modo global porque a captura atual da origem está incompleta;
- 8 planos bloqueados por correspondência apenas nominal;
- 192 planos sem correspondência com o recorte ativo do SETT;
- 0 nova operação candidata;
- 488/488 exercícios requeridos cobertos;
- hash normalizado idêntico nas duas execuções globais: `abafef4d67d01450c02477e40b066a69d97b9389b5470265429473e7c8d2cfe0`.

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

1. Não importar os 8 planos com correspondência apenas por nome. O MFIT não possui telefone nem e-mail nesses dois cadastros; próximo passo: obter evidência independente de identidade e só então reconciliar os registros no SETT.
2. Não importar os 192 planos de pessoas fora do recorte ativo identificado no SETT. Próximo passo: vincular primeiro o aluno correto e confirmar que continua ativo no produto.
3. Curar vídeo, equipamento e metadados dos três exercícios criados. Isso não bloqueia a fidelidade do treino, mas permanece como acabamento de biblioteca.

## Código e estágio real

- Importador e testes: idênticos entre a branch MFIT e `origin/main`.
- Testes do importador: 78/78 aprovados antes da aplicação.
- Reconciliador incremental: código local testado; aplicação de dados executada e pós-auditada em produção.
- Banco de produção: lote novo e cinco ajustes de carga aplicados e pós-auditados.
- Dados privados: snapshots, backup e relatórios com PII mantidos fora do Git com permissão restrita.
