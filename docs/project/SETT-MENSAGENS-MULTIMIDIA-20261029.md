# Mensagens em sequência e multimídia — 29/10/2026

Implementação integrada localmente e validada no editor local com banco de homologação. **Não publicada em produção.** Branch `codex/sett-self-service-local-20261026`; HEAD de trabalho preservado em `45b6c3a`. Nenhum envio real, cobrança ou mudança no WhatsApp da BN foi realizado nesta etapa.

## Checklist acumulado deste ajuste

- ✅ Uma a dez mensagens ordenadas por evento WhatsApp, botão **+ Adicionar mensagem** abaixo dos blocos e remoção individual.
- ✅ Texto, imagem JPEG/PNG/WebP, vídeo MP4 e áudio MP3/M4A/OGG/WebM; anexos privados de até 16 MB, legenda opcional e prévia por mensagem.
- ✅ Aplicação aos dez eventos WhatsApp das configurações: semanal, confirmação do pré-cadastro, fiscal, pagamento, avaliação, anamnese, renovação próxima/pendente, interciclos e primeiro contato.
- ✅ Mensagens existentes preservadas. Abrir um evento não migra nem substitui o texto legado. Notificações push mantêm seu canal de título/texto.
- ✅ Fluxos automáticos e rascunhos manuais usam as sequências. Abrir um rascunho não envia; o profissional pode revisar antes de confirmar. Assinatura continua respeitando o botão existente.
- ✅ Snapshot do conteúdo e destinatário por ocorrência, confirmação por parte, ordem e bloqueio de repetição quando o resultado de um envio é incerto. Legenda/assinatura de áudio segue em texto separado após o áudio.
- ✅ Primeiro contato cria/reutiliza conversa validada; variantes brasileiras de telefone não bloqueiam uma conversa legítima. Troca real de destinatário continua bloqueada.
- ✅ Validação TS/SQL, CAS/histórico, mídia de outra empresa negada e revisão independente concluídos.
- ✅ Editor local disponível em http://127.0.0.1:57650/admin/settings, com conta fictícia já autenticada na aba **Mensagens SETT**. A configuração semanal fictícia contém quatro exemplos persistidos na versão 8.
- ❌ Publicação **(aguardando)**: esta nova etapa permanece local/homologação para teste do Matheus; requer promoção coordenada descrita abaixo.
- ❌ Recebimento real das quatro mídias no WhatsApp **(aguardando)**: não foi enviado a clientes nem ao contato de teste nesta rodada. Próximo passo: teste controlado após preparar o ambiente de envio da versão nova.

O checklist anterior de autonomia permanece em [SETT-AUTONOMIA-ENTREGA.md](./SETT-AUTONOMIA-ENTREGA.md); esta entrega não recertifica nem amplia aquele escopo. Ajustes financeiros comerciais continuam adiados conforme decisão anterior.

## Validação e limites da evidência

- Revisão independente encontrou e fechou: tipo inválido aceito pelo contrato, sobrescrita indevida de texto legado, ordem de locks e incompatibilidade de JIDs equivalentes na criação/reutilização de conversa.
- Backend inicial: 89 testes Deno, cinco testes SQL/PGlite e 64 testes adversariais independentes passaram. A correção final do manager teve **71 testes independentes**, incluindo as regressões de JID e controles negativos. Contagens se sobrepõem e não devem ser somadas.
- Frontend: 29 verificações independentes do editor/upload/races passaram; rascunhos manuais e fiscal tiveram 66 verificações independentes. Alguns testes de UI excederam cinco segundos sob carga; a revisão registra a execução com limite de vinte segundos, sem relaxar asserções.
- **47 verificações nativas em homologação** passaram: Auth, Storage privado, leitura por URL assinada e hash dos bytes das três mídias, negações de tenant, referências a mídia válida de outra empresa, CAS simultâneo, histórico, restauração protegida e journal de partes.
- Teste híbrido usa **banco e Storage reais** e apenas o transporte do provedor simulado: seis POSTs simulados, zero reais. Confirmou retomada após uma parte aceita, snapshot imutável, replay de ACK, bloqueio de resultado incerto e concorrência com barreira. O teste não comprova recebimento em celular. O cenário nativo de concorrência usa scope nulo; fences de lease/owner de automação foram exercitados no SQL/PGlite, sem alegar esse mesmo cenário nativo.
- Browser real: anexar imagem, áudio e vídeo; salvar/reabrir quatro blocos; legenda com variável; áudio e vídeo com duração de um segundo, `readyState=4` e sem erro; adicionar/remover quinto bloco retorna a quatro e não deixa mudança pendente. Configuração fictícia passou de versão 6 a 8. Produção não foi editada.
- TypeScript da aplicação, lint focado, build canônico e verificação de consentimento semanal passaram. Build: 856.500 bytes de scripts iniciais, dentro do limite de 875.000.

Recibos e captura, sem credenciais no documento: `output/message-sequences-20261029.private/`. Revisão independente final: `qa/message-sequences-continuation-independent-review-20261029.md`. Design: `docs/superpowers/specs/2026-10-29-message-sequences-design.md`.

## Publicação futura: dependência obrigatória

A migração `20261029122806_company_whatsapp_message_sequences.sql` foi aplicada **somente em homologação**, com hash revisado `b26eb3f2a2640502cb9bd90a40757a45e8d87a3feade8f05be0a92f6e5f5f438`; ledger 182 → 183. Definições/ACLs anteriores e pré-condições foram capturadas, e o validator anterior correspondia exatamente ao baseline revisado.

O normalizador antigo rejeita campos desconhecidos. Portanto, antes de permitir salvar `message_sequences` em produção, publicar o contrato novo em todas as nove funções dependentes:

`ai-prescribe-workout`, `asaas-integration`, `asaas-webhook`, `process-automation-sessions`, `public-payment-context`, `public-registration`, `push-send`, `whatsapp-manager`, `whatsapp-webhook`.

Ordem: backup/pré-condições → migração aditiva → nove funções compatíveis, preservando autenticação e JWT atuais → frontend → verificações e teste controlado. A atualização técnica das funções financeiras não autoriza ativar cobrança comercial. Não apagar snapshots/recibos para resolver incerteza nem fazer retry cego. Rollback deve preservar os dados e o contrato compatível.

O preview atual permite validar edição/Storage/CAS. As Edge Functions existentes em homologação não foram republicadas nesta rodada; o envio pelo provedor e fluxos completos de outras áreas não são apresentados como homologados nesta configuração nova.

## Método

Skills de engenharia, Supabase, ATENA e nº 126 — Testes Unitários (Framework de Escrita), com executor e QA independentes. Trabalho anterior do checkout foi preservado, sem reset, push ou deploy de produção.
