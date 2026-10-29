import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {consumeValidatedAnamnesisInvite} from '../../supabase/functions/_shared/public-anamnesis-validation';
import {assertPublishedAnswers} from '../../supabase/functions/_shared/published-forms';
import {defaultFormDefinition,projectFormAnswers} from '../../supabase/functions/_shared/form-definitions';

describe("atomic anamnesis invite submission", () => {
  const edge = readFileSync("supabase/functions/public-anamnesis/index.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260814210000_atomic_anamnesis_invite_submit.sql",
    "utf8",
  );
  const app = readFileSync("src/App.tsx", "utf8");
  const publicForm = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");

  it("removes the obsolete public Studio actions", () => {
    const resolverOffset = edge.indexOf("await resolvePublicAnamnesisAccess(body");
    expect(resolverOffset).toBeGreaterThan(0);
    expect(edge).not.toContain('action === "studio_context"');
    expect(edge).not.toContain('action === "studio_submit"');
    expect(edge).not.toContain("body?.anamnese");
    expect(edge).toContain("assertInviteStudentTenant(access.invite, student)");
    expect(edge).toContain("companyId: access.invite.company_id");
    expect(edge).toContain("studentId: access.invite.student_id");
  });

  it("uses the same improved form for the real opaque-invite route", () => {
    expect(app).toContain('path="/anamnese-convite/:token"');
    expect(app).toContain('path="/anamnese-convite/:token" element={<RouteTransition><PublicAnamnesis />');
    expect(app).not.toContain("<StudioAnamnese />");
  });

  it("locks, tenant-checks and consumes a pending invite exactly once", () => {
    expect(migration).toContain("where token = _token\n  for update");
    expect(migration).toContain("invite_row.status <> 'pending'");
    expect(migration).toContain("invite_row.expires_at < now()");
    expect(migration).toContain("id = invite_row.student_id\n    and company_id = invite_row.company_id");
    expect(migration).toContain("and status = 'pending'");
    expect(migration).toContain("anamnesis invite already consumed");
  });

  it("keeps the atomic write private to the Edge Function service role", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(edge).toContain('supabase.rpc("submit_anamnesis_invite_atomic"');
  });

  it("validates invite submissions before the atomic consume callback", () => {
    const validationOffset = edge.indexOf("consumeValidatedAnamnesisInvite(");
    const versionedConsumeOffset = edge.indexOf("supabase.rpc('submit_versioned_initial_form'", validationOffset);
    const consumeOffset = edge.indexOf("submitInviteAtomic(token, studentPatch, studioPayload, buildInviteEffects(body))", validationOffset);
    expect(validationOffset).toBeGreaterThan(0);
    expect(versionedConsumeOffset).toBeGreaterThan(validationOffset);
    expect(consumeOffset).toBeGreaterThan(validationOffset);
    const publishedValidationOffset=edge.indexOf('assertPublishedAnswers(formDefinition,body.form_definition_id,body.versioned_answers)');
    const projectionOffset=edge.indexOf('Object.assign(body,projectFormAnswers(formDefinition.definition,body.versioned_answers))');
    expect(publishedValidationOffset).toBeGreaterThan(0);
    expect(projectionOffset).toBeGreaterThan(publishedValidationOffset);
    expect(validationOffset).toBeGreaterThan(projectionOffset);
    expect(edge).toContain("getCustomFields(student.company_id)");
  });

  it('does not reach either atomic consumer for invalid legacy or versioned clinical answers',async()=>{
    const consume=vi.fn();
    await expect(consumeValidatedAnamnesisInvite({objective:'Sintetico',custom_answers:{}},[],consume)).rejects.toThrow();
    const definition=defaultFormDefinition('initial');
    const form={id:'synthetic-version-1',version:1,definition};
    expect(()=>assertPublishedAnswers(form,'synthetic-version-2',{})).toThrow();
    expect(()=>assertPublishedAnswers(form,form.id,{objective:'Sintetico'})).toThrow();
    const canonical=projectFormAnswers(definition,{objective:'Sintetico',clin_chest_pain:'invalid'});
    await expect(consumeValidatedAnamnesisInvite(canonical,[],consume)).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  });

  it("persists pain and race effects before consuming the invite", () => {
    const effectsOffset = migration.indexOf("delete from public.student_body_limitations");
    const raceReadOffset = migration.indexOf("race_payload := _effects->'race'", effectsOffset);
    const goalDeleteOffset = migration.indexOf("delete from public.student_goals", raceReadOffset);
    const optionalRaceOffset = migration.indexOf("if race_payload is not null", raceReadOffset);
    const goalOffset = migration.indexOf("insert into public.student_goals", effectsOffset);
    const consumeOffset = migration.indexOf("update public.anamnese_invites", effectsOffset);
    expect(effectsOffset).toBeGreaterThan(0);
    expect(goalDeleteOffset).toBeGreaterThan(raceReadOffset);
    expect(optionalRaceOffset).toBeGreaterThan(goalDeleteOffset);
    expect(goalOffset).toBeGreaterThan(goalDeleteOffset);
    expect(migration.match(/delete from public\.student_goals/g)).toHaveLength(1);
    expect(consumeOffset).toBeGreaterThan(goalOffset);
    expect(migration).toContain("source = 'anamnese'");
    expect(migration).toContain("'articular'");
    expect(migration).toContain("'Cadastrada pela anamnese'");
    expect(migration).toContain("on conflict (student_id, region) do update");
    expect(edge).toContain("buildInviteEffects(body)");
    expect(edge).not.toContain("runStudioSideEffects");
    expect(publicForm).toContain("race_name: raceName || null");
    expect(publicForm).toContain("race_date: raceDate || null");
    expect(publicForm).toContain("a prova entra no calendário do seu acompanhamento");
  });
});
