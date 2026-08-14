# Relatório CRM/Operações — feedback BN — 2026-08-14

## Resultado

As correções locais foram implementadas em worktree e branch isoladas (`codex/bn-feedback-crm`), sem tocar o WIP da árvore principal. Nenhum deploy, push, migração remota ou envio de WhatsApp foi executado.

## Implementado localmente

### WhatsApp e segurança de destinatário

- O backend agora resolve a conversa e o destinatário a partir dos dados persistidos no servidor.
- `remoteJid` e `studentId` enviados pelo cliente são tratados somente como confirmação e falham de forma fechada quando divergem do vínculo salvo.
- Conversas novas vinculadas a aluno exigem que o telefone informado corresponda ao telefone/WhatsApp do cadastro.
- O identificador do destinatário é normalizado no formato aceito pelo provedor sem alterar IDs especiais de grupo/LID.
- Texto, mídia, exclusão e automação usam o mesmo vínculo de destinatário.
- Sessões automáticas são bloqueadas quando o aluno salvo no contexto já não corresponde ao aluno vinculado à conversa.
- Erros do provedor foram tornados mais claros e sanitizados para a UI.

Commit: `76ae174`.

### Kanban: pagamento para avaliação

- Foi criada uma RPC auditável para a transição manual de `payment_pending` para `active_onboarding`.
- A operação exige papel administrativo permitido, justificativa mínima, matrícula operacional e pagamento confirmado.
- O registro do aluno é bloqueado durante a transição e o estado anterior é validado, evitando concorrência e atalhos indevidos.
- A transição registra ator, motivo, estágio anterior/novo e matrícula paga em `student_funnel_events`.
- A operação não dispara WhatsApp e não altera as automações existentes.
- A UI pede justificativa antes de concluir o movimento.

Commit: `0e18702`.

### Sem matrícula e dashboard da treinadora

- A regra local de alerta de matrícula foi alinhada ao conceito operacional canônico: `active`, `awaiting_training` ou `awaiting_renewal`, sempre dentro da empresa correta.
- Snapshot sanitizado de 2026-08-14: 53 alunos ativos; 48 têm matrícula operacional; 5 ativos estão sem matrícula operacional. Há também 9 matrículas operacionais vinculadas a perfis que não estão ativos. Não foram expostos nomes nem dados pessoais.
- A rota da treinadora, o papel, a UI e os filtros foram verificados. A treinadora consegue acessar o dashboard previsto para o papel, mas enxerga somente alunos atribuídos a ela (`trainer_id = user.id`). Ela não recebe o dashboard administrativo completo da empresa, por desenho atual. Nenhuma permissão real foi elevada.

Commit: `1750f72`.

## Contato semanal automático — Renan Marques

O único envio autorizado **não foi executado**. A correção de vínculo do destinatário ainda está somente na branch local; testar contra o ambiente real antes de um deploy controlado manteria o risco de enviar para o contato incorreto. O intervalo vivo também não foi alterado, portanto continua exatamente na configuração original (limite de dois contatos em sete dias e intervalo mínimo de 72 horas, conforme as regras existentes).

Para concluir o teste com segurança, após autorização específica para deploy controlado:

1. aplicar a migração auditável e publicar as funções corrigidas (`whatsapp-manager`, `process-automation-sessions` e `whatsapp-webhook`);
2. confirmar na UI e no vínculo persistido que a conversa pertence ao aluno autorizado, sem reproduzir o telefone no relatório;
3. criar uma sessão de teste estritamente vinculada a esse aluno e registrar o valor original da cadência;
4. reduzir temporariamente somente a janela necessária ao teste, disparar uma única vez e confirmar entrega/destinatário por evidência sanitizada;
5. restaurar imediatamente o valor original e comprovar a restauração.

## Validação

- `deno test` do módulo de identidade WhatsApp: 7/7.
- `deno check` das três Edge Functions alteradas: aprovado.
- Testes Vitest direcionados: 34 aprovações nas duas rodadas, cobrindo destinatário, funil, mensagens, matrícula e acesso da treinadora.
- `npx tsc --noEmit`: aprovado.
- `npm run verify:backend`: aprovado para o backend canônico `zshrcgbyhzxpnlccssyz`.
- `npm run build`: aprovado (4.200 módulos transformados); restam apenas avisos históricos de tamanho de chunks.
- ESLint direcionado a todos os arquivos TypeScript/TSX alterados: aprovado sem erros.

## Pendências e riscos

- A migração SQL foi revisada e testada apenas de forma estática; ainda precisa ser aplicada em ambiente controlado antes de a nova ação do Kanban funcionar.
- As Edge Functions corrigidas ainda não estão publicadas; produção continua com o comportamento anterior até autorização de deploy.
- A suíte completa tem 330/331 testes aprovados. A falha restante é herdada do checkpoint-base em `src/lib/prescription/engine.test.ts` (expectativa de RIR em deload), fora deste escopo.
- O lint completo mantém oito erros herdados do WIP de nutrição (`ai-nutrition-meals`), também fora deste escopo, além de avisos históricos. Os arquivos deste trabalho não introduzem esses erros.
- A decisão de dar à treinadora o dashboard administrativo completo seria uma mudança de autorização e produto, não uma correção. Ela precisa de requisito explícito antes de qualquer ampliação.

## Próxima tarefa prioritária

Revisar os três commits e, com autorização explícita da raiz, executar um deploy controlado das correções de WhatsApp/migração. Só depois realizar a única execução de teste semanal autorizada para o aluno indicado, com vínculo de destinatário confirmado e restauração comprovada da cadência.

## Método operacional

Foi adaptada a skill ATENA nº 239, **Bot de Atendimento e Vendas para WhatsApp**, com travas adicionais de consentimento, destinatário e anti-spam adequadas a este caso.
