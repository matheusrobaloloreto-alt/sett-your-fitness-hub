import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const CONTAINER = process.env.SETT_DB_CONTAINER || "supabase_db_zshrcgbyhzxpnlccssyz";
const DATABASE = process.env.SETT_DB_NAME || "sett_renewal_qa_20260909";
if (CONTAINER !== "supabase_db_zshrcgbyhzxpnlccssyz") {
  throw new Error(`Refusing to run renewal concurrency canary against foreign container: ${CONTAINER}`);
}
if (!/^sett_renewal_qa_[a-zA-Z0-9_]+$/.test(DATABASE)) {
  throw new Error(`Refusing to run renewal concurrency canary against non-QA database: ${DATABASE}`);
}
const PSQL_ARGS = [
  "exec",
  "-i",
  CONTAINER,
  "psql",
  "-U",
  "postgres",
  "-d",
  DATABASE,
  "-v",
  "ON_ERROR_STOP=1",
  "-X",
  "-At",
];

const fixture = {
  staffId: "00000000-0000-4000-8000-00000000ca01",
  companyId: "00000000-0000-4000-8000-00000000cb01",
  studentId: "00000000-0000-4000-8000-00000000cc11",
  planId: "00000000-0000-4000-8000-00000000cd01",
  oldEnrollmentId: "00000000-0000-4000-8000-00000000ce01",
  oldCycleId: "00000000-0000-4000-8000-00000000cf01",
  oldWorkoutId: "00000000-0000-4000-8000-00000000cf11",
  paymentId: "00000000-0000-4000-8000-00000000cf21",
  slug: "renewal-concurrency-canary",
  email: "renewal-concurrency-staff@example.invalid",
  paymentProviderId: "pay_renewal_concurrency_canary",
};

function psql(sql, label) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", PSQL_ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${label || "psql"} failed with code ${code}\n${stderr}\n${stdout}`));
    });
    child.stdin.end(sql);
  });
}

function jsonResult(stdout, label) {
  const line = stdout.split(/\r?\n/).filter(Boolean).reverse().find((candidate) => {
    const trimmed = candidate.trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  });
  assert.ok(line, `${label} returned no output`);
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`${label} returned non-JSON output: ${line}\n${error.message}`);
  }
}

const claimsSql = (role = "authenticated") => `
select set_config('request.jwt.claims', jsonb_build_object('sub', '${fixture.staffId}', 'role', '${role}')::text, true);
select set_config('request.jwt.claim.sub', '${fixture.staffId}', true);
select set_config('request.jwt.claim.role', '${role}', true);
`;

const cleanupSql = `
begin;

do $$
begin
  if exists (
    select 1 from public.companies
    where id = '${fixture.companyId}'::uuid
      and slug is distinct from '${fixture.slug}'
  ) then
    raise exception 'renewal_concurrency_cleanup_company_id_not_owned';
  end if;

  if exists (
    select 1 from public.students
    where id = '${fixture.studentId}'::uuid
      and company_id is distinct from '${fixture.companyId}'::uuid
  ) then
    raise exception 'renewal_concurrency_cleanup_student_id_not_owned';
  end if;

  if exists (
    select 1 from public.payments
    where id = '${fixture.paymentId}'::uuid
      and (
        asaas_payment_id is distinct from '${fixture.paymentProviderId}'
        or company_id is distinct from '${fixture.companyId}'::uuid
        or student_id is distinct from '${fixture.studentId}'::uuid
      )
  ) then
    raise exception 'renewal_concurrency_cleanup_payment_id_not_owned';
  end if;
end;
$$;

delete from public.workouts
where company_id = '${fixture.companyId}'::uuid
  and (
    id = '${fixture.oldWorkoutId}'::uuid
    or cycle_id in (
      select id from public.training_cycles
      where company_id = '${fixture.companyId}'::uuid
        and student_id = '${fixture.studentId}'::uuid
    )
  );

delete from public.training_cycles
where company_id = '${fixture.companyId}'::uuid
  and student_id = '${fixture.studentId}'::uuid;

delete from public.payments
where id = '${fixture.paymentId}'::uuid
  and company_id = '${fixture.companyId}'::uuid
  and student_id = '${fixture.studentId}'::uuid
  and asaas_payment_id = '${fixture.paymentProviderId}';

delete from public.enrollments
where company_id = '${fixture.companyId}'::uuid
  and student_id = '${fixture.studentId}'::uuid;

delete from public.company_members
where company_id = '${fixture.companyId}'::uuid
  and user_id = '${fixture.staffId}'::uuid;

delete from public.user_roles
where user_id = '${fixture.staffId}'::uuid
  and exists (
    select 1 from auth.users
    where id = '${fixture.staffId}'::uuid
      and email = '${fixture.email}'
  );

delete from public.profiles
where user_id = '${fixture.staffId}'::uuid
  and exists (
    select 1 from auth.users
    where id = '${fixture.staffId}'::uuid
      and email = '${fixture.email}'
  );

delete from public.students
where id = '${fixture.studentId}'::uuid
  and company_id = '${fixture.companyId}'::uuid;

delete from public.plans
where id = '${fixture.planId}'::uuid
  and company_id = '${fixture.companyId}'::uuid;

delete from public.companies
where id = '${fixture.companyId}'::uuid
  and slug = '${fixture.slug}';

delete from auth.users
where id = '${fixture.staffId}'::uuid
  and email = '${fixture.email}';

commit;
`;

const setupSql = `
begin;

do $$
begin
  if to_regprocedure('public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date)') is null
    or to_regprocedure('public.replace_student_enrollment(uuid, uuid, uuid, uuid, date, boolean)') is null then
    raise exception 'renewal_concurrency_missing_renewal_rpcs';
  end if;

  if exists (select 1 from auth.users where id = '${fixture.staffId}'::uuid)
    or exists (select 1 from public.profiles where user_id = '${fixture.staffId}'::uuid)
    or exists (select 1 from public.user_roles where user_id = '${fixture.staffId}'::uuid)
    or exists (select 1 from public.companies where id = '${fixture.companyId}'::uuid or slug = '${fixture.slug}')
    or exists (select 1 from public.students where id = '${fixture.studentId}'::uuid)
    or exists (select 1 from public.plans where id = '${fixture.planId}'::uuid)
    or exists (select 1 from public.enrollments where id = '${fixture.oldEnrollmentId}'::uuid or student_id = '${fixture.studentId}'::uuid or company_id = '${fixture.companyId}'::uuid)
    or exists (select 1 from public.training_cycles where id = '${fixture.oldCycleId}'::uuid or student_id = '${fixture.studentId}'::uuid or company_id = '${fixture.companyId}'::uuid)
    or exists (select 1 from public.workouts where id = '${fixture.oldWorkoutId}'::uuid or company_id = '${fixture.companyId}'::uuid)
    or exists (select 1 from public.payments where id = '${fixture.paymentId}'::uuid or asaas_payment_id = '${fixture.paymentProviderId}') then
    raise exception 'renewal_concurrency_fixture_collision_refusing_initial_cleanup';
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('${fixture.staffId}'::uuid, 'authenticated', 'authenticated', '${fixture.email}', now(), now(), now());

insert into public.user_roles (user_id, role)
values ('${fixture.staffId}'::uuid, 'admin'::public.app_role);

insert into public.companies (id, name, slug, owner_id)
values ('${fixture.companyId}'::uuid, 'Renewal Concurrency Canary', '${fixture.slug}', '${fixture.staffId}'::uuid);

insert into public.company_members (company_id, user_id)
values ('${fixture.companyId}'::uuid, '${fixture.staffId}'::uuid);

insert into public.plans (
  id, company_id, name, price, duration_days, duration_weeks, cycle_duration_days, plan_kind, is_active
) values (
  '${fixture.planId}'::uuid, '${fixture.companyId}'::uuid, 'Synthetic Concurrency 28d Plan',
  100, 28, 4, 14, 'standard', true
);

insert into public.students (id, company_id, full_name, status, sales_stage, activated_at, assigned_trainer_id)
values (
  '${fixture.studentId}'::uuid, '${fixture.companyId}'::uuid, 'Synthetic Renewal Concurrency Student',
  'active', 'active', now(), null
);

insert into public.enrollments (
  id, company_id, student_id, plan_id, trainer_id, status, payment_status,
  start_date, end_date, training_start_date, cycle_duration_days, payment_date
) values (
  '${fixture.oldEnrollmentId}'::uuid, '${fixture.companyId}'::uuid, '${fixture.studentId}'::uuid,
  '${fixture.planId}'::uuid, null, 'active', 'paid',
  date '2026-08-01', date '2026-08-28', date '2026-08-01', 14, date '2026-08-01'
);

delete from public.training_cycles
where enrollment_id = '${fixture.oldEnrollmentId}'::uuid;

insert into public.training_cycles (
  id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date,
  duration_weeks, status, delivery_status, name
) values (
  '${fixture.oldCycleId}'::uuid, '${fixture.oldEnrollmentId}'::uuid, '${fixture.companyId}'::uuid,
  '${fixture.studentId}'::uuid, 1, date '2026-08-01', date '2026-08-28',
  4, 'completed', 'viewed', 'Old Published Concurrency Cycle'
);

insert into public.workouts (id, cycle_id, company_id, name, day_of_week, exercises, superseded_at)
values (
  '${fixture.oldWorkoutId}'::uuid, '${fixture.oldCycleId}'::uuid, '${fixture.companyId}'::uuid,
  'Old active workout', 1, '[{"name":"Agachamento","sets":3}]'::jsonb, null
);

insert into public.payments (
  id, student_id, company_id, plan_id, amount, value, status, asaas_payment_id,
  payment_method, billing_type, paid_at
) values (
  '${fixture.paymentId}'::uuid, '${fixture.studentId}'::uuid, '${fixture.companyId}'::uuid,
  '${fixture.planId}'::uuid, 100, 100, 'RECEIVED', '${fixture.paymentProviderId}',
  'PIX', 'PIX', now()
);

commit;
`;

const samePaymentSql = (tag) => `
begin;
${claimsSql("service_role")}
select jsonb_build_object(
  'tag', '${tag}',
  'result', to_jsonb(lifecycle)
)
from public.apply_paid_payment_lifecycle(
  '${fixture.studentId}'::uuid,
  '${fixture.companyId}'::uuid,
  '${fixture.planId}'::uuid,
  '${fixture.paymentProviderId}',
  date '2026-09-09',
  date '2026-09-14'
) lifecycle;
commit;
`;

const manualRenewalSql = (tag) => `
begin;
${claimsSql("authenticated")}
select jsonb_build_object(
  'tag', '${tag}',
  'result', to_jsonb(replacement)
)
from public.replace_student_enrollment(
  '${fixture.studentId}'::uuid,
  '${fixture.companyId}'::uuid,
  '${fixture.planId}'::uuid,
  null::uuid,
  date '2026-10-07',
  false
) replacement;
commit;
`;

const summarySql = `
select jsonb_build_object(
  'open_enrollments', coalesce((
    select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id)
    from (
      select id, status, payment_status, start_date, end_date, training_start_date, carried_over_cycle_id, created_at
      from public.enrollments
      where company_id = '${fixture.companyId}'::uuid
        and student_id = '${fixture.studentId}'::uuid
        and status in ('active', 'awaiting_training', 'awaiting_renewal')
    ) row_value
  ), '[]'::jsonb),
  'all_enrollments', coalesce((
    select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id)
    from (
      select id, status, payment_status, start_date, end_date, training_start_date, carried_over_cycle_id, created_at
      from public.enrollments
      where company_id = '${fixture.companyId}'::uuid
        and student_id = '${fixture.studentId}'::uuid
    ) row_value
  ), '[]'::jsonb),
  'payment', (
    select to_jsonb(row_value)
    from (
      select id, enrollment_id, lifecycle_enrollment_id, lifecycle_first_activation, lifecycle_applied_at
      from public.payments
      where id = '${fixture.paymentId}'::uuid
    ) row_value
  ),
  'active_cycles', coalesce((
    select jsonb_agg(to_jsonb(row_value) order by row_value.start_date, row_value.id)
    from (
      select id, enrollment_id, status, start_date, end_date
      from public.training_cycles
      where company_id = '${fixture.companyId}'::uuid
        and student_id = '${fixture.studentId}'::uuid
        and status = 'active'
    ) row_value
  ), '[]'::jsonb)
);
`;

function assertPaymentRace(results, summary) {
  const rows = results.map((item) => item.result);
  assert.equal(rows.length, 2, "same-payment race should return two rows");
  assert.ok(rows.every((row) => row?.enrollment_id), "same-payment race returned missing enrollment_id");
  assert.equal(
    new Set(rows.map((row) => row.enrollment_id)).size,
    1,
    "same-payment race created or returned different lifecycle enrollments",
  );
  assert.deepEqual(
    rows.map((row) => row.already_applied).sort(),
    [false, true],
    "same-payment race should have exactly one first application and one idempotent replay",
  );
  assert.equal(summary.payment?.enrollment_id, rows[0].enrollment_id, "payment enrollment_id drifted");
  assert.equal(summary.payment?.lifecycle_enrollment_id, rows[0].enrollment_id, "payment lifecycle snapshot drifted");
}

function assertManualRace(results, summary) {
  const rows = results.map((item) => item.result);
  assert.equal(rows.length, 2, "manual race should return two rows");
  assert.ok(rows.every((row) => row?.enrollment_id), "manual race returned missing enrollment_id");

  const open = summary.open_enrollments || [];
  assert.equal(open.length, 1, `manual race left ${open.length} open enrollments`);
  assert.equal(open[0].start_date, "2026-10-07", "manual race final enrollment start drifted");
  assert.equal(open[0].training_start_date, "2026-10-07", "manual race final training start drifted");
  assert.equal(open[0].end_date, "2026-11-03", "manual race accumulated/summed plan duration");
  assert.equal(open[0].payment_status, "paid", "manual race final enrollment is not paid");
  assert.equal(open[0].status, "active", "manual race final enrollment is not active");
  assert.ok(
    rows.some((row) => row.enrollment_id === open[0].id),
    "manual race final open enrollment was not returned by either concurrent call",
  );

  const openIds = new Set(open.map((row) => row.id));
  for (const enrollment of summary.all_enrollments || []) {
    if (!openIds.has(enrollment.id)) {
      assert.equal(
        enrollment.status,
        "completed",
        `manual race left historical enrollment ${enrollment.id} in ${enrollment.status}`,
      );
    }
  }
}

async function run() {
  console.log(`renewal-concurrency-canary: using docker container ${CONTAINER}, database ${DATABASE}`);
  let setupSucceeded = false;
  try {
    await psql(setupSql, "setup");
    setupSucceeded = true;

    const paymentRace = await Promise.all([
      psql(samePaymentSql("payment-a"), "same payment A").then((out) => jsonResult(out, "same payment A")),
      psql(samePaymentSql("payment-b"), "same payment B").then((out) => jsonResult(out, "same payment B")),
    ]);
    const afterPayment = jsonResult(await psql(summarySql, "summary after payment"), "summary after payment");
    assertPaymentRace(paymentRace, afterPayment);

    const manualRace = await Promise.all([
      psql(manualRenewalSql("manual-a"), "manual A").then((out) => jsonResult(out, "manual A")),
      psql(manualRenewalSql("manual-b"), "manual B").then((out) => jsonResult(out, "manual B")),
    ]);
    const afterManual = jsonResult(await psql(summarySql, "summary after manual"), "summary after manual");
    assertManualRace(manualRace, afterManual);

    console.log(JSON.stringify({
      renewal_concurrency_canary_passed: true,
      same_payment_results: paymentRace,
      manual_results: manualRace,
      final_open_enrollment: afterManual.open_enrollments[0],
    }, null, 2));
  } finally {
    if (setupSucceeded) {
      await psql(cleanupSql, "cleanup");
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
