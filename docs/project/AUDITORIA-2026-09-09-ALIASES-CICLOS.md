# Auditoria read-only de aliases de ciclos - 2026-09-09

## Escopo e conclusao

PROD autorizado: `zshrcgbyhzxpnlccssyz`, tenant `bn-performance-training`.
Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc`.
HEAD observado no inicio: `6e626ed406d7ef8a67c5f4bc4812645772cfc91b`.
Ownership exclusivo deste documento; nenhum arquivo anterior editado, nenhum commit ou write remoto.

**GO tecnico do gate de alias para preparar um futuro plano que preserve integralmente os ciclos ativos.**
Os dois ciclos sao copias vinculadas individualmente de um mesmo template do tenant, com payload
de prescricao equivalente. O nome nao prova entrega cruzada. Ha evidencia forte de reuso via biblioteca,
nao prova documental de que o professor pretendia essa prescricao para cada pessoa.
Nao autoriza renomear, trocar treino, escolher outra prescricao, publicar ou aplicar SQL.

**NO-GO para reaproveitar o lote de placeholders vazios nos dois casos completos.**
A matricula A tem corrida ativa no ciclo chamado anteriormente de vazio; a matricula B tem conteudo
historico real distinto. O unico alvo completamente vazio identificado e a fronteira futura de A.
Nenhuma necessidade de decisao do usuario foi estabelecida nesta fase: os proximos gates sao tecnicos,
com QA independente e um plano novo, se a Root o delegar.

O lote anterior de tres matriculas/seis linhas foi aplicado pela Root na migration
`20260909210329`; push `25bb753` e QA GO foram informados pela Root durante esta auditoria.
Esse lote nao foi reexecutado nem reauditado aqui.

## Identificadores pseudonimos

| Papel | Matricula | Aluno | Ciclo |
| --- | --- | --- | --- |
| A, ativo usado | d735907ca436 | c185b71eebc4 | 311f71c93012 |
| A, anterior/offline | d735907ca436 | c185b71eebc4 | b41fde29a9c4 |
| A, fronteira futura | d735907ca436 | c185b71eebc4 | 5e8114de5c79 |
| B, ativo usado | 5f9de190f3c7 | c52d5aa0c08c | cf75bbafaa2b |
| B, anterior/importado | 5f9de190f3c7 | c52d5aa0c08c | d48b4ada7cfa |
| S, fonte de comparacao | 467cc79d6c5b | 9b13411daadb | 9dcadca7c1f1 |

Referencias: primeiros 12 caracteres de MD5 do UUID. Nomes, documentos fiscais, contatos,
URLs privadas, cargas e instrucoes pessoais nao sao exibidos. Queries retornam hashes/contagens.

## Evidencia da origem

- Template `e2902db07dd9`, criado em 2026-09-03 08:27:47.665342 UTC, mesmo tenant,
  autor `154f2eb41163`, sem atualizacao posterior registrada.
- As quatro sessoes do template coincidem integralmente, em ordem, com a revisao importada
  `77ee5cc01926` do ciclo S. Quatro workouts com marcador `mfit-import:v1:%`,
  criados ate 2026-08-31 20:12:03.7683 UTC, antes do template.
- Hash MD5 de `[{title, exercises}, ...]`, mesma ordem e JSON completo de cada exercicio:
  fonte = template = `4974e6afb59623ce6a608b1bd0bb39a2`.
- SHA-256 do JSON bruto `workout_templates.workouts`:
  `a8021f9eb1cef37d55e5665b2af7cc29938290eae685d51250e4f59e2418c355`.
- A revisao fonte hoje esta superseded desde 2026-09-04 10:16:07.281551 UTC.
  Sua substituta atual coincide em apenas 3/4 sessoes. Portanto comparar somente a revisao atual
  teria perdido a origem; nao se deve propagar sua alteracao posterior para os destinatarios.
- A criado em 2026-09-03 08:29:55.065651 UTC; B em 09:44:39.005890 UTC.
  As oito linhas de workouts foram criadas pelo mesmo autor do template, hoje membro do tenant.
- Nomes dos ciclos A/B sao iguais ao nome do template. Template tem `uses_count=0`;
  esse contador nao comprova ausencia de uso, pois o fluxo historico nao o incrementava.
- Existe uma terceira copia no mesmo tenant, em outro aluno pseudonimo `fd47ebce8727`,
  ciclo `6eac9fe7937d`, com payload igual; observacao de comparacao, fora do escopo de reparo.
- Nao existe coluna direta `source_template_id` em training_cycles/workouts no schema consultado;
  as ligacoes de origem acima sao reconstruidas por conteudo e cronologia, nao por FK de origem.
  A consulta de `training_cycle_delivery_repair_audit` nas duas matriculas retornou zero linhas.

## Equivalencia e titularidade

A e B possuem 4 workouts e 40 exercicios, distribuidos 9/13/9/9.
O array completo de exercicios foi comparado sem remover campos:
IDs, sets, reps, load, rest, method, group_id, notes, mfit_protocol e referencias de midia incluidos.

Hashes dos arrays de cada sessao, iguais em A/B/template:
1. `2178760f2ca99dde57821d53f3e775a3`
2. `e5d12f9aa6d66e98573a67b179dd72fb`
3. `30d704a7aaa6e4e6d7a6905356e4a186`
4. `94d195fdabe5243671ee7f583a476700`

Hash de entrega `[{title, description, exercises}, ...]`:
`d022212d87fe920059e4966c7c78e7e6`, igual nos dois ciclos e no template apos
normalizar exclusivamente descricao vazia para null. Sem essa normalizacao o template difere,
pois armazena descricao "", e os workouts armazenam null. Nenhum exercicio foi normalizado.
A tem day_of_week 1/2/3/4; B tem null nas quatro sessoes. Isso e uma diferenca real de agenda:
o hash de entrega nao inclui agenda e NAO e um fingerprint de estado integral.

Ciclos conferidos contra enrollment.student_id/company_id; alunos conferidos contra a empresa;
workouts conferidos contra a empresa do ciclo. Zero divergencias nos dois ativos.
Logs e sessoes conferidos contra os respectivos titulares, sem joins que multipliquem contagens:

| Ativo | Janela | Logs | Sessoes | Janela de uso | Divergencia de dono |
| --- | --- | ---: | ---: | --- | ---: |
| A | 2026-09-03 a 2026-10-14 | 10 | 0 | 2026-09-08 | 0 |
| B | 2026-09-03 a 2026-10-14 | 154 | 6 | 2026-09-03 a 2026-09-09 | 0 |

Ambos tem delivery_status null, nao "sent". Uso real prova acesso ao conteudo,
nao recebimento de WhatsApp nem consentimento tecnico do professor.
Registros de uso pertencem aos destinatarios; nenhum workout foi compartilhado por FK entre alunos.

## Causa compativel com o codigo

`src/pages/admin/WorkoutBuilder.tsx:351` oferece salvar como template e sugere nome derivado
do aluno; preserva o payload na biblioteca. `src/pages/admin/WorkoutLibrary.tsx:95` permite
selecionar outro aluno e enviar esse template.

`git show 9cf1b06^:src/lib/sendWorkoutTemplate.ts` mostra o fluxo historico:
marca o ciclo ativo anterior como completed SEM ajustar seu end_date, cria novo ciclo ativo
a partir do dia do envio, usa `name: template.name`, e copia os exercicios para novos workouts.
Isso explica simultaneamente alias preservado e sobreposicao de datas. E evidencia de mecanismo,
nao prova de qual bundle frontend estava no dispositivo no instante da entrega.
A versao atual usa `apply_workout_template_to_current_cycle`; nao executar essa RPC na auditoria.

## Limites de reparo por caso

### A: GO somente para planejar a fronteira futura; NO-GO para tratar anterior como vazio

- Anterior `b41fde29a9c4`: completed, 2026-09-01 a 2026-10-12, zero workouts de forca,
  mas `prescribed_offline_at=2026-09-08 07:39:36.567 UTC`.
- Tem plano running `df291ecde2e2`, active, array de seis semanas, criado em
  2026-09-03 08:26:16.868956 UTC. MD5 de row completa:
  `fabd226befd236c1415957e4b868d6fc`.
- Tem seis bundles: cinco failed e um active `7b9ccb4efe76`, este ligado ao running plan.
  Todos com aluno/empresa corretos. O bundle ativo tem has_cardio=false apesar do running_link=true;
  nao usar esse booleano isolado como prova de ausencia de cardio.
- Fronteira futura `5e8114de5c79`: pending, 2026-10-13 a 2026-11-23, vazia em toda a
  dependencia consultada, sem prescricao offline.
- GO para FUTURO PLANO de start_date 2026-10-13 -> 2026-10-15 apenas nessa fronteira,
  preservando o ativo ate 2026-10-14. Isso elimina so o par de dois dias, nao o par do anterior.
- Lacuna exata para resolver o outro par: provar que uma reconciliacao mantem as seis semanas
  de corrida, a entrega offline e a visibilidade do bundle, sem alterar a vigencia financeira.
  Nao superseder/encurtar o ciclo de corrida com o algoritmo de placeholders vazios.

### B: alias resolvido tecnicamente; plano historico separado necessario

- Anterior `d48b4ada7cfa`: completed, 2026-08-31 a 2026-10-11.
- Um workout importado em 2026-08-31 20:11:19.585945 UTC, sete exercicios,
  hash `bb9da6ea046dcd665a9e1d7edc56e3d5`; zero logs/sessoes.
- Nao coincide integralmente com nenhuma das quatro sessoes do ativo: conteudo distinto.
- Zero dependencias adicionais nos grupos consultados, inclusive arquivo/clear/intercycle/carryover.
- Caminho candidato para futuro plano: manter o ciclo completed e seu workout no historico e
  testar end_date 2026-10-11 -> 2026-09-02, vespera do ativo, sem tocar neste.
  Nao foi emitido GO de aplicacao para essa data historica.
- Lacuna exata: demonstrar em QA de leitura que esse ajuste historico mantem o treino anterior
  acessivel e conserva a selecao do ativo. Nao tratar o anterior como duplicata equivalente
  nem aplicar supersession por ausencia de logs. O snapshot nao registra a intencao original
  da data de substituicao; se uma proposta exigir escolher outra prescricao, faltara evidencia.

## Dependencias e gates do futuro plano

Consulta inclui TODOS workouts, inclusive superseded, logs, sessions, ai_plan_versions,
ai_strength_plans, running_plans, nutrition_plans, prescription_bundles, bundle_items do tipo
training_cycle, cycle_feedback, intercycle anamneses/deliveries/invites/waivers,
workout_archive_events, cycle_prescription_clear_events e carried_over_cycle_id.
A auditoria focada nao substitui inventario de todos FKs/triggers/cron no momento de preparar SQL.
Bundle_items de outras entidades e logs de cardio precisam entrar no plano do caso A.

Antes de qualquer escrita futura:
1. Resolver referencias para UUIDs completos e validar tenant/aluno/matricula univocos.
2. Recalcular fingerprints completos sob locks e separar hash de conteudo, agenda e row integral.
3. Revalidar dependencias em todo historico e manifestar exatamente os alvos.
4. Recusar residuos de repair_key; backup before/after e rollback fail-closed.
5. Preservar integralmente ambos ativos, seus oito workouts, 164 logs e seis sessoes
   desta leitura; recontar pois uso novo pode ocorrer.
6. Fronteira futura exige start_date > current_business_date. Mudanca de limite historico
   exige plano e QA proprios, nao contornar o guard do lote anterior.
7. Provar preservacao do cardio e do historico no seletor do app. O portal filtra superseded;
   `StudentPortal.tsx:450` e `prescriptionSchedule.ts:391` impedem assumir que FK intacta
   equivale a conteudo ainda acessivel.
8. Nenhuma alteracao financeira; QA independente, dry-run com rollback e Root como unica aplicadora.

## Hashes integrais observados

SHA-256 de `to_jsonb(training_cycles_row)::text`, UTF8, sem joins/campos derivados:

| Ciclo | SHA-256 |
| --- | --- |
| 311f71c93012 | e99efb98fe6c9de3b4b31fc2739c82c6bf132787c77c9c3f1cdbbdbbd793e012 |
| cf75bbafaa2b | 28d02f5dda8dbc9c9b3866d0d08aa18dee80d3732e7eda8634a06d34e42d4e05 |
| b41fde29a9c4 | 8464c223cfca53b560ea5a90ce61e823f6f38048868836f59d5d8ab0f4df4b47 |
| 5e8114de5c79 | c1b0067d1993701e87f3f784a327713b3873e23945d5855ee5e8bcd4eb6a1be2 |
| d48b4ada7cfa | 7d7d147e3b9883f55fa5044b54d6c1b54be2fa02d47b23954f1d6a7aaed81fb9 |

Sao snapshots de auditoria, nao baseline valido indefinidamente. Hashes intermediarios com campo
derivado er/payload nao devem ser usados como beforeimagehash do apply.

## Consultas reproduziveis

Executadas somente com BEGIN TRANSACTION READ ONLY e ROLLBACK. A descoberta de schema e
uma consulta inicial de ciclos precederam as consultas focadas abaixo. Comparacoes sempre
restritas ao tenant, ainda que atravessem alunos para rastrear o template.

### 1. Template, titulares e copias

```sql
begin transaction read only;
with targets as (
 select c.*,substr(md5(e.id::text),1,12) er from public.training_cycles c join public.enrollments e on e.id=c.enrollment_id
 join public.companies co on co.id=e.company_id where co.slug='bn-performance-training' and substr(md5(e.id::text),1,12) in ('d735907ca436','5f9de190f3c7') and c.status='active'
), shape as (
 select t.*, (select jsonb_agg(jsonb_build_object('title',coalesce(w.title,w.name),'description',coalesce(w.description,w.notes),'exercises',w.exercises) order by w.sort_order nulls last,w.day_of_week nulls last,w.id) from public.workouts w where w.cycle_id=t.id and w.superseded_at is null) payload from targets t
)
select t.er,substr(md5(t.id::text),1,12) cr,t.start_date,t.end_date,t.created_at,md5(to_jsonb(t)::text) snapshot_hash,md5(t.payload::text) delivery_payload_hash,
(select jsonb_agg(jsonb_build_object('wr',substr(md5(w.id::text),1,12),'sort',w.sort_order,'day',w.day_of_week,'exercises',jsonb_array_length(w.exercises),'exercise_hash',md5(w.exercises::text),'description_hash',md5(w.description),'notes_hash',md5(w.notes),'created',w.created_at,'creator',substr(md5(w.created_by::text),1,12),'revision',substr(md5(w.revision_id::text),1,12),'keys',(select jsonb_agg(distinct k) from jsonb_array_elements(w.exercises) x cross join lateral jsonb_object_keys(x) k)) order by w.sort_order,w.id) from public.workouts w where w.cycle_id=t.id) workouts,
(select jsonb_agg(jsonb_build_object('template_ref',substr(md5(wt.id::text),1,12),'same_company',wt.company_id=t.company_id,'name_equal',wt.name=t.name,'cycle_name_contains_template',position(wt.name in t.name)>0,'created_at',wt.created_at,'updated_at',wt.updated_at,'created_by',substr(md5(wt.created_by::text),1,12),'uses_count',wt.uses_count,'payload_hash',md5(wt.workouts::text),'exact_delivery_equal',p.payload=t.payload,'exercise_arrays_equal',(select jsonb_agg(x->'exercises' order by ord) from jsonb_array_elements(wt.workouts) with ordinality v(x,ord))=(select jsonb_agg(x->'exercises' order by ord) from jsonb_array_elements(t.payload) with ordinality v(x,ord))))
 from public.workout_templates wt cross join lateral (select jsonb_agg(jsonb_build_object('title',coalesce(x->>'title',x->>'name'),'description',coalesce(x->>'description',x->>'notes'),'exercises',x->'exercises') order by ord) payload from jsonb_array_elements(case when jsonb_typeof(wt.workouts)='array' then wt.workouts else '[]'::jsonb end) with ordinality v(x,ord)) p
 where wt.company_id=t.company_id and (position(wt.name in t.name)>0 or p.payload=t.payload)) template_matches,
(select jsonb_agg(jsonb_build_object('cr',substr(md5(c.id::text),1,12),'sr',substr(md5(c.student_id::text),1,12),'status',c.status,'start',c.start_date,'end',c.end_date,'created',c.created_at,'same_student',c.student_id=t.student_id,'name_equal',c.name=t.name,'payload_equal',p.payload=t.payload))
 from public.training_cycles c cross join lateral (select jsonb_agg(jsonb_build_object('title',coalesce(w.title,w.name),'description',coalesce(w.description,w.notes),'exercises',w.exercises) order by w.sort_order nulls last,w.day_of_week nulls last,w.id) payload from public.workouts w where w.cycle_id=c.id and w.superseded_at is null) p
 where c.company_id=t.company_id and c.id<>t.id and (c.name=t.name or p.payload=t.payload)) cycle_matches,
(select jsonb_build_object('count',count(*),'wrong_student',count(*) filter(where l.student_id is distinct from t.student_id),'first',min(l.session_date),'last',max(l.session_date)) from public.workout_logs l join public.workouts w on w.id=l.workout_id where w.cycle_id=t.id) logs,
(select jsonb_build_object('count',count(*),'wrong_student',count(*) filter(where l.student_id is distinct from t.student_id),'wrong_company',count(*) filter(where l.company_id is distinct from t.company_id),'first',min(l.session_date),'last',max(l.session_date)) from public.workout_sessions l join public.workouts w on w.id=l.workout_id where w.cycle_id=t.id) sessions
from shape t; rollback;
```

### 2. Origem e trilha de reparo

```sql
begin transaction read only;
with company as (select id from public.companies where slug='bn-performance-training'),
tw as (select wt.* from public.workout_templates wt join company co on co.id=wt.company_id where substr(md5(wt.id::text),1,12)='e2902db07dd9'),
tc as (select c.* from public.training_cycles c join company co on co.id=c.company_id where substr(md5(c.enrollment_id::text),1,12) in ('d735907ca436','5f9de190f3c7'))
select 'template_origin' section,coalesce(jsonb_agg(o),'[]'::jsonb) data from (
select substr(md5(c.id::text),1,12) cr,substr(md5(c.student_id::text),1,12) sr,c.status,c.start_date,c.end_date,c.created_at,
count(*) filter(where w.created_at<tw.created_at) workouts_before_template,
count(*) filter(where w.notes like 'mfit-import:v1:%') import_tagged,
jsonb_agg(distinct substr(md5(w.created_by::text),1,12)) authors,
(select count(*) from jsonb_array_elements(tw.workouts) x) template_workouts,
count(*) matches,
bool_and(coalesce(w.title,w.name)=coalesce(x.value->>'title',x.value->>'name')) titles_equal,
jsonb_agg(distinct jsonb_build_object('template_description_null',x.value->'description' is null or x.value->'description'='null'::jsonb,'template_description_empty',x.value->>'description'='','workout_description_null',w.description is null,'workout_notes_null',w.notes is null)) descriptor_diff
from tw cross join lateral jsonb_array_elements(tw.workouts) with ordinality x(value,ord)
join public.workouts w on w.exercises=x.value->'exercises' and w.company_id=tw.company_id
join public.training_cycles c on c.id=w.cycle_id and c.company_id=tw.company_id
group by c.id,tw.created_at,tw.workouts order by c.created_at) o
union all select 'repair_provenance',coalesce(jsonb_agg(o),'[]'::jsonb) from (
 select substr(md5(a.enrollment_id::text),1,12) er,a.repair_key,a.state,a.applied_at,substr(md5(a.target_cycle_id::text),1,12) target,substr(md5(a.superseded_cycle_id::text),1,12) superseded from public.training_cycle_delivery_repair_audit a where a.enrollment_id in(select enrollment_id from tc)
) o
union all select 'related_schema',jsonb_agg(o) from (
select table_name,jsonb_agg(column_name order by ordinal_position) columns from information_schema.columns where table_schema='public' and (table_name ilike '%event%' or table_name ilike '%histor%' or table_name='mfit_cycle_overlap_repairs') group by table_name) o;
rollback;
```

### 3. Dependencias dos pares

```sql
begin transaction read only;
with c as (
select tc.*,substr(md5(e.id::text),1,12) er from public.training_cycles tc join public.enrollments e on e.id=tc.enrollment_id join public.companies co on co.id=e.company_id where co.slug='bn-performance-training' and substr(md5(e.id::text),1,12) in ('d735907ca436','5f9de190f3c7') and tc.end_date>=date '2026-09-09' and tc.start_date<=date '2026-10-14' and tc.status<>'superseded'
)
select c.er,substr(md5(c.id::text),1,12) cr,c.status,c.delivery_status,c.start_date,c.end_date,c.prescribed_offline_at,
encode(extensions.digest(convert_to(to_jsonb(c)::text,'UTF8'),'sha256'),'hex') row_with_er_sha256,
(select count(*) from public.workouts w where w.cycle_id=c.id) all_workouts,
(select sum(jsonb_array_length(w.exercises)) from public.workouts w where w.cycle_id=c.id) exercise_count,
(select count(*) from public.workout_logs l join public.workouts w on w.id=l.workout_id where w.cycle_id=c.id) logs,
(select count(*) from public.workout_sessions l join public.workouts w on w.id=l.workout_id where w.cycle_id=c.id) sessions,
(select count(*) from public.ai_plan_versions p where p.cycle_id=c.id) versions,
(select count(*) from public.ai_strength_plans p where p.training_cycle_id=c.id) strength,
(select count(*) from public.running_plans p where p.training_cycle_id=c.id) running,
(select count(*) from public.nutrition_plans p where p.training_cycle_id=c.id) nutrition,
(select count(*) from public.prescription_bundles p where p.training_cycle_id=c.id) bundles,
(select count(*) from public.prescription_bundle_items p where p.entity_type='training_cycle' and p.entity_id=c.id) bundle_items,
(select count(*) from public.cycle_feedback p where p.cycle_id=c.id) feedback,
(select count(*) from public.intercycle_anamneses p where p.training_cycle_id=c.id) anamneses,
(select count(*) from public.intercycle_anamnesis_deliveries p where p.training_cycle_id=c.id) deliveries,
(select count(*) from public.intercycle_anamnesis_invites p where p.training_cycle_id=c.id) invites,
(select count(*) from public.intercycle_anamnesis_waivers p where p.training_cycle_id=c.id or p.prior_cycle_id=c.id) waivers,
(select count(*) from public.workout_archive_events p where p.cycle_id=c.id) archives,
(select count(*) from public.cycle_prescription_clear_events p where p.cycle_id=c.id) clear_events,
(select count(*) from public.enrollments p where p.carried_over_cycle_id=c.id) carryover,
(select jsonb_agg(jsonb_build_object('created',w.created_at,'import_tagged',w.notes like 'mfit-import:v1:%','creator',substr(md5(w.created_by::text),1,12),'exercise_hash',md5(w.exercises::text))) from public.workouts w where w.cycle_id=c.id and c.status<>'active') competitor_workouts
from c order by c.er,c.start_date;
rollback;
```

### 4. Equivalencia, cardio e revisoes

```sql
begin transaction read only;
with co as(select id from public.companies where slug='bn-performance-training'),
targets as(select c.* from public.training_cycles c join co on co.id=c.company_id where substr(md5(c.id::text),1,12) in ('311f71c93012','cf75bbafaa2b','b41fde29a9c4')),
tpl as(select t.* from public.workout_templates t join co on co.id=t.company_id where substr(md5(t.id::text),1,12)='e2902db07dd9')
select 'semantic_match' section,jsonb_agg(o) data from (
 select substr(md5(c.id::text),1,12) cr, count(*) all_workouts,
 md5(jsonb_agg(jsonb_build_object('title',coalesce(w.title,w.name),'description',coalesce(nullif(w.description,''),nullif(w.notes,'')),'exercises',w.exercises) order by w.sort_order nulls last,w.id)::text) normalized_delivery_hash,
 (select md5(jsonb_agg(jsonb_build_object('title',coalesce(x->>'title',x->>'name'),'description',coalesce(nullif(x->>'description',''),nullif(x->>'notes','')),'exercises',x->'exercises') order by ord)::text) from tpl,jsonb_array_elements(tpl.workouts) with ordinality v(x,ord)) normalized_template_hash,
 count(*) filter(where w.company_id is distinct from c.company_id) company_mismatch,
 (select count(*) from public.students s where s.id=c.student_id and s.company_id=c.company_id) student_company_match,
 (select count(*) from public.company_members cm where cm.company_id=c.company_id and cm.user_id=w.created_by) creator_memberships
 from targets c join public.workouts w on w.cycle_id=c.id
 group by c.id,c.company_id,c.student_id,w.created_by
) o
union all select 'offline_dependencies',jsonb_agg(o) from (
 select substr(md5(c.id::text),1,12) cr,
 (select jsonb_agg(jsonb_build_object('ref',substr(md5(p.id::text),1,12),'student_ok',p.student_id=c.student_id,'company_ok',p.company_id=c.company_id,'status',p.status,'created_at',p.created_at,'weeks_type',jsonb_typeof(to_jsonb(p)->'weeks'),'weeks_size',case when jsonb_typeof(to_jsonb(p)->'weeks')='array' then jsonb_array_length(to_jsonb(p)->'weeks') else null end,'row_hash',md5(to_jsonb(p)::text))) from public.running_plans p where p.training_cycle_id=c.id) running,
 (select jsonb_agg(jsonb_build_object('ref',substr(md5(p.id::text),1,12),'student_ok',p.student_id=c.student_id,'company_ok',p.company_id=c.company_id,'status',p.status,'created_at',p.created_at,'has_strength',p.has_strength,'has_cardio',p.has_cardio,'has_nutrition',p.has_nutrition,'running_link',p.running_plan_id is not null,'strength_link',p.strength_plan_id is not null)) from public.prescription_bundles p where p.training_cycle_id=c.id) bundles
 from targets c where substr(md5(c.id::text),1,12)='b41fde29a9c4'
) o
union all select 'source_revision_groups',jsonb_agg(o) from(
 select substr(md5(w.revision_id::text),1,12) revision, w.superseded_at, min(w.created_at) created_at, count(*) workouts,
 count(*) filter(where w.notes like 'mfit-import:v1:%') import_tagged,
 (select count(*) from tpl,jsonb_array_elements(tpl.workouts) x where exists(select 1 from public.workouts ww where ww.revision_id=w.revision_id and ww.cycle_id=w.cycle_id and ww.exercises=x->'exercises')) matching_template_sessions,
 md5(jsonb_agg(w.exercises order by w.sort_order nulls last,w.day_of_week nulls last,w.id)::text) ordered_exercises_hash
 from public.workouts w join public.training_cycles c on c.id=w.cycle_id join co on co.id=c.company_id where substr(md5(c.id::text),1,12)='9dcadca7c1f1' group by w.revision_id,w.cycle_id,w.superseded_at
) o;
rollback;
```

### 5. Fonte exata e hashes integrais

```sql
begin transaction read only;
with co as(select id from public.companies where slug='bn-performance-training'),
t as(select wt.* from public.workout_templates wt join co on co.id=wt.company_id where substr(md5(wt.id::text),1,12)='e2902db07dd9'),
source as(select w.* from public.workouts w join public.training_cycles c on c.id=w.cycle_id join co on co.id=c.company_id where substr(md5(c.id::text),1,12)='9dcadca7c1f1' and w.notes like 'mfit-import:v1:%'),
tc as(select c.* from public.training_cycles c join co on co.id=c.company_id where substr(md5(c.enrollment_id::text),1,12) in ('d735907ca436','5f9de190f3c7'))
select 'source_exact' section,jsonb_build_object(
'source_count',(select count(*) from source),
'source_hash',(select md5(jsonb_agg(jsonb_build_object('title',coalesce(w.title,w.name),'exercises',w.exercises) order by w.sort_order nulls last,w.day_of_week nulls last,w.id)::text) from source w),
'template_hash',(select md5(jsonb_agg(jsonb_build_object('title',coalesce(x->>'title',x->>'name'),'exercises',x->'exercises') order by ord)::text) from t,jsonb_array_elements(t.workouts) with ordinality v(x,ord)),
'source_last_created',(select max(created_at) from source),
'template_created',(select created_at from t),
'template_content_sha256',(select encode(extensions.digest(convert_to(workouts::text,'UTF8'),'sha256'),'hex') from t)) data
union all select 'competitor_not_active_subset',jsonb_build_object(
'old_workout_count',count(*),
'exact_match_in_active',count(*) filter(where exists(select 1 from public.workouts aw join tc a on a.id=aw.cycle_id where a.status='active' and a.student_id=c.student_id and aw.exercises=w.exercises))
) from tc c join public.workouts w on w.cycle_id=c.id where substr(md5(c.id::text),1,12)='d48b4ada7cfa'
union all select 'canonical_rows',jsonb_agg(jsonb_build_object('cr',substr(md5(c.id::text),1,12),'row_sha256',encode(extensions.digest(convert_to((to_jsonb(c))::text,'UTF8'),'sha256'),'hex')))
from tc c where substr(md5(c.id::text),1,12) in ('311f71c93012','cf75bbafaa2b','d48b4ada7cfa','b41fde29a9c4','5e8114de5c79');
rollback;
```
