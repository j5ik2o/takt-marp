#!/usr/bin/env node
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PROHIBITED_TEMPLATE_PATTERNS,
  TEMPLATE_DOMAINS,
  assertNoProhibitedEntries,
  listTemplateEntries,
  templateRootPath,
} from "./lib/takt-marp-project-templates.mjs";
import { resolveRuntimeContext } from "./lib/takt-marp-runtime-context.mjs";
import { SlideWorkflowError, formatError } from "./lib/takt-marp-errors.mjs";

const GROUPS = ["template tree", "pack contents", "metadata"];

const ALLOWED_PACK_PREFIXES = ["bin/", "scripts/", "templates/", "fixtures/marp-slide-workflow/"];
const ALLOWED_PACK_FILES = ["marp.config.mjs", "package.json"];
const ALLOWED_PACK_FILE_PATTERNS = [/^readme($|\.)/i, /^licen[cs]e($|\.)/i];

const FORBIDDEN_PACK_PREFIXES = [
  ".kiro/",
  ".takt/",
  ".claude/",
  ".agents/",
  "slides/",
  "docs/",
  "dist/",
  "node_modules/",
];

// Local helper files under scripts/ (e.g. run-claude-*.sh kept out of git via
// .git/info/exclude) are still picked up by `npm pack` because `files` lists the
// directory. Only the canonical script naming is allowed in the pack.
const EXPECTED_SCRIPT_PATTERNS = [/^scripts\/takt-marp-[^/]+\.mjs$/, /^scripts\/lib\/takt-marp-[^/]+\.mjs$/];

export const REQUIRED_PACK_FILES = [
  "bin/takt-marp.mjs",
  "marp.config.mjs",
  "scripts/takt-marp-run-slide-workflow.mjs",
  "scripts/takt-marp-validate-slide-workflow-smoke.mjs",
  "scripts/lib/takt-marp-cli.mjs",
  "scripts/lib/takt-marp-errors.mjs",
  "scripts/lib/takt-marp-project-eject.mjs",
  "scripts/lib/takt-marp-project-templates.mjs",
  "scripts/lib/takt-marp-runtime-context.mjs",
  "scripts/lib/takt-marp-slide-workflow.mjs",
];
const SMOKE_FIXTURE_PREFIX = "fixtures/marp-slide-workflow/_workflow-smoke/";

const EXPECTED_FILES_ALLOWLIST = ["bin/", "scripts/", "templates/", "fixtures/marp-slide-workflow/", "marp.config.mjs"];
const EXPECTED_BIN_NAME = "takt-marp";
const EXPECTED_BIN_TARGET = "bin/takt-marp.mjs";
const EXPECTED_ENGINES_NODE = ">=24";
const REQUIRED_DEPENDENCIES = ["takt", "@marp-team/marp-cli"];

function runNpmPackDryRun(packageRoot) {
  const npmCli = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolve, reject) => {
    const child = spawn(npmCli, ["pack", "--dry-run", "--json"], {
      cwd: packageRoot,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new SlideWorkflowError(`npm pack --dry-run failed with exit code ${code}.\n${stderr}`, "NPM_PACK_FAILED"));
        return;
      }
      resolve(stdout);
    });
  });
}

function parsePackOutput(stdout) {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    // npm can prepend non-JSON noise (lifecycle/banner output); the JSON report
    // is the last array in stdout, so retry from the last line that opens one.
    const start = text.lastIndexOf("\n[");
    if (start !== -1) {
      try {
        return JSON.parse(text.slice(start + 1));
      } catch {
        // fall through to the error below
      }
    }
  }
  throw new SlideWorkflowError(`Unable to parse JSON output of npm pack --dry-run.\n${text}`, "NPM_PACK_FAILED");
}

function packedPaths(packReport) {
  if (!Array.isArray(packReport) || packReport.length === 0 || !Array.isArray(packReport[0]?.files)) {
    throw new SlideWorkflowError(
      `npm pack --dry-run --json returned an unexpected shape (expected [{ files: [...] }]).`,
      "NPM_PACK_FAILED",
    );
  }
  return packReport[0].files.map((file) => file.path.split(path.sep).join("/")).sort();
}

async function checkTemplateTree(addViolation) {
  const templateRoot = templateRootPath();
  const entries = await listTemplateEntries();

  if (entries.length === 0) {
    addViolation("template tree", `template canon is empty: no files under ${templateRoot}/{${TEMPLATE_DOMAINS.join(",")}}`);
  }

  let rootEntries = [];
  try {
    rootEntries = await readdir(templateRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      addViolation("template tree", `template root is missing: ${templateRoot}`);
    } else {
      throw error;
    }
  }
  for (const dirent of rootEntries) {
    if (!TEMPLATE_DOMAINS.includes(dirent.name) || !dirent.isDirectory()) {
      addViolation("template tree", `unexpected entry outside {${TEMPLATE_DOMAINS.join(",")}} domains: ${dirent.name}`);
    }
  }

  try {
    assertNoProhibitedEntries(entries);
  } catch (error) {
    if (error instanceof SlideWorkflowError && error.code === "PACKAGE_BOUNDARY_VIOLATION") {
      addViolation("template tree", error.message);
    } else {
      throw error;
    }
  }

  return entries;
}

function isAllowedPackPath(packedPath) {
  return (
    ALLOWED_PACK_PREFIXES.some((prefix) => packedPath.startsWith(prefix)) ||
    ALLOWED_PACK_FILES.includes(packedPath) ||
    ALLOWED_PACK_FILE_PATTERNS.some((pattern) => pattern.test(packedPath))
  );
}

export function checkPackContents(paths, templateEntries, addViolation) {
  const packed = new Set(paths);

  for (const packedPath of paths) {
    const forbiddenPrefix = FORBIDDEN_PACK_PREFIXES.find((prefix) => packedPath.startsWith(prefix));
    if (forbiddenPrefix) {
      addViolation("pack contents", `forbidden path (matches denied prefix '${forbiddenPrefix}'): ${packedPath}`);
    } else if (!isAllowedPackPath(packedPath)) {
      addViolation("pack contents", `path outside the files allowlist: ${packedPath}`);
    }

    const prohibited = PROHIBITED_TEMPLATE_PATTERNS.find((pattern) => pattern.test(packedPath));
    if (prohibited) {
      addViolation("pack contents", `path matches prohibited pattern ${prohibited}: ${packedPath}`);
    }

    if (packedPath.startsWith("scripts/") && !EXPECTED_SCRIPT_PATTERNS.some((pattern) => pattern.test(packedPath))) {
      addViolation(
        "pack contents",
        `unexpected scripts/ file (expected scripts/takt-marp-*.mjs or scripts/lib/takt-marp-*.mjs): ${packedPath}`,
      );
    }
  }

  for (const requiredPath of REQUIRED_PACK_FILES) {
    if (!packed.has(requiredPath)) {
      addViolation("pack contents", `required file missing from pack: ${requiredPath}`);
    }
  }
  if (!paths.some((packedPath) => packedPath.startsWith(SMOKE_FIXTURE_PREFIX))) {
    addViolation("pack contents", `required smoke fixture missing from pack: no file under ${SMOKE_FIXTURE_PREFIX}`);
  }
  for (const entry of templateEntries) {
    const expectedPath = `templates/project/${entry.relativePath}`;
    if (!packed.has(expectedPath)) {
      addViolation("pack contents", `template entry missing from pack: ${expectedPath}`);
    }
  }
}

async function checkMetadata(packageRoot, addViolation) {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

  const binTarget = manifest.bin?.[EXPECTED_BIN_NAME];
  if (binTarget !== EXPECTED_BIN_TARGET) {
    addViolation(
      "metadata",
      `bin["${EXPECTED_BIN_NAME}"] must be "${EXPECTED_BIN_TARGET}" (found: ${JSON.stringify(binTarget)})`,
    );
  } else {
    try {
      accessSync(path.join(packageRoot, EXPECTED_BIN_TARGET), constants.F_OK | constants.X_OK);
    } catch {
      addViolation("metadata", `bin entrypoint is missing or not executable: ${EXPECTED_BIN_TARGET}`);
    }
  }

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  for (const expected of EXPECTED_FILES_ALLOWLIST) {
    if (!files.includes(expected)) {
      addViolation("metadata", `files allowlist is missing "${expected}"`);
    }
  }
  for (const declared of files) {
    if (!EXPECTED_FILES_ALLOWLIST.includes(declared)) {
      addViolation("metadata", `files allowlist declares an entry outside the design boundary: "${declared}"`);
    }
  }

  if (manifest.engines?.node !== EXPECTED_ENGINES_NODE) {
    addViolation(
      "metadata",
      `engines.node must be "${EXPECTED_ENGINES_NODE}" (found: ${JSON.stringify(manifest.engines?.node)})`,
    );
  }

  for (const dependency of REQUIRED_DEPENDENCIES) {
    if (!manifest.dependencies?.[dependency]) {
      addViolation("metadata", `runtime dependency missing from dependencies: ${dependency}`);
    }
  }
}

async function main() {
  const packageRoot = resolveRuntimeContext().packageRoot;
  const violations = [];
  const addViolation = (group, detail) => violations.push({ group, detail });

  const templateEntries = await checkTemplateTree(addViolation);
  const paths = packedPaths(parsePackOutput(await runNpmPackDryRun(packageRoot)));
  checkPackContents(paths, templateEntries, addViolation);
  await checkMetadata(packageRoot, addViolation);

  if (violations.length > 0) {
    for (const group of GROUPS) {
      const grouped = violations.filter((violation) => violation.group === group);
      if (grouped.length === 0) {
        continue;
      }
      console.error(`${group} violations (${grouped.length}):`);
      for (const violation of grouped) {
        console.error(`  - ${violation.detail}`);
      }
    }
    throw new SlideWorkflowError(
      `package boundary check failed with ${violations.length} violation(s) across ${new Set(violations.map((violation) => violation.group)).size} group(s). See the list above.`,
      "PACKAGE_BOUNDARY_VIOLATION",
    );
  }

  console.log(
    `package boundary check ok: ${GROUPS.length} groups checked, ${paths.length} packed files, ${templateEntries.length} template entries.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(formatError(error));
    process.exit(1);
  });
}
