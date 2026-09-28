# Assinatura de mensagens WhatsApp - 2026-09-28

Conferencia posterior dos demais ajustes e ressalvas do editor semanal:
CONFERENCIA-AJUSTES-RECENTES-2026-09-28.md. Ha falhas P2 reproduzidas no editor
semanal e mapper da anamnese, alem de uma ressalva de carga mista legado/v2;
nao se declara o backlog inteiro concluido.

## Causa confirmada

O deploy anterior 6aba24b3dac3130087edcc22 corrigiu o salvamento de cargas,
mas excluiu deliberadamente o WIP de WhatsApp. A assinatura existia apenas
localmente. A edge whatsapp-manager v86 tambem nao continha essa funcionalidade.
Os sete arquivos dessa edge coincidiram byte a byte com o baseline da release.
Nao era somente um nome escondido na interface: faltava publicar frontend e backend.

## Escopo

- Switch "Assinar mensagens" nos compositores de conversa existente e novo contato.
- Desligado por padrao: preserva o texto e a legenda, sem acrescentar assinatura.
- Ligado: envia *Nome do profissional* na primeira linha do texto ou da legenda.
- Preferencia local separada por usuario e empresa, preservada ao reabrir o navegador.
- Nome derivado de profiles.full_name do usuario autenticado no servidor.
- Envio individual, envio para varios, arquivos, avaliacao e audio passam a preferencia.
- Audio e figurinha recebem o nome em mensagem acompanhante, pois nao possuem legenda.
- Falha nessa mensagem acompanhante gera aviso sem reenviar a midia ja entregue.
- Autenticacao, isolamento de empresa, validacao do destinatario e do arquivo preservados.
- Sem mudancas de schema, motor de prescricao, treinos ativos ou templates de mensagem.

## Validacao e Estagio

- Confirmados nesta rodada: TypeScript sem erros, build e gates de backend/bundle,
  lint global sem erros (43 warnings herdados), 65 testes de frontend WhatsApp,
  43 testes Deno de identidade/midia/provedor/edicao e 53 novos testes Deno.
- Os testes novos executam o handler real com SDK/provedor sinteticos, sem permissao
  de rede ou env. ON/OFF, texto/legenda, nome autenticado, spoof, auth/tenant,
  falha de assinatura acompanhante e historico coerente foram verificados.
- A revisao independente identificou e a reexecucao confirmou correcao de dois P2:
  nome vazio apos normalizacao agora retorna 400; audio/figurinha nao registram
  uma assinatura como entregue na propria midia.
- Playwright final reexecutado pela raiz: 9/9, em 320, 390 e 1440 pixels,
  com switch ON/OFF, persistencia, midia, envio para varios e ausencia de overflow.
  Os retries anteriores revelaram toast sobre o controle de audio e medicao
  durante animacao de entrada. Os testes agora aguardam as animacoes naturais,
  sem forcar cliques, ocultar avisos ou afrouxar limites de geometria.
- Codigo commit e5b5620 e estabilizacao de QA c8a62ac, ainda sem push.
- Backend publicado: whatsapp-manager v87, verify_jwt=true, oito arquivos
  relidos remotamente e identicos ao pacote revisado. Smoke sem JWT retorna 401.
- Frontend publicado em https://www.settapp.com.br, deploy
  6aba54b136a13844f5f64b5e, em 2026-09-28T11:51:14.481Z.
- Preview aprovado antes da promocao: 6aba542cd8222b53c2cde91e.
- Verificacao independente do dominio: /, /aluno e /admin com HTTP 200;
  HTML, JavaScript principal, CSS, chunk WhatsApp e service worker identicos
  byte a byte ao build revisado. Cache sett-cache-v6.
- Chunk publicado WhatsAppChat-CFjIp8IF.js contem o switch e signMessages;
  SHA256 1daa43d3e44c036f0486d756d3230427815e4234df2115a4f9da2b3e79e2bba3.
- Nenhuma mensagem real enviada a alunos durante os testes.
- Recebimento em telefone real ainda depende de um teste controlado com destinatario autorizado.

## Rollback

- Frontend anterior: deploy 6aba24b3dac3130087edcc22.
- Backend anterior: whatsapp-manager v86, verify_jwt=true.
- Backup exato de codigo/configuracao em output/whatsapp-manager-v86-backup.json,
  fora do Git. Restaurar esse pacote se houver regressao; nao aplicar migrations.
- Reverter somente os arquivos da assinatura; preservar a correcao de cargas.

## Checklist Acumulado

- Concluido em producao anteriormente: correcao de salvamento de cargas, retries,
  revisoes, tombstones e RPE fracionario. Salvamento confirmado pelo usuario.
- Concluido em producao: assinatura de mensagens com switch ON/OFF, backend,
  interface e verificacao remota. Reabrir/recarregar o app para obter o build novo.
- Aguardando: confirmar recebimento da assinatura em telefone de teste autorizado;
  os testes sinteticos e o pacote remoto nao substituem essa prova.
- Aguardando: templates de mensagens com imagens/videos/audios/documentos; codigo
  local nao publicado, depende de gate e migration especifica de anexos.
- Aguardando: treinador atribuido na cadencia de contatos (Matheus); falta entrega comprovada.
- Bloqueado: manual tecnico BN (Bruna); depende das regras e conteudo operacionais.
- Aguardando: Taisa ABCDE, aviso do treino, feedback e confirmacao de visualizacao;
  depende da ficha e destinatario exatos, sem envio nesta rodada.
- Bloqueado: demonstracoes faltantes; depende de gravacao/recebimento, vinculacao e QA.
- Aguardando: validacao integral do motor, progressao, renovacao e periodizacao;
  manter prescricoes antigas sem migracao automatica.
- Aguardando: matriz completa professor/aluno desktop/mobile, finalizacao e cronometro;
  salvamento confirmado nao substitui esses testes.
- Aguardando: reconciliacao historica Git/migrations; nao executar db push em lote.
- Aguardando: testes SQL multiconexao, retencao de recibos e hardening remanescente.
- Aguardando: idempotencia duravel de entrega WhatsApp e limpeza de uploads orfaos.
- Pedidos historicos de calendario, permissoes, biblioteca, layout, links, anamnese,
  dashboard e temas permanecem no historico do projeto. Esta rodada nao os reaudita
  nem declara validacao integral sem evidencias atuais.

## Metodo

Skill 121 - Debugger Sistematico (Causa Raiz): confronto entre WIP local, pacote
publicado e codigo vivo; integracao minima, teste ON/OFF e rollback independente.
