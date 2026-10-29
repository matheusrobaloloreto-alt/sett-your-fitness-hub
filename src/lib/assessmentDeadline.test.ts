import { expect, it } from "vitest";
import { assessmentDeadline } from "../../supabase/functions/_shared/assessment-deadline";
it("uses company business days for the actual assessment deadline including a weekend", () => {
  const friday=new Date("2026-10-23T12:00:00Z");
  expect(assessmentDeadline(friday,2).toISOString()).toBe("2026-10-27T12:00:00.000Z");
  expect(assessmentDeadline(friday,5).toISOString()).toBe("2026-10-30T12:00:00.000Z");
  expect(friday.toISOString()).toBe("2026-10-23T12:00:00.000Z");
  expect(()=>assessmentDeadline(friday,0)).toThrow();
});
