import { cp, mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { researchReuseWorkflowFilePath } from "./takt-marp-project-templates.mjs";
import {
  resolveDeckTarget,
  supervisionPath,
} from "./takt-marp-slide-workflow.mjs";
import { writeClaudeDesignSmokeFixture } from "./takt-marp-claude-design-fixtures.mjs";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = path.dirname(LIB_DIR);
const ROOT_DIR = path.dirname(SCRIPT_DIR);

const RUNNER_RUNTIME_FILES = Object.freeze([
  "takt-marp-run-slide-workflow.mjs",
  path.join("lib", "takt-marp-claude-design-source.mjs"),
  path.join("lib", "takt-marp-design-contract-run-context.mjs"),
  path.join("lib", "takt-marp-errors.mjs"),
  path.join("lib", "takt-marp-project-templates.mjs"),
  path.join("lib", "takt-marp-runtime-context.mjs"),
  path.join("lib", "takt-marp-slide-workflow.mjs"),
  path.join("lib", "takt-marp-zip-archive.mjs"),
]);

export async function makeDeck(root, deckName, options = {}) {
  const deckPath = path.join(root, "slides", deckName);
  await mkdir(path.join(deckPath, "review"), { recursive: true });
  await writeFile(path.join(deckPath, "brief.md"), "# Brief\n", "utf8");
  const targetInfo = resolveDeckTarget(`slides/${deckName}`, { root });
  if (options.writeClaudeDesignSource !== false) {
    await writeClaudeDesignSmokeFixture(targetInfo, { root });
  }
  return targetInfo;
}

export async function makeSelectedWorkflowFile(command, options = {}) {
  const selectedSourceRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-source-"));
  const selectedWorkflowPath = path.join(selectedSourceRoot, "workflows", `takt-marp-slide-${command}.yaml`);
  await mkdir(path.dirname(selectedWorkflowPath), { recursive: true });
  await writeFile(selectedWorkflowPath, `name: selected-${command}\n`, "utf8");
  if (command === "research" && options.includeResearchReuse) {
    await writeFile(researchReuseWorkflowFilePath(selectedWorkflowPath), "name: selected-research-reuse\n", "utf8");
  }
  return selectedWorkflowPath;
}

export async function makeFakePackageRoot(options = {}) {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), options.tempPrefix ?? "slide-workflow-package-"));
  for (const relative of RUNNER_RUNTIME_FILES) {
    const destination = path.join(packageRoot, "scripts", relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(SCRIPT_DIR, relative), destination);
  }
  await cp(path.join(ROOT_DIR, "node_modules", "fflate"), path.join(packageRoot, "node_modules", "fflate"), { recursive: true });
  return {
    packageRoot,
    runnerScript: path.join(packageRoot, "scripts", "takt-marp-run-slide-workflow.mjs"),
  };
}

export async function makeTaktExecutable(root, script = "#!/bin/sh\nexit 0\n") {
  const executablePath = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "takt.cmd" : "takt");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(executablePath, script, { encoding: "utf8", mode: 0o755 });
}

export function fakeTaktScript(runNames, result) {
  const lines = [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    "target=\"\"",
    "while [ \"$#\" -gt 0 ]; do",
    "  if [ \"$1\" = \"-t\" ]; then",
    "    shift",
    "    target=\"$1\"",
    "  fi",
    "  shift",
    "done",
  ];
  for (const runName of runNames) {
    lines.push(
      `mkdir -p ".takt/runs/${runName}/reports"`,
      `cat > ".takt/runs/${runName}/reports/brief.normalized.md" <<EOF`,
      "# Normalized Brief",
      "",
      `Mock normalized brief for ${runName}.`,
      "EOF",
      `cat > ".takt/runs/${runName}/reports/reference-analysis.md" <<EOF`,
      "# Reference Deck Analysis",
      "",
      `Mock reference analysis for ${runName}.`,
      "EOF",
      `cat > ".takt/runs/${runName}/reports/plan.md" <<EOF`,
      "# Slide Plan",
      "",
      "deliverables: [html, pdf]",
      "",
      `Mock plan for ${runName}.`,
      "EOF",
      `cat > ".takt/runs/${runName}/reports/slide-blueprint.md" <<EOF`,
      "# Slide Blueprint",
      "",
      `Mock slide blueprint for ${runName}.`,
      "EOF",
      `cat > ".takt/runs/${runName}/reports/plan-supervision.md" <<EOF`,
      "---",
      "command: plan",
      "target: $target",
      "generated_at: 2026-06-05T17:10:00+09:00",
      `workflow_run_id: ${runName}`,
      "step: supervision",
      "cycle: 1",
      "state: planned",
      `result: ${result}`,
      "blocking_findings: 0",
      "major_findings: 0",
      "minor_findings: 0",
      "info_findings: 0",
      "---",
      "",
      "# Supervision",
      "EOF",
    );
  }
  lines.push("exit 0", "");
  return lines.join("\n");
}

export function fakeCommandTaktScript(runName, command, state, result) {
  return [
    "#!/bin/sh",
    "target=\"\"",
    "while [ \"$#\" -gt 0 ]; do",
    "  if [ \"$1\" = \"-t\" ]; then",
    "    shift",
    "    target=\"$1\"",
    "  fi",
    "  shift",
    "done",
    `mkdir -p ".takt/runs/${runName}/reports"`,
    `cat > ".takt/runs/${runName}/reports/${command}-supervision.md" <<EOF`,
    "---",
    `command: ${command}`,
    "target: $target",
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${runName}`,
    "step: supervision",
    "cycle: 1",
    `state: ${state}`,
    `result: ${result}`,
    "blocking_findings: 0",
    "major_findings: 0",
    "minor_findings: 0",
    "info_findings: 0",
    "---",
    "",
    "# Supervision",
    "EOF",
    "exit 0",
    "",
  ].join("\n");
}

export async function writeSupervision(targetInfo, command, state, result, workflowRunId) {
  await mkdir(targetInfo.reviewPath, { recursive: true });
  await writeFile(supervisionPath(targetInfo, command), supervisionMarkdown(command, state, result, workflowRunId, targetInfo.target), "utf8");
}

export async function listFilesRecursively(rootPath) {
  let dirents;
  try {
    dirents = await readdir(rootPath, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return [];
    }
    throw error;
  }
  return dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.join(dirent.parentPath, dirent.name));
}

function supervisionMarkdown(command, state, result, workflowRunId, target = "slides/demo") {
  return [
    "---",
    `command: ${command}`,
    `target: ${target}`,
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${workflowRunId}`,
    "step: supervision",
    "cycle: 1",
    `state: ${state}`,
    `result: ${result}`,
    "blocking_findings: 0",
    "major_findings: 0",
    "minor_findings: 0",
    "info_findings: 0",
    "---",
    "",
    "# Supervision",
    "",
  ].join("\n");
}
