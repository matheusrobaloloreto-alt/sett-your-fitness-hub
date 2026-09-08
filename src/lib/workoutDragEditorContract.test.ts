import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("workout drag/drop editor contracts", () => {
  it("keeps PrescriptionStudio ordering on workout-order units, not raw exercise rows", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");

    expect(studio).toContain("buildWorkoutOrderUnits(w.exercises || [])");
    expect(studio).toContain("moveWorkoutOrderUnit(exercises, fromUnitIndex, toUnitIndex)");
    expect(studio).toContain("moveWorkoutOrderUnitByExerciseIndex(exercises, exerciseIndex, direction)");
    expect(studio).toContain("data-workout-drop-index={unitIndex}");
    expect(studio).toContain("dropZone(unitIndex + 1)");
    expect(studio).toContain("Arrastar bloco de método sem separar exercícios");
    expect(studio).toContain("aria-roledescription=\"alça de arrastar\"");
    expect(studio).toContain("onPointerDown={(event) =>");
    expect(studio).toContain("handleExercisePointerMove(event, wi)");
    expect(studio).toContain("scrollExerciseDragViewport(event.clientY)");
  });

  it("keeps WorkoutBuilder arrows and drag/drop on the same block-aware helper", () => {
    const builder = source("src/pages/admin/WorkoutBuilder.tsx");

    expect(builder).toContain("moveWorkoutOrderUnitByExerciseIndex(w.exercises, exIdx, direction)");
    expect(builder).toContain("moveWorkoutOrderUnit(w.exercises, fromUnitIndex, toUnitIndex)");
    expect(builder).toContain("data-workout-builder-drop-index={unitIndex}");
    expect(builder).toContain("dropZone(unitIndex + 1)");
    expect(builder).toContain("Arrastar bloco de método sem separar exercícios");
    expect(builder).toContain("dragWorkoutPointerRef.current = { wIdx, unitIndex, targetIndex: unitIndex }");
    expect(builder).toContain("handleWorkoutPointerMove(event, wIdx)");
    expect(builder).toContain("scrollWorkoutDragViewport(event.clientY)");
  });

  it("does not introduce generation or publication side effects into manual ordering helpers", () => {
    const studio = source("src/pages/admin/PrescriptionStudio.tsx");
    const builder = source("src/pages/admin/WorkoutBuilder.tsx");
    const helper = source("src/lib/workoutOrder.ts");
    const studioMoveBody = studio.slice(studio.indexOf("const moveExerciseTo"), studio.indexOf("const addExercise"));
    const builderMoveBody = builder.slice(builder.indexOf("const moveExercise ="), builder.indexOf("const handleSaveAll"));
    const combined = `${studioMoveBody}\n${builderMoveBody}`;

    expect(combined).not.toMatch(/publishStrengthPlanToStudent|publishToStudent|generateAllPDFs|generateAssessmentPDF|setGenerating|status\.generating/);
    expect(combined).toMatch(/moveWorkoutOrderUnit/);
    expect(helper).toContain("exercise_order: index + 1");
  });

  it("imports workout-library templates as local drafts without materializing them immediately", () => {
    const builder = source("src/pages/admin/WorkoutBuilder.tsx");
    const draftHelper = source("src/lib/workoutTemplateDraft.ts");
    const schema = source("supabase/migrations/20260815062126_remove_legacy_same_company_student_leaks.sql");

    expect(builder).toContain("Usar treino da biblioteca");
    expect(builder).toContain(".eq(\"company_id\", templateCompanyId)");
    expect(builder).not.toContain("company_id.is.null");
    expect(builder).not.toContain("Template global");
    expect(builder).not.toContain("ou global");
    expect(builder).toContain("buildWorkoutTemplateDraft");
    expect(builder).toContain("Substituir treino atual");
    expect(builder).toContain("Adicionar como novo treino");
    expect(builder).toContain("Nada foi persistido; só salva ao clicar em Salvar Tudo.");
    expect(builder).not.toContain("sendTemplateToStudent");
    expect(builder).not.toContain("apply_workout_template_to_current_cycle");
    expect(draftHelper).toContain("cross_tenant_template");
    expect(draftHelper).toContain("missing_template_company");
    expect(draftHelper).toContain("exercise_not_visible");
    expect(schema).toContain("company_id uuid not null references public.companies(id)");
  });
});
