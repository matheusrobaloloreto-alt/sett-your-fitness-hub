import { describe, expect, it } from "vitest";
import { removeUniformEdgeBackground } from "./logoImage";

function pixels(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(color, index * 4);
  }
  return data;
}

describe("removeUniformEdgeBackground", () => {
  it("remove um fundo branco uniforme e preserva a marca", () => {
    const data = pixels(10, 10, [255, 255, 255, 255]);
    for (let y = 3; y <= 6; y += 1) {
      for (let x = 3; x <= 6; x += 1) data.set([20, 30, 40, 255], (y * 10 + x) * 4);
    }

    const result = removeUniformEdgeBackground({ data, width: 10, height: 10 });

    expect(result.backgroundRemoved).toBe(true);
    expect(result.data[3]).toBe(0);
    expect(result.data[(4 * 10 + 4) * 4 + 3]).toBe(255);
  });

  it("preserva uma área interna da mesma cor que não toca as bordas", () => {
    const data = pixels(9, 9, [255, 255, 255, 255]);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) data.set([10, 10, 10, 255], (y * 9 + x) * 4);
    }
    data.set([255, 255, 255, 255], (4 * 9 + 4) * 4);

    const result = removeUniformEdgeBackground({ data, width: 9, height: 9 });

    expect(result.data[(4 * 9 + 4) * 4 + 3]).toBe(255);
  });

  it("não remove um fundo de borda complexo", () => {
    const data = pixels(8, 8, [255, 255, 255, 255]);
    for (let x = 0; x < 8; x += 1) {
      data.set(x % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], x * 4);
      data.set(x % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], ((7 * 8) + x) * 4);
    }
    for (let y = 0; y < 8; y += 1) {
      data.set(y % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * 8) * 4);
      data.set(y % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * 8 + 7) * 4);
    }

    const result = removeUniformEdgeBackground({ data, width: 8, height: 8 });

    expect(result.backgroundRemoved).toBe(false);
    expect(result.reason).toBe("complex-background");
  });

  it("mantém logos que já possuem transparência", () => {
    const data = pixels(8, 8, [20, 30, 40, 255]);
    for (let x = 0; x < 8; x += 1) data.set([0, 0, 0, 0], x * 4);

    const result = removeUniformEdgeBackground({ data, width: 8, height: 8 });

    expect(result.backgroundRemoved).toBe(false);
    expect(result.reason).toBe("already-transparent");
  });
});
