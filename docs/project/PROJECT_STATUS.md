# SETT / BN Performance — Estado operacional

**Revisão inicial:** 2026-11-12  
**Atualização operacional:** 2026-11-13  
**Natureza:** inventário em leitura do repositório. **Não é homologação do sistema em produção.**

## 1. Objetivo

Preservar um retrato verificável do projeto para ChatGPT (coordenação), Work (auditoria) e Codex (engenharia), sem depender de conversas antigas. Informações não revalidadas devem permanecer com status **histórico** ou **pendente de confirmação**.

## 2. Repositório e engenharia

- Repositório canônico: `matheusrobaloloreto-alt/sett-your-fitness-hub`; branch padrão: `main`.
- A branch `codex/claude-compat` foi encontrada 274 commits atrás de `main`, sem commits à frente, na comparação de 12/11/2026. Não usar como base para trabalho novo.
- Stack confirmada em `package.json`: Vite, React, TypeScript, Vitest; backend Supabase.
- `.github/workflows/quality.yml` define `npm ci`, `npm run verify:backend`, `npm run test`, `npm run build` e inspeção do bundle em eventos de push/PR.
Em 13/11 a branch `main` passou a estar protegida por ruleset ativo `Protect main - SETT`, com PR e check `verify` obrigatórios, sem bypass.
- `scripts/verify-canonical-backend.mjs` prevê produção e staging, separados por `SETT_DEPLOY_TARGET`. Não alterar esses controles sem revisão.
- `AGENTS.md` e `CLAUDE.md` anteriores contêm handoffs de julho/agosto; os handoffs antigos são referências históricas, não autorização para ações atuais.

## 3. Estado de funcionalidades — evidência histórica, não revalidada

`docs/project/RELATORIO-2026-08-27-FILA-ACUMULADA-SETT-BN.md` (atualizado em 05/09/2026) registra que diversas correções foram publicadas, incluindo:
- Edição/publicação atômica de treinos e rejeição de snapshots concorrentes;
- Seleção correta de ciclos e tratamento de revisões substituídas;
- Isolamento explícito por empresa no pré-cadastro;
- Fluxos de WhatsApp, pagamento e cadastro internacional;
- Separação entre produção e staging.

Não reabrir essas tarefas só por aparecerem em documentação anterior. Reproduzir o problema e confrontar código, banco e produção antes de criar uma nova issue de bug.

## 4. Pendências históricas para validação

Conforme relatório de 05/09/2026, **sem assumir que continuam abertas**:
- Alguns contatos não possuíam telefone/destinatário confiável para WhatsApp;
- Restava gravação/importação de vídeos próprios de exercícios;
- Algumas referências de exercícios exigiam classificação técnica;
- Existiam canários dependentes de dados externos e QA de campo em dispositivos móveis;
- Um ciclo histórico exigia prescrição legítima, sem fonte segura para reconstrução automática.

Não criar dados clínicos, não inventar treinos e não enviar mensagens a pessoas reais para tentar encerrar uma pendência histórica.

## 5. Plano de orquestração

| Prioridade | Item | Estado em 12/11 |
| --- | --- | --- |
| P0 | Consolidar instruções de agentes | Concluído — PR #1 integrado após CI verde |
| P0 | Criar documento de status e formulário de issue | Concluído — PR #1 |
| P0 | Definir modelo de PR e evidências | Concluído — PR #1 |
| P0 | Fortalecer TypeScript, lint e permissão mínima de CI | Concluído — PR #7 integrado, issue #3 encerrada |
| P0 | Proteger `main` | Concluído 13/11; ruleset ativo exige PR e check `verify`, bloqueia force-push/exclusão; issue #2 encerrada |
| P1 | Codex Cloud | Ambiente SETT Cloud publicado e visível no Mac; acionamento direto por este chat não disponível (#4) |
| P1 | Gatilho Work | Pendente (#5); tentativa de fontes de evento retornou 404 nesta sessão |
| P1 | Piloto sem Mac | Issue #9 autorizada, execução ainda não iniciada (#6) |
| P2 | Monitoramento/alertas automáticos | Planejado; sem cron/Work habilitado |

## 6. Processo mínimo durante o piloto

1. Usuário comunica objetivo ao ChatGPT.
2. ChatGPT estrutura issue com escopo, riscos, critérios de aceite e autorização separada.
3. Codex é acionado **por mecanismo confirmado**; abrir issue por si só não inicia Codex.
4. Codex entrega branch e PR. GitHub Actions registra verificações.
5. Revisão documenta conformidade e riscos. Sem aprovação humana, não há merge nem deploy.
6. ChatGPT consulta as evidências no GitHub e informa status e decisões necessárias.

Metas: baixa intervenção manual, operação na nuvem, rastreabilidade e nenhuma despesa não aprovada. O projeto principal não deve depender de um Mac ligado.

## 7. Segurança, uso e autonomia

Em 13/11 o usuário informou saldo de 624 créditos compartilhados Work/Codex e autorizou o piloto; o saldo não é consultável por esta conexão, portanto verificar uso real e não criar custos adicionais.
- Uma implementação ativa por projeto durante o piloto; até duas tentativas de correção automática antes de escalar.
- Sem deploy, alteração de secrets, migração destrutiva, integração na `main` ou custo adicional automáticos.
- Nenhum acesso presumido ao saldo de créditos do Codex.

## 8. Evidências da implantação de governança — 12/11/2026

- PR #1, `ff6420cca67ea7dbf9e8a8fbb43b2bd5d6250f95`: instruções, status, issue template e modelo de revisão integrados após CI aprovada.
- PR #7, `949432823bfb87111edb57c61c82865551f85f6f`: CI fortalecida, quatro erros TypeScript corrigidos, testes aprovados e issue #3 encerrada.
- Issues #2, #4, #5, #6 documentam as pendências reais. Não atribuir execução automática a elas.
- PR #8: runbook de operação e prompts de Work/Codex em preparação; nenhuma integração com esses agentes foi ativada.
Em 13/11, a `main` está `protected:true`, ruleset ativo `Protect main - SETT` e check obrigatório `verify`.

## 9. Fontes e próximas provas

- `AGENTS.md`, `CLAUDE.md`, `docs/project/HANDOFF-CODEX.md`.
- `docs/project/RELATORIO-2026-08-27-FILA-ACUMULADA-SETT-BN.md`.
- `.github/workflows/quality.yml`, `package.json`, `scripts/verify-canonical-backend.mjs`.
- Provas pendentes: proteções de branch, check-runs reais, status de deploy, permissões para gatilhos de Work/Codex.

Para alterar o estado de uma pendência neste documento, adicionar data, link da evidência e autor da validação.

## 10. Prontidão do piloto — 13/11/2026

- SETT Cloud publicado no Codex Cloud e visível no Mac, confirmado pelo usuário; execução real ainda não comprovada.
- Issue #9 autorizada, restrita a testes sem deploy ou merge. Referência de orçamento para a primeira tarefa: 120 créditos, **não imposta tecnicamente**.
- A conexão GitHub deste chat não dispõe de ação para iniciar uma tarefa Codex Cloud. Criar uma issue não executa o Codex.
- Para Work, o gatilho GitHub PR pronto para revisão deverá ser criado na interface Work; tentativa de listar eventos via automações retornou 404 nesta sessão. Prompt: docs/project/WORK_PR_REVIEW_PROMPT.md.
- Nenhum gatilho Work foi instalado, nenhuma tarefa Codex executada e nenhum saldo usado por essas ações nesta sessão.
- Próximo teste: execução real de #9 no Codex Cloud, PR/CI e revisão Work; registrar custo observado e intervenções.
