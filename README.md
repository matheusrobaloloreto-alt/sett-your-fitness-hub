# SETT / BN Performance — Fitness Hub

App de **treino, avaliação funcional, nutrição e gestão** para personal trainers e consultorias.
Atende dois públicos: o **aluno** (no aplicativo) e o **treinador** (painel de gestão).

> App em produção: **https://bn-performance-webapp-matheus.netlify.app**
> Stack: Vite + React + TypeScript + shadcn/ui + Tailwind + Supabase.

---

## O que a plataforma faz

### Para o aluno
- **Treino guiado:** cronômetro, aviso sonoro no descanso, a tela não apaga e as cargas são salvas sozinhas (até offline).
- **Recorde pessoal** comemorado na hora; **gamificação** (pontos, ranking mensal anônimo, conquistas, gráficos de evolução).
- **Vídeo de demonstração** em cada exercício.
- **Abas que só aparecem se houver prescrição:** Treino, Dicas Nutricionais, Corrida, Natação e Ciclismo.
- **Plano nutricional por refeição** (horários, o que comer / evitar), metas, macros e marcador de hidratação.
- **Popup pós-treino "Como foi o treino?"** — a resposta chega ao treinador no WhatsApp.

### Para o treinador
- **Prescrição num lugar só:** anamnese → avaliação por vídeo (gera laudo) → prescrição → PDFs, com **publicação automática no app do aluno**.
- **Laudo em PDF** com envio ao aluno e arquivo na pasta dele.
- **Vídeo do WhatsApp vira avaliação em 1 clique**; **anamnese enviada direto no WhatsApp**.
- **Painel de gestão:** risco de evasão, aniversariantes do mês, renovações vencendo, troca de treino.
- **CRM de WhatsApp:** mensagens-modelo, envio em massa por segmento, conversa com mensagem pronta.
- **Central de IA** que personaliza o assistente para cada unidade.
- **Biblioteca de 447 exercícios** com upload de vídeo por exercício.
- **Página de pagamento personalizada (white-label)** por empresa.

---

## AI Pack

The local refinement branch includes a consolidated AI pack at:

- App routes: `/admin/ia`, `/coordinator/ia`, `/trainer/ia`
- Frontend: `src/pages/admin/AICoachHub.tsx`
- Supabase function: `supabase/functions/ai-coach-pack`

Available modes: strength training, running prescription, nutrition, adaptive training, technique analysis, body composition, injury triage, and AI secretary.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app runs on `http://localhost:8080` by default.

## Environment

Frontend variables live in `.env.local`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

Supabase Edge Functions read server-side secrets from Supabase, not from the Vite bundle. Expected function secrets include:

```bash
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
ASAAS_API_KEY
ASAAS_WEBHOOK_TOKEN
```

CRM/automation staging secrets are also server-side only. Names only, no values:

```bash
AUTOMATION_CRON_SECRET
AUTOMATION_TEST_SECRET
EVOLUTION_API_URL
EVOLUTION_API_KEY
WHATSAPP_WEBHOOK_SECRET
```

Never copy production WhatsApp/provider values into staging. The controlled weekly-contact canary
requires a staging-only provider instance and a staging-only recipient controlled by the operator.

Optional:

```bash
ANTHROPIC_MODEL
YOUTUBE_API_KEY
```

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
```

## Agent Handoff

Claude Code should read `CLAUDE.md` first. Codex and Claude should keep secrets out of source, use `.env.local` for local credentials, and run at least `npm run build` before handing off frontend changes.
