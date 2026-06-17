#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  formatError,
  parseArgs,
  SlideWorkflowError,
} from "./lib/takt-marp-slide-workflow.mjs";
import { resolveSlideArtifactTargets } from "./lib/takt-marp-slide-artifact-target.mjs";
import { runtimeExecutablePath } from "./lib/takt-marp-runtime-context.mjs";

const ARTIFACT_OPTIONS = Object.freeze({
  html: ["--html"],
  pdf: ["--pdf", "--html"],
  pptx: ["--pptx", "--html"],
});

function usage() {
  return [
    "Usage: node scripts/takt-marp-build-slide-artifact.mjs <html|pdf|pptx> [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "",
    "When deck is omitted, all slides/*/SLIDES.md files are built.",
    "",
    "Examples:",
    "  takt-marp build:pdf my-talk",
    "  takt-marp build:html slides/my-talk",
    "  takt-marp build:pptx slides/my-talk/SLIDES.md",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }

  const [artifact, target] = positional;
  if (positional.length > 2) {
    throw new SlideWorkflowError(usage(), "INVALID_ARGS");
  }
  if (!ARTIFACT_OPTIONS[artifact]) {
    throw new SlideWorkflowError(usage(), "INVALID_ARGS");
  }

  const targets = await resolveSlideArtifactTargets(target);
  for (const item of targets) {
    await buildArtifact(artifact, item);
  }
}

async function buildArtifact(artifact, target) {
  await mkdir(target.distPath, { recursive: true });
  const outputPath = path.join(target.distPath, `SLIDES.${artifact}`);
  const marpPath = runtimeExecutablePath("marp");
  const args = [
    target.slidesPath,
    ...ARTIFACT_OPTIONS[artifact],
    "--allow-local-files",
    "--output",
    outputPath,
  ];
  const code = await run(marpPath, args);
  if (code !== 0) {
    throw new SlideWorkflowError(`Marp failed for slides/${target.deckName}/SLIDES.md`, "MARP_BUILD_FAILED");
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("error", (error) => {
      reject(
        new SlideWorkflowError(
          `Failed to start Marp executable: ${command}. Run npm install and verify the @marp-team/marp-cli devDependency. ${error.message}`,
          "MARP_EXECUTABLE_MISSING",
        ),
      );
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
