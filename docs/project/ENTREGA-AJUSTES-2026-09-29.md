# Entrega SETT/BN - 2026-09-29

## Escopo e criterio de aceite

Owner da integracao: ATENA/Codex. Checkout exclusivo:
`sett-load-save-release-20260928`, baseline `26bb410`.
Executores: Mill (templates/chat) e Erdos (semanas/anamnese);
revisao independente: Erdos, seguida de testes/build/QA pela raiz.
Metodo: Skill 121 - Debugger Sistematico (Causa Raiz).

Esta entrega fecha a implementacao restante da conferencia de 28/09.
A conferencia anterior continua como registro historico, nao como lista atual:
[conferencia de 28/09](CONFERENCIA-AJUSTES-RECENTES-2026-09-28.md).

Nao alterar prescricoes antigas; nao enviar mensagens a alunos;
nao aplicar migrations historicas indiscriminadamente; nao ampliar acesso entre empresas.
Deploy autorizado pelo usuario, somente depois dos gates locais e independentes.

## Implementacao

- Templates com texto, imagem, video, audio e documentos; compatibilidade com
  templates antigos somente de texto. Upload privado, progresso, previews e
  retomada para arquivos grandes pelo uploader existente.
- Selecionar template preenche um rascunho editavel; nao envia automaticamente.
  Partes confirmadas sao retiradas do rascunho; partes com falha continuam nele.
  HTTP 200 sem confirmacao positiva e identificador nao conta como sucesso.
- Backend valida empresa, conversa, template e caminho registrado antes de
  assinar URL e enviar a midia. RLS e bucket privado permanecem ativos.
- Assinar mensagens ON/OFF preservado e integrado aos templates; nome resolvido
  pelo backend, nao aceito do cliente. Imagem/video/documento usam legenda;
  audio/figurinha usam mensagem separada de identificacao, com aviso se ela falhar.
- Chat: loop de atualizacao de leitura corrigido; respostas antigas nao alteram
  a conversa ou empresa atual. Atualizacao sem mudanca preserva o estado existente.
- Semanas: descanso zero e escolha explicita de series retas preservados;
  contagem/tipos de series e cadencia por semana, copia para varias semanas.
  Novos imports recebem o modelo semanal. Exercicios antigos sem versao explicita
  nao sao convertidos ao salvar uma prescricao mista.
- Anamnese: `has_kitchen`, duracao de endurance e respostas extras persistem e
  sao relidas; dados customizados anteriores preservados. Limpar dor e notas e
  intencional. Notas seguem no editor dedicado, sem um segundo campo ignorado.
- Finalizacao: apos a confirmacao da sessao no servidor, resumo, estado local e
  cronometro encerram antes de XP/conquistas. Falha nas series continua impedindo
  finalizacao; nao simula salvamento ou sucesso.

## Checklist acumulado

### Ajustes recentes publicados

- Templates multimidia e assinatura integrada: implementados e gate final aprovado.
- Falhas P2 de semanas e cargas mistas: corrigidas, testes e revisao aprovados.
- Persistencia da edicao da anamnese: corrigida, testes e revisao aprovados.
- Finalizacao/cronometro: corrigidos, testes e revisao aprovados.
- Assinatura: switch ON confirmado na interface de producao; uma unica mensagem
  curta enviada ao contato de teste autorizado, com nome no texto confirmado no
  historico e status `delivered` (Entregue). OFF coberto nos testes automatizados.
- Confirmacao visual no celular: aguardando o usuario conferir a mensagem recebida;
  nenhum envio foi feito a alunos. Isso e validacao externa, nao implementacao restante.

### Pedidos anteriores mantidos, sem reescrita de dados

- Senha: recuperacao implementada; testes de recovery incluidos na suite.
- Athletic Club: estrela derivada do plano; testes de isolamento e badge incluidos.
- Biblioteca empresa/global: correcao anterior preservada; integridade de
  templates e salvamento coberta por contratos de regressao.
- Agenda: filtro Todos/Meus preservado, com teste de ownership.
- Leitura de todos os alunos da mesma empresa: preservada, sem liberar outra empresa.
- Interciclos manual a qualquer momento: correcao anterior preservada;
  restricao temporal continua somente no envio automatico.
- Notas, prioridades e scroll de pre-cadastro: preservados, com testes de editor/popover.
- Semanas individuais, cadencia 2020 e tipos de serie somente em prescricoes novas:
  preservados e reforcados pelos testes reais do serializer/imports.
- Tema pessoal, dark do chat, mobile, X de fechar, volume e FAB: implementacoes
  anteriores preservadas; esta rodada valida especialmente as telas de templates/chat.
- Dashboard, renovacao em rascunho, aniversarios/cadencia, novos cadastros e interessados:
  implementacoes anteriores preservadas; testes de contratos incluidos.
- Remocao de aquecimento, orientacoes redundantes, motivo e cabecalho duplicado
  do portal: preservada, sem remover regras ou dados do treino.
- Links, matriculas/ciclos, acesso e feedbacks: implementacoes anteriores preservadas;
  contratos de links, cronologia, acesso e feedback incluidos nos testes.
- Motor de prescricao: 91 testes focados aprovados; perfil de teste indicado
  conferido por leitura de dados/estrutura da ficha existente, sem gerar ou publicar
  outra ficha. Isso nao substitui avaliacao tecnica humana de uma prescricao nova.

### Retirados do backlog por solicitacao do usuario

Nao serao implementados ou cobrados nesta entrega: treinador na cadencia,
manual BN, videos faltantes, Taisa ABCDE/aviso, auditoria integral generica e
hardening historico/generico. A exclusao nao significa que foram concluidos.

## Evidencias e limites

- Backend: 75/75 Deno aprovados, inclusive handler real com provider mockado,
  ON/OFF e recusas de paths/templates/empresas invalidos antes do envio.
- Migration additive: PGlite 0.3.14 aprovado, texto legado preservado, default
  array e rejeicao de valores nao-array/null. Nenhuma permissao alterada.
- Suite geral inicial: 189 arquivos e 1293 testes aprovados; um suite de PDF
  nao iniciou devido ao realpath do node_modules compartilhado. Allowlist de
  filesystem restrita ao projeto/dependencias adicionada somente no Vitest;
  os dois testes PDF depois passaram. Reexecucao integral com dois workers:
  **190/190 arquivos e 1300/1300 testes aprovados**, sem aumentar timeouts.
- QA browser: componentes reais em fixture sintetica, sem envios externos;
  criar/reabrir/editar e imagem/video/audio renderizados em 320/390/1440px.
  **11/11 Playwright aprovados pela raiz**, incluindo troca de empresa,
  falha parcial, ACK invalido e commit com ACK perdido seguido de cancelamento.
- TypeScript, lint dos arquivos alterados com zero warnings, diff --check,
  build de producao e gate de performance aprovados. Revisao independente
  final aprovou os patches de anamnese, semanas, backend, timer e templates/chat.

Testes sinteticos e hashes publicados nao comprovam recebimento no celular,
rede real perfeita, toda combinacao de dispositivo ou revisao clinica/tecnica.
Um envio cujo ACK se perdeu nao tem garantia de exatamente uma entrega;
o rascunho mostra ausencia de confirmacao e orienta conferir o historico.
Anamnese lead/canonical conserva o modelo anterior de duas escritas, sem transacao
conjunta/CAS. Arquivos submetidos com resultado incerto devem ser preservados,
nao excluidos automaticamente.

## Deploy e rollback

Destino: https://www.settapp.com.br, site Netlify
`9a061d2e-ee2c-444b-aa69-fe262caf0246`; Supabase `zshrcgbyhzxpnlccssyz`.
Ordem: migration additive revisada -> backend -> preview -> producao.
Backend anterior: whatsapp-manager v87, JWT ativo, oito arquivos arquivados em
`output/release-20260929/whatsapp-manager-v87-backup.json`.
Rollback frontend: deploy `6aba54b136a13844f5f64b5e`; backend: oito arquivos v87.
Manter coluna additive e arquivos/dados existentes em caso de rollback.

Migration aplicada e verificada: `20260929093858_message_template_attachments`.
O arquivo local foi alinhado ao timestamp registrado pelo conector no banco,
sem reaplicar SQL ou usar db push. Constraint array, NOT NULL e default []
confirmados por leitura de metadados apos a aplicacao.

Backend: whatsapp-manager **v88 ACTIVE**, JWT ativo; os oito arquivos baixados
apos o deploy coincidem integralmente com a release testada.
Preview: `6abb87634585ee438558608a`; HTML e sete chunks criticos conferidos
byte a byte com o build aprovado.
Producao: `6abb87d91ee4554a4dd518e5`, confirmada como deploy publicado no site.
HTML e os mesmos sete chunks criticos retornaram HTTP 200 e hashes identicos
ao build aprovado, no dominio canonico.
Evidencias locais: `output/release-20260929/production-verification.json` e
`output/release-20260929/assinatura-producao.png` (nao versionadas).

Estado final: implementacoes deste escopo integradas e publicadas; rollback
preservado. Nao foi feito push do checkout compartilhado nem alteracao dos
dados de prescricoes antigas. Resta somente confirmacao visual do teste no
celular pelo usuario; itens retirados continuam fora desta entrega.
