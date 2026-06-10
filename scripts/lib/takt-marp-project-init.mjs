import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { listTemplateEntries } from "./takt-marp-project-templates.mjs";
import { SlideWorkflowError } from "./takt-marp-slide-workflow.mjs";

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

async function destinationExists(destinationPath) {
  try {
    await stat(destinationPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

export async function initializeProject(options) {
  const { targetDir, force } = options;
  await assertTargetDirectory(targetDir);

  const entries = await listTemplateEntries();
  const plan = [];
  for (const entry of entries) {
    const destinationRelativePath = `${TAKT_DIR}/${entry.relativePath}`;
    const destinationPath = path.join(targetDir, TAKT_DIR, ...entry.relativePath.split("/"));
    const exists = await destinationExists(destinationPath);
    plan.push({ entry, destinationRelativePath, destinationPath, exists });
  }

  const conflicts = plan.filter((item) => item.exists).map((item) => item.destinationRelativePath);
  if (!force && conflicts.length > 0) {
    throw new SlideWorkflowError(
      `Init conflict: existing template files would be overwritten. Conflicting paths:\n${conflicts.join("\n")}\nRe-run with --force (or --overwrite) to overwrite template-owned paths.`,
      "INIT_CONFLICT",
    );
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
