# Relatório Codex — reconciliação do legado e robustez do backend

Data: 2026-07-29
Branch de trabalho: `codex/claude-compat`
Backend canônico: `zshrcgbyhzxpnlccssyz`
Projeto legado auditado: `cxesecxyrndveookvlzz`

## Resumo

O projeto legado continua acessível e foi comparado com o backend canônico. A
reconciliação foi executada de forma idempotente, sem substituir perfis já
existentes e sem reativar ciclos antigos. O backend canônico terminou a
auditoria sem duplicatas naturais de alunos, vínculos órfãos de equipe,
matrículas operacionais sobrepostas ou ciclos ativos vazios.

O relatório do Claude
`RELATORIO-2026-07-29-CADENCIA-PRESENCA-CARTEIRA.md` também foi auditado. A
migration pendente foi endurecida e aplicada; durante o lint remoto foram
encontradas RPCs antigas incompatíveis com o schema atual, que foram reparadas
e testadas.

## Dados recuperados do projeto legado

- 4 perfis de alunos realmente ausentes foram restaurados.
- Uma duplicata interna exata do legado foi consolidada antes da importação.
- 3 IDs históricos foram mapeados para perfis canônicos já existentes.
- 4 matrículas, 3 anamneses, 8 avaliações, 1 limitação corporal e 28 mensagens
  de WhatsApp foram importadas.
- 12 objetos de `whatsapp-media`, 2 de `evaluations` e 1 de
  `platform-assets` foram copiados para caminhos isolados no storage atual.
- 7 anexos antigos de avaliação foram preservados em `student-files`.
- 5 treinos históricos com conteúdo foram arquivados em JSON na pasta do
  aluno, sem entrar no fluxo de ciclos ativos.
- O backend passou de 68 para 72 alunos e permaneceu com zero colisões por
  e-mail, telefone, WhatsApp ou CPF dentro da empresa.

O utilitário reutilizável está em `scripts/reconcile-legacy-supabase.mjs`.
Ele usa service roles apenas por variáveis de ambiente, gera backup privado em
`/tmp`, roda em dry-run por padrão e só grava com `--apply`.

## Migrations aplicadas

- `20260729120000_contact_cadence_and_staff_sessions.sql`
  - adiciona cadência e presença;
  - valida membership, role, empresa e timestamps;
  - restringe RPC e tabela a tenants autorizados.
- `20260729173000_repair_schema_drifted_rpcs.sql`
  - corrige 12 RPCs quebradas por drift de schema;
  - usa `plans.price`, `payments`, `workout_logs` e o formato atual de ciclos;
  - adiciona autorização explícita por empresa/aluno.
- `20260729180000_reconcile_staff_enrollments_and_json_workouts.sql`
  - reconcilia IDs antigos de equipe com contas Auth atuais;
  - remove memberships/roles órfãos, preservando perfis e histórico;
  - consolida matrículas abertas sobrepostas e cria índice preventivo;
  - restaura FKs de Auth para trainer/membership/role;
  - reclassifica 22 ciclos vazios de `active` para `pending`;
  - cria projeção canônica para exercícios normalizados ou em JSON;
  - corrige volume semanal, progressão de carga e recordes pessoais.
- `20260729191000_remove_rpc_lint_warning.sql`
  - remove o último warning estático do schema.
- `20260729192000_scope_student_evaluations.sql`
  - preenche a empresa das avaliações herdadas pelo aluno;
  - torna `student_evaluations.company_id` obrigatório e adiciona FK.

A migration concorrente
`20260729190000_deduplicate_whatsapp_messages.sql`, criada durante esta
auditoria, foi preservada e já estava aplicada no remoto.

## Integridade depois dos reparos

- 72 alunos, 70 matrículas e 328 ciclos.
- 0 alunos sem empresa.
- 0 alunos, memberships ou roles apontando para Auth inexistente.
- 0 treinadores operacionais sem Auth ou sem membership da empresa.
- 0 alunos com mais de uma matrícula aberta.
- 0 ciclos ativos sem prescrição materializada.
- 0 workouts sem ciclo.
- Todos os 174 exercícios presentes nos workouts referenciam IDs existentes
  na biblioteca.
- 1.506 registros de 40 tabelas com `student_id` + `company_id` foram
  cruzados; zero ficaram sem empresa, com empresa divergente ou aluno órfão.
- A conta da Thalia está confirmada, com role `trainer`, membership na BN e 29
  alunos atribuídos.
- A conta ativa da Bárbara está confirmada, com role `trainer` e membership na
  BN; os alunos anteriormente transferidos permanecem com a Thalia.

## Integrações

- Asaas:
  - `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` existem no projeto canônico;
  - `check-connection` autenticado para a BN retornou conectado;
  - webhook sem token retorna 401;
  - webhook com token configurado e evento vazio retorna 200;
  - nenhum segredo foi gravado no Git.
- WhatsApp:
  - `whatsapp-manager/check-status` retornou `connected`;
  - número conectado foi reconhecido;
  - zero duplicatas por `(chat_id, message_id_external)` após a migration.
- Hostinger:
  - nenhum segredo, DNS ou credencial da Hostinger existe em qualquer um dos
    Supabases;
  - a sessão do hPanel está deslogada;
  - o domínio responde 200 por Hostinger/Cloudflare e o bundle público contém
    o backend canônico, com zero referências ao projeto legado;
  - não trocar o DNS para Netlify sem uma decisão explícita de hospedagem, pois
    a produção atual está operacional.

## QA executado

- `npm run test`: **192/192 testes passaram**.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `npm run verify:backend`: confirmou `zshrcgbyhzxpnlccssyz`.
- varredura do `dist`: zero referência a `cxesecxyrndveookvlzz`.
- `npx -y deno check` nas 26 edge functions: passou.
- `supabase db lint --linked --level warning`: nenhum erro ou warning.
- Smokes das 14 RPCs reparadas: todos retornaram 2xx/contrato válido.

## Nota sobre ESLint

`npm run lint` global ainda falha com 995 erros e 51 warnings preexistentes,
principalmente `@typescript-eslint/no-explicit-any` em centenas de arquivos.
Isso não bloqueia TypeScript, testes ou build, mas é uma dívida técnica real.
Não foi mascarada desabilitando a regra e não foi misturada nesta
reconciliação de dados/backend.

## Próximos passos

1. Recuperar o acesso ao hPanel apenas para administração futura do domínio;
   não há correção urgente de DNS.
2. Fazer um novo deploy do frontend somente após integrar/commitar os diffs
   concorrentes de WhatsApp atualmente no worktree.
3. Tratar o baseline de ESLint por módulos, com tipagem e sem desligar regras
   globalmente.

Claude: o banco canônico já contém as migrations acima. Preserve os reparos de
tenant, os FKs de equipe, o índice de matrícula aberta e a projeção
`workout_exercise_entries` ao integrar.
