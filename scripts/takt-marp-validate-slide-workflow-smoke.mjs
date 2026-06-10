#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SlideWorkflowError,
  approvalPath,
  archiveCommandArtifacts,
  cleanGeneratedOutputs,
  downstreamCommands,
  formatError,
  parseFrontMatter,
  readApproval,
  readFrontMatter,
  readSupervision,
  resolveDeckTarget,
  supervisionPath,
} from "./lib/takt-marp-slide-workflow.mjs";
import { runtimeExecutablePath } from "./lib/takt-marp-runtime-context.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const ROOT = process.cwd();
const FIXTURE_PATH = path.join(PACKAGE_ROOT, "fixtures", "marp-slide-workflow", "_workflow-smoke");
const RUNNER_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-run-slide-workflow.mjs");
const DEFAULT_TARGET = "slides/_workflow-smoke";
const DEFAULT_SMOKE_PROVIDER = "mock";
const STATE_VALIDATION_TARGET = "slides/_workflow-smoke-state-validation";
const RENDER_VALIDATION_TARGET = "slides/_workflow-smoke-render-validation";
const WORKFLOW_COMMANDS = ["plan", "compose", "polish", "deliver"];
const SOURCE_FIXTURE_EXCLUDES = new Set(["README.md"]);
const WORKFLOW_COMMAND_TIMEOUT_MS = 45 * 60 * 1000;
const NODE_CHECK_TIMEOUT_MS = 2 * 60 * 1000;
const CAPTURE_MAX_BUFFER = 64 * 1024 * 1024;
const MOCK_GENERATED_AT = "2026-06-06T00:00:00.000Z";

async function main() {
  const options = parseSmokeArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const commandLine = `node scripts/takt-marp-validate-slide-workflow-smoke.mjs${process.argv.slice(2).length > 0 ? ` ${process.argv.slice(2).join(" ")}` : ""}`;
  const checks = [];
  const commands = [commandLine];
  const observedPaths = [];
  const failures = [];
  let currentCheckName = "setup:fixture-to-target";

  let targetInfo;
  try {
    currentCheckName = "setup:fixture-to-target";
    const setup = await setupSmokeDeck(options.target);
    targetInfo = setup.targetInfo;
    observedPaths.push(...setup.observedPaths);
    checks.push(pass("setup:fixture-to-target", "Fixture source files copied into a clean smoke target."));
    checks.push(pass("setup:generated-output-cleanup", "Generated output roots were cleaned before validation."));
    currentCheckName = "failure-path:invalid-target";
    const invalidTargetChecks = runInvalidTargetChecks(targetInfo);
    checks.push(...invalidTargetChecks.checks);
    commands.push(...invalidTargetChecks.commands);
    currentCheckName = "failure-path:approval-preflight";
    const approvalPreflightChecks = await runApprovalPreflightChecks(targetInfo);
    checks.push(...approvalPreflightChecks.checks);
    commands.push(...approvalPreflightChecks.commands);
    currentCheckName = "approval-command:negative-checks";
    const approvalCommandChecks = await runApprovalCommandNegativeChecks(targetInfo);
    checks.push(...approvalCommandChecks.checks);
    commands.push(...approvalCommandChecks.commands);
    currentCheckName = "failure-path:compose-state-validation";
    const composeStateValidationChecks = await runComposeStateValidationNegativeChecks();
    checks.push(...composeStateValidationChecks.checks);
    currentCheckName = "failure-path:convergence-routing";
    const convergenceChecks = await runConvergenceRouteChecks();
    checks.push(...convergenceChecks.checks);
    observedPaths.push(...convergenceChecks.observedPaths);
    currentCheckName = "failure-path:render-evidence-boundary";
    const renderEvidenceBoundaryChecks = await runRenderEvidenceBoundaryChecks();
    checks.push(...renderEvidenceBoundaryChecks.checks);
    commands.push(...renderEvidenceBoundaryChecks.commands);
    observedPaths.push(...renderEvidenceBoundaryChecks.observedPaths);
    currentCheckName = "sequence:workflow";
    const planSequenceChecks = await runPlanSequenceChecks(targetInfo, { provider: options.provider });
    checks.push(...planSequenceChecks.checks);
    commands.push(...planSequenceChecks.commands);
    observedPaths.push(...planSequenceChecks.observedPaths);
    currentCheckName = "failure-path:force-invalidation";
    const forceChecks = await runForceInvalidationChecks(targetInfo, { provider: options.provider });
    checks.push(...forceChecks.checks);
    commands.push(...forceChecks.commands);
    observedPaths.push(...forceChecks.observedPaths);
    currentCheckName = "failure-path:successful-rerun-rejection";
    const rerunChecks = await runSuccessfulRerunRejectionChecks(targetInfo);
    checks.push(...rerunChecks.checks);
    commands.push(...rerunChecks.commands);
    observedPaths.push(...rerunChecks.observedPaths);
    currentCheckName = "failure-path:rejected-rerun-archive";
    const rejectedRerunChecks = await runRejectedRerunArchiveChecks(targetInfo, { provider: options.provider });
    checks.push(...rejectedRerunChecks.checks);
    commands.push(...rejectedRerunChecks.commands);
    observedPaths.push(...rejectedRerunChecks.observedPaths);
  } catch (error) {
    const reason = formatError(error);
    failures.push(reason);
    checks.push(fail(currentCheckName, reason));
  }

  if (targetInfo) {
    const summaryPath = path.join(targetInfo.reviewPath, smokeSummaryFileName(options));
    observedPaths.push(relativePath(summaryPath));
    const summaryChecks = [
      ...checks,
      pass("summary:write-smoke-summary", "Smoke summary written."),
    ];
    await writeSummary(summaryPath, {
      target: targetInfo.target,
      provider: options.provider,
      smokeMode: smokeMode(options),
      result: failures.length === 0 ? "passed" : "failed",
      commands,
      checks: summaryChecks,
      observedPaths,
      failures,
      keep: options.keep,
    });
    console.log(`Smoke summary: ${relativePath(summaryPath)}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }
}

function runInvalidTargetChecks(targetInfo) {
  const cases = [
    {
      name: "failure-path:invalid-target:brief-file",
      target: `${targetInfo.target}/brief.md`,
      reason: "brief.md command target was rejected before TAKT startup.",
    },
    {
      name: "failure-path:invalid-target:markdown-file",
      target: "README.md",
      reason: "Markdown file command target was rejected before TAKT startup.",
    },
    {
      name: "failure-path:invalid-target:outside-slides",
      target: "fixtures",
      reason: "Path outside slides/ was rejected before TAKT startup.",
    },
  ];

  const checks = [];
  const commands = [];
  for (const item of cases) {
    const command = `node scripts/takt-marp-run-slide-workflow.mjs plan ${JSON.stringify(item.target)}`;
    commands.push(command);
    const result = spawnSync(process.execPath, [RUNNER_SCRIPT, "plan", item.target], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: NODE_CHECK_TIMEOUT_MS,
      maxBuffer: CAPTURE_MAX_BUFFER,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert(result.status !== 0, `${item.name} unexpectedly succeeded`);
    assert(output.includes("INVALID_TARGET:"), `${item.name} did not report INVALID_TARGET: ${output}`);
    assert(output.includes("slides/<deck>"), `${item.name} did not explain expected target slides/<deck>: ${output}`);
    assertNoWorkflowExecution(output, item.name);
    checks.push(pass(item.name, `${item.reason} Observed ${firstLine(output)}`));
  }

  return Object.freeze({ checks: Object.freeze(checks), commands: Object.freeze(commands) });
}

async function runApprovalPreflightChecks(targetInfo) {
  const checks = [];
  const commands = [];

  try {
    await cleanApprovalPreflightState(targetInfo);

    await writeSyntheticSupervision(targetInfo, "plan", {
      state: "planned",
      result: "passed",
      workflowRunId: "smoke-plan-approved-state",
    });
    commands.push(assertPreflightFailure("failure-path:missing-plan-approval", "compose", targetInfo.target, "FILE_MISSING"));
    checks.push(pass("failure-path:missing-plan-approval", "compose rejected missing plan approval before TAKT startup."));

    await cleanApprovalPreflightState(targetInfo);
    await writeSyntheticSupervision(targetInfo, "compose", {
      state: "composed",
      result: "passed",
      workflowRunId: "smoke-compose-approved-state",
    });
    commands.push(assertPreflightFailure("failure-path:missing-compose-approval", "polish", targetInfo.target, "FILE_MISSING"));
    checks.push(pass("failure-path:missing-compose-approval", "polish rejected missing compose approval before TAKT startup."));

    await cleanApprovalPreflightState(targetInfo);
    await writeSyntheticSupervision(targetInfo, "plan", {
      state: "planned",
      result: "rejected",
      workflowRunId: "smoke-stale-plan-report",
    });
    commands.push(assertPreflightFailure("failure-path:stale-report-not-accepted", "compose", targetInfo.target, "STATE_NOT_PASSED"));
    checks.push(pass("failure-path:stale-report-not-accepted", "stale plan report alone was not accepted as approved state."));

    await cleanApprovalPreflightState(targetInfo);
    await writeSyntheticSupervision(targetInfo, "plan", {
      state: "planned",
      result: "passed",
      workflowRunId: "smoke-canonical-plan-run",
    });
    await writeSyntheticApproval(targetInfo, "plan", {
      supervisionWorkflowRunId: "smoke-stale-plan-run",
    });
    commands.push(assertPreflightFailure("failure-path:stale-approval-mismatch", "compose", targetInfo.target, "FIELD_MISMATCH"));
    checks.push(pass("failure-path:stale-approval-mismatch", "stale plan approval mismatching canonical supervision was rejected before TAKT startup."));
  } finally {
    await cleanApprovalPreflightState(targetInfo);
  }

  return Object.freeze({ checks: Object.freeze(checks), commands: Object.freeze(commands) });
}

async function runApprovalCommandNegativeChecks(targetInfo) {
  const checks = [];
  const commands = [];

  try {
    await cleanApprovalCommandState(targetInfo);

    await writeSyntheticSupervision(targetInfo, "plan", {
      state: "planned",
      result: "passed",
      workflowRunId: "smoke-approval-command-plan-run",
    });
    commands.push(assertApprovalCommandFailure("approval-command:missing-by-rejected", targetInfo.target, "plan", [], "Usage:"));
    assertApprovalFileAbsent(targetInfo, "plan", "approval-command:missing-by-rejected");
    checks.push(pass("approval-command:missing-by-rejected", "plan approval without --by failed without writing an approval file."));

    await cleanApprovalCommandState(targetInfo);
    await writeSyntheticSupervision(targetInfo, "polish", {
      state: "polished",
      result: "passed",
      workflowRunId: "smoke-approval-command-polish-run",
    });
    commands.push(
      assertApprovalCommandFailure("approval-command:polish-rejected", targetInfo.target, "polish", ["--by", "smoke-validation"], "APPROVAL_UNSUPPORTED:"),
    );
    assertApprovalFileAbsent(targetInfo, "polish", "approval-command:polish-rejected");
    checks.push(pass("approval-command:polish-rejected", "polish approval was rejected without writing an approval file."));

    await cleanApprovalCommandState(targetInfo);
    await writeSyntheticSupervision(targetInfo, "deliver", {
      state: "delivered",
      result: "passed",
      workflowRunId: "smoke-approval-command-deliver-run",
    });
    commands.push(
      assertApprovalCommandFailure("approval-command:deliver-rejected", targetInfo.target, "deliver", ["--by", "smoke-validation"], "APPROVAL_UNSUPPORTED:"),
    );
    assertApprovalFileAbsent(targetInfo, "deliver", "approval-command:deliver-rejected");
    checks.push(pass("approval-command:deliver-rejected", "deliver approval was rejected without writing an approval file."));

  } finally {
    await cleanApprovalCommandState(targetInfo);
  }

  assertApprovalCommandStateAbsent(targetInfo, "approval-command:no-approval-pollution");
  checks.push(pass("approval-command:no-approval-pollution", "approval negative checks left no approval or synthetic supervision state for later sequence checks."));

  return Object.freeze({ checks: Object.freeze(checks), commands: Object.freeze(commands) });
}

async function runComposeStateValidationNegativeChecks() {
  const checks = [];
  const targetPath = path.join(ROOT, STATE_VALIDATION_TARGET);
  const targetInfo = resolveDeckTarget(await setupSyntheticValidationDeck(targetPath), { root: ROOT });

  try {
    await writeFile(
      supervisionPath(targetInfo, "compose"),
      [
        "command: compose",
        `target: ${targetInfo.target}`,
        "state: composed",
        "result: passed",
        "",
      ].join("\n"),
      "utf8",
    );
    await assertSlideWorkflowFailure(
      "failure-path:compose-invalid-front-matter",
      () => readSupervision(targetInfo, "compose"),
      "FRONT_MATTER_MISSING",
    );
    checks.push(pass("failure-path:compose-invalid-front-matter", "compose supervision without front matter was rejected by state validation."));

    await writeSyntheticSupervision(targetInfo, "compose", {
      state: "planned",
      result: "passed",
      workflowRunId: "smoke-stale-compose-report",
    });
    await assertSlideWorkflowFailure(
      "failure-path:stale-compose-supervision-mismatch",
      () => readSupervision(targetInfo, "compose"),
      "STATE_MISMATCH",
    );
    checks.push(pass("failure-path:stale-compose-supervision-mismatch", "stale compose supervision with mismatched state was rejected by state validation."));

    await writeSyntheticSupervision(targetInfo, "compose", {
      state: "composed",
      result: "passed",
      workflowRunId: "smoke-canonical-compose-run",
    });
    const supervision = await readSupervision(targetInfo, "compose");
    await writeSyntheticApproval(targetInfo, "compose", {
      supervisionWorkflowRunId: "smoke-stale-compose-run",
    });
    await assertSlideWorkflowFailure(
      "failure-path:stale-compose-approval-mismatch",
      () => readApproval(targetInfo, "compose", supervision.data),
      "FIELD_MISMATCH",
    );
    checks.push(pass("failure-path:stale-compose-approval-mismatch", "stale compose approval mismatching canonical supervision was rejected by state validation."));
  } finally {
    await rm(targetPath, { recursive: true, force: true });
  }

  return Object.freeze({ checks: Object.freeze(checks) });
}

async function runConvergenceRouteChecks() {
  const checks = [];
  const observedPaths = [];

  const expectations = {
    plan: {
      cycle: ["review_plan", "fix_plan", "summarize_plan_work"],
      healthyNext: "review_plan",
      approvedNext: "supervise_plan",
      removedMonitorStep: "monitor_plan_loop",
      workStep: "summarize_plan_work",
      gateStep: "ai_quality_gate_plan",
      normalReviewStep: "review_plan",
      replanStep: "summarize_plan_work",
    },
    compose: {
      cycle: ["review_compose", "fix_compose", "summarize_compose_work"],
      healthyNext: "review_compose",
      approvedNext: "supervise_compose",
      removedMonitorStep: "monitor_compose_loop",
      workStep: "summarize_compose_work",
      gateStep: "ai_quality_gate_compose",
      normalReviewStep: "review_compose",
      replanStep: "summarize_compose_work",
    },
    polish: {
      cycle: ["inspect_render", "fix_polish", "render_evidence"],
      healthyNext: "inspect_render",
      approvedNext: "supervise_polish",
      removedMonitorStep: "monitor_polish_loop",
      workStep: "render_evidence",
      gateStep: "ai_quality_gate_polish",
      normalReviewStep: "inspect_render",
      replanStep: "render_evidence",
    },
    deliver: {
      cycle: ["verify_delivery", "fix_delivery", "build_delivery"],
      healthyNext: "verify_delivery",
      approvedNext: "supervise_delivery",
      removedMonitorStep: "monitor_delivery_loop",
      workStep: "build_delivery",
      gateStep: "ai_quality_gate_deliver",
      normalReviewStep: "verify_delivery",
      replanStep: "build_delivery",
    },
  };

  for (const command of WORKFLOW_COMMANDS) {
    assertWorkflowLoopMonitor(command, expectations[command]);
    assertAiGateWorkflowRoute(command, expectations[command]);
  }
  assertAiGateCallableWorkflowRules();
  assertWorkflowDoctorPasses();
  assertNoDeckLocalLoopMonitorFacets();
  assertNoUnsupportedWorkflowCommandGateObjects();
  observedPaths.push(
    ...WORKFLOW_COMMANDS.map((command) => relativePath(path.join(ROOT, ".takt", "workflows", `takt-marp-slide-${command}.yaml`))),
    relativePath(path.join(PACKAGE_ROOT, "scripts", "takt-marp-verify-render-evidence-metadata.mjs")),
    relativePath(path.join(PACKAGE_ROOT, "scripts", "takt-marp-verify-delivery-artifacts.mjs")),
    relativePath(path.join(PACKAGE_ROOT, "scripts", "takt-marp-render-slide-workflow-evidence.mjs")),
  );
  checks.push(pass("failure-path:convergence-workflow-loop-monitors", "TAKT loop_monitors guard review/fix cycles and route nonproductive loops to ABORT."));
  checks.push(pass("sequence:ai-gate-workflow-routes", "AI antipattern gates sit between command work and normal review/inspection/verification with command-local replan routes."));
  checks.push(pass("sequence:workflow-schema-compatible", "workflow YAML passes TAKT workflow doctor and avoids command quality gate objects rejected by string-only quality_gates schemas."));

  return Object.freeze({ checks: Object.freeze(checks), observedPaths: Object.freeze(observedPaths) });
}

async function runRenderEvidenceBoundaryChecks() {
  const checks = [];
  const commands = [];
  const observedPaths = [
    relativePath(path.join(PACKAGE_ROOT, "scripts", "takt-marp-verify-render-evidence-metadata.mjs")),
  ];
  const targetPath = path.join(ROOT, RENDER_VALIDATION_TARGET);
  const renderRoot = path.join(ROOT, ".takt", "render", path.basename(RENDER_VALIDATION_TARGET));

  try {
    await setupSyntheticRenderEvidenceDeck(targetPath);
    await writeSyntheticRenderEvidenceMetadata({
      target: RENDER_VALIDATION_TARGET,
      htmlPng: { status: "passed", files: ["slide-1.png"] },
      pdf: { status: "passed", file: "SLIDES.pdf" },
      pdfRaster: { status: "degraded", reason: "pdftoppm not found", files: [] },
    });
    const degradedCommand = runNodeScript("failure-path:render-evidence-pdf-raster-degraded", "takt-marp-verify-render-evidence-metadata.mjs", [RENDER_VALIDATION_TARGET, "--cycle", "1"]);
    commands.push(degradedCommand);
    checks.push(pass("failure-path:render-evidence-pdf-raster-degraded", "pdf_raster degraded evidence with a reason is accepted as optional evidence."));

    await writeSyntheticRenderEvidenceMetadata({
      target: RENDER_VALIDATION_TARGET,
      htmlPng: { status: "failed", files: [] },
      pdf: { status: "passed", file: "SLIDES.pdf" },
      pdfRaster: { status: "degraded", reason: "pdftoppm not found", files: [] },
    });
    const failedCommand = assertNodeScriptFailure(
      "failure-path:render-evidence-html-png-failed",
      "takt-marp-verify-render-evidence-metadata.mjs",
      [RENDER_VALIDATION_TARGET, "--cycle", "1"],
      "RENDER_EVIDENCE_INVALID",
    );
    commands.push(failedCommand);
    checks.push(pass("failure-path:render-evidence-html-png-failed", "html_png failed evidence is rejected as smoke failure evidence."));
  } finally {
    await Promise.all([
      rm(targetPath, { recursive: true, force: true }),
      rm(renderRoot, { recursive: true, force: true }),
    ]);
  }

  return Object.freeze({
    checks: Object.freeze(checks),
    commands: Object.freeze(commands),
    observedPaths: Object.freeze(observedPaths),
  });
}

async function runPlanSequenceChecks(targetInfo, options) {
  const checks = [];
  const commands = [];
  const observedPaths = [];

  const planCommand = await runWorkflowCommand("sequence:plan-command", "plan", targetInfo, options);
  commands.push(planCommand);
  const supervision = await readSupervision(targetInfo, "plan");
  assert(supervision.data.state === "planned", `sequence:plan-supervision-state expected planned, got ${supervision.data.state}`);
  assert(supervision.data.result === "passed", `sequence:plan-supervision-result expected passed, got ${supervision.data.result}`);
  observedPaths.push(relativePath(supervision.filePath));
  checks.push(pass("sequence:plan-command", "slide:plan completed for the smoke deck."));
  checks.push(pass("sequence:plan-supervision", "plan-supervision.md exists with state planned and result passed."));

  assertApprovalFileAbsent(targetInfo, "plan", "approval-command:workflow-only-non-generation");
  checks.push(pass("approval-command:workflow-only-non-generation", "slide:plan did not generate plan-approval.md before explicit approval."));

  const approveCommand = runWorkflowNodeScript("approval-command:plan-approved", "takt-marp-approve-slide-workflow-state.mjs", [targetInfo.target, "plan", "--by", "smoke-validation"]);
  commands.push(approveCommand);
  const approval = await readApproval(targetInfo, "plan", supervision.data);
  assert(approval.data.approved_by === "smoke-validation", `approval-command:plan-approved expected approved_by smoke-validation, got ${approval.data.approved_by}`);
  observedPaths.push(relativePath(approval.filePath));
  checks.push(pass("approval-command:plan-approved", "slide:approve plan --by smoke-validation generated a matching plan approval file."));

  const composeCommand = await runWorkflowCommand("sequence:compose-command", "compose", targetInfo, options);
  commands.push(composeCommand);
  const composeArtifactPaths = await assertComposeSourceArtifacts(targetInfo);
  observedPaths.push(...composeArtifactPaths.map(relativePath));
  checks.push(pass("sequence:compose-command", "slide:compose completed for the smoke deck after plan approval."));
  checks.push(pass("sequence:compose-source-artifacts", "compose source artifacts exist: design-system.md, SLIDES.md, and images/*.svg."));

  const composeSupervision = await readSupervision(targetInfo, "compose");
  assert(composeSupervision.data.state === "composed", `sequence:compose-supervision-state expected composed, got ${composeSupervision.data.state}`);
  assert(composeSupervision.data.result === "passed", `sequence:compose-supervision-result expected passed, got ${composeSupervision.data.result}`);
  observedPaths.push(relativePath(composeSupervision.filePath));
  checks.push(pass("sequence:compose-supervision", "compose-supervision.md exists with state composed and result passed."));

  assertApprovalFileAbsent(targetInfo, "compose", "approval-command:compose-workflow-only-non-generation");
  checks.push(pass("approval-command:compose-workflow-only-non-generation", "slide:compose did not generate compose-approval.md before explicit approval."));

  const approveComposeCommand = runWorkflowNodeScript("approval-command:compose-approved", "takt-marp-approve-slide-workflow-state.mjs", [targetInfo.target, "compose", "--by", "smoke-validation"]);
  commands.push(approveComposeCommand);
  const composeApproval = await readApproval(targetInfo, "compose", composeSupervision.data);
  assert(composeApproval.data.approved_by === "smoke-validation", `approval-command:compose-approved expected approved_by smoke-validation, got ${composeApproval.data.approved_by}`);
  observedPaths.push(relativePath(composeApproval.filePath));
  checks.push(pass("approval-command:compose-approved", "slide:approve compose --by smoke-validation generated a matching compose approval file."));

  const polishCommand = await runWorkflowCommand("sequence:polish-command", "polish", targetInfo, options);
  commands.push(polishCommand);
  const renderEvidence = await assertRenderEvidenceArtifacts(targetInfo, 1);
  const verifyCommand = runNodeScript("sequence:polish-render-evidence-verify", "takt-marp-verify-render-evidence-metadata.mjs", [targetInfo.target, "--cycle", "1"]);
  commands.push(verifyCommand);
  const polishSupervision = await readSupervision(targetInfo, "polish");
  assert(polishSupervision.data.state === "polished", `sequence:polish-supervision-state expected polished, got ${polishSupervision.data.state}`);
  assert(polishSupervision.data.result === "passed", `sequence:polish-supervision-result expected passed, got ${polishSupervision.data.result}`);
  observedPaths.push(...renderEvidence.observedPaths.map(relativePath));
  observedPaths.push(relativePath(polishSupervision.filePath));
  checks.push(pass("sequence:polish-command", "slide:polish completed for the smoke deck after compose approval."));
  checks.push(pass("sequence:polish-render-evidence-marker", "polish render evidence marker points at the smoke deck cycle 1."));
  checks.push(pass("sequence:polish-render-evidence-root", "polish render evidence root exists under .takt/render/_workflow-smoke/cycle-1."));
  checks.push(pass("sequence:polish-render-evidence-metadata", "polish render evidence metadata records target, cycle, and completed evidence statuses."));
  checks.push(pass("sequence:polish-render-evidence-html-png", "HTML PNG render evidence is usable and backed by non-empty files."));
  checks.push(pass("sequence:polish-render-evidence-verify", "render evidence metadata verifier accepts the polish output for the smoke deck."));
  checks.push(pass("sequence:polish-supervision", "polish-supervision.md exists with state polished and result passed."));

  const staleDeliveryArtifactPaths = await seedStaleDeliveryArtifacts(targetInfo);
  observedPaths.push(...staleDeliveryArtifactPaths.map(relativePath));
  const deliverCommand = await runWorkflowCommand("sequence:deliver-command", "deliver", targetInfo, options);
  commands.push(deliverCommand);
  const deliverSupervision = await readSupervision(targetInfo, "deliver");
  assert(deliverSupervision.data.state === "delivered", `sequence:deliver-supervision-state expected delivered, got ${deliverSupervision.data.state}`);
  assert(deliverSupervision.data.result === "passed", `sequence:deliver-supervision-result expected passed, got ${deliverSupervision.data.result}`);
  const deliveryArtifacts = await assertDeliveryArtifacts(targetInfo, {
    staleArtifactPaths: staleDeliveryArtifactPaths,
    renderEvidenceRoot: renderEvidence.evidenceRoot,
  });
  const verifyDeliveryCommand = runNodeScript("sequence:deliver-artifact-verify", "takt-marp-verify-delivery-artifacts.mjs", ["verify", targetInfo.target]);
  commands.push(verifyDeliveryCommand);
  const reportFrontMatterPaths = await assertCommandReportFrontMatter(targetInfo);
  observedPaths.push(relativePath(deliverSupervision.filePath));
  observedPaths.push(...deliveryArtifacts.observedPaths.map(relativePath));
  observedPaths.push(...reportFrontMatterPaths.map(relativePath));
  checks.push(pass("sequence:deliver-command", "slide:deliver completed for the smoke deck after polish."));
  checks.push(pass("sequence:deliver-supervision", "deliver-supervision.md exists with state delivered and result passed."));
  checks.push(pass("sequence:deliver-stale-cleanup", "slide:deliver cleans stale official artifacts before generating requested outputs."));
  checks.push(pass("sequence:deliver-artifacts", "dist/_workflow-smoke contains readable official artifacts requested by plan.md."));
  checks.push(pass("sequence:deliver-render-evidence-boundary", "render evidence under .takt/render is not counted as an official delivery artifact."));
  checks.push(pass("sequence:command-report-front-matter", "canonical command reports have closed YAML front matter readable by the foundation parser."));
  checks.push(pass("sequence:final-state", "final delivered state is confirmed by deliver supervision and delivery artifacts."));

  return Object.freeze({
    checks: Object.freeze(checks),
    commands: Object.freeze(commands),
    observedPaths: Object.freeze(observedPaths),
  });
}

async function assertCommandReportFrontMatter(targetInfo) {
  const requiredReportNamesByCommand = {
    plan: ["plan-work.md", "plan-review.md", "plan-supervision.md"],
    compose: ["compose-work.md", "compose-review.md", "compose-supervision.md"],
    polish: ["polish-work.md", "polish-inspect.md", "polish-supervision.md"],
    deliver: ["deliver-work.md", "deliver-verify.md", "deliver-supervision.md"],
  };
  const optionalReportNamesByCommand = {
    plan: ["plan-fix.md"],
    compose: ["compose-fix.md"],
    polish: ["polish-fix.md"],
    deliver: ["deliver-fix.md"],
  };
  const reportPaths = [];
  for (const [command, reportNames] of Object.entries(requiredReportNamesByCommand)) {
    const supervision = await readSupervision(targetInfo, command);
    const workflowRunId = supervision.data.workflow_run_id;
    assert(
      typeof workflowRunId === "string" && workflowRunId.length > 0,
      `sequence:command-report-front-matter ${command} supervision missing workflow_run_id`,
    );
    reportPaths.push(...reportNames.map((fileName) => path.join(targetInfo.reviewPath, fileName)));
    reportPaths.push(...(await matchingRunReportPaths(command, targetInfo, workflowRunId, reportNames)));
    for (const fileName of optionalReportNamesByCommand[command]) {
      const deckReportPath = path.join(targetInfo.reviewPath, fileName);
      if (existsSync(deckReportPath)) {
        reportPaths.push(deckReportPath);
      }
      reportPaths.push(...(await matchingRunReportPaths(command, targetInfo, workflowRunId, [fileName], { optional: true })));
    }
    reportPaths.push(...(await assertAiGateReportFrontMatter(targetInfo, command, workflowRunId)));
  }

  for (const reportPath of reportPaths) {
    try {
      await readFrontMatter(reportPath);
    } catch (error) {
      throw new SlideWorkflowError(
        `sequence:command-report-front-matter invalid report front matter in ${relativePath(reportPath)}: ${formatError(error)}`,
        "SMOKE_ASSERTION_FAILED",
      );
    }
  }
  return Object.freeze(reportPaths);
}

async function assertAiGateReportFrontMatter(targetInfo, command, workflowRunId) {
  const reviewPath = path.join(targetInfo.reviewPath, `${command}-ai-antipattern-review.md`);
  const fixPath = path.join(targetInfo.reviewPath, `${command}-ai-antipattern-fix.md`);
  const reportPaths = [reviewPath];
  const review = await readReportWithBody(reviewPath);
  assertAiGateReviewData(targetInfo, command, workflowRunId, review.frontMatter, reviewPath);

  if (existsSync(fixPath)) {
    const fix = await readReportWithBody(fixPath);
    assertAiGateFixData(targetInfo, command, workflowRunId, fix.frontMatter, fix.body, fixPath);
    reportPaths.push(fixPath);
  } else {
    assert(
      review.frontMatter.blocking_finding_count === 0,
      `sequence:ai-gate-report-front-matter ${command} missing fix report despite blocking AI findings`,
    );
  }

  return Object.freeze(reportPaths);
}

async function readReportWithBody(filePath) {
  try {
    return parseFrontMatter(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new SlideWorkflowError(
      `sequence:ai-gate-report-front-matter invalid report front matter in ${relativePath(filePath)}: ${formatError(error)}`,
      "SMOKE_ASSERTION_FAILED",
    );
  }
}

function assertAiGateReviewData(targetInfo, command, workflowRunId, data, filePath) {
  assert(data.command === command, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} command mismatch: ${data.command}`);
  assert(data.target === targetInfo.target, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} target mismatch: ${data.target}`);
  assert(data.workflow_run_id === workflowRunId, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} workflow_run_id mismatch: ${data.workflow_run_id}`);
  assert(data.step === "ai_antipattern_review", `sequence:ai-gate-report-front-matter ${relativePath(filePath)} step mismatch: ${data.step}`);
  assert(typeof data.reviewed_scope === "string" && data.reviewed_scope, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} reviewed_scope missing`);
  assert(["approved", "needs_fix", "blocked"].includes(data.result), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} invalid result: ${data.result}`);
  assert(Number.isInteger(data.finding_count), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} finding_count must be numeric`);
  assert(Number.isInteger(data.blocking_finding_count), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} blocking_finding_count must be numeric`);
}

function assertAiGateFixData(targetInfo, command, workflowRunId, data, body, filePath) {
  assert(data.command === command, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} command mismatch: ${data.command}`);
  assert(data.target === targetInfo.target, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} target mismatch: ${data.target}`);
  assert(data.workflow_run_id === workflowRunId, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} workflow_run_id mismatch: ${data.workflow_run_id}`);
  assert(data.step === "ai_antipattern_fix", `sequence:ai-gate-report-front-matter ${relativePath(filePath)} step mismatch: ${data.step}`);
  assert(["FIXED", "NO_FIX_NEEDED", "NEED_REPLAN", "BLOCKED"].includes(data.status), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} invalid status: ${data.status}`);
  assert(Number.isInteger(data.handled_finding_count), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} handled_finding_count must be numeric`);
  assert(Number.isInteger(data.changed_file_count), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} changed_file_count must be numeric`);
  assert(Number.isInteger(data.remaining_context_count), `sequence:ai-gate-report-front-matter ${relativePath(filePath)} remaining_context_count must be numeric`);
  if (data.status === "NO_FIX_NEEDED" && data.handled_finding_count > 0) {
    assertFindingDecisionEvidence(body, filePath);
  }
}

function assertFindingDecisionEvidence(body, filePath) {
  const section = tableSection(body, "## Finding Decisions");
  const rows = section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .slice(2);
  assert(rows.length > 0, `sequence:ai-gate-report-front-matter ${relativePath(filePath)} missing finding decision rows`);
  for (const row of rows) {
    const cells = row.split("|").map((cell) => cell.trim());
    const evidence = cells[cells.length - 2] ?? "";
    assert(evidence && evidence.toLowerCase() !== "none", `sequence:ai-gate-report-front-matter ${relativePath(filePath)} NO_FIX_NEEDED row lacks finding-level evidence: ${row}`);
  }
}

function tableSection(body, heading) {
  const start = body.indexOf(heading);
  assert(start !== -1, `missing section ${heading}`);
  const next = body.indexOf("\n## ", start + heading.length);
  return next === -1 ? body.slice(start) : body.slice(start, next);
}

async function matchingRunReportPaths(command, targetInfo, workflowRunId, reportNames, options = {}) {
  const runsRoot = path.join(ROOT, ".takt", "runs");
  if (!existsSync(runsRoot)) {
    assert(options.optional, `sequence:command-report-front-matter missing .takt/runs for ${command}`);
    return [];
  }

  const entries = await readdir(runsRoot, { withFileTypes: true });
  const reportPaths = [];
  for (const reportName of reportNames) {
    const reportPath = await findMatchingRunReportPath(entries, runsRoot, command, targetInfo, workflowRunId, reportName);
    if (reportPath) {
      reportPaths.push(reportPath);
    } else {
      assert(
        options.optional,
        `sequence:command-report-front-matter missing matching TAKT run report for ${command} ${reportName} workflow_run_id ${workflowRunId}`,
      );
    }
  }
  return Object.freeze(reportPaths);
}

async function findMatchingRunReportPath(entries, runsRoot, command, targetInfo, workflowRunId, reportName) {
  const step = reportStepFromName(command, reportName);
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const reportPath = path.join(runsRoot, entry.name, "reports", reportName);
    if (!existsSync(reportPath)) {
      continue;
    }
    try {
      const data = await readFrontMatter(reportPath);
      if (
        data.command === command &&
        data.target === targetInfo.target &&
        data.workflow_run_id === workflowRunId &&
        data.step === step
      ) {
        return reportPath;
      }
    } catch {
      // A same-named report from another run is not the target unless its front matter matches.
    }
  }
  return null;
}

function reportStepFromName(command, reportName) {
  const prefix = `${command}-`;
  assert(reportName.startsWith(prefix) && reportName.endsWith(".md"), `unexpected report name for ${command}: ${reportName}`);
  return reportName.slice(prefix.length, -".md".length);
}

async function runSuccessfulRerunRejectionChecks(targetInfo) {
  const checks = [];
  const commands = [];
  const protectedPaths = [supervisionPath(targetInfo, "plan"), approvalPath(targetInfo, "plan")];
  const snapshots = await snapshotFiles(protectedPaths);
  const historyBefore = await listHistoryFiles(targetInfo);
  const commandLine = `node scripts/takt-marp-run-slide-workflow.mjs plan ${JSON.stringify(targetInfo.target)}`;
  const result = spawnSync(process.execPath, [RUNNER_SCRIPT, "plan", targetInfo.target], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: NODE_CHECK_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  commands.push(commandLine);

  assert(result.status !== 0, "failure-path:successful-rerun-rejected unexpectedly succeeded");
  assert(output.includes("RERUN_BLOCKED:"), `failure-path:successful-rerun-rejected did not report RERUN_BLOCKED: ${output}`);
  assert(!output.includes("Workflow completed"), `failure-path:successful-rerun-rejected reached workflow completion: ${output}`);
  assert(!output.includes("takt-marp-slide-plan"), `failure-path:successful-rerun-rejected reached TAKT workflow output: ${output}`);
  await assertSnapshotsUnchanged("failure-path:successful-rerun-state-preserved", snapshots);
  const historyAfter = await listHistoryFiles(targetInfo);
  assert(
    JSON.stringify(historyAfter) === JSON.stringify(historyBefore),
    `failure-path:successful-rerun-state-preserved changed history files: before=${historyBefore.join(",")} after=${historyAfter.join(",")}`,
  );

  checks.push(pass("failure-path:successful-rerun-rejected", "successful plan rerun was rejected without TAKT startup when --force was omitted."));
  checks.push(pass("failure-path:successful-rerun-state-preserved", "rejected successful rerun left canonical supervision, approval, and history unchanged."));

  return Object.freeze({
    checks: Object.freeze(checks),
    commands: Object.freeze(commands),
    observedPaths: Object.freeze(protectedPaths.map(relativePath)),
  });
}

async function runForceInvalidationChecks(targetInfo, options) {
  const checks = [];
  const commands = [];
  const historyBefore = await listHistoryFiles(targetInfo);
  const sourceArtifactPaths = [
    path.join(targetInfo.deckPath, "brief.md"),
    path.join(targetInfo.deckPath, "brief.normalized.md"),
    path.join(targetInfo.deckPath, "plan.md"),
    path.join(targetInfo.deckPath, "design-system.md"),
    path.join(targetInfo.deckPath, "SLIDES.md"),
    path.join(targetInfo.deckPath, "images", "workflow-overview.svg"),
  ];
  await assertSourceArtifactsPresent("failure-path:force-source-retention-before", sourceArtifactPaths);
  const expectedArchivedBasenames = [
    "force-plan-supervision.md",
    "force-plan-approval.md",
    "force-compose-supervision.md",
    "force-compose-approval.md",
    "force-polish-supervision.md",
    "force-deliver-supervision.md",
  ];
  for (const filePath of [
    supervisionPath(targetInfo, "plan"),
    approvalPath(targetInfo, "plan"),
    supervisionPath(targetInfo, "compose"),
    approvalPath(targetInfo, "compose"),
    supervisionPath(targetInfo, "polish"),
    supervisionPath(targetInfo, "deliver"),
  ]) {
    assert(existsSync(filePath), `failure-path:force-archive missing pre-force artifact: ${relativePath(filePath)}`);
  }

  const forceCommand = await runWorkflowCommand("failure-path:force-command", "plan", targetInfo, options, ["--force"]);
  commands.push(forceCommand);

  const historyAfter = await listHistoryFiles(targetInfo);
  const newHistoryFiles = historyAfter.filter((fileName) => !historyBefore.includes(fileName));
  for (const basename of expectedArchivedBasenames) {
    assert(
      newHistoryFiles.some((fileName) => fileName.endsWith(basename)),
      `failure-path:force-archive missing archived ${basename}; new history files: ${newHistoryFiles.join(",")}`,
    );
  }

  const generatedOutputPaths = [
    path.join(ROOT, "dist", targetInfo.deckName),
    path.join(ROOT, ".takt", "render", targetInfo.deckName),
  ];
  for (const generatedPath of generatedOutputPaths) {
    assert(!existsSync(generatedPath), `failure-path:force-generated-cleanup found stale generated output: ${relativePath(generatedPath)}`);
  }
  await assertSourceArtifactsPresent("failure-path:force-source-retention", sourceArtifactPaths);

  const planSupervision = await readSupervision(targetInfo, "plan");
  assert(planSupervision.data.state === "planned", `failure-path:force-new-plan-supervision expected planned, got ${planSupervision.data.state}`);
  assert(planSupervision.data.result === "passed", `failure-path:force-new-plan-supervision expected passed, got ${planSupervision.data.result}`);
  for (const invalidatedPath of [
    approvalPath(targetInfo, "plan"),
    supervisionPath(targetInfo, "compose"),
    approvalPath(targetInfo, "compose"),
    supervisionPath(targetInfo, "polish"),
    supervisionPath(targetInfo, "deliver"),
  ]) {
    assert(!existsSync(invalidatedPath), `failure-path:force-invalidation left downstream state: ${relativePath(invalidatedPath)}`);
  }

  checks.push(pass("failure-path:force-command", "slide:plan --force completed after archiving command state."));
  checks.push(pass("failure-path:force-archive", "force archived plan and downstream supervision/approval files to review/history."));
  checks.push(pass("failure-path:force-generated-cleanup", "force cleaned stale dist and render generated output roots."));
  checks.push(pass("failure-path:force-source-retention", "force retained deck source artifacts such as brief, plan, design-system, SLIDES.md, and SVG."));
  checks.push(pass("failure-path:force-new-plan-supervision", "force rerun generated a new passed canonical plan supervision report."));

  return Object.freeze({
    checks: Object.freeze(checks),
    commands: Object.freeze(commands),
    observedPaths: Object.freeze([
      planSupervision.filePath,
      path.join(targetInfo.reviewPath, "history"),
      ...newHistoryFiles.map((fileName) => path.join(targetInfo.reviewPath, "history", fileName)),
      ...sourceArtifactPaths,
      ...generatedOutputPaths,
    ].map(relativePath)),
  });
}

async function runRejectedRerunArchiveChecks(targetInfo, options) {
  const checks = [];
  const commands = [];
  const rejectedWorkflowRunId = "smoke-rejected-plan-rerun";
  const historyBefore = await listHistoryFiles(targetInfo);

  await writeSyntheticSupervision(targetInfo, "plan", {
    state: "none",
    result: "rejected",
    workflowRunId: rejectedWorkflowRunId,
  });

  const rejectedSnapshot = await readFile(supervisionPath(targetInfo, "plan"), "utf8");
  const providerArgs = providerFlagArgs(options);
  const commandLine = `node scripts/takt-marp-run-slide-workflow.mjs plan ${[JSON.stringify(targetInfo.target), ...providerArgs.map((arg) => JSON.stringify(arg))].join(" ")}`;
  commands.push(commandLine);

  if (isMockProvider(options)) {
    await archiveCommandArtifacts(targetInfo, ["plan"], "rejected-rerun");
    await writeMockCommandResult(targetInfo, "plan");
  } else {
    const result = spawnSync(process.execPath, [RUNNER_SCRIPT, "plan", targetInfo.target, ...providerArgs], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: WORKFLOW_COMMAND_TIMEOUT_MS,
      maxBuffer: CAPTURE_MAX_BUFFER,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert(result.status === 0, `failure-path:rejected-rerun-allowed failed with exit code ${result.status ?? "unknown"}: ${output}`);
    assert(output.includes("Workflow completed"), `failure-path:rejected-rerun-allowed did not run workflow to completion: ${output}`);
    assert(!output.includes("RERUN_BLOCKED:"), `failure-path:rejected-rerun-allowed was blocked as successful rerun: ${output}`);
  }

  const historyAfter = await listHistoryFiles(targetInfo);
  const archivedFiles = historyAfter.filter((fileName) => !historyBefore.includes(fileName) && fileName.includes("rejected-rerun-plan-supervision.md"));
  assert(archivedFiles.length === 1, `failure-path:rejected-rerun-archive expected one rejected archive, got ${archivedFiles.join(",")}`);
  const archivedPath = path.join(targetInfo.reviewPath, "history", archivedFiles[0]);
  const archivedContent = await readFile(archivedPath, "utf8");
  assert(archivedContent === rejectedSnapshot, `failure-path:rejected-rerun-archive archived content did not match rejected supervision: ${relativePath(archivedPath)}`);
  assert(archivedContent.includes(`workflow_run_id: ${rejectedWorkflowRunId}`), `failure-path:rejected-rerun-archive archived wrong report: ${relativePath(archivedPath)}`);
  assert(archivedContent.includes("result: rejected"), `failure-path:rejected-rerun-archive archived report was not rejected: ${relativePath(archivedPath)}`);

  const supervision = await readSupervision(targetInfo, "plan");
  assert(supervision.data.state === "planned", `failure-path:rejected-rerun-new-report expected planned, got ${supervision.data.state}`);
  assert(supervision.data.result === "passed", `failure-path:rejected-rerun-new-report expected passed, got ${supervision.data.result}`);
  assert(
    supervision.data.workflow_run_id !== rejectedWorkflowRunId,
    "failure-path:rejected-rerun-new-report did not replace the rejected workflow_run_id",
  );

  checks.push(pass("failure-path:rejected-rerun-allowed", "rejected canonical plan supervision allowed rerun without --force."));
  checks.push(pass("failure-path:rejected-rerun-archive", "rejected plan supervision was archived to review/history before rerun."));
  checks.push(pass("failure-path:rejected-rerun-new-report", "rerun generated a new passed canonical plan supervision report."));

  return Object.freeze({
    checks: Object.freeze(checks),
    commands: Object.freeze(commands),
    observedPaths: Object.freeze([
      supervision.filePath,
      archivedPath,
      path.join(targetInfo.reviewPath, "history"),
    ].map(relativePath)),
  });
}

async function snapshotFiles(filePaths) {
  const snapshots = [];
  for (const filePath of filePaths) {
    snapshots.push(Object.freeze({
      filePath,
      exists: existsSync(filePath),
      content: existsSync(filePath) ? await readFile(filePath, "utf8") : null,
    }));
  }
  return Object.freeze(snapshots);
}

async function assertSnapshotsUnchanged(name, snapshots) {
  for (const snapshot of snapshots) {
    assert(existsSync(snapshot.filePath) === snapshot.exists, `${name} changed protected file existence: ${relativePath(snapshot.filePath)}`);
    if (snapshot.exists) {
      const content = await readFile(snapshot.filePath, "utf8");
      assert(content === snapshot.content, `${name} changed protected file: ${relativePath(snapshot.filePath)}`);
    }
  }
}

async function assertSourceArtifactsPresent(name, filePaths) {
  for (const filePath of filePaths) {
    await assertReadableFile(filePath, name);
  }
}

async function listHistoryFiles(targetInfo) {
  const historyPath = path.join(targetInfo.reviewPath, "history");
  if (!existsSync(historyPath)) {
    return Object.freeze([]);
  }
  const entries = await readdir(historyPath, { withFileTypes: true });
  return Object.freeze(entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort());
}

async function setupSyntheticValidationDeck(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.join(targetPath, "review"), { recursive: true });
  await writeFile(path.join(targetPath, "brief.md"), "# Synthetic State Validation\n", "utf8");
  return STATE_VALIDATION_TARGET;
}

async function assertSlideWorkflowFailure(name, run, expectedCode) {
  try {
    await run();
  } catch (error) {
    assert(error instanceof SlideWorkflowError, `${name} failed with unexpected error type: ${formatError(error)}`);
    assert(error.code === expectedCode, `${name} expected ${expectedCode}, got ${error.code}: ${formatError(error)}`);
    return;
  }
  throw new SlideWorkflowError(`${name} unexpectedly succeeded`, "SMOKE_ASSERTION_FAILED");
}

function assertPreflightFailure(name, command, target, expectedCode) {
  const commandLine = `node scripts/takt-marp-run-slide-workflow.mjs ${command} ${JSON.stringify(target)}`;
  const result = spawnSync(process.execPath, [RUNNER_SCRIPT, command, target], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: NODE_CHECK_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, `${name} unexpectedly succeeded`);
  assert(output.includes(`${expectedCode}:`), `${name} did not report ${expectedCode}: ${output}`);
  assertNoWorkflowExecution(output, name);
  return commandLine;
}

function assertNoWorkflowExecution(output, name) {
  assert(!output.includes("TAKT_EXECUTABLE_MISSING"), `${name} reached TAKT executable preflight: ${output}`);
  assert(!output.includes("Workflow completed"), `${name} reached workflow completion: ${output}`);
  assert(!output.includes("TAKT_REPORT_SYNC_"), `${name} reached workflow report sync: ${output}`);
}

function assertApprovalCommandFailure(name, target, command, args, expectedOutput) {
  const commandArgs = [target, command, ...args];
  const commandLine = `node scripts/takt-marp-approve-slide-workflow-state.mjs ${commandArgs.map((arg) => JSON.stringify(arg)).join(" ")}`;
  const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, "takt-marp-approve-slide-workflow-state.mjs"), ...commandArgs], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: NODE_CHECK_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, `${name} unexpectedly succeeded`);
  assert(output.includes(expectedOutput), `${name} did not report ${expectedOutput}: ${output}`);
  return commandLine;
}

async function runWorkflowCommand(name, command, targetInfo, options, extraArgs = []) {
  const args = workflowCommandArgs(targetInfo.target, options, extraArgs);
  const runnerArgs = [command, ...args];
  const commandLine = `node scripts/takt-marp-run-slide-workflow.mjs ${runnerArgs.map((arg) => JSON.stringify(arg)).join(" ")}`;
  if (!isMockProvider(options)) {
    return runWorkflowNodeScript(name, "takt-marp-run-slide-workflow.mjs", runnerArgs);
  }

  if (extraArgs.includes("--force")) {
    await archiveCommandArtifacts(targetInfo, downstreamCommands(command), "force", { includeApprovals: true });
    await cleanGeneratedOutputs(targetInfo, { root: ROOT });
  }
  await writeMockCommandResult(targetInfo, command);
  return commandLine;
}

function isMockProvider(options) {
  return options?.provider === "mock";
}

async function writeMockCommandResult(targetInfo, command) {
  await mkdir(targetInfo.reviewPath, { recursive: true });
  const workflowRunId = `mock-smoke-${command}`;
  const reportsPath = path.join(ROOT, ".takt", "runs", `mock-${targetInfo.deckName}-${command}`, "reports");
  await rm(path.dirname(reportsPath), { recursive: true, force: true });
  await mkdir(reportsPath, { recursive: true });

  if (command === "plan") {
    await writeMockPlanArtifacts(targetInfo);
  } else if (command === "compose") {
    await writeMockComposeArtifacts(targetInfo);
  } else if (command === "polish") {
    await writeMockRenderEvidence(targetInfo, 1);
  } else if (command === "deliver") {
    await writeMockDeliveryArtifacts(targetInfo);
  }

  for (const report of mockReports(targetInfo, command, workflowRunId)) {
    await writeReportCopies(targetInfo.reviewPath, reportsPath, report.name, report.content);
  }
}

async function writeReportCopies(reviewPath, reportsPath, reportName, content) {
  await writeFile(path.join(reviewPath, reportName), content, "utf8");
  await writeFile(path.join(reportsPath, reportName), content, "utf8");
}

async function writeMockPlanArtifacts(targetInfo) {
  await writeFile(path.join(targetInfo.deckPath, "brief.normalized.md"), "# Normalized Brief\n\nMock smoke normalized brief.\n", "utf8");
  await writeFile(
    path.join(targetInfo.deckPath, "plan.md"),
    [
      "# Slide Plan",
      "",
      "deliverables: [html, pdf]",
      "",
      "## Slides",
      "- Title",
      "- Workflow overview",
      "- Input discipline",
      "- Review discipline",
      "- Delivery QA",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeMockComposeArtifacts(targetInfo) {
  await mkdir(path.join(targetInfo.deckPath, "images"), { recursive: true });
  await writeFile(path.join(targetInfo.deckPath, "design-system.md"), "# Design System\n\nMock smoke design system.\n", "utf8");
  await writeFile(
    path.join(targetInfo.deckPath, "SLIDES.md"),
    [
      "---",
      "marp: true",
      "title: Workflow smoke test",
      "---",
      "",
      "# Workflow smoke test",
      "",
      "---",
      "",
      "![workflow overview](images/workflow-overview.svg)",
      "",
      "---",
      "",
      "Input discipline",
      "",
      "---",
      "",
      "Review discipline",
      "",
      "---",
      "",
      "Delivery QA",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(targetInfo.deckPath, "images", "workflow-overview.svg"),
    [
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
      '<rect width="640" height="360" fill="#f7f7f7"/>',
      '<text x="40" y="180" font-family="sans-serif" font-size="32" fill="#222">Mock workflow overview</text>',
      "</svg>",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeMockRenderEvidence(targetInfo, cycle) {
  const evidenceRoot = path.join(ROOT, ".takt", "render", targetInfo.deckName, `cycle-${cycle}`);
  await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, "slide-1.png"), "mock png evidence\n", "utf8");
  await writeFile(path.join(evidenceRoot, "SLIDES.pdf"), "mock pdf evidence\n", "utf8");
  await writeFile(
    path.join(evidenceRoot, "metadata.json"),
    `${JSON.stringify(
      {
        deck: targetInfo.deckName,
        target: targetInfo.target,
        cycle,
        html_png: { status: "passed", files: ["slide-1.png"] },
        pdf: { status: "passed", file: "SLIDES.pdf" },
        pdf_raster: { status: "skipped", reason: "mock smoke uses deterministic synthetic render evidence", files: [] },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeRenderEvidenceMarker(targetInfo, cycle);
}

async function writeMockDeliveryArtifacts(targetInfo) {
  const distPath = path.join(ROOT, "dist", targetInfo.deckName);
  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });
  await writeFile(path.join(distPath, "SLIDES.html"), "<!doctype html><title>Mock smoke</title>\n", "utf8");
  await writeFile(path.join(distPath, "SLIDES.pdf"), "mock pdf artifact\n", "utf8");
}

function mockReports(targetInfo, command, workflowRunId) {
  const reports = [];
  const workReport = command === "deliver"
    ? [
        "- Result: passed",
        `- Cleaned directory: ${relativePath(path.join(ROOT, "dist", targetInfo.deckName))}`,
        "- Artifacts: SLIDES.html, SLIDES.pdf",
      ].join("\n")
    : "- Result: passed\n";
  reports.push(mockReport(`${command}-work.md`, targetInfo, command, workflowRunId, reportStepFromName(command, `${command}-work.md`), "passed", workReport));

  const normalReportName = {
    plan: "plan-review.md",
    compose: "compose-review.md",
    polish: "polish-inspect.md",
    deliver: "deliver-verify.md",
  }[command];
  const normalBody = command === "deliver"
    ? "- Result: approved\n- Verified artifacts: SLIDES.html, SLIDES.pdf\n"
    : "- Result: approved\n";
  reports.push(mockReport(normalReportName, targetInfo, command, workflowRunId, reportStepFromName(command, normalReportName), "approved", normalBody));
  reports.push(mockAiGateReviewReport(targetInfo, command, workflowRunId));
  reports.push(mockSupervisionReport(targetInfo, command, workflowRunId));
  return reports;
}

function mockReport(name, targetInfo, command, workflowRunId, step, result, body) {
  return Object.freeze({
    name,
    content: [
      "---",
      `command: ${command}`,
      `target: ${targetInfo.target}`,
      `generated_at: ${MOCK_GENERATED_AT}`,
      `workflow_run_id: ${workflowRunId}`,
      `step: ${step}`,
      "cycle: 1",
      `result: ${result}`,
      "---",
      "",
      `# Mock ${step}`,
      "",
      body,
      "",
    ].join("\n"),
  });
}

function mockAiGateReviewReport(targetInfo, command, workflowRunId) {
  return Object.freeze({
    name: `${command}-ai-antipattern-review.md`,
    content: [
      "---",
      `command: ${command}`,
      `target: ${targetInfo.target}`,
      `generated_at: ${MOCK_GENERATED_AT}`,
      `workflow_run_id: ${workflowRunId}`,
      "step: ai_antipattern_review",
      "cycle: 1",
      `reviewed_scope: ${command} mock smoke output`,
      "result: approved",
      "finding_count: 0",
      "blocking_finding_count: 0",
      "---",
      "",
      "# AI Antipattern Review Report",
      "",
      "Mock smoke found no AI-specific findings.",
      "",
      "## AI Findings",
      "",
      "| ID | Severity | Evidence |",
      "| --- | --- | --- |",
      "",
    ].join("\n"),
  });
}

function mockSupervisionReport(targetInfo, command, workflowRunId) {
  return Object.freeze({
    name: `${command}-supervision.md`,
    content: [
      "---",
      `command: ${command}`,
      `target: ${targetInfo.target}`,
      `generated_at: ${MOCK_GENERATED_AT}`,
      `workflow_run_id: ${workflowRunId}`,
      "step: supervision",
      "cycle: 1",
      `state: ${mockCommandState(command)}`,
      "result: passed",
      "blocking_findings: 0",
      "major_findings: 0",
      "minor_findings: 0",
      "info_findings: 0",
      "---",
      "",
      "# Mock Supervision",
      "",
      "Result: passed",
      "",
    ].join("\n"),
  });
}

function mockCommandState(command) {
  return {
    plan: "planned",
    compose: "composed",
    polish: "polished",
    deliver: "delivered",
  }[command];
}

function workflowCommandArgs(target, options, extraArgs = []) {
  return [target, ...providerFlagArgs(options), ...extraArgs];
}

function providerFlagArgs(options) {
  return options?.provider ? ["--provider", options.provider] : [];
}

function runWorkflowNodeScript(name, script, args) {
  const commandLine = `node scripts/${script} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
  const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, script), ...args], {
    cwd: ROOT,
    stdio: "inherit",
    timeout: WORKFLOW_COMMAND_TIMEOUT_MS,
  });
  assertSpawnSucceeded(result, name);
  return commandLine;
}

function runNodeScript(name, script, args) {
  const scriptPath = path.join(SCRIPT_DIR, script);
  const commandLine = `node scripts/${script} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    timeout: NODE_CHECK_TIMEOUT_MS,
  });
  assertSpawnSucceeded(result, name);
  return commandLine;
}

function assertSpawnSucceeded(result, name) {
  if (result.error) {
    assert(false, `${name} failed while executing: ${result.error.message}`);
  }
  assert(result.status === 0, `${name} failed with exit code ${result.status ?? "unknown"}`);
}

function assertNodeScriptFailure(name, script, args, expectedCode) {
  const scriptPath = path.join(SCRIPT_DIR, script);
  const commandLine = `node scripts/${script} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: NODE_CHECK_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, `${name} unexpectedly succeeded`);
  assert(output.includes(`${expectedCode}:`), `${name} did not report ${expectedCode}: ${output}`);
  return commandLine;
}

async function cleanApprovalPreflightState(targetInfo) {
  await Promise.all([
    rm(supervisionPath(targetInfo, "plan"), { force: true }),
    rm(supervisionPath(targetInfo, "compose"), { force: true }),
    rm(approvalPath(targetInfo, "plan"), { force: true }),
    rm(approvalPath(targetInfo, "compose"), { force: true }),
  ]);
}

async function cleanApprovalCommandState(targetInfo) {
  await Promise.all(["plan", "compose", "polish", "deliver"].flatMap((command) => [
    rm(supervisionPath(targetInfo, command), { force: true }),
    rm(approvalPath(targetInfo, command), { force: true }),
  ]));
}

function assertApprovalCommandStateAbsent(targetInfo, name) {
  for (const command of ["plan", "compose", "polish", "deliver"]) {
    assertApprovalFileAbsent(targetInfo, command, name);
    const filePath = supervisionPath(targetInfo, command);
    assert(!existsSync(filePath), `${name} left unexpected synthetic supervision file: ${relativePath(filePath)}`);
  }
}

function assertApprovalFileAbsent(targetInfo, command, name) {
  const filePath = approvalPath(targetInfo, command);
  assert(!existsSync(filePath), `${name} left unexpected approval file: ${relativePath(filePath)}`);
}

async function assertComposeSourceArtifacts(targetInfo) {
  const designSystemPath = path.join(targetInfo.deckPath, "design-system.md");
  const slidesPath = path.join(targetInfo.deckPath, "SLIDES.md");
  const imagesPath = path.join(targetInfo.deckPath, "images");
  await assertReadableFile(designSystemPath, "sequence:compose-source-artifacts");
  await assertReadableFile(slidesPath, "sequence:compose-source-artifacts");
  const entries = await readdir(imagesPath, { withFileTypes: true });
  const svgPaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
    .map((entry) => path.join(imagesPath, entry.name));
  assert(svgPaths.length > 0, `sequence:compose-source-artifacts expected at least one SVG in ${relativePath(imagesPath)}`);
  for (const svgPath of svgPaths) {
    await assertReadableFile(svgPath, "sequence:compose-source-artifacts");
  }
  return Object.freeze([designSystemPath, slidesPath, ...svgPaths]);
}

async function setupSyntheticRenderEvidenceDeck(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.join(targetPath, "review"), { recursive: true });
  await writeFile(path.join(targetPath, "brief.md"), "# Synthetic Render Evidence Validation\n", "utf8");
}

async function writeSyntheticRenderEvidenceMetadata({ target, htmlPng, pdf, pdfRaster }) {
  const targetInfo = resolveDeckTarget(target, { root: ROOT });
  const evidenceRoot = path.join(ROOT, ".takt", "render", targetInfo.deckName, "cycle-1");
  await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, "slide-1.png"), "synthetic png evidence\n", "utf8");
  await writeFile(path.join(evidenceRoot, "SLIDES.pdf"), "synthetic pdf evidence\n", "utf8");
  await writeFile(
    path.join(evidenceRoot, "metadata.json"),
    `${JSON.stringify(
      {
        deck: targetInfo.deckName,
        target: targetInfo.target,
        cycle: 1,
        html_png: htmlPng,
        pdf,
        pdf_raster: pdfRaster,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeRenderEvidenceMarker(targetInfo, 1);
}

async function writeRenderEvidenceMarker(targetInfo, cycle) {
  const metadataPath = path.join(ROOT, ".takt", "render", targetInfo.deckName, `cycle-${cycle}`, "metadata.json");
  const markerPath = path.join(ROOT, ".takt", "render", "latest-render-evidence.json");
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        target: targetInfo.target,
        deck: targetInfo.deckName,
        cycle,
        metadata_path: relativePath(metadataPath),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function assertRenderEvidenceArtifacts(targetInfo, cycle) {
  const markerPath = path.join(ROOT, ".takt", "render", "latest-render-evidence.json");
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  assert(marker.target === targetInfo.target, `sequence:polish-render-evidence-marker expected ${targetInfo.target}, got ${marker.target}`);
  assert(marker.cycle === cycle, `sequence:polish-render-evidence-marker expected cycle ${cycle}, got ${marker.cycle}`);

  const evidenceRoot = path.join(ROOT, ".takt", "render", targetInfo.deckName, `cycle-${cycle}`);
  const metadataPath = path.join(evidenceRoot, "metadata.json");
  assert(existsSync(evidenceRoot), `sequence:polish-render-evidence-root missing ${relativePath(evidenceRoot)}`);
  assert(marker.metadata_path === relativePath(metadataPath), `sequence:polish-render-evidence-marker metadata_path mismatch: ${marker.metadata_path}`);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert(metadata.target === targetInfo.target, `sequence:polish-render-evidence-metadata target mismatch: ${metadata.target}`);
  assert(metadata.cycle === cycle, `sequence:polish-render-evidence-metadata cycle mismatch: ${metadata.cycle}`);
  assertUsableRenderStatus("html_png", metadata.html_png);
  const htmlPngPaths = await assertRenderEvidenceFiles(evidenceRoot, "html_png", metadata.html_png.files);
  assertUsableRenderStatus("pdf", metadata.pdf);
  const pdfPath = await assertRenderEvidenceFile(evidenceRoot, "pdf", metadata.pdf.file);
  const pdfRasterPaths = await assertOptionalPdfRasterEvidence(evidenceRoot, metadata.pdf_raster);

  return Object.freeze({
    evidenceRoot,
    observedPaths: Object.freeze([
      markerPath,
      evidenceRoot,
      metadataPath,
      ...htmlPngPaths,
      pdfPath,
      ...pdfRasterPaths,
    ]),
  });
}

function assertUsableRenderStatus(key, item) {
  assert(item && typeof item.status === "string", `sequence:polish-render-evidence-metadata ${key} status missing`);
  assert(!["pending", "failed", "degraded", "skipped"].includes(item.status), `sequence:polish-render-evidence-metadata ${key} status not usable: ${item.status}`);
}

async function assertOptionalPdfRasterEvidence(evidenceRoot, item) {
  assert(item && typeof item.status === "string", "sequence:polish-render-evidence-metadata pdf_raster status missing");
  assert(!["pending", "failed"].includes(item.status), `sequence:polish-render-evidence-metadata pdf_raster status not usable: ${item.status}`);
  if (["degraded", "skipped"].includes(item.status)) {
    assert(typeof item.reason === "string" && item.reason.trim(), `sequence:polish-render-evidence-metadata pdf_raster reason missing for ${item.status}`);
    return Object.freeze([]);
  }
  return assertRenderEvidenceFiles(evidenceRoot, "pdf_raster", item.files);
}

async function assertRenderEvidenceFiles(evidenceRoot, key, files) {
  assert(Array.isArray(files) && files.length > 0, `sequence:polish-render-evidence-metadata ${key} files missing`);
  const paths = [];
  for (const [index, file] of files.entries()) {
    paths.push(await assertRenderEvidenceFile(evidenceRoot, `${key}[${index}]`, file));
  }
  return Object.freeze(paths);
}

async function assertRenderEvidenceFile(evidenceRoot, label, value) {
  assert(typeof value === "string" && value.trim(), `sequence:polish-render-evidence-metadata ${label} path missing`);
  const filePath = resolveRenderEvidenceFile(evidenceRoot, value);
  await assertReadableFile(filePath, `sequence:polish-render-evidence-metadata ${label}`);
  return filePath;
}

function resolveRenderEvidenceFile(evidenceRoot, value) {
  if (path.isAbsolute(value)) {
    return value;
  }
  const evidenceRelativePath = path.join(evidenceRoot, value);
  if (existsSync(evidenceRelativePath)) {
    return evidenceRelativePath;
  }
  return path.join(ROOT, value);
}

async function seedStaleDeliveryArtifacts(targetInfo) {
  const distPath = path.join(ROOT, "dist", targetInfo.deckName);
  const staleArtifactPaths = [
    path.join(distPath, "SLIDES.pptx"),
    path.join(distPath, "stale.html"),
  ];
  await mkdir(distPath, { recursive: true });
  await Promise.all(staleArtifactPaths.map((filePath) => writeFile(filePath, `stale artifact for ${targetInfo.target}\n`, "utf8")));
  return Object.freeze(staleArtifactPaths);
}

async function assertDeliveryArtifacts(targetInfo, options = {}) {
  const requested = await readRequestedDeliverables(targetInfo);
  const distPath = path.join(ROOT, "dist", targetInfo.deckName);
  const entries = existsSync(distPath) ? await readdir(distPath, { withFileTypes: true }) : [];
  const officialFiles = entries
    .filter((entry) => entry.isFile() && /\.(html|pdf|pptx)$/.test(entry.name))
    .map((entry) => entry.name);
  const expected = Object.freeze({ html: "SLIDES.html", pdf: "SLIDES.pdf", pptx: "SLIDES.pptx" });
  const artifactPaths = [];

  for (const staleArtifactPath of options.staleArtifactPaths ?? []) {
    assert(!existsSync(staleArtifactPath), `sequence:deliver-stale-cleanup found stale artifact after deliver: ${relativePath(staleArtifactPath)}`);
  }

  for (const item of requested) {
    const fileName = expected[item];
    assert(fileName, `sequence:deliver-artifacts unsupported deliverable ${item}`);
    assert(officialFiles.includes(fileName), `sequence:deliver-artifacts missing ${fileName}`);
    const filePath = path.join(distPath, fileName);
    await assertReadableFile(filePath, "sequence:deliver-artifacts");
    artifactPaths.push(filePath);
  }

  for (const fileName of officialFiles) {
    const kind = Object.keys(expected).find((key) => expected[key] === fileName);
    assert(kind && requested.includes(kind), `sequence:deliver-artifacts found stale or unrequested artifact ${fileName}`);
  }

  assertRenderEvidenceOutsideDeliveryArtifacts(options.renderEvidenceRoot, distPath, artifactPaths);

  return Object.freeze({
    observedPaths: Object.freeze([distPath, ...artifactPaths]),
  });
}

function assertRenderEvidenceOutsideDeliveryArtifacts(renderEvidenceRoot, distPath, artifactPaths) {
  assert(renderEvidenceRoot && existsSync(renderEvidenceRoot), `sequence:deliver-render-evidence-boundary missing render evidence root: ${renderEvidenceRoot}`);
  const relativeRenderRoot = relativePath(renderEvidenceRoot);
  assert(relativeRenderRoot.startsWith(".takt/render/"), `sequence:deliver-render-evidence-boundary expected render evidence under .takt/render, got ${relativeRenderRoot}`);
  for (const artifactPath of artifactPaths) {
    assert(artifactPath.startsWith(`${distPath}${path.sep}`), `sequence:deliver-render-evidence-boundary official artifact outside dist: ${relativePath(artifactPath)}`);
    assert(!artifactPath.startsWith(`${renderEvidenceRoot}${path.sep}`), `sequence:deliver-render-evidence-boundary counted render evidence as delivery artifact: ${relativePath(artifactPath)}`);
  }
}

async function readRequestedDeliverables(targetInfo) {
  const plan = await readFile(path.join(targetInfo.deckPath, "plan.md"), "utf8");
  const match = plan.match(/deliverables\s*:\s*\[([^\]]*)\]/i);
  assert(match, "sequence:deliver-artifacts expected plan.md deliverables field");
  return Object.freeze(
    match[1]
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
      .filter(Boolean),
  );
}

async function assertReadableFile(filePath, name) {
  const content = await readFile(filePath, "utf8");
  assert(content.trim().length > 0, `${name} expected non-empty file: ${relativePath(filePath)}`);
}

function assertWorkflowLoopMonitor(command, expected) {
  const workflowFile = path.join(ROOT, ".takt", "workflows", `takt-marp-slide-${command}.yaml`);
  const source = readFileSyncUtf8(workflowFile);
  const loopMonitorsIndex = source.indexOf("loop_monitors:");
  const stepsIndex = source.indexOf("\nsteps:");
  assert(loopMonitorsIndex !== -1, `${command} workflow missing TAKT loop_monitors`);
  assert(stepsIndex > loopMonitorsIndex, `${command} workflow loop_monitors must be defined before steps`);

  const monitorBlock = source.slice(loopMonitorsIndex, stepsIndex);
  assertTextSequence(monitorBlock, expected.cycle.map((step) => `- ${step}`), `${command} loop monitor cycle`);
  assert(monitorBlock.includes("threshold: 3"), `${command} loop monitor threshold must be 3`);
  assert(monitorBlock.includes("persona: takt-marp-slide-supervisor"), `${command} loop monitor judge must use takt-marp-slide-supervisor`);
  assert(monitorBlock.includes("instruction: loop-monitor-reviewers-fix"), `${command} loop monitor must use TAKT built-in instruction`);
  assert(monitorBlock.includes(`next: ${expected.healthyNext}`), `${command} healthy loop monitor route must continue to ${expected.healthyNext}`);
  assert(monitorBlock.includes("next: ABORT"), `${command} nonproductive loop monitor route must abort`);
  assert(!source.includes("takt-marp-loop-monitor"), `${command} workflow must not use the deck-local loop monitor instruction`);
  assert(!source.includes("takt-marp-slide-loop-monitor"), `${command} workflow must not use the deck-local loop monitor persona`);
  assert(!source.includes(expected.removedMonitorStep), `${command} workflow must not use a deck-local monitor step`);
  assertRouteNext(source, "approved", expected.approvedNext);
}

function assertAiGateWorkflowRoute(command, expected) {
  const workflowFile = path.join(ROOT, ".takt", "workflows", `takt-marp-slide-${command}.yaml`);
  const source = readFileSyncUtf8(workflowFile);
  const workStepBlock = workflowStepBlock(source, expected.workStep);
  const gateStepBlock = workflowStepBlock(source, expected.gateStep);

  assertRouteNext(workStepBlock, "resultがpassed", expected.gateStep);
  assert(gateStepBlock.includes("kind: workflow_call"), `${command} AI gate step must use workflow_call`);
  assert(gateStepBlock.includes("call: ./takt-marp-slide-ai-quality-gate.yaml"), `${command} AI gate step must call takt-marp-slide-ai-quality-gate.yaml`);
  assertRouteNext(gateStepBlock, "COMPLETE", expected.normalReviewStep);
  assertRouteNext(gateStepBlock, "need_replan", expected.replanStep);
  assertRouteNext(gateStepBlock, "ABORT", "ABORT");
  assert(
    source.indexOf(`  - name: ${expected.gateStep}`) < source.indexOf(`  - name: ${expected.normalReviewStep}`),
    `${command} AI gate must appear before normal review step`,
  );
}

function assertAiGateCallableWorkflowRules() {
  const workflowFile = path.join(ROOT, ".takt", "workflows", "takt-marp-slide-ai-quality-gate.yaml");
  const source = readFileSyncUtf8(workflowFile);
  const reviewStepBlock = workflowStepBlock(source, "ai-antipattern-review-1st");
  assertRouteNext(reviewStepBlock, "result approved and blocking_finding_count is 0", "COMPLETE");
  assert(
    !reviewStepBlock.includes("result approved and finding_count is 0"),
    "AI gate review completion must allow resolved finding rows after a fix cycle",
  );
}

function workflowStepBlock(source, stepName) {
  const stepStart = source.indexOf(`\n  - name: ${stepName}\n`);
  assert(stepStart !== -1, `workflow step not found: ${stepName}`);
  const nextStepStart = source.indexOf("\n  - name: ", stepStart + 1);
  return nextStepStart === -1 ? source.slice(stepStart) : source.slice(stepStart, nextStepStart);
}

function assertNoDeckLocalLoopMonitorFacets() {
  for (const filePath of [
    path.join(ROOT, ".takt", "facets", "instructions", "takt-marp-loop-monitor.md"),
    path.join(ROOT, ".takt", "facets", "personas", "takt-marp-slide-loop-monitor.md"),
    path.join(ROOT, ".takt", "facets", "output-contracts", "takt-marp-loop-monitor.md"),
  ]) {
    assert(!existsSync(filePath), `deck-local loop monitor facet still exists: ${relativePath(filePath)}`);
  }
}

function assertWorkflowDoctorPasses() {
  const workflowPaths = [
    ...WORKFLOW_COMMANDS.map((command) => path.join(".takt", "workflows", `takt-marp-slide-${command}.yaml`)),
    path.join(".takt", "workflows", "takt-marp-slide-ai-quality-gate.yaml"),
  ];
  const result = spawnSync(runtimeExecutablePath("takt"), ["workflow", "doctor", ...workflowPaths], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: NODE_CHECK_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status === 0, `workflow doctor failed for AI gate workflow set: ${output}`);
}

function assertTextSequence(source, snippets, name) {
  let cursor = -1;
  for (const snippet of snippets) {
    const nextIndex = source.indexOf(snippet, cursor + 1);
    assert(nextIndex !== -1, `${name} missing ordered snippet: ${snippet}`);
    cursor = nextIndex;
  }
}

function assertNoUnsupportedWorkflowCommandGateObjects() {
  const workflowFiles = [
    ...WORKFLOW_COMMANDS.map((command) => path.join(ROOT, ".takt", "workflows", `takt-marp-slide-${command}.yaml`)),
    path.join(ROOT, ".takt", "workflows", "takt-marp-slide-ai-quality-gate.yaml"),
  ];
  for (const workflowFile of workflowFiles) {
    const source = readFileSyncUtf8(workflowFile);
    assert(!source.includes("type: command"), `${relativePath(workflowFile)} must not use command quality gate objects`);
    assert(!source.includes("{task}"), `${relativePath(workflowFile)} must not use unsupported {task} interpolation`);
  }
}

function assertRouteNext(source, condition, next) {
  const conditionIndex = source.indexOf(`condition: ${condition}`);
  assert(conditionIndex !== -1, `workflow route condition not found: ${condition}`);
  const afterCondition = source.slice(conditionIndex, conditionIndex + 300);
  const nextLine = new RegExp(`(?:^|\\n)\\s*next:\\s*${escapeRegExp(next)}\\s*(?:\\n|$)`);
  assert(nextLine.test(afterCondition), `workflow route '${condition}' did not point to ${next}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readFileSyncUtf8(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

async function writeSyntheticSupervision(targetInfo, command, { state, result, workflowRunId }) {
  await mkdir(targetInfo.reviewPath, { recursive: true });
  await writeFile(
    supervisionPath(targetInfo, command),
    [
      "---",
      `command: ${command}`,
      `target: ${targetInfo.target}`,
      "generated_at: 2026-06-06T00:00:00.000Z",
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
      "# Synthetic Supervision",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeSyntheticApproval(targetInfo, command, { supervisionWorkflowRunId }) {
  await mkdir(targetInfo.reviewPath, { recursive: true });
  await writeFile(
    approvalPath(targetInfo, command),
    [
      "---",
      "status: approved",
      `command: ${command}`,
      `target: ${targetInfo.target}`,
      `approved_state: ${command === "plan" ? "planned" : "composed"}`,
      `supervision_workflow_run_id: ${supervisionWorkflowRunId}`,
      "approved_by: smoke-validation",
      "approved_at: 2026-06-06T00:01:00.000Z",
      "waivers: []",
      "decisions: []",
      "---",
      "",
      "# Synthetic Approval",
      "",
    ].join("\n"),
    "utf8",
  );
}

function parseSmokeArgs(argv) {
  const options = { target: DEFAULT_TARGET, provider: DEFAULT_SMOKE_PROVIDER, keep: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return Object.freeze({ ...options, help: true });
    }
    if (arg === "--keep") {
      options.keep = true;
      continue;
    }
    if (arg === "--deck") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new SlideWorkflowError("Missing value for --deck", "INVALID_ARGS");
      }
      options.target = value;
      index += 1;
      continue;
    }
    if (arg === "--provider") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new SlideWorkflowError("Missing value for --provider", "INVALID_ARGS");
      }
      options.provider = value;
      index += 1;
      continue;
    }
    throw new SlideWorkflowError(`Unsupported argument: ${arg}`, "INVALID_ARGS");
  }

  return Object.freeze(options);
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/takt-marp-validate-slide-workflow-smoke.mjs [--deck slides/_workflow-smoke] [--provider mock] [--keep]",
      "",
      "Sets up the workflow smoke deck from fixtures and writes provider-specific smoke summary evidence.",
      "",
      "Options:",
      "  --deck <target>  Smoke deck target directory. Task 1.2 accepts only slides/_workflow-smoke",
      "  --provider <name> TAKT provider for workflow execution. Defaults to mock for deterministic CI; pass claude, codex, etc. for real provider smoke.",
      "  --keep           Keep the generated smoke target and summary for inspection",
      "  -h, --help       Show this help",
      "",
    ].join("\n"),
  );
}

async function setupSmokeDeck(target) {
  assertSmokeTarget(target);
  if (!existsSync(FIXTURE_PATH)) {
    throw new SlideWorkflowError(`Smoke fixture not found: ${relativePath(FIXTURE_PATH)}`, "FIXTURE_MISSING");
  }

  const targetPath = path.join(ROOT, target);
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(targetPath, { recursive: true });

  const sourcePaths = await copyFixtureSources(FIXTURE_PATH, targetPath);
  const targetInfo = resolveDeckTarget(target, { root: ROOT });
  await cleanGeneratedOutputs(targetInfo, { root: ROOT });
  await mkdir(targetInfo.reviewPath, { recursive: true });

  return Object.freeze({
    targetInfo,
    observedPaths: Object.freeze([
      ...sourcePaths.map(relativePath),
      relativePath(path.join(ROOT, "dist", targetInfo.deckName)),
      relativePath(path.join(ROOT, ".takt", "render", targetInfo.deckName)),
    ]),
  });
}

function assertSmokeTarget(target) {
  if (target !== DEFAULT_TARGET) {
    throw new SlideWorkflowError(`Task 1.2 smoke setup is limited to ${DEFAULT_TARGET}`, "INVALID_TARGET");
  }
}

async function copyFixtureSources(sourceRoot, destinationRoot) {
  const copied = [];
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (SOURCE_FIXTURE_EXCLUDES.has(entry.name)) continue;
    const source = path.join(sourceRoot, entry.name);
    const destination = path.join(destinationRoot, entry.name);
    await cp(source, destination, { recursive: true });
    copied.push(destination);
  }

  const briefPath = path.join(destinationRoot, "brief.md");
  if (!existsSync(briefPath)) {
    throw new SlideWorkflowError(`Smoke fixture must provide brief.md: ${relativePath(briefPath)}`, "FIXTURE_INVALID");
  }
  return Object.freeze(copied);
}

async function writeSummary(summaryPath, data) {
  const rerunRisk = data.checks.some((check) => check.status === "PASS" && check.name === "failure-path:force-command")
    ? "- Rerun and force behavior are covered for successful rerun rejection, rejected rerun archive, and force invalidation."
    : data.checks.some((check) => check.status === "PASS" && check.name === "failure-path:successful-rerun-rejected")
      ? "- Successful rerun rejection is covered; rejected rerun archive and force invalidation remain later-task coverage."
      : "- Rerun/force behavior is not executed yet.";
  const content = [
    "---",
    `target: ${data.target}`,
    `provider: ${data.provider}`,
    `smoke_mode: ${data.smokeMode}`,
    `generated_at: ${new Date().toISOString()}`,
    `result: ${data.result}`,
    `commands_run: [${data.commands.map((command) => JSON.stringify(command)).join(", ")}]`,
    `failed_checks: [${data.checks.filter((check) => check.status === "FAIL").map((check) => JSON.stringify(check.name)).join(", ")}]`,
    "upstream_feedback_count: 0",
    "---",
    "",
    "# Smoke Summary",
    "",
    "## Executed Commands",
    "",
    ...listLines(data.commands),
    "",
    "## Checks",
    "",
    ...data.checks.map((check) => `- ${check.status}: ${check.name} - ${check.reason}`),
    "",
    "## Observed Paths",
    "",
    ...listLines(data.observedPaths),
    "",
    "## Failure Reasons",
    "",
    ...(data.failures.length > 0 ? listLines(data.failures) : ["- None"]),
    "",
    "## Residual Risks",
    "",
    rerunRisk,
    data.keep ? "- The smoke target is kept for inspection because --keep was provided." : "- The smoke summary is written under the target review directory for validation evidence.",
    "",
  ].join("\n");

  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, content, "utf8");

  const written = await readFile(summaryPath, "utf8");
  if (!written.includes("# Smoke Summary")) {
    throw new SlideWorkflowError(`Smoke summary was not written correctly: ${relativePath(summaryPath)}`, "SUMMARY_INVALID");
  }
}

function smokeSummaryFileName(options) {
  return isMockProvider(options)
    ? "smoke-summary-mock.md"
    : `smoke-summary-real-${safeFileSegment(options.provider)}.md`;
}

function smokeMode(options) {
  return isMockProvider(options) ? "mock" : "real";
}

function safeFileSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-");
}

function pass(name, reason) {
  return Object.freeze({ name, status: "PASS", reason });
}

function fail(name, reason) {
  return Object.freeze({ name, status: "FAIL", reason });
}

function listLines(items) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"];
}

function firstLine(value) {
  return value.trim().split(/\r?\n/)[0] ?? "";
}

function assert(condition, message) {
  if (!condition) {
    throw new SlideWorkflowError(message, "SMOKE_ASSERTION_FAILED");
  }
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
