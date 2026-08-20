# SETT/BN — pacote controlado do contato semanal

**Data:** 2026-08-20  
**Alvo autorizado:** Renan Batista Marques  
**Estado:** pacote versionado em branch isolada; nenhum deploy, alteração remota de banco ou mensagem executada.

## Veredito

O dispatcher agendado não é seguro para um teste unitário real porque sua execução normal varre gatilhos e reivindica até 25 sessões. Foi criado um caminho de teste separado que exige, ao mesmo tempo, o segredo normal do cron, um segundo segredo exclusivo de teste e o UUID exato de uma sessão marcada como `controlled_test=true`.

Nesse modo:

- `process_automation_triggers()` não é chamado;
- somente `claim_automation_session(_session_id)` pode reivindicar a sessão;
- a RPC aceita apenas uma sessão semanal ativa, com nó atual e flag explícita de teste;
- retorno vazio falha com 404 e retorno não único falha com 409;
- a validação já existente reconfirma aluno, empresa, chat, telefone canônico, JID direto e instância conectada antes de chamar o provedor;
- a cadência global e `weekly_contact_enabled` não são reduzidos nem alterados.

## Preparação idempotente da sessão

A migration `20260820170000_prepare_controlled_weekly_test_session.sql` acrescenta duas RPCs exclusivas de `service_role`:

- `prepare_controlled_weekly_test_session(student_id, controlled_test_run_id)` cria no máximo uma sessão por UUID opaco de execução;
- `cancel_controlled_weekly_test_session(session_id)` cancela somente uma sessão controlada ainda não processada e preserva a linha como evidência.

Antes de criar qualquer sessão, a preparação exige, sem fallback por nome:

- aluno ativo ou em renovação e matrícula operacional no mesmo tenant;
- exatamente um chat direto `@s.whatsapp.net` ligado ao aluno;
- chave canônica do telefone do chat igual ao telefone/WhatsApp do aluno;
- instância do mesmo tenant com status `connected`;
- exatamente um fluxo semanal ativo e um caminho válido `start -> weekly_contact_message`;
- nenhuma outra sessão semanal aberta para o destinatário.

A RPC não cria aluno, matrícula, chat, telefone, instância ou provedor e não envia mensagem. Repetir a mesma preparação com o mesmo UUID devolve a sessão existente; tentar reutilizar o UUID para outro aluno falha fechado.

## Gate exato de staging

Antes de qualquer envio, o staging `ifymocggowdlqqcxugko` precisa ter:

1. migration `20260820160000_claim_single_controlled_automation_session.sql` aplicada;
2. edge `process-automation-sessions` desta branch publicada;
3. `AUTOMATION_TEST_SECRET` temporário e exclusivo, além dos secrets normais do dispatcher;
4. provedor WhatsApp de staging configurado e uma instância de teste conectada;
5. um destinatário controlado, cujo número pertença ao operador do teste;
6. um aluno, matrícula operacional, chat direto e fluxo semanal no mesmo tenant, todos vinculados a esse destinatário;
7. uma única `flow_session` com `trigger_type=weekly_contact`, `controlled_test=true`, chave de teste única e o `student_id` exato;
8. snapshot sanitizado pré-teste: zero outras sessões `processing`, hash SHA-256 do telefone canônico igual ao hash do JID, e estado original do destinatário;
9. invocação única com os dois headers de segredo e o `session_id` exato;
10. confirmação de uma única mensagem no provedor e no banco, seguida da remoção do segredo temporário.

## Rollback

Nenhuma cadência precisa ser restaurada, pois o pacote não a modifica. Se a sessão ainda não tiver sido enviada, ela deve ser cancelada e mantida como evidência auditável, nunca apagada. Após o canário, remover `AUTOMATION_TEST_SECRET` desativa integralmente o caminho controlado sem afetar o cron normal.

## Bloqueio externo atual

O staging não possui o aluno autorizado nem um destinatário/provedor controlado. Por isso nenhum seed real foi criado e nenhum envio foi tentado. Copiar telefone ou conversa de produção para staging seria uma prática insegura; o próximo passo é cadastrar um número de teste controlado no staging ou comprovar que o bundle seguro está implantado em produção antes do canário com Renan.

## Evidência viva de staging

Verificação read-only posterior ao commit confirmou:

- `process-automation-sessions` está ativa na versão 3;
- o bundle de staging corresponde byte a byte ao HEAD seguro anterior ao modo controlado (`f69eb00`), portanto ainda não contém este novo caminho;
- `AUTOMATION_CRON_SECRET`, `AUTOMATION_TEST_SECRET`, `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estão ausentes no staging;
- nenhum secret, telefone, JID ou identificador privado foi impresso no relatório.

Assim, o staging atual não consegue disparar a automação — o bloqueio ocorre antes do provedor — e ainda precisa de configuração controlada para o canário.

## Validação adicional do bundle

- `node --test scripts/controlled-weekly-test-bundle.test.mjs`: 2/2 testes aprovados.
- O teste de contrato confirma service-role-only, idempotência, binding exato de destinatário, instância conectada, matrícula operacional e rollback sem `DELETE`.
- A migration ainda precisa ser compilada/aplicada no staging e passar pelo canário read-only de preparação antes de qualquer invocação do dispatcher.
