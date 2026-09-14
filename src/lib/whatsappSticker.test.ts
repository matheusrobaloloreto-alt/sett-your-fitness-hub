import { describe, expect, it } from "vitest";
import { containStickerImage } from "@/lib/whatsappSticker";

describe("containStickerImage", () => {
  it("centers a landscape image inside the square sticker", () => {
    expect(containStickerImage(1024, 512)).toEqual({ x: 0, y: 128, width: 512, height: 256 });
  });

  it("centers a portrait image inside the square sticker", () => {
    expect(containStickerImage(400, 800)).toEqual({ x: 128, y: 0, width: 256, height: 512 });
  });

  it("rejects invalid dimensions", () => {
    expect(() => containStickerImage(0, 100)).toThrow("Dimensões inválidas");
  });
});
