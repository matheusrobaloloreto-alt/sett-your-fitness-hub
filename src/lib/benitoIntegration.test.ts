import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readProjectFile = (path: string) => readFileSync(resolve(root, path), "utf8");

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

  it("packages the same validated v2 atlas used by the React renderer", () => {
    const packageDir = resolve(root, "public/pets/benito-v2");
    const manifestPath = resolve(packageDir, "pet.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      id?: string;
      spriteVersionNumber?: number;
      spritesheetPath?: string;
    };

    expect(manifest).toMatchObject({
      id: "benito",
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
    });
    expect(existsSync(resolve(packageDir, manifest.spritesheetPath || ""))).toBe(true);
  });
});
