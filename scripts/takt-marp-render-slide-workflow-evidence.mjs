#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatError,
  hasExecutable,
  parseArgs,
  resolveDeckTarget,
} from "./lib/takt-marp-slide-workflow.mjs";

function usage() {
  return [
    "Usage: node scripts/takt-marp-render-slide-workflow-evidence.mjs <target> --cycle <n>",
    "",
    "Example:",
    "  npm run slide:render-evidence -- \"slides/my-talk\" --cycle 1",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }
  const [target] = positional;
  const cycle = Number(flags.cycle);
  if (!target || !Number.isInteger(cycle) || cycle < 1) {
    throw new Error(usage());
  }

  const targetInfo = resolveDeckTarget(target);
  const outputRoot = path.join(process.cwd(), ".takt", "render", targetInfo.deckName, `cycle-${cycle}`);
  await mkdir(outputRoot, { recursive: true });

  const metadata = {
    deck: targetInfo.deckName,
    cycle,
    target: targetInfo.target,
    html_png: { status: "pending", files: [] },
    pdf: { status: "pending", file: null },
    pdf_raster: hasExecutable("pdftoppm")
      ? { status: "pending", files: [] }
      : { status: "degraded", reason: "pdftoppm not found", files: [] },
  };

  const metadataPath = path.join(outputRoot, "metadata.json");
  const markerPath = path.join(process.cwd(), ".takt", "render", "latest-render-evidence.json");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        target: targetInfo.target,
        deck: targetInfo.deckName,
        cycle,
        metadata_path: path.relative(process.cwd(), metadataPath).split(path.sep).join("/"),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`render evidence metadata written: ${metadataPath}`);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
