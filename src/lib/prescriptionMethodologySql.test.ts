// Opt-in SQL fixture on a fresh owned postmaster; no shared database access.
// Execution is serialized by root. Importing this file does not start the runtime.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { generateTrainingProgram } from '../../supabase/functions/_shared/prescription/engine';
import { parseSettingsRecord } from '../../supabase/functions/_shared/company-product-settings';
it.skipIf(process.env.RUN_METHODOLOGY_SQL !== '1')('SQL save/reload consumes policy with auth/tenant/history/OCC guards and both validators reject bad fields', async () => {
  const runtimeModule = pathToFileURL(resolve(process.cwd(), 'scripts/qa/commercial-complete-runtime.mjs')).href;
  const { Runtime } = await import(/* @vite-ignore */ runtimeModule);
  const runtime = new Runtime();
  try {
    await runtime.start();
    const original = readFileSync('supabase/migrations/20261026092601_company_product_settings.sql', 'utf8');
    const forward = readFileSync('supabase/migrations/20261028090117_company_prescription_methodology.sql', 'utf8');
    const fixture = readFileSync('supabase/tests/company_product_settings_fixture.sql', 'utf8')
      .replace(/^\\ir .*$/m, () => original).replace(/^rollback;$/m, 'commit;');
    const patch = { prescription: { weekly_rules: [{ week: 1, phase: 'acumulacao', rir_min: 4, rir_max: 5, volume_percent: 50 }], allowed_methods: [], progression_mode: 'maintain', answer_mappings: [{ source_key: 'extra_goal', answer: 'Forte', target: 'objective', value: 'forca' }] } };
    const output = runtime.sql(fixture + forward + `
      set role authenticated;
      set test.auth_uid='00000000-0000-0000-0000-000000000001';
      select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','${JSON.stringify(patch)}',2);
      select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',2)$q$,'PT409');
      select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000020','{}',0)$q$,'42501');
      select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"prescription":{"weekly_rules":[{"week":1,"phase":"base","rir_min":0,"rir_max":4,"volume_percent":80}]}}',3)$q$,'22023');
      select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"prescription":{"answer_mappings":[{"source_key":"extra_x","answer":"x","target":"painEva","value":"0"}]}}',3)$q$,'22023');
      select 'METHODOLOGY:' || jsonb_build_object('version',version,'settings',settings)::text from public.company_product_settings where company_id='00000000-0000-0000-0000-000000000010';
      reset role;
      do $$ begin
        assert (select count(*)=3 from public.company_product_settings_history where company_id='00000000-0000-0000-0000-000000000010');
        assert (select not(settings->'prescription' ? 'weekly_rules') from public.company_product_settings_history where company_id='00000000-0000-0000-0000-000000000010' and version=1); -- the pre-migration historical snapshot stays unchanged
        assert not has_function_privilege('authenticated','public.validate_prescription_methodology_field(text,jsonb)','execute');
      end $$;
    `, { phase: 'methodology-save-reload-fixture' }).stdout;
    const record = parseSettingsRecord(JSON.parse(output.split('\n').find(line => line.startsWith('METHODOLOGY:'))!.slice('METHODOLOGY:'.length)));
    expect(record.version).toBe(3);
    expect(record.settings.prescription.answer_mappings).toEqual(patch.prescription.answer_mappings);
    const program = generateTrainingProgram({ companyPolicy: record.settings.prescription, catalog: [], fitnessLevel: 'iniciante', daysPerWeek: 3 });
    expect(program.weekly_periodization[0]).toMatchObject({ block: 'acumulacao', rir: '4-5', volume_percent: 50 });
    expect(program.engineMeta.company_policy?.beginner_max_weekly_sets).toBe(21);
  } finally {
    expect(runtime.cleanup().cleanup).toBe(true);
  }
}, 180000);
