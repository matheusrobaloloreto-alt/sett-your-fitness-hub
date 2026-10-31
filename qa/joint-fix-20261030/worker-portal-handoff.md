# TRAININGVISIBILITY — freeze após polish

Workspace: `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix`.
Base: `04c7cd3f7e1bbcf732c017b032f1a21a32b48a46`.
Ownership congelado: os seis arquivos em `worker-portal-freeze.sha256`; sem alteração de escopo. Sem commit/push/deploy, migração, dados, secrets, lockfiles ou SW.

Histórico separado da cobertura operacional: leitura sob RLS com confirmação de usuário/aluno/empresa/matrícula, paginação, exclusão de futuro, remoção explícita, substituições e arquivo. Não inicia sessão, salva logs, renova matrícula, altera datas ou envia ACK. Materialização legada não exige delivery ACK. Flags offline distinguem prescrição externa de ausência de treino digital. Histórico de sessões permanece separado.

Polish final: datas dd/MM/yyyy; semanas, métricas, métodos, tipos de série e cadência legíveis; sem dump JSON. Teste confirma aviso de matrícula vencida mesmo quando o ciclo ainda tem validade.

## Evidência local

- RED inicial do helper antes da implementação; RED do teste de datas/semana antes do polish.
- Última reexecução após polish: 66/66 testes em `studentPrescriptionHistory.test.ts`, `PublishedPrescriptionHistory.test.tsx` e `StudentPortal.reads.test.tsx`.
- Reexecução anterior ao polish: 73/73, incluindo extraSets e completion (esses arquivos/fluxos não foram alterados pelo polish).
- ESLint dos dois arquivos do polish: zero erros/warnings. `git diff --check`: limpo.
- TypeScript Compiler API com root restrito a `PublishedPrescriptionHistory.tsx`, opções de tsconfig.app.json: zero diagnósticos **nesse componente**. Não equivale a TSC global; dependências não foram certificadas por esse resultado.
- Nenhum broad build ou preview build executado pelo worker.

Reexecutar testes focados (valores sintéticos locais; nenhuma credencial real):

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=synthetic-test-only ./node_modules/.bin/vitest run src/lib/studentPrescriptionHistory.test.ts src/components/student/PublishedPrescriptionHistory.test.tsx src/pages/student/StudentPortal.reads.test.tsx
shasum -a 256 -c qa/joint-fix-20261030/worker-portal-freeze.sha256
```

## QA independente e preview build — raiz

1. Conferir hashes e revisar os seis arquivos; reexecutar testes e TSC/build conforme gate da raiz.
2. Preview 57830: usar fixture student owned stage; Auth/REST/Storage reais conforme gateway, somente GET e POST get_* RPC autorizados; functions/providers bloqueados. Worker não alterou gateway nem fixtures.
3. Confirmar home + aviso pendente abrem histórico; métricas completas/semana e datas legíveis; matrícula vencida tem aviso próprio e nenhum controle de iniciar/registrar/salvar.
4. Comprovar ciclo atual válido continua operacional; ciclo anterior/externo só consulta; ciclo futuro, quarentena, arquivo, remoção e substituição permanecem ocultos. Se faltar histórico materializado no fixture, preparação isolada fica com a raiz.
5. Troca de usuário/reabertura e falha de rede não devem exibir resposta obsoleta nem tratar falha como histórico vazio. Confirmar ausência de ACK/mutações ao consultar.

Estado: implementação local congelada; QA independente/browser/banco nativo e preview build pendentes com a raiz. Sem nova ação profissional: prescrever, ajustar datas e renovar continuam pelo fluxo existente. Rollback local somente nos seis arquivos deste manifesto, preservando alterações concorrentes.
