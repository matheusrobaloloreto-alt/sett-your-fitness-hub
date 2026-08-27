const MAX_LOGO_BYTES = 12 * 1024 * 1024;
const MAX_LOGO_SIDE = 1600;

type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type LogoBackgroundResult = PixelBuffer & {
  backgroundRemoved: boolean;
  removedPixels: number;
  reason: "removed" | "already-transparent" | "complex-background";
};

export type PreparedLogo = {
  file: File;
  backgroundRemoved: boolean;
  reason: LogoBackgroundResult["reason"];
  width: number;
  height: number;
};

const colorDistance = (
  data: Uint8ClampedArray,
  offset: number,
  background: [number, number, number],
) => {
  const red = data[offset] - background[0];
  const green = data[offset + 1] - background[1];
  const blue = data[offset + 2] - background[2];
  return Math.sqrt(red * red + green * green + blue * blue);
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

function borderPixelIndexes(width: number, height: number) {
  const indexes = new Set<number>();
  for (let x = 0; x < width; x += 1) {
    indexes.add(x);
    indexes.add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    indexes.add(y * width);
    indexes.add(y * width + width - 1);
  }
  return [...indexes];
}

/**
 * Removes only a uniform background connected to the image edges. Internal
 * areas with the same color remain intact, which protects holes and lettering.
 */
export function removeUniformEdgeBackground(buffer: PixelBuffer): LogoBackgroundResult {
  const output = new Uint8ClampedArray(buffer.data);
  const border = borderPixelIndexes(buffer.width, buffer.height);
  const opaqueBorder = border.filter((index) => output[index * 4 + 3] > 24);
  const transparentRatio = 1 - opaqueBorder.length / Math.max(border.length, 1);

  if (transparentRatio >= 0.25 || opaqueBorder.length === 0) {
    return {
      data: output,
      width: buffer.width,
      height: buffer.height,
      backgroundRemoved: false,
      removedPixels: 0,
      reason: "already-transparent",
    };
  }

  const background: [number, number, number] = [
    median(opaqueBorder.map((index) => output[index * 4])),
    median(opaqueBorder.map((index) => output[index * 4 + 1])),
    median(opaqueBorder.map((index) => output[index * 4 + 2])),
  ];
  const uniformBorderRatio = opaqueBorder.filter(
    (index) => colorDistance(output, index * 4, background) <= 34,
  ).length / opaqueBorder.length;

  if (uniformBorderRatio < 0.62) {
    return {
      data: output,
      width: buffer.width,
      height: buffer.height,
      backgroundRemoved: false,
      removedPixels: 0,
      reason: "complex-background",
    };
  }

  const visited = new Uint8Array(buffer.width * buffer.height);
  const queue = border.filter((index) => colorDistance(output, index * 4, background) <= 58);
  let head = 0;
  let removedPixels = 0;

  while (head < queue.length) {
    const index = queue[head++];
    if (visited[index]) continue;
    visited[index] = 1;

    const offset = index * 4;
    const distance = colorDistance(output, offset, background);
    if (distance > 58) continue;

    const originalAlpha = output[offset + 3];
    const feather = distance <= 22 ? 0 : Math.min(1, (distance - 22) / 36);
    const nextAlpha = Math.round(originalAlpha * feather);
    if (nextAlpha < originalAlpha) {
      output[offset + 3] = nextAlpha;
      removedPixels += 1;
    }

    const x = index % buffer.width;
    const y = Math.floor(index / buffer.width);
    if (x > 0) queue.push(index - 1);
    if (x + 1 < buffer.width) queue.push(index + 1);
    if (y > 0) queue.push(index - buffer.width);
    if (y + 1 < buffer.height) queue.push(index + buffer.width);
  }

  return {
    data: output,
    width: buffer.width,
    height: buffer.height,
    backgroundRemoved: removedPixels > Math.max(8, buffer.width * buffer.height * 0.01),
    removedPixels,
    reason: removedPixels > 0 ? "removed" : "complex-background",
  };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível preparar a imagem da logo."));
    }, "image/png");
  });
}

async function decodeImage(file: File) {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();
  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function prepareLogoImage(file: File): Promise<PreparedLogo> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    throw new Error("Envie uma imagem PNG, JPG ou WebP.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("A logo deve ter no máximo 12 MB.");
  }

  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(1, MAX_LOGO_SIDE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Seu navegador não conseguiu processar a logo.");

    context.drawImage(decoded.source, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const result = removeUniformEdgeBackground({
      data: imageData.data,
      width,
      height,
    });
    const transparentImage = context.createImageData(width, height);
    transparentImage.data.set(result.data);
    context.putImageData(transparentImage, 0, 0);

    const blob = await canvasToBlob(canvas);
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "logo";
    return {
      file: new File([blob], `${baseName}-transparente.png`, { type: "image/png" }),
      backgroundRemoved: result.backgroundRemoved,
      reason: result.reason,
      width,
      height,
    };
  } finally {
    decoded.dispose();
  }
}
