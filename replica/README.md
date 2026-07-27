# Replica limpa do Sett Fitness Hub

Este diretório guarda uma réplica sem dados pessoais do app.

## O que entra

- Empresa/tenant e branding não secreto
- Planos
- Campos de cadastro/anamnese configuráveis
- Biblioteca de exercícios e grupos musculares
- Volumes musculares por exercício, se existirem
- Conquistas
- Permissões por papel/modulo
- Templates genéricos de mensagem
- Fluxos de automação genéricos
- Etiquetas genéricas de WhatsApp

## O que fica fora

Alunos, perfis, membros da equipe, papéis reais de usuários, pagamentos, conversas,
mensagens, anamnese respondida, avaliações, medidas corporais, treinos prescritos,
logs, sessões e qualquer histórico de pessoa.

## Exportar do app atual

```bash
SOURCE_APP_EMAIL="email-do-usuario-com-acesso" \
SOURCE_APP_PASSWORD="senha-do-usuario" \
npm run replica:export
```

O arquivo gerado é `replica/non-personal-config.json`.

Não existe snapshot versionado por padrão. Gere um export novo a partir do backend
canônico antes de importar em outro ambiente, para evitar reaproveitar referências
antigas de Supabase.

## Importar em outro Supabase

Antes do import, o projeto Supabase novo precisa estar com as migrations deste repo
aplicadas. O importador assume que as tabelas, enums, RLS e funções já existem.

O import precisa da service role do projeto novo, porque ele cria o primeiro usuário
admin e insere dados atravessando RLS.

```bash
TARGET_SUPABASE_URL="https://novo-projeto.supabase.co" \
TARGET_SUPABASE_SERVICE_ROLE_KEY="service-role-do-projeto-novo" \
REPLICA_ADMIN_EMAIL="novo-admin@email.com" \
REPLICA_ADMIN_PASSWORD="senha-nova" \
REPLICA_ADMIN_NAME="Novo Admin" \
REPLICA_COMPANY_NAME="Nova Empresa" \
REPLICA_COMPANY_SLUG="nova-empresa" \
npm run replica:import
```

Depois disso, a nova `.env.local` do frontend deve apontar para o projeto novo:

```bash
VITE_SUPABASE_URL="https://novo-projeto.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="publishable-ou-anon-key-do-projeto-novo"
VITE_SUPABASE_PROJECT_ID="ref-do-projeto-novo"
```
