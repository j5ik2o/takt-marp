#!/usr/bin/env node
import {
  checkRequiredState,
  formatError,
  parseArgs,
  parseRequiredState,
  resolveDeckTarget,
} from "./lib/takt-marp-slide-workflow.mjs";

function usage() {
  return [
    "Usage: node scripts/takt-marp-check-slide-workflow-state.mjs <target> --require <command>:<state>[:approved]",
    "",
    "Examples:",
    "  npm run slide:check-state -- \"slides/my-talk\" --require plan:planned:approved",
    "  npm run slide:check-state -- \"slides/my-talk\" --require polish:polished",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }
  const [target] = positional;
  const requirementText = flags.require;
  if (!target || !requirementText) {
    throw new Error(usage());
  }

  const targetInfo = resolveDeckTarget(target);
  const requirement = parseRequiredState(requirementText);
  await checkRequiredState(targetInfo, requirement);
  console.log(`state ok: ${targetInfo.target} ${requirementText}`);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
