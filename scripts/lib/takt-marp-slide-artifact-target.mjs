import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { SlideWorkflowError } from "./takt-marp-slide-workflow.mjs";

export async function resolveSlideArtifactTargets(target, options = {}) {
  if (!target) {
    return listSlideArtifactTargets(options);
  }
  return [resolveSlideArtifactTarget(target, options)];
}

export async function listSlideArtifactTargets(options = {}) {
  const root = options.root ?? process.cwd();
  const slidesRoot = path.join(root, "slides");
  const entries = await readdir(slidesRoot, { withFileTypes: true });
  const targets = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(path.join(slidesRoot, entry.name, "SLIDES.md")))
    .map((entry) => resolveSlideArtifactTarget(entry.name, options))
    .sort((left, right) => left.deckName.localeCompare(right.deckName));

  if (targets.length === 0) {
    throw new SlideWorkflowError("No slides/*/SLIDES.md files found.", "SLIDES_NOT_FOUND");
  }
  return targets;
}

export function resolveSlideArtifactTarget(target, options = {}) {
  const root = options.root ?? process.cwd();
  if (!target || path.isAbsolute(target)) {
    throw new SlideWorkflowError(`Invalid deck target '${target}'.`, "INVALID_TARGET");
  }

  const normalized = path.posix.normalize(target.replaceAll(path.sep, "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new SlideWorkflowError(`Invalid deck target '${target}'.`, "INVALID_TARGET");
  }

  const parts = normalized.split("/");
  const deckName = deckNameFromParts(parts, target);
  const deckPath = path.join(root, "slides", deckName);
  const slidesPath = path.join(deckPath, "SLIDES.md");
  if (!existsSync(slidesPath)) {
    throw new SlideWorkflowError(`SLIDES.md not found: slides/${deckName}/SLIDES.md`, "SLIDES_NOT_FOUND");
  }

  return Object.freeze({
    deckName,
    deckPath,
    slidesPath,
    distPath: path.join(root, "dist", deckName),
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
