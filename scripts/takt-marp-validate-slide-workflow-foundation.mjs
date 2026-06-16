#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveCommandArtifacts,
  assertTaktExecutableAvailable,
  assertWorkflowAvailable,
  checkRequiredState,
  cleanGeneratedOutputs,
  commandSupervisionResult,
  formatError,
  isSuccessfulCommandState,
  parseFrontMatter,
  parseRequiredState,
  resolveDeckTarget,
  supervisionPath,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";
import { runCli } from "./lib/takt-marp-cli.mjs";

const checks = [];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-run-slide-workflow.mjs");
const VERIFY_DELIVERY_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-verify-delivery-artifacts.mjs");

async function main() {
  await check("front matter parser supports documented subset", async () => {
    const parsed = parseFrontMatter(["---", "status: approved", "count: 1", "enabled: true", "items: [a, \"b\"]", "empty: []", "---", "", "body"].join("\n"));
    assert(parsed.frontMatter.status === "approved", "scalar string parse failed");
    assert(parsed.frontMatter.count === 1, "number parse failed");
    assert(parsed.frontMatter.enabled === true, "boolean parse failed");
    assert(Array.isArray(parsed.frontMatter.items), "inline array parse failed");
    assert(parsed.frontMatter.items[0] === "a", "unquoted inline array item parse failed");
    assert(parsed.frontMatter.items[1] === "b", "quoted inline array item parse failed");
    assert(Array.isArray(parsed.frontMatter.empty), "empty array parse failed");
  });

  await check("invalid target rejects markdown file", async () => {
    const root = await fixtureRoot();
    await makeDeck(root, "demo");
    await expectFailure(() => resolveDeckTarget("slides/demo/brief.md", { root }), "INVALID_TARGET");
  });

  await check("missing approval fails approved state check", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await expectFailure(() => checkRequiredState(targetInfo, parseRequiredState("plan:planned:approved")), "FILE_MISSING");
  });

  await check("invalid approval command is rejected", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await expectFailure(() => writeApproval(targetInfo, "polish", "j5ik2o"), "APPROVAL_UNSUPPORTED");
  });

  await check("missing workflow YAML fails before TAKT", async () => {
    const root = await fixtureRoot();
    await expectFailure(() => assertWorkflowAvailable("compose", { root }), "WORKFLOW_NOT_IMPLEMENTED");
  });

  await check("runner checks prerequisites before workflow availability", async () => {
    const root = await fixtureRoot();
    await makeDeck(root, "demo");
    const result = spawnSync(process.execPath, [RUNNER_SCRIPT, "compose", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status !== 0, "runner unexpectedly succeeded");
    assert(result.stderr.includes("FILE_MISSING"), `expected missing approval before workflow availability, got: ${result.stderr}`);
    assert(!result.stderr.includes("WORKFLOW_NOT_IMPLEMENTED"), `workflow availability masked prerequisite error: ${result.stderr}`);
  });

  await check("missing TAKT executable fails before TAKT", async () => {
    const root = await fixtureRoot();
    await expectFailure(() => assertTaktExecutableAvailable({ root }), "TAKT_EXECUTABLE_MISSING");
  });

  await check("missing TAKT executable does not archive or clean force outputs", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await mkdir(path.join(root, "dist", "demo"), { recursive: true });
    await writeFile(path.join(root, "dist", "demo", "index.html"), "<html></html>", "utf8");
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo", "--force"], { cwd: root, encoding: "utf8" });
    assert(result.status !== 0, "runner unexpectedly succeeded without TAKT executable");
    assert(result.stderr.includes("TAKT_EXECUTABLE_MISSING"), `expected missing TAKT executable, got: ${result.stderr}`);
    assert(existsSync(supervisionPath(targetInfo, "plan")), "supervision was archived despite missing TAKT executable");
    assert(existsSync(path.join(root, "dist", "demo", "index.html")), "generated output was cleaned despite missing TAKT executable");
  });

  await check("successful state is detected for rerun protection", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    assert(isSuccessfulCommandState(targetInfo, "plan"), "successful supervision was not detected");
  });

  await check("successful rerun rejection is formatted without stack trace", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot);
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status !== 0, "runner unexpectedly allowed successful rerun");
    assert(result.stderr.includes("RERUN_BLOCKED:"), `expected formatted rerun error, got: ${result.stderr}`);
    assert(!result.stderr.includes("Error:"), `rerun error included a stack trace: ${result.stderr}`);
  });

  await check("runner syncs passed TAKT report to deck", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner failed to sync passed report: ${result.stderr}`);
    const synced = await readFile(supervisionPath(targetInfo, "plan"), "utf8");
    assert(synced.includes("workflow_run_id: run-current"), `runner synced wrong report: ${synced}`);
  });

  await check("runner syncs plan source artifacts from TAKT reports to deck", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner failed to sync plan source artifacts: ${result.stderr}`);
    const normalized = await readFile(path.join(targetInfo.deckPath, "brief.normalized.md"), "utf8");
    const plan = await readFile(path.join(targetInfo.deckPath, "plan.md"), "utf8");
    assert(normalized.includes("Mock normalized brief for run-current"), `normalized brief was not synced from reports: ${normalized}`);
    assert(plan.includes("deliverables: [html, pdf]"), `plan deliverables were not synced from reports: ${plan}`);
  });

  await check("runner syncs AI gate reports to deck", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeFile(path.join(targetInfo.reviewPath, "plan-ai-antipattern-fix.md"), "stale ai fix\n", "utf8");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScriptWithAiGateReport("run-current", { includeFix: false }));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner failed to sync AI gate report: ${result.stderr}`);
    const syncedReview = await readFile(path.join(targetInfo.reviewPath, "plan-ai-antipattern-review.md"), "utf8");
    assert(syncedReview.includes("workflow_run_id: run-current"), `runner synced wrong AI review report: ${syncedReview}`);
    assert(!existsSync(path.join(targetInfo.reviewPath, "plan-ai-antipattern-fix.md")), "runner left stale AI fix report when current run had no fix report");
  });

  await check("runner syncs latest AI gate review cycle to deck", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScriptWithAiGateReport("run-current", { reviewCycles: [1, 2] }));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner failed to sync latest AI gate review report: ${result.stderr}`);
    const syncedReview = await readFile(path.join(targetInfo.reviewPath, "plan-ai-antipattern-review.md"), "utf8");
    assert(syncedReview.includes("cycle: 2"), `runner did not sync latest AI review cycle: ${syncedReview}`);
    assert(syncedReview.includes("# AI Antipattern Review cycle 2"), `runner synced wrong AI review body: ${syncedReview}`);
  });

  await check("runner ignores mismatched AI gate report metadata", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeFile(path.join(targetInfo.reviewPath, "plan-ai-antipattern-review.md"), "stale ai review\n", "utf8");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScriptWithAiGateReport("run-current", { aiWorkflowRunId: "stale-run" }));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner failed with mismatched AI gate metadata: ${result.stderr}`);
    assert(!existsSync(path.join(targetInfo.reviewPath, "plan-ai-antipattern-review.md")), "runner treated mismatched AI gate report as current evidence");
  });

  await check("runner ignores non-passed TAKT supervision reports", async () => {
    const root = await fixtureRoot();
    await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-rejected"], "rejected"));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status !== 0, "runner unexpectedly synced a non-passed report");
    assert(result.stderr.includes("TAKT_REPORT_SYNC_MISSING"), `expected sync-missing error, got: ${result.stderr}`);
  });

  await check("runner rejects ambiguous matching TAKT report directories", async () => {
    const root = await fixtureRoot();
    await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-a", "run-b"], "passed"));
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status !== 0, "runner unexpectedly synced an ambiguous report");
    assert(result.stderr.includes("TAKT_REPORT_SYNC_AMBIGUOUS"), `expected ambiguous sync error, got: ${result.stderr}`);
  });

  await check("supervision validator rejects missing finding counts", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeFile(
      supervisionPath(targetInfo, "plan"),
      [
        "---",
        "command: plan",
        `target: ${targetInfo.target}`,
        "generated_at: 2026-06-05T17:10:00+09:00",
        "workflow_run_id: run-plan-1",
        "step: supervision",
        "cycle: 1",
        "state: planned",
        "result: passed",
        "---",
        "",
        "# Supervision",
        "",
      ].join("\n"),
      "utf8",
    );
    assert(!isSuccessfulCommandState(targetInfo, "plan"), "supervision without finding counts must not be successful");
    await expectFailure(() => checkRequiredState(targetInfo, parseRequiredState("plan:planned")), "FIELD_MISSING");
  });

  await check("rejected rerun archives command report", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "none", "rejected", "run-plan-1");
    assert((await commandSupervisionResult(targetInfo, "plan")) === "rejected", "valid rejected supervision was not detected");
    const moved = await archiveCommandArtifacts(targetInfo, ["plan"], "rejected-rerun");
    assert(moved.length === 1, "expected one archived report");
    assert(!existsSync(supervisionPath(targetInfo, "plan")), "source report still exists after archive");
  });

  await check("rejected rerun requires valid canonical supervision", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeFile(
      supervisionPath(targetInfo, "plan"),
      [
        "---",
        "command: plan",
        `target: ${targetInfo.target}`,
        "generated_at: 2026-06-05T17:10:00+09:00",
        "workflow_run_id: run-plan-1",
        "step: supervision",
        "cycle: 1",
        "state: none",
        "result: rejected",
        "---",
        "",
        "# Supervision",
        "",
      ].join("\n"),
      "utf8",
    );
    await expectFailure(() => commandSupervisionResult(targetInfo, "plan"), "FIELD_MISSING");
  });

  await check("force invalidation archives downstream approvals and cleans generated outputs", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await writeApproval(targetInfo, "plan", "j5ik2o");
    await mkdir(path.join(root, "dist", "demo"), { recursive: true });
    await writeFile(path.join(root, "dist", "demo", "deck.pdf"), "pdf");
    await mkdir(path.join(root, ".takt", "render", "demo"), { recursive: true });
    await writeFile(path.join(root, ".takt", "render", "demo", "metadata.json"), "{}");
    const moved = await archiveCommandArtifacts(targetInfo, ["plan"], "force", { includeApprovals: true });
    await cleanGeneratedOutputs(targetInfo, { root });
    assert(moved.length === 2, "expected supervision and approval archive");
    assert(!existsSync(path.join(root, "dist", "demo")), "dist deck directory was not cleaned");
    assert(!existsSync(path.join(root, ".takt", "render", "demo")), "render directory was not cleaned");
    assert(existsSync(path.join(root, "slides", "demo", "brief.md")), "source brief.md must remain");
  });

  await check("delivery verifier skips artifact checks for non-successful reports", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeFile(path.join(targetInfo.deckPath, "plan.md"), "deliverables: [html, pdf]\n", "utf8");
    await writeFile(
      path.join(targetInfo.reviewPath, "deliver-work.md"),
      [
        "---",
        "command: deliver",
        `target: ${targetInfo.target}`,
        "step: work",
        "result: needs_input",
        "---",
        "",
      ].join("\n"),
      "utf8",
    );
    const workResult = spawnSync(process.execPath, [VERIFY_DELIVERY_SCRIPT, "work", targetInfo.target], { cwd: root, encoding: "utf8" });
    assert(workResult.status === 0, `work verifier should skip artifact checks for needs_input, got: ${workResult.stderr}`);
    assert(workResult.stdout.includes("skipped for non-successful work report"), `work verifier did not report skip: ${workResult.stdout}`);

    await writeFile(
      path.join(targetInfo.reviewPath, "deliver-verify.md"),
      [
        "---",
        "command: deliver",
        `target: ${targetInfo.target}`,
        "step: verify",
        "result: needs_fix",
        "---",
        "",
      ].join("\n"),
      "utf8",
    );
    const verifyResult = spawnSync(process.execPath, [VERIFY_DELIVERY_SCRIPT, "verify", targetInfo.target], { cwd: root, encoding: "utf8" });
    assert(verifyResult.status === 0, `verify verifier should skip artifact checks for needs_fix, got: ${verifyResult.stderr}`);
    assert(verifyResult.stdout.includes("skipped for non-successful verify report"), `verify verifier did not report skip: ${verifyResult.stdout}`);
  });

  await check("approve command shows help without initialized project", async () => {
    const root = await fixtureRoot();
    const originalCwd = process.cwd();
    let output;
    try {
      process.chdir(root);
      output = await captureStdout(() => runCli(["approve", "--help"]));
    } finally {
      process.chdir(originalCwd);
    }
    assert(output.includes("Usage: takt-marp approve"), `approve help missing usage: ${output}`);
  });

  await check("approve command requires initialized project", async () => {
    const root = await fixtureRoot();
    const originalCwd = process.cwd();
    try {
      process.chdir(root);
      const code = await runCli(["approve", "slides/demo", "plan", "--by", "foundation-test"]);
      assert(code !== 0, "approve unexpectedly succeeded in uninitialized project");
    } finally {
      process.chdir(originalCwd);
    }
  });

  await check("approve command writes approval file", async () => {
    const root = await initializedFixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    const originalCwd = process.cwd();
    try {
      process.chdir(root);
      const code = await runCli(["approve", targetInfo.target, "plan", "--by", "foundation-test"]);
      assert(code === 0, `approve command failed: check stderr`);
    } finally {
      process.chdir(originalCwd);
    }
    const approval = await readFile(path.join(targetInfo.reviewPath, "plan-approval.md"), "utf8");
    assert(approval.includes("approved_by: foundation-test"), `approval file missing approver: ${approval}`);
  });

  await check("package scripts expose canonical entrypoints only", async () => {
    const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    const scripts = pkg.scripts ?? {};
    for (const name of ["slide:plan", "slide:compose", "slide:polish", "slide:deliver", "slide:check-state", "slide:approve", "slide:validate-foundation"]) {
      assert(scripts[name], `missing package script ${name}`);
    }
    for (const [name, command] of Object.entries(scripts)) {
      if (command.includes("node scripts/")) {
        assert(command.includes("node scripts/takt-marp-"), `package script ${name} uses unprefixed scripts path: ${command}`);
      }
    }
    for (const oldName of ["slide:draft", "slide:review-revise", "slide:build-qa"]) {
      assert(!scripts[oldName], `old package script remains: ${oldName}`);
    }
  });

  const failed = checks.filter((item) => item.status === "FAIL");
  for (const item of checks) {
    console.log(`${item.status}: ${item.name}`);
    if (item.error) console.log(`  ${item.error}`);
  }
  if (failed.length > 0) {
    process.exit(1);
  }
}

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "PASS" });
  } catch (error) {
    checks.push({ name, status: "FAIL", error: formatError(error) });
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-foundation-"));
  await mkdir(path.join(root, ".takt", "workflows"), { recursive: true });
  await writeFile(path.join(root, ".takt", "workflows", "takt-marp-slide-plan.yaml"), "name: takt-marp-slide-plan\n");
  return root;
}

async function initializedFixtureRoot() {
  const root = await fixtureRoot();
  await mkdir(path.join(root, ".takt", "facets"), { recursive: true });
  return root;
}

async function captureStdout(fn) {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const chunks = [];
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join("");
}

async function makeDeck(root, deckName) {
  const deckPath = path.join(root, "slides", deckName);
  await mkdir(path.join(deckPath, "review"), { recursive: true });
  await writeFile(path.join(deckPath, "brief.md"), "# Brief\n");
  return resolveDeckTarget(`slides/${deckName}`, { root });
}

async function makeFakePackageRoot() {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-package-"));
  // Copy (not symlink) so ESM realpath resolution derives packageRoot from the fake package, not the repo.
  for (const relative of [
    "takt-marp-run-slide-workflow.mjs",
    path.join("lib", "takt-marp-slide-workflow.mjs"),
    path.join("lib", "takt-marp-runtime-context.mjs"),
  ]) {
    const destination = path.join(packageRoot, "scripts", relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(SCRIPT_DIR, relative), destination);
  }
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

function fakeTaktScript(runNames, result) {
  const lines = [
    "#!/bin/sh",
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
      `cat > ".takt/runs/${runName}/reports/plan.md" <<EOF`,
      "# Slide Plan",
      "",
      "deliverables: [html, pdf]",
      "",
      `Mock plan for ${runName}.`,
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

function fakeTaktScriptWithAiGateReport(runName, options = {}) {
  const aiCommand = options.aiCommand ?? "plan";
  const aiTarget = options.aiTarget ?? "$target";
  const aiWorkflowRunId = options.aiWorkflowRunId ?? runName;
  const reviewCycles = options.reviewCycles ?? [1];
  const reviewReportLines = reviewCycles.flatMap((cycle) => [
    `mkdir -p ".takt/runs/${runName}/reports/subworkflows/iteration-${cycle + 1}--step-ai_quality_gate_plan--workflow-takt-marp-slide-ai-quality-gate"`,
    `cat > ".takt/runs/${runName}/reports/subworkflows/iteration-${cycle + 1}--step-ai_quality_gate_plan--workflow-takt-marp-slide-ai-quality-gate/ai-antipattern-review.md" <<EOF`,
    "---",
    "command: plan",
    "target: $target",
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${runName}`,
    "step: ai_antipattern_review",
    `cycle: ${cycle}`,
    "reviewed_scope: command-work-report",
    "result: approved",
    "finding_count: 0",
    "blocking_finding_count: 0",
    "---",
    "",
    `# AI Antipattern Review cycle ${cycle}`,
    "EOF",
  ]);
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
    `cat > ".takt/runs/${runName}/reports/brief.normalized.md" <<EOF`,
    "# Normalized Brief",
    "",
    `Mock normalized brief for ${runName}.`,
    "EOF",
    `cat > ".takt/runs/${runName}/reports/plan.md" <<EOF`,
    "# Slide Plan",
    "",
    "deliverables: [html, pdf]",
    "",
    `Mock plan for ${runName}.`,
    "EOF",
    `cat > ".takt/runs/${runName}/reports/plan-supervision.md" <<EOF`,
    "---",
    `command: ${aiCommand}`,
    `target: ${aiTarget}`,
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${aiWorkflowRunId}`,
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
    "EOF",
    ...reviewReportLines,
    ...(options.includeFix
      ? [
          `mkdir -p ".takt/runs/${runName}/reports/subworkflows/iteration-2--step-ai_quality_gate_plan--workflow-takt-marp-slide-ai-quality-gate"`,
          `cat > ".takt/runs/${runName}/reports/subworkflows/iteration-2--step-ai_quality_gate_plan--workflow-takt-marp-slide-ai-quality-gate/ai-antipattern-fix.md" <<EOF`,
          "---",
          "command: plan",
          "target: $target",
          "generated_at: 2026-06-05T17:10:00+09:00",
          `workflow_run_id: ${runName}`,
          "step: ai_antipattern_fix",
          "cycle: 1",
          "status: NO_FIX_NEEDED",
          "handled_finding_count: 0",
          "changed_file_count: 0",
          "remaining_context_count: 0",
          "---",
          "",
          "# AI Antipattern Fix",
          "EOF",
        ]
      : []),
    "exit 0",
    "",
  ].join("\n");
}

async function writeSupervision(targetInfo, command, state, result, workflowRunId) {
  await mkdir(targetInfo.reviewPath, { recursive: true });
  await writeFile(
    supervisionPath(targetInfo, command),
    [
      "---",
      `command: ${command}`,
      `target: ${targetInfo.target}`,
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
    ].join("\n"),
    "utf8",
  );
}

async function expectFailure(fn, code) {
  try {
    await fn();
  } catch (error) {
    if (error.code === code) return;
    throw new Error(`Expected ${code}, got ${error.code ?? error.message}`);
  }
  throw new Error(`Expected failure ${code}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
