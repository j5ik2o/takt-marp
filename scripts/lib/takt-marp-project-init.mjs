import { SlideWorkflowError } from "./takt-marp-errors.mjs";
import { ejectProject } from "./takt-marp-project-eject.mjs";

function createInitConflict(conflicts) {
  const error = new SlideWorkflowError(
    `Init conflict: existing template files would be overwritten. Conflicting paths:\n${conflicts.join("\n")}\nRe-run with --force (or --overwrite) to overwrite template-owned paths.`,
    "INIT_CONFLICT",
  );
  error.conflicts = conflicts;
  return error;
}

export async function initializeProject(options) {
  try {
    return await ejectProject(options);
  } catch (error) {
    if (error?.code === "EJECT_CONFLICT") {
      throw createInitConflict(error.conflicts ?? []);
    }
    throw error;
  }
}
