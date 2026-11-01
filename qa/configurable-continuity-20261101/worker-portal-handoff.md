# SUPERSEDED para recibos finais: leia worker-portal-final-source-receipt.md e worker-portal-freeze.sha256.

# Worker portal — configurable continuity freeze

Base: `61ab2c848982feb89a741d258b48596b5b58d4b6`.
Workspace: `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix`.
Ownership: somente os quatro arquivos listados em `worker-portal-freeze.sha256`. Nenhuma edição nos arquivos do Pauli; seletor prescriptionSchedule, cobertura global e financeiro não foram alterados neste escopo.

## Comportamento

- Último treino vencido: manter até substituição somente após política keep confirmada; hide bloqueia a continuidade operacional.
- Expiração do ciclo também é conferida no gate local, independentemente de uma projeção de cobertura válida ainda em cache (teste de virada de data). A cobertura global não é recalculada por essa decisão.
- Treino atualmente coberto permanece disponível em carga/erro da política. Datas, matrícula, logs, sessão, histórico somente leitura e exclusões existentes não são reescritos.
- Hook usa exclusivamente RPC real `get_company_workout_expiry_policy({_company_id})`. Resposta obrigatória: objeto `{company_id, expired_workout_behavior, version}`; empresa exata, versão inteira não negativa e enum válido. Sem default cliente, sem consulta à tabela privada e sem JSON persistido.
- O default de linha legitimamente ausente pertence ao RPC autenticado do Pauli. Erro, RPC ausente, resposta nula/inválida ou empresa divergente não liberam continuidade.
- Query key: `['company-experience-policy', companyId, 'student-prescription-strict', userId, studentId]`. Cache separado do reader opcional global; erro/refetch/pausa offline não reutilizam keep como liberação.
- Evento `company-product-settings-changed` com `detail.companyId` revalida o tenant; foco também revalida. A invalidação do prefixo `['company-experience-policy', companyId]` é suportada. Retry/event/foco cancelam consultas antigas inclusive na carga inicial; resposta atrasada não substitui a validação nova.
- UI mostra carregamento e retry humanos, sem enums/configuração técnica.

## Integração com Pauli / raiz

- Confirmada também a projeção da coluna dedicada em `readCompanyProductSettings`/`parseSettingsRecord` no shared em andamento do Pauli; o hook não importa esse reader opcional nem seu default.
- Confirmado no DDL local do Pauli o RPC JSONB com o nome e campos acima e o armazenamento em coluna dedicada. Não foi aplicada migration nem chamada produção por este worker.
- O save do Pauli deve emitir o evento acima após sucesso ou invalidar o prefixo da empresa. A emissão deve ser conferida na integração: ainda não estava presente em `src/lib/companyProductSettings.ts` ou `src/pages/admin/ProductSettings.tsx` durante o freeze deste worker. O hook já aceita ambas as formas e revalida ao foco/montagem.
- Publicar o backend/migration antes de qualquer frontend novo: RPC indisponível bloqueia continuidade vencida intencionalmente. Este handoff não autoriza deploy.

## Validação

Recibo final: `worker-portal-tests.txt`: 66/66 passaram (25 hook + 41 portal; somente transporte Supabase mockado nos testes), processo exit 0, hashes antes/depois idênticos. Timeout de teste focado 20s devido à contenção local; sem ampliação da suíte. Hashes: `worker-portal-freeze.sha256`; conferir com `shasum -a 256 -c qa/configurable-continuity-20261101/worker-portal-freeze.sha256`.
REDs preservados: `worker-portal-offline-red.txt`, `worker-portal-initial-event-red.txt` e `worker-portal-expiry-red.txt`.
ESLint focado: zero erros e três warnings já existentes no portal. Diff check limpo. Sem TSC global, broad build, browser ou prova nativa de RLS/RPC por este worker; QA independente Poincare/raiz e integração backend permanecem gates próprios.

Rollback local: reverter apenas o diff desses quatro arquivos contra a base, preservando WIP dos outros owners. Sem commit/push/deploy ou escrita de dados realizada.
