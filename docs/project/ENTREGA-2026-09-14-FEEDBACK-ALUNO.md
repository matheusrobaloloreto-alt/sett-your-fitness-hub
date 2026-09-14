# Feedback do aluno: cargas, aquecimento e calendario

## Estado

- Implementado e validado localmente na branch `codex/sett-hotfix-a-b-integration-20260914`, sobre `dc2f371`.
- Publicacao em producao aguardando autorizacao solicitada nesta conversa. Nenhum deploy ou migration neste pacote.
- O aluno do feedback ainda nao foi identificado; o nome foi solicitado sem interromper as correcoes gerais.

## Diagnostico confirmado

1. O SELECT de `workout_logs` incluia `client_updated_at`, inexistente no schema de producao. Esse timestamp e do rascunho local. A consulta falhava e o erro era ignorado, sem carregar cargas, checks ou revisoes para o CAS. O novo leitor usa somente colunas existentes, pagina o historico por aluno e propaga falhas.
2. `WarmupGuide` fechava o dialog para abrir o player externo e apagava checks/timer quando `open=false`. O player agora fica dentro do mesmo dialog; voltar, Escape ou fechar o player retorna ao aquecimento. O checklist continua por treino/dia; outra selecao reinicia a instancia.
3. O calendario considerava qualquer log como treino, enquanto a barra semanal exigia check ou sessao concluida. Ambas as superficies agora usam o mesmo criterio, incluindo sessoes concluidas sem cargas. Rascunhos locais sobrescrevem as mesmas series na exibicao. Historico de revisoes anteriores nao desaparece ao substituir uma prescricao.
4. Todos os movimentos do checklist existente receberam instrucoes curtas. A allowlist agora reconhece os nomes canonicos de Flexao de Bracos e Abdominal Dead Bug. Deltoide lateral/posterior deixou de acionar, por substring, aquecimento de dorsal/posterior de coxa.

## Validacoes

- 78/78 testes em 17 arquivos do aluno, calendario, videos, drafts, persistencia e concorrencia.
- 3/3 cenarios Playwright; celular 390x844 e desktop 1440x900. Checks preservados ao voltar e ao fechar o video; inspecao visual sem overflow horizontal.
- `tsc -p tsconfig.app.json --noEmit`: zero erros.
- ESLint direcionado: zero erros; dois avisos de dependencias de hooks preexistentes no portal.
- `npm run build`: aprovado; backend canonico e gate de consentimento aprovados.
- Schema vivo: zero colunas ausentes no novo SELECT.
- Producao: 100/100 treinos no canario transacional de cargas; 10/10 em salvar, salvar novamente com revisao atual e rejeitar revisao obsoleta. Cada caso foi desfeito por subtransacao e o teste completo terminou em ROLLBACK; nenhum log de aluno foi alterado permanentemente.
- Testes de navegador usam fixtures sinteticas. Nao equivalem a uma sessao autenticada do aluno do feedback.

## Pendencias e limites

- Publicacao (aguardando): obter autorizacao, publicar o build validado e comparar os assets remotos.
- Videos ausentes (aguardando): alguns movimentos ainda nao possuem midia canonica. Instrucoes escritas e ausencia de video estao explicitas; nao foram gerados, gravados ou inventados videos. Resolver exige demonstracao apropriada no catalogo.
- Caso individual (aguardando): receber o nome do aluno e verificar o treino especifico. A falha geral do SELECT e comprovada, mas nao prova que nao existam outros erros naquele aparelho.

## Rollback

Mudanca somente frontend, sem alteracao de schema/dados. Antes de publicar, revalidar o deploy atual; o ultimo frontend conhecido era `6aa7c496a5370b53239a1052`. Em regressao, restaurar o deploy anterior confirmado. Nao reverter dados ou reparos de biblioteca.

Metodo: ATENA, skill 121 (Debugger Sistematico / Causa Raiz). Nao havia ferramenta de subagente disponivel nesta sessao; execucao e segunda revisao foram feitas nesta tarefa, sem alegar QA humano/independente.
