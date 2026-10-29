import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { output, privateFile, sql } from './self-service-local.mjs';
import { api, login } from './self-service-api.mjs';

const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state = existsSync(path.join(output, 'identities.private.json'))
  ? JSON.parse(readFileSync(path.join(output, 'identities.private.json'), 'utf8'))
  : { companyA, companyB, people: {} };

for (const [name, role, company] of [
  ['adminA','admin',companyA], ['adminB','admin',companyB],
  ['student','student',companyA], ['trainer','trainer',companyA], ['master','master',null],
]) {
  let person = state.people[name];
  if (!person) {
    person = { email: `qa-${name.toLowerCase()}@self-service.invalid`, password: `QA-${randomBytes(24).toString('base64url')}`, role, company };
    const created = await api('/auth/v1/admin/users', { method: 'POST', admin: true,
      body: { email: person.email, password: person.password, email_confirm: true,
        user_metadata: { full_name: `Synthetic ${name}` } } });
    if (!created.ok || !created.data?.id) throw new Error(`Synthetic user creation failed: ${name} HTTP ${created.status}`);
    person.id = created.data.id;
    state.people[name] = person;
    privateFile('identities.private.json', JSON.stringify(state, null, 2));
  }
  await login(person);
}
const uuid = value => {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid synthetic UUID');
  return `'${value}'`;
};
sql(`insert into public.companies(id,name,slug) values
  (${uuid(companyA)},'Synthetic Company A','qa-self-service-a'),
  (${uuid(companyB)},'Synthetic Company B','qa-self-service-b') on conflict(id) do nothing;`);
for (const [name, person] of Object.entries(state.people)) {
  sql(`insert into public.user_roles(user_id,role) values(${uuid(person.id)},'${person.role}') on conflict do nothing;
    insert into public.profiles(user_id,full_name) values(${uuid(person.id)},'Synthetic ${name}') on conflict(user_id) do nothing;`);
  if (person.company && person.role !== 'student') sql(`insert into public.company_members(company_id,user_id) values(${uuid(person.company)},${uuid(person.id)}) on conflict do nothing;`);
}
sql(`insert into public.students(id,company_id,user_id,full_name,email) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',${uuid(companyA)},${uuid(state.people.student.id)},'Synthetic Student','qa-student@self-service.invalid') on conflict(id) do nothing;
  insert into public.student_anamneses(id,student_id,company_id,notes) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc',${uuid(companyA)},'SYNTHETIC LEGACY RECORD - DO NOT REINTERPRET') on conflict(id) do nothing;
  notify pgrst, 'reload schema';`);
console.log('Five synthetic users authenticated with real local Auth. Tenant roles seeded; no external messages.');
