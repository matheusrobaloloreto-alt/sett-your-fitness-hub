# HANDOFF para o Codex — estado do SETT/BN e como prosseguir

**Última atualização:** 2026-07-17 · **Autor:** Claude (ATENA) · **Branch canônica:** `codex/claude-compat`

Este arquivo é a fonte da verdade do que foi feito nesta jornada e como continuar sem quebrar nada.
Leia inteiro antes de mexer.

---

## 0. Coordenadas (decorar)

| O quê | Valor |
|---|---|
| **Repo CANÔNICO (novo)** | `origin` → `github.com/syervibecoding/sett-your-fitness-hub` |
| **Remotes autorizados** | apenas `origin` → `github.com/syervibecoding/sett-your-fitness-hub` |
| **Branch de trabalho** | `codex/claude-compat` (main recebe fast-forward quando alinhado) |
| **Supabase (backend REAL)** | projeto **`zshrcgbyhzxpnlccssyz`** (Bn-app) — dados reais, 917 exercícios, 24+ edges, secrets |
| **Frontend (prod)** | Netlify `bn-performance-webapp-matheus.netlify.app` (site id `9a061d2e-ee2c-444b-aa69-fe262caf0246`) |
| **Deploy edge** | `supabase functions deploy <fn> --project-ref zshrcgbyhzxpnlccssyz --use-api` (+ `dangerouslyDisableSandbox`) |
| **Deploy frontend** | `npm run build && netlify deploy --prod --dir=dist --site 9a061d2e-ee2c-444b-aa69-fe262caf0246` |

Fluxo git: `git pull --ff-only origin codex/claude-compat` antes de editar; `git push origin codex/claude-compat` ao soltar; commits com prefixo `claude:` / `codex:`.

---

## 1. ⚠️ AVISOS CRÍTICOS (ler antes de tudo)

1. **Não usar Lovable neste projeto.** O acoplamento local foi removido e o repo deve ser editado apenas via GitHub canônico/Codex/Claude. **Regra dura:** antes de todo `netlify deploy`, rodar `npm run verify:backend` e grepar o `dist/` para confirmar que só o Supabase canônico `zshrcgbyhzxpnlccssyz` aparece.
2. **O motor de prescrição é lei.** NÃO enfraquecer: biblioteca-only, RIR 2-4, dor/EVA linha vermelha (EVA>5 → handoff professor), sem pliometria no 1º bloco, teto de volume, blocos de 6 semanas (1-2 técnica / 3-4 progressão / 5-6 intensificação), regra mais conservadora vence, progressão/deload rastreáveis por regra.
3. **Flags ficam OFF por padrão** (fallback-first): `PRESCRIPTION_AI_FIRST ?? "off"`, `PRESCRIPTION_ENGINE_V1 ?? "off"`, `company_ai_config.ai_text_refinement_enabled=false`, `bnito_whatsapp_enabled=false`. Não ligar sem ordem do Matheus.
4. **Backend continua no Bn-app** (`zshrcgbyhzxpnlccssyz`). A publishable key do Supabase do Lovable (`okMxda…`) existe mas NÃO está em uso; migração de backend só com ordem explícita.
5. **Divergência de schema:** o schema VIVO no Bn-app diverge dos migrations/types locais em várias tabelas (running_plans/nutrition_plans/prescription_bundles/training_cycles). **Sempre conferir colunas via MCP `information_schema`, nunca pelos migrations locais.**

---

## 2. O que foi construído nesta jornada (por área, com commits)

Todos os commits abaixo são `claude:` na `codex/claude-compat`.

### Avaliação Funcional — o avaliador (`072ca40`)
- `ai-functional-assessment`: o fallback **deixou de "só cortar frames"**. Agora `inferCompensationsFromText()` lê as observações técnicas do professor + queixa e mapeia para as 7 compensações OHS/postura (com severidade). As 7 compensações ganharam **mapa muscular** (encurtados/inibidos) + **plano corretivo com exercícios da biblioteca** + linguagem de aluno + `view`.
- Saída rica: `vistas[]`, `plano_corretivo{alongar,ativar}`, `musculos_encurtados/fracos`, `prioridades_corretivas`, `relatorio_para_aluno` educativo, `checklist_professor`.
- Base científica reutilizável: `src/lib/assessment/functionalAssessmentCriteria.ts` (PubMed: Post 2016 10.1123/jsr.2015-0178; Rogers 2019; Saad 2011; Soylu 2025).
- `generateAssessmentPDF`: nova seção **"Seu plano corretivo"**.
- **Como funciona:** IA de visão decide POUCO (quais compensações) e o motor determinístico explica MUITO. Doc: `docs/project/fallbacks-review-and-assessment-upgrade.md`.

### Fallbacks de Musculação + Cardio (`611f036`)
- **Musculação** (`ai-prescribe-workout::buildEmergencyFallbackPlan`): treinos variam por **nível** (iniciante 5 ex / interm. 6 / avançado 7+60min) e **objetivo** (emagrecimento=descanso −30s densidade; hipertrofia=isoladores 3 séries; performance=1º composto 4×5-6 120s); **Treino D** novo (posterior/glúteo/core) para quem tem 4 dias (antes o 4º dia era ignorado); a **avaliação injeta o corretivo** na fase de ativação (valgo→glúteo médio etc.); seleção usa `difficulty`/`targets`/`equivalent_substitutes` do catálogo (não só keyword); `progressionBlocksFor(objective)`; cluster em composto ESTÁVEL só p/ avançado sem dor a partir do 2º composto.
- **Cardio** (`_shared/prescription/cardio/cardioEngine.ts` v2): intervalados específicos por esporte (natação em metros com pausa de parede; pedal com cadência+%FTP; corrida com strides); fueling por duração; volume inicial calibrado pelo `current_volume` da anamnese (~+10%); taper na última semana quando há prova. Linhas vermelhas TSB/EVA intactas.

### Fix catálogo truncado (`05a1a9c`)
- `ai-validate-prescription` e `ai-coach-pack` tinham `.limit(700)` → com 917 exercícios, 217 ficavam invisíveis. Trocado por paginação `range()` (CATALOG_PAGE_SIZE=1000), espelhando o catalogAdapter do motor.

### Diferenciação / UX / custo (`7931727`)
- **Central de Atenção** (`AtRiskStudents.tsx`): semáforo 🔴/🟡 + **mensagem pronta copiável** por situação (dor/renovação/sumido/pagamento) + dor da anamnese entra no radar. Depois ganhou **"Reavaliação devida (>60d)"** (`2f987d7`).
- **`WhySafetyCard.tsx`** (aluno): "Por quê deste treino?" + semáforo de dor (🟢/🟡/🔴) + "avisar treinador" via WhatsApp.
- **`CohortInsightsCard`** + RPC `cohort_feedback_summary` (NPS por coorte).
- Docs: `competitive-fitness-app-research.md`, `app-cost-optimization-report.md`, `full-app-differentiation-ux-cost-sprint.md`.

### Sprint TOP-5 (`2f987d7`)
- **#2 Check-in de prontidão** (`CheckinCard.tsx` + tabela `student_checkins`): aluno marca sono/estresse/dor em 3 toques; o `PrescriptionStudio` lê o check-in das últimas 48h e **escala readiness p/ "cautela"** (motor corta 20% de volume) — nunca o contrário.
- **#4 Templates de ciclo** (tabela `cycle_templates`): salvar prescrição editada + chips "usar template" + excluir, no `PrescriptionStudio`.
- **#3 Reavaliação antes×depois** (`AssessmentCompareCard.tsx`): compara as 2 últimas avaliações (delta de compensações) na aba Programa.
- **#5 Web Push (VAPID)**: tabela `push_subscriptions`, edge `push-send` (notify + daily_reminder), handlers no `public/sw.js`, `src/lib/push.ts` + `PushBanner.tsx`, push automático ao publicar prescrição, cron diário 11h UTC.
- **#1 BNITO no WhatsApp** (opt-in): `maybeBnitoReply` no `whatsapp-webhook` — aluno conhecido manda texto → Haiku responde com contexto do ciclo; guardrails (dor→professor, sem diagnóstico), anti-loop (1/min, 30/dia). **Atrás do flag `company_ai_config.bnito_whatsapp_enabled` (OFF).**

### Rodadas anteriores desta série (já em prod)
Central de feedback pendente + recomendação de próximo ciclo (RPC `next_cycle_recommendation`), versionamento de planos (`ai_plan_versions` + `PlanVersionsCard`), soft-delete de trainer, anamnese versionada (snapshot `student_anamnesis_history`), trilha de decisão (`ai_decision_logs` no publish), status de entrega sent→viewed, roadmap de periodização, validações pré-publicação, etc.

### Migração de repositório (`e3cd99b`, `8042193`, `0cfc79b`)
- Unimos fork + original com merge `-s ours` (árvore do fork preservada; commits Lovable no histórico). Canônico virou `origin` (syervibecoding). `.env` versionado aponta pro Bn-app.

---

## 3. Tabelas novas (migrations aditivas aplicadas no Bn-app, todas RLS-safe)

| Tabela / coluna | Para quê | RLS |
|---|---|---|
| `ai_plan_versions` | versionamento de planos publicados | company_members + master |
| `trainer_assignments_history.deleted_at` | soft-delete de período de trainer | herda |
| `student_anamnesis_history` | snapshot de cada anamnese | company read + master |
| `student_checkins` | check-in diário de prontidão | student own + company read + master |
| `cycle_templates` | templates de ciclo do professor | company all + master |
| `push_subscriptions` | Web Push | owner only |
| `company_ai_config.bnito_whatsapp_enabled` | opt-in BNITO WhatsApp (default false) | herda |
| `ai_decision_logs` (já existia) | +policy INSERT company members | — |

RPCs criadas: `cohort_feedback_summary(_company_id)`, `next_cycle_recommendation(_student_id)` (ambas security invoker → RLS aplica).

---

## 4. Edge functions — status de deploy

**Deployadas no Bn-app nesta jornada:** `ai-functional-assessment`, `ai-prescribe-workout`, `ai-running-plan`, `ai-nutrition-plan`, `ai-validate-prescription`, `ai-coach-pack`, `public-anamnesis`, `push-send` (NOVA), `whatsapp-webhook`.

**Novas edges no repo:** `push-send` (Web Push). Config em `supabase/config.toml`: `[functions.push-send] verify_jwt=false`.

---

## 5. Secrets e cron (no Bn-app)

- **Secrets setados:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_CRON_SECRET`. (A pública do VAPID também está hardcoded em `src/lib/push.ts` — é pública por design.)
- **Cron (pg_cron):** `push-daily-reminder` — `0 11 * * *` → `net.http_post` para `push-send` com header `x-cron-secret` e body `{"action":"daily_reminder"}`.
- Cron pré-existente: `process-enrollment-lifecycle-daily 0 5 * * *`.

---

## 6. Pendências / backlog (não feito)

**App do aluno:** vídeo de execução aluno→professor; treino offline (cache + fila de cargas); onboarding guiado no 1º login.
**Professor:** relatório mensal em 1 clique; agenda da semana unificada; renovação com link Asaas embutido; funil de leads (kanban usando `studentStatus`).
**Motor/qualidade:** alinhar o prompt da IA de visão ao mesmo schema `key` do fallback; batch de frames na avaliação (corta custo de IA); code-splitting dos chunks >500kB (VideoAssessment 404kB, recharts 504kB); dívida de lint (`any`, ~900 warnings pré-existentes); e2e Playwright.
**Central de Atenção:** botão "marcar dor como resolvida".
**Migração de repo:** revisar os commits Lovable no histórico e portar o que prestar (ex.: `types.ts` gerado que eles atualizaram).

---

## 7. Domínio `settapp.com.br` (pendência de DNS na Hostinger)

O domínio está cadastrado no site correto da Netlify, mas os nameservers continuam na
Hostinger (`athena.dns-parking.com` / `apollo.dns-parking.com`) e os registros públicos ainda
apontam para a hospedagem antiga (`www → 185.158.133.1`, `@ → 2.57.91.91`). Por isso
`www.settapp.com.br` continua servindo o deployment antigo `df709c2a-...`, mesmo depois de um
deploy de produção bem-sucedido na Netlify. Esse build antigo já usa o Supabase Bn-app, mas não
contém o frontend mais recente.

Correção recomendada no DNS da Hostinger: `A @ → 75.2.60.5` e
`CNAME www → bn-performance-webapp-matheus.netlify.app`. Depois, remover os registros A antigos
conflitantes e aguardar a propagação. Não republicar pelo Lovable.

---

## 8. QA — comandos que precisam passar antes de qualquer entrega

```bash
npx tsc --noEmit                 # 0 erros
npm run test                     # 170/170 (17 arquivos)
npm run test -- src/lib/prescription   # 120/120 (motor)
npm run build                    # OK
node scripts/prescription/test-curation-review-pipeline.mjs      # 15/15
node scripts/prescription/test-curation-review-return-guard.mjs  # 12/12
npx -y deno check supabase/functions/<edge>/index.ts             # sem erros (deno via npx; rm -f deno.lock depois)
```
Pré-flight de deploy frontend: `npm run verify:backend`; após o build, confirmar que `dist/` contém o Supabase canônico `zshrcgbyhzxpnlccssyz`.

---

## 9. Estabilização Codex de 2026-07-17

- O schema vivo foi reconciliado pelas migrations `20260717123000`, `20260717133000`,
  `20260717143000` e `20260717150000`, todas aplicadas no Bn-app. Os tipos locais foram
  regenerados a partir do banco vivo.
- O Studio agora cria um `prescription_bundle` antes das modalidades, passa o mesmo
  `bundle_id` para musculação/cardio/nutrição e registra os itens do pacote. A publicação
  da musculação cria o próximo ciclo como `pending`, persiste todo o treino e só então o
  ativa/encerra o ciclo anterior.
- As edges de prescrição validam a posse exata do pacote por aluno+empresa. Toda gravação
  relevante falha explicitamente quando o banco recusa o insert.
- As 12 avaliações funcionais históricas foram normalizadas para o contrato determinístico
  atual (7 chaves OHS + relatório estruturado) pelo script
  `scripts/backfill-functional-assessments.ts`.
- O dispatcher `process-automation-sessions` reivindica sessões de forma atômica, envia a
  primeira mensagem dos fluxos e faz retry/defer. O cron usa `AUTOMATION_CRON_SECRET`.
- O checkout público não usa mais `student_id` como credencial. A migration
  `20260717150000_secure_public_payment_links.sql` cria tokens opacos com validade de 30 dias;
  `public-payment-context` e `asaas-integration` derivam aluno/empresa do token. A antiga RPC
  anônima de recovery foi revogada.
- `youtube-exercise-video` valida, via RLS do usuário, se o exercício é visível antes de
  gravar cache com service-role. Biblioteca viva: 917 exercícios; todos possuem metadata e
  alvos musculares. Vídeos próprios existentes: 168; os demais têm fallback YouTube sob demanda.
- Dependências atualizadas (`vite 6.4.3`, `jspdf 4.2.1`); `npm audit` = 0 vulnerabilidades.
- Edges legadas sem consumidores e com schema obsoleto foram removidas do projeto remoto:
  `ai-secretary-chat`, `process-scheduled-messages`, `ai-adaptive-training`,
  `ai-body-composition`, `ai-injury-triage`, `ai-analyze-execution`.

### Dependências externas ainda obrigatórias

O código falha fechado e mostra estado de “não configurado”, mas pagamentos e WhatsApp só
operam de ponta a ponta depois de cadastrar os secrets reais: `ASAAS_API_KEY`,
`EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e, se Stripe for usado,
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`. Não inventar valores para esses secrets.

## 10. QA de produção e guard canônico — 2026-07-17

- QA autenticado no deploy direto da Netlify: painel master, 26 rotas de admin, biblioteca,
  Studio, avaliação, prescrições, financeiro, evasão, Central de IA e as 5 telas de WhatsApp.
  Nenhuma rota caiu no ErrorBoundary e o console terminou sem erros.
- Portal autenticado como aluno de teste, sem redefinir senha: dashboard, treino, estatísticas,
  calendário, histórico, nutrição, corrida, natação e ciclismo carregaram dados do Bn-app. O
  vídeo de exercício abriu corretamente e `ai-student-bnito` na ação `brief` respondeu HTTP 200.
- Checkout: o painel gera token opaco de 30 dias, o link válido carrega aluno/planos e um token
  aleatório retorna `LINK INDISPONÍVEL`. IDs de aluno não são mais aceitos como credencial.
- Smoke anônimo nas 26 edge functions: nenhuma respondeu HTTP 500. Rotas protegidas retornaram
  401/400/404; webhooks sem credencial retornaram 503 explícito.
- Catálogo vivo confirmado com 917 exercícios; a tela renderiza 80 por lote e a busca encontra
  exercícios fora do primeiro lote. Todos continuam ligados ao catálogo consumido pelo motor.
- A chave `sb_publishable_okM...` enviada na migração pertence a outro projeto e retorna
  `Invalid API key` no Bn-app. `.env`, `.env.local` e as quatro variáveis da Netlify estão com as
  chaves oficiais do projeto `zshrcgbyhzxpnlccssyz`.
- `scripts/verify-canonical-backend.mjs` passou a bloquear build com projeto, URL ou publishable
  key divergente. `prebuild` executa o guard automaticamente e o workflow
  `.github/workflows/quality.yml` repete guard, testes, build e inspeção do bundle em todo push/PR.
- QA automatizado final: TypeScript 0 erros, 17 arquivos/170 testes verdes, build de produção
  verde e `npm audit` sem vulnerabilidades. O lint global ainda contém dívida histórica de
  `no-explicit-any` (não é regressão desta rodada e não afeta o build).
