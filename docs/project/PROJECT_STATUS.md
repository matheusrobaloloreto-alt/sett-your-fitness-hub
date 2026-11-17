# SETT / BN Performance — Estado operacional

**Revisão inicial:** 2026-11-12  
**Atualização operacional:** 2026-11-16  
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

## 5. Plano de orquestração — 16/11/2026

| Prioridade | Item | Estado comprovado |
| --- | --- | --- |
| P0 | Instruções, status, templates | **Concluído** — PR #1 |
| P0 | TypeScript, testes, lint, build | **Concluído** — PR #7 e job `verify` |
| P0 | Proteção da `main` | **Concluído** — ruleset `Protect main - SETT`, ID `27201197`; issue #2 encerrada |
| P1 | Codex Cloud | **Piloto manual validado** — branch, commit e PR #11; acionamento por issue `@codex` continua bloqueado (#4) |
| P1 | Work revisa PRs | **Concluído para `ready_for_review`** — automação disparada e comentário no PR #11; issue #5 encerrada |
| P1 | Handoff Work → Issue | **Configurado em 16/11, ainda não testado em novo PR** — marcador `sett-work-issue-handoff` |
| P1 | Piloto coordenado | **Parcialmente validado** — issue #6, falta início autônomo e prova com Mac desligado |
| P1 | Testes de janela de ciclos | **PR #11 aberto, CI verde, Work APTO A REVISÃO HUMANA**, ainda sem merge — issue #9 |
| P1 | Auditoria de publicação/portal | **Planejada e bloqueada no início Codex** — issue #12 (`Could not start this chat`) |

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

## 8. Evidências operacionais — 12 a 16/11/2026

- PR #1: instruções, status, templates, integrado após CI verde.
- PR #7: CI e TypeScript corrigidos, integrado após testes.
- PR #8: runbook e prompts operacionais integrados.
- Proteção da branch: ruleset `Protect main - SETT` ativo em 13/11, PR + check `verify` exigidos.
- [PR #11](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/pull/11) e [run do GitHub Actions](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/actions/runs/43476591967): branch Codex, testes aprovados, PR não integrado.
- [Work reportou APTO A REVISÃO HUMANA no PR #11](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/pull/11#issuecomment-6860708064), com deduplicação PR/SHA.
- [Issue #4](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/issues/4): `@codex` pelo GitHub retornou necessidade de ambiente mesmo com Cloud moderno publicado; não há solução confirmada.
- [Issue #12](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/issues/12): tentativa autenticada via Codex Cloud retornou `Could not start this chat` e não criou execução comprovada.
- Em 16/11 a automação Work por PR foi atualizada para registrar *resumo* na issue vinculada, se houver uma só e com permissão; sem prova real desse complemento ainda.

## 9. Fontes e próximas provas

- `AGENTS.md`, `CLAUDE.md`, `docs/project/HANDOFF-CODEX.md`.
- `docs/project/RELATORIO-2026-08-27-FILA-ACUMULADA-SETT-BN.md`.
- `.github/workflows/quality.yml`, `package.json`, `scripts/verify-canonical-backend.mjs`.
- Provas pendentes: status de deploy/produção e QA funcional; acionamento automático do Codex; publicação do resumo Work diretamente na issue; execução sem Mac ligado.

Para alterar o estado de uma pendência neste documento, adicionar data, link da evidência e autor da validação.

## 10. Prontidão e limites — 16/11/2026

- **Comprovado:** Codex Cloud executou a issue #9 com início manual, publicou uma branch e commit; PR #11 foi aberto pelo coordenador após erro de permissão no Codex. GitHub Actions `verify` passou, e a automação Work foi acionada por `ready_for_review`, concluindo auditoria e comentário no PR.
- **Não comprovado:** início automático de tarefas Codex a partir do chat ou GitHub; operação com Mac desligado; funcionalidades em produção; escrita do Work em issue vinculada pelo novo complemento.
- **Bloqueios:** `@codex` pede ambiente (issue #4); tentativa autenticada de abrir tarefa Codex para a issue #12 falhou com `Could not start this chat` e não gerou auditoria; chamado ao suporte ainda sem protocolo.
- **Segurança:** sem merge, deploy ou produção por automações. `main` protegida, PR #11 ainda aberto para avaliação humana. Nenhuma confirmação de saldo via API: o usuário informou créditos renovados, mas o valor atual não é consultável por esta conexão.
- **Próxima ação:** manter GitHub como registro entre os chats; revalidar complemento Work → Issue num próximo PR elegível, sem reabrir revisão do mesmo SHA; resolver o início Codex por mecanismo suportado antes de solicitar outra execução; auditar o fluxo de publicação da issue #12 sem presumir execução.
