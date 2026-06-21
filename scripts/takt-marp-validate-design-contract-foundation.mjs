#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  approvalPath,
  resolveDeckTarget,
  supervisionPath,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";
import { writeClaudeDesignSmokeFixture } from "./lib/takt-marp-claude-design-fixtures.mjs";
import { createZipArchiveBuffer } from "./lib/takt-marp-zip-archive.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);

export async function runDesignContractFoundationChecks(check) {
  await check("runner uses selected workflow file path and preserves provider argument", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-runner-"));
    await makeDeck(root, "demo");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `runner failed with selected workflow file path: ${result.stderr}`);
    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(args[workflowArgIndex + 1] === selectedWorkflowPath, `TAKT did not receive selected workflow file path: ${args.join(" ")}`);
    const targetArgIndex = args.indexOf("-t");
    assert(targetArgIndex >= 0, `TAKT args did not include -t: ${args.join(" ")}`);
    assert(args[targetArgIndex + 1] === "slides/demo", `plan TAKT target changed unexpectedly: ${args.join(" ")}`);
    const providerArgIndex = args.indexOf("--provider");
    assert(providerArgIndex >= 0, `TAKT args did not include --provider: ${args.join(" ")}`);
    assert(args[providerArgIndex + 1] === "mock", `TAKT provider argument was not preserved: ${args.join(" ")}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.target === "slides/demo", `plan marker target changed unexpectedly: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.path === ".takt/design-contracts/demo/resolved-design-contract.json", `plan marker missing design_contract path: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.source?.path === "slides/demo/design/Claude Design Smoke.zip", `plan marker missing source path: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.fingerprint?.contract_sha256, `plan marker missing contract fingerprint: ${JSON.stringify(marker)}`);
    assert(
      existsSync(path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json")),
      "runner did not write resolved design contract",
    );
    assert(!Object.hasOwn(marker, "research_brief_path"), `plan marker included research brief path: ${JSON.stringify(marker)}`);
    assert(!Object.hasOwn(marker, "research_output_dir"), `plan marker included research output dir: ${JSON.stringify(marker)}`);
    assert(!existsSync(path.join(root, ".takt", "workflows")), "selected workflow runner created project-local workflow templates");
  });

  await check("runner rejects missing Claude Design Source before TAKT for plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-missing-design-source-"));
    const deckPath = path.join(root, "slides", "demo");
    await mkdir(path.join(deckPath, "review"), { recursive: true });
    await writeFile(path.join(deckPath, "brief.md"), "# Brief\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "runner unexpectedly accepted missing Claude Design Source");
    assert(result.stderr.includes("CLAUDE_DESIGN_SOURCE_MISSING:"), `missing design source did not surface CLAUDE_DESIGN_SOURCE_MISSING: ${result.stderr}`);
    assert(result.stderr.includes("slides/demo/design"), `missing design source message did not identify design directory: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite missing Claude Design Source");
  });

  await check("runner rejects invalid sibling Claude Design zip before TAKT for plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-invalid-sibling-design-source-"));
    const targetInfo = await makeDeck(root, "demo");
    await writeFile(path.join(targetInfo.deckPath, "design", "Incomplete Design Source.zip"), createZipArchiveBuffer({
      "notes.txt": "not a Claude Design export\n",
    }));
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "runner unexpectedly accepted invalid sibling Claude Design zip");
    assert(result.stderr.includes("CLAUDE_DESIGN_SOURCE_INVALID:"), `invalid sibling source did not surface CLAUDE_DESIGN_SOURCE_INVALID: ${result.stderr}`);
    assert(result.stderr.includes("Incomplete Design Source.zip"), `invalid sibling source message did not identify bad zip: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite invalid sibling Claude Design zip");
  });

  await check("plan force validates Claude Design Source before archiving artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-force-missing-design-source-"));
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await writeApproval(targetInfo, "plan", "foundation-test");
    await mkdir(path.join(root, "dist", "demo"), { recursive: true });
    await writeFile(path.join(root, "dist", "demo", "SLIDES.pdf"), "old pdf", "utf8");
    await rm(path.join(targetInfo.deckPath, "design"), { recursive: true, force: true });
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock", "--force"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "force runner unexpectedly accepted missing Claude Design Source");
    assert(result.stderr.includes("CLAUDE_DESIGN_SOURCE_MISSING:"), `force missing design source did not surface CLAUDE_DESIGN_SOURCE_MISSING: ${result.stderr}`);
    assert(existsSync(supervisionPath(targetInfo, "plan")), "force archived supervision before validating Claude Design Source");
    assert(existsSync(approvalPath(targetInfo, "plan")), "force archived approval before validating Claude Design Source");
    assert(existsSync(path.join(root, "dist", "demo", "SLIDES.pdf")), "force cleaned generated outputs before validating Claude Design Source");
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "force created review history before validating Claude Design Source");
    assert(!existsSync(argsPath), "TAKT was invoked despite missing Claude Design Source on force");
  });

  await check("rejected plan rerun validates Claude Design Source before archiving artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-rejected-missing-design-source-"));
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "none", "rejected", "run-rejected-plan");
    const supervisionBefore = await readFile(supervisionPath(targetInfo, "plan"), "utf8");
    await rm(path.join(targetInfo.deckPath, "design"), { recursive: true, force: true });
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "rejected rerun unexpectedly accepted missing Claude Design Source");
    assert(result.stderr.includes("CLAUDE_DESIGN_SOURCE_MISSING:"), `rejected rerun missing source did not surface CLAUDE_DESIGN_SOURCE_MISSING: ${result.stderr}`);
    assert((await readFile(supervisionPath(targetInfo, "plan"), "utf8")) === supervisionBefore, "rejected rerun archived supervision before validating Claude Design Source");
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "rejected rerun created review history before validating Claude Design Source");
    assert(!existsSync(argsPath), "TAKT was invoked despite missing Claude Design Source on rejected rerun");
  });

  await check("plan force does not save Design Contract until artifact invalidation succeeds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-force-design-save-after-archive-"));
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await writeApproval(targetInfo, "plan", "foundation-test");
    await writeFile(path.join(targetInfo.reviewPath, "history"), "not a directory\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");
    const contractPath = path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock", "--force"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "force runner unexpectedly succeeded despite blocked archive history path");
    assert(existsSync(supervisionPath(targetInfo, "plan")), "force archive failure removed current supervision");
    assert(existsSync(approvalPath(targetInfo, "plan")), "force archive failure removed current approval");
    assert(!existsSync(contractPath), "force archive failure saved a new Resolved Design Contract before invalidation succeeded");
    assert(!existsSync(argsPath), "TAKT was invoked despite force archive failure");
  });

  await check("runner preserves Design Contract marker for polish", async () => {
    const { root, targetInfo, fakePackage } = await prepareApprovedComposeFixture("slide-workflow-polish-design-marker-");
    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed after compose approval: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.path === ".takt/design-contracts/demo/resolved-design-contract.json", `polish marker dropped design_contract: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.fingerprint?.contract_sha256, `polish marker missing contract fingerprint: ${JSON.stringify(marker)}`);
  });

  await check("runner recovers polish Design Contract marker when current marker is malformed", async () => {
    const { root, fakePackage } = await prepareApprovedComposeFixture("slide-workflow-polish-malformed-design-marker-");
    await writeFile(path.join(root, ".takt", "workflow-current-target.json"), "{not json\n", "utf8");
    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed with malformed current marker: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch after malformed marker recovery: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.path === ".takt/design-contracts/demo/resolved-design-contract.json", `polish marker did not recover stored design_contract: ${JSON.stringify(marker)}`);
  });

  await check("runner ignores corrupt stored Design Contract marker for polish", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-polish-corrupt-stored-design-marker-"));
    const targetInfo = await makeDeck(root, "demo");
    await mkdir(path.join(root, ".takt", "design-contracts", "demo"), { recursive: true });
    await writeFile(path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json"), "{not json\n", "utf8");
    await mkdir(path.join(root, ".takt"), { recursive: true });
    await writeFile(path.join(root, ".takt", "workflow-current-target.json"), "{not json\n", "utf8");
    await markComposeApproved(targetInfo);

    const fakePackage = await makeFakePackageRoot();
    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed with corrupt stored design contract: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch after corrupt stored contract fallback: ${JSON.stringify(marker)}`);
    assert(!marker.design_contract, `polish marker kept corrupt stored design_contract: ${JSON.stringify(marker)}`);
  });

  await check("runner validates existing Design Contract marker payload before polish", async () => {
    const { root, fakePackage } = await prepareApprovedComposeFixture("slide-workflow-polish-corrupt-existing-design-marker-");
    const planMarker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(planMarker.design_contract?.path, `plan marker did not create design_contract: ${JSON.stringify(planMarker)}`);
    await writeFile(path.join(root, planMarker.design_contract.path), "{not json\n", "utf8");

    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed with corrupt existing marker payload: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch after corrupt existing marker fallback: ${JSON.stringify(marker)}`);
    assert(!marker.design_contract, `polish marker kept corrupt existing design_contract: ${JSON.stringify(marker)}`);
  });

  await check("runner rejects incomplete Design Contract fingerprint before polish", async () => {
    const { root, fakePackage } = await prepareApprovedComposeFixture("slide-workflow-polish-incomplete-design-fingerprint-");
    const planMarker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(planMarker.design_contract?.path, `plan marker did not create design_contract: ${JSON.stringify(planMarker)}`);
    const contractPath = path.join(root, planMarker.design_contract.path);
    const contract = JSON.parse(await readFile(contractPath, "utf8"));
    contract.fingerprint = {};
    await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed with incomplete design fingerprint: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch after incomplete fingerprint fallback: ${JSON.stringify(marker)}`);
    assert(!marker.design_contract, `polish marker kept incomplete fingerprint design_contract: ${JSON.stringify(marker)}`);
  });

  await check("runner ignores stale Design Contract marker for polish", async () => {
    const { root, fakePackage } = await prepareApprovedComposeFixture("slide-workflow-polish-stale-design-marker-");
    const planMarker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(planMarker.design_contract?.path, `plan marker did not create design_contract: ${JSON.stringify(planMarker)}`);
    await rm(path.join(root, planMarker.design_contract.path), { force: true });

    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed after stale marker setup: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch: ${JSON.stringify(marker)}`);
    assert(!marker.design_contract, `polish marker kept stale design_contract: ${JSON.stringify(marker)}`);
  });
}

async function prepareApprovedComposeFixture(tempPrefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const targetInfo = await makeDeck(root, "demo");
  const fakePackage = await makeFakePackageRoot();
  const planWorkflowPath = await makeSelectedWorkflowFile("plan");
  await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-plan"], "passed"));
  const result = spawnSync(
    process.execPath,
    [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", planWorkflowPath, "--provider", "mock"],
    { cwd: root, encoding: "utf8" },
  );
  assert(result.status === 0, `plan runner failed before polish marker test: ${result.stderr}`);
  assert(
    existsSync(path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json")),
    "plan did not write resolved contract before polish marker test",
  );
  await markComposeApproved(targetInfo);
  return { root, targetInfo, fakePackage };
}

async function markComposeApproved(targetInfo) {
  await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan");
  await writeApproval(targetInfo, "plan", "foundation-test");
  await writeSupervision(targetInfo, "compose", "composed", "passed", "run-compose");
  await writeApproval(targetInfo, "compose", "foundation-test");
}

async function makeDeck(root, deckName) {
  const deckPath = path.join(root, "slides", deckName);
  await mkdir(path.join(deckPath, "review"), { recursive: true });
  await writeFile(path.join(deckPath, "brief.md"), "# Brief\n");
  const targetInfo = resolveDeckTarget(`slides/${deckName}`, { root });
  await writeClaudeDesignSmokeFixture(targetInfo, { root });
  return targetInfo;
}

async function makeSelectedWorkflowFile(command) {
  const selectedSourceRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-source-"));
  const selectedWorkflowPath = path.join(selectedSourceRoot, "workflows", `takt-marp-slide-${command}.yaml`);
  await mkdir(path.dirname(selectedWorkflowPath), { recursive: true });
  await writeFile(selectedWorkflowPath, `name: selected-${command}\n`, "utf8");
  return selectedWorkflowPath;
}

async function makeFakePackageRoot() {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-design-package-"));
  for (const relative of [
    "takt-marp-run-slide-workflow.mjs",
    path.join("lib", "takt-marp-claude-design-source.mjs"),
    path.join("lib", "takt-marp-design-contract-run-context.mjs"),
    path.join("lib", "takt-marp-errors.mjs"),
    path.join("lib", "takt-marp-project-templates.mjs"),
    path.join("lib", "takt-marp-slide-workflow.mjs"),
    path.join("lib", "takt-marp-runtime-context.mjs"),
    path.join("lib", "takt-marp-zip-archive.mjs"),
  ]) {
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

async function makeTaktExecutable(root, script = "#!/bin/sh\nexit 0\n") {
  const executablePath = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "takt.cmd" : "takt");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(executablePath, script, { encoding: "utf8", mode: 0o755 });
}

function fakeTaktScript(runIds, result) {
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
  for (const runId of runIds) {
    lines.push(
      `mkdir -p .takt/runs/${runId}/reports`,
      `cat > .takt/runs/${runId}/reports/brief.normalized.md <<EOF`,
      "# Normalized Brief",
      "",
      `Mock normalized brief for ${runId}.`,
      "EOF",
      `cat > .takt/runs/${runId}/reports/reference-analysis.md <<EOF`,
      "# Reference Deck Analysis",
      "",
      `Mock reference analysis for ${runId}.`,
      "EOF",
      `cat > .takt/runs/${runId}/reports/plan.md <<EOF`,
      "# Slide Plan",
      "",
      "deliverables: [html, pdf]",
      "",
      `Mock plan for ${runId}.`,
      "EOF",
      `cat > .takt/runs/${runId}/reports/slide-blueprint.md <<EOF`,
      "# Slide Blueprint",
      "",
      `Mock slide blueprint for ${runId}.`,
      "EOF",
      `cat > .takt/runs/${runId}/reports/plan-supervision.md <<EOF`,
      "---",
      "command: plan",
      "target: $target",
      "generated_at: 2026-06-05T17:10:00+09:00",
      `workflow_run_id: ${runId}`,
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

function fakeCommandTaktScript(runId, command, state, result) {
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
    `mkdir -p .takt/runs/${runId}/reports`,
    `cat > .takt/runs/${runId}/reports/${command}-supervision.md <<EOF`,
    "---",
    `command: ${command}`,
    "target: $target",
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${runId}`,
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

async function writeSupervision(targetInfo, command, state, result, workflowRunId) {
  await mkdir(targetInfo.reviewPath, { recursive: true });
  await writeFile(supervisionPath(targetInfo, command), supervisionMarkdown(command, state, result, workflowRunId, targetInfo.target), "utf8");
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = [];
  const check = async (name, fn) => {
    try {
      await fn();
      console.log(`[pass] ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`[fail] ${name}\n${error.stack ?? error.message}`);
    }
  };
  await runDesignContractFoundationChecks(check);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}
