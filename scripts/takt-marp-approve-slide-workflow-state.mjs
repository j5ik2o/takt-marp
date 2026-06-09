#!/usr/bin/env node
import {
  formatError,
  parseArgs,
  resolveDeckTarget,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";

function usage() {
  return [
    "Usage: node scripts/takt-marp-approve-slide-workflow-state.mjs <target> <command> --by <name> [--force]",
    "",
    "Examples:",
    "  npm run slide:approve -- \"slides/my-talk\" plan --by j5ik2o",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }
  const [target, command] = positional;
  if (!target || !command || !flags.by) {
    throw new Error(usage());
  }

  const targetInfo = resolveDeckTarget(target);
  const filePath = await writeApproval(targetInfo, command, flags.by, { force: flags.force });
  console.log(`approval written: ${filePath}`);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
