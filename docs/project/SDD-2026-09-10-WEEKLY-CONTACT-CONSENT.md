# Consentimento de contato semanal — contrato e rollout

## Veredito

`students.weekly_contact_enabled` sozinho não prova consentimento e deixa uma fila antiga elegível depois de revogação. O novo contrato torna esse campo apenas cache: o direito de criar ou enviar contato semanal exige o evento mais recente do ledger como `granted`, na versão vigente da política, e destinatário WhatsApp verificado no momento do envio.

## Contrato de Produto

- canal fixo: `whatsapp`;
- finalidade fixa: `weekly_training_support`;
- versão vigente: `weekly-training-support-v1-2026-09-10`;
- eventos append-only: `granted` ou `revoked`, ordenados por `sequence` identity monotônica; os timestamps são evidência temporal, não critério de desempate;
- origem inicial: `staff_confirmed_student`, significando que o profissional confirmou a autorização do aluno antes de ligar o controle;
- `actor_user_id`, tenant e horários são validados/gravados no servidor;
- alteração direta do booleano é rejeitada; uma autorização privada, vinculada à transação, backend e aluno, é criada pela RPC e consumida uma única vez pelo trigger. Nem um cliente nem outra função `SECURITY DEFINER` do mesmo owner consegue atualizar o cache sem essa autorização específica;
- leitura do ledger é restrita aos profissionais autorizados para aquele aluno/empresa;
- UPDATE/DELETE do ledger são rejeitados inclusive para writers privilegiados comuns.

## Legado e rollout

Não há backfill de `granted`. Todo booleano legado ligado é primeiro registrado numa quarentena privada e depois desligado, sem fabricar consentimento ou revogação. O profissional precisa reconfirmar com o aluno e gerar um novo `granted` pela interface. A quarentena existe só para diagnóstico/recuperação controlada e não participa da elegibilidade.

O cron consulta o ledger antes de criar a sessão e só aceita um JID direto cuja chave normalizada corresponda ao telefone/WhatsApp do aluno. O dispatcher repete a consulta antes de resolver o destinatário e novamente imediatamente antes de cada envio; assim, uma revogação posterior à criação da fila bloqueia o envio. Sessões sem consentimento vigente terminam como `failed` sem retry. A resolução existente de identidade/telefone confiável continua obrigatória.

Antes de instalar o ledger, a migration abre uma transação, adquire advisory lock e bloqueia escritas concorrentes em `students` e `flow_sessions`. Então encerra como `failed` todas as sessões semanais antigas em `active`, `waiting_response` ou `processing`, com o motivo `weekly_contact_consent_reconfirmation_required`. Se os locks não forem obtidos em oito segundos, ela falha sem aplicar parcialmente. Isso impede que o cron antigo insira uma nova fila no intervalo do corte.

## Ordem obrigatória do rollout

Execute `npm run verify:weekly-consent-rollout` antes de qualquer fase. O gate falha se o código deixar de cumprir a contenção e imprime a única ordem permitida:

1. **Edge dispatcher:** publicar primeiro `process-automation-sessions`. Antes da RPC existir, esta versão falha fechada para sessões semanais porque toda checagem retorna inelegível/erro; validar que nenhuma mensagem foi enviada.
2. **Database migration:** aplicar `20260910103000_weekly_contact_consent_ledger.sql`. Ela primeiro bloqueia novas escritas e encerra a fila legada; depois instala ledger/RPC/trigger e substitui o cron pelo gate de consentimento.
3. **Frontend:** publicar por último. Só então o modal de ateste pode gerar `granted` contra a RPC já instalada.

Não inverter as fases. Frontend antes da migration quebra o grant; migration antes do Edge deixa uma janela em que o dispatcher antigo não revalida revogação imediatamente antes do envio.

## Rollback

O rollback é de contenção, não de downgrade inseguro: desliga todos os caches, encerra sessões semanais abertas, faz a elegibilidade retornar sempre `false`, revoga a RPC de escrita e preserva o ledger. Ele nunca restaura opt-ins booleanos legados nem apaga evidência.

## Estado

- código/migration local: implementados neste delta;
- migration aplicada em banco: não;
- Edge dispatcher deployado: não;
- frontend deployado: não;
- contatos enviados: nenhum.
