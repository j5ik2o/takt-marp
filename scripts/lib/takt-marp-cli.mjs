import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { initializeProject } from "./takt-marp-project-init.mjs";
import { packageScriptPath } from "./takt-marp-runtime-context.mjs";
import {
  APPROVAL_COMMANDS,
  formatError,
  SlideWorkflowError,
} from "./takt-marp-slide-workflow.mjs";

const WORKFLOW_COMMANDS = ["plan", "compose", "polish", "deliver"];
const BUILD_COMMANDS = Object.freeze({
  "build:html": "html",
  "build:pdf": "pdf",
  "build:pptx": "pptx",
});
const UTILITY_COMMANDS = [...Object.keys(BUILD_COMMANDS), "preview"];
const VALID_COMMANDS = ["init", ...WORKFLOW_COMMANDS, ...UTILITY_COMMANDS, "approve", "smoke"];
const RUNNER_SCRIPT = "scripts/takt-marp-run-slide-workflow.mjs";
const APPROVE_SCRIPT = "scripts/takt-marp-approve-slide-workflow-state.mjs";
const SMOKE_SCRIPT = "scripts/takt-marp-validate-slide-workflow-smoke.mjs";
const BUILD_SCRIPT = "scripts/takt-marp-build-slide-artifact.mjs";
const PREVIEW_SCRIPT = "scripts/takt-marp-preview-slide.mjs";
const REQUIRED_PROJECT_DIRS = [".takt/workflows", ".takt/facets"];
const FORWARDED_SIGNALS = new Set(["SIGINT", "SIGTERM"]);

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
    "  build:html [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "                                    Build HTML artifact without changing workflow state",
    "  build:pdf [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "                                    Build PDF artifact without changing workflow state",
    "  build:pptx [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "                                    Build PPTX artifact without changing workflow state",
    "  preview <deck|slides/<deck>|slides/<deck>/SLIDES.md>",
    "                                    Start Marp server mode without changing workflow state",
    "  approve <slides/deck> <command> --by <name> [--force]",
    "                                    Approve a workflow state (command: plan or compose)",
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

function runPackageScript(relativeScriptPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stopping = false;
    const child = spawn(process.execPath, [packageScriptPath(relativeScriptPath), ...args], {
      cwd: options.cwd ?? process.cwd(),
      stdio: "inherit",
    });
    const signalHandlers = [];
    if (options.successOnSignal) {
      for (const signal of FORWARDED_SIGNALS) {
        const handler = () => {
          stopping = true;
          if (!child.killed) {
            child.kill(signal);
          }
        };
        process.once(signal, handler);
        signalHandlers.push([signal, handler]);
      }
    }
    const cleanup = () => {
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
    };
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code, signal) => {
      cleanup();
      if (options.successOnSignal && (stopping || FORWARDED_SIGNALS.has(signal))) {
        resolve(0);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function runWorkflowCommand(command, args) {
  assertProjectInitialized();
  return runPackageScript(RUNNER_SCRIPT, [command, ...args]);
}

async function runBuildCommand(command, args) {
  return runPackageScript(BUILD_SCRIPT, [BUILD_COMMANDS[command], ...args]);
}

async function runPreview(args) {
  return runPackageScript(PREVIEW_SCRIPT, args, { successOnSignal: true });
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

async function runSmoke(args) {
  // Smoke runs in a freshly created temporary project so the user's current
  // project is never touched. The temp project is retained after the run as
  // the home of the provider-specific smoke summaries.
  let tempProject;
  try {
    tempProject = await mkdtemp(path.join(os.tmpdir(), "takt-marp-smoke-"));
  } catch (error) {
    throw new SlideWorkflowError(
      `Failed to create a temporary smoke project under ${os.tmpdir()}: ${error.message}`,
      "SMOKE_PREPARE_FAILED",
    );
  }
  await initializeProject({ targetDir: tempProject, force: false });
  console.log(`Temporary smoke project: ${tempProject}`);

  // Pass argv through unchanged: provider selection (--provider) and the
  // mock default, mock/real summary generation, and surfacing real-provider
  // misconfiguration as failures are all owned by the smoke script. The CLI
  // never creates or modifies TAKT provider settings.
  const exitCode = await runPackageScript(SMOKE_SCRIPT, args, { cwd: tempProject });

  console.log(
    [
      "",
      `Smoke validation finished with exit code ${exitCode}.`,
      `Temporary smoke project (retained for inspection): ${tempProject}`,
      "Provider-specific smoke summaries are written under the smoke deck's review directory",
      `inside that project (default: ${path.join(tempProject, "slides", "_workflow-smoke", "review")}).`,
    ].join("\n"),
  );
  return exitCode;
}

function approveUsage() {
  return [
    "Usage: takt-marp approve <slides/deck> <command> --by <name> [--force]",
    "",
    `Commands: ${APPROVAL_COMMANDS.join(", ")}`,
    "",
    "Options:",
    "  --by <name>   Approver identifier (required)",
    "  --force       Overwrite an existing approval",
    "  --help, -h    Show this message",
  ].join("\n");
}

async function runApprove(args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        by: { type: "string" },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    throw new SlideWorkflowError(
      `Invalid approve arguments: ${error.message}. Run 'takt-marp approve --help' for usage.`,
      "INVALID_ARGS",
    );
  }
  if (parsed.values.help) {
    console.log(approveUsage());
    return 0;
  }
  assertProjectInitialized();
  if (parsed.positionals.length !== 2) {
    throw new SlideWorkflowError(
      `Expected <slides/deck> and <command>. Run 'takt-marp approve --help' for usage.`,
      "INVALID_ARGS",
    );
  }
  const [target, command] = parsed.positionals;
  if (!parsed.values.by) {
    throw new SlideWorkflowError(
      `Missing required --by <name>. Run 'takt-marp approve --help' for usage.`,
      "INVALID_ARGS",
    );
  }
  const approveArgs = [target, command, "--by", parsed.values.by];
  if (parsed.values.force) {
    approveArgs.push("--force");
  }
  return runPackageScript(APPROVE_SCRIPT, approveArgs);
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
    if (command === "approve") {
      return await runApprove(rest);
    }
    if (command === "smoke") {
      return await runSmoke(rest);
    }
    if (Object.hasOwn(BUILD_COMMANDS, command)) {
      return await runBuildCommand(command, rest);
    }
    if (command === "preview") {
      return await runPreview(rest);
    }
    return await runWorkflowCommand(command, rest);
  } catch (error) {
    console.error(formatError(error));
    return 1;
  }
}
