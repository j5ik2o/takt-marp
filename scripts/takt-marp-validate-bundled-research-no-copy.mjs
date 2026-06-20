#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatError, SlideWorkflowError } from "./lib/takt-marp-slide-workflow.mjs";
import {
  prepareBundledWorkflowRuntime,
  resolveTemplateSource,
  workflowFilePath,
} from "./lib/takt-marp-project-templates.mjs";
import { loadPersonaPromptFromPath, loadWorkflowByIdentifier } from "takt/dist/infra/config/index.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-run-slide-workflow.mjs");
const TARGET = "slides/jtc";
const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;

function check(condition, message) {
  if (!condition) {
    throw new SlideWorkflowError(message, "BUNDLED_RESEARCH_NO_COPY_ASSERTION_FAILED");
  }
}

function outputTail(text, limit = 4000) {
  return text.length > limit ? `...${text.slice(-limit)}` : text;
}

function commandSummary(result) {
  const signalNote = result.signal ? ` (terminated by ${result.signal})` : "";
  return `exit=${result.code}${signalNote}\nstdout: ${outputTail(result.stdout)}\nstderr: ${outputTail(result.stderr)}`;
}

function projectPath(rootDir, relativePath) {
  return path.join(rootDir, ...relativePath.split("/"));
}

function assertTemplateAssetsAbsent(rootDir, label) {
  for (const relativePath of [".takt/workflows", ".takt/facets"]) {
    check(!existsSync(projectPath(rootDir, relativePath)), `${label}: template assets must not exist: ${relativePath}`);
  }
}

function assertTransientRuntimeAbsent(rootDir, label) {
  check(!existsSync(projectPath(rootDir, "workflows")), `${label}: transient bundled runtime parent was not cleaned up`);
}

function assertPathInside(basePath, targetPath, message) {
  const resolvedBase = normalizeComparablePath(existsSync(basePath) ? realpathSync(basePath) : path.resolve(basePath));
  const resolvedTarget = normalizeComparablePath(existsSync(targetPath) ? realpathSync(targetPath) : path.resolve(targetPath));
  const relative = path.relative(resolvedBase, resolvedTarget);
  check(relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)), message);
}

function normalizeComparablePath(filePath) {
  return process.platform === "darwin" && filePath.startsWith("/private/var/")
    ? `/var/${filePath.slice("/private/var/".length)}`
    : filePath;
}

async function assertBundledRuntimePersonaPromptAllowed(projectDir, workflowPath) {
  const prepared = await prepareBundledWorkflowRuntime(workflowPath, { projectRoot: projectDir });
  try {
    assertPathInside(
      projectPath(projectDir, "workflows"),
      prepared.workflowFilePath,
      `bundled runtime workflow must be under the project workflows allowlist root: ${prepared.workflowFilePath}`,
    );
    const workflow = loadWorkflowByIdentifier(prepared.workflowFilePath, projectDir);
    const step = workflow.steps.find((candidate) => candidate.name === "adapt_research");
    check(step, "bundled research workflow missing adapt_research step");
    check(step.personaPath, "adapt_research did not resolve to a persona prompt file");
    try {
      loadPersonaPromptFromPath(step.personaPath, projectDir);
    } catch (error) {
      if (String(error.message ?? error).includes("Persona prompt file path is not allowed")) {
        throw new SlideWorkflowError(
          [
            "Bundled research runtime persona prompt was rejected by TAKT's provider-time allowlist.",
            `workflow: ${prepared.workflowFilePath}`,
            `persona: ${step.personaPath}`,
          ].join("\n"),
          "BUNDLED_RESEARCH_ALLOWLIST_REJECTED",
        );
      }
      throw error;
    }
  } finally {
    await prepared.cleanup();
  }
  assertTransientRuntimeAbsent(projectDir, "after persona allowlist check");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: "1" },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
      }
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? 1, signal, stdout, stderr, output: `${stdout}\n${stderr}` });
    });
  });
}

async function prepareProject(projectDir) {
  await mkdir(projectPath(projectDir, ".takt"), { recursive: true });
  await writeFile(projectPath(projectDir, ".takt/config.yaml"), "provider: mock\nlanguage: ja\n", "utf8");
  await mkdir(projectPath(projectDir, "slides/jtc/research"), { recursive: true });
  await writeFile(
    projectPath(projectDir, "slides/jtc/research/research-brief.md"),
    [
      "# Research Brief",
      "",
      "Create research notes for a slide deck using the package-bundled takt-marp workflow.",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function main() {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), "takt-marp-bundled-research-"));
  let keepProject = true;
  try {
    await prepareProject(projectDir);
    assertTemplateAssetsAbsent(projectDir, "precondition");

    const source = resolveTemplateSource({ projectRoot: projectDir });
    check(source.kind === "bundled", `expected bundled template source, got ${source.kind}`);
    const selectedWorkflowFilePath = workflowFilePath(source, "research");
    check(
      selectedWorkflowFilePath.includes("templates/project/workflows/takt-marp-slide-research.yaml"),
      `expected package-bundled research workflow path, got ${selectedWorkflowFilePath}`,
    );
    await assertBundledRuntimePersonaPromptAllowed(projectDir, selectedWorkflowFilePath);

    const result = await runCommand(
      process.execPath,
      [
        RUNNER_SCRIPT,
        "research",
        TARGET,
        "--provider",
        "mock",
        "--workflow-file",
        selectedWorkflowFilePath,
      ],
      { cwd: projectDir },
    );
    assertTemplateAssetsAbsent(projectDir, "after bundled research");
    assertTransientRuntimeAbsent(projectDir, "after bundled research");

    if (result.output.includes("Persona prompt file path is not allowed")) {
      throw new SlideWorkflowError(
        [
          "Bundled research no-copy execution was rejected by TAKT's persona prompt allowlist.",
          `Temporary project retained for diagnosis: ${projectDir}`,
          commandSummary(result),
        ].join("\n"),
        "BUNDLED_RESEARCH_ALLOWLIST_REJECTED",
      );
    }
    check(
      !result.output.includes("is not callable"),
      `bundled research must use a callable bundled deep-research wrapper.\n${commandSummary(result)}`,
    );
    check(
      result.output.includes("=== Running Workflow: takt-marp-slide-research ==="),
      `bundled research must reach TAKT workflow runtime.\n${commandSummary(result)}`,
    );
    check(
      result.output.includes("[2/5] plan") || result.output.includes("research-planner"),
      `bundled research must reach the bundled adapter persona after deep_research.\n${commandSummary(result)}`,
    );

    keepProject = false;
    console.log(`Bundled research no-copy validation passed: ${projectDir}`);
  } finally {
    if (!keepProject) {
      await rm(projectDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
