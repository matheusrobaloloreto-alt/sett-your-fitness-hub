# Relatório para o Codex — Cadência de Contatos · Presença de Colaboradores · Aba Carteira

**Data:** 2026-07-29 · **Autor:** Claude (ATENA) · **Branch:** `codex/claude-compat`
**Pedido do Matheus:** 3 features novas (cadência de quem some no WhatsApp, registro de entrada/saída de colaboradores, aba Carteira com mini-CRM).

---

## ⚠️ 1º: UMA PENDÊNCIA QUE PRECISA DE VOCÊ (ou do Matheus)

A migration **`supabase/migrations/20260729120000_contact_cadence_and_staff_sessions.sql`** está no repo
mas **NÃO FOI APLICADA no Bn-app**: o MCP do Supabase caiu na sessão e o classifier de permissões
bloqueou tanto `migration repair` quanto a rota de DDL via edge. Descobertas importantes no caminho:

- `supabase db push` **NÃO é seguro** hoje: o dry-run lista ~20 migrations antigas *local-only*
  (jun/05→jun/20) que já estão vivas no banco — push tentaria reexecutá-las.
- **Caminho correto** (validei até onde o classifier deixou):
  1. `supabase migration list` → pegar todas as versões com a coluna remota vazia, EXCETO `20260729120000`;
  2. `supabase migration repair --status applied <versões antigas>` (marca no ledger SEM executar);
  3. `supabase db push --dry-run` → deve listar SÓ a `20260729120000`; então `supabase db push`.
  - Alternativa 1-minuto: colar o SQL da migration no SQL Editor do dashboard e inserir a linha no
    ledger (`supabase_migrations.schema_migrations`, version `20260729120000`).
- **O frontend degrada graciosamente até lá**: card de Cadência se esconde (RPC inexistente),
  presença falha em silêncio, aba Atividade mostra empty-state, Carteira funciona sem a coluna de cadência.

## O que a migration cria

1. `whatsapp_chats.cadence_muted boolean default false` — botão "inativar do countdown".
2. **RPC `contact_cadence(_company_id)`** (security invoker → RLS aplica): por chat da empresa
   (exclui grupos e mutados), retorna a **última mensagem RECEBIDA** (`is_from_me=false`) + horas
   desde; `kind` = `lead` (chat sem student) ou `aluno` (status active/pending/awaiting_renewal).
3. **`staff_sessions`** (id, user_id, company_id, role, started_at, last_seen_at, ended_at) com RLS:
   insert/update próprios; select = próprio, master, ou **admin da mesma empresa**.

---

## Feature 1 — Cadência de Contatos

- **`src/lib/contactCadence.ts`**: `formatCadence(h)` ("<1h", "5h", "1 dia", "7 dias"),
  `cadenceTone` (verde <24h · âmbar 1–3d · vermelho >3d).
- **`src/components/admin/ContactCadenceCard.tsx`**: card no **AdminDashboard** listando os 20 mais
  atrasados (ordem: mais antigo primeiro), com chip LEAD/ALUNO, badge de tempo, abrir conversa
  (WhatsApp interno via `state.chatId`) e **botão inativar** (`cadence_muted=true`, some na hora).
  Sem dado/sem RPC → card não renderiza (zero ruído).
- Leads contam junto (ajuda o funil de venda, como pedido).

## Feature 2 — Presença de colaboradores (entrada/saída/tempo online)

- **`src/hooks/useStaffPresence.ts`**, montado no **`AppLayout`**: para roles `coordinator`/`trainer`
  (abaixo de admin, como pedido): INSERT em `staff_sessions` ao abrir; heartbeat de 60s em
  `last_seen_at`; **saída no `pagehide`** via `fetch keepalive` (PATCH REST direto com o JWT — supabase-js
  não sobrevive ao fechamento da aba). Unmount/logout também encerra.
- Sessão órfã (browser morto sem pagehide): painel considera encerrada no último heartbeat — não infla tempo.
- **TeamManager → nova aba "Atividade"** (só admin/master enxergam): por colaborador nos últimos 30
  dias: nº de acessos, tempo online somado (h/min) e última atividade.

## Feature 3 — Aba Carteira

- **`src/pages/admin/Portfolio.tsx`** + rotas `/admin/carteira`, `/coordinator/carteira`,
  `/trainer/carteira` (FeatureRoute espelhando as flags de `/students`; módulo de permissão =
  `students`) + item **"Carteira" no sidebar logo abaixo do Dashboard** nos 3 menus.
- Trainer/coordinator: veem a **própria** carteira. **Admin/master: seletor de colaborador**
  (company_members × user_roles admin/coordinator/trainer × profiles) → vê a carteira de qualquer um.
- Mini-CRM: contagem, chips de filtro por status (com contadores), busca por nome, e por aluno:
  badge de status, **"sem resposta há Xh/dias"** (reusa a RPC de cadência), fim do ciclo ativo
  (alerta ≤7 dias), ações rápidas (perfil, conversa interna).

## Arquivos tocados

Novos: `contactCadence.ts`, `useStaffPresence.ts`, `ContactCadenceCard.tsx`, `Portfolio.tsx`,
migration `20260729120000`, este relatório.
Editados: `AdminDashboard.tsx` (monta card), `AppLayout.tsx` (monta hook), `AppSidebar.tsx`
(item ×3 + moduleMap "Carteira"→"students" + ícone Briefcase), `App.tsx` (lazy + 3 rotas),
`TeamManager.tsx` (aba Atividade + loadActivity + isAdminViewer).

## QA

`tsc` 0 · **188/188 testes** (22 arquivos) · build OK · `verify:backend` OK · `cxese` no dist = 0.
Sem migration aplicada os fluxos novos degradam sem erro (testado por ausência da RPC/tabela).

## O que NÃO fiz (de propósito)

- Não apliquei a migration (bloqueio acima) — **primeira ação sua**.
- Não mexi no motor de prescrição, edges existentes, nem em dados.
- "Aviso automático à equipe" da cadência = o card no dashboard (sempre visível, sem controle manual).
  Push/WhatsApp automático por cadência ficaria de fase 2 se o Matheus quiser (precisa cron + opt-in).
