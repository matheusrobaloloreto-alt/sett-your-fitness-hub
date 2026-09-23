import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agendaEventBelongsToTrainer, uniqueAgendaTrainerIds } from "@/lib/agendaOwnership";

const agendaSource = readFileSync("src/pages/admin/AdminAgenda.tsx", "utf8");

describe("agenda ownership", () => {
  it("combines assigned and enrollment trainers without duplicates", () => {
    expect(uniqueAgendaTrainerIds("trainer-a", "trainer-b", "trainer-a", null)).toEqual([
      "trainer-a",
      "trainer-b",
    ]);
  });

  it("matches only events from the authenticated trainer portfolio", () => {
    expect(agendaEventBelongsToTrainer(["trainer-a", "trainer-b"], "trainer-b")).toBe(true);
    expect(agendaEventBelongsToTrainer(["trainer-a"], "trainer-b")).toBe(false);
    expect(agendaEventBelongsToTrainer(["trainer-a"], null)).toBe(false);
  });

  it("wires the trainer-only Todos and Meus filter into every agenda surface", () => {
    expect(agendaSource).toContain('role === "trainer"');
    expect(agendaSource).toContain('setAgendaScope("mine")');
    expect(agendaSource).toContain("const visibleEvents = agendaScope === \"mine\"");
    expect(agendaSource).toContain("getEventsForDay = (day: Date) => visibleEvents.filter");
    expect(agendaSource).toContain("const sortedEvents = [...visibleEvents]");
  });
});
