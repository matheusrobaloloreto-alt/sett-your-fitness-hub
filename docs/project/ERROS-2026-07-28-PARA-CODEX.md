# Erros encontrados na auditoria de bases — 2026-07-28

**Autor:** Claude (ATENA) · **Branch:** `codex/claude-compat` · **HEAD na auditoria:** `df5e980`
**Método:** verificação contra o **banco vivo** (`zshrcgbyhzxpnlccssyz`), a **produção** (HTTP/DNS) e o código.
Cada item traz a evidência que o comprova. Nada aqui é hipótese não verificada — o que é hipótese está marcado como tal.

Baseline sadio no momento da auditoria: `npx tsc --noEmit` 0 erros · `npm run test` 187/187 · `npm run verify:backend` OK.

---

## P0 — o aluno abre o app e não tem treino

### 1. O botão "Feito" cria um treino fantasma que o aluno enxerga

**Onde:** `src/pages/admin/StudentDetail.tsx:1321-1327`

```ts
const { error } = await supabase.from("workouts").insert({
  cycle_id: c.id,
  company_id: student?.company_id,
  title: `Treino Ciclo ${c.cycle_number}`,
  created_by: session.user.id,
  exercises: [],          // <-- linha do problema
});
```

O professor usa esse botão para **marcar que prescreveu fora do app**. Só que o marcador é gravado
na MESMA tabela que o app do aluno renderiza — `workouts` — com `exercises: []`. Resultado: o aluno
abre "Meu treino" e vê um card com **zero exercícios**.

**Evidência no banco vivo:**
- 21 workouts com `exercises = []` dentro de **ciclos ativos**, atingindo **21 alunos distintos**.
- Não é lixo do Lovable: **8 criados em junho e 13 em julho/2026**; ciclos correndo até **30/08**.
- Todos batem no padrão `title = 'Treino Ciclo N'` e `name = 'Treino'`, que só esse insert produz
  (`buildWorkoutRows` gera `Treino {i+1}`; `sendWorkoutTemplate` gera `Treino A/B/C`).
- O portal lê exatamente essa coluna: `src/pages/student/StudentPortal.tsx:233-241`
  (`.from("workouts").select("... exercises ...")` → `w.exercises as WorkoutExercise[]`).

**Agravante (pior que o card vazio):** `StudentPortal.tsx:288` escolhe o ciclo assim:

```ts
byNewest.find(c => inRange(c) && c.workouts.length > 0)
```

O marcador **conta como workout**. Então, se o aluno tem um ciclo-marcador mais novo e um ciclo real
com exercícios mais antigo, o marcador vence e **esconde o treino de verdade**.

**Correção proposta (dividida):**
- *Claude (frontend):* trocar o marcador por um flag em `training_cycles`
  (ex.: `prescribed_offline_at`) em vez de inserir linha em `workouts`; e fazer o portal ignorar
  workouts com `exercises` vazio na seleção do ciclo (`workouts.filter(w => w.exercises.length > 0)`).
- *Codex (dados/migration):* migration aditiva para o flag + limpeza dos 21 marcadores existentes,
  convertendo-os no flag novo (não apagar cegamente: alguns podem ser o único registro de que aquele
  ciclo foi prescrito no papel).

---

### 2. 19 ciclos ativos sem NENHUM workout

**Evidência:** `training_cycles` com `status='active'` e zero linhas em `workouts` = **19**
(mais antigo criado 02/04, mais novo **15/07**). Desses, **4 pertencem a alunos que têm login** —
ou seja, 4 alunos podem entrar hoje no app e não têm o que treinar.

O portal tem defesa parcial (pula ciclo sem workout na escolha), então o sintoma é "nenhum treino
disponível" em vez de card vazio. Ainda assim é ciclo ativo sem entrega.

**Sugestão:** validação na publicação/ativação — ciclo não deveria poder ficar `active` sem workout,
ou precisa aparecer como pendência na Central de Atenção do professor.

---

### 3. 36 dos 40 alunos ativos não têm acesso ao app

**Evidência:**
- `students` com `status='active'` e `user_id IS NULL` = **36**.
- Total de alunos com `user_id` = **10**. Total de usuários no `auth.users` = 16.
- Último login de um **aluno**: **18/07**. Último login geral (equipe): 27/07.

O portal identifica o aluno por `.eq("user_id", user.id)` (`StudentPortal.tsx:170`), e quem cria esse
vínculo é a edge `activate-student-access` (`index.ts:99-137`: cria o auth user e faz
`students.update({ user_id })`). Sem isso, o aluno **não consegue usar o app** — não é atrito de UX,
é acesso inexistente.

**Isto explica o número que mais assusta:** `workout_logs` está parado desde **22/06**, e na história
inteira do app apenas **2 alunos distintos** registraram treino. Não é bug de gravação: é que quase
ninguém tem conta.

**Sugestão:** ação em lote de "criar acesso" na tela de alunos + status visível de "sem acesso" na
listagem, e disparo do convite. (Precisa decidir com o Matheus se todo aluno ativo deve receber
acesso ou se é sob demanda.)

---

## P1 — integrações caídas ou girando no vazio

### 4. WhatsApp desconectado

`whatsapp_instances.status = 'disconnected'`. Última mensagem em `whatsapp_messages`: **17/07**
(11.658 no histórico). O módulo inteiro (CRM, chat, automações) está inerte.
Hipótese a confirmar: secrets `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` ausentes ou instância caída
no provedor — o handoff já listava esses secrets como pendentes.

### 5. Cron de push dispara todo dia para ninguém

`cron.job` tem `push-daily-reminder` ativo (`0 11 * * *`), mas `push_subscriptions` = **0 linhas**.
Todo dia às 11h UTC a edge `push-send` roda e não encontra destinatário. Sem dano ao usuário, mas é
invocação paga diária inútil — e sinaliza que o banner de push nunca converteu ninguém.

Outros crons ativos e coerentes: `process-automation-sessions` (*/15), `process-enrollment-lifecycle-daily` (0 5), `award-weekly-consistency` (15 6 * * 1).

---

## P2 — infraestrutura e higiene de schema

### 6. Duas migrations aplicadas fora do ledger

`supabase_migrations.schema_migrations` tem como última entrada `20260720125212`. As duas migrations
de 21/07 que existem no repo **não estão registradas**:
- `20260721120000_prevent_duplicate_students_per_company.sql`
- `20260721133000_sync_student_enrollment_trainers.sql`

**Mas os objetos existem no banco vivo** — confirmei os índices `students_company_email_unique_idx` e
`students_company_cpf_unique_idx`, as funções `fill_enrollment_trainer_from_student` /
`fill_student_trainer_from_enrollment` e os dois triggers. Foram aplicadas por SQL direto sem
registrar. Risco baixo (as duas são idempotentes: `IF NOT EXISTS` / `create or replace` /
`drop trigger if exists`), mas o ledger está mentindo sobre o estado do banco.

**Correção:** inserir as duas versões em `schema_migrations` para o histórico voltar a ser confiável.

### 7. `www.settapp.com.br` não é a Netlify — serve build velho

DNS ainda na Hostinger: `www → 185.158.133.1`, `@ → 2.57.91.91`.
Prova de que são builds diferentes:
- `www.settapp.com.br` serve `assets/index-Um7XBrUo.js`
- `bn-performance-webapp-matheus.netlify.app` serve `assets/index-CYuf0P57.js`

Os dois apontam para o Supabase canônico (`zshrcgbyhzxpnlccssyz`), então **não há risco de backend
errado** — mas todo deploy que fizermos na Netlify **não chega em quem acessa o domínio**.

**Correção (fora do repo, painel da Hostinger):** `A @ → 75.2.60.5` e
`CNAME www → bn-performance-webapp-matheus.netlify.app`, removendo os A antigos.

### 8. `workout_exercises` é uma tabela morta

0 linhas, enquanto 206 workouts guardam os exercícios no jsonb `workouts.exercises`. Quem lê o
schema pela primeira vez (humano ou agente) tende a escrever query na tabela errada.
**Sugestão:** dropar ou documentar como deprecada.

### 9. Duas tabelas de anamnese vivas ao mesmo tempo

`anamnesis` (24 linhas, legado) e `student_anamneses` (7 linhas, nova) — ambas com escrita recente
(última em 23/07 nas duas). Fonte dupla de verdade para o mesmo dado clínico.
**Sugestão:** definir a canônica e migrar/congelar a outra.

### 10. Pasta de edge function vazia

`supabase/functions/codex-zapi-health/` existe sem `index.ts` e não está versionada. É o motivo do
repo "ter 27 funções" e o Bn-app ter 26. Fora ela, repo ↔ produção batem **26/26**.

### 11. `AGENTS.md` manda o Codex começar por doc obsoleto

O `AGENTS.md` ainda diz "CODEX — START HERE: read `CODEX-IMPLEMENT-AND-UNIFY.md`" e lista 4 features
de **15/06** já entregues ou superadas. O Codex vai gastar contexto lendo instrução morta.
**Correção:** apontar para `docs/project/HANDOFF-CODEX.md`, que é a fonte viva.

---

## P3 — features entregues com adoção zero

Não são bugs, mas são o retrato de onde o esforço não virou uso (contagem no banco vivo):

| Tabela | Linhas | Feature |
|---|---|---|
| `student_checkins` | 0 | Check-in de prontidão (sprint TOP-5 #2) |
| `push_subscriptions` | 0 | Web Push (TOP-5 #5) |
| `cycle_templates` | 0 | Templates de ciclo (TOP-5 #4) |
| `cycle_feedback` | 0 | NPS intra-ciclo |
| `progress_photos` | 0 | Fotos de progresso |
| `leads` | 0 | Funil de leads |
| `workout_logs` | 147, parado em **22/06** | Registro de treino |

A leitura honesta: **o motor e as ferramentas do professor estão bem à frente da adoção do aluno.**
Enquanto os 36 alunos ativos sem acesso não entrarem, nenhuma feature do portal produz dado.

---

## Estado sadio (para não gerar retrabalho)

- Repo canônico e branch corretos; `origin` único (o remote `bn` já foi removido); tree limpa.
- `.env`, `.env.local` e `supabase/config.toml` no Bn-app; `verify:backend` bloqueia divergência.
- 26 edges vivas = 26 no repo. 96 migrations no repo.
- Biblioteca com **926 exercícios** (cresceu dos 917 do handoff), todos com metadata; 1.390 alvos musculares.
- Professor está usando: último workout criado em **27/07**, planos de corrida/nutrição até 21/07.
- Cópia antiga em `~/Documents/Codex/2026-06-05/...` confirmada como perigosa (commit `c229882`,
  Supabase morto `cxesecxyrndveookvlzz`) — não tocada.

---

## Divisão sugerida (split histórico)

| Item | Dono |
|---|---|
| 1 (frontend do marcador + seleção de ciclo no portal), 3 (UI de criar acesso em lote), 11 (AGENTS.md) | **Claude** |
| 1 (migration do flag + limpeza dos 21 marcadores), 2 (guarda de ciclo ativo sem workout), 6 (ledger), 8/9 (schema), 4 (secrets/instância WhatsApp) | **Codex** |
| 7 (DNS na Hostinger), decisão sobre acesso em lote dos alunos | **Matheus** |
