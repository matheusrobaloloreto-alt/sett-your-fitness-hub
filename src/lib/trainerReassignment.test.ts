import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914163000_reassign_student_trainer.sql", "utf8");
const portfolio = readFileSync("src/pages/admin/Portfolio.tsx", "utf8");

describe("student trainer reassignment hotfix", () => {
  it("keeps the operation server-side and tenant-derived", () => {
    expect(migration).toContain("public.reassign_student_trainer");
    expect(migration).toContain("_student_id uuid");
    expect(migration).toContain("_trainer_id uuid");
    expect(migration).toContain("_expected_trainer_id uuid");
    const signature = migration.slice(
      migration.indexOf("create or replace function public.reassign_student_trainer("),
      migration.indexOf("returns table"),
    );
    expect(signature).not.toContain("_company_id");
    expect(migration).toContain("from public.students s");
    expect(migration).toContain("where s.id = _student_id");
    expect(migration).toContain("for update");
  });

  it("authorizes only master, admin or coordinator staff", () => {
    expect(migration).toContain("public.has_role(v_actor, 'master'::public.app_role)");
    expect(migration).toContain("public.is_company_staff(v_actor, v_company_id)");
    expect(migration).toContain("public.has_role(v_actor, 'admin'::public.app_role)");
    expect(migration).toContain("public.has_role(v_actor, 'coordinator'::public.app_role)");
    expect(migration).not.toContain("public.has_role(v_actor, 'trainer'::public.app_role)");
  });

  it("requires an eligible trainer in the same company", () => {
    expect(migration).toContain("from public.company_members cm");
    expect(migration).toContain("cm.company_id = v_company_id");
    expect(migration).toContain("cm.user_id = _trainer_id");
    expect(migration).toContain("ur.role = 'trainer'::public.app_role");
    expect(migration).toContain("Destination trainer is not active in this company");
  });

  it("updates student and operational enrollments in one RPC", () => {
    expect(migration).toContain("drop function if exists public.reassign_student_trainer(uuid, uuid)");
    expect(migration).toContain("update public.students as s");
    expect(migration).toContain("assigned_trainer_id = _trainer_id");
    expect(migration).toContain("where s.id = _student_id");
    expect(migration).toContain("update public.enrollments as e");
    expect(migration).toContain("trainer_id = _trainer_id");
    expect(migration).toContain("where e.student_id = _student_id");
    expect(migration).toContain("and e.company_id = v_company_id");
    expect(migration).toContain("'active', 'awaiting_training', 'awaiting_renewal', 'trial'");
  });

  it("rejects stale dialogs before changing assignment", () => {
    expect(migration).toContain("v_previous_trainer_id is distinct from _expected_trainer_id");
    expect(migration).toContain("Student assignment changed; reload before reassigning");
    expect(portfolio).toContain("transferScope.companyId !== effectiveCompanyId");
    expect(portfolio).toContain("transferScope.trainerId !== selectedId");
    expect(portfolio).toContain("currentScopeRef.current.companyId !== scopeAtConfirm.companyId");
    expect(portfolio).toContain("currentScopeRef.current.trainerId !== scopeAtConfirm.trainerId");
    expect(portfolio).toContain("_expected_trainer_id: transferStudent.assigned_trainer_id || null");
    expect(portfolio).toContain("safeTrainerReassignmentFailureMessage(error.message)");
    expect(portfolio).not.toContain('title: "Troca não realizada", description: error.message');
  });

  it("wires the carteira inline action to the RPC with confirmation copy", () => {
    expect(portfolio).toContain("Trocar professor");
    expect(portfolio).toContain("UserRoundCog");
    expect(portfolio).toContain('rpc("reassign_student_trainer"');
    expect(portfolio).toContain("Histórico, ciclos, treinos, pagamentos e conversas serão preservados.");
    expect(portfolio).toContain('roles.includes("trainer")');
    expect(portfolio).toContain("currentScopeRef.current.companyId !== companyIdAtRequest");
    expect(portfolio).toContain("loadSeqRef.current !== requestId");
    expect(portfolio).toContain("await load()");
  });

  it("wires bulk selection, confirmation, partial results and retry in carteira", () => {
    expect(portfolio).toContain("bulkSelectedIds");
    expect(portfolio).toContain("bulkInteractionLocked");
    expect(portfolio).toContain("handleSelectedTrainerChange");
    expect(portfolio).toContain("if (bulkInteractionLocked) return");
    expect(portfolio).toContain("visibleSelectedTrainerReassignmentStudents(eligibleFilteredStudents, bulkSelectedIds)");
    expect(portfolio).toContain("pruneTrainerReassignmentSelection(current, eligibleFilteredStudents)");
    expect(portfolio).toContain("Selecionar filtrados");
    expect(portfolio).toContain("Aluno inativo não entra na troca em massa");
    expect(portfolio).toContain("Trocar professor em massa");
    expect(portfolio).toContain("window.confirm");
    expect(portfolio).toContain("Confirmar troca");
    expect(portfolio).toContain("Cancelar");
    expect(portfolio).toContain("reassignStudentsWithLimit");
    expect(portfolio).toContain("Resultado:");
    expect(portfolio).toContain("Tentar apenas falhas");
    expect(portfolio).toContain("_expected_trainer_id");
    expect(portfolio).toContain("currentScopeRef.current");
    expect(portfolio).toContain("disabled={bulkInteractionLocked}");
    expect(portfolio).toContain("disabled={bulkInteractionLocked || eligibleFilteredStudents.length === 0}");
    expect(portfolio).toContain("disabled={bulkInteractionLocked || selectedBulkStudents.length === 0}");
    expect(portfolio).not.toContain("({failure.student.id})");
    expect(portfolio).toContain('failure.student.full_name || "Aluno selecionado"');
  });
});
