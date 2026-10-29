# Sequências multimídia de mensagens — 29/10/2026

Pedido: permitir uma ou mais mensagens em cada evento WhatsApp da configuração da empresa, acrescentar/remover blocos e anexar imagem, vídeo ou áudio. Manter as mensagens atuais e os canais existentes.

## Decisões técnicas da implementação

- Estender a configuração com `message_sequences`, opcional, sem substituir `messages`. Ausência significa exatamente o comportamento legado. Cada evento WhatsApp aceita até dez blocos ordenados com ID estável, tipo, texto/legenda e referência privada de mídia.
- Referência de mídia contém bucket/path/MIME/nome; nenhuma URL externa ou URL assinada persistida. Upload e leitura respeitam a empresa, com assinatura temporária no momento do uso.
- Editor apresenta blocos numerados, botão + abaixo, remoção, formato, anexo e prévia. Mudança de evento não perde o rascunho. O salvamento usa a versão/CAS existentes.
- Notificações push possuem título e corpo, não são mensagens WhatsApp; continuam campos de texto identificados pelo canal.
- Fluxos automáticos executam os blocos em ordem e persistem snapshot/confirmados. Falha antes de envio pode retomar; entrega ambígua não permite repetição cega.
- Botões manuais continuam abrindo rascunho revisável; abrir um rascunho não envia. Precisam preservar todas as partes e anexos configurados.

## Alternativas avaliadas pela execução

Concatenar textos não permite múltiplas mensagens reais nem anexos. Substituir strings por arrays quebra consumidores e configurações antigas. Campo aditivo com fallback explícito preserva compatibilidade e permite implantação coordenada.

## Escopo e aceite

1. Configuração antiga abre sem alteração e salva sem perder textos.
2. Adicionar/remover, editar variáveis, anexar imagem/vídeo/áudio e salvar/reabrir mantém ordem e conteúdo.
3. Validação de tipos, limites, variáveis e tenant ocorre no cliente e banco; upload privado não é acessível por outra empresa.
4. Todos os consumidores WhatsApp centrais usam sequência; push permanece no canal original.
5. Recuperação após parte confirmada não repete essa parte. Configuração editada durante execução não altera snapshot iniciado.
6. Rascunhos manuais exigem confirmação de envio pelo profissional.
7. Testes focados, TypeScript/build e revisão independente precedem qualquer publicação. Não há autorização nova de deploy nesta entrega.

## Plano

Backend: contrato/validação/migração, referências Storage, dispatch ordenado e consumidores automáticos. Frontend: editor e upload/prévia. Rascunhos: transportar sequência até o chat sem envio automático. QA: revisão independente e regressão de compatibilidade/retomada/isolamento. Integração: build e validação em ambiente de teste pertencente à tarefa; nenhum aluno real é usado.
