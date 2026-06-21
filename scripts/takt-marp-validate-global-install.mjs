#!/usr/bin/env node
// GlobalInstallValidator: E2E validation of the real `npm pack` tarball through a
// temporary global install prefix (requirements 8.1-8.7, plus the E2E confirmation
// of the no-copy/eject command surface).
//
// Phase policy: phases run sequentially. If pack-install fails, every later phase
// is skipped (no installed CLI to exercise). Otherwise failures are collected and
// later phases keep running, except phases whose declared dependency failed; those
// are skipped with the blocking phase named. Any failure ends in
// GLOBAL_INSTALL_VALIDATION_FAILED with the failed phase name(s).
//
// Everything runs inside os.tmpdir(); the repo working tree is never modified.
// Temp directories are removed on success and retained (with paths printed) on
// failure for diagnosis.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertNoProhibitedEntries, listTemplateEntries } from "./lib/takt-marp-project-templates.mjs";
import { resolveRuntimeContext, runtimeExecutablePath } from "./lib/takt-marp-runtime-context.mjs";
import { SlideWorkflowError, formatError } from "./lib/takt-marp-slide-workflow.mjs";
import { writeClaudeDesignSmokeFixture } from "./lib/takt-marp-claude-design-source.mjs";

const CLI_COMMANDS = [
  "eject",
  "plan",
  "compose",
  "polish",
  "deliver",
  "build:html",
  "build:pdf",
  "build:pptx",
  "preview",
  "approve",
  "smoke",
];
// Runtime state / provider configuration that eject must never generate (3.3-3.4, 8.4).
const RUNTIME_STATE_NAMES = [
  "config.yaml",
  "provider-settings.yaml",
  "provider.yaml",
  "providers.yaml",
  "credentials.env",
  "credentials.json",
  "runs",
  "render",
  "persona_sessions.json",
  "session-state.json",
  "workflow-current-target.json",
];

const NPM_TIMEOUT_MS = 10 * 60 * 1000;
const CLI_TIMEOUT_MS = 5 * 60 * 1000;
const WORKFLOW_TIMEOUT_MS = 20 * 60 * 1000;
// The mandatory mock smoke runs the full workflow suite; give it a long leash.
const SMOKE_TIMEOUT_MS = 20 * 60 * 1000;

const PREPLACED_NOTES_CONTENT = "unrelated project file: takt-marp eject must leave this untouched\n";
const PREPLACED_LOCAL_CONTENT = "user-owned .takt note: not template-managed, must survive eject and --force\n";
const USER_PROVIDER_CONFIG_CONTENT = "provider: user-owned\n";
const USER_RUNTIME_STATE_CONTENT = "runtime state owned by the project\n";
const DETERMINISTIC_TAKT_RUN_NAME = "global-install-plan-success";

function check(condition, detail) {
  if (!condition) {
    throw new SlideWorkflowError(detail, "PHASE_ASSERTION_FAILED");
  }
}

function outputTail(text, limit = 2000) {
  return text.length > limit ? `...${text.slice(-limit)}` : text;
}

function commandSummary(result) {
  const signalNote = result.signal ? ` (terminated by ${result.signal})` : "";
  return `exit=${result.code}${signalNote}\nstdout: ${outputTail(result.stdout)}\nstderr: ${outputTail(result.stderr)}`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs ?? CLI_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr, output: `${stdout}\n${stderr}` });
    });
  });
}

function runNpm(args, options = {}) {
  const npmCli = process.platform === "win32" ? "npm.cmd" : "npm";
  return runCommand(npmCli, args, { ...options, timeoutMs: options.timeoutMs ?? NPM_TIMEOUT_MS });
}

// All takt-marp invocations resolve the binary via PATH with the temp prefix bin
// prepended (8.1: PATH-based execution, not a direct path to the install target).
function runTaktMarp(ctx, args, options = {}) {
  return runCommand("takt-marp", args, {
    cwd: options.cwd,
    env: { ...process.env, PATH: `${ctx.prefixBin}${path.delimiter}${process.env.PATH ?? ""}` },
    timeoutMs: options.timeoutMs ?? CLI_TIMEOUT_MS,
  });
}

function installedPackageRoot(prefixDir) {
  return process.platform === "win32"
    ? path.join(prefixDir, "node_modules", "takt-marp")
    : path.join(prefixDir, "lib", "node_modules", "takt-marp");
}

async function withDeterministicTaktExecutable(ctx, callback) {
  const packageRoot = ctx.installedPackageRoot;
  const executableDir = path.join(packageRoot, "node_modules", ".bin");
  await mkdir(executableDir, { recursive: true });
  const scriptPath = runtimeExecutablePath("takt", { root: packageRoot });
  const backupPath = path.join(ctx.workDir, `real-takt-bin-${process.pid}-${Date.now()}`);
  await rm(backupPath, { recursive: true, force: true });
  await rename(scriptPath, backupPath);
  await writeFile(scriptPath, deterministicTaktNodeScript(), { encoding: "utf8", mode: 0o755 });
  try {
    return await callback();
  } finally {
    await rm(scriptPath, { force: true });
    await rename(backupPath, scriptPath);
  }
}

function deterministicTaktNodeScript() {
  return `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RUN_NAME = ${JSON.stringify(DETERMINISTIC_TAKT_RUN_NAME)};
let workflow = "";
let target = "";
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-w" || arg === "--workflow") {
    workflow = args[index + 1] ?? "";
    index += 1;
  } else if (arg === "-t" || arg === "--target") {
    target = args[index + 1] ?? "";
    index += 1;
  }
}

console.log(\`[INFO] Running workflow: \${workflow}\`);
const reportsDir = path.join(process.cwd(), ".takt", "runs", RUN_NAME, "reports");
mkdirSync(reportsDir, { recursive: true });
const writeReport = (name, content) => writeFileSync(path.join(reportsDir, name), content, "utf8");

writeReport("brief.normalized.md", "# Normalized Brief\\n\\nGlobal install validator normalized brief.\\n");
writeReport("reference-analysis.md", "# Reference Deck Analysis\\n\\nGlobal install validator reference analysis.\\n");
writeReport("plan.md", "# Slide Plan\\n\\ndeliverables: [html, pdf]\\n\\nGlobal install validator plan.\\n");
writeReport("slide-blueprint.md", "# Slide Blueprint\\n\\nGlobal install validator blueprint.\\n");
writeReport("plan-supervision.md", [
  "---",
  "command: plan",
  \`target: \${target}\`,
  "generated_at: 2026-06-05T17:10:00+09:00",
  \`workflow_run_id: \${RUN_NAME}\`,
  "step: supervision",
  "cycle: 1",
  "state: planned",
  "result: passed",
  "blocking_findings: 0",
  "major_findings: 0",
  "minor_findings: 0",
  "info_findings: 0",
  "---",
  "",
  "# Supervision",
  "",
].join("\\n"));
`;
}

async function listFilesRecursive(rootDir) {
  let dirents;
  try {
    dirents = await readdir(rootDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return [];
    }
    throw error;
  }
  return dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.relative(rootDir, path.join(dirent.parentPath, dirent.name)).split(path.sep).join("/"))
    .sort();
}

async function snapshotDir(rootDir) {
  const snapshot = new Map();
  for (const relativePath of await listFilesRecursive(rootDir)) {
    const content = await readFile(path.join(rootDir, ...relativePath.split("/")));
    snapshot.set(relativePath, createHash("sha256").update(content).digest("hex"));
  }
  return snapshot;
}

function assertSnapshotsEqual(before, after, label) {
  const changes = [];
  for (const [relativePath, hash] of before) {
    const afterHash = after.get(relativePath);
    if (afterHash === undefined) {
      changes.push(`removed: ${relativePath}`);
    } else if (afterHash !== hash) {
      changes.push(`modified: ${relativePath}`);
    }
  }
  for (const relativePath of after.keys()) {
    if (!before.has(relativePath)) {
      changes.push(`added: ${relativePath}`);
    }
  }
  check(changes.length === 0, `${label}: filesystem changed: ${changes.join(", ")}`);
}

function assertOnlyAllowedSnapshotChanges(before, after, allowedChangedPaths, label) {
  const allowed = new Set(allowedChangedPaths);
  const changes = [];
  for (const [relativePath, hash] of before) {
    const afterHash = after.get(relativePath);
    if (afterHash === undefined) {
      changes.push(`removed: ${relativePath}`);
    } else if (afterHash !== hash && !allowed.has(relativePath)) {
      changes.push(`modified: ${relativePath}`);
    }
  }
  for (const relativePath of after.keys()) {
    if (!before.has(relativePath)) {
      changes.push(`added: ${relativePath}`);
    }
  }
  check(changes.length === 0, `${label}: unexpected filesystem changes: ${changes.join(", ")}`);
}

function projectPath(rootDir, relativePath) {
  return path.join(rootDir, ...relativePath.split("/"));
}

function assertTemplateAssetsAbsent(rootDir, label) {
  for (const relativePath of [".takt/workflows", ".takt/facets"]) {
    check(!existsSync(projectPath(rootDir, relativePath)), `${label}: template assets must not exist: ${relativePath}`);
  }
}

function assertProviderStateAbsent(rootDir, label) {
  for (const name of RUNTIME_STATE_NAMES) {
    check(!existsSync(path.join(rootDir, ".takt", name)), `${label}: provider/runtime state must not exist: .takt/${name}`);
  }
}

async function assertNoEjectBoundaryLeaks(projectDir, label) {
  const observed = await listFilesRecursive(path.join(projectDir, ".takt"));
  const statePattern = /(^|\/)(config\.yaml|provider-settings\.ya?ml|provider\.ya?ml|providers\.ya?ml|credentials\.(env|json)|persona_sessions\.json|session-state\.json|workflow-current-target\.json)$|(^|\/)(runs|render)(\/|$)|credential|api[^/]*key|secret|token/i;
  const stateLeaks = observed.filter((relativePath) => statePattern.test(relativePath));
  check(stateLeaks.length === 0, `${label}: provider/runtime state found under .takt: ${stateLeaks.join(", ")}`);
}

async function assertFileContent(filePath, expectedContent, label) {
  check(existsSync(filePath), `${label}: file is missing: ${filePath}`);
  const actual = await readFile(filePath, "utf8");
  check(actual === expectedContent, `${label}: file content changed: ${filePath}`);
}

async function assertNonEmptyFile(filePath, label) {
  check(existsSync(filePath), `${label}: file is missing: ${filePath}`);
  const actual = await readFile(filePath);
  check(actual.length > 0, `${label}: file is empty: ${filePath}`);
}

function assertWorkflowReachedSelectedPath(result, expectedPathFragment, label) {
  const expectedFragments = Array.isArray(expectedPathFragment) ? expectedPathFragment : [expectedPathFragment];
  check(
    result.code === 0,
    `${label}: workflow command must exit 0 after running the selected workflow.\n${commandSummary(result)}`,
  );
  check(
    result.output.includes("[INFO] Running workflow:"),
    `${label}: workflow command must reach TAKT workflow startup.\n${commandSummary(result)}`,
  );
  for (const fragment of expectedFragments) {
    check(
      result.output.includes(fragment),
      `${label}: workflow command must use expected workflow path fragment '${fragment}'.\n${commandSummary(result)}`,
    );
  }
  for (const forbiddenReason of [
    "PROJECT_NOT_INITIALIZED",
    "PROJECT_TEMPLATE_STATE_INVALID",
    "WORKFLOW_NOT_IMPLEMENTED",
    "TAKT_EXECUTABLE_MISSING",
  ]) {
    check(
      !result.output.includes(forbiddenReason),
      `${label}: workflow command must not fail before selected workflow startup (${forbiddenReason}).\n${commandSummary(result)}`,
    );
  }
}

async function prepareWorkflowProject(projectDir, deckName = "demo") {
  const deckDir = path.join(projectDir, "slides", deckName);
  await mkdir(deckDir, { recursive: true });
  const fixtureBrief = await readFile(
    path.join(resolveRuntimeContext().packageRoot, "fixtures", "marp-slide-workflow", "_workflow-smoke", "brief.md"),
    "utf8",
  );
  await writeFile(path.join(deckDir, "brief.md"), fixtureBrief, "utf8");
  await writeClaudeDesignSmokeFixture({ deckName }, { root: projectDir });
}

// Phase 1 (8.1): real tarball -> temp global prefix; later phases run the CLI
// from that prefix via PATH.
async function phasePackInstall(ctx) {
  const packDir = path.join(ctx.workDir, "pack");
  await mkdir(packDir, { recursive: true });
  const pack = await runNpm(["pack", "--pack-destination", packDir], { cwd: ctx.packageRoot });
  check(pack.code === 0, `npm pack failed.\n${commandSummary(pack)}`);
  const tarballs = (await readdir(packDir)).filter((name) => name.endsWith(".tgz"));
  check(tarballs.length === 1, `expected exactly one tarball under ${packDir}, found: ${tarballs.join(", ") || "(none)"}`);
  const tarballPath = path.join(packDir, tarballs[0]);

  const prefixDir = path.join(ctx.workDir, "prefix");
  await mkdir(prefixDir, { recursive: true });
  const install = await runNpm(["install", "-g", "--prefix", prefixDir, "--no-audit", "--no-fund", tarballPath], {
    cwd: ctx.workDir,
  });
  check(install.code === 0, `npm install -g --prefix failed.\n${commandSummary(install)}`);

  ctx.prefixBin = process.platform === "win32" ? prefixDir : path.join(prefixDir, "bin");
  ctx.installedPackageRoot = installedPackageRoot(prefixDir);
  const binPath = path.join(ctx.prefixBin, process.platform === "win32" ? "takt-marp.cmd" : "takt-marp");
  check(existsSync(binPath), `installed takt-marp binary not found at ${binPath}`);
  return `tarball ${tarballs[0]} installed into temp prefix`;
}

// Phase 2 (1.2, 1.3, 1.4, 8.2): help lists the no-copy/eject public
// commands, init is absent from help and rejected as a removed command, and
// slide:* remains outside the global CLI surface.
async function phaseSurface(ctx) {
  const help = await runTaktMarp(ctx, ["--help"], { cwd: ctx.workDir });
  check(help.code === 0, `takt-marp --help must exit 0.\n${commandSummary(help)}`);
  for (const command of CLI_COMMANDS) {
    check(
      new RegExp(`^  ${command}\\b`, "m").test(help.stdout),
      `takt-marp --help must list command '${command}'.\n${commandSummary(help)}`,
    );
  }
  check(
    !/^  init\b/m.test(help.stdout),
    `takt-marp --help must not list removed command 'init'.\n${commandSummary(help)}`,
  );

  const unknown = await runTaktMarp(ctx, ["slide:plan"], { cwd: ctx.workDir });
  check(unknown.code === 1, `takt-marp slide:plan must exit 1.\n${commandSummary(unknown)}`);
  check(
    unknown.output.includes("UNKNOWN_COMMAND"),
    `takt-marp slide:plan must be rejected with UNKNOWN_COMMAND.\n${commandSummary(unknown)}`,
  );

  const removed = await runTaktMarp(ctx, ["init", "."], { cwd: ctx.workDir });
  check(removed.code === 1, `takt-marp init . must exit 1.\n${commandSummary(removed)}`);
  check(
    removed.output.includes("COMMAND_REMOVED"),
    `takt-marp init . must fail with COMMAND_REMOVED.\n${commandSummary(removed)}`,
  );
  check(
    removed.output.includes("takt-marp eject ."),
    `removed init guidance must mention 'takt-marp eject .'.\n${commandSummary(removed)}`,
  );
  return "help lists no-copy/eject public commands; init removed; slide:* rejected";
}

// Phase 2b: utility commands must work from the installed CLI without requiring
// the target project to own package.json, node_modules, or .takt workflow state.
async function phaseUtilityCommands(ctx) {
  const projectDir = path.join(ctx.workDir, "utility-project");
  const deckDir = path.join(projectDir, "slides", "sample");
  await mkdir(deckDir, { recursive: true });
  await writeFile(
    path.join(deckDir, "SLIDES.md"),
    [
      "---",
      "marp: true",
      "html: true",
      "---",
      "",
      "# Utility Build",
      "",
      "<strong>HTML enabled</strong>",
      "",
    ].join("\n"),
    "utf8",
  );

  check(!existsSync(path.join(projectDir, "package.json")), "precondition: utility project must not have package.json");
  check(!existsSync(path.join(projectDir, "node_modules")), "precondition: utility project must not have node_modules");
  check(!existsSync(path.join(projectDir, ".takt")), "precondition: utility project must not have .takt");

  const html = await runTaktMarp(ctx, ["build:html", "slides/sample"], { cwd: projectDir });
  check(html.code === 0, `takt-marp build:html must exit 0 in a non-npm project.\n${commandSummary(html)}`);
  await assertNonEmptyFile(path.join(projectDir, "dist", "sample", "SLIDES.html"), "build:html output");

  const pdf = await runTaktMarp(ctx, ["build:pdf", "sample"], { cwd: projectDir });
  check(pdf.code === 0, `takt-marp build:pdf must exit 0 in a non-npm project.\n${commandSummary(pdf)}`);
  await assertNonEmptyFile(path.join(projectDir, "dist", "sample", "SLIDES.pdf"), "build:pdf output");

  const previewHelp = await runTaktMarp(ctx, ["preview", "--help"], { cwd: projectDir });
  check(previewHelp.code === 0, `takt-marp preview --help must exit 0.\n${commandSummary(previewHelp)}`);
  check(
    previewHelp.stdout.includes("Usage: takt-marp preview"),
    `preview help must show preview usage.\n${commandSummary(previewHelp)}`,
  );

  check(!existsSync(path.join(projectDir, ".takt")), "utility commands must not create .takt workflow state");
  return "build utilities ran without project package.json/node_modules/.takt; preview help is available";
}

// Phase 3 (2.2, 2.5, 8.3): a valid target project with no local templates,
// package.json, or node_modules runs via the globally installed CLI and does not
// receive copied workflow/facet assets.
async function phaseWorkflowCommandNoCopy(ctx) {
  const projectDir = path.join(ctx.workDir, "workflow-no-copy-project");
  await prepareWorkflowProject(projectDir);
  check(!existsSync(path.join(projectDir, "package.json")), "precondition: target project must not have package.json");
  check(!existsSync(path.join(projectDir, "node_modules")), "precondition: target project must not have node_modules");
  assertTemplateAssetsAbsent(projectDir, "precondition");

  const plan = await withDeterministicTaktExecutable(ctx, () =>
    runTaktMarp(ctx, ["plan", "slides/demo", "--provider", "mock"], {
      cwd: projectDir,
      timeoutMs: WORKFLOW_TIMEOUT_MS,
    }),
  );
  assertWorkflowReachedSelectedPath(
    plan,
    ["takt-marp-bundled-runtime-", "takt-marp-slide-plan.yaml"],
    "no-copy plan",
  );
  assertTemplateAssetsAbsent(projectDir, "after no-copy plan");
  return "plan completed through bundled workflow path without copying .takt/workflows or .takt/facets";
}

// Phase 4 (2.3, 2.4): both template domains are accepted as an ejected override,
// while either domain alone fails before TAKT starts.
async function phasePartialTemplateState(ctx) {
  const cases = [
    { name: "workflows-only", domain: "workflows", missing: "facets" },
    { name: "facets-only", domain: "facets", missing: "workflows" },
  ];

  for (const item of cases) {
    const projectDir = path.join(ctx.workDir, `partial-template-${item.name}`);
    await prepareWorkflowProject(projectDir);
    await mkdir(path.join(projectDir, ".takt", item.domain), { recursive: true });
    const result = await runTaktMarp(ctx, ["plan", "slides/demo", "--provider", "mock"], {
      cwd: projectDir,
      timeoutMs: WORKFLOW_TIMEOUT_MS,
    });
    check(result.code === 1, `${item.name} partial template state must exit 1.\n${commandSummary(result)}`);
    check(
      result.output.includes("PROJECT_TEMPLATE_STATE_INVALID"),
      `${item.name} partial template state must fail with PROJECT_TEMPLATE_STATE_INVALID.\n${commandSummary(result)}`,
    );
    check(
      result.output.includes(`.takt/${item.missing}`),
      `${item.name} failure must identify the missing template domain .takt/${item.missing}.\n${commandSummary(result)}`,
    );
    check(
      !existsSync(path.join(projectDir, ".takt", "runs")),
      `${item.name} partial template failure must happen before TAKT creates .takt/runs`,
    );
    check(
      !existsSync(path.join(projectDir, ".takt", "workflow-current-target.json")),
      `${item.name} partial template failure must happen before workflow target state is written`,
    );
  }

  const ejectedProjectDir = path.join(ctx.workDir, "ejected-override-project");
  await prepareWorkflowProject(ejectedProjectDir);
  const ejected = await runTaktMarp(ctx, ["eject", "."], { cwd: ejectedProjectDir });
  check(ejected.code === 0, `precondition: takt-marp eject . must exit 0 for ejected override.\n${commandSummary(ejected)}`);
  const ejectedWorkflowPath = path.join(ejectedProjectDir, ".takt", "workflows", "takt-marp-slide-plan.yaml");
  const ejectedWorkflowContent = `${await readFile(ejectedWorkflowPath, "utf8")}\n# user-owned ejected override: ordinary workflow execution must not replace this file\n`;
  await writeFile(ejectedWorkflowPath, ejectedWorkflowContent, "utf8");
  const plan = await withDeterministicTaktExecutable(ctx, () =>
    runTaktMarp(ctx, ["plan", "slides/demo", "--provider", "mock"], {
      cwd: ejectedProjectDir,
      timeoutMs: WORKFLOW_TIMEOUT_MS,
    }),
  );
  assertWorkflowReachedSelectedPath(
    plan,
    ".takt/workflows/takt-marp-slide-plan.yaml",
    "ejected override plan",
  );
  const afterPlanWorkflowContent = await readFile(ejectedWorkflowPath, "utf8");
  check(
    afterPlanWorkflowContent === ejectedWorkflowContent,
    "ordinary workflow execution must not auto-replace or merge user-owned ejected workflow assets",
  );
  return "partial template state rejected before TAKT; full ejected override completed without replacing custom assets";
}

// Phase 5 (3.1, 3.3, 3.4, 3.5, 8.4): eject generates exactly workflows/** and
// facets/** template entries under .takt, without provider/runtime state.
async function phaseEjectBoundary(ctx) {
  const projectDir = path.join(ctx.workDir, "eject-boundary-project");
  await mkdir(path.join(projectDir, ".takt"), { recursive: true });
  await writeFile(path.join(projectDir, "notes.md"), PREPLACED_NOTES_CONTENT, "utf8");
  await writeFile(path.join(projectDir, ".takt", "my-local.md"), PREPLACED_LOCAL_CONTENT, "utf8");

  ctx.templateEntries = await listTemplateEntries();
  assertNoProhibitedEntries(ctx.templateEntries);
  check(ctx.templateEntries.length > 0, "template canon is empty; cannot validate eject output");

  const eject = await runTaktMarp(ctx, ["eject", "."], { cwd: projectDir });
  check(eject.code === 0, `takt-marp eject . must exit 0.\n${commandSummary(eject)}`);
  check(eject.stdout.includes("Ejected takt-marp templates"), `eject output must confirm template ejection.\n${commandSummary(eject)}`);

  const taktDir = path.join(projectDir, ".takt");
  const observed = await listFilesRecursive(taktDir);
  const expected = ["my-local.md", ...ctx.templateEntries.map((entry) => entry.relativePath)].sort();
  const expectedSet = new Set(expected);
  const observedSet = new Set(observed);
  const unexpected = observed.filter((relativePath) => !expectedSet.has(relativePath));
  const missing = expected.filter((relativePath) => !observedSet.has(relativePath));
  check(
    unexpected.length === 0 && missing.length === 0,
    `eject output mismatch under .takt.${unexpected.length > 0 ? ` unexpected: ${unexpected.join(", ")}.` : ""}${missing.length > 0 ? ` missing: ${missing.join(", ")}.` : ""}`,
  );

  assertProviderStateAbsent(projectDir, "after eject");
  await assertNoEjectBoundaryLeaks(projectDir, "after eject");
  await assertFileContent(path.join(projectDir, "notes.md"), PREPLACED_NOTES_CONTENT, "pre-placed project file after eject");
  await assertFileContent(path.join(taktDir, "my-local.md"), PREPLACED_LOCAL_CONTENT, "pre-placed .takt file after eject");

  ctx.ejectedProjectDir = projectDir;
  ctx.snapshotAfterEject = await snapshotDir(projectDir);
  return `eject generated exactly ${ctx.templateEntries.length} template files; provider/runtime state absent`;
}

// Phase 6 (4.1-4.5, 8.5): repeated eject fails with EJECT_CONFLICT and zero
// writes; --force and --overwrite restore template-owned files only.
async function phaseEjectConflictForce(ctx) {
  const conflict = await runTaktMarp(ctx, ["eject", "."], { cwd: ctx.ejectedProjectDir });
  check(conflict.code === 1, `re-running takt-marp eject . must exit 1.\n${commandSummary(conflict)}`);
  check(conflict.output.includes("EJECT_CONFLICT"), `re-eject must fail with EJECT_CONFLICT.\n${commandSummary(conflict)}`);
  assertSnapshotsEqual(ctx.snapshotAfterEject, await snapshotDir(ctx.ejectedProjectDir), "after rejected eject (must be zero writes)");

  const mutatedEntry = ctx.templateEntries[0];
  const mutatedRelativePath = `.takt/${mutatedEntry.relativePath}`;
  const mutatedPath = projectPath(ctx.ejectedProjectDir, mutatedRelativePath);
  const userConfigPath = path.join(ctx.ejectedProjectDir, ".takt", "config.yaml");
  const userRuntimePath = path.join(ctx.ejectedProjectDir, ".takt", "runs", "user-run", "keep.txt");
  await mkdir(path.dirname(userRuntimePath), { recursive: true });
  await writeFile(userConfigPath, USER_PROVIDER_CONFIG_CONTENT, "utf8");
  await writeFile(userRuntimePath, USER_RUNTIME_STATE_CONTENT, "utf8");

  await writeFile(mutatedPath, "MUTATED-BY-GLOBAL-INSTALL-VALIDATOR\n", "utf8");
  const beforeForce = await snapshotDir(ctx.ejectedProjectDir);
  const force = await runTaktMarp(ctx, ["eject", ".", "--force"], { cwd: ctx.ejectedProjectDir });
  check(force.code === 0, `takt-marp eject . --force must exit 0.\n${commandSummary(force)}`);
  assertOnlyAllowedSnapshotChanges(
    beforeForce,
    await snapshotDir(ctx.ejectedProjectDir),
    [mutatedRelativePath],
    "after --force",
  );

  const restored = await readFile(mutatedPath);
  const canon = await readFile(mutatedEntry.sourcePath);
  check(restored.equals(canon), `--force must restore template file to canon content: ${mutatedRelativePath}`);
  await assertFileContent(path.join(ctx.ejectedProjectDir, "notes.md"), PREPLACED_NOTES_CONTENT, "pre-placed project file after --force");
  await assertFileContent(path.join(ctx.ejectedProjectDir, ".takt", "my-local.md"), PREPLACED_LOCAL_CONTENT, "pre-placed .takt file after --force");
  await assertFileContent(userConfigPath, USER_PROVIDER_CONFIG_CONTENT, "user provider config after --force");
  await assertFileContent(userRuntimePath, USER_RUNTIME_STATE_CONTENT, "user runtime state after --force");

  await writeFile(mutatedPath, "MUTATED-BY-GLOBAL-INSTALL-VALIDATOR-OVERWRITE\n", "utf8");
  const beforeOverwrite = await snapshotDir(ctx.ejectedProjectDir);
  const overwrite = await runTaktMarp(ctx, ["eject", ".", "--overwrite"], { cwd: ctx.ejectedProjectDir });
  check(overwrite.code === 0, `takt-marp eject . --overwrite must exit 0.\n${commandSummary(overwrite)}`);
  assertOnlyAllowedSnapshotChanges(
    beforeOverwrite,
    await snapshotDir(ctx.ejectedProjectDir),
    [mutatedRelativePath],
    "after --overwrite",
  );
  const overwriteRestored = await readFile(mutatedPath);
  check(overwriteRestored.equals(canon), `--overwrite must restore template file to canon content: ${mutatedRelativePath}`);
  await assertFileContent(userConfigPath, USER_PROVIDER_CONFIG_CONTENT, "user provider config after --overwrite");
  await assertFileContent(userRuntimePath, USER_RUNTIME_STATE_CONTENT, "user runtime state after --overwrite");
  return "EJECT_CONFLICT zero-write; --force/--overwrite restored template-owned paths only";
}

// Phase 7 (6.1, 6.2, 6.6, 6.7, 8.6, 8.7): mock smoke (provider unspecified)
// is mandatory and must pass. Real provider smoke is intentionally never
// executed here and nothing in this validator reads or requires real-provider
// environment configuration.
async function phaseMockSmoke(ctx) {
  const smokeCwd = path.join(ctx.workDir, "smoke-cwd");
  await mkdir(smokeCwd, { recursive: true });
  const callerSnapshotBefore = await snapshotDir(smokeCwd);
  const smoke = await runTaktMarp(ctx, ["smoke"], { cwd: smokeCwd, timeoutMs: SMOKE_TIMEOUT_MS });
  check(smoke.code === 0, `takt-marp smoke (mock default) must exit 0.\n${commandSummary(smoke)}`);
  check(
    smoke.stdout.includes("smoke-summary-mock.md"),
    `smoke output must reference the mock summary (smoke-summary-mock.md).\n${commandSummary(smoke)}`,
  );

  const projectMatch = smoke.stdout.match(/^Temporary smoke project(?: \(retained for inspection\))?: (.+)$/m);
  check(projectMatch !== null, `smoke output must print the temporary smoke project path.\n${commandSummary(smoke)}`);
  ctx.smokeProjectDir = projectMatch[1].trim();

  const summaryPath = path.join(ctx.smokeProjectDir, "slides", "_workflow-smoke", "review", "smoke-summary-mock.md");
  check(existsSync(summaryPath), `mock smoke summary was not written: ${summaryPath}`);
  const summary = await readFile(summaryPath, "utf8");
  check(summary.includes("provider: mock"), `mock smoke summary must record 'provider: mock': ${summaryPath}`);
  check(summary.includes("result: passed"), `mock smoke summary must record 'result: passed': ${summaryPath}`);
  assertSnapshotsEqual(callerSnapshotBefore, await snapshotDir(smokeCwd), "smoke caller cwd");
  assertTemplateAssetsAbsent(ctx.smokeProjectDir, "smoke temp project");
  for (const relativePath of [
    ".takt/config.yaml",
    ".takt/provider-settings.yaml",
    ".takt/provider.yaml",
    ".takt/providers.yaml",
    ".takt/credentials.env",
    ".takt/credentials.json",
  ]) {
    check(!existsSync(projectPath(ctx.smokeProjectDir, relativePath)), `smoke temp project must not generate provider state: ${relativePath}`);
  }
  return "mock smoke passed; caller cwd untouched; temp project stayed no-copy; real provider smoke not executed";
}

const PHASES = [
  { name: "pack-install", run: phasePackInstall, deps: [] },
  { name: "surface", run: phaseSurface, deps: [] },
  { name: "utility-commands", run: phaseUtilityCommands, deps: [] },
  { name: "workflow-command-no-copy", run: phaseWorkflowCommandNoCopy, deps: [] },
  { name: "partial-template-state", run: phasePartialTemplateState, deps: [] },
  { name: "eject-boundary", run: phaseEjectBoundary, deps: [] },
  { name: "eject-conflict-force", run: phaseEjectConflictForce, deps: ["eject-boundary"] },
  { name: "mock-smoke", run: phaseMockSmoke, deps: [] },
];

function retainedPaths(ctx) {
  return [ctx.workDir, ctx.smokeProjectDir].filter(Boolean);
}

async function cleanup(ctx) {
  for (const dir of retainedPaths(ctx)) {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const ctx = {
    workDir: await mkdtemp(path.join(os.tmpdir(), "takt-marp-global-install-")),
    packageRoot: resolveRuntimeContext().packageRoot,
  };
  const failures = [];
  const failedNames = new Set();

  for (const phase of PHASES) {
    if (failedNames.has("pack-install")) {
      console.error(`phase ${phase.name}: skipped (pack-install failed; no installed CLI to exercise)`);
      continue;
    }
    const blockedBy = phase.deps.find((dep) => failedNames.has(dep));
    if (blockedBy) {
      console.error(`phase ${phase.name}: skipped (depends on failed phase '${blockedBy}')`);
      continue;
    }
    try {
      const note = await phase.run(ctx);
      console.log(`phase ${phase.name}: ok${note ? ` (${note})` : ""}`);
    } catch (error) {
      failedNames.add(phase.name);
      const detail = error instanceof SlideWorkflowError ? formatError(error) : String(error?.stack ?? error);
      failures.push({ name: phase.name, detail });
      console.error(`phase ${phase.name}: FAIL`);
      console.error(detail.replace(/^/gm, "  "));
    }
  }

  if (failures.length > 0) {
    console.error(`Retained for diagnosis: ${retainedPaths(ctx).join(", ")}`);
    throw new SlideWorkflowError(
      `${failures.length} phase(s) failed: ${failures.map((failure) => failure.name).join(", ")}. See phase details above.`,
      "GLOBAL_INSTALL_VALIDATION_FAILED",
    );
  }

  await cleanup(ctx);
  console.log(`global install validation ok: ${PHASES.length} phases passed.`);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
