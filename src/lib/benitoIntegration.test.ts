import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readProjectFile = (path: string) => readFileSync(resolve(root, path), "utf8");

function extractClassNameAfter(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const match = source.slice(start).match(/className="([^"]+)"/);
  expect(match?.[1]).toBeTruthy();
  return match?.[1] ?? "";
}

function restingChromeTokens(className: string): string[] {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !token.startsWith("focus-visible:"))
    .filter((token) =>
      token === "border"
      || token.startsWith("border-")
      || token === "rounded-full"
      || token.startsWith("bg-")
      || token.startsWith("ring-")
      || token.startsWith("shadow"),
    );
}

describe("Benito assistant integration", () => {
  it("uses the animated sprite in professor and student assistant avatars", () => {
    const professor = readProjectFile("src/components/BnitoFloatingAssistant.tsx");
    const student = readProjectFile("src/components/StudentBnitoAssistant.tsx");

    expect(professor).toContain('from "@/components/BenitoSprite"');
    expect(student).toContain('from "@/components/BenitoSprite"');
    expect(professor.match(/<BenitoSprite\b/g)?.length).toBeGreaterThanOrEqual(3);
    expect(student.match(/<BenitoSprite\b/g)?.length).toBeGreaterThanOrEqual(3);
    expect(professor).not.toContain("<BrainCircuit");
    expect(student).not.toContain("<BrainCircuit");
    expect(student).toContain('requiresTeamHandoff || responseUrgency === "parar_e_avisar"');
    expect(student).toContain('mission && !missionDismissed && mission.urgency === "parar_e_avisar"');
  });

  it("keeps professor and student floating Benito buttons chromeless at rest", () => {
    const professor = readProjectFile("src/components/BnitoFloatingAssistant.tsx");
    const student = readProjectFile("src/components/StudentBnitoAssistant.tsx");
    const professorFab = extractClassNameAfter(professor, 'data-benito-fab="professor"');
    const studentFab = extractClassNameAfter(student, 'data-benito-fab="student"');

    expect(professorFab).toContain("h-[76px] w-[76px]");
    expect(studentFab).toContain("h-[76px] w-[76px]");
    expect(restingChromeTokens(professorFab)).toEqual([]);
    expect(restingChromeTokens(studentFab)).toEqual([]);
    expect(professorFab).toContain("focus-visible:outline");
    expect(studentFab).toContain("focus-visible:outline");
    expect(professor).not.toContain('rounded-full border border-white/45 bg-white/10');
    expect(student).not.toContain('rounded-full border border-white/45 bg-white/10');
    expect(professor).not.toContain('rounded-full bg-navy text-primary-foreground shadow-md');
    expect(student).not.toContain('rounded-full bg-navy text-primary-foreground shadow-md');
    expect(student).not.toContain('rounded-full bg-navy text-primary-foreground">\n                  <BenitoSprite');
    expect(professor).toContain('size={60} alt="" className="benito-sprite-prominent"');
    expect(student).toContain('size={60} alt="" className="benito-sprite-prominent"');
  });

  it("preserves floating Benito accessibility, drag behavior, and sprite fallback path", () => {
    const professor = readProjectFile("src/components/BnitoFloatingAssistant.tsx");
    const student = readProjectFile("src/components/StudentBnitoAssistant.tsx");
    const sprite = readProjectFile("src/components/BenitoSprite.tsx");

    expect(professor).toContain("aria-label={`Abrir ${name}`}");
    expect(student).toContain("aria-label={`Abrir ${name}`}");
    expect(professor).toContain("onPointerDown={startDrag}");
    expect(professor).toContain('window.addEventListener("pointermove", handlePointerMove');
    expect(student).toContain('from "@/lib/useBenitoDrag"');
    expect(student).toContain("onPointerDown={startDrag}");
    expect(student).toContain("consumeDragGesture()");
    expect(sprite).toContain("data-benito-fallback");
    expect(sprite).toContain("<BrainCircuit");
  });

  it("packages the same validated v2 atlas used by the React renderer", () => {
    const packageDir = resolve(root, "public/pets/benito-v2");
    const manifestPath = resolve(packageDir, "pet.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      id?: string;
      spriteVersionNumber?: number;
      spritesheetPath?: string;
      compactSpritesheetPath?: string;
      compactMaxDisplayWidth?: number;
    };

    expect(manifest).toMatchObject({
      id: "benito",
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
      compactSpritesheetPath: "spritesheet-compact.webp",
      compactMaxDisplayWidth: 48,
    });
    const canonicalAtlas = resolve(packageDir, manifest.spritesheetPath || "");
    const compactAtlas = resolve(packageDir, manifest.compactSpritesheetPath || "");
    expect(existsSync(canonicalAtlas)).toBe(true);
    expect(existsSync(compactAtlas)).toBe(true);
    expect(createHash("sha256").update(readFileSync(canonicalAtlas)).digest("hex")).toBe(
      "d146d3dbd2022cfbcf56d5d2c6c85e52337f65773237060140a7ee1489a02b9f",
    );
    expect(createHash("sha256").update(readFileSync(compactAtlas)).digest("hex")).toBe(
      "66727a726f8f078cd1827c78ce331c0e47925f77dc089ff7ee472ee7ba1c20d1",
    );
  });
});
