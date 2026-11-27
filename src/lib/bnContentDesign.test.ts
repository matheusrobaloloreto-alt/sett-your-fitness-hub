import { describe, expect, it, vi } from "vitest";
import { bnReferenceConflicts, mergeBnReferences, validateBnDesign, validateBnReferences } from "../../supabase/functions/_shared/bnContentDesign";
import { bnContentSpecSchema } from "./bnContentStudio";
import { BN_CONTENT_DEFAULT_SPEC } from "../../supabase/functions/_shared/bnContent";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("BN visual choices", () => {
  it("round trips new design options and keeps legacy specs valid", () => {
    expect(bnContentSpecSchema.safeParse(BN_CONTENT_DEFAULT_SPEC).success).toBe(true);
    const spec = { ...BN_CONTENT_DEFAULT_SPEC, design: { family: "visual", dimensions: "square", background: "#ffffff" }, references: [{ id: "ref-1", url: "https://www.instagram.com/p/example/", criteria: ["font"], design: { font: "sans" } }] };
    expect(bnContentSpecSchema.parse(spec)).toEqual(spec);
  });
  it.each([{ background: "red" }, { focusX: 101 }, { font: "http://font.example" }, { unknown: true }, { symbols: "x".repeat(101) }])("rejects unsupported design %j", value => {
    expect(validateBnDesign(value)).toBe(false);
  });
  it("combines only the criteria selected for each reference", () => {
    const refs = [{ id: "a", url: "", criteria: ["font" as const], design: { font: "serif" as const, background: "#ff0000" } }, { id: "b", url: "", criteria: ["background" as const], design: { background: "#ffffff", font: "sans" as const } }];
    expect(mergeBnReferences({ accent: "#123456" }, refs)).toEqual({ accent: "#123456", font: "serif", background: "#ffffff" });
    expect(bnReferenceConflicts(refs)).toEqual([]);
    const conflict = [...refs, { ...refs[0], id: "c" }];
    expect(bnReferenceConflicts(conflict)).toEqual(["font"]);
    expect(() => mergeBnReferences({}, conflict)).toThrow(/referência/);
  });
  it("rejects reference duplicates, credentials, and unsafe URL schemes", () => {
    for (const url of ["http://example.com", "https://user:password@example.com", "javascript:alert(1)"]) expect(validateBnReferences([{ id: "a", url, criteria: [] }])).toBe(false);
    expect(validateBnReferences([{ id: "a", url: "", criteria: [] }, { id: "a", url: "", criteria: [] }])).toBe(false);
  });
});
