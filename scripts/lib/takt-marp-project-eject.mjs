import { copyFile, lstat, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";
import { assertNoProhibitedEntries, listTemplateEntries } from "./takt-marp-project-templates.mjs";

const TAKT_DIR = ".takt";

async function assertTargetDirectory(targetDir) {
  if (!path.isAbsolute(targetDir)) {
    throw new SlideWorkflowError(
      `Target directory must be an absolute path: ${targetDir}`,
      "TARGET_DIR_NOT_FOUND",
    );
  }

  let stats;
  try {
    stats = await stat(targetDir);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new SlideWorkflowError(
        `Target directory does not exist: ${targetDir}`,
        "TARGET_DIR_NOT_FOUND",
      );
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new SlideWorkflowError(
      `Target path is not a directory: ${targetDir}`,
      "TARGET_DIR_NOT_FOUND",
    );
  }
}

async function readOptionalStats(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function templateDestination(targetDir, relativePath) {
  return path.join(targetDir, TAKT_DIR, ...relativePath.split("/"));
}

function templateResultPath(relativePath) {
  return `${TAKT_DIR}/${relativePath}`;
}

async function inspectDestination(targetDir, relativePath) {
  const relativeParts = [TAKT_DIR, ...relativePath.split("/")];
  for (let index = 1; index < relativeParts.length; index += 1) {
    const ancestorParts = relativeParts.slice(0, index);
    const ancestorPath = path.join(targetDir, ...ancestorParts);
    const stats = await readOptionalStats(ancestorPath);
    if (!stats) {
      return { exists: false };
    }
    if (!stats.isDirectory()) {
      return { exists: false, conflictPath: ancestorParts.join("/") };
    }
  }

  const destinationPath = path.join(targetDir, ...relativeParts);
  const stats = await readOptionalStats(destinationPath);
  if (!stats) {
    return { exists: false };
  }
  if (!stats.isFile()) {
    return { exists: false, conflictPath: relativeParts.join("/") };
  }
  return { exists: true };
}

function pushUnique(items, item) {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function createEjectConflict(conflicts) {
  const error = new SlideWorkflowError(
    `Eject conflict: existing template files would be overwritten. Conflicting paths:\n${conflicts.join("\n")}\nRe-run with --force (or --overwrite) to overwrite template-owned paths.`,
    "EJECT_CONFLICT",
  );
  error.conflicts = conflicts;
  return error;
}

export async function ejectProject(options) {
  const { targetDir, force = false } = options;
  await assertTargetDirectory(targetDir);

  const entries = await listTemplateEntries();
  assertNoProhibitedEntries(entries);

  const plan = [];
  for (const entry of entries) {
    const destinationRelativePath = templateResultPath(entry.relativePath);
    const destinationPath = templateDestination(targetDir, entry.relativePath);
    const destinationState = await inspectDestination(targetDir, entry.relativePath);
    plan.push({ entry, destinationRelativePath, destinationPath, ...destinationState });
  }

  const conflicts = [];
  for (const item of plan) {
    if (item.conflictPath) {
      pushUnique(conflicts, item.conflictPath);
    } else if (!force && item.exists) {
      pushUnique(conflicts, item.destinationRelativePath);
    }
  }
  if (conflicts.length > 0) {
    throw createEjectConflict(conflicts);
  }

  const created = [];
  const overwritten = [];
  for (const item of plan) {
    await mkdir(path.dirname(item.destinationPath), { recursive: true });
    await copyFile(item.entry.sourcePath, item.destinationPath);
    if (item.exists) {
      overwritten.push(item.destinationRelativePath);
    } else {
      created.push(item.destinationRelativePath);
    }
  }

  return { created, overwritten };
}
