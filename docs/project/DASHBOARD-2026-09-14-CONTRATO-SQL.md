# Dashboard do treinador — contrato SQL e handoff

Estado de implementação: **RPC dedicada concluída e aprovada em QA local independente**. O QA confirmou que conceder leitura global de `students` ampliaria, por RLS indireto, escritas em tabelas filhas de alunos não atribuídos. Essa abordagem foi rejeitada. A arquitetura final preserva as permissões atuais e entrega somente os dados do Dashboard por uma RPC autenticada e limitada à empresa. A aplicação remota continua sob responsabilidade do Release Guardian e exige repetição dos gates em staging.

Metadados consultados em 14/09/2026 no projeto canônico `zshrcgbyhzxpnlccssyz`, via `pg_proc` e `pg_policies`. Não foram consultados registros de alunos/leads nem executadas alterações remotas. O Guardian deve capturar o catálogo de staging imediatamente antes da aplicação e comparar com este inventário; este registro não substitui o snapshot de rollback do ambiente de destino.

## Superfície alterada

| Objeto | Antes | Depois |
| --- | --- | --- |
| `public.has_staff_permission(uuid, text)` | `company_dashboard_full` exige role `trainer`, vínculo na empresa e concessão individual habilitada em `staff_permissions`. | Preservada integralmente, assim como `can_read_staff_student` e `can_manage_staff_student`. |
| `public.get_company_dashboard_snapshot(uuid)` | Não existe. As consultas diretas do treinador ficam limitadas por RLS; `user_roles`, por exemplo, só expõe seus próprios roles. | RPC estável, `SECURITY DEFINER`, retorna apenas o modelo de leitura da tela na empresa autorizada. Nega anônimo, empresa ausente ou não autorizada com `42501`. Não libera SELECT geral de tabelas. |
| `public.leads`, policy `staff_leads` | `FOR ALL TO authenticated`, filtro correlacionado à própria linha de `leads`; pode permitir outro tenant para qualquer role staff. | Policy legada removida. `Company staff manage leads`, com `is_company_staff(auth.uid(), company_id) OR master`, permanece. |
| `public.admin_alerts`, policy `admin alerts staff select` | Leitura por destinatário, admin, coordinator ou `company_dashboard_full`, sempre com `is_company_staff`. | Preservada. O snapshot possui autorização e projeção próprias para os alertas visíveis no Dashboard. |
| Colunas, dados de concessões e enum | Enum `app_role`: `admin`, `coordinator`, `trainer`, `master`, `student`. | Nenhuma coluna, enum ou concessão histórica é alterada/apagada. |

Definições completas posteriores: [migration 20260914152000](../../supabase/migrations/20260914152000_trainer_company_dashboard_read_access.sql). O frontend usa o contrato local da nova RPC em `src/integrations/supabase/database.ts`; o arquivo gerado `types.ts` permanece sem edição manual.

Nos alertas direcionados, a projeção espelha a autorização anterior: treinador recebe alertas gerais, próprios e os liberados pela concessão histórica `company_dashboard_full`; admin, coordinator e master recebem os alertas da empresa. O canário contém dois treinadores distintos e impede que um leia título ou mensagem direcionada ao outro.

## Definições anteriores relevantes

Trechos abaixo são evidência de auditoria, não instruções para aplicação ou rollback.

```sql
CREATE OR REPLACE FUNCTION public.has_staff_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null
    and _company_id is not null
    and _permission = 'company_dashboard_full'
    and exists (
      select 1
      from public.company_members cm
      join public.user_roles ur on ur.user_id = cm.user_id
      join public.staff_permissions sp
        on sp.company_id = cm.company_id
       and sp.user_id = cm.user_id
       and sp.permission = _permission
       and sp.enabled
      where cm.company_id = _company_id
        and cm.user_id = auth.uid()
        and ur.role = 'trainer'::public.app_role
    );
$function$;
```

ACL consultada de `has_staff_permission`: execução por owner, `service_role` e `authenticated`; sem `public`/`anon`. A migration não altera essa função ou ACL.

Definição legada de `leads.staff_leads`: `PERMISSIVE`, `FOR ALL`, role `authenticated`, sem `WITH CHECK` explícito. O PostgreSQL usa a expressão de `USING` também na verificação de escrita quando não existe `WITH CHECK` separado:

```sql
company_id IN (
  SELECT leads.company_id
  FROM user_roles
  WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = ANY (ARRAY[
      'admin'::app_role, 'coordinator'::app_role,
      'trainer'::app_role, 'master'::app_role
    ])
)
```

A definição correta de `Company staff manage leads`, preservada para `USING` e `WITH CHECK`, é:

```sql
is_company_staff(auth.uid(), company_id)
OR has_role(auth.uid(), 'master'::app_role)
```

## Escritas que devem permanecer restritas

`can_manage_staff_student` não consulta `has_staff_permission`: mantém admin/coordinator ou vínculo de responsabilidade no aluno/matrícula, sempre com conferência de empresa. `set_staff_permission` mantém autorização admin/master. Nenhuma das duas funções é redefinida nesta migration.

A policy `admin alerts staff update` também permanece intacta. Além do destinatário/admin/coordinator no `USING`, seu `WITH CHECK` consultado é:

```sql
is_company_staff(auth.uid(), company_id)
AND company_id IS NOT NULL
AND (
  target_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'coordinator'::app_role)
)
AND (target_user_id IS NULL OR EXISTS (
  SELECT 1 FROM company_members cm
  WHERE cm.user_id = admin_alerts.target_user_id
    AND cm.company_id = admin_alerts.company_id
))
AND (student_id IS NULL OR EXISTS (
  SELECT 1 FROM students s
  WHERE s.id = admin_alerts.student_id
    AND s.company_id = admin_alerts.company_id
))
AND (enrollment_id IS NULL OR EXISTS (
  SELECT 1 FROM enrollments e
  WHERE e.id = admin_alerts.enrollment_id
    AND e.company_id = admin_alerts.company_id
))
```

O canário deve reproduzir essas verificações, incluindo tentativa de ligar um alerta próprio a aluno/matrícula de outra empresa. Ocultar botões não comprova restrição de escrita no banco.

## Gate e rollback

Gate local aprovado: 39 negações com SQLSTATE `42501`; paridade operacional entre admin/coordinator/trainer/master no tenant; alertas direcionados conforme a autorização do destinatário; ciclos substituídos excluídos; outra empresa e pais inconsistentes negados; leitura de leads limitada; e INSERT/UPDATE/DELETE negados nas quatro tabelas filhas de aluno não atribuído (`payments`, `functional_assessments`, `workout_sessions`, `student_body_limitations`). O controle negativo reproduz a concessão ampla descartada dentro de transação, prova a escalada e faz rollback. O catálogo de funções e policies anteriores fica byte-equivalente, exceto pela remoção deliberada de `staff_leads`. Gate de staging: reexecutar os mesmos casos com sessões reais de QA e catálogo efetivamente aplicado.

Rollback funcional: frontend anterior e remoção da RPC de snapshot apenas depois de seus consumidores retornarem à versão anterior. As funções de permissão, policies de escrita e concessões históricas permanecem como estavam. Não restaurar a policy vulnerável `staff_leads`; o acesso autorizado continua atendido pela policy correta que foi preservada.
