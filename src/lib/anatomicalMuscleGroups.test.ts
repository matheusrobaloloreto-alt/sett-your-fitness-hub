import { describe, expect, it } from "vitest";
import { canonicalAnatomicalMuscleGroup, isAnatomicalMuscleGroup } from "./anatomicalMuscleGroups";

describe("anatomical muscle-group allowlist", () => {
  it.each([
    ["Costas", "Dorsal"],
    ["Dorsal", "Dorsal"],
    ["Glúteos", "Glúteos"],
    ["Abdômen", "Abdômen"],
    ["Adutor Magno", "Adutores"],
    ["Reto Femoral", "Quadríceps"],
    ["Trapézio", "Trapezio"],
    ["Trapézio Inferior", "Trapezio"],
    ["Braquiorradial", "Antebraço"],
    ["Deltóide Frontal", "Deltoide Anterior"],
    ["Bíceps", "Biceps"],
    ["Tríceps", "Triceps"],
  ])("normaliza %s para %s", (input, expected) => {
    expect(canonicalAnatomicalMuscleGroup(input)).toBe(expected);
  });

  it.each([
    "Mobilidade", "Alongamento", "Core", "Ativação", "Funcionais",
    "Funcional", "Controle Motor", "Fisioterapia", "Performance", "Pliometria", "Base", "Geral",
    "Ombro", "Ombros", "Deltoide", "Lombar", "Manguito Rotador", "Tibial Anterior",
  ])("bloqueia categoria ou anatomia genérica/fora da allowlist: %s", (value) => {
    expect(isAnatomicalMuscleGroup(value)).toBe(false);
    expect(canonicalAnatomicalMuscleGroup(value)).toBeNull();
  });
});
