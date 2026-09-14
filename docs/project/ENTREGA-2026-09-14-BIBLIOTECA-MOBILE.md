# Biblioteca de treinos e professor mobile

Baseline: `4e3236b`, branch `codex/sett-hotfix-a-b-integration-20260914`.

## Dados: aplicado em producao

O template relatado tinha quatro IDs ausentes, em cinco posicoes. Foram cadastrados 37 exercicios privados da BN e corrigidos 46 vinculos em sete templates. IDs novos evitam atribuir uma identidade unica a IDs antigos usados com nomes diferentes no historico.

Apenas `exercise_id` mudou no JSON dos templates. Series, repeticoes, ordem, notas, metodos e videos foram preservados. Nenhum treino de aluno, ciclo ou log foi atualizado.

Foram incluidos 11 targets primarios para Dorsal, Deltoide Posterior e Gluteos. Outros cadastros preservam o grupo anatomico explicito de origem pelo fallback existente. Seis snapshots possuem classificacao ampla sem alvo anatomico confirmado: continuam disponiveis, com a lacuna de volume identificavel na interface. Nenhum alvo secundario foi inventado.

Backup e rollback: `~/.codex/private/sett-template-exercise-references/`, diretorio 700 e arquivos 600, fora do Git. Rollback restaura templates apenas se o JSON nao mudou; preserva cadastros novos para evitar quebrar utilizacoes posteriores.

Ensaio transacional com ROLLBACK aprovado, seguido da aplicacao. Pos-flight: 213 posicoes em 12 templates, **zero referencias indisponiveis**. Novo dry-run: zero alteracoes necessarias.

## Interface

- Importacao religa IDs antigos por correspondencia exata unica e visivel, com isolamento de empresa. Recarrega catalogo e targets junto dos templates e identifica por nome qualquer lacuna restante.
- Esteira desktop: colunas legiveis, rolagem horizontal contida e filtro por etapa. Mobile: seletor com contagem e uma etapa integral; nomes e acoes sem cortes.
- Perfil: contatos, acoes, contratos, ciclos e formulario de edicao reorganizados para telas estreitas.
- Prescricao: abas com rolagem, formularios em duas colunas, controles compactos, seletores responsivos e volume abaixo do treino no celular.
- Conversas: lista/conversa/voltar, controles de toque e ajuste por visualViewport para teclado. Dialogo lateral ocupa a largura mobile.
- Layout: navegacao superior acessivel, espacamento mobile reduzido e reserva inferior para controles flutuantes.

## Validacao

- TypeScript do app aprovado; Vitest integral: 174 arquivos, 1.141 testes.
- Reparador: oito testes Node e ensaio SQL real revertido.
- ESLint dos arquivos de produto alterados sem erros; build e backend canonico aprovados.
- QA de navegador usa componentes reais e dados sinteticos, com chamadas externas bloqueadas. Nenhuma mensagem real enviada e nenhum treino de aluno salvo para testes.

## Pendencias e escopo anterior

- Videos reais aguardam gravacoes; pipeline de preparacao pronto na entrega anterior.
- Ultima auditoria historica: 99 IDs orfaos. Este reparo nao altera IDs dos treinos historicos; nao reduzimos a contagem por inferencia.
- Tres contatos sem telefone confirmado permanecem inalterados.
- Recuperacao e feedback do aluno estavam publicados em `6aa7ef0cd5c01b9e1be44e49`. Recebimento real de recuperacao de senha continua sem canario de destinatario real nesta rodada.
- Outras entregas mantem seus registros anteriores. Esta rodada nao equivale a nova auditoria de todo o backlog.

## Publicacao

Dados aplicados no Supabase `zshrcgbyhzxpnlccssyz`. Frontend aguardando fechamento de QA e promocao do build aprovado no site Netlify `9a061d2e-ee2c-444b-aa69-fe262caf0246`. Deploy anterior preservado para rollback.
