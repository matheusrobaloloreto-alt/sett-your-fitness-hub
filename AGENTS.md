# SETT / BN Performance — Instruções para agentes

**Revisado em:** 2026-11-12  
**Escopo:** desenvolvimento e revisão no repositório `matheusrobaloloreto-alt/sett-your-fitness-hub`.

## 1. Princípios de operação

- A branch de referência para trabalho novo é `main`. Crie uma branch isolada por tarefa e proponha integração via pull request (PR). Nunca faça push diretamente em `main`.
- GitHub Issues, PRs, commits e resultados de testes são os registros verificáveis do trabalho. Conversas de agentes não são fonte de verdade para o estado atual do projeto.
- Uma issue **não** autoriza automaticamente a execução: confirme a autorização explícita e seu escopo antes de iniciar trabalho que consuma recursos ou modifique o repositório.
- Não presuma comunicação automática entre ChatGPT, Work e Codex. Registre todos os resultados e bloqueios no GitHub.
- A colaboração antiga Claude ↔ Codex e a branch `codex/claude-compat` são **históricas**. Não reutilize atribuições, reivindicações de arquivos ou instruções de deploy dessas fontes como ordens atuais.
- Consulte `docs/project/PROJECT_STATUS.md` para o inventário atual de pendências e incertezas. Relatórios antigos devem ser usados como evidência histórica, não como confirmação de produção em tempo real.

## 2. Papéis

- **Usuário:** define prioridades e aprova mudanças críticas.
- **ChatGPT (coordenação):** estrutura issues, critérios de aceite, prioridades e decisões.
- **Work:** investigações, auditorias e revisões quando autorizado e disponível.
- **Codex:** implementação, testes e propostas de mudança por PR.
- **GitHub Actions:** testes automatizados; passar no CI não equivale a aprovação de deploy.

O revisor e o implementador não devem ser considerados independentes apenas por terem funções diferentes. Registre quem verificou cada evidência.

## 3. Fluxo da tarefa

1. Confirmar issue autorizada, escopo, critérios de aceite, branch-base e arquivos relevantes.
2. Conferir se há conflitos com trabalho em andamento. Uma tarefa de implementação ativa por projeto durante o piloto.
3. Trabalhar em branch isolada, com commits pequenos e sem mudanças fora do escopo.
4. Executar verificações pertinentes e registrar tanto resultados positivos como falhas.
5. Abrir PR com resumo, issue vinculada, riscos, evidências, testes e pendências.
6. Solicitar revisão e aprovação antes de integrar. Merge, deploy e autorização são etapas distintas.
7. Após duas tentativas automáticas malsucedidas, interromper, documentar a causa e solicitar orientação.

## 4. Restrições críticas

- **Nenhum deploy em produção sem aprovação explícita.** Isso inclui Netlify, Supabase Edge Functions, migrations, ativação de flags e troca de destinos.
- **Nenhuma operação destrutiva** em dados, branches ou serviços; nenhuma ampliação de permissões, rotação de credenciais ou contratação com cobrança sem aprovação.
- Nunca persistir credenciais, dados identificáveis de alunos, mensagens privadas ou corpos de provedores em commits, issues, PRs ou logs.
- Preservar isolamento por empresa/aluno, autenticação, RLS, pagamentos, segurança do WhatsApp e contratos clínicos de prescrição.
- Não enfraquecer regras de dor, contraindicação, volume, progressão, deload, validação ou publicação de prescrições sem decisão registrada.
- Não apontar o sistema para projetos antigos de Supabase, Lovable ou forks; não modificar backend para contornar verificações.
- Não assumir que migrations ou relatórios históricos correspondem ao schema vivo. Para mudanças de banco, requerer verificação autorizada e plano de rollback.
- Não editar manualmente arquivos gerados quando existir geração oficial, como `src/integrations/supabase/types.ts`.
- Manter execução de produção e staging separadas: os scripts atuais aceitam `SETT_DEPLOY_TARGET=production|staging`; conferir o alvo real e nunca inserir secrets fictícios para passar testes.
- Não usar `npm audit fix --force` ou upgrades que quebram compatibilidade sem escopo e revisão próprios.

## 5. Verificações

Para mudanças no app, selecionar e executar verificações aplicáveis:

```sh
npm run verify:backend
npx tsc --noEmit
npm run test
npm run build
npm run lint
```

Para Edge Functions ou mudanças de banco, incluir verificações Deno, migração e segurança pertinentes, somente em ambiente autorizado. A configuração existente de CI é `.github/workflows/quality.yml`; nem todos os comandos acima estão necessariamente configurados como gates automáticos. Não afirmar que um comando ou QA foi aprovado sem saída verificável.

## 6. Relatório obrigatório

Todo handoff e PR deve indicar:
- Issue, branch e commits;
- O que mudou e o que ficou fora;
- Verificações executadas, falhas e testes não executados;
- Riscos de dados, autenticação, ambiente e regressão;
- Dependências, reversão e bloqueios;
- Se requer merge, deploy, migration ou decisão do usuário;
- Próxima ação objetiva e responsável.

**Regra final:** autonomia para tarefas aprovadas, evidência para declarar conclusão e controle humano sobre operações críticas.
