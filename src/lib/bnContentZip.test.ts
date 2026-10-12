import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { strFromU8, unzipSync } from "fflate";
import type { BnContentSpec } from "./bnContentStudio";
import { createBnContentZip } from "./bnContentZip";

// Valid, one-bit grayscale PNG fixtures at the two export sizes.
const pngs = {
  1350: "iVBORw0KGgoAAAANSUhEUgAABDgAAAVGAQAAAABTNDYnAAAAyUlEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIB3A81OAAGYNrEaAAAAAElFTkSuQmCC",
  1920: "iVBORw0KGgoAAAANSUhEUgAABDgAAAeAAQAAAAADGtqnAAABFElEQVR4nO3BgQAAAADDoPlTX+AIVQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8A/wtAAErjzF6AAAAAElFTkSuQmCC",
};
const spec: BnContentSpec = {
  format: "carrossel", aesthetic: "l1_educativo", topic: "Força", audience: "misto",
  slides: [{ role: "capa", title: "Força com técnica" }, { role: "cta", title: "Comece pela avaliação" }],
  caption: "Treino com atenção, evolução e constância.", hashtags: ["#força", "#avaliação"],
};

describe("BN Content ZIP export", () => {
  beforeEach(() => { vi.stubGlobal("Blob", NodeBlob); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it.each([1350, 1920] as const)("exports every PNG at 1080×%i, UTF-8 caption and complete JSON in a real ZIP", async height => {
    const original = new Uint8Array(Buffer.from(pngs[height], "base64"));
    const slides = spec.slides.map(() => new Blob([original], { type: "image/png" }));
    const exportedSpec = { ...spec, format: height === 1920 ? "story" : "carrossel" };
    const archive = await createBnContentZip(exportedSpec, slides, "bn-post");
    expect(archive.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["bn-post-slide-1.png", "bn-post-slide-2.png", "bn-post-legenda.txt", "bn-post.json"]);
    for (const name of ["bn-post-slide-1.png", "bn-post-slide-2.png"]) {
      const png = files[name];
      expect(png).toEqual(original);
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
      expect(header.getUint32(16)).toBe(1080);
      expect(header.getUint32(20)).toBe(height);
    }
    expect(strFromU8(files["bn-post-legenda.txt"])).toBe(`${spec.caption}\n\n${spec.hashtags.join(" ")}`);
    expect(JSON.parse(strFromU8(files["bn-post.json"]))).toEqual(exportedSpec);
  });
  it("exports a complete manual draft with an empty caption", async () => {
    const manual = { ...spec, caption: "", hashtags: [], slides: [spec.slides[0]] };
    const archive = await createBnContentZip(manual, [new Blob([Buffer.from(pngs[1350], "base64")])], "bn-conteudo");
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["bn-conteudo-slide-1.png", "bn-conteudo-legenda.txt", "bn-conteudo.json"]);
    expect(files["bn-conteudo-legenda.txt"]).toHaveLength(0);
    expect(JSON.parse(strFromU8(files["bn-conteudo.json"]))).toEqual(manual);
  });
  it("rejects incomplete slide sets instead of producing a partial archive", async () => {
    await expect(createBnContentZip(spec, [new Blob(["first"])], "bn-post")).rejects.toThrow(/todos os slides/);
    await expect(createBnContentZip({ ...spec, slides: [] }, [], "bn-post")).rejects.toThrow(/todos os slides/);
  });
  it("rejects filenames that could create nested or traversing ZIP paths", async () => {
    await expect(createBnContentZip(spec, [new Blob(), new Blob()], "../bn-post")).rejects.toThrow(/Nome de arquivo/);
  });
});
