import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BnContentSpec } from "@/lib/bnContentStudio";
const { renderer } = vi.hoisted(() => ({ renderer: vi.fn() }));
vi.mock("@/lib/bnContentRenderer", () => ({ renderBnContentSlide: renderer, bnSlideDimensions: (format: string) => ({ width: 1080, height: format === "story" ? 1920 : 1350 }) }));
import { BnContentStudioPreview } from "./BnContentStudioPreview";

const spec: BnContentSpec = { format: "carrossel", aesthetic: "l1_educativo", topic: "Força", audience: "misto", slides: [{ role: "capa", title: "Primeira prévia" }], caption: "Legenda", hashtags: [] };

describe("BN Content async preview", () => {
  beforeEach(() => {
    renderer.mockReset();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:current"), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("ignores stale async render results and revokes URLs on replacement and unmount", async () => {
    let first: (blob: Blob) => void;
    let second: (blob: Blob) => void;
    renderer.mockImplementationOnce(() => new Promise<Blob>(resolve => { first = resolve; }));
    renderer.mockImplementationOnce(() => new Promise<Blob>(resolve => { second = resolve; }));
    const { rerender, unmount } = render(<BnContentStudioPreview spec={spec} index={0} assets={{}} />);
    rerender(<BnContentStudioPreview spec={{ ...spec, slides: [{ role: "capa", title: "Segunda prévia" }] }} index={0} assets={{}} />);
    await act(async () => { second(new Blob(["current"])); });
    expect(await screen.findByRole("img", { name: "Slide 1: Segunda prévia" })).toHaveAttribute("src", "blob:current");
    await act(async () => { first(new Blob(["stale"])); });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:current");
  });
  it("does not leak object URLs when render finishes after unmount", async () => {
    let finish: (blob: Blob) => void;
    renderer.mockImplementationOnce(() => new Promise<Blob>(resolve => { finish = resolve; }));
    const { unmount } = render(<BnContentStudioPreview spec={spec} index={0} assets={{}} />);
    unmount(); await act(async () => { finish(new Blob(["late"])); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("fails closed when the private background URL is absent", async () => {
    render(<BnContentStudioPreview spec={{ ...spec, slides: [{ ...spec.slides[0], background_path: "private.png" }] }} index={0} assets={{}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/imagem expirou/);
    expect(renderer).not.toHaveBeenCalled();
  });
  it("passes signed backgrounds and canonical logo to the renderer", async () => {
    renderer.mockResolvedValue(new Blob(["preview"]));
    const withBackground = { ...spec, slides: [{ ...spec.slides[0], background_path: "private.png" }] };
    render(<BnContentStudioPreview spec={withBackground} index={0} assets={{ "private.png": "https://signed.example/background.png" }} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(renderer).toHaveBeenCalledWith(withBackground, 0, { backgroundUrl: "https://signed.example/background.png", logoUrl: "/bn-content/logo.png" });
  });
  it("surfaces the renderer's actionable overflow message", async () => {
    const message = "O texto do slide 1 não cabe sem cortes. Divida o conteúdo em mais slides.";
    renderer.mockRejectedValue(new Error(message));
    render(<BnContentStudioPreview spec={spec} index={0} assets={{}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
