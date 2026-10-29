import assert from 'node:assert/strict';
import { sql } from '../scripts/qa/self-service-local.mjs';

export const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const ident = value => `"${String(value).replaceAll('"', '""')}"`;

export function captureData(spec, own = {}) {
  const tables = spec || JSON.parse(sql(`select json_agg(json_build_object('table',c.relname,'columns',
    (select json_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';`));
  const statements = tables.map(item => {
    const cols = item.columns;
    let filter = 'true';
    if (own.company) {
      if (item.table === 'companies') filter = `t.id<>${quote(own.company)}::uuid`;
      else if (item.table === 'automation_dispatch_attempts') filter = `not (
        (t.kind='flow' and exists(select 1 from public.flow_sessions s join public.automation_flows f on f.id=s.flow_id where s.id=t.owner_id and f.company_id=${quote(own.company)}::uuid))
        or (t.kind='intercycle' and exists(select 1 from public.intercycle_anamnesis_deliveries d where d.id=t.owner_id and d.company_id=${quote(own.company)}::uuid)))`;
      else if (cols.includes('company_id')) filter = `t.company_id is distinct from ${quote(own.company)}::uuid`;
      else if (cols.includes('flow_id')) filter = `not exists(select 1 from public.automation_flows f where f.id=t.flow_id and f.company_id=${quote(own.company)}::uuid)`;
      else if (cols.includes('chat_id')) filter = `not exists(select 1 from public.whatsapp_chats c where c.id=t.chat_id and c.company_id=${quote(own.company)}::uuid)`;
      else if (own.user && cols.includes('user_id')) filter = `t.user_id is distinct from ${quote(own.user)}::uuid`;
    }
    return `select ${quote(item.table)} as name, count(*)::integer as count, md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) as checksum
      from (select ${cols.map(c => `t.${ident(c)}`).join(',')} from public.${ident(item.table)} t where ${filter}) r`;
  });
  return { spec: tables, rows: JSON.parse(sql(`select json_agg(x order by name) from (${statements.join(' union all ')}) x;`)) };
}

export function assertDataUnchanged(before, own = {}) {
  const after = captureData(before.spec, own);
  assert.deepEqual(after.rows, before.rows, 'Preexisting public data changed (checksums/counts only)');
  return after;
}
