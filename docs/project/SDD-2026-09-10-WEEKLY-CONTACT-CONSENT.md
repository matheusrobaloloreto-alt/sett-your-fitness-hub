# Consentimento de contato semanal — contrato e rollout

## Veredito

`students.weekly_contact_enabled` sozinho não prova consentimento e deixa uma fila antiga elegível depois de revogação. O novo contrato torna esse campo apenas cache: o direito de criar ou enviar contato semanal exige o evento mais recente do ledger como `granted`, na versão vigente da política, e destinatário WhatsApp verificado no momento do envio.

## Contrato de Produto

- canal fixo: `whatsapp`;
- finalidade fixa: `weekly_training_support`;
- versão vigente: `weekly-training-support-v1-2026-09-10`;
- eventos append-only: `granted` ou `revoked`, ordenados por `sequence` identity monotônica; os timestamps são evidência temporal, não critério de desempate;
- cada `granted` persiste `recipient_key`, a chave canônica exata do destinatário apresentado, dentro do ledger protegido por RLS; `revoked` é sempre global para aluno/canal/finalidade e grava `recipient_key = null`;
- origem inicial: `staff_confirmed_student`, significando que o profissional confirmou a autorização do aluno antes de ligar o controle;
- `actor_user_id`, tenant e horários são validados/gravados no servidor;
- alteração direta do booleano é rejeitada; uma autorização privada, vinculada à transação, backend e aluno, é criada pela RPC e consumida uma única vez pelo trigger. Nem um cliente nem outra função `SECURITY DEFINER` do mesmo owner consegue atualizar o cache sem essa autorização específica;
- leitura do ledger é restrita aos profissionais autorizados para aquele aluno/empresa;
- UPDATE/DELETE do ledger são rejeitados inclusive para writers privilegiados comuns.

## Legado e rollout

Não há backfill de `granted`. Todo booleano legado ligado é primeiro registrado numa quarentena privada e depois desligado, sem fabricar consentimento ou revogação. O profissional precisa reconfirmar com o aluno e gerar um novo `granted` pela interface. A quarentena existe só para diagnóstico/recuperação controlada e não participa da elegibilidade.

O cron passa o JID direto candidato à elegibilidade antes de criar a sessão e fixa esse candidato no contexto protegido da fila. O evento global mais recente precisa ser `granted`, estar na política vigente e ter `recipient_key` igual à identidade canônica, atual e não ambígua do aluno. Imediatamente antes de cada envio, o dispatcher relê chat e aluno, reexecuta a resolução, compara o novo `verifiedRemoteJid` com o candidato fixado na fila e só então repete a elegibilidade com o destinatário atual. Assim, revogação, mudança de perfil ou troca de JID depois da fila bloqueiam o envio. Sessões sem consentimento vigente terminam como `failed` sem retry.

Antes de instalar o ledger, a migration abre uma transação, adquire advisory lock e bloqueia escritas concorrentes em `students` e `flow_sessions`. Então encerra como `failed` todas as sessões semanais antigas em `active`, `waiting_response` ou `processing`, com o motivo `weekly_contact_consent_reconfirmation_required`. Se os locks não forem obtidos em oito segundos, ela falha sem aplicar parcialmente. Isso impede que o cron antigo insira uma nova fila no intervalo do corte.

## Ordem obrigatória do rollout

Execute `npm run verify:weekly-consent-rollout` antes de qualquer fase. O gate falha se o código deixar de cumprir a contenção e imprime a única ordem permitida:

1. **Edge dispatcher:** publicar primeiro `process-automation-sessions`. Antes da RPC existir, esta versão falha fechada para sessões semanais porque toda checagem retorna inelegível/erro; validar que nenhuma mensagem foi enviada.
2. **Database migration:** aplicar `20260910103000_weekly_contact_consent_ledger.sql`. Ela primeiro bloqueia novas escritas e encerra a fila legada; depois instala ledger/RPC/trigger e substitui o cron pelo gate de consentimento.
3. **Frontend:** publicar por último. Só então o modal de ateste pode gerar `granted` contra a RPC já instalada.

Não inverter as fases. Frontend antes da migration quebra o grant; migration antes do Edge deixa uma janela em que o dispatcher antigo não revalida revogação imediatamente antes do envio.

O controle de frontend vincula status, policy, modal e ateste a `studentId + normalizedRecipient`. O status captura o destinatário no início da chamada e ignora a resposta se aluno ou destinatário mudarem. A RPC trava a linha do aluno, recalcula a identidade atual e rejeita o grant se o valor apresentado ficou obsoleto ou se `phone` e `whatsapp` divergem. Voltar a um destinatário antigo não ressuscita um grant: somente o evento global mais recente governa a elegibilidade, portanto é necessário um novo ateste e um novo evento.

O rehearsal transacional cobre grant no destinatário A seguido de troca para B, novo grant em B, revogação global, retorno a A, perfil vencendo a corrida contra uma RPC obsoleta, divergência entre os dois campos de contato e JID alternativo. Dados de telefone sintéticos são construídos apenas em memória e o resultado emite exclusivamente booleanos.

## Rollback

O rollback é de contenção, não de downgrade inseguro: desliga todos os caches, encerra sessões semanais abertas, faz a elegibilidade retornar sempre `false`, revoga a RPC de escrita e preserva o ledger. Ele nunca restaura opt-ins booleanos legados nem apaga evidência.

## Estado

- código/migration local: implementados neste delta;
- migration aplicada em banco: não;
- Edge dispatcher deployado: não;
- frontend deployado: não;
- contatos enviados: nenhum.
