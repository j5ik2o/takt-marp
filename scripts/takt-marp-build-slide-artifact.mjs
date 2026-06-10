#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import {
  formatError,
  parseArgs,
  SlideWorkflowError,
} from "./lib/takt-marp-slide-workflow.mjs";
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
    "  npm run build:pdf -- my-talk",
    "  npm run build:html -- slides/my-talk",
    "  npm run build:pptx -- slides/my-talk/SLIDES.md",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }

  const [artifact, target] = positional;
  if (!ARTIFACT_OPTIONS[artifact]) {
    throw new SlideWorkflowError(usage(), "INVALID_ARGS");
  }

  const targets = await resolveBuildTargets(target);
  for (const item of targets) {
    await buildArtifact(artifact, item);
  }
}

async function resolveBuildTargets(target) {
  if (!target) {
    return listDecksWithSlides();
  }
  return [resolveBuildTarget(target)];
}

async function listDecksWithSlides() {
  const slidesRoot = path.join(process.cwd(), "slides");
  const entries = await readdir(slidesRoot, { withFileTypes: true });
  const targets = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(path.join(slidesRoot, entry.name, "SLIDES.md")))
    .map((entry) => resolveBuildTarget(entry.name))
    .sort((left, right) => left.deckName.localeCompare(right.deckName));

  if (targets.length === 0) {
    throw new SlideWorkflowError("No slides/*/SLIDES.md files found.", "SLIDES_NOT_FOUND");
  }
  return targets;
}

function resolveBuildTarget(target) {
  if (!target || path.isAbsolute(target)) {
    throw new SlideWorkflowError(`Invalid deck target '${target}'.`, "INVALID_TARGET");
  }

  const normalized = path.posix.normalize(target.replaceAll(path.sep, "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new SlideWorkflowError(`Invalid deck target '${target}'.`, "INVALID_TARGET");
  }

  const parts = normalized.split("/");
  const deckName = deckNameFromParts(parts, target);
  const deckPath = path.join(process.cwd(), "slides", deckName);
  const slidesPath = path.join(deckPath, "SLIDES.md");
  if (!existsSync(slidesPath)) {
    throw new SlideWorkflowError(`SLIDES.md not found: slides/${deckName}/SLIDES.md`, "SLIDES_NOT_FOUND");
  }

  return Object.freeze({
    deckName,
    slidesPath,
    distPath: path.join(process.cwd(), "dist", deckName),
  });
}

function deckNameFromParts(parts, original) {
  if (parts.length === 1 && parts[0] && !parts[0].endsWith(".md")) {
    return parts[0];
  }
  if (parts.length === 2 && parts[0] === "slides" && parts[1] && !parts[1].endsWith(".md")) {
    return parts[1];
  }
  if (parts.length === 3 && parts[0] === "slides" && parts[1] && parts[2] === "SLIDES.md") {
    return parts[1];
  }
  throw new SlideWorkflowError(
    `Invalid deck target '${original}'. Expected deck, slides/<deck>, or slides/<deck>/SLIDES.md.`,
    "INVALID_TARGET",
  );
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
