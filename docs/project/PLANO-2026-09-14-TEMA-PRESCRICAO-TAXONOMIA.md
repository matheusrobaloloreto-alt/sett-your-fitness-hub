# Tema pessoal, revisão de treino, taxonomia e Dashboard — 14/09/2026

## Contrato de execução

Objetivo: tema pessoal sem flash nos portais, salvamento normal com proteção de concorrência, separação entre categorias de busca e anatomia usada no volume e visualização integral do Dashboard pelo treinador da mesma empresa.

Fonte canônica: este worktree `release-rc`, branch `codex/sett-release-rc-20260826`, baseline limpo `262cfc7a55f7de253c08394a87b9ed3458de5fe9`. As instruções de branch e ownership desta tarefa prevalecem sobre os handoffs históricos de junho/julho.

Limite remoto: commit e push nesta branch após gates verdes. Sem integração em main, deploy, migrations remotas ou escrita em dados reais. Rollback local por reversão do commit desta entrega; alterações de schema somente aditivas e documentadas.

Fora deste conjunto: hotfix de troca de treinador e hotfix do bloqueio de salvamento por BNITO. Este último parte de `c138200`, no worktree `sett-hotfix-workout-save-20260914`, tarefa `01a09e92-e1b7-72b0-b2f3-d4ade0d1d3b7`. Não incorporá-los aqui; o Release Guardian reconciliará sobreposições posteriores.

## Donos e sequência

1. `theme`: mecanismo existente, inicialização, controles no aluno e em Aparência, tokens e testes de tema.
2. `save_workout`: reprodução e contrato CAS/RPC, revisão atual, preservação de rascunho/histórico e testes de concorrência; após concluir essa frente, implementar a paridade de leitura do Dashboard para treinador.
3. `taxonomy`: contrato compartilhado, cadastro/importação, filtros multisseleção, alvos e migration aditiva.
4. `root`: cálculos frontend/SQL, motor e validação Bnito, integração, testes globais, build e entrega.
5. Revisor independente após implementações: falhas de contrato, segurança/tenant, compatibilidade e UX; correções antes do commit.

Na frente do Dashboard, a revisão de segurança rejeitou conceder `company_dashboard_full` automaticamente: ampliar `students` por RLS também habilitaria escritas em tabelas filhas de alunos não atribuídos. `dashboard_security_design` definiu uma RPC dedicada; `dashboard_read_backend` implementa SQL, contrato de retorno e canário com policies reais, enquanto `save_workout` integra a visualização. A exceção de modelo ASTRA nessa revisão e no backend se deve ao efeito indireto das policies e à necessidade de preservar o conjunto de escritas existentes.

`WorkoutBuilder.tsx` é compartilhado por regiões: salvamento/conflito pertence a `save_workout`; cadastro/filtros pertence a `taxonomy`. Preservar diffs concorrentes.

## Aceite e verificação

- Preferência por usuário/dispositivo, sistema sem escolha, aplicada antes do paint. Sol/Lua junto aos avisos do aluno; professor em Aparência pessoal.
- Save normal, segundo save, adicionar/remover linhas, concorrência real e resolução escolhida, preservando histórico.
- Categorias: Core, Mobilidades, Funcionais, Base, Pesos Livre, Peso Corporal, Maquinas, Pliometria; nunca contribuem para volume.
- Anatomia: Abdômen, Quadríceps, Posterior de coxa, Glúteos, Adutores, Panturrilha, Deltoide Lateral, Deltoide Posterior, Deltoide Anterior, Antebraço, Biceps, Triceps, Dorsal, Trapezio, Peitoral.
- A fonte original foi conferida: são exatamente **15** grupos musculares. Usar exclusivamente essa lista.
- Primário = 1, secundário = 0,5; overrides históricos preservados, porém sem aplicação nos cálculos novos.
- Dashboard: inventário de todas as seções, incluindo Renovação e Aniversários; paridade de leitura e dados entre admin/coordenador e treinador da mesma empresa. Preservar isolamento de tenant e restrições de escrita administrativa. Testar roles reais, backend, loading/empty/error e desktop/mobile nos dois temas.
- Testes focados e suíte completa; TypeScript, ESLint, build, verificação Deno/SQL dos caminhos alterados; Playwright local com dados sintéticos em desktop/mobile light/dark e inspeção de console/layout.

## Checklist acumulado

- ✅ Baseline inicial: worktree, branch, HEAD, upstream, status e diff confirmados com árvore limpa em `262cfc7a`.
- ✅ Tema pessoal local: preferência por usuário/dispositivo, prepaint pela sessão do projeto atual e controles nos portais; revisão independente e quatro cenários de browser aprovados.
- ✅ Salvamento local: snapshot CAS separado do rascunho, retorno confirmado e resolução de conflito; testes SQL locais e seis cenários de browser aprovados.
- ✅ Taxonomia e volume locais: contrato de 15 músculos e oito categorias, pesos fixos, paginação e preservação do legado; testes focados, canário SQL e quatro cenários de browser aprovados.
- ✅ Dashboard completo do treinador local: consulta dedicada, UI integral em leitura, estados loading/empty/error e desktop/mobile nos dois temas; sem ampliar `has_staff_permission` ou RLS de alunos e sem fallback para consultas diretas.
- ✅ QA independente: backend, tenant/pais, alertas direcionados, quatro tabelas filhas, papéis, ações ocultas e seis cenários de navegador aprovados.
- ✅ Gates globais: TypeScript do aplicativo, ESLint, build e suíte completa aprovados; 370 suítes e 1.073 testes passaram na repetição integral.
- ❌ Commit/push (em andamento): gates verdes; revisão final do diff e sincronização do upstream antes de publicar a branch. Staging e produção fora deste escopo.
