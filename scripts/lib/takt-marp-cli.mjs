import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { initializeProject } from "./takt-marp-project-init.mjs";
import { ejectProject } from "./takt-marp-project-eject.mjs";
import { resolveTemplateSource, workflowFilePath } from "./takt-marp-project-templates.mjs";
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
const VALID_COMMANDS = ["eject", ...WORKFLOW_COMMANDS, "approve", "smoke", ...UTILITY_COMMANDS];
const RUNNER_SCRIPT = "scripts/takt-marp-run-slide-workflow.mjs";
const APPROVE_SCRIPT = "scripts/takt-marp-approve-slide-workflow-state.mjs";
const SMOKE_SCRIPT = "scripts/takt-marp-validate-slide-workflow-smoke.mjs";
const BUILD_SCRIPT = "scripts/takt-marp-build-slide-artifact.mjs";
const PREVIEW_SCRIPT = "scripts/takt-marp-preview-slide.mjs";
const FORWARDED_SIGNALS = new Set(["SIGINT", "SIGTERM"]);

function usage() {
  return [
    "Usage: takt-marp <command> [arguments]",
    "",
    "Commands:",
    "  eject [dir] [--force|--overwrite] Copy .takt/workflows and .takt/facets templates into <dir> (default: .)",
    "  plan <slides/deck> [options]      Run the plan workflow for a deck in the current project",
    "  compose <slides/deck> [options]   Run the compose workflow for a deck in the current project",
    "  polish <slides/deck> [options]    Run the polish workflow for a deck in the current project",
    "  deliver <slides/deck> [options]   Run the deliver workflow for a deck in the current project",
    "  approve <slides/deck> <command> --by <name> [--force]",
    "                                    Approve a workflow state (command: plan or compose)",
    "  smoke [--provider <name>]         Run smoke validation in a temporary project (default provider: mock)",
    "  build:html [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "                                    Build HTML artifact without changing workflow state",
    "  build:pdf [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "                                    Build PDF artifact without changing workflow state",
    "  build:pptx [deck|slides/<deck>|slides/<deck>/SLIDES.md]",
    "                                    Build PPTX artifact without changing workflow state",
    "  preview <deck|slides/<deck>|slides/<deck>/SLIDES.md>",
    "                                    Start Marp server mode without changing workflow state",
    "",
    "Workflow options (passed through to the workflow runner unchanged):",
    "  --force            Invalidate an already-successful state and rerun",
    "  --provider <name>  Run the workflow with the specified TAKT provider",
  ].join("\n");
}

function ejectUsage() {
  return [
    "Usage: takt-marp eject [dir] [--force|--overwrite]",
    "",
    "Copies .takt/workflows/** and .takt/facets/** templates into <dir> (default: current directory).",
    "",
    "Options:",
    "  --force      Overwrite existing template-owned files",
    "  --overwrite  Alias of --force",
    "  --help       Show this message",
  ].join("\n");
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
  const source = resolveTemplateSource({ projectRoot: process.cwd() });
  const selectedWorkflowFilePath = workflowFilePath(source, command);
  return runPackageScript(RUNNER_SCRIPT, [command, ...args, "--workflow-file", selectedWorkflowFilePath]);
}

async function runBuildCommand(command, args) {
  return runPackageScript(BUILD_SCRIPT, [BUILD_COMMANDS[command], ...args]);
}

async function runPreview(args) {
  return runPackageScript(PREVIEW_SCRIPT, args, { successOnSignal: true });
}

async function runEject(args) {
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
      `Invalid eject arguments: ${error.message}. Run 'takt-marp eject --help' for usage.`,
      "INVALID_ARGS",
    );
  }
  if (parsed.values.help) {
    console.log(ejectUsage());
    return 0;
  }
  if (parsed.positionals.length > 1) {
    throw new SlideWorkflowError(
      `Unexpected extra eject arguments: ${parsed.positionals.slice(1).join(" ")}. Run 'takt-marp eject --help' for usage.`,
      "INVALID_ARGS",
    );
  }

  const targetDir = path.resolve(process.cwd(), parsed.positionals[0] ?? ".");
  const force = parsed.values.force || parsed.values.overwrite;
  const { created, overwritten } = await ejectProject({ targetDir, force });

  const lines = [`Ejected takt-marp templates in ${targetDir}`];
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
    "  - Edit ejected workflow/facet templates only when you need project-local customization.",
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
    if (command === "init") {
      throw new SlideWorkflowError(
        "`init` has been removed. Use `takt-marp eject .` to copy template assets.",
        "COMMAND_REMOVED",
      );
    }
    if (!VALID_COMMANDS.includes(command)) {
      throw new SlideWorkflowError(
        `'${command}' is not a takt-marp command. Valid commands: ${VALID_COMMANDS.join(", ")}. Run 'takt-marp --help' for usage.`,
        "UNKNOWN_COMMAND",
      );
    }
    if (command === "eject") {
      return await runEject(rest);
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
