#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  researchArtifactPaths,
  researchReuseSidecarPath,
  readSupervision,
  resolveResearchReuseCandidate,
  resolveDeckTarget,
  supervisionPath,
  deleteResearchReuseSidecar,
} from "./lib/takt-marp-slide-workflow.mjs";
import { runtimeExecutablePath } from "./lib/takt-marp-runtime-context.mjs";
import { resolveTemplateSource, workflowFilePath } from "./lib/takt-marp-project-templates.mjs";
import {
  resolveAndSaveClaudeDesignContract,
} from "./lib/takt-marp-claude-design-source.mjs";
import { writeClaudeDesignSmokeFixture } from "./lib/takt-marp-claude-design-fixtures.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const ROOT = process.cwd();
const FIXTURE_PATH = path.join(PACKAGE_ROOT, "fixtures", "marp-slide-workflow", "_workflow-smoke");
const RUNNER_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-run-slide-workflow.mjs");
const DEFAULT_TARGET = "slides/_workflow-smoke";
const DEFAULT_SMOKE_PROVIDER = "mock";
const PLAN_WITHOUT_RESEARCH_TARGET = "slides/_workflow-smoke-plan-without-research";
const RESEARCH_REUSE_TARGET = "slides/_workflow-smoke-research-reuse";
const STATE_VALIDATION_TARGET = "slides/_workflow-smoke-state-validation";
const RENDER_VALIDATION_TARGET = "slides/_workflow-smoke-render-validation";
const WORKFLOW_COMMANDS = ["plan", "compose", "polish", "deliver"];
const TEMPLATE_WORKFLOW_COMMANDS = ["research", ...WORKFLOW_COMMANDS];
const SOURCE_FIXTURE_EXCLUDES = new Set(["README.md"]);
const WORKFLOW_COMMAND_TIMEOUT_MS = 45 * 60 * 1000;
const NODE_CHECK_TIMEOUT_MS = 2 * 60 * 1000;
const CAPTURE_MAX_BUFFER = 64 * 1024 * 1024;
const MOCK_GENERATED_AT = "2026-06-06T00:00:00.000Z";
const SMOKE_OFFICIAL_TITLE = "変更に強いドメインモデリングの実践ワークショップ";
const SMOKE_SPEAKER_AFFILIATION = "サンプルデザイン合同会社";
const SMOKE_ORGANIZER = "サンプル研修ラボ株式会社";
const SMOKE_EVENT_DATE = "2031年4月17日（木）10:00〜16:30";
const SMOKE_VENUE = "ミラージュホール A";
const SMOKE_COMMON_EXAMPLE = "備品購入申請・承認";
const MOCK_BUILTIN_RESEARCH_REPORT = [
  "# Built-in Research Report",
  "",
  "## Findings",
  "- Atomic Design style slide components can be planned as optional research context.",
  "- Missing source URL, retrieval time, and confidence are intentionally absent from this mock built-in report.",
  "",
  "## Open Questions",
  "- Which workshop references should a human supply before final production?",
  "",
].join("\n");
const MOCK_ADAPTER_SHADOW_RESEARCH_REPORT = [
  "# Adapter Shadow Report",
  "",
  "This top-level adapter shadow report must not replace the built-in deep-research report.",
  "",
].join("\n");
const SMOKE_PROVIDER_SETTINGS_RELATIVE_PATHS = Object.freeze([
  ".takt/config.yaml",
  ".takt/provider-settings.yaml",
  ".takt/provider.yaml",
  ".takt/providers.yaml",
  ".takt/credentials.env",
  ".takt/credentials.json",
]);
const EXTERNAL_SOURCE_PATTERNS = Object.freeze([
  { pattern: /https?:\/\//i, label: "external URL" },
  { pattern: /\bgmail\b/i, label: "mail export reference" },
]);

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
  let templateContext;
  let templateAssetSnapshot;
  let providerSettingsSnapshot;
  try {
    currentCheckName = "smoke:provider-settings-snapshot";
    providerSettingsSnapshot = await snapshotSmokeProviderSettings(ROOT);
    currentCheckName = "smoke:template-asset-snapshot";
    templateAssetSnapshot = await snapshotSmokeTemplateAssets(ROOT);
    currentCheckName = "smoke:selected-template-source";
    templateContext = resolveSmokeTemplateContext(ROOT);
    checks.push(pass("smoke:selected-template-source", `Selected ${templateContext.source.kind} template source: ${relativePath(templateContext.source.rootDir)}.`));
    observedPaths.push(...selectedTemplateObservedPaths(templateContext).map(relativePath));
    currentCheckName = "setup:fixture-to-target";
    const setup = await setupSmokeDeck(options.target);
    targetInfo = setup.targetInfo;
    observedPaths.push(...setup.observedPaths);
    await assertSmokeFixtureContracts(targetInfo);
    checks.push(pass("setup:fixture-to-target", "Fixture source files copied into a clean smoke target."));
    checks.push(pass("setup:fixture-contracts", "Smoke fixture contains synthetic fixed outline, facts, visual policy, and no external source references."));
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
    const convergenceChecks = await runConvergenceRouteChecks(templateContext);
    checks.push(...convergenceChecks.checks);
    observedPaths.push(...convergenceChecks.observedPaths);
    currentCheckName = "failure-path:render-evidence-boundary";
    const renderEvidenceBoundaryChecks = await runRenderEvidenceBoundaryChecks();
    checks.push(...renderEvidenceBoundaryChecks.checks);
    commands.push(...renderEvidenceBoundaryChecks.commands);
    observedPaths.push(...renderEvidenceBoundaryChecks.observedPaths);
    if (isMockProvider(options)) {
      currentCheckName = "sequence:plan-without-research";
      const planWithoutResearchChecks = await runPlanWithoutResearchChecks({ provider: options.provider, templateContext, keep: options.keep });
      checks.push(...planWithoutResearchChecks.checks);
      commands.push(...planWithoutResearchChecks.commands);
      observedPaths.push(...planWithoutResearchChecks.observedPaths);
    }
    currentCheckName = "sequence:research";
    const researchSequenceChecks = await runResearchSequenceChecks(targetInfo, { provider: options.provider, templateContext });
    checks.push(...researchSequenceChecks.checks);
    commands.push(...researchSequenceChecks.commands);
    observedPaths.push(...researchSequenceChecks.observedPaths);
    if (isMockProvider(options)) {
      currentCheckName = "sequence:research-reuse";
      const researchReuseSequenceChecks = await runResearchReuseSequenceChecks({ provider: options.provider, templateContext, keep: options.keep });
      checks.push(...researchReuseSequenceChecks.checks);
      commands.push(...researchReuseSequenceChecks.commands);
      observedPaths.push(...researchReuseSequenceChecks.observedPaths);
    }
    currentCheckName = "sequence:workflow";
    const planSequenceChecks = await runPlanSequenceChecks(targetInfo, { provider: options.provider, templateContext, researchExpected: true });
    checks.push(...planSequenceChecks.checks);
    commands.push(...planSequenceChecks.commands);
    observedPaths.push(...planSequenceChecks.observedPaths);
    currentCheckName = "failure-path:force-invalidation";
    const forceChecks = await runForceInvalidationChecks(targetInfo, { provider: options.provider, templateContext });
    checks.push(...forceChecks.checks);
    commands.push(...forceChecks.commands);
    observedPaths.push(...forceChecks.observedPaths);
    currentCheckName = "failure-path:successful-rerun-rejection";
    const rerunChecks = await runSuccessfulRerunRejectionChecks(targetInfo, { templateContext });
    checks.push(...rerunChecks.checks);
    commands.push(...rerunChecks.commands);
    observedPaths.push(...rerunChecks.observedPaths);
    currentCheckName = "failure-path:rejected-rerun-archive";
    const rejectedRerunChecks = await runRejectedRerunArchiveChecks(targetInfo, { provider: options.provider, templateContext });
    checks.push(...rejectedRerunChecks.checks);
    commands.push(...rejectedRerunChecks.commands);
    observedPaths.push(...rejectedRerunChecks.observedPaths);
  } catch (error) {
    const reason = formatSmokeFailure(error, options);
    failures.push(reason);
    checks.push(fail(currentCheckName, reason));
  }

  if (templateAssetSnapshot) {
    try {
      const asserted = await assertSmokeTemplateAssetsNotGenerated(ROOT, templateAssetSnapshot);
      checks.push(pass("smoke:template-assets-no-copy", `Workflow/facet template assets were not generated or changed (${asserted.summary}).`));
    } catch (error) {
      const reason = formatError(error);
      failures.push(reason);
      checks.push(fail("smoke:template-assets-no-copy", reason));
    }
  }

  if (providerSettingsSnapshot) {
    try {
      const asserted = await assertSmokeProviderSettingsNotGenerated(ROOT, providerSettingsSnapshot);
      checks.push(pass("smoke:provider-settings-no-write", `Provider settings and credentials were not generated or changed (${asserted.summary}).`));
    } catch (error) {
      const reason = formatError(error);
      failures.push(reason);
      checks.push(fail("smoke:provider-settings-no-write", reason));
    }
  }

  if (targetInfo) {
    const summaryPath = path.join(targetInfo.reviewPath, smokeSummaryFileName(options));
    observedPaths.push(relativePath(summaryPath));
    const summaryChecks = [
      ...checks,
      pass("summary:provider-kind", smokeSummaryProviderReason(options)),
      pass("summary:write-smoke-summary", "Smoke summary written."),
    ];
    await writeSummary(summaryPath, {
      target: targetInfo.target,
      provider: options.provider,
      smokeMode: smokeMode(options),
      summaryKind: smokeSummaryKind(options),
      realProvider: realSummaryProvider(options),
      templateSource: templateContext?.source,
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

async function assertSmokeFixtureContracts(targetInfo) {
  const briefPath = path.join(targetInfo.deckPath, "brief.md");
  const brief = await readFile(briefPath, "utf8");
  assertNoExternalSourceReferences(brief, briefPath);
  for (const phrase of [
    SMOKE_OFFICIAL_TITLE,
    SMOKE_SPEAKER_AFFILIATION,
    SMOKE_ORGANIZER,
    SMOKE_EVENT_DATE,
    SMOKE_VENUE,
    SMOKE_COMMON_EXAMPLE,
    "### Fixed Outline",
    "Required Topics",
    "Avoid",
    "Fact Inventory",
    "Target slide count: 5",
    "Deck Mode: overview",
    "Slide Count Consistency Scenario",
    "100〜140",
    "html:",
    "inline-svg:",
    "coverage matrix",
    "slide-blueprint.md",
    "sections/*.md",
    "build:html / build:pdf",
  ]) {
    assert(brief.includes(phrase), `setup:fixture-contracts missing '${phrase}' in ${relativePath(briefPath)}`);
  }

  const outline = parseSmokeFixedOutline(brief);
  assert(outline.leaves.length === 12, `setup:fixture-contracts expected 12 fixed outline leaf items, got ${outline.leaves.length}`);
  for (const item of outline.leaves) {
    assert(brief.includes(item.label), `setup:fixture-contracts missing required topic leaf '${item.label}'`);
  }
}

async function assertPlanSourceArtifacts(targetInfo, { researchExpected = false } = {}) {
  const artifactPaths = [
    path.join(targetInfo.deckPath, "brief.normalized.md"),
    path.join(targetInfo.deckPath, "reference-analysis.md"),
    path.join(targetInfo.deckPath, "plan.md"),
    path.join(targetInfo.deckPath, "slide-blueprint.md"),
  ];
  for (const artifactPath of artifactPaths) {
    await assertReadableFile(artifactPath, "sequence:plan-source-artifacts");
  }

  const normalized = await readFile(artifactPaths[0], "utf8");
  const referenceAnalysis = await readFile(artifactPaths[1], "utf8");
  const plan = await readFile(artifactPaths[2], "utf8");
  const blueprint = await readFile(artifactPaths[3], "utf8");
  const designContract = await readSmokeResolvedDesignContract(targetInfo);
  for (const [label, source, artifactPath] of [
    ["normalized", normalized, artifactPaths[0]],
    ["plan", plan, artifactPaths[2]],
    ["blueprint", blueprint, artifactPaths[3]],
  ]) {
    assertNoExternalSourceReferences(source, artifactPath);
    assert(source.includes(SMOKE_OFFICIAL_TITLE), `sequence:plan-source-artifacts ${label} missing official title`);
    assert(source.includes(SMOKE_SPEAKER_AFFILIATION), `sequence:plan-source-artifacts ${label} missing speaker affiliation`);
    assert(source.includes(SMOKE_COMMON_EXAMPLE), `sequence:plan-source-artifacts ${label} missing common example`);
  }
  assertNoExternalSourceReferences(referenceAnalysis, artifactPaths[1]);
  for (const phrase of [
    "Fixed Outline",
    "Required Topics",
    "Avoid",
    "Fact Inventory",
    SMOKE_ORGANIZER,
    SMOKE_EVENT_DATE,
    SMOKE_VENUE,
  ]) {
    assert(normalized.includes(phrase), `sequence:plan-source-artifacts normalized missing '${phrase}'`);
  }
  for (const phrase of [
    "# Reference Deck Analysis",
    "Found: no",
    "analysis only; do not copy reference slides",
    "Plan Implications",
    `Research Context Available: ${researchExpected ? "yes" : "no"}`,
  ]) {
    assert(referenceAnalysis.includes(phrase), `sequence:plan-source-artifacts reference-analysis missing '${phrase}'`);
  }
  const expectedResearchInputs = researchExpected
    ? ["research-report.md", "research-claims.md", "open-questions.md"]
    : ["Inputs read: none"];
  for (const phrase of expectedResearchInputs) {
    assert(referenceAnalysis.includes(phrase), `sequence:plan-source-artifacts reference-analysis missing research context '${phrase}'`);
  }
  if (researchExpected) {
    for (const phrase of ["not_present_in_builtin_report", "unresolved", "not inferred"]) {
      assert(referenceAnalysis.includes(phrase), `sequence:plan-source-artifacts reference-analysis missing research caveat '${phrase}'`);
      assert(plan.includes(phrase), `sequence:plan-source-artifacts plan missing research caveat '${phrase}'`);
    }
  } else {
    for (const [label, source] of [["reference-analysis", referenceAnalysis], ["plan", plan]]) {
      assert(!/research[^\n]*needs_input/i.test(source), `sequence:plan-source-artifacts ${label} must not mark absent research as needs_input`);
      assert(!source.includes("research-report.md"), `sequence:plan-source-artifacts ${label} must not read absent research-report.md`);
      assert(!source.includes("research-claims.md"), `sequence:plan-source-artifacts ${label} must not read absent research-claims.md`);
      assert(!source.includes("open-questions.md"), `sequence:plan-source-artifacts ${label} must not read absent open-questions.md`);
    }
  }
  for (const phrase of [
    "# Slide Plan",
    "## Design Contract",
    designContract.source.path,
    designContract.source.namespace,
    designContract.fingerprint.contract_sha256,
    "Coverage Matrix",
    "Fixed Outline Coverage",
    "Visual Rendering Coverage",
    "Plan Findings",
    "Target slide count: 5",
    "100〜140",
    "render_owner: compose_sections",
    "html: cards/comparison/table/light-flow",
  ]) {
    assert(plan.includes(phrase), `sequence:plan-source-artifacts plan missing '${phrase}'`);
  }
  for (const phrase of [
    "# Slide Blueprint",
    "## Design Contract",
    designContract.source.path,
    designContract.source.namespace,
    designContract.fingerprint.contract_sha256,
    "Slide Blueprint Table",
    "Section Assembly Manifest",
    "sections/01-intro.md",
    "sections/02-body.md",
    "render_owner: compose_sections",
  ]) {
    assert(blueprint.includes(phrase), `sequence:plan-source-artifacts blueprint missing '${phrase}'`);
  }
  const outline = parseSmokeFixedOutline(await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8"));
  for (const item of outline.leaves) {
    assert(plan.includes(item.label), `sequence:plan-source-artifacts plan coverage missing fixed outline leaf '${item.label}'`);
  }
  return Object.freeze(artifactPaths);
}

function smokeResolvedDesignContractPath(targetInfo) {
  return path.join(ROOT, ".takt", "design-contracts", targetInfo.deckName, "resolved-design-contract.json");
}

async function readSmokeResolvedDesignContract(targetInfo) {
  const contractPath = smokeResolvedDesignContractPath(targetInfo);
  await assertReadableFile(contractPath, "sequence:design-contract-artifact");
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  assert(contract.source?.kind === "claude-design-zip", `sequence:design-contract-artifact unexpected source kind: ${JSON.stringify(contract.source)}`);
  assert(contract.source?.path === `${targetInfo.target}/design/Claude Design Smoke.zip`, `sequence:design-contract-artifact source path mismatch: ${contract.source?.path}`);
  assert(contract.source?.namespace === "ClaudeDesignSmoke", `sequence:design-contract-artifact namespace mismatch: ${contract.source?.namespace}`);
  assert(contract.authoring?.design_brief?.available === true, `sequence:design-contract-artifact missing Design Brief metadata: ${JSON.stringify(contract.authoring)}`);
  assert(contract.authoring?.design_brief?.path === `${targetInfo.target}/design/design-brief.md`, `sequence:design-contract-artifact Design Brief path mismatch: ${JSON.stringify(contract.authoring)}`);
  assert(contract.authoring?.design_brief?.sha256, `sequence:design-contract-artifact missing Design Brief SHA: ${JSON.stringify(contract.authoring)}`);
  assert(contract.fingerprint?.source_sha256, "sequence:design-contract-artifact missing source fingerprint");
  assert(contract.fingerprint?.contract_sha256, "sequence:design-contract-artifact missing contract fingerprint");
  assert(contract.token_counts?.total === 6, `sequence:design-contract-artifact token count mismatch: ${JSON.stringify(contract.token_counts)}`);
  assert(contract.components?.names?.includes("Metric"), `sequence:design-contract-artifact component catalog missing Metric: ${JSON.stringify(contract.components)}`);
  assert(contract.guidance?.documents?.some((item) => item.path === "SKILL.md"), `sequence:design-contract-artifact guidance missing SKILL.md: ${JSON.stringify(contract.guidance)}`);
  assert(contract.guidance?.documents?.some((item) => item.path === "readme.md"), `sequence:design-contract-artifact guidance missing readme.md: ${JSON.stringify(contract.guidance)}`);
  assert(contract.guidance?.component_prompts?.some((item) => item.path === "components/demo/Metric.prompt.md"), `sequence:design-contract-artifact component prompt missing: ${JSON.stringify(contract.guidance)}`);
  assert(contract.source_catalog?.templates?.some((item) => item.entryPath === "templates/generic-deck/GenericDeck.dc.html"), `sequence:design-contract-artifact template catalog missing: ${JSON.stringify(contract.source_catalog)}`);
  assert(contract.source_catalog?.templates?.some((item) => item.path === "templates/archive-only/ArchiveOnly.dc.html"), `sequence:design-contract-artifact archive-only template catalog missing: ${JSON.stringify(contract.source_catalog)}`);
  assert(contract.source_catalog?.sample_slides?.some((item) => item.path === "slides/cover.html"), `sequence:design-contract-artifact sample slide catalog missing: ${JSON.stringify(contract.source_catalog)}`);
  assert(contract.source_catalog?.starting_points?.some((item) => item.name === "Lecture kickoff"), `sequence:design-contract-artifact starting point catalog missing: ${JSON.stringify(contract.source_catalog)}`);
  assert(contract.source_catalog?.themes?.some((item) => item.name === "High contrast light"), `sequence:design-contract-artifact theme catalog missing: ${JSON.stringify(contract.source_catalog)}`);
  assert(contract.source_catalog?.fonts?.some((item) => item.family === "Noto Sans JP"), `sequence:design-contract-artifact font catalog missing: ${JSON.stringify(contract.source_catalog)}`);
  assert(contract.adherence?.available === true, "sequence:design-contract-artifact adherence metadata must be available");
  return contract;
}

function assertNoExternalSourceReferences(source, filePath) {
  for (const item of EXTERNAL_SOURCE_PATTERNS) {
    assert(!item.pattern.test(source), `${item.label} must not appear in ${relativePath(filePath)}`);
  }
}

function parseSmokeFixedOutline(brief) {
  const block = extractBetween(brief, "### Fixed Outline", "## Core Message");
  const leaves = [];
  let currentChapter = "";
  let currentSection = "";
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const chapter = line.match(/^(\d+)\.\s*(.+)$/);
    if (chapter) {
      currentChapter = `${chapter[1]}. ${chapter[2]}`;
      currentSection = "";
      continue;
    }
    const section = line.match(/^（(\d+)）(.+)$/);
    if (section) {
      currentSection = `（${section[1]}）${section[2]}`;
      continue;
    }
    const leaf = line.match(/^([a-z])\.\s*(.+)$/);
    if (leaf) {
      leaves.push({
        label: `${leaf[1]}. ${leaf[2]}`,
        chapter: currentChapter,
        section: currentSection,
      });
    }
  }
  return Object.freeze({ leaves: Object.freeze(leaves) });
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start !== -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end !== -1, `missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start + startMarker.length, end);
}

export function resolveSmokeTemplateContext(projectRoot = ROOT) {
  const source = resolveTemplateSource({ projectRoot });
  const workflowFiles = Object.fromEntries(
    TEMPLATE_WORKFLOW_COMMANDS.map((command) => [command, workflowFilePath(source, command)]),
  );
  return Object.freeze({
    projectRoot: path.resolve(projectRoot),
    source,
    workflowFiles: Object.freeze(workflowFiles),
    aiGateWorkflowFile: path.join(source.workflowsDir, "takt-marp-slide-ai-quality-gate.yaml"),
  });
}

function selectedTemplateObservedPaths(templateContext) {
  return Object.freeze([
    templateContext.source.rootDir,
    templateContext.source.workflowsDir,
    templateContext.source.facetsDir,
    ...Object.values(templateContext.workflowFiles),
    templateContext.aiGateWorkflowFile,
  ]);
}

export async function snapshotSmokeTemplateAssets(projectRoot = ROOT) {
  const root = path.resolve(projectRoot);
  const snapshot = {};
  for (const domain of ["workflows", "facets"]) {
    const domainRoot = path.join(root, ".takt", domain);
    if (!existsSync(domainRoot)) {
      snapshot[domain] = Object.freeze({ exists: false, files: Object.freeze([]) });
      continue;
    }
    const files = [];
    const entries = await readdir(domainRoot, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(entry.parentPath, entry.name);
      const content = await readFile(filePath);
      files.push({
        path: path.relative(path.join(root, ".takt"), filePath).split(path.sep).join("/"),
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    snapshot[domain] = Object.freeze({ exists: true, files: Object.freeze(files.map((item) => Object.freeze(item))) });
  }
  return Object.freeze(snapshot);
}

export async function assertSmokeTemplateAssetsNotGenerated(projectRoot = ROOT, before) {
  assert(before, "smoke:template-assets-no-copy missing template asset baseline snapshot");
  const after = await snapshotSmokeTemplateAssets(projectRoot);
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  assert(
    beforeJson === afterJson,
    `smoke:template-assets-no-copy workflow/facet template assets changed. before=${beforeJson} after=${afterJson}`,
  );
  const presentDomains = Object.entries(after).filter(([, value]) => value.exists).map(([domain]) => domain);
  return Object.freeze({
    snapshot: after,
    summary: presentDomains.length > 0 ? `pre-existing ${presentDomains.join("+")} unchanged` : "no workflow/facet template asset directories present",
  });
}

export async function snapshotSmokeProviderSettings(projectRoot = ROOT) {
  const root = path.resolve(projectRoot);
  const snapshots = [];
  for (const relativePath of SMOKE_PROVIDER_SETTINGS_RELATIVE_PATHS) {
    const filePath = path.join(root, ...relativePath.split("/"));
    const exists = existsSync(filePath);
    snapshots.push(Object.freeze({
      relativePath,
      exists,
      sha256: exists ? createHash("sha256").update(await readFile(filePath)).digest("hex") : null,
    }));
  }
  return Object.freeze(snapshots);
}

export async function assertSmokeProviderSettingsNotGenerated(projectRoot = ROOT, before) {
  assert(before, "smoke:provider-settings-no-write missing provider settings baseline snapshot");
  const after = await snapshotSmokeProviderSettings(projectRoot);
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  assert(
    beforeJson === afterJson,
    `smoke:provider-settings-no-write provider settings or credentials changed. before=${beforeJson} after=${afterJson}`,
  );
  const presentFiles = after.filter((item) => item.exists).map((item) => item.relativePath);
  return Object.freeze({
    snapshot: after,
    summary: presentFiles.length > 0 ? `pre-existing ${presentFiles.join(", ")} unchanged` : "no provider settings or credentials present",
  });
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

async function runConvergenceRouteChecks(templateContext) {
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
    assertWorkflowLoopMonitor(templateContext, command, expectations[command]);
    assertAiGateWorkflowRoute(templateContext, command, expectations[command]);
  }
  assertAiGateCallableWorkflowRules(templateContext);
  await assertWorkflowDoctorPasses(templateContext);
  assertNoDeckLocalLoopMonitorFacets(templateContext);
  assertNoUnsupportedWorkflowCommandGateObjects(templateContext);
  observedPaths.push(
    ...Object.values(templateContext.workflowFiles).map(relativePath),
    relativePath(templateContext.aiGateWorkflowFile),
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

async function runPlanWithoutResearchChecks(options) {
  const checks = [];
  const commands = [];
  const observedPaths = [];
  let targetInfo;
  try {
    const setup = await setupAdditionalSmokeDeck(PLAN_WITHOUT_RESEARCH_TARGET);
    targetInfo = setup.targetInfo;
    observedPaths.push(...setup.observedPaths);
    const researchArtifacts = researchArtifactPaths(targetInfo);

    for (const filePath of [researchArtifacts.report, researchArtifacts.sources, researchArtifacts.claims, researchArtifacts.openQuestions, researchArtifacts.supervision]) {
      await rm(filePath, { force: true });
    }

    const planCommand = await runWorkflowCommand("sequence:plan-without-research-command", "plan", targetInfo, options);
    commands.push(planCommand);
    const planArtifactPaths = await assertPlanSourceArtifacts(targetInfo, { researchExpected: false });
    observedPaths.push(...planArtifactPaths.map(relativePath));
    const supervision = await readSupervision(targetInfo, "plan");
    assert(supervision.data.state === "planned", `sequence:plan-without-research-supervision expected planned, got ${supervision.data.state}`);
    assert(supervision.data.result === "passed", `sequence:plan-without-research-supervision expected passed, got ${supervision.data.result}`);
    observedPaths.push(relativePath(supervision.filePath));
    checks.push(pass("sequence:plan-without-research-command", "slide:plan completed when optional research artifacts were absent."));
    checks.push(pass("sequence:plan-without-research-optional-context", "plan and reference-analysis record research context as Available: no without needs_input."));
    checks.push(pass("sequence:plan-without-research-supervision", "plan-supervision.md remains valid for the research-absent plan path."));

    return Object.freeze({
      checks: Object.freeze(checks),
      commands: Object.freeze(commands),
      observedPaths: Object.freeze(observedPaths),
    });
  } finally {
    if (!options.keep && targetInfo) {
      await rm(targetInfo.deckPath, { recursive: true, force: true });
    }
  }
}

async function runResearchSequenceChecks(targetInfo, options) {
  const checks = [];
  const commands = [];
  const observedPaths = [];
  const researchArtifacts = researchArtifactPaths(targetInfo);

  await assertReadableFile(researchArtifacts.brief, "sequence:research-brief-fixture");
  const briefBefore = await readFile(researchArtifacts.brief, "utf8");
  observedPaths.push(relativePath(researchArtifacts.brief));

  const researchCommand = await runWorkflowCommand("sequence:research-command", "research", targetInfo, options);
  commands.push(researchCommand);
  const artifactPaths = await assertResearchArtifacts(targetInfo);
  observedPaths.push(...artifactPaths.map(relativePath));
  assert((await readFile(researchArtifacts.brief, "utf8")) === briefBefore, "sequence:research-brief-fixture research command changed research-brief.md");
  checks.push(pass("sequence:research-command", "slide:research completed for the smoke deck before plan."));
  checks.push(pass("sequence:research-supervision", "research-supervision.md exists in the research domain with state researched and result passed."));
  checks.push(pass("sequence:research-report-byte-copy", "research-report.md matches the built-in deep-research source report byte-for-byte."));
  checks.push(pass("sequence:research-adapter-artifacts", "research-sources.md, research-claims.md, and open-questions.md preserve source_report_origin and not_present_in_builtin_report gaps."));
  checks.push(pass("sequence:research-domain-isolation", "research artifacts are synchronized under slides/<deck>/research/ and do not leak into review/."));

  return Object.freeze({
    checks: Object.freeze(checks),
    commands: Object.freeze(commands),
    observedPaths: Object.freeze(observedPaths),
  });
}

async function runResearchReuseSequenceChecks(options) {
  const checks = [];
  const commands = [];
  const observedPaths = [];
  const runDirs = [];
  let fakePackage;
  let targetInfo;
  try {
    const setup = await setupAdditionalSmokeDeck(RESEARCH_REUSE_TARGET);
    targetInfo = setup.targetInfo;
    fakePackage = await makeSmokeResearchRunnerPackage();
    observedPaths.push(...setup.observedPaths);
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await assertReadableFile(researchArtifacts.brief, "sequence:research-reuse-brief-fixture");
    observedPaths.push(relativePath(researchArtifacts.brief));

    const failedRunName = `mock-${targetInfo.deckName}-research-failed`;
    const failedReportsDir = path.join(ROOT, ".takt", "runs", failedRunName, "reports");
    const sourceReportPath = path.join(failedReportsDir, "subworkflows", "workflow-deep-research", "research-report.md");
    runDirs.push(path.join(ROOT, ".takt", "runs", failedRunName));
    const fullFailureArgsPath = path.join(ROOT, ".takt", "runs", `${failedRunName}-args.txt`);
    await writeFakeTaktExecutable(fakePackage.packageRoot, fakeFullResearchFailureTaktScript(failedRunName, targetInfo, 42));
    const failedFullResearch = runFakeResearchRunnerCommand("sequence:research-reuse-failed-full-command", fakePackage, targetInfo, {
      argsCapturePath: fullFailureArgsPath,
      expectedStatus: 42,
    });
    commands.push(failedFullResearch.commandLine);
    await assertCapturedWorkflow(fullFailureArgsPath, "takt-marp-slide-research.yaml", "sequence:research-reuse-failed-full-command");
    const sidecarPath = researchReuseSidecarPath(targetInfo, { root: ROOT });
    const failedCandidate = await resolveResearchReuseCandidate(targetInfo, { root: ROOT });
    assert(failedCandidate, "sequence:research-reuse-failed-full-sidecar did not create a reusable sidecar");
    assert(
      failedCandidate.source_report_path === sourceReportPath,
      `sequence:research-reuse-failed-full-sidecar source mismatch: ${JSON.stringify(failedCandidate)}`,
    );
    assert(!existsSync(researchArtifacts.report), "sequence:research-reuse-failed-full-sidecar synced deck report before reuse");
    observedPaths.push(relativePath(sourceReportPath), relativePath(sidecarPath), relativePath(fullFailureArgsPath));
    checks.push(pass("sequence:research-reuse-failed-full-command", "Failed full research ran through the workflow runner and preserved its non-zero exit."));
    checks.push(pass("sequence:research-reuse-failed-full-sidecar", "Failed full research left a reusable built-in source report sidecar."));

    const successRunName = `mock-${targetInfo.deckName}-research-reuse-success`;
    const successReportsDir = path.join(ROOT, ".takt", "runs", successRunName, "reports");
    runDirs.push(path.join(ROOT, ".takt", "runs", successRunName));
    const successArgsPath = path.join(ROOT, ".takt", "runs", `${successRunName}-args.txt`);
    await writeFakeTaktExecutable(fakePackage.packageRoot, fakeReuseSuccessTaktScript(successRunName, targetInfo));
    const reuseSuccess = runFakeResearchRunnerCommand("sequence:research-reuse-success-command", fakePackage, targetInfo, {
      argsCapturePath: successArgsPath,
      expectedStatus: 0,
    });
    commands.push(reuseSuccess.commandLine);
    await assertCapturedWorkflow(successArgsPath, "takt-marp-slide-research-reuse.yaml", "sequence:research-reuse-success-command");
    const artifactPaths = await assertResearchArtifacts(targetInfo);
    observedPaths.push(...artifactPaths.map(relativePath));
    assert(!existsSync(sidecarPath), "sequence:research-reuse-success-sidecar-delete did not delete sidecar after reuse success");
    assert(
      !existsSync(path.join(successReportsDir, "subworkflows", "workflow-deep-research", "research-report.md")),
      "sequence:research-reuse-no-deep-rerun wrote a deep research report during reuse success",
    );
    assert(
      await readFile(researchArtifacts.report, "utf8") === MOCK_BUILTIN_RESEARCH_REPORT,
      "sequence:research-reuse-success-artifacts did not preserve the reused built-in report",
    );
    observedPaths.push(relativePath(successArgsPath));
    checks.push(pass("sequence:research-reuse-success-command", "Reuse success ran through the workflow runner and selected the private reuse workflow."));
    checks.push(pass("sequence:research-reuse-success-artifacts", "Reuse success produced normal research artifacts from the existing source report."));
    checks.push(pass("sequence:research-reuse-success-sidecar-delete", "Reuse success deleted the reusable sidecar."));
    checks.push(pass("sequence:research-reuse-no-deep-rerun", "Reuse success did not create a new deep research source report."));

    const retryFailedRunName = `mock-${targetInfo.deckName}-research-failed-for-retry`;
    const retryFailedReportsDir = path.join(ROOT, ".takt", "runs", retryFailedRunName, "reports");
    runDirs.push(path.join(ROOT, ".takt", "runs", retryFailedRunName));
    const retryFailureArgsPath = path.join(ROOT, ".takt", "runs", `${retryFailedRunName}-args.txt`);
    await writeFakeTaktExecutable(fakePackage.packageRoot, fakeFullResearchFailureTaktScript(retryFailedRunName, targetInfo, 43));
    const retryFullFailure = runFakeResearchRunnerCommand("sequence:research-reuse-retry-full-failure-command", fakePackage, targetInfo, {
      argsCapturePath: retryFailureArgsPath,
      expectedStatus: 43,
      extraArgs: ["--force"],
    });
    commands.push(retryFullFailure.commandLine);
    await assertCapturedWorkflow(retryFailureArgsPath, "takt-marp-slide-research.yaml", "sequence:research-reuse-retry-full-failure-command");

    const reuseFailureRunName = `mock-${targetInfo.deckName}-research-reuse-failure`;
    runDirs.push(path.join(ROOT, ".takt", "runs", reuseFailureRunName));
    const reuseFailureArgsPath = path.join(ROOT, ".takt", "runs", `${reuseFailureRunName}-args.txt`);
    await writeFakeTaktExecutable(fakePackage.packageRoot, fakeReuseFailureTaktScript(45));
    const reuseFailure = runFakeResearchRunnerCommand("sequence:research-reuse-failure-command", fakePackage, targetInfo, {
      argsCapturePath: reuseFailureArgsPath,
      expectedStatus: 45,
    });
    commands.push(reuseFailure.commandLine);
    await assertCapturedWorkflow(reuseFailureArgsPath, "takt-marp-slide-research-reuse.yaml", "sequence:research-reuse-failure-command");
    const preservedCandidate = await resolveResearchReuseCandidate(targetInfo, { root: ROOT });
    assert(preservedCandidate, "sequence:research-reuse-failure-sidecar-preserved did not preserve sidecar after reuse failure");
    assert(
      !existsSync(researchArtifacts.report),
      "sequence:research-reuse-failure-source-copy-rollback left an uncommitted reuse source report after failed reuse",
    );
    observedPaths.push(relativePath(retryFailureArgsPath), relativePath(reuseFailureArgsPath));
    checks.push(pass("sequence:research-reuse-failure-command", "Reuse failure ran through the workflow runner and preserved the TAKT exit code."));
    checks.push(pass("sequence:research-reuse-failure-sidecar-preserved", "Reuse failure preserved the reusable sidecar for a later retry."));
    checks.push(pass("sequence:research-reuse-failure-source-copy-rollback", "Reuse failure rolled back the staged source report copy."));

    return Object.freeze({
      checks: Object.freeze(checks),
      commands: Object.freeze(commands),
      observedPaths: Object.freeze(observedPaths),
    });
  } finally {
    if (!options.keep && targetInfo) {
      await rm(targetInfo.deckPath, { recursive: true, force: true });
      await deleteResearchReuseSidecar(targetInfo, { root: ROOT });
      await Promise.all(runDirs.map((runDir) => rm(runDir, { recursive: true, force: true })));
      if (fakePackage) {
        await rm(fakePackage.packageRoot, { recursive: true, force: true });
      }
    }
  }
}

async function makeSmokeResearchRunnerPackage() {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "takt-marp-smoke-reuse-package-"));
  await mkdir(path.join(packageRoot, "scripts"), { recursive: true });
  await cp(RUNNER_SCRIPT, path.join(packageRoot, "scripts", "takt-marp-run-slide-workflow.mjs"));
  await cp(path.join(SCRIPT_DIR, "lib"), path.join(packageRoot, "scripts", "lib"), { recursive: true });
  await cp(path.join(PACKAGE_ROOT, "templates", "project"), path.join(packageRoot, "templates", "project"), { recursive: true });
  await mkdir(path.join(packageRoot, "node_modules"), { recursive: true });
  await cp(path.join(PACKAGE_ROOT, "node_modules", "fflate"), path.join(packageRoot, "node_modules", "fflate"), { recursive: true });
  const deepResearchWorkflowPath = path.join(packageRoot, "node_modules", "takt", "builtins", "ja", "workflows", "deep-research.yaml");
  await mkdir(path.dirname(deepResearchWorkflowPath), { recursive: true });
  await writeFile(deepResearchWorkflowPath, "name: deep-research\n", "utf8");
  return Object.freeze({
    packageRoot,
    runnerScript: path.join(packageRoot, "scripts", "takt-marp-run-slide-workflow.mjs"),
    researchWorkflowFile: path.join(packageRoot, "templates", "project", "workflows", "takt-marp-slide-research.yaml"),
  });
}

async function writeFakeTaktExecutable(packageRoot, script) {
  const executablePath = runtimeExecutablePath("takt", { root: packageRoot });
  await rm(executablePath, { force: true });
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(executablePath, script, { encoding: "utf8", mode: 0o755 });
}

function runFakeResearchRunnerCommand(name, fakePackage, targetInfo, options) {
  const runnerArgs = ["research", targetInfo.target, "--workflow-file", fakePackage.researchWorkflowFile, "--provider", "mock", ...(options.extraArgs ?? [])];
  const commandLine = `node ${JSON.stringify(fakePackage.runnerScript)} ${runnerArgs.map((arg) => JSON.stringify(arg)).join(" ")}`;
  const result = spawnSync(process.execPath, [fakePackage.runnerScript, ...runnerArgs], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, TAKT_ARGS_CAPTURE: options.argsCapturePath },
    timeout: WORKFLOW_COMMAND_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(!result.error, `${name} failed while executing: ${result.error?.message}`);
  assert(result.status === options.expectedStatus, `${name} expected exit ${options.expectedStatus}, got ${result.status ?? "unknown"}: ${output}`);
  return Object.freeze({ commandLine, output });
}

async function assertCapturedWorkflow(argsCapturePath, expectedWorkflowFileName, name) {
  const args = (await readFile(argsCapturePath, "utf8")).trim().split("\n");
  const workflowArgIndex = args.indexOf("-w");
  assert(workflowArgIndex >= 0, `${name} did not pass -w to TAKT: ${args.join(" ")}`);
  assert(
    path.basename(args[workflowArgIndex + 1]) === expectedWorkflowFileName,
    `${name} expected ${expectedWorkflowFileName}, got ${args[workflowArgIndex + 1]} from args ${args.join(" ")}`,
  );
}

function fakeFullResearchFailureTaktScript(runName, targetInfo, exitCode) {
  const reportsDir = `.takt/runs/${runName}/reports`;
  const sourceReportPath = `${reportsDir}/subworkflows/workflow-deep-research/research-report.md`;
  const meta = {
    workflow: "takt-marp-slide-research",
    task: `${targetInfo.target}/research/research-brief.md`,
    reportDirectory: reportsDir,
  };
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    ...shellWriteFile(`.takt/runs/${runName}/meta.json`, `${JSON.stringify(meta, null, 2)}\n`),
    ...shellWriteFile(sourceReportPath, MOCK_BUILTIN_RESEARCH_REPORT),
    `exit ${exitCode}`,
    "",
  ].join("\n");
}

function fakeReuseSuccessTaktScript(runName, targetInfo) {
  const reportsDir = `.takt/runs/${runName}/reports`;
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    ...shellWriteFile(`${reportsDir}/research-report.md`, MOCK_ADAPTER_SHADOW_RESEARCH_REPORT),
    ...shellWriteFile(`${reportsDir}/research-sources.md`, mockResearchDerivedArtifact(targetInfo, "Research Sources")),
    ...shellWriteFile(`${reportsDir}/research-claims.md`, mockResearchDerivedArtifact(targetInfo, "Research Claims")),
    ...shellWriteFile(`${reportsDir}/open-questions.md`, mockResearchDerivedArtifact(targetInfo, "Open Questions")),
    ...shellWriteFile(`${reportsDir}/research-supervision.md`, mockResearchSupervisionArtifact(targetInfo, `mock-smoke-${targetInfo.deckName}-research-reuse-success`, "passed")),
    "exit 0",
    "",
  ].join("\n");
}

function fakeReuseFailureTaktScript(exitCode) {
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    `exit ${exitCode}`,
    "",
  ].join("\n");
}

function shellWriteFile(filePath, content) {
  return [
    `mkdir -p "$(dirname ${shellSingleQuote(filePath)})"`,
    `printf '%s' ${shellSingleQuote(content)} > ${shellSingleQuote(filePath)}`,
  ];
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function assertResearchArtifacts(targetInfo) {
  const artifacts = researchArtifactPaths(targetInfo);
  const requiredPaths = [
    artifacts.report,
    artifacts.sources,
    artifacts.claims,
    artifacts.openQuestions,
    artifacts.supervision,
  ];
  for (const filePath of requiredPaths) {
    await assertReadableFile(filePath, "sequence:research-artifacts");
  }

  const supervision = await readSupervision(targetInfo, "research");
  assert(supervision.data.command === "research", `sequence:research-supervision command mismatch: ${supervision.data.command}`);
  assert(supervision.data.target === targetInfo.target, `sequence:research-supervision target mismatch: ${supervision.data.target}`);
  assert(supervision.data.state === "researched", `sequence:research-supervision expected researched, got ${supervision.data.state}`);
  assert(supervision.data.result === "passed", `sequence:research-supervision expected passed, got ${supervision.data.result}`);

  const report = await readFile(artifacts.report, "utf8");
  assert(report === MOCK_BUILTIN_RESEARCH_REPORT, "sequence:research-report-byte-copy research-report.md does not match the mock built-in report");
  assert(!report.includes("Adapter Shadow Report"), "sequence:research-report-byte-copy adapter shadow report replaced the built-in report");

  for (const [label, filePath] of [
    ["sources", artifacts.sources],
    ["claims", artifacts.claims],
    ["openQuestions", artifacts.openQuestions],
  ]) {
    const parsed = parseFrontMatter(await readFile(filePath, "utf8"));
    assert(parsed.frontMatter.command === "research", `sequence:research-adapter-artifacts ${label} command mismatch: ${parsed.frontMatter.command}`);
    assert(parsed.frontMatter.target === targetInfo.target, `sequence:research-adapter-artifacts ${label} target mismatch: ${parsed.frontMatter.target}`);
    assert(parsed.frontMatter.source_report === "research-report.md", `sequence:research-adapter-artifacts ${label} source_report mismatch: ${parsed.frontMatter.source_report}`);
    assert(
      parsed.frontMatter.source_report_origin === "builtin_deep_research",
      `sequence:research-adapter-artifacts ${label} source_report_origin mismatch: ${parsed.frontMatter.source_report_origin}`,
    );
    assert(parsed.body.includes("not_present_in_builtin_report"), `sequence:research-adapter-artifacts ${label} lost missing-info sentinel`);
  }

  for (const fileName of ["research-report.md", "research-sources.md", "research-claims.md", "open-questions.md", "research-supervision.md"]) {
    const reviewArtifactPath = path.join(targetInfo.reviewPath, fileName);
    assert(!existsSync(reviewArtifactPath), `sequence:research-domain-isolation research artifact leaked into review/: ${relativePath(reviewArtifactPath)}`);
  }

  return Object.freeze(requiredPaths);
}

async function runPlanSequenceChecks(targetInfo, options) {
  const checks = [];
  const commands = [];
  const observedPaths = [];

  const planCommand = await runWorkflowCommand("sequence:plan-command", "plan", targetInfo, options);
  commands.push(planCommand);
  const planArtifactPaths = await assertPlanSourceArtifacts(targetInfo, { researchExpected: options.researchExpected });
  observedPaths.push(...planArtifactPaths.map(relativePath));
  const supervision = await readSupervision(targetInfo, "plan");
  assert(supervision.data.state === "planned", `sequence:plan-supervision-state expected planned, got ${supervision.data.state}`);
  assert(supervision.data.result === "passed", `sequence:plan-supervision-result expected passed, got ${supervision.data.result}`);
  observedPaths.push(relativePath(supervision.filePath));
  checks.push(pass("sequence:plan-command", "slide:plan completed for the smoke deck."));
  checks.push(pass("sequence:plan-source-artifacts", "plan source artifacts preserve fixed outline, facts, coverage matrix, visual strategy, and slide blueprint."));
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
  checks.push(pass("sequence:compose-source-artifacts", "compose source artifacts exist with Resolved Design Contract tokens applied to SLIDES.md."));

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

async function runSuccessfulRerunRejectionChecks(targetInfo, options) {
  const checks = [];
  const commands = [];
  const protectedPaths = [supervisionPath(targetInfo, "plan"), approvalPath(targetInfo, "plan")];
  const snapshots = await snapshotFiles(protectedPaths);
  const historyBefore = await listHistoryFiles(targetInfo);
  const runnerArgs = ["plan", ...workflowCommandArgs("plan", targetInfo.target, options)];
  const commandLine = `node scripts/takt-marp-run-slide-workflow.mjs ${runnerArgs.map((arg) => JSON.stringify(arg)).join(" ")}`;
  const result = spawnSync(process.execPath, [RUNNER_SCRIPT, ...runnerArgs], {
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
    path.join(targetInfo.deckPath, "reference-analysis.md"),
    path.join(targetInfo.deckPath, "plan.md"),
    path.join(targetInfo.deckPath, "slide-blueprint.md"),
    path.join(targetInfo.deckPath, "sections", "manifest.md"),
    path.join(targetInfo.deckPath, "SLIDES.md"),
    smokeResolvedDesignContractPath(targetInfo),
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
  checks.push(pass("failure-path:force-source-retention", "force retained deck source artifacts such as brief, plan, blueprint, sections, Resolved Design Contract, and SLIDES.md."));
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
  const runnerArgs = ["plan", ...workflowCommandArgs("plan", targetInfo.target, options)];
  const commandLine = `node scripts/takt-marp-run-slide-workflow.mjs ${runnerArgs.map((arg) => JSON.stringify(arg)).join(" ")}`;
  commands.push(commandLine);

  if (isMockProvider(options)) {
    await archiveCommandArtifacts(targetInfo, ["plan"], "rejected-rerun");
    await writeMockCommandResult(targetInfo, "plan");
  } else {
    const result = spawnSync(process.execPath, [RUNNER_SCRIPT, ...runnerArgs], {
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
  const args = workflowCommandArgs(command, targetInfo.target, options, extraArgs);
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
  const designContractResult = command === "plan" || command === "compose"
    ? await resolveAndSaveClaudeDesignContract(targetInfo, { root: ROOT })
    : null;

  if (command === "research") {
    await writeMockResearchArtifacts(targetInfo, workflowRunId, reportsPath);
    return;
  } else if (command === "plan") {
    await writeMockPlanArtifacts(targetInfo, designContractResult.contract);
  } else if (command === "compose") {
    await writeMockComposeArtifacts(targetInfo, designContractResult.contract);
  } else if (command === "polish") {
    await writeMockRenderEvidence(targetInfo, 1);
  } else if (command === "deliver") {
    await writeMockDeliveryArtifacts(targetInfo);
  }

  for (const report of mockReports(targetInfo, command, workflowRunId)) {
    await writeReportCopies(targetInfo.reviewPath, reportsPath, report.name, report.content);
  }
}

async function writeMockResearchArtifacts(targetInfo, workflowRunId, reportsPath) {
  const artifacts = researchArtifactPaths(targetInfo);
  await mkdir(path.dirname(artifacts.report), { recursive: true });
  await mkdir(path.join(reportsPath, "subworkflows", "workflow-deep-research"), { recursive: true });
  await writeFile(path.join(reportsPath, "research-report.md"), MOCK_ADAPTER_SHADOW_RESEARCH_REPORT, "utf8");
  await writeFile(path.join(reportsPath, "subworkflows", "workflow-deep-research", "research-report.md"), MOCK_BUILTIN_RESEARCH_REPORT, "utf8");
  await writeFile(artifacts.report, MOCK_BUILTIN_RESEARCH_REPORT, "utf8");
  for (const [filePath, title] of [
    [artifacts.sources, "Research Sources"],
    [artifacts.claims, "Research Claims"],
    [artifacts.openQuestions, "Open Questions"],
  ]) {
    await writeFile(filePath, mockResearchDerivedArtifact(targetInfo, title), "utf8");
  }
  await writeFile(
    artifacts.supervision,
    mockResearchSupervisionArtifact(targetInfo, workflowRunId, "passed"),
    "utf8",
  );
}

function mockResearchSupervisionArtifact(targetInfo, workflowRunId, result) {
  return [
    "---",
    "command: research",
    `target: ${targetInfo.target}`,
    `generated_at: ${MOCK_GENERATED_AT}`,
    `workflow_run_id: ${workflowRunId}`,
    "step: supervision",
    "cycle: 1",
    "state: researched",
    `result: ${result}`,
    "blocking_findings: 0",
    "major_findings: 0",
    "minor_findings: 0",
    "info_findings: 0",
    "---",
    "",
    "# Mock Research Supervision",
    "",
    `Result: ${result}`,
    "",
  ].join("\n");
}

function mockResearchDerivedArtifact(targetInfo, title) {
  return [
    "---",
    "command: research",
    `target: ${targetInfo.target}`,
    `generated_at: ${MOCK_GENERATED_AT}`,
    "source_report: research-report.md",
    "source_report_origin: builtin_deep_research",
    "---",
    "",
    `# ${title}`,
    "",
    "- evidence_status: not_present_in_builtin_report",
    "- url: not_present_in_builtin_report",
    "- retrieved_at: not_present_in_builtin_report",
    "- confidence: not_present_in_builtin_report",
    "- unresolved: Which workshop references should a human supply before final production?",
    "",
  ].join("\n");
}

async function writeReportCopies(reviewPath, reportsPath, reportName, content) {
  await writeFile(path.join(reviewPath, reportName), content, "utf8");
  await writeFile(path.join(reportsPath, reportName), content, "utf8");
}

function smokeDesignContractLines(designContract) {
  const designBrief = designContract.authoring?.design_brief;
  return [
    `- Source: ${designContract.source.path}`,
    `- Namespace: ${designContract.source.namespace}`,
    `- Source fingerprint: ${designContract.fingerprint.source_sha256}`,
    `- Contract fingerprint: ${designContract.fingerprint.contract_sha256}`,
    ...(designBrief?.available
      ? [
          `- Design Brief path: ${designBrief.path}`,
          `- Design Brief fingerprint: ${designBrief.sha256}`,
          `- Design Brief provenance verified: ${designContract.authoring.provenance_verified ? "yes" : "no"}`,
        ]
      : ["- Design Brief: missing (drift protection unavailable)"]),
    `- Token counts: total=${designContract.token_counts.total}, color=${designContract.token_counts.color}, typography=${designContract.token_counts.typography}, spacing=${designContract.token_counts.spacing}`,
    `- Brand fonts: ${designContract.brand_fonts.join(", ")}`,
    `- Component count: ${designContract.components.count}`,
    `- Adherence metadata: ${designContract.adherence.available ? "available" : "not available"}`,
  ];
}

async function writeMockPlanArtifacts(targetInfo, designContract) {
  const brief = await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8");
  const outline = parseSmokeFixedOutline(brief);
  const researchContext = await readMockResearchPlanContext(targetInfo);
  const designContractLines = smokeDesignContractLines(designContract);
  const coverageRows = outline.leaves.map((item, index) => {
    const slideId = `S${String(Math.min(index + 1, 5)).padStart(3, "0")}`;
    return `| ${item.chapter} | ${item.section} | ${item.label} | ${slideId} | covered |`;
  });
  await writeFile(
    path.join(targetInfo.deckPath, "brief.normalized.md"),
    [
      "# Normalized Brief",
      "",
      "## Goal",
      "Synthetic smoke deck for validating the Marp slide workflow.",
      "",
      "## Critical Constraints",
      `- Official Title: ${SMOKE_OFFICIAL_TITLE}`,
      "- Speaker Name: 山田 サンプル",
      `- Speaker Affiliation: ${SMOKE_SPEAKER_AFFILIATION}`,
      "- Fixed Outline: preserve chapter, section, and leaf labels.",
      "",
      "## Fixed Outline",
      ...outline.leaves.map((item) => `- ${item.chapter} > ${item.section} > ${item.label}`),
      "",
      "## Event Context",
      "- Name: 架空研修ラボ ドメインモデリング講座",
      `- Date: ${SMOKE_EVENT_DATE}`,
      "- Duration: 360",
      `- Venue: ${SMOKE_VENUE}`,
      "",
      "## Speaker Profile",
      "- 山田 サンプル",
      `- ${SMOKE_SPEAKER_AFFILIATION}`,
      "- ワークフロー検証用の架空プロフィール",
      "",
      "## Required Topics",
      ...outline.leaves.map((item) => `- ${item.chapter} > ${item.section} > ${item.label}`),
      "",
      "## Avoid",
      "- Web画像の自動取得",
      "- 他deck画像の自動流用",
      "- SVG-firstという方針に戻すこと",
      "- htmlで十分なカード、比較、表、軽量フローをSVG化すること",
      "",
      "## Fact Inventory",
      `- 主催: ${SMOKE_ORGANIZER}`,
      "- 形式: ミラージュホール A / サンプル配信スタジオ",
      `- 日時: ${SMOKE_EVENT_DATE}`,
      "- 対象: メンテナとワークフロー検証者",
      `- 場所: ${SMOKE_VENUE}`,
      `- 講師所属: ${SMOKE_SPEAKER_AFFILIATION}`,
      "",
      "## Output Requirements",
      "- Target slide count: 5",
      "- Deck Mode: overview",
      "- Deliverables: html, pdf",
      "- Lecture-body requires 100〜140 or an equivalent corrected target.",
      "",
      "## Design Requirements",
      "- 白基調だが白黒ではない。",
      "- Claude Design Source の Resolved Design Contract を視覚制約として使う。",
      "",
      "## Example Policy",
      `- 共通題材: ${SMOKE_COMMON_EXAMPLE}`,
      "",
      "## Code Example Policy",
      "- Java風の疑似コード / Before / After / 業務意味を表す。",
      "",
      "## Exercise Policy",
      "- 短時間個人演習 / 模範回答。",
      "",
      "## Quality Checklist",
      "- coverage matrixに全leaf項目がある",
      "- html: visual と svg:/inline-svg: visual の責務が分かれている",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(targetInfo.deckPath, "reference-analysis.md"),
    [
      "# Reference Deck Analysis",
      "",
      "## Reference Source",
      "- Found: no",
      "- Copy policy: analysis only; do not copy reference slides",
      "",
      "## Synthetic Constraints",
      `- Official Title: ${SMOKE_OFFICIAL_TITLE}`,
      `- Speaker Affiliation: ${SMOKE_SPEAKER_AFFILIATION}`,
      `- Common example: ${SMOKE_COMMON_EXAMPLE}`,
      "",
      "## Plan Implications",
      "- Use brief.normalized.md as source of truth for the smoke deck.",
      "- Treat Target slide count: 5 as overview mode; lecture-body would require 100〜140.",
      "",
      "## Optional Research Context",
      `- Research Context Available: ${researchContext.available ? "yes" : "no"}`,
      `- Inputs read: ${researchContext.inputs.length > 0 ? researchContext.inputs.join(", ") : "none"}`,
      ...researchContext.referenceNotes,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(targetInfo.deckPath, "plan.md"),
    [
      "# Slide Plan",
      "",
      "## Deck Summary",
      `- Title: ${SMOKE_OFFICIAL_TITLE}`,
      "- Event Name: 架空研修ラボ ドメインモデリング講座",
      "- Speaker Name: 山田 サンプル",
      `- Speaker Affiliation: ${SMOKE_SPEAKER_AFFILIATION}`,
      `- Common example: ${SMOKE_COMMON_EXAMPLE}`,
      "- Target slide count: 5",
      "- Planned slide count: 5",
      "- Deck mode: overview",
      "deliverables: [html, pdf]",
      "",
      "## Design Contract",
      ...designContractLines,
      "",
      "## Slides",
      "- S001: Title | Visual: none | Visual Strategy: render_owner: compose_sections; text only",
      "- S002: Workflow overview | Visual: html: cards | Visual Strategy: render_owner: compose_sections; lightweight cards",
      "- S003: Input discipline | Visual: none | Visual Strategy: render_owner: compose_sections; text only",
      "- S004: Review discipline | Visual: none | Visual Strategy: render_owner: compose_sections; text only",
      "- S005: Delivery QA | Visual: none | Visual Strategy: render_owner: compose_sections; text only",
      "",
      "## Coverage Matrix",
      "",
      "### Fixed Outline Coverage",
      "| Chapter | Section | Leaf item | Slide(s) | Status |",
      "| --- | --- | --- | --- | --- |",
      ...coverageRows,
      "",
      "### Visual Rendering Coverage",
      "| Visual kind | Slide(s) | Render owner | Status |",
      "| --- | --- | --- | --- |",
      "| html: cards/comparison/table/light-flow | S002 | compose_sections | covered |",
      "| inline-svg: slide-specific-coordinate-diagram | not required for overview smoke | generate_visuals | not required |",
      "",
      "## Plan Findings",
      "- PF-SLIDE-COUNT-001: Target slide count: 5 is valid only for overview mode; lecture-body would require 100〜140.",
      ...researchContext.planFindings,
      "",
      "## Requested Deliverables",
      "- deliverables: [html, pdf]",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(targetInfo.deckPath, "slide-blueprint.md"),
    [
      "# Slide Blueprint",
      "",
      "## Blueprint Summary",
      `- Title: ${SMOKE_OFFICIAL_TITLE}`,
      `- Speaker Affiliation: ${SMOKE_SPEAKER_AFFILIATION}`,
      `- Common example: ${SMOKE_COMMON_EXAMPLE}`,
      "- Planned slide count: 5",
      "",
      "## Design Contract",
      ...designContractLines,
      "",
      "## Slide Blueprint Table",
      "| Slide ID | Section | Message | Content atoms | Visual | Visual Strategy | Speaker note intent | Source | Coverage IDs |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| S001 | intro | Title | Workflow smoke test | none | render_owner: compose_sections | opening | brief.normalized.md | title |",
      `| S002 | intro | Workflow overview | Plan / Compose / Deliver / ${SMOKE_COMMON_EXAMPLE} | html: cards/comparison/table/light-flow | render_owner: compose_sections | overview | plan.md | visual |`,
      "| S003 | body | Input discipline | Input discipline | none | render_owner: compose_sections | input | plan.md | body |",
      "| S004 | body | Review discipline | Review discipline | none | render_owner: compose_sections | review | plan.md | body |",
      "| S005 | body | Delivery QA | Delivery QA | none | render_owner: compose_sections | delivery | plan.md | body |",
      "",
      "## Section Assembly Manifest",
      "| File | Slide IDs | Slide count |",
      "| --- | --- | --- |",
      "| sections/01-intro.md | S001-S002 | 2 |",
      "| sections/02-body.md | S003-S005 | 3 |",
      "",
      "## Coverage Trace",
      "- visual: S002",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function readMockResearchPlanContext(targetInfo) {
  const artifacts = researchArtifactPaths(targetInfo);
  const required = [
    ["research-report.md", artifacts.report],
    ["research-claims.md", artifacts.claims],
    ["open-questions.md", artifacts.openQuestions],
  ];
  const available = required.every(([, filePath]) => existsSync(filePath));
  if (!available) {
    return Object.freeze({
      available: false,
      inputs: Object.freeze([]),
      referenceNotes: Object.freeze(["- Research artifacts are optional; Available: no."]),
      planFindings: Object.freeze(["- PF-RESEARCH-OPTIONAL-001: Research context Available: no; plan proceeds from brief.md only."]),
    });
  }

  const openQuestions = await readFile(artifacts.openQuestions, "utf8");
  assert(openQuestions.includes("not_present_in_builtin_report"), "mock plan research context missing not_present_in_builtin_report sentinel");
  return Object.freeze({
    available: true,
    inputs: Object.freeze(required.map(([name]) => name)),
    referenceNotes: Object.freeze([
      "- Research artifacts are optional; Available: yes.",
      "- Research origin: builtin_deep_research via research-report.md.",
      "- Missing URL, retrieval time, confidence, and claim-source mapping remain not_present_in_builtin_report.",
      "- unresolved open questions are not inferred or completed by plan.",
    ]),
    planFindings: Object.freeze([
      "- PF-RESEARCH-001: Research context Available: yes; cite research-report.md, research-claims.md, and open-questions.md as optional context.",
      "- PF-RESEARCH-002: unresolved research gaps remain not_present_in_builtin_report and are not inferred.",
    ]),
  });
}

async function writeMockComposeArtifacts(targetInfo, designContract) {
  const sectionsPath = path.join(targetInfo.deckPath, "sections");
  await mkdir(sectionsPath, { recursive: true });
  const tokenLines = designContract.tokens.map((token) => `    ${token.name}: ${token.value};`);
  await writeFile(
    path.join(sectionsPath, "manifest.md"),
    [
      "# Section Manifest",
      "",
      "## Section order",
      "- sections/01-intro.md: S001-S002 (2)",
      "- sections/02-body.md: S003-S005 (3)",
      "",
      "## Assembly checks",
      "- planned slide count: 5",
      "- actual section slide count: 5",
      "- missing slide IDs: none",
      "- duplicate slide IDs: none",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(sectionsPath, "01-intro.md"),
    [
      "<!-- slide_id: S001 -->",
      "",
      "# Workflow smoke test",
      "",
      "架空研修ラボ ドメインモデリング講座",
      "",
      "山田 サンプル / サンプルデザイン合同会社",
      "",
      "<!--",
      "【30分 / 累計 30:00】",
      "note: opening",
      "強調点: workflow smoke deckの前提とイベント文脈を最初に共有する。",
      "-->",
      "",
      "---",
      "<!-- slide_id: S002 -->",
      "",
      '<div class="visual-grid">',
      '  <div class="visual-card">Plan</div>',
      '  <div class="visual-card">Compose</div>',
      '  <div class="visual-card">Deliver</div>',
      "</div>",
      "",
      "<!--",
      "【90分 / 累計 120:00】",
      "note: overview",
      "強調点: plan、compose、deliverの責務分離が品質を安定させる。",
      "-->",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(sectionsPath, "02-body.md"),
    [
      "<!-- slide_id: S003 -->",
      "",
      "Input discipline",
      "",
      "<!--",
      "【80分 / 累計 200:00】",
      "note: input",
      "強調点: normalized briefへ重要情報を落とさず渡す。",
      "-->",
      "",
      "---",
      "<!-- slide_id: S004 -->",
      "",
      "Review discipline",
      "",
      "<!--",
      "【80分 / 累計 280:00】",
      "note: review",
      "強調点: coverageと契約の欠落をreviewで止める。",
      "-->",
      "",
      "---",
      "<!-- slide_id: S005 -->",
      "",
      "Delivery QA",
      "",
      "<!--",
      "【80分 / 累計 360:00】",
      "note: delivery",
      "強調点: build可能なMarp artifactまで検証する。",
      "-->",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(targetInfo.deckPath, "SLIDES.md"),
    [
      "---",
      "marp: true",
      "html: true",
      "title: Workflow smoke test",
      "style: |",
      "  :root {",
      ...tokenLines,
      "  }",
      "  section { background: var(--bg-page); font-family: var(--font-body); }",
      "  .visual-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); }",
      "  .visual-card { border: 1px solid var(--accent); border-radius: var(--radius-md); padding: var(--space-4); background: color-mix(in srgb, var(--bg-page) 92%, white); }",
      "---",
      "",
      "<!-- slide_id: S001 -->",
      "",
      "# Workflow smoke test",
      "",
      "架空研修ラボ ドメインモデリング講座",
      "",
      "山田 サンプル / サンプルデザイン合同会社",
      "",
      "<!--",
      "【30分 / 累計 30:00】",
      "note: opening",
      "強調点: workflow smoke deckの前提とイベント文脈を最初に共有する。",
      "-->",
      "",
      "---",
      "",
      "<!-- slide_id: S002 -->",
      "",
      '<div class="visual-grid">',
      '  <div class="visual-card">Plan</div>',
      '  <div class="visual-card">Compose</div>',
      '  <div class="visual-card">Deliver</div>',
      "</div>",
      "",
      "<!--",
      "【90分 / 累計 120:00】",
      "note: overview",
      "強調点: plan、compose、deliverの責務分離が品質を安定させる。",
      "-->",
      "",
      "---",
      "",
      "<!-- slide_id: S003 -->",
      "",
      "Input discipline",
      "",
      "<!--",
      "【80分 / 累計 200:00】",
      "note: input",
      "強調点: normalized briefへ重要情報を落とさず渡す。",
      "-->",
      "",
      "---",
      "",
      "<!-- slide_id: S004 -->",
      "",
      "Review discipline",
      "",
      "<!--",
      "【80分 / 累計 280:00】",
      "note: review",
      "強調点: coverageと契約の欠落をreviewで止める。",
      "-->",
      "",
      "---",
      "",
      "<!-- slide_id: S005 -->",
      "",
      "Delivery QA",
      "",
      "<!--",
      "【80分 / 累計 360:00】",
      "note: delivery",
      "強調点: build可能なMarp artifactまで検証する。",
      "-->",
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

function workflowCommandArgs(command, target, options, extraArgs = []) {
  const selectedWorkflowFile = options?.templateContext?.workflowFiles?.[command];
  const workflowFileArgs = selectedWorkflowFile ? ["--workflow-file", selectedWorkflowFile] : [];
  return [target, ...workflowFileArgs, ...providerFlagArgs(options), ...extraArgs];
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
  const sectionManifestPath = path.join(targetInfo.deckPath, "sections", "manifest.md");
  const slidesPath = path.join(targetInfo.deckPath, "SLIDES.md");
  const imagesPath = path.join(targetInfo.deckPath, "images");
  const designContract = await readSmokeResolvedDesignContract(targetInfo);
  await assertReadableFile(sectionManifestPath, "sequence:compose-source-artifacts");
  await assertReadableFile(slidesPath, "sequence:compose-source-artifacts");
  const sectionsPath = path.join(targetInfo.deckPath, "sections");
  const sectionEntries = await readdir(sectionsPath, { withFileTypes: true });
  const sectionPaths = sectionEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "manifest.md")
    .map((entry) => path.join(sectionsPath, entry.name));
  assert(sectionPaths.length > 0, `sequence:compose-source-artifacts expected at least one section file in ${relativePath(sectionsPath)}`);
  let sectionSource = "";
  for (const sectionPath of sectionPaths) {
    await assertReadableFile(sectionPath, "sequence:compose-source-artifacts");
    sectionSource += await readFile(sectionPath, "utf8");
  }
  const slidesSource = await readFile(slidesPath, "utf8");
  for (const phrase of [
    "--accent: #b0241d;",
    "--bg-page: #faf7f1;",
    "--font-body: 'Noto Sans JP', sans-serif;",
    "--space-4: 16px;",
    "var(--accent)",
    "var(--bg-page)",
    "var(--font-body)",
    "var(--space-4)",
    "var(--radius-md)",
  ]) {
    assert(slidesSource.includes(phrase), `sequence:compose-source-artifacts SLIDES.md missing design token usage '${phrase}'`);
  }
  assert(
    !existsSync(path.join(targetInfo.deckPath, "design-system.md")),
    "sequence:compose-source-artifacts mock compose must not generate design-system.md",
  );
  assert(
    designContract.fingerprint?.contract_sha256,
    "sequence:compose-source-artifacts missing design contract fingerprint",
  );
  for (const marker of ["【30分 / 累計 30:00】", "【90分 / 累計 120:00】", "【80分 / 累計 200:00】", "【80分 / 累計 280:00】", "【80分 / 累計 360:00】"]) {
    assert(sectionSource.includes(marker), `sequence:compose-source-artifacts section source missing duration marker '${marker}'`);
    assert(slidesSource.includes(marker), `sequence:compose-source-artifacts SLIDES.md missing duration marker '${marker}'`);
  }
  const htmlVisualPresent = /<div\s+class=["'][^"']*visual/.test(slidesSource);
  const entries = existsSync(imagesPath) ? await readdir(imagesPath, { withFileTypes: true }) : [];
  const svgPaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
    .map((entry) => path.join(imagesPath, entry.name));
  assert(htmlVisualPresent || svgPaths.length > 0, "sequence:compose-source-artifacts expected an HTML visual in SLIDES.md or at least one SVG asset");
  for (const svgPath of svgPaths) {
    await assertReadableFile(svgPath, "sequence:compose-source-artifacts");
  }
  return Object.freeze([smokeResolvedDesignContractPath(targetInfo), sectionManifestPath, ...sectionPaths, slidesPath, ...svgPaths]);
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

function assertWorkflowLoopMonitor(templateContext, command, expected) {
  const workflowFile = templateContext.workflowFiles[command];
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

function assertAiGateWorkflowRoute(templateContext, command, expected) {
  const workflowFile = templateContext.workflowFiles[command];
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

function assertAiGateCallableWorkflowRules(templateContext) {
  const workflowFile = templateContext.aiGateWorkflowFile;
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

function assertNoDeckLocalLoopMonitorFacets(templateContext) {
  for (const filePath of [
    path.join(templateContext.source.facetsDir, "instructions", "takt-marp-loop-monitor.md"),
    path.join(templateContext.source.facetsDir, "personas", "takt-marp-slide-loop-monitor.md"),
    path.join(templateContext.source.facetsDir, "output-contracts", "takt-marp-loop-monitor.md"),
  ]) {
    assert(!existsSync(filePath), `deck-local loop monitor facet still exists: ${relativePath(filePath)}`);
  }
}

async function assertWorkflowDoctorPasses(templateContext) {
  const doctorRoot = await mkdtemp(path.join(os.tmpdir(), "takt-marp-smoke-doctor-"));
  const workflowPaths = [
    ...TEMPLATE_WORKFLOW_COMMANDS.map((command) => path.join(".takt", "workflows", `takt-marp-slide-${command}.yaml`)),
    path.join(".takt", "workflows", "takt-marp-slide-ai-quality-gate.yaml"),
  ];
  try {
    await mkdir(path.join(doctorRoot, ".takt"), { recursive: true });
    await symlink(templateContext.source.workflowsDir, path.join(doctorRoot, ".takt", "workflows"), "dir");
    await symlink(templateContext.source.facetsDir, path.join(doctorRoot, ".takt", "facets"), "dir");
    const result = spawnSync(runtimeExecutablePath("takt"), ["workflow", "doctor", ...workflowPaths], {
      cwd: doctorRoot,
      encoding: "utf8",
      timeout: NODE_CHECK_TIMEOUT_MS,
      maxBuffer: CAPTURE_MAX_BUFFER,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert(result.status === 0, `workflow doctor failed for AI gate workflow set: ${output}`);
  } finally {
    await rm(doctorRoot, { recursive: true, force: true });
  }
}

function assertTextSequence(source, snippets, name) {
  let cursor = -1;
  for (const snippet of snippets) {
    const nextIndex = source.indexOf(snippet, cursor + 1);
    assert(nextIndex !== -1, `${name} missing ordered snippet: ${snippet}`);
    cursor = nextIndex;
  }
}

function assertNoUnsupportedWorkflowCommandGateObjects(templateContext) {
  const workflowFiles = [
    ...TEMPLATE_WORKFLOW_COMMANDS.map((command) => templateContext.workflowFiles[command]),
    templateContext.aiGateWorkflowFile,
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
  return setupSmokeDeckUnchecked(target);
}

async function setupAdditionalSmokeDeck(target) {
  assert(target.startsWith("slides/_workflow-smoke-"), `additional smoke target must stay under slides/_workflow-smoke-*: ${target}`);
  return setupSmokeDeckUnchecked(target);
}

async function setupSmokeDeckUnchecked(target) {
  if (!existsSync(FIXTURE_PATH)) {
    throw new SlideWorkflowError(`Smoke fixture not found: ${relativePath(FIXTURE_PATH)}`, "FIXTURE_MISSING");
  }

  const targetPath = path.join(ROOT, target);
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(targetPath, { recursive: true });

  const sourcePaths = await copyFixtureSources(FIXTURE_PATH, targetPath);
  const targetInfo = resolveDeckTarget(target, { root: ROOT });
  const designSourcePath = await writeClaudeDesignSmokeFixture(targetInfo, { root: ROOT });
  await cleanGeneratedOutputs(targetInfo, { root: ROOT });
  await mkdir(targetInfo.reviewPath, { recursive: true });

  return Object.freeze({
    targetInfo,
    observedPaths: Object.freeze([
      ...sourcePaths.map(relativePath),
      relativePath(designSourcePath),
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
    `summary_kind: ${data.summaryKind}`,
    `real_provider: ${data.realProvider}`,
    `selected_template_source: ${data.templateSource?.kind ?? "unknown"}`,
    `selected_template_root: ${data.templateSource ? data.templateSource.rootDir : "unknown"}`,
    `generated_at: ${new Date().toISOString()}`,
    `result: ${data.result}`,
    `commands_run: [${data.commands.map((command) => JSON.stringify(command)).join(", ")}]`,
    `failed_checks: [${data.checks.filter((check) => check.status === "FAIL").map((check) => JSON.stringify(check.name)).join(", ")}]`,
    "upstream_feedback_count: 0",
    "---",
    "",
    "# Smoke Summary",
    "",
    "## Provider Evidence",
    "",
    `- Summary kind: ${data.summaryKind}`,
    `- Provider: ${data.provider}`,
    `- Real provider: ${data.realProvider}`,
    "",
    "## Selected Template Source",
    "",
    `- Kind: ${data.templateSource?.kind ?? "unknown"}`,
    `- Root: ${data.templateSource?.rootDir ?? "unknown"}`,
    `- Workflows: ${data.templateSource?.workflowsDir ?? "unknown"}`,
    `- Facets: ${data.templateSource?.facetsDir ?? "unknown"}`,
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

function smokeSummaryKind(options) {
  return isMockProvider(options) ? "mock-smoke-validation" : "real-smoke-validation";
}

function realSummaryProvider(options) {
  return isMockProvider(options) ? "n/a" : options.provider;
}

function smokeSummaryProviderReason(options) {
  return isMockProvider(options)
    ? "Smoke summary is marked as mock smoke validation evidence."
    : `Smoke summary is marked as real smoke validation evidence for provider '${options.provider}'.`;
}

function formatSmokeFailure(error, options) {
  const reason = formatError(error);
  if (isMockProvider(options)) {
    return reason;
  }
  return `${reason} Check TAKT provider environment/configuration for '${options.provider}'. Real provider smoke is optional and is not required by CI; mock smoke remains the required deterministic validation.`;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(formatError(error));
    process.exit(1);
  });
}
