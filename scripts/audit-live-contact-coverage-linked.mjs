#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { summarizeActiveStudentContactCoverage } from "./audit-live-integrations-core.mjs";

const COMPANY_SLUG = "bn-performance-training";

const sql = `
with target_company as (
  select id from public.companies where slug = '${COMPANY_SLUG}' limit 1
), active_students as (
  select s.id, s.phone, s.whatsapp
  from public.students s
  join target_company c on c.id = s.company_id
  where s.status in ('active', 'awaiting_renewal')
), company_chats as (
  select wc.id, wc.student_id
  from public.whatsapp_chats wc
  join target_company c on c.id = wc.company_id
)
select jsonb_build_object(
  'students', coalesce((select jsonb_agg(to_jsonb(s)) from active_students s), '[]'::jsonb),
  'chats', coalesce((select jsonb_agg(to_jsonb(c)) from company_chats c), '[]'::jsonb)
) as payload;
`;

const result = spawnSync(
  "supabase",
  ["db", "query", "--linked", "--output", "json", sql],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  },
);

if (result.status !== 0) {
  throw new Error("A consulta agregada de contatos falhou; nenhum dado bruto foi exibido.");
}

let envelope;
try {
  envelope = JSON.parse(result.stdout.trim());
} catch {
  throw new Error("A resposta agregada de contatos não pôde ser interpretada; nenhum dado bruto foi exibido.");
}

const payload = envelope?.rows?.[0]?.payload;
if (!payload || !Array.isArray(payload.students) || !Array.isArray(payload.chats)) {
  throw new Error("A consulta agregada de contatos retornou um formato inesperado.");
}

const summary = summarizeActiveStudentContactCoverage(payload.students, payload.chats);

process.stdout.write(`${JSON.stringify({
  audited_at: new Date().toISOString(),
  company_slug: COMPANY_SLUG,
  active_students: payload.students.length,
  whatsapp_chats: payload.chats.length,
  ...summary,
}, null, 2)}\n`);
