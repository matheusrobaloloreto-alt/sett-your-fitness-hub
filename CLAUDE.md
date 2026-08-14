# Claude Code Context

## Project

SETT Your Fitness Hub is a Vite + React + TypeScript fitness SaaS backed by Supabase. The app has role-based areas for master, admin, coordinator, trainer, and student users, plus public registration/payment/anamnesis flows.

## Stack

- Frontend: React 18, TypeScript, Vite, React Router, TanStack Query.
- UI: Tailwind CSS, shadcn/ui-style Radix components, lucide-react icons, Recharts, XY Flow.
- Backend: Supabase Auth, Postgres migrations, generated Supabase types, Edge Functions in `supabase/functions`.
- AI/Integrations: Anthropic-backed Supabase functions, Stripe, Asaas, WhatsApp manager/webhooks.

## Important Paths

- `src/App.tsx`: route tree and role/feature gating.
- `src/components/AppSidebar.tsx`: navigation definitions.
- `src/components/ui`: reusable UI primitives.
- `src/integrations/supabase/client.ts`: browser Supabase client.
- `src/pages/admin/AICoachHub.tsx`: consolidated AI pack UI for strength, running, nutrition, adaptive training, technique, body composition, injury triage, and secretary flows.
- `src/integrations/supabase/types.ts`: generated database types.
- `src/pages`: route-level screens by role.
- `supabase/functions`: Deno Edge Functions.
- `supabase/migrations`: database schema history.
- `.env.example`: safe local environment template.
- `.env.local`: local credentials only; ignored by Git.

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
```

The Vite dev server defaults to `http://localhost:8080`.

## Environment Rules

- Use `.env.local` for local values.
- Never commit real service keys, provider tokens, or webhook secrets.
- Frontend code may use only `VITE_*` variables.
- Edge Function secrets belong in Supabase project secrets:
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`,
  `ASAAS_API_KEY`, and `ASAAS_WEBHOOK_TOKEN`.
- The Supabase anon key is public by design, but keep it out of hardcoded source so environments can rotate cleanly.

## Working Agreement For Agents

- Prefer existing component, hook, and routing patterns before adding abstractions.
- Keep UI changes consistent with the current shadcn/Tailwind system.
- Treat `src/integrations/supabase/types.ts` as generated; update it from Supabase instead of hand-editing when schema changes.
- For Supabase Edge Functions, keep Deno APIs and CORS behavior consistent with neighboring functions.
- Before handoff, run the narrowest useful checks. For broad app changes, run `npm run build` and `npm run test`.
- If credentials are needed, ask for environment setup rather than placing secrets in tracked files.

## Current Local Handoff Notes

- Local workspace: `/Users/macbookpro/Documents/Marquito/sett-your-fitness-hub`.
- Branch for agent work (Claude ⇄ Codex): `codex/claude-compat`.

### Repositório & Acesso (para o Codex)

- **CANÔNICO (ordem do Matheus, 2026-07-31): remote `origin` → `https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub.git`.** É o único destino autorizado para `main` e `codex/claude-compat`.
- **Não reconectar** `syervibecoding`, Lovable ou forks antigos. A história anterior à consolidação foi preservada no próprio repositório canônico nas branches `archive/pre-consolidation-20260731` e `legacy/bn-main-local`.
- **Codex em máquina/ambiente SEPARADO** — clonar e usar a branch de colab:
  ```bash
  git clone https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub.git
  cd sett-your-fitness-hub && git checkout codex/claude-compat
  ```
  Antes de editar: `git pull --ff-only origin codex/claude-compat`. Ao soltar: `git push origin codex/claude-compat` (commits prefixados `claude:` / `codex:`).
- **⚠️ Backend/dados SEGUEM no Supabase Bn-app `zshrcgbyhzxpnlccssyz`** (alunos reais, 917 exercícios, 24+ edges, secrets). Não apontar o app para nenhum outro projeto Supabase sem ordem explícita do Matheus.
- **Codex na MESMA máquina:** acessa direto em `~/Documents/Marquito/sett-your-fitness-hub` (não precisa clonar).
- **Backend Supabase:** projeto **`zshrcgbyhzxpnlccssyz`** (Bn-app) — Postgres + Edge Functions. Deploy de edge: `supabase functions deploy <fn> --project-ref zshrcgbyhzxpnlccssyz --use-api`.
- **Frontend (prod):** Netlify `bn-performance-webapp-matheus.netlify.app` (deploy manual `netlify deploy --prod --dir=dist`).
- Old local GitHub token remotes found in abandoned copies were replaced with clean GitHub URLs.
- AI refinement pack was found in `/Users/macbookpro/Downloads/app bn/sett-your-fitness-hub` and integrated as `supabase/functions/ai-coach-pack` plus the `/admin/ia`, `/coordinator/ia`, and `/trainer/ia` routes.
- Current verified checks: `npm run build` passes, `npm run test` passes, and `npm audit --omit=dev` reports 0 vulnerabilities.
- `npm run lint` currently completes with 0 errors and inherited React Hooks/Fast Refresh warnings. Do not treat the warning baseline as a regression unless a change adds new violations.
- Full `npm audit` still reports a Vite/esbuild development-server advisory that requires `npm audit fix --force` and a breaking Vite major upgrade. Do not force that upgrade casually.
- `npx update-browserslist-db@latest` currently tries to use `bun` because the repo includes Bun lockfiles, but Bun is not installed on this machine. The warning is non-blocking for build/test.

## Multi-Agent Live Coordination (Claude Code ⇄ Codex)

Both agents work on this same repo. To avoid clobbering each other's edits, treat this section as the shared blackboard — read it before starting, update it when you claim or release work.

**Rules of the road:**
1. One file, one owner at a time. Before editing a file, check the "In flight" list below. If another agent owns it, don't touch it — pick something else or coordinate via the user.
2. Announce your claim by adding a line under "In flight" with: `agent — files/area — what — started <time>`.
3. Release by removing your line (and ideally committing) when done.
4. Prefer committing in small, labeled chunks so the other agent can pull a clean base. Use commit prefixes `claude:` / `codex:` so authorship is obvious in `git log`.
5. Generated files (`src/integrations/supabase/types.ts`, lockfiles) are regenerated, not hand-merged — coordinate before regenerating.

**In flight (update me):**
- codex — `StudentPortal`/`StudentHome` + integração de wearables/anúncios no aluno — concluir pedido amplo do Matheus e QA integrado — started 2026-08-05
- 📨 claude → codex (2026-07-06): **fallbacks de musculação e cardio evoluídos + edge do motor DEPLOYADA** por ordem direta do Matheus ("faça tudo sozinho sem codex"). Commit `611f036`: fallback varia por nível/objetivo + Treino D (4 dias) + corretivo da avaliação na ativação + seleção por difficulty/targets/substitutes + blocos por objetivo + cluster em composto estável (só avançado, sem dor, semana 3+); cardioEngine v2 (intervalados por esporte, natação em metros, cadência/%FTP, strides, fueling, calibração pelo current_volume, taper de prova). A edge `ai-prescribe-workout` em prod agora inclui teu engine v1 + esses upgrades do fallback (flags seguem OFF = fallback-first). deno 3/3, 170/170.
- 📨 claude → codex (2026-07-04): (1) **Fix catálogo truncado deployado** — `ai-validate-prescription` e `ai-coach-pack` tinham `.limit(700)` (917 exercícios → 217 invisíveis); agora paginam com `range()` igual ao catalogAdapter (commit `05a1a9c`, deno check OK, deployado). Motor NÃO tocado. (2) **A edge `ai-prescribe-workout` em PRODUÇÃO ainda é a versão PRÉ teus 6 commits** (`e883587..5f92adf`) — não deployei teu "promote engine v1" de propósito: o gate de deploy do motor é teu. Quando quiser: `supabase functions deploy ai-prescribe-workout --project-ref zshrcgbyhzxpnlccssyz --use-api`. (3) Apliquei a auditoria do Fable 5 (relatório em `docs/project/` + 6 lint fixes `prefer-const`); o fix equivalente em `ExerciseLibrary.tsx` ficou DE FORA porque tu estás com diff não-commitado nele — aplica aí quando commitar. (4) Push feito até `05a1a9c` (fast-forward; inclui teus 6 commits). Teu trabalho não-commitado (VideoAssessment/ExerciseLibrary/PrescriptionStudio/scripts) segue intacto e local.
- 📥 **INBOX p/ engine_chat (claude, 2026-06-19) — AÇÃO PENDENTE: plugar sistemas avançados no fallback.** O Matheus pediu que o fallback determinístico de força **aplique sistemas de treinamento avançados ao longo da periodização** (bi-set/tri-set/super-set/giant/circuito/drop-set/rest-pause/cluster/isometria/pico de contração/alongamento — os mesmos que o app já renderiza). **Já está pronto e VERIFICADO por workflow** — só falta você plugar (eu não edito as edges/engine.ts):
  - **Módulo:** `supabase/functions/_shared/prescription/advancedMethods.ts` → `planAdvancedMethods(exercises, ctx)`. Ids espelham `src/lib/workoutMethods.ts` → app renderiza sem mudança de front, **zero migration**. Aditivo: sem a chamada, nada muda.
  - **Onde plugar (verificado):** `ai-prescribe-workout/index.ts` → `buildEmergencyFallbackPlan` (**L798**, `fallbackExercise` L769-796 / `makeWorkout` L822) — **é o que serve prod hoje** (`PRESCRIPTION_AI_FIRST=off`). E `engine.ts::generateTrainingProgram` (**L224**, hoje shadow/off) quando ligar o cutover V1.
  - **Contexto que VOCÊ já tem em escopo** (mapear): `mesocycle` ← `presetKey`/`selectedPreset` (ou `stimulus`/PeriodizationBlock); `level` ← `fitnessLevel`; `hasPain` ← `riskText`/`kneeRisk`/`backRisk`/`painReports`. **Falta** `microcycle` e `week` — por isso os deixei **opcionais com default** (roda hoje só com mesocycle+level+pain; a rotação 2-em-2 e o skip de deload acendem quando você passar week/microcycle).
  - **Adicionar nos objetos de exercício:** os campos `method`/`group_id`/`method_seconds` (o motor ainda não tem — é só repassar o que o módulo devolve). Chamar **por workout** (group_id é único dentro da lista; use `sessionKey`=workout_id se combinar sessões).
  - **Spec completa + snippet + tabela de verificação:** `docs/prescription/advanced-methods-in-periodization.md`.
- codex — avaliador → BNITO → musculação flow (`FunctionalAssessment.tsx`, `ai-functional-assessment`, `ai-prescribe-workout`, `UnifiedPrescriber`/`WorkoutBuilder`, BNITO assistant) — large uncommitted diff as of 2026-06-12 ~15:56. Claude: do not edit these until committed/released.
- claude — OWNS: WhatsApp module (`src/pages/admin/WhatsApp*.tsx`) + Student area (`src/pages/student/*`, `src/components/student/*`). Frontend high-severity fixes DONE (build passing): WhatsApp realtime no-resubscribe+dedupe, loadContacts stale closure, CRM→chat nav with chatId, break-words; Student loadStudentData try/catch (no more infinite spinner), saveCurrentLogs error handling + bodyweight sets, progress NaN guards, StatsCharts null session_date guards. Files touched by claude (uncommitted): WhatsAppChat.tsx, WhatsAppCRM.tsx, StudentPortal.tsx, StatsCharts.tsx. Codex: please don't edit these. Updated 2026-06-12 ~16:10.
- PENDING (need approval/coordination): C1 WhatsApp IDOR in `supabase/functions/whatsapp-manager` (needs deploy), C2 payment price forgery in PublicPayment+`asaas-integration` (needs deploy), C3 `/aluno/treino/:studentId` missing ProtectedRoute in `src/App.tsx` (CODEX-OWNED file — Codex please add ProtectedRoute + ownership check).
- ✅ claude — FALLBACK-FIRST IMPLEMENTADO + DEPLOYADO (2026-06-18, por ordem direta do Matheus "faça tudo"): CARDIO (`_shared/prescription/cardio/cardioEngine.ts` + `ai-running-plan` determinístico-first), NUTRIÇÃO (`_shared/nutrition/nutritionEngine.ts` + `ai-nutrition-plan` sem 503 + migration aditiva que corrige o bug do meals), FORÇA (`ai-prescribe-workout` determinístico-first por padrão via emergency fallback; reversível com PRESCRIPTION_AI_FIRST=on; modelo via env). Migrations aditivas: `nutrition_plans` (meals/target_*/goal/context) + `company_ai_config` (ai_text_refinement_enabled default false). Todas as edges deployadas + smoke 401 OK; 136 testes front passam; build OK. **NÃO flipei o cutover do engine.ts de força** (gate documentado do time — segue p/ engine_chat autorizar). Refino IA (refine_text) NÃO ligado (refino off por decisão do Matheus). Detalhes/status no spec.
- 📨 claude → engine_chat — SISTEMAS AVANÇADOS NO FALLBACK (2026-06-19, pedido do Matheus): o fallback determinístico de força deve **aplicar sistemas de treinamento avançados ao longo da periodização** (não sempre). Claude entregou pronto: `supabase/functions/_shared/prescription/advancedMethods.ts` (módulo Deno autocontido) com `planAdvancedMethods(exercises, ctx)` + `MethodId`/`GROUPING_METHODS`/`SINGLE_METHODS` que **espelham EXATAMENTE** `src/lib/workoutMethods.ts` (bi-set/tri-set/super-set/giant/circuito/drop-set/rest-pause/cluster/isometria/pico_contracao/pico_alongamento) → o app **já renderiza** (MethodBadge + groupWorkoutExercises), zero mudança de front, zero migration. Doutrina embutida: iniciante/deload/base/dor → nenhum; acumulação → 1 técnica leve; intensificação/choque → bi-set + drop/cluster em 1-2 acessórios; compostos pesados ficam retos; troca de estímulo a cada 2 semanas; intermediário até bi-set+drop, avançado libera tri/giant/cluster. **engine_chat: plugar** chamando `planAdvancedMethods` por semana em `engine.ts::generateTrainingProgram` e `ai-prescribe-workout::buildEmergencyFallbackPlan` (passando microcycle/mesocycle/week/level/hasPain — o motor já nomeia as fases). Aditivo: sem a chamada, nada muda. Spec: `docs/prescription/advanced-methods-in-periodization.md`. **Claude não edita as edges/engine.ts** — só entregou o módulo.
- 📨 claude → engine_chat — SPEC "FALLBACK-FIRST" (2026-06-17): `docs/prescription/fallback-first-prescriptions-spec.md`. Tornar TODAS as prescrições completas em fallback determinístico (IA só refina texto, Haiku, gateável) p/ baratear. Ordem: A) CARDIO (criar `_shared/prescription/cardio/cardioEngine.ts` + `assertPlanComplete` no insert do `ai-running-plan` — para o sangramento da casca vazia), B) FORÇA (cutover do `engine.ts` modo 'on' da flag PRESCRIPTION_ENGINE_V1), C) NUTRIÇÃO (`_shared/nutrition/engine.ts` + remover 503 + bug schema meals), D) IA-enriquecimento+gating (migration aditiva `company_ai_config`). ✅ Decisões do Matheus FECHADAS: refino IA **off por padrão** (opt-in), TMB **Mifflin-St Jeor** (Katch se %gordura), **não apagar** as 11 cascas (só prevenir+regerar), refino **assíncrono**, natação/ciclismo **na v1**, implementação pelo **engine_chat**. **Claude não edita edges/migrations** — só render do aluno. engine_chat: pode começar pelo item A (cardio).
- 📨 claude → engine_chat — REFORMA DA ANAMNESE 2026-06-18: design completo em `docs/prescription/anamnese-overhaul-design-and-handoff.md`. Decisão travada do Matheus: **liberação de prescrição = MANUAL** (IA pré-gera tudo; ciclos futuros nascem `draft`/`scheduled`, professor libera pela UI; SEM cron de release). Nutrição = só orientar; anamneses antigas = cortar daqui pra frente. **engine_chat:** (A) criar `_shared/prescription/orchestration.ts` (buildBnitoOrchestration / calculateCrossModalVolume / syncMicrocycles) p/ sincronizar fases base(força)→ordinários + volume-load cruzado + microciclos/deload entre modalidades; integrar nas edges ai-running-plan/ai-prescribe-workout. (B) multi-prescrição: plano de N sem → ceil(N/6) ciclos; ciclo 1 `active`, demais `draft`. Consumir novos campos de student_anamneses + company_ai_config + cycle_feedback. **claude — TUDO FEITO/DEPLOYADO (commits c88d768, 9ec8844, a2348bc):** anamnese única na aba + gates condicionais (StudioAnamnese + public-anamnesis whitelist), WhatsApp (AnamnesisManager), Central de IA `periodization_doctrine`/`strength_endurance_integration` (CompanyOnboarding), NPS intra-ciclo (cycle_feedback + CycleFeedbackBanner form + StudentCycleFeedbackCard). Migrations: anamnese_gate_flags_viva, cycle_feedback_nps_intra_ciclo, company_ai_config_periodization_fields. **engine_chat: falta consumir** (1) `periodization_doctrine`+`strength_endurance_integration` no loadCompanyAiConfig/companyAiSystem das edges; (2) flags `wants_*`/`shown_blocks` de student_anamneses + `cycle_feedback` no contexto; (3) orchestration.ts + multi-prescrição (ciclos futuros `draft`, liberação MANUAL).
- 🔁 claude — SW REATIVADO 2026-06-18 (com aprovação do Matheus): o kill-switch do service worker (public/sw.js + main.tsx) foi revertido para um SW **network-first** (HTML sempre da rede → NÃO volta o bug de bundle/dados velhos; assets hasheados do Vite via cache p/ offline). Manifest com ícones PNG 192/512 + maskable → PWA instalável (Android 1-toque) + popup "baixar o app" (InstallPrompt). **NÃO re-desabilitar o SW** sem alinhar — o bug antigo de cache era cache-first de HTML, que o network-first resolve. Se reaparecer "dado velho", bump `CACHE` em sw.js (não voltar o kill-switch).
- ⚙️ claude — DEPLOYS 2026-06-18 (atenção engine_chat): (1) `ai-running-plan` deployado com o novo `cardioEngine.ts` (determinístico fallback-first, sem IA). (2) `ai-nutrition-plan` REDEPLOYADO com o insert ALINHADO AO SCHEMA VIVO de `nutrition_plans` — o live é o "studio" (`name` NOT NULL, `goal`, `target_*`, `total_*`, `meals`); NÃO tem `objective`/`energy_summary`/`plan`/`warnings`. O insert anterior gravava colunas inexistentes → falhava. **engine_chat: mantenha o insert alinhado ao live (ou adicione migration p/ as colunas ricas ANTES de reverter), senão a geração de nutrição volta a falhar.** Mantive a geração via `buildNutritionProgram` (sua 8479d92) intacta — só corrigi a persistência. Demos gerados p/ aluno teuzinrl (corrida 6sem + nutrição) via insert direto.
- 🚨 claude — CARDIO VAZIO (diag 2026-06-17): corrida/natação/pedal salvam plano em `running_plans` com `weeks=NULL` (11/12 linhas; mais recente hoje 15:31) → aba acende mas SEM treino. Gatilho: **saldo Anthropic zerado** (warnings `anthropic_400 credit balance too low`) → `ai-running-plan/index.ts` cai no fallback que NÃO preenche `weeks` e grava `status='active'` retornando 200. 📨 HANDOFF engine_chat: `docs/prescription/cardio-empty-plan-handoff-to-engine-chat.md` (corrigir `fallbackCardioPlan()`/`normalizeCardioPlan()` p/ nunca persistir sem `weeks`, ou falhar 402/429; + `running_plan_id` no bundle do PrescriptionStudio). Claude já mitigou no app do aluno (`CardioPlanView.tsx`: estado "plano em finalização" em vez de casca vazia). **NÃO toquei na edge.** Matheus: recarregar crédito Anthropic + regerar.
- claude — PERIODIZAÇÃO (frontend, área do aluno) DONE + deployed 2026-06-17: novo `src/lib/periodization.ts` + `src/components/student/PeriodizationBanner.tsx` (microciclos ordinário/choque/regenerativo + mesociclos base/acumulação/intensificação/polimento), derivado de objetivo+datas do ciclo; banner na aba Treino do `StudentPortal.tsx`; `WorkoutLibrary.generate()` grava resumo das fases. **NÃO toquei no motor.** 📨 HANDOFF para o chat do motor de prescrição: `docs/prescription/periodization-handoff-to-engine-chat.md` (+ metodologia em `docs/prescription/periodization-methodology-v1.md`) — pedido: nomear microciclo/mesociclo em `methodology.ts`/`progressionRules.ts` mantendo os ids `ordinario|choque|regenerativo` / `base|acumulacao|intensificacao|polimento`. Codex/engine-chat: por favor leiam o handoff.
