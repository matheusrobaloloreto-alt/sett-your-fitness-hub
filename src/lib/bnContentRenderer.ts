export interface RenderableBnSlide {
  role: "capa" | "conteudo" | "cta";
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
}

export interface RenderableBnSpec {
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

export function bnSlideDimensions(format: string) {
  return { width: WIDTH, height: ["story", "reels"].includes(format) ? 1920 : 1350 };
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

function setFont(ctx: CanvasRenderingContext2D, size: number, run?: TextRun, serif = false) {
  ctx.font = `${run?.italic ? "italic " : ""}${run?.bold ? "700" : "400"} ${size}px ${serif ? "Georgia" : "Arial"}`;
}

export function wrapBnText(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, serif = false): Line[] {
  const lines: Line[] = [[]];
  let width = 0;
  const append = (run: TextRun, measured: number) => {
    lines[lines.length - 1].push(run);
    width += measured;
  };
  const newLine = () => { lines.push([]); width = 0; };
  for (const run of bnRichText(text)) {
    setFont(ctx, size, run, serif);
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

function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], x: number, y: number, size: number, color: string, serif: boolean, centered = false,accentColor=BRAND.sand) {
  const lineHeight = Math.ceil(size * 1.3);
  for (const line of lines) {
    const lineWidth = line.reduce((sum, run) => {
      setFont(ctx, size, run, serif);
      return sum + ctx.measureText(run.text).width;
    }, 0);
    let cursor = centered ? (WIDTH - lineWidth) / 2 : x;
    for (const run of line) {
      setFont(ctx, size, run, serif);
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

function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, height: number) {
  const scale = Math.max(WIDTH / image.naturalWidth, height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const scaledHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (WIDTH - width) / 2, (height - scaledHeight) / 2, width, scaledHeight);
}

export async function renderBnContentSlide(spec: RenderableBnSpec, index: number, options: { backgroundUrl?: string; logoUrl?: string|null;brand?:BnRenderBrand; companyMedia?: boolean } = {}): Promise<Blob> {
  const brand=options.brand || {...BRAND,name:"BN Performance Training",handle:"@bnperformancetraining"};
  const slide = spec.slides[index];
  if (!slide) throw new Error("Slide não encontrado.");
  const { width, height } = bnSlideDimensions(spec.format);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não conseguiu abrir a prévia do slide.");
  ctx.textBaseline = "top";

  const light = !(options.companyMedia && options.backgroundUrl) && spec.aesthetic === "l1_educativo" && slide.role === "conteudo";
  const serif = /l2_|l3_|l4_/.test(spec.aesthetic);
  const centered = slide.role === "cta" || spec.aesthetic === "l4_evento_teaser";
  const background = light ? brand.paper : spec.aesthetic === "l3_aviso" ? brand.ink : brand.navy;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  if (options.backgroundUrl && (options.companyMedia || (slide.role !== "cta" && !light && spec.aesthetic !== "l3_aviso"))) {
    const image = await imageFromUrl(options.backgroundUrl);
    cover(ctx, image, height);
    ctx.fillStyle = `${brand.navy}B3`;
    ctx.fillRect(0, 0, width, height);
  }
  const logo = options.logoUrl===null ? null : await imageFromUrl(options.logoUrl || "/bn-content/logo.png");
  const logoHeight = 64;
  const logoWidth = logo ? Math.min(100, logoHeight * logo.naturalWidth / logo.naturalHeight):0;
  const drawnLogoHeight = options.companyMedia && logo ? logo.naturalHeight * logoWidth / logo.naturalWidth : logoHeight;
  if(logo)ctx.drawImage(logo, MARGIN, 62, logoWidth, drawnLogoHeight);
  const foreground = light ? brand.ink : "#FFFFFF";
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

  const paragraphs = [slide.subtitle, slide.body, ...(slide.bullets || []).map((value) => `• ${value}`)].filter((value): value is string => Boolean(value?.trim()));
  const maxWidth = WIDTH - MARGIN * 2;
  const available = height - 390;
  let titleSize = slide.role === "capa" ? 96 : 72;
  let bodySize = 43;
  let titleLines: Line[] = [];
  let bodyLines: Line[][] = [];
  let textHeight = 0;
  for (;;) {
    titleLines = wrapBnText(ctx, slide.title, titleSize, maxWidth, serif);
    bodyLines = paragraphs.map((text) => wrapBnText(ctx, text, bodySize, maxWidth));
    textHeight = titleLines.length * Math.ceil(titleSize * 1.3)
      + bodyLines.reduce((sum, lines) => sum + lines.length * Math.ceil(bodySize * 1.3) + 24, 0) + 36;
    if (textHeight <= available) break;
    if (titleSize <= 36 && bodySize <= 24) throw new Error(`O texto do slide ${index + 1} não cabe sem cortes. Divida o conteúdo em mais slides.`);
    titleSize = Math.max(36, titleSize - 2);
    bodySize = Math.max(24, bodySize - 1);
  }
  let y = slide.role === "capa" || centered ? Math.max(235, height - textHeight - 170) : 235;
  ctx.fillStyle = brand.sand;
  ctx.fillRect(centered ? (WIDTH - 88) / 2 : MARGIN, y - 26, 88, 6);
  y = drawLines(ctx, titleLines, MARGIN, y, titleSize, foreground, serif, centered,brand.sand) + 36;
  for (const lines of bodyLines) {
    y = drawLines(ctx, lines, MARGIN, y, bodySize, light ? brand.ink : "#E3E0D9", false, centered,brand.sand) + 24;
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
