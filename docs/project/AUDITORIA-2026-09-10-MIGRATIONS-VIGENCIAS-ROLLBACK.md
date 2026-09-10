# Auditoria das migrations de vigências e rollback — 10/09/2026

## Veredito

Os corpos das duas migrations registradas em produção foram reconstruídos sem consultar PII e são byte a byte iguais aos arquivos locais. A divergência era somente de versão/timestamp no nome do arquivo. Os arquivos locais foram renomeados para as versões do ledger remoto; nenhum corpo histórico foi reescrito.

O rollback anterior não era executável sob os triggers reais porque tentava restaurar `updated_at` e depois exigia o hash completo do before-image. Os triggers ativos sobrescrevem esse campo com `now()` em todo `UPDATE`. Os scripts agora validam também o hash autocontido do before-image antes de qualquer escrita, preservam o gate exato de after-image, restauram apenas campos de negócio e validam o estado final ignorando somente o timestamp controlado pelo trigger.

Nenhum dado persistente de produção foi alterado nesta auditoria. O único ensaio com escrita usou uma tabela temporária, acionou a função real do trigger e terminou em `ROLLBACK`.

## Reconciliação do ledger remoto

| Migration remota | Nome | Bytes | MD5 remoto | MD5 local | Resultado |
|---|---|---:|---|---|---|
| `20260909230806` | `reconcile_bn_legacy_enrollment_terms` | 10.643 | `099daa7d201359318c69a7a5f9832aab` | igual | corpo exato; arquivo local renomeado |
| `20260909231218` | `reconcile_bn_remaining_legacy_terms` | 8.380 | `7195c01519a936d45cf77e5d43b614b6` | igual | corpo exato; arquivo local renomeado |

Versões locais anteriores, incorretas no nome: `20260909225312` e `20260909230931`.

## Gate read-only de produção

Auditoria agregada executada em 10/09/2026, sem identificadores ou snapshots no output:

| Lote | Linhas esperadas | Before-images válidos | After-images exatos atuais | After-images semânticos | Alunos a restaurar | Atividade dependente pós-reparo | Readiness |
|---|---:|---:|---:|---:|---:|---:|---|
| `bn_legacy_terms_20260909` | 12 | 12 | 12 | 12 | 2 | 0 | `true` |
| `bn_remaining_legacy_terms_20260909` | 6 | 6 | 6 | 6 | 0 | 1 | `false` |

O mesmo gate confirmou dois triggers esperados ativos e a função real contendo `NEW.updated_at = now()`.

O segundo lote está bloqueado por atividade operacional posterior em um ciclo existente. O guard expandido continua apontando uma linha afetada, sem expor identidade. O guard fail-closed funcionou: after-image de matrícula/aluno ainda é exato, mas isso não basta para autorizar a reversão diante de atividade dependente posterior.

A cobertura de atividade e os locks agora reconciliam a migration canônica de preservação de ciclos e o reparo de decisões por owner. Incluem ciclos, treinos, exercícios, logs, sessões, feedback, versões e planos de IA, corrida e nutrição, bundles e seus itens, anamnese inter-ciclo (registro, entrega, convite e waiver), eventos de arquivamento/limpeza e referências de ciclo carregado por outra matrícula. Tabelas históricas de auditoria de reparos foram deliberadamente excluídas: são evidência administrativa append-only, não atividade operacional do aluno, e bloqueá-las tornaria o rollback dependente da própria trilha de auditoria.

## Ensaio do trigger real

O ensaio criou uma única linha sintética em tabela temporária, instalou nela `public.update_updated_at_column()`, tentou restaurar um timestamp antigo e verificou:

- estado de negócio restaurado: `true`;
- timestamp substituído por `transaction_timestamp()`: `true`;
- linhas persistentes tocadas: zero;
- término: `ROLLBACK`.

Isso prova o comportamento que quebrava os scripts antigos. Não equivale a executar o rollback completo nas 18 linhas reais.

Um segundo ensaio negativo criou before-images sintéticos em `pg_temp`, validou o hash inicial, corrompeu o snapshot sem recalcular `before_sha256` e confirmou `corrupt_snapshot_rejected=true`. O ensaio terminou em `ROLLBACK` e não acessou linhas de clientes.

Limite residual: nem toda tabela dependente tem um `updated_at` universal. O guard usa todos os timestamps operacionais disponíveis, mas não consegue reconstruir alterações históricas sem timestamp que o apply original não persistiu. Por isso, o rollback real continua condicionado a clone/staging e QA, mesmo com readiness `true`.

## Mudanças locais

- versões locais das migrations reconciliadas com o ledger remoto, mantendo bytes e MD5;
- rollbacks corrigidos para respeitar os triggers `updated_at`;
- validação autocontida de `before_sha256` antes de qualquer `UPDATE` persistente;
- guard fail-closed expandido para todo o grafo operacional conhecido, com locks de escrita contra corrida;
- restauração de `students` limitada aos dois registros cujo status foi realmente alterado pelo primeiro lote;
- auditoria read-only de readiness adicionada;
- ensaio sintético do trigger real adicionado;
- ensaio negativo de corrupção do before-image adicionado;
- teste de contrato adicionando versão/hash, fail-closed, trigger e ausência de PII;
- política criada para manter reparos data-specific futuros fora do deploy automático de migrations.

## Gate remanescente

O rollback real continua **não autorizado e não executado**. O segundo lote está tecnicamente bloqueado pelo guard de dependências. Antes de qualquer produção, ainda é obrigatório:

1. executar o rollback completo em clone/staging com os 18 before-images restaurados;
2. repetir o readiness imediatamente antes de qualquer janela real;
3. obter QA independente sobre os scripts e o diff;
4. confirmar backup, janela, owner, plano de abortar e pós-auditoria;
5. só então decidir se existe motivo operacional para reverter vigências já reconciliadas.

## Validação desta correção

- contrato Node do rollback: `6/6`;
- ensaio de trigger em `pg_temp` + `ROLLBACK`: aprovado;
- ensaio negativo de `before_sha256` em `pg_temp` + `ROLLBACK`: aprovado;
- readiness agregado ao vivo: lote de 12 `true`; lote de 6 `false` por uma atividade posterior;
- backend canônico: confirmado;
- ESLint: zero erros e 44 warnings preexistentes;
- build: aprovado;
- TypeScript: bloqueado por 36 erros preexistentes fora deste delta;
- suíte Vitest: 929/930; um timeout de 5 s no dashboard financeiro, cujo retry isolado passou em 0,96 s.

Essas dívidas gerais não foram mascaradas nem corrigidas neste commit de rollback. Os testes direcionados do delta estão verdes; staging e produção continuam não executados.

## Política para próximos reparos

Reparo por matrícula, tenant, pagamento ou data específica passa a viver em `scripts/`, fora do fluxo automático normal de migrations. Deve ter auditoria read-only, before-image privado, apply transacional, rollback fail-closed, ensaio fora de produção e QA independente. Migrations históricas já aplicadas permanecem no ledger com versão e bytes exatos; não se reescreve a história.
