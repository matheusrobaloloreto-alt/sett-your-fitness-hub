# Ordem de piloto — Codex Cloud (ativar somente com franquia)

**Não executar antes da renovação e validação de permissões.**

Repositório: `matheusrobaloloreto-alt/sett-your-fitness-hub`  
Base: `main`  
Issue principal de acompanhamento: #6  
Instruções: `AGENTS.md`, `docs/project/AGENT_OPERATIONS_RUNBOOK.md`.

## Missão

Executar **uma tarefa pequena e não crítica** selecionada e autorizada em sua própria issue, sem depender do Mac local. A tarefa deve ser limitada a documentação, testes ou código isolado sem interação com produção.

## Contrato

- Leia a issue vinculada e confirme autorização explícita antes de modificar o repo.
- Não usar a branch histórica `codex/claude-compat`.
- Criar branch isolada `agent/<issue>-<resumo>`.
- Não executar deploys, migrations, manipular dados de alunos, segredos, cobrança, flags ou infra de produção.
- Não iniciar outra tarefa em paralelo.
- Rodar verificações pertinentes; documentar falhas sem omissões.
- Entregar PR vinculado à issue, com SHA, arquivos afetados, diff, testes, riscos e decisões pendentes.
- Duas tentativas de correção malsucedidas: interromper, preservar evidências e escalar.
- Não fazer merge.

## Critérios do teste de autonomia

1. Execução em ambiente Codex Cloud com Mac desligado.
2. Branch e PR visíveis no GitHub.
3. GitHub Actions registra checks do SHA.
4. Consumo e intervenções manuais são anotados.
5. Uma revisão separada fornece parecer.
6. Nenhuma escrita em produção e nenhum gasto não aprovado.

**Observação:** esta ordem não inicia a tarefa do Codex por si só. O acionamento efetivo deve ser realizado por mecanismo confirmado no produto.
