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
- Suite `qa/teacher-mobile.e2e.ts`: dez testes aprovados na reexecucao final principal (21,8 s), apos corrigir dados/expectativas do harness. Inclui quatro larguras, perfil, Studio, chat, teclado, esteira e importacao/salvamento.
- Gate independente e reexecucao principal aprovaram importacao/religacao/salvamento por revisao simulada, troca de etapa e conversa com teclado simulado. Telas verificadas em 360, 390, 768 e 1440 pixels. Isso nao equivale a teste em aparelho fisico ou sessao autenticada de producao.

## Pendencias e escopo anterior

- Videos reais aguardam gravacoes; pipeline de preparacao pronto na entrega anterior.
- Ultima auditoria historica: 99 IDs orfaos. Este reparo nao altera IDs dos treinos historicos; nao reduzimos a contagem por inferencia.
- Tres contatos sem telefone confirmado permanecem inalterados.
- Recuperacao e feedback do aluno estavam publicados em `6aa7ef0cd5c01b9e1be44e49`. Recebimento real de recuperacao de senha continua sem canario de destinatario real nesta rodada.
- Outras entregas mantem seus registros anteriores. Esta rodada nao equivale a nova auditoria de todo o backlog.

## Publicacao

Dados aplicados no Supabase `zshrcgbyhzxpnlccssyz`. Codigo de produto commitado e enviado ao origin em `c13c01b`.

Frontend publicado no site Netlify `9a061d2e-ee2c-444b-aa69-fe262caf0246`, deploy `6aa7f6ecdc90f80ead2b7e7d`, em https://www.settapp.com.br. Foi promovido o mesmo `dist` aprovado em build, sem recompilacao durante o deploy.

URL imutavel: https://6aa7f6ecdc90f80ead2b7e7d--bn-performance-webapp-matheus.netlify.app.

Pos-deploy: HTML de producao aponta para `index-DJl4UWxX.js`, identico ao build aprovado. HTML, rotas `/admin/registration` e `/auth` e chunks de WorkoutBuilder, RegistrationManager e WhatsAppChat responderam HTTP 200. A validacao funcional autenticada foi feita no harness local, nao na conta de um aluno/professor em producao.

Rollback de frontend: deploy anterior `6aa7ef0cd5c01b9e1be44e49`, preservado. Rollback de dados separado conforme backup privado acima.
