import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBnContentManifest } from "@/lib/bnContentArchive";

const storageFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: (...args: unknown[]) => storageFrom(...args) } },
}));

import MasterBnContent from "./MasterBnContent";

const manifest = JSON.stringify([{
  id: "post-1",
  title: "Treino individualizado",
  status: "draft",
  slides: ["posts/post-1/slide_1.png"],
  caption: "Legenda segura",
}]);

describe("MasterBnContent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects malformed archive entries", () => {
    expect(() => parseBnContentManifest('[{"id":"x"}]')).toThrow(/itens inválidos/i);
    expect(() => parseBnContentManifest('[{"id":"x","title":"Sem capa","slides":[]}]')).toThrow(/itens inválidos/i);
    expect(() => parseBnContentManifest('[{"id":"post-1","title":"Fora do post","slides":["posts/outro/slide_1.png"]}]')).toThrow(/itens inválidos/i);
    expect(() => parseBnContentManifest('[{"id":"../post","title":"Traversal","slides":["manifest.json"]}]')).toThrow(/itens inválidos/i);
  });

  it("loads the private archive and explains the zero-cost boundary", async () => {
    const download = vi.fn().mockResolvedValue({ data: { text: async () => manifest }, error: null });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ path: "posts/post-1/slide_1.png", signedUrl: "https://signed.example/slide.png" }],
      error: null,
    });
    storageFrom.mockReturnValue({ download, createSignedUrls });

    render(<MasterBnContent />);

    expect(screen.getByRole("heading", { name: "BN Content" })).toBeInTheDocument();
    expect(screen.getByText("custo adicional zero")).toBeInTheDocument();
    expect(screen.getByText(/o Studio precisa estar rodando neste computador/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Treino individualizado/i })).toBeInTheDocument();
    expect(storageFrom).toHaveBeenCalledWith("bn-content-archive");
  });

  it("opens the local creator without replacing the SETT dashboard", async () => {
    storageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: { text: async () => "[]" }, error: null }),
      createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<MasterBnContent />);

    fireEvent.click(screen.getByRole("button", { name: /Abrir Studio neste computador/i }));

    expect(open).toHaveBeenCalledWith("http://127.0.0.1:8787/", "_blank", "noopener,noreferrer");
    await waitFor(() => expect(screen.queryByText(/Carregando o arquivo privado/i)).not.toBeInTheDocument());
  });

  it("fails closed when a slide does not receive a signed URL", async () => {
    storageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: { text: async () => manifest }, error: null }),
      createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    render(<MasterBnContent />);

    expect(await screen.findByText(/arquivo privado está indisponível ou incompleto/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Treino individualizado/i })).not.toBeInTheDocument();
  });
});
