import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/App.tsx", "utf8");
const manager = readFileSync("src/pages/admin/AnamnesisManager.tsx", "utf8");
const registrationManager = readFileSync("src/pages/admin/RegistrationManager.tsx", "utf8");
const studentsManager = readFileSync("src/pages/admin/StudentsManager.tsx", "utf8");
const formFieldEditor = readFileSync("src/components/FormFieldEditor.tsx", "utf8");
const publicForm = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
const registrationEdge = readFileSync("supabase/functions/public-registration/index.ts", "utf8");

describe("global first-contact anamnesis", () => {
  it("keeps an unprofiled public entry route", () => {
    expect(app).toContain('path="/anamnese" element={<Navigate to="/cadastro/bn-performance-training" replace />}');
    expect(app).toContain('path="/cadastro" element={<Navigate to="/cadastro/bn-performance-training" replace />}');
    expect(app).toContain('path="/inscricao" element={<Navigate to="/cadastro/bn-performance-training" replace />}');
    expect(app).toContain('path="/cadastro/:slug" element={<RouteTransition><PublicAnamnesis mode="pre-registration" />');
  });

  it("makes the global pre-registration link the first-contact action in admin", () => {
    expect(manager).toContain("preRegistrationUrl");
    expect(manager).toContain("Pré-cadastro global — primeiro contato");
    expect(manager).toContain("Atualizar anamnese de aluno existente");
    expect(manager).toContain("entra em Interessados");
    expect(manager).toContain("disabled={!companySlug}");
    expect(registrationManager).toContain("if (!generalLink)");
    expect(registrationManager).toContain("disabled={!generalLink}");
    expect(studentsManager).toContain("Empresa sem slug público configurado");
    expect(formFieldEditor).toContain("O primeiro contato usa o pré-cadastro global");
    expect(formFieldEditor).not.toContain("O link da anamnese é individual por aluno");
  });

  it("creates an interested lead without requiring an existing student profile", () => {
    const start = registrationEdge.indexOf("async function preRegister");
    const end = registrationEdge.indexOf("async function preRegisterCanary", start);
    const handler = registrationEdge.slice(start, end);
    expect(handler).toContain('.from("leads")');
    expect(handler).toContain('stage: "interested"');
    expect(handler).not.toContain('.from("students")');
  });

  it("fails closed when a public request omits both company id and slug", () => {
    const resolverStart = registrationEdge.indexOf("async function resolveCompany");
    const resolverEnd = registrationEdge.indexOf("async function resolveCompanyById", resolverStart);
    const resolver = registrationEdge.slice(resolverStart, resolverEnd);
    expect(resolver).toContain("if (!slug) return null");
    expect(resolver).not.toContain('.order("created_at"');
  });

  it("shows the real Edge Function response instead of the generic non-2xx text", () => {
    expect(publicForm).toContain('import { readEdgeError } from "@/lib/edgeError"');
    expect(publicForm).toContain("await readEdgeError(error, data)");
  });
});
