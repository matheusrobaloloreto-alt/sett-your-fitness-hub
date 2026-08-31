import { describe, expect, it } from "vitest";
import { canonicalAnatomicalMuscleGroup, isAnatomicalMuscleGroup } from "./anatomicalMuscleGroups";

describe("anatomical muscle-group allowlist", () => {
  it.each([
    ["Costas", "Dorsal"],
    ["Dorsal", "Dorsal"],
    ["Glúteos", "Glúteo"],
    ["Abdômen", "Abdominais"],
    ["Adutor Magno", "Adutor Magno"],
    ["Reto Femoral", "Reto Femoral"],
    ["Trapézio Inferior", "Trapézio Inferior"],
    ["Braquiorradial", "Braquiorradial"],
    ["Manguito Rotador", "Manguito"],
  ])("normaliza %s para %s", (input, expected) => {
    expect(canonicalAnatomicalMuscleGroup(input)).toBe(expected);
  });

  it.each([
    "Mobilidade", "Alongamento", "Core", "Ativação", "Funcionais",
    "Funcional", "Controle Motor", "Fisioterapia", "Performance", "Pliometria", "Base", "Geral",
  ])("bloqueia categoria não anatômica: %s", (value) => {
    expect(isAnatomicalMuscleGroup(value)).toBe(false);
    expect(canonicalAnatomicalMuscleGroup(value)).toBeNull();
  });
});
