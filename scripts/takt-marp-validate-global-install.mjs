#!/usr/bin/env node
// GlobalInstallValidator: E2E validation of the real `npm pack` tarball through a
// temporary global install prefix (requirements 8.1-8.5, plus the E2E confirmation
// of 1.1-1.3 and 4.2-4.3).
//
// Phase policy: phases run sequentially. If pack-install fails, every later phase
// is skipped (no installed CLI to exercise). Otherwise failures are collected and
// later phases keep running, except phases whose declared dependency failed
// (conflict-force and workflow-command-modes need the project initialized by
// init-boundary); those are skipped with the blocking phase named. Any failure
// ends in GLOBAL_INSTALL_VALIDATION_FAILED with the failed phase name(s).
//
// Everything runs inside os.tmpdir(); the repo working tree is never modified.
// Temp directories are removed on success and retained (with paths printed) on
// failure for diagnosis.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listTemplateEntries } from "./lib/takt-marp-project-templates.mjs";
import { resolveRuntimeContext } from "./lib/takt-marp-runtime-context.mjs";
import { SlideWorkflowError, formatError } from "./lib/takt-marp-slide-workflow.mjs";

const CLI_COMMANDS = [
  "init",
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
// Runtime state / provider configuration that init must never generate (8.2).
const RUNTIME_STATE_NAMES = [
  "config.yaml",
  "runs",
  "render",
  "persona_sessions.json",
  "session-state.json",
  "workflow-current-target.json",
];

const NPM_TIMEOUT_MS = 10 * 60 * 1000;
const CLI_TIMEOUT_MS = 5 * 60 * 1000;
// The mandatory mock smoke runs the full workflow suite; give it a long leash.
const SMOKE_TIMEOUT_MS = 20 * 60 * 1000;

const PREPLACED_NOTES_CONTENT = "unrelated project file: takt-marp init must leave this untouched\n";
const PREPLACED_LOCAL_CONTENT = "user-owned .takt note: not template-managed, must survive init and --force\n";

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
  const binPath = path.join(ctx.prefixBin, process.platform === "win32" ? "takt-marp.cmd" : "takt-marp");
  check(existsSync(binPath), `installed takt-marp binary not found at ${binPath}`);
  return `tarball ${tarballs[0]} installed into temp prefix`;
}

// Phase 2 (1.1, 1.2, 1.3): help lists all public commands; slide:* is rejected.
async function phaseSurface(ctx) {
  const help = await runTaktMarp(ctx, ["--help"], { cwd: ctx.workDir });
  check(help.code === 0, `takt-marp --help must exit 0.\n${commandSummary(help)}`);
  for (const command of CLI_COMMANDS) {
    check(
      new RegExp(`^  ${command}\\b`, "m").test(help.stdout),
      `takt-marp --help must list command '${command}'.\n${commandSummary(help)}`,
    );
  }

  const unknown = await runTaktMarp(ctx, ["slide:plan"], { cwd: ctx.workDir });
  check(unknown.code === 1, `takt-marp slide:plan must exit 1.\n${commandSummary(unknown)}`);
  check(
    unknown.output.includes("UNKNOWN_COMMAND"),
    `takt-marp slide:plan must be rejected with UNKNOWN_COMMAND.\n${commandSummary(unknown)}`,
  );
  return "help lists public commands; slide:* rejected with UNKNOWN_COMMAND";
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

// Phase 3 (8.2): init generates exactly workflows/** + facets/** under .takt,
// no runtime state / provider configuration, and pre-placed files stay intact.
async function phaseInitBoundary(ctx) {
  const projectDir = path.join(ctx.workDir, "project");
  await mkdir(path.join(projectDir, ".takt"), { recursive: true });
  await writeFile(path.join(projectDir, "notes.md"), PREPLACED_NOTES_CONTENT, "utf8");
  await writeFile(path.join(projectDir, ".takt", "my-local.md"), PREPLACED_LOCAL_CONTENT, "utf8");

  // The tarball was packed from this repo, so the repo template canon is the
  // authoritative expected file set for what init must generate.
  ctx.templateEntries = await listTemplateEntries();
  check(ctx.templateEntries.length > 0, "template canon is empty; cannot validate init output");

  const init = await runTaktMarp(ctx, ["init", "."], { cwd: projectDir });
  check(init.code === 0, `takt-marp init . must exit 0.\n${commandSummary(init)}`);

  const taktDir = path.join(projectDir, ".takt");
  const observed = await listFilesRecursive(taktDir);
  const expected = ["my-local.md", ...ctx.templateEntries.map((entry) => entry.relativePath)].sort();
  const expectedSet = new Set(expected);
  const observedSet = new Set(observed);
  const unexpected = observed.filter((relativePath) => !expectedSet.has(relativePath));
  const missing = expected.filter((relativePath) => !observedSet.has(relativePath));
  check(
    unexpected.length === 0 && missing.length === 0,
    `init output mismatch under .takt.${unexpected.length > 0 ? ` unexpected: ${unexpected.join(", ")}.` : ""}${missing.length > 0 ? ` missing: ${missing.join(", ")}.` : ""}`,
  );

  for (const name of RUNTIME_STATE_NAMES) {
    check(!existsSync(path.join(taktDir, name)), `init must not generate runtime state / provider config: .takt/${name}`);
  }
  const statePattern = /(^|\/)(config\.yaml|persona_sessions\.json|session-state\.json|workflow-current-target\.json)$|(^|\/)(runs|render)(\/|$)/;
  const stateLeaks = observed.filter((relativePath) => statePattern.test(relativePath));
  check(stateLeaks.length === 0, `runtime state / provider config found under .takt: ${stateLeaks.join(", ")}`);

  await assertFileContent(path.join(projectDir, "notes.md"), PREPLACED_NOTES_CONTENT, "pre-placed project file after init");
  await assertFileContent(path.join(taktDir, "my-local.md"), PREPLACED_LOCAL_CONTENT, "pre-placed .takt file after init");

  ctx.projectDir = projectDir;
  ctx.snapshotAfterInit = await snapshotDir(projectDir);
  return `init generated exactly ${ctx.templateEntries.length} template files; pre-placed files intact`;
}

// Phase 4 (8.3): re-init fails with INIT_CONFLICT and zero writes; --force
// restores template-owned files to canon and leaves everything else alone.
async function phaseConflictForce(ctx) {
  const reinit = await runTaktMarp(ctx, ["init", "."], { cwd: ctx.projectDir });
  check(reinit.code === 1, `re-running takt-marp init . must exit 1.\n${commandSummary(reinit)}`);
  check(reinit.output.includes("INIT_CONFLICT"), `re-init must fail with INIT_CONFLICT.\n${commandSummary(reinit)}`);
  assertSnapshotsEqual(ctx.snapshotAfterInit, await snapshotDir(ctx.projectDir), "after rejected re-init (must be zero writes)");

  const mutatedEntry = ctx.templateEntries[0];
  const mutatedPath = path.join(ctx.projectDir, ".takt", ...mutatedEntry.relativePath.split("/"));
  await writeFile(mutatedPath, "MUTATED-BY-GLOBAL-INSTALL-VALIDATOR\n", "utf8");

  const force = await runTaktMarp(ctx, ["init", ".", "--force"], { cwd: ctx.projectDir });
  check(force.code === 0, `takt-marp init . --force must exit 0.\n${commandSummary(force)}`);

  const restored = await readFile(mutatedPath);
  const canon = await readFile(mutatedEntry.sourcePath);
  check(restored.equals(canon), `--force must restore template file to canon content: .takt/${mutatedEntry.relativePath}`);
  await assertFileContent(path.join(ctx.projectDir, "notes.md"), PREPLACED_NOTES_CONTENT, "pre-placed project file after --force");
  await assertFileContent(path.join(ctx.projectDir, ".takt", "my-local.md"), PREPLACED_LOCAL_CONTENT, "pre-placed .takt file after --force");
  // Force only rewrites template-owned paths with canon bytes, so the whole
  // project must be back to its exact post-init state.
  assertSnapshotsEqual(ctx.snapshotAfterInit, await snapshotDir(ctx.projectDir), "after --force (only template-owned paths rewritten)");
  return "INIT_CONFLICT with zero writes; --force restored canon without touching other files";
}

// Phase 5 (4.2, 4.3): uninitialized dirs get the init guidance; an initialized
// project without package.json / node_modules / .takt/config.yaml fails on the
// workflow target contract, never on npm-project absence. Per tasks.md
// Implementation Notes 2.6, TAKT itself needs no config.yaml here, so the fixed
// assertion for the config-absent failure mode is the target error (INVALID_TARGET).
async function phaseWorkflowCommandModes(ctx) {
  const uninitializedDir = path.join(ctx.workDir, "uninitialized");
  await mkdir(uninitializedDir, { recursive: true });
  const uninitialized = await runTaktMarp(ctx, ["plan", "slides/x"], { cwd: uninitializedDir });
  check(uninitialized.code === 1, `workflow command in an uninitialized dir must exit 1.\n${commandSummary(uninitialized)}`);
  check(
    uninitialized.output.includes("PROJECT_NOT_INITIALIZED"),
    `uninitialized dir must fail with PROJECT_NOT_INITIALIZED.\n${commandSummary(uninitialized)}`,
  );
  check(
    uninitialized.output.includes("takt-marp init ."),
    `uninitialized failure must mention 'takt-marp init .'.\n${commandSummary(uninitialized)}`,
  );

  check(!existsSync(path.join(ctx.projectDir, "package.json")), "precondition: target project must not have package.json");
  check(!existsSync(path.join(ctx.projectDir, "node_modules")), "precondition: target project must not have node_modules");
  check(!existsSync(path.join(ctx.projectDir, ".takt", "config.yaml")), "precondition: target project must not have .takt/config.yaml");

  const invalidTarget = await runTaktMarp(ctx, ["plan", "slides/missing-deck"], { cwd: ctx.projectDir });
  check(invalidTarget.code === 1, `workflow command with a missing deck must exit 1.\n${commandSummary(invalidTarget)}`);
  check(
    invalidTarget.output.includes("INVALID_TARGET"),
    `failure in the initialized non-npm project must be the workflow target error (INVALID_TARGET).\n${commandSummary(invalidTarget)}`,
  );
  for (const forbiddenReason of ["package.json", "node_modules", "PROJECT_NOT_INITIALIZED"]) {
    check(
      !invalidTarget.output.includes(forbiddenReason),
      `failure must not blame npm-project absence or initialization (found '${forbiddenReason}').\n${commandSummary(invalidTarget)}`,
    );
  }
  return "PROJECT_NOT_INITIALIZED guidance; non-npm project fails only on INVALID_TARGET";
}

// Phase 6 (8.4, 8.5): mock smoke (provider unspecified) is mandatory and must
// pass. Real provider smoke is intentionally never executed here and nothing in
// this validator reads or requires real-provider environment configuration.
async function phaseMockSmoke(ctx) {
  const smokeCwd = path.join(ctx.workDir, "smoke-cwd");
  await mkdir(smokeCwd, { recursive: true });
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
  return "mock smoke passed; real provider smoke not executed and not required";
}

const PHASES = [
  { name: "pack-install", run: phasePackInstall, deps: [] },
  { name: "surface", run: phaseSurface, deps: [] },
  { name: "utility-commands", run: phaseUtilityCommands, deps: [] },
  { name: "init-boundary", run: phaseInitBoundary, deps: [] },
  { name: "conflict-force", run: phaseConflictForce, deps: ["init-boundary"] },
  { name: "workflow-command-modes", run: phaseWorkflowCommandModes, deps: ["init-boundary"] },
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
