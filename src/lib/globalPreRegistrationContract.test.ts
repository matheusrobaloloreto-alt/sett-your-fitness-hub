import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/App.tsx", "utf8");
const manager = readFileSync("src/pages/admin/AnamnesisManager.tsx", "utf8");
const publicForm = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
const registrationEdge = readFileSync("supabase/functions/public-registration/index.ts", "utf8");

describe("global first-contact anamnesis", () => {
  it("keeps an unprofiled public entry route", () => {
    expect(app).toContain('path="/anamnese" element={<RouteTransition><PublicAnamnesis mode="pre-registration" />');
    expect(app).toContain('path="/cadastro/:slug" element={<RouteTransition><PublicAnamnesis mode="pre-registration" />');
  });

  it("makes the global pre-registration link the first-contact action in admin", () => {
    expect(manager).toContain("preRegistrationUrl");
    expect(manager).toContain("Pré-cadastro global — primeiro contato");
    expect(manager).toContain("Atualizar anamnese de aluno existente");
    expect(manager).toContain("entra em Interessados");
  });

  it("creates an interested lead without requiring an existing student profile", () => {
    const start = registrationEdge.indexOf("async function preRegister");
    const end = registrationEdge.indexOf("async function preRegisterCanary", start);
    const handler = registrationEdge.slice(start, end);
    expect(handler).toContain('.from("leads")');
    expect(handler).toContain('stage: "interested"');
    expect(handler).not.toContain('.from("students")');
  });

  it("shows the real Edge Function response instead of the generic non-2xx text", () => {
    expect(publicForm).toContain('import { readEdgeError } from "@/lib/edgeError"');
    expect(publicForm).toContain("await readEdgeError(error, data)");
  });
});
