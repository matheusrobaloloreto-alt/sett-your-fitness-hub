# MFIT para SETT — reconciliação de produção em 2026-08-27

## Veredito

A importação acumulada fechou 87 planos ativos elegíveis do recorte MFIT disponível, sem importar por nome apenas e sem substituir exercícios por semelhança duvidosa. O lote novo desta rodada adicionou 3 planos, 9 treinos e 66 ocorrências de exercícios. Três exercícios ausentes foram criados com os nomes exatos da origem.

Esta evidência não significa que todo o MFIT esteja encerrado: a captura de origem foi feita em 2026-08-26. Oito planos de dois clientes permanecem bloqueados porque só existe correspondência por nome, e 192 planos pertencem a pessoas sem correspondência na base ativa do SETT usada nesta auditoria.

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

## Gates que continuam fechados

1. Não importar os 8 planos com correspondência apenas por nome. Próximo passo: confirmar telefone ou e-mail dos dois clientes na origem ou obter uma evidência independente de identidade.
2. Não declarar a migração integralmente encerrada com uma captura MFIT de 2026-08-26. Próximo passo: gerar uma captura nova e repetir a reconciliação global.
3. Curar vídeo, equipamento e metadados dos três exercícios criados. Isso não bloqueia a fidelidade do treino, mas permanece como acabamento de biblioteca.

## Código e estágio real

- Importador e testes: idênticos entre a branch MFIT e `origin/main`.
- Testes do importador: 78/78 aprovados antes da aplicação.
- Banco de produção: lote novo aplicado e pós-auditado.
- Dados privados: snapshots, backup e relatórios com PII mantidos fora do Git com permissão restrita.
