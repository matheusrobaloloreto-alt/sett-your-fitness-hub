# SETT — Manual de operações dos agentes (ChatGPT, Work e Codex)

**Atualização:** 2026-11-16. **Responsável pela estratégia:** usuário.  
**Fonte operacional:** issues, PRs, commits e check-runs do repositório canônico.  
**Estado:** política e runbook operacional, atualizado após o piloto real do PR #11; distinguir recursos comprovados de bloqueios.

## 1. Resultado pretendido

O usuário conversa principalmente no ChatGPT, que define escopo, prioriza e consolida evidências. O GitHub registra solicitações e resultados. O Codex Cloud desenvolve mudanças autorizadas em ambiente hospedado, e o Work analisa PRs ou faz auditorias quando houver saldo e gatilho configurado. GitHub Actions executa testes e verificações sem depender do Mac.

**Limite atual:** este chat não é um serviço de execução contínua. O GitHub é o registro compartilhado; sua issue não inicia o Codex automaticamente. A automação Work por PR foi ativada e comprovada no PR #11, enquanto a delegação automática de tarefas para o Codex Cloud permanece bloqueada (#4).

## 2. Registro e estados das tarefas

Cada trabalho deve ter uma issue no formato `.github/ISSUE_TEMPLATE/agent-task.yml`. Estados operacionais, descritos no corpo ou em comentário:

| Estado | Evidência mínima | Quem pode mudar |
| --- | --- | --- |
| `PLANEJADA` | objetivo, escopo e aceite | coordenador |
| `AUTORIZADA` | aprovação explícita e limites de execução registrados | usuário/coordenador dentro de autorização existente |
| `EM_EXECUÇÃO` | link de execução Codex/Work comprovada ou branch/PR ativo | executor |
| `EM_REVISÃO` | PR, SHA e logs de verificação | executor/revisor |
| `BLOQUEADA` | falha, hipótese e decisão necessária | executor/revisor |
| `CONCLUÍDA` | critérios atendidos, testes, revisão, aprovação e link de entrega | coordenador após evidências |

Apenas criar uma issue, marcar checkboxes ou abrir PR **não é autorização de execução**. Use comentários com data, responsável e escopo aprovado. Não publicar senhas, chaves, identificadores pessoais ou dados de saúde.

**Regra:** o estado final é o estado comprovável pelos links, não a afirmação de um agente em conversa.

## 3. Divisão de responsabilidades

- **Usuário:** objetivos, decisões críticas, custos e produção.
- **ChatGPT:** decomposição, especificação, criação/consulta de issues e consolidação quando solicitado.
- **Codex Cloud:** alterações e testes na branch aprovada, sem merge/deploy.
- **Work:** auditoria e revisão baseada em evidências, sem fusão automática de PRs.
- **GitHub Actions:** execução do CI com token restrito; o CI não pode implantar por padrão.

O GitHub conecta os estados de trabalho, **não** compartilha automaticamente históricos privados de ChatGPT, Work e Codex.

## 4. Segurança e autonomia

Pode ser feito por agente em tarefa aprovada: leitura de repositório, mudanças limitadas em branch, testes, PR e relatório.  
Requer aprovação específica: deploy, alteração em produção/staging com dados reais, migrations destrutivas, credenciais, permissões, pagamentos, mensagens a clientes, mudanças em regras clínicas, alteração de flags e contratação com cobrança.

Durante o piloto: **uma implementação ativa por projeto**, **até duas tentativas de correção por falha** antes de bloquear e escalar; sem merge/deploy autônomo, sem troca de branch canônica e sem criação de secrets a partir de conversas.

Se o saldo do Work/Codex estiver zerado, nenhuma execução deve ser solicitada automaticamente. O ChatGPT pode continuar planejamento e consulta ao GitHub, conforme ferramentas disponíveis. Não há API de saldo validada neste projeto.

## 5. Caminho do pedido até a entrega

1. O usuário faz o pedido no ChatGPT.
2. ChatGPT verifica documentação atual, histórico, arquivos e riscos. Abre issue com critérios observáveis e uma recomendação de prioridade.
3. A autorização de execução é registrada separadamente, respeitando custo e ambiente.
4. Codex Cloud recebe a issue por mecanismo **comprovadamente disponível** (no piloto, inicialmente manual, caso não exista integração direta).
5. Codex parte de `main`, cria branch `agent/<numero-issue>-<assunto>`, aplica alterações pequenas e abre PR vinculado.
6. GitHub Actions valida TypeScript, lint, testes e build conforme o gate efetivo.
7. Quando configurado e com créditos, Work revisa o PR usando o SHA e os critérios da issue, sem alterar código automaticamente.
8. ChatGPT consulta o GitHub, compara aceite versus evidências e descreve eventuais decisões do usuário.
9. Só após a aprovação exigida e os checks verdes o merge é feito. Deploy permanece uma autorização distinta, com checklist e rollback.

## 6. Gatilho de revisão do Work (ativo para PRs prontos)

**Comprovado em 13/11/2026:** a automação `Revisão de PRs do SETT` está ativa e foi executada após o evento `ready_for_review` do [PR #11](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/pull/11). O job `verify` passou para o SHA `2634754288ce2836b75c27351005b10471b36ad0` e o Work publicou o relatório [APTO A REVISÃO HUMANA](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/pull/11#issuecomment-6860708064).

- Gatilho: somente `pull_request.ready_for_review` no repositório canônico, base `main`, PR aberto/não rascunho. Ignore outros eventos.
- Deduplicação de revisão: marcador `<!-- sett-work-pr-review:PR:SHA -->`, com número e SHA reais; verificar PR, histórico e commit antes de publicar.
- Em 16/11/2026, o prompt da automação recebeu um **complemento**, mantendo o gatilho e todas as proibições: publicar também um resumo de handoff na *única* issue explicitamente vinculada, se houver permissão, com marcador `<!-- sett-work-issue-handoff:ISSUE:PR:SHA -->`. Antes de comentar, procurar marcador idêntico, e nunca alterar automaticamente estado/labels/corpo da issue.
- O comentário da issue registra link do relatório, conclusão, provas da CI, pendências e responsável pela próxima decisão. **Esse complemento ainda precisa ser validado por uma próxima revisão real.**
- Não há gatilho de Work ativado para comentários de issues ou para auditorias avulsas: estas precisam ser explicitamente iniciadas no Work. A conexão disponível para listar novos eventos retornou `404 Action not found` em 16/11/2026.
- O Work nunca inicia Codex, CI, merge, deploy, alterações de código, credenciais ou serviços pagos por esse fluxo.

Instruções canônicas: `docs/project/WORK_PR_REVIEW_PROMPT.md`.

## 7. Codex Cloud (execução manual validada; disparo remoto bloqueado)

- O ambiente `sett-your-fitness-hub` foi publicado, e o usuário confirmou que ele aparece no Mac e no Codex Cloud.
- **Execução real comprovada:** a issue #9 foi implementada no Codex Cloud, gerando a branch `codex/issue-9-plan-cycle-window`, commit `2634754288ce2836b75c27351005b10471b36ad0` e [PR #11](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/pull/11), criado pelo coordenador após a criação via Codex falhar com `Forbidden` no GitHub GraphQL. CI e revisão Work passaram. Não houve merge/deploy.
- **Não comprovado:** início sem intervenção do usuário e funcionamento com o Mac desligado.
- A menção `@codex` na [issue #4](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/issues/4) alcançou o bot GitHub, que respondeu `To use Codex here, create an environment for this repo`. O ambiente moderno existe, mas a compatibilidade com a integração GitHub/Legacy não foi resolvida.
- A tentativa pelo navegador interno com sessão autenticada selecionou o ambiente Cloud e tentou iniciar a auditoria [#12](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/issues/12), mas retornou `Could not start this chat`; **nenhuma tarefa Codex foi executada ou confirmada**.
- Enquanto o problema persistir, não acionar a API paga, não duplicar ambientes/credentials e não fingir que abrir uma issue dispara o Codex. Aceitar início manual no Codex Cloud apenas quando autorizado, uma tarefa por vez, com a URL/ID da execução registrada no GitHub.

## 8. Proteção da branch principal (concluída)

O usuário criou e ativou em 13/11/2026 o ruleset `Protect main - SETT` (ID `27201197`). Consulta de leitura à API do GitHub confirmou que está ativo para `main`: exige pull request e check `verify`, bloqueia force-push e exclusão, sem bypass configurado. A issue [#2](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/issues/2) foi encerrada.

O ruleset **não substitui aprovação/revisão humana**: revisão formal obrigatória e merge são decisões separadas. Não testar a proteção com push destrutivo. Mudança administrativa posterior exige nova confirmação do estado.

## 9. Custos, falhas e interrupções

| Evento | Ação |
| --- | --- |
| Franquia esgotada | congelar execução Work/Codex; só análise e planejamento |
| CI vermelho | bloquear PR; abrir/atualizar incidente com log, não ocultar erro |
| Executor tentou duas correções e falhou | escalar ao coordenador; evitar loop |
| Serviço cloud indisponível | registrar a interrupção e mecanismo de recuperação |
| Requer prod/secrets/financeiro/dados | aprovação antes de executar |
| Evidência de deploy incoerente | interromper promoção, preservar histórico e realizar auditoria |

Não confundir um PR aprovado por testes com funcionalidade validada em produção.

## 10. Painel operacional sem nova ferramenta

Por ora, usar a listagem de Issues (pendências), PRs (trabalho/propostas) e Actions (testes) do GitHub. O ChatGPT pode consultar esses registros quando solicitado. Alertas proativos recorrentes exigem tarefa agendada ou gatilho configurado no Work, sujeito a uso e permissões.

Não criar cron de GitHub Actions, polling contínuo, custo de API ou servidores 24/7 enquanto não houver um benefício concreto medido.

## 11. Critério de aceite da orquestração v1

- Uma issue de implementação autorizada vira branch, PR, CI e revisão.
- O trabalho roda sem Mac ligado.
- O usuário intervém somente em aprovação/bloqueio ou inicialização manual que não foi possível automatizar.
- Registro de início, término, resultados, falhas e custo disponível.
- Nenhuma operação não autorizada em produção.
- A integração é limitada se Codex não puder ser acionado automaticamente da issue; isso deve ser documentado como estado real.

## 12. Estado do backlog em 16/11/2026

- #2 — proteção da `main`: **concluída**.
- #3 — CI, TypeScript, lint e build: **concluída** (PR #7).
- #4 — acionamento automático Codex Cloud: **bloqueado por integração/autenticação/ambiente**; não resolvido.
- #5 — automação Work por `ready_for_review`: **concluída e testada**, com comentário no PR #11; publicação também na issue vinculada foi adicionada ao prompt em 16/11 e ainda requer teste.
- #6 — ciclo-piloto: **parcialmente validado**; impedimentos de início automático e teste com Mac desligado.
- #9 — testes de seleção de ciclos: **PR #11 aberto, CI verde, Work APTO A REVISÃO HUMANA**; ainda sem merge.
- #12 — auditoria da publicação de treinos: **especificada, ainda não executada**; tentativa pela interface Codex retornou `Could not start this chat`.

## 13. Protocolo de handoff entre conversas

1. **Issue = pedido e estado:** objetivo, autorização, responsável, escopo, critério de aceite, estado (`PLANEJADA`, `AUTORIZADA`, `EM_EXECUÇÃO`, `EM_REVISÃO`, `BLOQUEADA`, `CONCLUÍDA`) e bloqueios com evidência.
2. **PR = proposta de integração:** número da issue vinculada, branch, SHA, diff, testes e riscos. CI verde é condição necessária, não autorização de merge.
3. **Work (revisor automático):** publica parecer com marcador por PR/SHA e, quando houver única issue vinculada e permissão, publica nela resumo deduplicável. Não altera status da issue nem código.
4. **Codex (executor):** ao concluir, registra branch/commit/PR ou diagnóstico verificável na issue. Só executar tarefa cuja autorização esteja registrada; criar issue não autoriza por si só.
5. **ChatGPT (coordenador):** lê issues, PRs, runs e comentários, consolida evidências e prioriza a próxima entrega. Não presume acesso direto a outros chats nem que uma ferramenta trabalha em segundo plano sem automação.
6. **Usuário:** decide operações críticas (merge quando exigida sua revisão, deploy, credenciais, banco, regras clínicas e gastos adicionais).

**Limitação técnica:** o fluxo já testado é `Codex iniciado manualmente → branch/PR → GitHub Actions → Work por ready_for_review → registro no GitHub`. O trecho `GitHub issue → Codex Cloud automaticamente` continua bloqueado, e Work não inicia auditoria avulsa por comentário de issue nesta configuração.
