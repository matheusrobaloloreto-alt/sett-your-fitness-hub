# SETT — Manual de operações dos agentes (ChatGPT, Work e Codex)

**Versão:** 2026-11-12. **Responsável pela estratégia:** usuário.  
**Fonte operacional:** issues, PRs, commits e check-runs do repositório canônico.  
**Estado:** documentação executável; **não** implica que gatilhos Work/Codex estejam habilitados.

## 1. Resultado pretendido

O usuário conversa principalmente no ChatGPT, que define escopo, prioriza e consolida evidências. O GitHub registra solicitações e resultados. O Codex Cloud desenvolve mudanças autorizadas em ambiente hospedado, e o Work analisa PRs ou faz auditorias quando houver saldo e gatilho configurado. GitHub Actions executa testes e verificações sem depender do Mac.

**Limite atual:** o ChatGPT não é um serviço de orquestração contínua em segundo plano. A criação de uma issue não chama o Codex. O acionamento Work por PR precisa de configuração dentro do Work. Não apresentar esses mecanismos como ativos antes do piloto real.

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

## 6. Gatilho de revisão do Work (ainda não ativado)

Após 16/11 e confirmação de franquia:

- Conectar o repositório autorizado no Work.
- Escolher o evento compatível **pull request marked ready for review** (ou equivalente que conste na interface).
- Condição: repositório exato; PR não rascunho; sem execução duplicada para o mesmo head SHA; ignorar PRs exclusivamente de automação se causarem loops.
- Instrução: revisar escopo, testes, riscos, segurança e critérios sem deploy/merge.
- Registrar relatório e SHA no PR/artefato autorizado. Se só houver relatório na tarefa Work, adicionar link ao GitHub manualmente até existir integração de retorno.
- Conferir em **Agendadas** se o gatilho está ativo; testar somente com um PR controlado e créditos disponíveis.

Prompt detalhado: `docs/project/WORK_PR_REVIEW_PROMPT.md`.

A documentação pública indica suporte a tarefas Work acionadas por atividades de pull request em GitHub autorizado: https://help.openai.com/en/articles/20001275 .

## 7. Codex Cloud (ainda não validado)

- Preparar/publicar ambiente com repositório exato, branch `main`, Node, dependências e comandos.
- Não cadastrar credenciais de produção. Usar dados sintéticos e testes locais.
- Criar uma tarefa pequena, com aceite objetivo, usando o prompt `docs/project/CODEX_CLOUD_PILOT_PROMPT.md`.
- Verificar se o usuário precisou iniciar pelo app; esse fato é uma limitação do fluxo, não uma falha do usuário.
- Registrar id/link de execução, PR, consumo observável e ações manuais.
- Somente após validar o caminho nativo, avaliar API/SDK/CLI como alternativa **de cobrança separada** e que requer orçamento.

Documentação: https://help.openai.com/en/articles/20001545-using-codex-cloud .

## 8. Branch protection — bloqueio administrativo conhecido

Em 12/11/2026, `GET /branches/main` retornou `protected:false` e `protection.enabled:false`; `GET /rulesets?includes_parents=true` retornou lista vazia. Portanto, a `main` está **sem proteção ativa**. A consulta direta ao endpoint administrativo de proteção retornou `403 Resource not accessible by integration`: a conexão atual pode verificar o estado, mas **não pode criar/alterar a regra**. É necessário acesso administrativo pela interface ou uma integração com permissão específica.

Issue de controle: #2. Recomenda-se:
- exigir PR para `main`;
- exigir o status check do job `verify` após confirmar execução real;
- bloquear force-push/deleção;
- limitar bypass;
- escolher política de aprovação compatível com revisores elegíveis do repositório;
- não ativar auto-merge nem auto-deploy.

Não testar políticas tentando fazer push destrutivo ou contornar regras.

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

## 12. Backlog de habilitação

- #2 — branch protection e checagem administrativa;
- #3 — TypeScript, lint e segurança da CI;
- #4 — acionamento Codex Cloud;
- #5 — gatilho e revisão Work;
- #6 — ciclo-piloto completo.

Revisar este manual quando a execução real mostrar que alguma hipótese estava incorreta.
