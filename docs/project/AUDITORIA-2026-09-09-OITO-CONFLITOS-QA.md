# QA independente pos-apply: tres reparos de ciclos BN

Veredito: **GO pos-apply**, restrito ao lote de tres matriculas. Nenhum blocker encontrado nos gates solicitados.
Consulta independente em producao em 2026-09-09, entre 21:05 e 21:07 UTC (18:05-18:07 America/Sao_Paulo).
Data de negocio retornada: 2026-09-09.

## Parametros e ownership

- Projeto PROD: `zshrcgbyhzxpnlccssyz`; tenant: `bn-performance-training`.
- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc`.
- Branch: `codex/sett-release-rc-20260826`; HEAD observado: `6e626ed406d7ef8a67c5f4bc4812645772cfc91b`.
- Migration confirmada via SELECT em `supabase_migrations.schema_migrations`: `20260909210329_repair_bn_three_safe_cycle_overlaps`.
- SHA-256 do apply e da migration local, ambos recalculados:
  `f9403ff70094fdad1d9478a0f9e3cf31f93637f3ec0ead27ab796c625583cf7f`.
- Manifesto: `8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a`.
- Repair key: `bn_eight_safe_cycles_20260909`.
- Esta rodada executou exclusivamente SELECT/WITH no banco. Unica escrita local: este documento. Sem commit.
- Apply pertence a root; dry-run GREEN/ROLLBACK foi informado pela root e registrado pelo executor. Esta QA nao reexecutou nenhum deles.

## Resultado dos gates

| Gate | Evidencia independente | Resultado |
| --- | --- | --- |
| Registro de migration | Versao e nome exatos presentes em PROD | PASS |
| Backup e after-images | 6 audit rows, 3 matriculas; manifesto correto, state=applied, rolled_back_at nulo; before hashes validos e after hashes/imagens iguais as linhas atuais | PASS |
| Escopo das alteracoes | 5 linhas mudaram exclusivamente start_date; 1 mudou exclusivamente end_date | PASS |
| Sobreposicao nas 3 reparadas | Zero pares atuais/futuros | PASS |
| Remanescentes globais BN | 5 matriculas, 8 pares; refs exatamente correspondentes aos 5 casos fora do lote | PASS |
| Integridade de conteudo | 59 workouts, 142 logs, 10 sessions; hashes exatos do baseline | PASS |
| Matriculas e ciclos ativos | 3 matriculas e 3 ciclos status=active; hashes integrais exatos do baseline | PASS |
| Owner dos 6 alvos + canonico | 7 ciclos encontrados, zero divergencias de student/company/enrollment; tenant correto | PASS |
| Canonico de Camila | Continua pending/sent, nao superseded, 4 workouts visiveis e 44 exercicios; SHA-256 preservado | PASS |
| Auditoria privada | RLS=true, zero policies, zero ACL PUBLIC; anon/authenticated sem privilegios de tabela e sem SELECT de coluna | PASS |

A contagem global significa todo o tenant BN, nas matriculas active/awaiting_training/awaiting_renewal.
Usa o mesmo criterio da auditoria inicial: ciclos nao superseded, sem superseded_by_cycle_id,
intervalos inclusivos que se interceptam e ambos terminando na data de negocio ou depois.
Cinco remanescentes significa cinco matriculas, nao cinco pares de ciclos.

## Baseline integral preservado

Serializacao reproduzivel: `md5(string_agg(to_jsonb(row)::text, '|' ORDER BY id))`.
Escopo: as tres matriculas abaixo; workouts de todos os seus ciclos, inclusive historicos;
logs/sessions ligados a esses workouts, sem filtro de supersession. Ciclos ativos: status='active'.
O baseline anterior foi fornecido pela root; os valores posteriores foram calculados independentemente.

| Conjunto | Quantidade pos-apply | MD5 antes = depois |
| --- | ---: | --- |
| enrollments | 3 | `03a6df52ccbc704c5b34080f520e8c1d` |
| workouts | 59 | `32198115c918099ab2d1840b654db2f5` |
| workout_logs | 142 | `aa683a1203637a1e2fe50fd5f310d4d4` |
| workout_sessions | 10 | `18ea1a8d16dfdeee505db7498e2c4c6f` |
| training_cycles ativos | 3 | `6d6d1239dd522c488a172504e4650ec1` |

Consulta inicial com jsonb_agg, e comparacoes preliminares com outros separadores, nao eram
comparaveis ao baseline. Nao constituem divergencia de dados. A comparacao final acima usa
a serializacao com separador pipe e coincide nos cinco conjuntos.

## Seis alteracoes confirmadas

| Matricula ref | Ciclo ref | Campo | Antes | Depois |
| --- | --- | --- | --- | --- |
| 2d93f08d4f16 | 24b181831b95 | start_date | 2026-10-16 | 2026-10-17 |
| 2d93f08d4f16 | 120347c569b4 | start_date | 2026-11-27 | 2026-11-28 |
| 2d93f08d4f16 | d28979e23b2d | start_date | 2027-01-04 | 2027-01-05 |
| 078e2d2b9409 | 0728d0cffd1f | end_date | 2026-11-09 | 2026-09-30 |
| 93c4213741e0 | 079fed89fe2a | start_date | 2026-10-29 | 2026-10-30 |
| 93c4213741e0 | 9fe14bd06b5e | start_date | 2026-12-10 | 2026-12-11 |

Todos permanecem pending. O placeholder de Camila permanece de 2026-09-29 a 2026-09-30,
sem supersession; o canonico `1ea03950be0a` permanece de 2026-10-01 a 2026-11-12.
SHA-256 integral atual do canonico:
`97264652470f21dc3ffb0bbbb3918ed2202819fc582805041986c680b12215de`.
Coincide com a evidencia pre-apply registrada pelo executor em 2026-09-09T17:28:54Z
(tarefa `01a08725-bcff-7361-9897-5128ed2431b9`).

## Privacidade e limites

A tabela `public.training_cycle_safe_overlap_repair_audit` tem RLS habilitada, sem policies
e sem grants PUBLIC/anon/authenticated. FORCE RLS=false; roles privilegiadas continuam com acesso.
A consulta mostrou que service_role tem tambem DELETE/TRUNCATE/REFERENCES/TRIGGER, alem de
SELECT/INSERT/UPDATE. Portanto nao se afirma que os privilegios efetivos dessa role se limitam
aos tres grants explicitos do script. Isso nao abre acesso aos papeis clientes nem bloqueia este gate.

A preservacao do treino ativo foi verificada por dados e hashes integrais; esta rodada nao
incluiu teste de UI autenticada. Nenhuma conclusao nova sobre vigencias financeiras/Asaas.

## Pendencias fora do lote

- `3530d245ed22`: bloqueado por decisao de calendario/conteudo; proximo passo e definir a prescricao canonica.
- `467cc79d6c5b`: bloqueado por dois conteudos enviados; proximo passo e decidir qual deve prevalecer.
- `7975a4d98a88`: bloqueado por calendario/conteudo e possivel dependencia financeira; reconciliar antes de propor reparo.
- `5f9de190f3c7`: bloqueado por alias/nome divergente e historico usado; excluir entrega cruzada antes de corrigir.
- `d735907ca436`: bloqueado por ambiguidade de template/entrega; concluir QA especifica antes de qualquer reparo.

Os cinco continuam fora deste GO. Nenhum reparo adicional foi executado.

## Consultas reproduziveis somente leitura

### Baseline
```sql
WITH e AS (
 SELECT e.* FROM public.enrollments e JOIN public.companies c ON c.id=e.company_id
 WHERE c.slug='bn-performance-training' AND substr(md5(e.id::text),1,12) IN ('2d93f08d4f16','078e2d2b9409','93c4213741e0')
), tc AS (SELECT t.* FROM public.training_cycles t JOIN e ON e.id=t.enrollment_id),
 w AS (SELECT w.* FROM public.workouts w JOIN tc ON tc.id=w.cycle_id),
 l AS (SELECT l.* FROM public.workout_logs l JOIN w ON w.id=l.workout_id),
 s AS (SELECT s.* FROM public.workout_sessions s JOIN w ON w.id=s.workout_id)
 SELECT jsonb_build_object(
 'enrollments_count',(SELECT count(*) FROM e),
 'enrollments_md5',(SELECT md5(string_agg(to_jsonb(e)::text, '|' ORDER BY id)) FROM e),
 'workouts_count',(SELECT count(*) FROM w),
 'workouts_md5',(SELECT md5(string_agg(to_jsonb(w)::text, '|' ORDER BY id)) FROM w),
 'logs_count',(SELECT count(*) FROM l),
 'logs_md5',(SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY id)) FROM l),
 'sessions_count',(SELECT count(*) FROM s),
 'sessions_md5',(SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY id)) FROM s),
 'active_cycles_count',(SELECT count(*) FROM tc WHERE status='active'),
 'active_cycles_md5',(SELECT md5(string_agg(to_jsonb(tc)::text, '|' ORDER BY id)) FROM tc WHERE status='active'),
 'checked_at',now(),'business_date',public.current_business_date()) AS baseline;
```

### Contagem dos conflitos
```sql
WITH scope AS (
SELECT e.id FROM public.enrollments e JOIN public.companies c ON c.id=e.company_id
WHERE c.slug='bn-performance-training' AND e.status IN ('active','awaiting_training','awaiting_renewal')
), visible AS (SELECT t.* FROM public.training_cycles t JOIN scope e ON e.id=t.enrollment_id
WHERE t.status <> 'superseded' AND t.superseded_by_cycle_id IS NULL),
pairs AS (SELECT a.enrollment_id FROM visible a JOIN visible b ON a.enrollment_id=b.enrollment_id AND a.id<b.id
WHERE a.start_date<=b.end_date AND b.start_date<=a.end_date
AND a.end_date>=public.current_business_date() AND b.end_date>=public.current_business_date())
SELECT count(*) AS global_bn_pairs, count(DISTINCT enrollment_id) AS global_bn_enrollments,
count(*) FILTER (WHERE substr(md5(enrollment_id::text),1,12) IN ('2d93f08d4f16','078e2d2b9409','93c4213741e0')) AS repaired_scope_pairs,
array_agg(DISTINCT substr(md5(enrollment_id::text),1,12)) AS remaining_enrollment_refs FROM pairs;
```

### Auditoria e owner
```sql
WITH audit AS (SELECT * FROM public.training_cycle_safe_overlap_repair_audit WHERE repair_key='bn_eight_safe_cycles_20260909'),
owners AS (SELECT cycle_id, enrollment_id,student_id,company_id FROM audit
UNION SELECT canonical_cycle_id,enrollment_id,student_id,company_id FROM audit WHERE canonical_cycle_id IS NOT NULL)
SELECT
(SELECT count(*) FROM audit) AS audit_rows,
(SELECT count(DISTINCT enrollment_id) FROM audit) AS enrollments,
(SELECT bool_and(batch_sha256='8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a' AND state='applied' AND rolled_back_at IS NULL) FROM audit) AS manifest_state_ok,
(SELECT bool_and(a.after_sha256=encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex') AND a.after_cycle=to_jsonb(t)) FROM audit a LEFT JOIN public.training_cycles t ON t.id=a.cycle_id) AS after_hashes_match,
(SELECT bool_and(a.before_sha256=encode(extensions.digest(a.before_cycle::text,'sha256'),'hex')) FROM audit a) AS before_hashes_valid,
(SELECT count(*) FROM owners) AS owner_count,
(SELECT count(*) FROM owners o LEFT JOIN public.training_cycles t ON t.id=o.cycle_id LEFT JOIN public.enrollments e ON e.id=o.enrollment_id LEFT JOIN public.companies c ON c.id=o.company_id
 WHERE t.id IS NULL OR e.id IS NULL OR c.slug IS DISTINCT FROM 'bn-performance-training'
 OR t.enrollment_id IS DISTINCT FROM o.enrollment_id OR t.student_id IS DISTINCT FROM o.student_id OR t.company_id IS DISTINCT FROM o.company_id
 OR e.student_id IS DISTINCT FROM o.student_id OR e.company_id IS DISTINCT FROM o.company_id) AS owner_mismatches,
(SELECT jsonb_agg(jsonb_build_object('cycle_ref',substr(md5(a.cycle_id::text),1,12),'action',a.action,
'start_date',t.start_date,'end_date',t.end_date,'status',t.status,
'changed_keys',(SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(a.before_cycle || a.after_cycle) k WHERE a.before_cycle->k IS DISTINCT FROM a.after_cycle->k)))
 FROM audit a JOIN public.training_cycles t ON t.id=a.cycle_id) AS changes;
```

### Canonico
```sql
SELECT substr(md5(t.id::text),1,12) AS canonical_ref,t.status,t.delivery_status,t.start_date,t.end_date,
t.superseded_at IS NULL AND t.superseded_by_cycle_id IS NULL AND t.status<>'superseded' AS visible_cycle,
(SELECT count(*) FROM public.workouts w WHERE w.cycle_id=t.id AND w.superseded_at IS NULL) AS visible_workouts,
(SELECT sum(CASE WHEN jsonb_typeof(w.exercises)='array' THEN jsonb_array_length(w.exercises) ELSE 0 END) FROM public.workouts w WHERE w.cycle_id=t.id AND w.superseded_at IS NULL) AS visible_exercises,
encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex') AS canonical_sha256
FROM public.training_cycles t JOIN public.enrollments e ON e.id=t.enrollment_id JOIN public.companies c ON c.id=e.company_id
WHERE c.slug='bn-performance-training' AND substr(md5(e.id::text),1,12)='078e2d2b9409' AND substr(md5(t.id::text),1,12)='1ea03950be0a';
```

### Privilegios
```sql
SELECT c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls,
(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count,
(SELECT count(*) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_acl_grants,
(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'select',has_table_privilege(r.rolname,c.oid,'SELECT'),'insert',has_table_privilege(r.rolname,c.oid,'INSERT'),'update',has_table_privilege(r.rolname,c.oid,'UPDATE'),'delete',has_table_privilege(r.rolname,c.oid,'DELETE'),'truncate',has_table_privilege(r.rolname,c.oid,'TRUNCATE'),'references',has_table_privilege(r.rolname,c.oid,'REFERENCES'),'trigger',has_table_privilege(r.rolname,c.oid,'TRIGGER'),'column_select',has_any_column_privilege(r.rolname,c.oid,'SELECT'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')) AS grants
FROM pg_class c WHERE c.oid='public.training_cycle_safe_overlap_repair_audit'::regclass;
```
