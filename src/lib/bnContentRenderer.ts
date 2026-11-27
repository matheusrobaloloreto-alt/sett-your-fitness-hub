import type { BnDesign } from "../../supabase/functions/_shared/bnContentDesign";
export interface RenderableBnSlide {
  design?: BnDesign;
  role: "capa" | "conteudo" | "cta";
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
}

export interface RenderableBnSpec {
  design?: BnDesign;
  format: string;
  aesthetic: string;
  slides: RenderableBnSlide[];
}

type TextRun = { text: string; bold: boolean; italic: boolean; accent: boolean };
type Line = TextRun[];
const WIDTH = 1080;
const MARGIN = 82;
const BRAND = { navy: "#0D1B3E", ink: "#111214", paper: "#F4F2ED", sand: "#C8A876" };
export type BnRenderBrand=typeof BRAND & {name:string;handle:string};

export function bnSlideDimensions(format: string, design?: BnDesign) {
  const height = design?.dimensions === "square" ? 1080 : design?.dimensions === "story" ? 1920
    : design?.dimensions === "portrait" ? 1350 : ["story", "reels"].includes(format) ? 1920 : 1350;
  return { width: WIDTH, height };
}

export function bnRichText(text: string): TextRun[] {
  const pieces = text.split(/(\*\*|==|\*)/);
  let bold = false;
  let italic = false;
  let accent = false;
  const runs: TextRun[] = [];
  for (const piece of pieces) {
    if (piece === "**") bold = !bold;
    else if (piece === "*") italic = !italic;
    else if (piece === "==") accent = !accent;
    else if (piece) runs.push({ text: piece, bold, italic, accent });
  }
  return runs;
}

function setFont(ctx: CanvasRenderingContext2D, size: number, run?: TextRun, serif = false, font?: BnDesign["font"]) {
  ctx.font = `${run?.italic ? "italic " : ""}${run?.bold ? "700" : "400"} ${size}px ${font === "serif" || (font === "mixed" && serif) || (!font && serif) ? "Georgia" : "Arial"}`;
}

export function wrapBnText(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, serif = false, font?: BnDesign["font"]): Line[] {
  const lines: Line[] = [[]];
  let width = 0;
  const append = (run: TextRun, measured: number) => {
    lines[lines.length - 1].push(run);
    width += measured;
  };
  const newLine = () => { lines.push([]); width = 0; };
  for (const run of bnRichText(text)) {
    setFont(ctx, size, run, serif, font);
    for (const token of run.text.split(/(\n|[^\S\n]+)/).filter(Boolean)) {
      if (token === "\n") { newLine(); continue; }
      const whitespace = /^\s+$/.test(token);
      if (whitespace && !width) continue;
      const measured = ctx.measureText(token).width;
      if (width + measured > maxWidth && width) newLine();
      if (whitespace && !width) continue;
      if (measured <= maxWidth) append({ ...run, text: token }, measured);
      else {
        // Long unbroken words must wrap too; no hidden or clipped copy on export.
        for (const character of Array.from(token)) {
          const charWidth = ctx.measureText(character).width;
          if (width + charWidth > maxWidth && width) newLine();
          append({ ...run, text: character }, charWidth);
        }
      }
    }
  }
  return lines;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], x: number, y: number, size: number, color: string, serif: boolean, centered = false,accentColor=BRAND.sand, font?: BnDesign["font"], align?: BnDesign["align"], areaWidth=WIDTH-MARGIN*2) {
  const lineHeight = Math.ceil(size * 1.3);
  for (const line of lines) {
    const lineWidth = line.reduce((sum, run) => {
      setFont(ctx, size, run, serif, font);
      return sum + ctx.measureText(run.text).width;
    }, 0);
    let cursor = align === "right" ? x + areaWidth - lineWidth : (align === "center" || (!align && centered)) ? x + (areaWidth - lineWidth) / 2 : x;
    for (const run of line) {
      setFont(ctx, size, run, serif, font);
      ctx.fillStyle = run.accent ? accentColor : color;
      ctx.fillText(run.text, cursor, y);
      cursor += ctx.measureText(run.text).width;
    }
    y += lineHeight;
  }
  return y;
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => reject(new Error("A imagem demorou para carregar. Atualize o acervo e tente novamente.")), 15000);
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("Não foi possível carregar a imagem do slide.")); };
    image.src = url;
  });
}

export async function renderBnContentSlide(spec: RenderableBnSpec, index: number, options: { backgroundUrl?: string; logoUrl?: string|null;brand?:BnRenderBrand; companyMedia?: boolean } = {}): Promise<Blob> {
  const brand=options.brand || {...BRAND,name:"BN Performance Training",handle:"@bnperformancetraining"};
  const slide = spec.slides[index];
  if (!slide) throw new Error("Slide não encontrado.");
  const { width, height } = bnSlideDimensions(spec.format, spec.design);
  const design = { ...spec.design, ...slide.design };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não conseguiu abrir a prévia do slide.");
  ctx.textBaseline = "top";

  const configured = Boolean(spec.design || slide.design);
  const family = design.family || "editorial";
  const imageArea = design.imageArea || (slide.role === "capa" ? "background" : family === "visual" ? (index % 2 ? "right" : "top") : (index % 2 ? "right" : "background"));
  const hasImage = Boolean(options.backgroundUrl) && (!configured || imageArea !== "none");
  const light = configured ? !hasImage || imageArea !== "background"
    : !options.backgroundUrl && spec.aesthetic === "l1_educativo" && slide.role === "conteudo";
  const serif = design.font === "mixed" || /l2_|l3_|l4_/.test(spec.aesthetic);
  const centered = slide.role === "cta" || spec.aesthetic === "l4_evento_teaser";
  const background = design.background || (light ? brand.paper : spec.aesthetic === "l3_aviso" ? brand.ink : brand.navy);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const imageRight = configured && hasImage && imageArea === "right";
  const imageTop = configured && hasImage && imageArea === "top";
  const topImageHeight = Math.round(height * .34);
  if (hasImage) {
    const image = await imageFromUrl(options.backgroundUrl!);
    const x = imageRight ? Math.round(width * .59) : 0;
    const y = imageRight || imageTop ? 180 : 0;
    const targetWidth = imageRight ? width - x - MARGIN : width;
    const targetHeight = imageTop ? topImageHeight : imageRight ? height - 350 : height;
    const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale, imageHeight = image.naturalHeight * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, targetWidth, targetHeight); ctx.clip();
    ctx.drawImage(image, x + (targetWidth - imageWidth) * (design.focusX ?? 50) / 100,
      y + (targetHeight - imageHeight) * (design.focusY ?? 50) / 100, imageWidth, imageHeight);
    ctx.restore();
    if (!imageRight && !imageTop) {
      ctx.fillStyle = `${brand.navy}B3`; ctx.fillRect(0, 0, width, height);
    }
  }
  const logo = options.logoUrl===null ? null : await imageFromUrl(options.logoUrl || "/bn-content/logo.png");
  const logoHeight = 64;
  const logoWidth = logo ? Math.min(100, logoHeight * logo.naturalWidth / logo.naturalHeight):0;
  const drawnLogoHeight = options.companyMedia && logo ? logo.naturalHeight * logoWidth / logo.naturalWidth : logoHeight;
  if(logo)ctx.drawImage(logo, MARGIN, 62, logoWidth, drawnLogoHeight);
  const backgroundRgb = /^#[0-9a-f]{6}$/i.test(background) ? [1, 3, 5].map(at => parseInt(background.slice(at, at + 2), 16)) : [0, 0, 0];
  const darkBackground = backgroundRgb[0] * .299 + backgroundRgb[1] * .587 + backgroundRgb[2] * .114 < 145;
  const foreground = design.textColor || (hasImage && imageArea === "background" || darkBackground ? "#FFFFFF" : brand.ink);
  ctx.fillStyle = foreground;
  ctx.font = "700 25px Arial";
  ctx.fillText(brand.name, MARGIN + logoWidth + 18, 68,WIDTH-MARGIN*2-logoWidth-18);
  ctx.font = "400 21px Arial";
  ctx.fillStyle = light ? brand.navy : brand.sand;
  ctx.fillText(brand.handle, MARGIN + logoWidth + 18, 106,WIDTH-MARGIN*2-logoWidth-18);
  if (light) {
    ctx.fillStyle = "#D8D5CE";
    ctx.fillRect(MARGIN, 177, WIDTH - MARGIN * 2, 2);
  }

  const numbered = configured && family === "didatico" && slide.role === "conteudo";
  const paragraphs = [slide.subtitle, slide.body, ...(slide.bullets || []).map((value, index) => numbered ? `${String(index + 1).padStart(2, "0")}  ${value}` : `• ${value}`)].filter((value): value is string => Boolean(value?.trim()));
  const maxWidth = imageRight ? Math.round(width * .59) - MARGIN * 1.5 : WIDTH - MARGIN * 2;
  const textTop = imageTop ? 180 + topImageHeight + 56 : 235;
  const available = height - textTop - 155;
  let titleSize = slide.role === "capa" ? 96 : 72;
  let bodySize = 43;
  let titleLines: Line[] = [];
  let bodyLines: Line[][] = [];
  let textHeight = 0;
  for (;;) {
    titleLines = wrapBnText(ctx, slide.title, titleSize, maxWidth, serif, design.font);
    bodyLines = paragraphs.map((text) => wrapBnText(ctx, text, bodySize, maxWidth, false, design.font));
    textHeight = titleLines.length * Math.ceil(titleSize * 1.3)
      + bodyLines.reduce((sum, lines) => sum + lines.length * Math.ceil(bodySize * 1.3) + 24, 0) + 36 + (design.symbols ? 65 : 0);
    if (textHeight <= available) break;
    if (titleSize <= 36 && bodySize <= 24) throw new Error(`O texto do slide ${index + 1} não cabe sem cortes. Divida o conteúdo em mais slides.`);
    titleSize = Math.max(36, titleSize - 2);
    bodySize = Math.max(24, bodySize - 1);
  }
  const position = design.position || (slide.role === "cta" ? "center" : slide.role === "capa" ? "bottom" : "top");
  let y = position === "center" ? textTop + Math.max(0, (available - textHeight) / 2)
    : position === "bottom" ? textTop + Math.max(0, available - textHeight) : textTop;
  const align = design.align || (centered ? "center" : "left");
  ctx.fillStyle = design.accent || brand.sand;
  ctx.fillRect(align === "center" ? MARGIN + (maxWidth - 88) / 2 : align === "right" ? MARGIN + maxWidth - 88 : MARGIN, y - 26, 88, 6);
  y = drawLines(ctx, titleLines, MARGIN, y, titleSize, foreground, serif, centered, design.accent || brand.sand, design.font, align, maxWidth) + 36;
  for (const lines of bodyLines) {
    y = drawLines(ctx, lines, MARGIN, y, bodySize, foreground, false, centered, design.accent || brand.sand, design.font, align, maxWidth) + 24;
  }
  if (design.symbols) {
    ctx.fillStyle = foreground; ctx.font = "38px Arial";
    ctx.fillText(design.symbols, MARGIN, Math.min(height - 140, y + 12), maxWidth);
  }
  ctx.fillStyle = light ? brand.navy : "#FFFFFF";
  ctx.font = "400 24px Arial";
  ctx.fillText(brand.handle, MARGIN, height - 78,WIDTH-MARGIN*2-100);
  const count = `${String(index + 1).padStart(2, "0")}/${String(spec.slides.length).padStart(2, "0")}`;
  ctx.fillStyle = brand.sand;
  ctx.fillText(count, WIDTH - MARGIN - ctx.measureText(count).width, height - 78);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível exportar este slide.")), "image/png"));
}

export function downloadBnContentBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
