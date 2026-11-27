export const BN_LAYOUT_FAMILIES = ["editorial", "visual", "didatico"] as const;
export const BN_DESIGN_FONTS = ["sans", "serif", "mixed"] as const;
export const BN_REFERENCE_CRITERIA = ["font", "textColor", "align", "position", "imageArea", "background", "emphasis", "dimensions", "symbols"] as const;
export type BnReferenceCriterion = typeof BN_REFERENCE_CRITERIA[number];
export interface BnDesign {
  family?: typeof BN_LAYOUT_FAMILIES[number];
  font?: typeof BN_DESIGN_FONTS[number];
  background?: string;
  textColor?: string;
  accent?: string;
  align?: "left" | "center" | "right";
  position?: "top" | "center" | "bottom";
  imageArea?: "background" | "right" | "top" | "none";
  focusX?: number;
  focusY?: number;
  dimensions?: "portrait" | "square" | "story";
  symbols?: string;
}
export interface BnReference {
  id: string;
  url: string;
  criteria: BnReferenceCriterion[];
  asset_path?: string;
  design?: BnDesign;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateBnDesign(value: unknown): value is BnDesign {
  if (!record(value)) return false;
  const options: Record<string, readonly unknown[]> = {
    family: BN_LAYOUT_FAMILIES, font: BN_DESIGN_FONTS,
    align: ["left", "center", "right"], position: ["top", "center", "bottom"],
    imageArea: ["background", "right", "top", "none"], dimensions: ["portrait", "square", "story"],
  };
  return Object.entries(value).every(([key, item]) => {
    if (options[key]) return options[key].includes(item);
    if (["background", "textColor", "accent"].includes(key)) return typeof item === "string" && /^#[0-9a-f]{6}$/i.test(item);
    if (["focusX", "focusY"].includes(key)) return typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 100;
    return key === "symbols" && typeof item === "string" && item.length <= 100 && !item.includes("\0");
  });
}
export function validateBnReferences(value: unknown): value is BnReference[] {
  return Array.isArray(value) && value.length <= 8 && value.every(ref => {
    if (!record(ref) || !Object.keys(ref).every(key => ["id", "url", "criteria", "asset_path", "design"].includes(key))) return false;
    if (typeof ref.id !== "string" || !/^[\w-]{1,64}$/.test(ref.id) || typeof ref.url !== "string" || ref.url.length > 2000) return false;
    if (ref.url) {
      try { const url = new URL(ref.url); if (url.protocol !== "https:" || url.username || url.password) return false; } catch { return false; }
    }
    return Array.isArray(ref.criteria) && ref.criteria.length <= 9 && new Set(ref.criteria).size === ref.criteria.length && ref.criteria.every(c => (BN_REFERENCE_CRITERIA as readonly unknown[]).includes(c)) && (ref.design === undefined || validateBnDesign(ref.design)) && (ref.asset_path === undefined || typeof ref.asset_path === "string");
  }) && new Set(value.map(ref => ref.id)).size === value.length;
}
export function bnReferenceConflicts(refs: BnReference[]): BnReferenceCriterion[] {
  return BN_REFERENCE_CRITERIA.filter(key => refs.filter(ref => ref.criteria.includes(key)).length > 1);
}
export function mergeBnReferences(design: BnDesign, refs: BnReference[]): BnDesign {
  if (bnReferenceConflicts(refs).length) throw new Error("Escolha uma referência por critério antes de aplicar.");
  const next = { ...design };
  for (const ref of refs) for (const key of ref.criteria) {
    if (!ref.design) continue;
    if (key === "emphasis") { if (ref.design.accent) next.accent = ref.design.accent; }
    else if (key === "position") { if (ref.design.position) next.position = ref.design.position; }
    else if (ref.design[key] !== undefined) Object.assign(next, { [key]: ref.design[key] });
  }
  return next;
}
