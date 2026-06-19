import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNTIME_TOOLS = ["takt", "marp"];

export function resolveRuntimeContext() {
  return {
    projectRoot: process.cwd(),
    packageRoot: PACKAGE_ROOT,
    runtimeBinDir: path.join(PACKAGE_ROOT, "node_modules", ".bin"),
  };
}

export function runtimeExecutablePath(tool, options = {}) {
  if (!RUNTIME_TOOLS.includes(tool)) {
    throw new Error(`Unknown runtime tool: ${tool}. Expected one of: ${RUNTIME_TOOLS.join(", ")}.`);
  }
  const root = options.root ?? PACKAGE_ROOT;
  return path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${tool}.cmd` : tool);
}

export function packageScriptPath(relative) {
  return path.join(PACKAGE_ROOT, relative);
}
