# Historico de planos e copia para a biblioteca

Data: 29/09/2026. Baseline local: `18e33b0`. Branch: `codex/sett-load-save-release-20260928`.

## Escopo entregue localmente

- [x] Abrir cada registro de "Versoes do plano" em uma janela de somente leitura.
- [x] Consultar exercicios, series, repeticoes, descanso, cadencia, RIR, sistemas, grupos, tipos de serie e observacoes registrados.
- [x] Consultar as semanas efetivamente armazenadas, sem inventar semanas ou migrar prescricoes antigas.
- [x] Salvar uma copia do plano completo ou apenas um treino escolhido na biblioteca da empresa.
- [x] Disponibilizar a mesma escolha no editor atual, incluindo "Salvar este treino na biblioteca" em cada sessao.
- [x] Preservar os dados legados, metadados adicionais, midias e periodizacao na copia; retirar apenas a identidade de runtime do treino.
- [x] Adaptar aliases de snapshots antigos do motor apenas na copia exportada. Consultar o historico nao altera o snapshot.
- [x] Carregar historico paginado, com filtro explicito de aluno e empresa, descarte de respostas obsoletas e erro recuperavel.
- [x] Buscar o catalogo completo da empresa e os exercicios globais, com paginacao e validacao somente dos treinos selecionados.
- [x] Exigir confirmacao positiva do registro inserido antes de mostrar sucesso; evitar envio simultaneo e descartar contexto obsoleto.
- [x] Tratar titulos malformados sem derrubar a janela; rejeitar sua exportacao com erro legivel, sem impedir a copia de outro treino valido.

O historico da aluna indicada na imagem foi conferido por leitura de metadados: seis snapshots completos, incluindo um com cinco treinos e 54 exercicios. Nenhuma versao, treino ativo ou registro de biblioteca real foi alterado durante a verificacao.

## Validacao

- Build de producao local, verificacao do backend canonico e gate de rollout: aprovados.
- TypeScript e lint dos arquivos novos/alterados deste fluxo: aprovados nas rodadas locais.
- Lote completo Vitest: 1344 casos aprovados; houve um contrato de persistencia antigo a adaptar e dois timeouts sob carga. O contrato foi atualizado com cobertura comportamental; os dois testes sem alteracoes passaram na reexecucao isolada.
- Reexecucao focada do historico/exportacao: 67 casos aprovados antes dos ultimos testes de idempotencia e titulo malformado. Exportacao/tipos de serie: 35 casos aprovados apos a idempotencia; janela de salvamento: 22 casos aprovados apos a correcao do titulo.
- QA independente inicial: identificou um P2 no seletor de titulo malformado. Corrigido no produto e coberto por testes.
- [x] Reexecucao independente final: 13/13 fluxos Playwright em 320, 390 e 1440 pixels; mais tres repeticoes do salvamento em 320 pixels. 65/65 casos Vitest independentes aprovados.
- [x] Reexecucao root do lote completo Playwright integrado: 13/13 aprovados em 33,7 segundos.
- [x] Build/TSC/lint finais aprovados apos a correcao P2. A falha isolada de fechamento do viewer nao reapareceu no lote completo nem nas tres repeticoes; sua causa nao foi comprovada.

Os testes de interface usam dados sinteticos e interceptam acessos externos. Eles conferem que somente `workout_templates` recebe inserts, e que os snapshots originais permanecem identicos.

## Estagios e pendencias acumuladas

- Ajustes anteriores: permanecem registrados em `ENTREGA-AJUSTES-2026-09-29.md`. Esta tarefa nao republicou nem alterou aquela entrega em producao.
- Novo historico e copia individual: implementados e registrados em commit local; gate independente final aprovado. Sem push, staging ou producao nesta tarefa.
- Publicacao desta nova funcionalidade: aguardando autorizacao especifica. Nenhum push, deploy, migracao ou comunicacao externa executado nesta tarefa.
- Recuperacao do treino sobrescrito: o conteudo esta no historico; a escolha da versao e a copia na biblioteca ficam disponiveis na nova interface. Nao restaurei uma versao automaticamente nem substitui o treino ativo.
- Os itens anteriores dispensados pelo usuario continuam fora do escopo e nao foram reabertos.

Teste local: `http://localhost:8096`. O servidor existente foi preservado e respondeu HTTP 200.

## Limites e rollback

Nao houve mudanca de schema nem escrita em prescricoes. A consulta recupera apenas as versoes realmente armazenadas; nao reconstrui estados ausentes do historico. A exportacao cria um novo template privado da empresa e nunca sobrescreve o plano da aluna. Referencias de exercicios nao autorizadas continuam bloqueadas.

Rollback do frontend: voltar ao baseline `18e33b0` por revert dos commits desta entrega. Nao requer migracao de banco. Templates criados posteriormente pelo usuario sao registros independentes e nao devem ser apagados automaticamente.

Execucao: Mill e root; revisao independente: Erdos. Skill aplicada: 121, Debugger Sistematico (Causa Raiz).

## Atualizacao de publicacao

O estado local descrito acima registra a primeira etapa da entrega. Apos a
autorizacao mais recente do usuario, historico e copia individual foram
publicados junto com a recuperacao automatica de exercicios ausentes na empresa.
Producao: `6abbb556098af04ac0d431e1`, estado `ready`, em
https://www.settapp.com.br. Os nove arquivos criticos foram conferidos contra o
build aprovado. Nenhum treino ativo foi restaurado ou sobrescrito pelo deploy.
O fluxo novo reutiliza exercicios globais/da empresa e cadastra referencias
nomeadas ausentes apenas na biblioteca privada da empresa, mantendo permissoes.
Validacao acumulada e limites em
[recuperacao/publicacao](ENTREGA-RECUPERACAO-BIBLIOTECA-2026-09-29.md).
