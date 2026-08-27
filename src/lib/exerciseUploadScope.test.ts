import { describe, expect, it } from "vitest";
import { resolveExerciseUploadScope } from "./exerciseUploadScope";

describe("resolveExerciseUploadScope", () => {
  it("faz novos uploads do painel master virarem base global", () => {
    expect(resolveExerciseUploadScope({
      isMaster: true,
      isEditing: false,
      existingIsGlobal: false,
      effectiveCompanyId: "tenant-viewed",
      companyId: null,
    })).toEqual({ is_global: true, company_id: null, storage_scope: "global" });
  });

  it("não promove silenciosamente um exercício privado que já existe", () => {
    expect(resolveExerciseUploadScope({
      isMaster: true,
      isEditing: true,
      existingIsGlobal: false,
      effectiveCompanyId: "tenant-viewed",
      companyId: null,
    })).toEqual({ is_global: false, company_id: "tenant-viewed", storage_scope: "tenant-viewed" });
  });

  it("mantém uploads de empresas isolados do catálogo global", () => {
    expect(resolveExerciseUploadScope({
      isMaster: false,
      isEditing: false,
      existingIsGlobal: false,
      effectiveCompanyId: "tenant-1",
      companyId: "tenant-1",
    })).toEqual({ is_global: false, company_id: "tenant-1", storage_scope: "tenant-1" });
  });

  it("falha fechado quando um upload privado não tem empresa resolvida", () => {
    expect(() => resolveExerciseUploadScope({
      isMaster: false,
      isEditing: false,
      existingIsGlobal: false,
      effectiveCompanyId: null,
      companyId: null,
    })).toThrow("Empresa obrigatória");
  });
});
