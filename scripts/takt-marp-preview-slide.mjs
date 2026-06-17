#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  formatError,
  parseArgs,
  SlideWorkflowError,
} from "./lib/takt-marp-slide-workflow.mjs";
import { resolveSlideArtifactTarget } from "./lib/takt-marp-slide-artifact-target.mjs";
import { runtimeExecutablePath } from "./lib/takt-marp-runtime-context.mjs";

const PREVIEW_STOP_SIGNALS = new Set(["SIGINT", "SIGTERM"]);

function usage() {
  return [
    "Usage: takt-marp preview <deck|slides/<deck>|slides/<deck>/SLIDES.md>",
    "",
    "Starts Marp server mode for the target deck directory without running a TAKT workflow.",
    "",
    "Examples:",
    "  takt-marp preview my-talk",
    "  takt-marp preview slides/my-talk",
    "  takt-marp preview slides/my-talk/SLIDES.md",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }
  if (positional.length !== 1) {
    throw new SlideWorkflowError(usage(), "INVALID_ARGS");
  }

  const target = resolveSlideArtifactTarget(positional[0]);
  const marpPath = runtimeExecutablePath("marp");
  const result = await run(marpPath, [
    target.deckPath,
    "--server",
    "--html",
    "--allow-local-files",
  ]);
  if (!result.ok) {
    throw new SlideWorkflowError(`Marp preview failed for slides/${target.deckName}/SLIDES.md`, "MARP_PREVIEW_FAILED");
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    let stopping = false;
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    const signalHandlers = [];
    for (const signal of PREVIEW_STOP_SIGNALS) {
      const handler = () => {
        stopping = true;
        if (!child.killed) {
          child.kill(signal);
        }
      };
      process.once(signal, handler);
      signalHandlers.push([signal, handler]);
    }
    const cleanup = () => {
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
    };
    child.on("error", (error) => {
      cleanup();
      reject(
        new SlideWorkflowError(
          `Failed to start Marp executable: ${command}. Reinstall takt-marp and verify the @marp-team/marp-cli dependency. ${error.message}`,
          "MARP_EXECUTABLE_MISSING",
        ),
      );
    });
    child.on("close", (code, signal) => {
      cleanup();
      resolve({ ok: stopping || PREVIEW_STOP_SIGNALS.has(signal) || code === 0 });
    });
  });
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
