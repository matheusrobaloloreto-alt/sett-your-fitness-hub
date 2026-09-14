#!/usr/bin/env node
import { buildVideoPreparationManifest } from "./video-prepare-lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? true) : fallback;
};

try {
  const { manifest, manifestPath, stagingDir } = await buildVideoPreparationManifest({
    sourceDir: flag("source"),
    stagingRoot: flag("staging-root", "docs/project/gravacao/_staging"),
    mapPath: flag("map", "docs/project/gravacao/codigo-para-exercicio.json"),
    runId: flag("run-id") || undefined,
    mode: flag("mode", "copy"),
  });

  console.log("Preparo concluído.");
  console.log(`  staging: ${stagingDir}`);
  console.log(`  manifest: ${manifestPath}`);
  console.log(`  arquivos recebidos: ${manifest.totals.source_files}`);
  console.log(`  prontos: ${manifest.totals.ready}`);
  console.log(`  bloqueados: ${manifest.totals.blocked}`);
  console.log(`  duplicados: ${manifest.totals.duplicate}`);
  console.log(`  sem match/código obsoleto: ${manifest.totals.unmatched + manifest.totals.stale_code}`);
  console.log(`  códigos sem arquivo: ${manifest.totals.missing}`);
  console.log("\nPróximos comandos:");
  console.log(`  node scripts/video-ingest.mjs --prepared-manifest ${manifestPath} --dry-run`);
  console.log(`  SETT_DEPLOY_TARGET=staging VIDEO_INGEST_SUPABASE_URL=... VIDEO_INGEST_PUBLISHABLE_KEY=... VIDEO_INGEST_SECRET=... node scripts/video-ingest.mjs --confirm-project ifymocggowdlqqcxugko --prepared-manifest ${manifestPath} --apply-confirm APLICAR-VIDEOS-SETT`);
} catch (error) {
  console.error(String(error?.message || error));
  process.exit(1);
}

