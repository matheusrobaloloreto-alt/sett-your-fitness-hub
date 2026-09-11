export const WHATSAPP_STICKER_SIZE = 512;
export const MAX_WHATSAPP_STICKER_BYTES = 1024 * 1024;
export const MAX_WHATSAPP_STICKER_SOURCE_BYTES = 20 * 1024 * 1024;

export function containStickerImage(width: number, height: number, size = WHATSAPP_STICKER_SIZE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Dimensões inválidas para a figurinha.");
  }
  const scale = Math.min(size / width, size / height);
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  return {
    x: Math.round((size - drawWidth) / 2),
    y: Math.round((size - drawHeight) / 2),
    width: drawWidth,
    height: drawHeight,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir a imagem da figurinha."));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

export async function prepareWhatsAppSticker(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem para criar a figurinha.");
  if (file.size > MAX_WHATSAPP_STICKER_SOURCE_BYTES) {
    throw new Error("A imagem da figurinha deve ter no máximo 20 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = WHATSAPP_STICKER_SIZE;
    canvas.height = WHATSAPP_STICKER_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Seu navegador não conseguiu preparar a figurinha.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const placement = containStickerImage(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, placement.x, placement.y, placement.width, placement.height);

    for (const quality of [0.86, 0.72, 0.58]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob && blob.size <= MAX_WHATSAPP_STICKER_BYTES) {
        return new File([blob], `figurinha-${Date.now()}.webp`, { type: "image/webp" });
      }
    }
    throw new Error("A figurinha ficou maior que 1 MB. Escolha uma imagem mais simples.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
