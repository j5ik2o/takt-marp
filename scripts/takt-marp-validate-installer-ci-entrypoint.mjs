#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_COMMANDS = [
  "npm run slide:validate-foundation",
  "npm run installer:check-templates",
  "npm run installer:check-package",
  "npm run installer:validate",
  "npm run slide:smoke -- --provider mock",
];

const CI_ENTRYPOINT = "npm run installer:ci";
const WORKFLOW_FILES = [".github/workflows/ci.yml", ".github/workflows/release.yml"];

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);

function splitShellSequence(script) {
  return script
    .split(/\s*&&\s*/u)
    .map((command) => command.trim())
    .filter(Boolean);
}

function assertExactCommandList(actual, expected, label, violations) {
  if (actual.length !== expected.length || actual.some((command, index) => command !== expected[index])) {
    violations.push(`${label} must be exactly:\n${expected.map((command) => `  - ${command}`).join("\n")}\nfound:\n${actual.map((command) => `  - ${command}`).join("\n")}`);
  }
}

function runLines(workflowSource) {
  return workflowSource
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("run: "))
    .map((line) => line.slice("run: ".length).trim());
}

function assertNoRealProviderSmoke(label, source, violations) {
  const realProviderMatches = [...source.matchAll(/npm run slide:smoke\b(?!\s+--\s+--provider\s+mock\b)([^\n]*)/gu)];
  for (const match of realProviderMatches) {
    violations.push(`${label} must not require non-mock or implicit smoke provider: npm run slide:smoke${match[1]}`);
  }

  const providerMatches = [...source.matchAll(/--provider\s+([^\s]+)/gu)].map((match) => match[1]);
  const nonMockProviders = providerMatches.filter((provider) => provider !== "mock");
  if (nonMockProviders.length > 0) {
    violations.push(`${label} must not require real provider smoke: ${nonMockProviders.join(", ")}`);
  }
}

async function main() {
  const violations = [];
  const manifest = JSON.parse(await readFile(path.join(ROOT_DIR, "package.json"), "utf8"));
  const installerCiScript = manifest.scripts?.["installer:ci"];

  if (!installerCiScript) {
    violations.push('package.json scripts must define "installer:ci" as the local CI validation entrypoint.');
  } else {
    assertExactCommandList(splitShellSequence(installerCiScript), REQUIRED_COMMANDS, 'package.json scripts["installer:ci"]', violations);
    assertNoRealProviderSmoke('package.json scripts["installer:ci"]', installerCiScript, violations);
  }

  for (const workflowFile of WORKFLOW_FILES) {
    const workflowSource = await readFile(path.join(ROOT_DIR, workflowFile), "utf8");
    const runs = runLines(workflowSource);
    const entrypointRuns = runs.filter((command) => command === CI_ENTRYPOINT);
    if (entrypointRuns.length !== 1) {
      violations.push(`${workflowFile} must run ${CI_ENTRYPOINT} exactly once (found ${entrypointRuns.length}).`);
    }

    if (runs.includes("npm test")) {
      violations.push(`${workflowFile} must not hide installer validation behind npm test.`);
    }
    assertNoRealProviderSmoke(workflowFile, workflowSource, violations);
  }

  if (violations.length > 0) {
    console.error("installer CI entrypoint validation failed:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`installer CI entrypoint validation passed: ${CI_ENTRYPOINT}`);
  console.log(`required commands:\n${REQUIRED_COMMANDS.map((command) => `- ${command}`).join("\n")}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
