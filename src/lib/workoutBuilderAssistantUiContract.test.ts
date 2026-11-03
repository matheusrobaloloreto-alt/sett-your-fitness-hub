import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const workoutBuilder = readFileSync(
  `${process.cwd()}/src/pages/admin/WorkoutBuilder.tsx`,
  "utf8",
);
const appLayout = readFileSync(
  `${process.cwd()}/src/components/AppLayout.tsx`,
  "utf8",
);
const whatsappPanel = readFileSync(
  `${process.cwd()}/src/components/WhatsAppChatPanel.tsx`,
  "utf8",
);

// Evaluate the actual picker guard, allowing equivalent boolean expressions/order.
function pickerDisabledGuard(): ts.Expression {
  const source = ts.createSourceFile("WorkoutBuilder.tsx", workoutBuilder, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const guards: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const click = attributes.find(attribute => attribute.name.getText(source) === "onClick")?.initializer;
      if (click && ts.isJsxExpression(click) && click.expression && ts.isArrowFunction(click.expression)
        && ts.isCallExpression(click.expression.body) && ts.isIdentifier(click.expression.body.expression)
        && click.expression.body.expression.text === "addExercise") {
        const disabled = attributes.find(attribute => attribute.name.getText(source) === "disabled")?.initializer;
        if (disabled && ts.isJsxExpression(disabled) && disabled.expression) guards.push(disabled.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(guards).toHaveLength(1);
  return guards[0];
}

function evaluateGuard(expression: ts.Expression, scope: Record<string, unknown>): unknown {
  if (ts.isParenthesizedExpression(expression)) return evaluateGuard(expression.expression, scope);
  if (ts.isIdentifier(expression) && Object.hasOwn(scope, expression.text)) return scope[expression.text];
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    return !evaluateGuard(expression.operand, scope);
  }
  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return evaluateGuard(expression.left, scope) || evaluateGuard(expression.right, scope);
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return evaluateGuard(expression.left, scope) && evaluateGuard(expression.right, scope);
    }
  }
  throw new Error("Review unsupported picker guard expression before changing this contract");
}

describe("WorkoutBuilder assistant and header UX contract", () => {
  it("keeps the dedicated audit without duplicating the floating assistant", () => {
    expect(workoutBuilder).toContain("Auditar treino");
    expect(workoutBuilder).toMatch(/<BenitoSprite\s+state=\{bnitoLoading === "review" \? "processing" : "review"\}/);
    expect(workoutBuilder).not.toContain("Pergunta técnica");
    expect(workoutBuilder).not.toContain("Perguntar ao {assistantName}");
    expect(workoutBuilder).not.toContain('onClick={() => callBnito("ask")}');
  });

  it("does not render a second named assistant action in the page header", () => {
    expect(workoutBuilder).not.toContain('onClick={() => callBnito("review")}');
    expect(appLayout).toContain("isWorkoutBuilder");
    expect(appLayout).toMatch(/!isWorkoutBuilder\s*&&/);
  });

  it("uses a responsive full-width header layout with unclipped identity and actions", () => {
    expect(workoutBuilder).toContain('data-testid="workout-builder-header"');
    expect(workoutBuilder).toContain('data-testid="workout-builder-header-actions"');
    expect(workoutBuilder).toContain("min-w-0");
    expect(workoutBuilder).toContain("justify-self-end");
    expect(workoutBuilder).not.toContain("<MessageSquare");
    expect(whatsappPanel).not.toContain("isWorkoutBuilder");
    expect(workoutBuilder).toContain('data-testid="bnito-audit-sprite-clip"');
    expect(workoutBuilder).toContain("overflow-hidden");
  });

  it("surfaces save blockers in the page before the atomic workout revision RPC", () => {
    expect(workoutBuilder).toContain("ensureWorkoutLibraryReferences");
    expect(workoutBuilder).toContain("issuesFromPrescriptionValidation");
    expect(workoutBuilder).toContain('data-testid="workout-save-gate-panel"');
    expect(workoutBuilder).toContain("focusSaveIssue");
    expect(workoutBuilder).toContain("saveCycleWorkoutRevision(supabase as any");
    expect(workoutBuilder.indexOf("ensureWorkoutLibraryReferences")).toBeLessThan(workoutBuilder.indexOf("saveCycleWorkoutRevision(supabase as any"));
  });

  it("lets the server prove persisted legacy exercises instead of trusting the client", () => {
    expect(workoutBuilder).toContain("cycle_id: cycleId");
    expect(workoutBuilder).not.toContain("legacy_exercise_ids:");
  });

  it("keeps the workout editor locked during the async save window", () => {
    expect(workoutBuilder).toContain("workoutRevisionPayload(draftWorkouts, weeklyPrescriptionMode, weeklyUiVersion)");
    expect(workoutBuilder).toContain("workoutsWithSavedRows(draftWorkouts, saved)");
    expect(workoutBuilder).not.toContain("setWorkouts(draftWorkouts.map");
    expect(workoutBuilder).toContain("disabled={saving || workouts.length === 0}");
    expect(workoutBuilder).toContain("onClick={addWorkout} disabled={saving}");
    expect(workoutBuilder).toContain("onClick={() => setLibraryOpen(true)} disabled={saving}");
    expect(workoutBuilder).toContain("disabled={saving || exIdx === 0}");

  });

  it("blocks picker additions during save, for duplicates, or without a destination", () => {
    const guard = pickerDisabledGuard();
    const cases = [
      { saving: false, alreadyAdded: false, hasTarget: true, disabled: false },
      { saving: false, alreadyAdded: false, hasTarget: false, disabled: true },
      { saving: false, alreadyAdded: true, hasTarget: true, disabled: true },
      { saving: false, alreadyAdded: true, hasTarget: false, disabled: true },
      { saving: true, alreadyAdded: false, hasTarget: true, disabled: true },
      { saving: true, alreadyAdded: false, hasTarget: false, disabled: true },
      { saving: true, alreadyAdded: true, hasTarget: true, disabled: true },
      { saving: true, alreadyAdded: true, hasTarget: false, disabled: true },
    ];
    for (const row of cases) {
      const actual = evaluateGuard(guard, {
        saving: row.saving, alreadyAdded: row.alreadyAdded,
        currentWorkout: row.hasTarget ? { clientKey: "destination-b" } : null,
      });
      expect(Boolean(actual), JSON.stringify(row)).toBe(row.disabled);
    }
  });

  it("does not migrate already prescribed legacy workouts to weekly data", () => {
    expect(workoutBuilder).toContain("weeklyPrescriptionModeForLoadedWorkouts(loaded)");
    expect(workoutBuilder).toContain("individualWeeklyUiVersionForLoadedWorkouts(loaded)");
    expect(workoutBuilder).toContain('weeklyPrescriptionMode === "weekly"');
    expect(workoutBuilder).toContain("serializeWeeklyExercise(");
    expect(workoutBuilder).toContain("individualWeeklyUiVersionForExercise(ex, weeklyPrescriptionMode)");
    expect(workoutBuilder).toContain("return exercise;");
  });

  it("shows a single complete metric editor only for new weekly prescriptions", () => {
    expect(workoutBuilder).toContain("!usesLatestWeeklyLayout");
    expect(workoutBuilder).toContain("Tipos de séries");
    expect(workoutBuilder).toContain("Cadência");
    expect(workoutBuilder).toContain('placeholder="2020"');
    expect(workoutBuilder).toContain("updateWeeklySetTypes");
  });
});
