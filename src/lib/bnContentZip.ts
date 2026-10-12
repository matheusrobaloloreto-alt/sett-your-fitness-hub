import type { BnContentSpec } from "@/lib/bnContentStudio";

export async function createBnContentZip(spec: BnContentSpec, slides: Blob[], filename: string): Promise<Blob> {
  if (!slides.length || slides.length !== spec.slides.length) throw new Error("Não foi possível exportar todos os slides.");
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(filename)) throw new Error("Nome de arquivo inválido.");

  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < slides.length; index++) {
    files[`${filename}-slide-${index + 1}.png`] = new Uint8Array(await slides[index].arrayBuffer());
  }
  files[`${filename}-legenda.txt`] = strToU8([spec.caption, spec.hashtags.join(" ")].filter(Boolean).join("\n\n"));
  files[`${filename}.json`] = strToU8(JSON.stringify(spec, null, 2));

  // PNGs are already compressed; storing them avoids recompression on the UI thread.
  return new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
}
