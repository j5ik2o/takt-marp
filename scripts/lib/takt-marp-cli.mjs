import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { initializeProject } from "./takt-marp-project-init.mjs";
import { packageScriptPath } from "./takt-marp-runtime-context.mjs";
import { formatError, SlideWorkflowError } from "./takt-marp-slide-workflow.mjs";

const WORKFLOW_COMMANDS = ["plan", "compose", "polish", "deliver"];
const VALID_COMMANDS = ["init", ...WORKFLOW_COMMANDS, "smoke"];
const RUNNER_SCRIPT = "scripts/takt-marp-run-slide-workflow.mjs";
const REQUIRED_PROJECT_DIRS = [".takt/workflows", ".takt/facets"];

function usage() {
  return [
    "Usage: takt-marp <command> [arguments]",
    "",
    "Commands:",
    "  init [dir] [--force|--overwrite]  Install .takt/workflows and .takt/facets templates into <dir> (default: .)",
    "  plan <slides/deck> [options]      Run the plan workflow for a deck in the current project",
    "  compose <slides/deck> [options]   Run the compose workflow for a deck in the current project",
    "  polish <slides/deck> [options]    Run the polish workflow for a deck in the current project",
    "  deliver <slides/deck> [options]   Run the deliver workflow for a deck in the current project",
    "  smoke [--provider <name>]         Run smoke validation in a temporary project (default provider: mock)",
    "",
    "Workflow options (passed through to the workflow runner unchanged):",
    "  --force            Invalidate an already-successful state and rerun",
    "  --provider <name>  Run the workflow with the specified TAKT provider",
  ].join("\n");
}

function initUsage() {
  return [
    "Usage: takt-marp init [dir] [--force|--overwrite]",
    "",
    "Installs .takt/workflows/** and .takt/facets/** templates into <dir> (default: current directory).",
    "",
    "Options:",
    "  --force      Overwrite existing template-owned files",
    "  --overwrite  Alias of --force",
    "  --help       Show this message",
  ].join("\n");
}

function isDirectory(candidatePath) {
  const stats = statSync(candidatePath, { throwIfNoEntry: false });
  return stats !== undefined && stats.isDirectory();
}

function assertProjectInitialized() {
  const cwd = process.cwd();
  const missing = REQUIRED_PROJECT_DIRS.filter(
    (relative) => !isDirectory(path.join(cwd, ...relative.split("/"))),
  );
  if (missing.length > 0) {
    throw new SlideWorkflowError(
      `Target project is not initialized: missing ${missing.join(" and ")} in ${cwd}. Run 'takt-marp init .' first.`,
      "PROJECT_NOT_INITIALIZED",
    );
  }
}

function runPackageScript(relativeScriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [packageScriptPath(relativeScriptPath), ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function runWorkflowCommand(command, args) {
  assertProjectInitialized();
  return runPackageScript(RUNNER_SCRIPT, [command, ...args]);
}

async function runInit(args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        force: { type: "boolean", default: false },
        overwrite: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    throw new SlideWorkflowError(
      `Invalid init arguments: ${error.message}. Run 'takt-marp init --help' for usage.`,
      "INVALID_ARGS",
    );
  }
  if (parsed.values.help) {
    console.log(initUsage());
    return 0;
  }
  if (parsed.positionals.length > 1) {
    throw new SlideWorkflowError(
      `Unexpected extra init arguments: ${parsed.positionals.slice(1).join(" ")}. Run 'takt-marp init --help' for usage.`,
      "INVALID_ARGS",
    );
  }

  const targetDir = path.resolve(process.cwd(), parsed.positionals[0] ?? ".");
  const force = parsed.values.force || parsed.values.overwrite;
  const { created, overwritten } = await initializeProject({ targetDir, force });

  const lines = [`Initialized takt-marp templates in ${targetDir}`];
  lines.push(`Created ${created.length} file(s)${created.length > 0 ? ":" : "."}`);
  for (const relativePath of created) {
    lines.push(`  ${relativePath}`);
  }
  if (overwritten.length > 0) {
    lines.push(`Overwrote ${overwritten.length} file(s):`);
    for (const relativePath of overwritten) {
      lines.push(`  ${relativePath}`);
    }
  }
  lines.push(
    "",
    "Next steps:",
    "  - Provider configuration stays under your ownership: takt-marp does not create or modify",
    "    TAKT provider settings, API keys, or credentials.",
    "  - Configure your TAKT provider before running workflows.",
    `  - Run a workflow from the project root, e.g.: takt-marp plan slides/<deck>`,
  );
  console.log(lines.join("\n"));
  return 0;
}

function runSmoke() {
  // Sanctioned seam: the smoke subcommand is implemented in the immediately
  // following change (task 2.6). Until then it is a known command that fails
  // with a clear error instead of silently doing nothing.
  throw new SlideWorkflowError(
    "The 'smoke' command is not available in this build yet; it arrives in the next change.",
    "SMOKE_NOT_AVAILABLE",
  );
}

export async function runCli(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    console.log(usage());
    return 0;
  }

  try {
    if (!VALID_COMMANDS.includes(command)) {
      throw new SlideWorkflowError(
        `'${command}' is not a takt-marp command. Valid commands: ${VALID_COMMANDS.join(", ")}. Run 'takt-marp --help' for usage.`,
        "UNKNOWN_COMMAND",
      );
    }
    if (command === "init") {
      return await runInit(rest);
    }
    if (command === "smoke") {
      return runSmoke();
    }
    return await runWorkflowCommand(command, rest);
  } catch (error) {
    console.error(formatError(error));
    return 1;
  }
}
