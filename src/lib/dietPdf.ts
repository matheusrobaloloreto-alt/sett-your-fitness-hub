import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export const MAX_DIET_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_DIET_PDF_PAGES = 30;

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
};

export function normalizeDietPdfPages(pages: string[]): string {
  return pages
    .map((page) => page
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function textItemsToPage(items: PdfTextItem[]): string {
  let output = "";
  let previousY: number | null = null;

  for (const item of items) {
    const text = String(item.str || "").trim();
    if (!text) continue;

    const y = Array.isArray(item.transform) ? Number(item.transform[5]) : Number.NaN;
    const changedLine = previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 2.5;
    if (output) output += changedLine ? "\n" : " ";
    output += text;
    if (item.hasEOL) output += "\n";
    if (Number.isFinite(y)) previousY = y;
  }

  return output;
}

export async function extractDietPdfText(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Envie um arquivo PDF.");
  }
  if (file.size > MAX_DIET_PDF_BYTES) {
    throw new Error("O PDF deve ter no máximo 12 MB.");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (document.numPages > MAX_DIET_PDF_PAGES) {
    throw new Error("O PDF deve ter no máximo 30 páginas.");
  }

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(textItemsToPage(content.items as PdfTextItem[]));
  }

  const text = normalizeDietPdfPages(pages);
  if (text.replace(/\s/g, "").length < 10) {
    throw new Error("Este PDF parece ser escaneado e não contém texto selecionável. Cole o conteúdo do cardápio no campo abaixo.");
  }
  return text;
}
