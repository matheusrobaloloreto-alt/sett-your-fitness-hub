import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  directMaybeSingle: vi.fn(),
  identityMaybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.directMaybeSingle })),
      })),
    })),
    rpc: mocks.rpc,
  },
}));

import { DEFAULT_AI_CONFIG, fetchCompanyAiConfig } from "@/lib/companyAiConfig";

describe("fetchCompanyAiConfig", () => {
  beforeEach(() => {
    mocks.directMaybeSingle.mockReset();
    mocks.identityMaybeSingle.mockReset();
    mocks.rpc.mockReset();
    mocks.rpc.mockReturnValue({ maybeSingle: mocks.identityMaybeSingle });
  });

  it("mantém a configuração completa para colaboradores autorizados", async () => {
    mocks.directMaybeSingle.mockResolvedValue({
      data: { assistant_name: "Atlas", consultancy_name: "Academia Atlas", tone: "direto" },
      error: null,
    });

    const config = await fetchCompanyAiConfig("company-id");

    expect(config.assistant_name).toBe("Atlas");
    expect(config.consultancy_name).toBe("Academia Atlas");
    expect(config.tone).toBe("direto");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("usa a identidade pública da empresa quando o aluno não pode ler a configuração completa", async () => {
    mocks.directMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.identityMaybeSingle.mockResolvedValue({
      data: { assistant_name: "BNITO", consultancy_name: "BN Performance Training" },
      error: null,
    });

    const config = await fetchCompanyAiConfig("bn-company-id");

    expect(mocks.rpc).toHaveBeenCalledWith("get_company_ai_identity", { _company_id: "bn-company-id" });
    expect(config.assistant_name).toBe("BNITO");
    expect(config.consultancy_name).toBe("BN Performance Training");
    expect(config.methodology).toBeNull();
  });

  it("preserva Setty como fallback somente quando a empresa não tem identidade configurada", async () => {
    mocks.directMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.identityMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(fetchCompanyAiConfig("new-company-id")).resolves.toEqual(DEFAULT_AI_CONFIG);
  });
});
