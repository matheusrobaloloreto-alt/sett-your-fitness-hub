# Consentimento de contato semanal — contrato e rollout

## Veredito

`students.weekly_contact_enabled` sozinho não prova consentimento e deixa uma fila antiga elegível depois de revogação. O novo contrato torna esse campo apenas cache: o direito de criar ou enviar contato semanal exige o evento mais recente do ledger como `granted`, na versão vigente da política, e destinatário WhatsApp verificado no momento do envio.

## Contrato de Produto

- canal fixo: `whatsapp`;
- finalidade fixa: `weekly_training_support`;
- versão vigente: `weekly-training-support-v1-2026-09-10`;
- eventos append-only: `granted` ou `revoked`;
- origem inicial: `staff_confirmed_student`, significando que o profissional confirmou a autorização do aluno antes de ligar o controle;
- `actor_user_id`, tenant e horários são validados/gravados no servidor;
- alteração direta do booleano é rejeitada pelo contexto de execução privilegiado da RPC (sem segredo de sessão falsificável); somente a RPC transacional grava evento e cache;
- leitura do ledger é restrita aos profissionais autorizados para aquele aluno/empresa;
- UPDATE/DELETE do ledger são rejeitados inclusive para writers privilegiados comuns.

## Legado e rollout

Não há backfill de `granted`. Todo booleano legado ligado é primeiro registrado numa quarentena privada e depois desligado, sem fabricar consentimento ou revogação. O profissional precisa reconfirmar com o aluno e gerar um novo `granted` pela interface. A quarentena existe só para diagnóstico/recuperação controlada e não participa da elegibilidade.

O cron consulta o ledger antes de criar a sessão e só aceita um JID direto cuja chave normalizada corresponda ao telefone/WhatsApp do aluno. O dispatcher repete a consulta antes de resolver o destinatário e novamente imediatamente antes de cada envio; assim, uma revogação posterior à criação da fila bloqueia o envio. Sessões sem consentimento vigente terminam como `failed` sem retry. A resolução existente de identidade/telefone confiável continua obrigatória.

## Rollback

O rollback é de contenção, não de downgrade inseguro: desliga todos os caches, encerra sessões semanais abertas, faz a elegibilidade retornar sempre `false`, revoga a RPC de escrita e preserva o ledger. Ele nunca restaura opt-ins booleanos legados nem apaga evidência.

## Estado

- código/migration local: implementados neste delta;
- migration aplicada em banco: não;
- Edge dispatcher deployado: não;
- frontend deployado: não;
- contatos enviados: nenhum.
