#!/usr/bin/env node
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  TEMPLATE_DOMAINS,
  assertNoProhibitedEntries,
  countTemplateDriftPaths,
  diffTemplateTrees,
  formatTemplateDrift,
  listTemplateEntries,
  templateRootPath,
} from "./lib/takt-marp-project-templates.mjs";
import { resolveRuntimeContext } from "./lib/takt-marp-runtime-context.mjs";
import { SlideWorkflowError, formatError } from "./lib/takt-marp-slide-workflow.mjs";

function usage() {
  return [
    "Usage: node scripts/takt-marp-sync-project-templates.mjs [--write]",
    "",
    "Default mode checks that templates/project matches the dev .takt",
    `{${TEMPLATE_DOMAINS.join(",")}} trees and fails with TEMPLATE_DRIFT on any drift.`,
    "",
    "Options:",
    "  --write     Sync dev .takt -> templates/project before checking.",
    "  -h, --help  Show this help.",
    "",
    "Examples:",
    "  npm run installer:check-templates",
    "  npm run installer:sync-templates",
  ].join("\n");
}

function parseSyncArgs(argv) {
  const options = { write: false, help: false };
  for (const arg of argv) {
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new SlideWorkflowError(`Unknown argument '${arg}'.\n${usage()}`, "INVALID_ARGS");
    }
  }
  return options;
}

async function main() {
  const options = parseSyncArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const templateRoot = templateRootPath();
  const devTaktRoot = path.join(resolveRuntimeContext().packageRoot, ".takt");

  if (options.write) {
    await syncTemplates(templateRoot, devTaktRoot);
  }

  const drift = await diffTemplateTrees(templateRoot, devTaktRoot);
  const driftCount = countTemplateDriftPaths(drift);
  if (driftCount > 0) {
    for (const line of formatTemplateDrift(drift)) {
      console.error(line);
    }
    throw new SlideWorkflowError(
      `templates/project drifted from dev .takt in ${driftCount} path(s). Run \`npm run installer:sync-templates\` to sync.`,
      "TEMPLATE_DRIFT",
    );
  }

  const entryCount = (await listTemplateEntries({ templateRoot })).length;
  console.log(`template check ok: templates/project matches dev .takt/{${TEMPLATE_DOMAINS.join(",")}} (${entryCount} files).`);
}

async function syncTemplates(templateRoot, devTaktRoot) {
  const devEntries = await listTemplateEntries({ templateRoot: devTaktRoot });
  assertNoProhibitedEntries(devEntries);

  const devPaths = new Set(devEntries.map((entry) => entry.relativePath));
  const removed = (await listTemplateEntries({ templateRoot }))
    .map((entry) => entry.relativePath)
    .filter((relativePath) => !devPaths.has(relativePath));

  await mkdir(templateRoot, { recursive: true });
  for (const domain of TEMPLATE_DOMAINS) {
    const templateDomainDir = path.join(templateRoot, domain);
    const devDomainDir = path.join(devTaktRoot, domain);
    await rm(templateDomainDir, { recursive: true, force: true });
    if (existsSync(devDomainDir)) {
      await cp(devDomainDir, templateDomainDir, { recursive: true });
    }
  }

  assertNoProhibitedEntries(await listTemplateEntries({ templateRoot }));

  console.log(`synced templates/project from dev .takt (${devEntries.length} files):`);
  for (const entry of devEntries) {
    console.log(`  - ${entry.relativePath}`);
  }
  if (removed.length > 0) {
    console.log(`removed stale template files (${removed.length}):`);
    for (const relativePath of removed) {
      console.log(`  - ${relativePath}`);
    }
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
