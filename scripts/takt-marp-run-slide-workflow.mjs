#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  archiveCommandArtifacts,
  assertBuiltinWorkflowAvailable,
  assertCommandPrerequisites,
  assertTaktExecutableAvailable,
  assertWorkflowAvailable,
  cleanGeneratedOutputs,
  commandSupervisionResult,
  deleteResearchReuseSidecar,
  downstreamCommands,
  formatError,
  isSuccessfulCommandState,
  parseFrontMatter,
  parseArgs,
  researchArtifactPaths,
  researchTaktTarget,
  requireCommand,
  resolveResearchReuseCandidate,
  resolveDeckTarget,
  shouldCleanGeneratedOutputsOnForce,
  SlideWorkflowError,
  taktExecutablePath,
  validateSupervision,
  writeResearchReuseSidecar,
} from "./lib/takt-marp-slide-workflow.mjs";
import { prepareBundledWorkflowRuntime, researchReuseWorkflowFilePath } from "./lib/takt-marp-project-templates.mjs";
import {
  loadDesignContractMarkerPayloadFromPath,
  loadResolvedDesignContractMarker,
  resolveAndSaveClaudeDesignContract,
  resolveClaudeDesignContract,
  saveResolvedDesignContract,
} from "./lib/takt-marp-claude-design-source.mjs";

function usage() {
  return [
    "Usage: node scripts/takt-marp-run-slide-workflow.mjs <command> <target> [--force] [--provider <name>]",
    "",
    "Commands: plan, compose, polish, deliver",
    "Target: slides/<deck>",
    "",
    "Examples:",
    "  npm run slide:plan -- \"slides/my-talk\"",
    "  npm run slide:plan -- \"slides/my-talk\" --provider mock",
    "  npm run slide:compose -- \"slides/my-talk\" --force",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }
  const [commandArg, target] = positional;
  const command = requireCommand(commandArg);
  const targetInfo = resolveDeckTarget(target);
  const selectedWorkflowFilePath = flags["workflow-file"];

  await assertCommandPrerequisites(targetInfo, command);
  const availableWorkflowPath = assertWorkflowAvailable(command, { workflowFilePath: selectedWorkflowFilePath });
  // Keep executable availability in preflight so failed setup cannot invalidate current artifacts.
  assertTaktExecutableAvailable();

  let fullResearchPreflightChecked = false;
  if (command === "research" && flags.force) {
    assertBuiltinWorkflowAvailable("deep-research");
    fullResearchPreflightChecked = true;
  }

  let resolvedDesignContract = null;
  let pendingDesignContract = null;
  if ((command === "plan" || command === "compose") && flags.force) {
    pendingDesignContract = await resolveClaudeDesignContract(targetInfo);
  }

  let researchReuseCandidate = null;
  if (flags.force) {
    if (command === "research") {
      await deleteResearchReuseSidecar(targetInfo);
    }
    await archiveCommandArtifacts(targetInfo, downstreamCommands(command), "force", { includeApprovals: true });
    if (shouldCleanGeneratedOutputsOnForce(command)) {
      await cleanGeneratedOutputs(targetInfo);
    }
    if (pendingDesignContract) {
      resolvedDesignContract = await saveResolvedDesignContract(pendingDesignContract.contract, targetInfo);
    }
  } else if (isSuccessfulCommandState(targetInfo, command)) {
    throw new SlideWorkflowError(
      `Command '${command}' already reached successful state. Use --force to invalidate and rerun.`,
      "RERUN_BLOCKED",
    );
  } else {
    const supervisionResult = await commandSupervisionResult(targetInfo, command);
    if (supervisionResult === "rejected") {
      if (command === "plan" || command === "compose") {
        pendingDesignContract = await resolveClaudeDesignContract(targetInfo);
      }
      await archiveCommandArtifacts(targetInfo, [command], "rejected-rerun");
    }
  }

  if (command === "research" && !flags.force) {
    researchReuseCandidate = await resolveResearchReuseCandidate(targetInfo);
  }
  if (command === "research" && !researchReuseCandidate && !fullResearchPreflightChecked) {
    assertBuiltinWorkflowAvailable("deep-research");
  }

  const preparedWorkflow = selectedWorkflowFilePath
    ? await prepareBundledWorkflowRuntime(availableWorkflowPath, {
        stageBundledDeepResearch: !(command === "research" && researchReuseCandidate),
      })
    : undefined;
  let code;
  let runSnapshotBefore;
  let runDirectorySnapshotBefore;
  let preparedResearchReuseCandidate = null;
  try {
    const selectedWorkflowForTakt = researchReuseCandidate
      ? assertResearchReuseWorkflowAvailable(preparedWorkflow?.workflowFilePath ?? availableWorkflowPath)
      : preparedWorkflow?.workflowFilePath;
    preparedResearchReuseCandidate = researchReuseCandidate
      ? await prepareResearchReuseSourceReport(targetInfo, researchReuseCandidate)
      : null;
    if ((command === "plan" || command === "compose") && !resolvedDesignContract) {
      resolvedDesignContract = pendingDesignContract
        ? await saveResolvedDesignContract(pendingDesignContract.contract, targetInfo)
        : await resolveAndSaveClaudeDesignContract(targetInfo);
    }
    await writeCurrentWorkflowTarget(command, targetInfo, {
      researchReuseCandidate: preparedResearchReuseCandidate,
      designContract: resolvedDesignContract?.markerPayload ?? (await existingDesignContractMarker(targetInfo)),
    });
    runSnapshotBefore = await snapshotTaktRuns(command);
    runDirectorySnapshotBefore = command === "research" ? await snapshotTaktRunDirectories() : null;
    const taktTarget = command === "research" ? researchTaktTarget(targetInfo) : targetInfo.target;
    code = await runTakt(command, taktTarget, {
      provider: flags.provider,
      workflowFilePath: selectedWorkflowForTakt,
    });
  } catch (error) {
    await preparedResearchReuseCandidate?.restoreSourceReport();
    throw error;
  } finally {
    await preparedWorkflow?.cleanup();
  }
  if (code !== 0) {
    await preparedResearchReuseCandidate?.restoreSourceReport();
    if (command === "research" && !researchReuseCandidate) {
      try {
        await writeResearchReuseSidecarFromFailedRun(targetInfo, runDirectorySnapshotBefore);
      } catch (error) {
        console.error(formatError(error));
        process.exitCode = code;
        return;
      }
    }
    process.exitCode = code;
    return;
  }
  if (command === "research") {
    try {
      await syncResearchArtifactsToDeck(targetInfo, runSnapshotBefore, { researchReuseCandidate: preparedResearchReuseCandidate });
      if (!isSuccessfulCommandState(targetInfo, "research")) {
        throw new SlideWorkflowError(
          `TAKT completed but research supervision did not reach successful state '${targetInfo.target} -> researched'.`,
          "TAKT_RESEARCH_SUPERVISION_NOT_PASSED",
        );
      }
      await preparedResearchReuseCandidate?.commitSourceReport();
      await deleteResearchReuseSidecar(targetInfo);
    } catch (error) {
      await preparedResearchReuseCandidate?.restoreSourceReport();
      if (!researchReuseCandidate && error.code !== "TAKT_RESEARCH_SOURCE_REPORT_AMBIGUOUS") {
        await writeResearchReuseSidecarFromFailedRun(targetInfo, runDirectorySnapshotBefore);
      }
      throw error;
    }
  } else {
    await syncTaktReportsToDeck(command, targetInfo, runSnapshotBefore);
  }
}

async function prepareResearchReuseSourceReport(targetInfo, researchReuseCandidate) {
  const researchArtifacts = researchArtifactPaths(targetInfo);
  const backupPath = path.join(
    path.dirname(researchArtifacts.report),
    `.${path.basename(researchArtifacts.report)}.${process.pid}-${Date.now()}.reuse.bak`,
  );
  const hadExistingReport = existsSync(researchArtifacts.report);
  if (hadExistingReport) {
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(researchArtifacts.report, backupPath);
  }
  try {
    await replaceFileAtomically(researchReuseCandidate.source_report_path, researchArtifacts.report);
  } catch (error) {
    await removeIfExists(backupPath);
    throw error;
  }
  let finalized = false;
  return Object.freeze({
    ...researchReuseCandidate,
    original_source_report_path: researchReuseCandidate.source_report_path,
    source_report_path: researchArtifacts.report,
    restoreSourceReport: async () => {
      if (finalized) {
        return;
      }
      if (hadExistingReport) {
        await replaceFileAtomically(backupPath, researchArtifacts.report);
        await removeIfExists(backupPath);
      } else {
        await removeIfExists(researchArtifacts.report);
      }
      finalized = true;
    },
    commitSourceReport: async () => {
      if (finalized) {
        return;
      }
      await removeIfExists(backupPath);
      finalized = true;
    },
  });
}

async function removeIfExists(filePath) {
  await unlink(filePath).catch((error) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

async function writeCurrentWorkflowTarget(command, targetInfo, options = {}) {
  const markerPath = path.join(process.cwd(), ".takt", "workflow-current-target.json");
  await mkdir(path.dirname(markerPath), { recursive: true });
  const marker = {
    command,
    target: targetInfo.target,
    deck: targetInfo.deckName,
    started_at: new Date().toISOString(),
  };
  if (command === "research") {
    marker.research_brief_path = researchTaktTarget(targetInfo);
    marker.research_output_dir = path.posix.join(targetInfo.target, "research");
  }
  if (command === "research" && options.researchReuseCandidate) {
    marker.research_reuse = true;
    marker.research_source_report_path = projectRelativeMarkerPath(options.researchReuseCandidate.source_report_path);
    marker.research_source_report_origin = "builtin_deep_research";
    marker.research_source_run = options.researchReuseCandidate.source_run;
  }
  if (options.designContract) {
    marker.design_contract = options.designContract;
  }
  await writeFile(
    markerPath,
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf8",
  );
}

async function existingDesignContractMarker(targetInfo) {
  const markerPath = path.join(process.cwd(), ".takt", "workflow-current-target.json");
  if (existsSync(markerPath)) {
    try {
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      if (marker.target === targetInfo.target && marker.design_contract && designContractMarkerPathExists(marker.design_contract)) {
        const existingMarker = await loadDesignContractMarkerPayloadFromPath(designContractMarkerAbsolutePath(marker.design_contract));
        if (existingMarker) {
          return existingMarker;
        }
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return loadResolvedDesignContractMarker(targetInfo);
}

function designContractMarkerPathExists(designContract) {
  if (typeof designContract.path !== "string" || !designContract.path) {
    return false;
  }
  return existsSync(designContractMarkerAbsolutePath(designContract));
}

function designContractMarkerAbsolutePath(designContract) {
  return path.isAbsolute(designContract.path)
    ? designContract.path
    : path.join(process.cwd(), designContract.path);
}

function projectRelativeMarkerPath(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join("/");
  }
  return filePath;
}

function assertResearchReuseWorkflowAvailable(researchWorkflowFilePath) {
  const reuseWorkflowFilePath = researchReuseWorkflowFilePath(researchWorkflowFilePath);
  if (!existsSync(reuseWorkflowFilePath)) {
    throw new SlideWorkflowError(
      `Research Reuse Workflow YAML is not implemented: ${path.relative(process.cwd(), reuseWorkflowFilePath)}. ` +
        "Implement takt-marp-slide-research-reuse.yaml before reusing a failed research source report.",
      "WORKFLOW_NOT_IMPLEMENTED",
    );
  }
  return reuseWorkflowFilePath;
}

async function runTakt(command, target, options = {}) {
  const workflow = options.workflowFilePath ?? `takt-marp-slide-${command}`;
  const args = ["--pipeline", "--skip-git", "-w", workflow, "-t", target];
  if (options.provider) {
    args.push("--provider", options.provider);
  }
  const child = spawn(taktExecutablePath(), args, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", (error) => {
      reject(
        new SlideWorkflowError(
          `Failed to start TAKT executable: ${taktExecutablePath()}. Run npm install and verify the takt devDependency. ${error.message}`,
          "TAKT_EXECUTABLE_MISSING",
        ),
      );
    });
    child.on("close", resolve);
  });
  return code ?? 1;
}

async function syncTaktReportsToDeck(command, targetInfo, runSnapshotBefore) {
  const reportsDir = await createdTaktReportsDir(command, targetInfo, runSnapshotBefore);
  if (!reportsDir) {
    throw new SlideWorkflowError(
      `TAKT completed but no matching report directory was found for ${command} ${targetInfo.target}.`,
      "TAKT_REPORT_SYNC_MISSING",
    );
  }

  await mkdir(targetInfo.reviewPath, { recursive: true });
  const reportNameSet = commandReportNameSet(command);
  const selectedRun = await selectedRunMetadata(reportsDir, command);
  const reportCopies = await commandReportCopies(reportsDir, command, reportNameSet, {
    target: targetInfo.target,
    workflowRunId: selectedRun.workflow_run_id,
  });
  const sourceArtifactCopies = await commandSourceArtifactCopies(reportsDir, command, targetInfo);
  await replaceDeckSourceArtifacts(sourceArtifactCopies);
  await replaceDeckReports(targetInfo.reviewPath, reportNameSet, reportCopies);
}

async function syncResearchArtifactsToDeck(targetInfo, runSnapshotBefore, options = {}) {
  const reportsDir = await createdTaktReportsDir("research", targetInfo, runSnapshotBefore, { requirePassed: false });
  if (!reportsDir) {
    throw new SlideWorkflowError(
      `TAKT completed but no matching research report directory was found for ${targetInfo.target}.`,
      "TAKT_RESEARCH_REPORT_SYNC_MISSING",
    );
  }
  await assertResearchSupervisionPassed(reportsDir, targetInfo);

  const researchArtifacts = researchArtifactPaths(targetInfo);
  const sourceReportCopies = [];
  if (options.researchReuseCandidate) {
    if (!existsSync(researchArtifacts.report)) {
      throw new SlideWorkflowError(
        `TAKT completed but the deck-local reuse source report was not found: ${path.relative(process.cwd(), researchArtifacts.report)}`,
        "TAKT_RESEARCH_REUSE_SOURCE_REPORT_MISSING",
      );
    }
    await assertResearchReuseSourceReportUnchanged(options.researchReuseCandidate, researchArtifacts.report);
  } else {
    sourceReportCopies.push(Object.freeze({
      sourcePath: await findSingleResearchSourceReportPath(reportsDir),
      finalPath: researchArtifacts.report,
    }));
  }
  const artifactCopies = [
    ...sourceReportCopies,
    ...researchAdapterArtifactCopies(reportsDir, researchArtifacts),
  ];
  for (const { sourcePath, finalPath } of artifactCopies) {
    await replaceFileAtomically(sourcePath, finalPath);
  }
}

async function assertResearchReuseSourceReportUnchanged(researchReuseCandidate, deckReportPath) {
  const sourceReportPath = researchReuseCandidate.original_source_report_path;
  if (!sourceReportPath) {
    throw new SlideWorkflowError(
      "TAKT completed but reuse source report origin was not recorded before workflow execution.",
      "TAKT_RESEARCH_REUSE_SOURCE_REPORT_MISSING",
    );
  }
  const [sourceReport, deckReport] = await Promise.all([
    readFile(sourceReportPath),
    readFile(deckReportPath),
  ]);
  if (!sourceReport.equals(deckReport)) {
    throw new SlideWorkflowError(
      `TAKT completed but deck-local reuse source report changed during reuse workflow execution: ${path.relative(process.cwd(), deckReportPath)}`,
      "TAKT_RESEARCH_REUSE_SOURCE_REPORT_CHANGED",
    );
  }
}

async function assertResearchSupervisionPassed(reportsDir, targetInfo) {
  const supervisionReportPath = path.join(reportsDir, "research-supervision.md");
  if (!existsSync(supervisionReportPath)) {
    throw new SlideWorkflowError(
      `TAKT completed but research supervision report was not found in selected reports directory: ${path.relative(process.cwd(), supervisionReportPath)}`,
      "TAKT_RESEARCH_ARTIFACT_SYNC_MISSING",
    );
  }
  const { frontMatter } = parseFrontMatter(await readFile(supervisionReportPath, "utf8"));
  try {
    validateSupervision(frontMatter, targetInfo, "research");
  } catch (error) {
    if (error.code !== "STATE_MISMATCH") {
      throw error;
    }
  }
  if (frontMatter.result !== "passed" || frontMatter.state !== "researched") {
    throw new SlideWorkflowError(
      `TAKT completed but research supervision did not reach successful state '${targetInfo.target} -> researched'.`,
      "TAKT_RESEARCH_SUPERVISION_NOT_PASSED",
    );
  }
}

async function writeResearchReuseSidecarFromFailedRun(targetInfo, runSnapshotBefore) {
  const candidates = await failedResearchReuseCandidates(targetInfo, runSnapshotBefore);
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1) {
    const relativeCandidates = candidates.map((candidate) => path.relative(process.cwd(), candidate.sourceReportPath)).sort();
    throw new SlideWorkflowError(
      `TAKT research failed but multiple reusable built-in research-report.md candidates were found in this execution: ${relativeCandidates.join(", ")}`,
      "TAKT_RESEARCH_REUSE_AMBIGUOUS",
    );
  }
  const [candidate] = candidates;
  return writeResearchReuseSidecar(targetInfo, {
    sourceRun: candidate.runName,
    sourceReportsDir: candidate.reportsDir,
    sourceReportPath: candidate.sourceReportPath,
  });
}

async function failedResearchReuseCandidates(targetInfo, runSnapshotBefore) {
  const candidates = [];
  const changedRuns = await changedTaktRunsSinceSnapshot(runSnapshotBefore ?? new Map());
  for (const { runName, runDir } of changedRuns) {
    const meta = await readTaktRunMeta(runDir);
    if (!matchesResearchReuseRunMeta(meta, targetInfo)) {
      continue;
    }
    const reportsDir = reportDirectoryFromMeta(meta, runDir);
    let sourceReportPath;
    try {
      sourceReportPath = await findSingleResearchSourceReportPath(reportsDir, { allowDirectFallback: false });
    } catch (error) {
      if (error.code === "TAKT_RESEARCH_SOURCE_REPORT_MISSING") {
        continue;
      }
      if (error.code === "TAKT_RESEARCH_SOURCE_REPORT_AMBIGUOUS") {
        throw new SlideWorkflowError(error.message, "TAKT_RESEARCH_REUSE_AMBIGUOUS");
      }
      throw error;
    }
    candidates.push(Object.freeze({ runName, reportsDir, sourceReportPath }));
  }
  return Object.freeze(candidates);
}

function matchesResearchReuseRunMeta(meta, targetInfo) {
  if (!meta) {
    return false;
  }
  return (
    normalizeWorkflowIdentity(meta.workflow) === "takt-marp-slide-research" &&
    meta.task === researchTaktTarget(targetInfo)
  );
}

function normalizeWorkflowIdentity(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const normalized = value.trim().replaceAll("\\", "/");
  const baseName = normalized.includes("/") ? path.posix.basename(normalized) : normalized;
  return baseName.replace(/\.ya?ml$/i, "");
}

async function readTaktRunMeta(runDir) {
  const metaPath = path.join(runDir, "meta.json");
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function reportDirectoryFromMeta(meta, runDir) {
  const reportDirectory = meta?.reportDirectory ?? meta?.report_directory;
  if (typeof reportDirectory !== "string" || !reportDirectory.trim()) {
    return path.join(runDir, "reports");
  }
  if (path.isAbsolute(reportDirectory)) {
    return reportDirectory;
  }
  const projectRelative = path.resolve(process.cwd(), reportDirectory);
  if (existsSync(projectRelative)) {
    return projectRelative;
  }
  return path.resolve(runDir, reportDirectory);
}

async function findSingleResearchSourceReportPath(reportsDir, options = {}) {
  const found = [];
  await collectReportPaths(reportsDir, "research-report.md", found);
  const preferred = found.filter((reportPath) => isDeepResearchWorkflowReport(reportsDir, reportPath));
  if (preferred.length > 1) {
    const relativeCandidates = preferred.map((reportPath) => path.relative(process.cwd(), reportPath)).sort();
    throw new SlideWorkflowError(
      `TAKT completed but multiple built-in research-report.md candidates were found under selected reports directory: ${relativeCandidates.join(", ")}`,
      "TAKT_RESEARCH_SOURCE_REPORT_AMBIGUOUS",
    );
  }
  if (preferred.length === 1) {
    return preferred[0];
  }

  if (options.allowDirectFallback !== false) {
    const directReportPath = path.join(reportsDir, "research-report.md");
    if (existsSync(directReportPath)) {
      return directReportPath;
    }
  }

  throw new SlideWorkflowError(
    `TAKT completed but no built-in research-report.md was found under workflow-deep-research or selected reports directory root: ${path.relative(process.cwd(), reportsDir)}`,
    "TAKT_RESEARCH_SOURCE_REPORT_MISSING",
  );
}

function isDeepResearchWorkflowReport(reportsDir, reportPath) {
  const relativePath = path.relative(reportsDir, reportPath);
  return relativePath.split(path.sep).some((segment) => segment.includes("workflow-deep-research"));
}

function researchAdapterArtifactCopies(reportsDir, researchArtifacts) {
  const artifactMap = Object.freeze({
    "research-sources.md": researchArtifacts.sources,
    "research-claims.md": researchArtifacts.claims,
    "open-questions.md": researchArtifacts.openQuestions,
    "research-supervision.md": researchArtifacts.supervision,
  });
  return Object.entries(artifactMap).map(([artifactName, finalPath]) => {
    const sourcePath = path.join(reportsDir, artifactName);
    if (!existsSync(sourcePath)) {
      throw new SlideWorkflowError(
        `TAKT completed but required research artifact was not found in selected reports directory: ${path.relative(process.cwd(), sourcePath)}`,
        "TAKT_RESEARCH_ARTIFACT_SYNC_MISSING",
      );
    }
    return Object.freeze({ sourcePath, finalPath });
  });
}

async function selectedRunMetadata(reportsDir, command) {
  const reportPath = path.join(reportsDir, `${command}-supervision.md`);
  const { frontMatter } = parseFrontMatter(await readFile(reportPath, "utf8"));
  return frontMatter;
}

function commandReportNameSet(command) {
  return new Set([
    `${command}-work.md`,
    `${command}-review.md`,
    `${command}-inspect.md`,
    `${command}-verify.md`,
    `${command}-fix.md`,
    `${command}-supervision.md`,
    `${command}-loop-monitor.md`,
    `${command}-ai-antipattern-review.md`,
    `${command}-ai-antipattern-fix.md`,
  ]);
}

async function commandReportCopies(reportsDir, command, reportNameSet, selectedRun) {
  const reportNames = await readdir(reportsDir);
  const topLevelReportCopies = reportNames
    .filter((name) => reportNameSet.has(name))
    .map((reportName) => Object.freeze({ reportName, sourcePath: path.join(reportsDir, reportName) }));
  return Object.freeze([
    ...topLevelReportCopies,
    ...(await aiGateReportCopies(reportsDir, command, selectedRun)),
  ]);
}

async function commandSourceArtifactCopies(reportsDir, command, targetInfo) {
  const sourceArtifactNames = commandSourceArtifactNames(command);
  const copies = [];
  for (const artifactName of sourceArtifactNames) {
    const sourcePath = path.join(reportsDir, artifactName);
    if (!existsSync(sourcePath)) {
      throw new SlideWorkflowError(
        `TAKT completed but required source artifact was not found in reports: ${path.relative(process.cwd(), sourcePath)}`,
        "TAKT_SOURCE_ARTIFACT_SYNC_MISSING",
      );
    }
    copies.push(Object.freeze({
      sourcePath,
      finalPath: path.join(targetInfo.deckPath, artifactName),
    }));
  }
  return Object.freeze(copies);
}

function commandSourceArtifactNames(command) {
  if (command === "plan") {
    return ["brief.normalized.md", "reference-analysis.md", "plan.md", "slide-blueprint.md"];
  }
  return [];
}

async function replaceDeckSourceArtifacts(sourceArtifactCopies) {
  for (const { sourcePath, finalPath } of sourceArtifactCopies) {
    await replaceFileAtomically(sourcePath, finalPath);
  }
}

async function replaceFileAtomically(sourcePath, finalPath) {
  await mkdir(path.dirname(finalPath), { recursive: true });
  const tempSuffix = `${process.pid}-${Date.now()}`;
  const tempPath = path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.${tempSuffix}.tmp`);
  const backupPath = path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.${tempSuffix}.bak`);
  let backupCreated = false;
  try {
    await copyFile(sourcePath, tempPath);
    if (existsSync(finalPath)) {
      await rename(finalPath, backupPath);
      backupCreated = true;
    }
    await rename(tempPath, finalPath);
    if (backupCreated && existsSync(backupPath)) {
      await unlink(backupPath);
    }
  } catch (error) {
    if (existsSync(tempPath)) {
      await unlink(tempPath);
    }
    if (backupCreated) {
      if (existsSync(finalPath)) {
        await unlink(finalPath);
      }
      if (existsSync(backupPath)) {
        await rename(backupPath, finalPath);
      }
    }
    throw error;
  }
}

async function aiGateReportCopies(reportsDir, command, selectedRun) {
  const subworkflowsDir = path.join(reportsDir, "subworkflows");
  if (!existsSync(subworkflowsDir)) {
    return Object.freeze([]);
  }
  const copies = [];
  const reportSteps = {
    "ai-antipattern-review.md": "ai_antipattern_review",
    "ai-antipattern-fix.md": "ai_antipattern_fix",
  };
  for (const [reportFileName, step] of Object.entries(reportSteps)) {
    const sourcePath = await findSingleAiGateReportPath(subworkflowsDir, reportFileName, {
      command,
      target: selectedRun.target,
      workflowRunId: selectedRun.workflowRunId,
      step,
    });
    if (sourcePath) {
      copies.push(Object.freeze({
        reportName: `${command}-${reportFileName}`,
        sourcePath,
      }));
    }
  }
  return Object.freeze(copies);
}

async function findSingleAiGateReportPath(rootDir, reportFileName, expected) {
  const found = [];
  await collectReportPaths(rootDir, reportFileName, found);
  const matching = [];
  for (const reportPath of found) {
    const report = await matchingAiGateReport(reportPath, expected);
    if (report) {
      matching.push(report);
    }
  }
  if (matching.length === 0) {
    return null;
  }
  return [...matching].sort(
    (left, right) => right.cycle - left.cycle || right.mtimeMs - left.mtimeMs || right.reportPath.localeCompare(left.reportPath),
  )[0].reportPath;
}

async function matchingAiGateReport(reportPath, expected) {
  const { frontMatter } = parseFrontMatter(await readFile(reportPath, "utf8"));
  if (
    frontMatter.command === expected.command &&
    frontMatter.target === expected.target &&
    frontMatter.workflow_run_id === expected.workflowRunId &&
    frontMatter.step === expected.step
  ) {
    const reportStat = await stat(reportPath);
    return Object.freeze({
      reportPath,
      cycle: Number(frontMatter.cycle ?? 0),
      mtimeMs: reportStat.mtimeMs,
    });
  }
  return null;
}

async function collectReportPaths(directory, reportFileName, found) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectReportPaths(entryPath, reportFileName, found);
    } else if (entry.isFile() && entry.name === reportFileName) {
      found.push(entryPath);
    }
  }
}

async function replaceDeckReports(reviewPath, reportNameSet, reportCopies) {
  const syncedReportNames = reportCopies.map(({ reportName }) => reportName);
  const tempReports = [];
  const backupReports = [];
  const tempSuffix = `${process.pid}-${Date.now()}`;
  let replacementStarted = false;

  try {
    for (const { reportName, sourcePath } of reportCopies) {
      const tempPath = path.join(reviewPath, `.${reportName}.${tempSuffix}.tmp`);
      await copyFile(sourcePath, tempPath);
      tempReports.push({ reportName, tempPath, finalPath: path.join(reviewPath, reportName) });
    }

    for (const { reportName, finalPath } of tempReports) {
      if (existsSync(finalPath)) {
        const backupPath = path.join(reviewPath, `.${reportName}.${tempSuffix}.bak`);
        await rename(finalPath, backupPath);
        backupReports.push({ backupPath, finalPath });
      }
    }

    replacementStarted = true;
    for (const { tempPath, finalPath } of tempReports) {
      await rename(tempPath, finalPath);
    }
  } catch (error) {
    for (const { tempPath } of tempReports) {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    }
    if (replacementStarted) {
      for (const { finalPath } of tempReports) {
        if (existsSync(finalPath)) {
          await unlink(finalPath);
        }
      }
    }
    for (const { backupPath, finalPath } of backupReports.reverse()) {
      if (existsSync(backupPath)) {
        await rename(backupPath, finalPath);
      }
    }
    throw error;
  }

  for (const { backupPath } of backupReports) {
    if (existsSync(backupPath)) {
      await unlink(backupPath);
    }
  }

  await cleanStaleDeckReports(reviewPath, reportNameSet, new Set(syncedReportNames));
}

async function cleanStaleDeckReports(reviewPath, reportNameSet, syncedReportNameSet) {
  const reportNames = await readdir(reviewPath);
  for (const reportName of reportNames.filter((name) => reportNameSet.has(name) && !syncedReportNameSet.has(name))) {
    await unlink(path.join(reviewPath, reportName));
  }
}

async function createdTaktReportsDir(command, targetInfo, runSnapshotBefore, options = {}) {
  const runsRoot = path.join(process.cwd(), ".takt", "runs");
  const runNames = (await listTaktRunNames()).sort().reverse();
  const candidates = [];
  const requirePassed = options.requirePassed ?? true;

  for (const runName of runNames) {
    const reportsDir = path.join(runsRoot, runName, "reports");
    const reportPath = path.join(reportsDir, `${command}-supervision.md`);
    const reportMtime = await reportMtimeIfChangedSinceSnapshot(reportPath, runName, runSnapshotBefore);
    if (reportMtime !== null && (await reportMatchesTarget(reportPath, command, targetInfo.target, { requirePassed }))) {
      candidates.push({ reportsDir, reportMtime });
    }
  }

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1) {
    throw new SlideWorkflowError(
      `TAKT completed but multiple matching report directories changed for ${command} ${targetInfo.target}. Refusing to sync an ambiguous run.`,
      "TAKT_REPORT_SYNC_AMBIGUOUS",
    );
  }
  return candidates[0].reportsDir;
}

async function snapshotTaktRuns(command) {
  const runsRoot = path.join(process.cwd(), ".takt", "runs");
  const snapshot = new Map();
  for (const runName of await listTaktRunNames()) {
    const reportPath = path.join(runsRoot, runName, "reports", `${command}-supervision.md`);
    snapshot.set(runName, existsSync(reportPath) ? (await stat(reportPath)).mtimeMs : null);
  }
  return snapshot;
}

async function snapshotTaktRunDirectories() {
  const runsRoot = path.join(process.cwd(), ".takt", "runs");
  const snapshot = new Map();
  for (const runName of await listTaktRunNames()) {
    const runDir = path.join(runsRoot, runName);
    snapshot.set(runName, await maxMtimeMs(runDir));
  }
  return snapshot;
}

async function changedTaktRunsSinceSnapshot(runSnapshotBefore) {
  const runsRoot = path.join(process.cwd(), ".takt", "runs");
  const changed = [];
  for (const runName of await listTaktRunNames()) {
    const runDir = path.join(runsRoot, runName);
    const currentMtimeMs = await maxMtimeMs(runDir);
    const previousMtimeMs = runSnapshotBefore.get(runName);
    if (previousMtimeMs === undefined || currentMtimeMs > previousMtimeMs) {
      changed.push(Object.freeze({ runName, runDir, currentMtimeMs }));
    }
  }
  return Object.freeze(changed);
}

async function maxMtimeMs(rootPath) {
  const rootStat = await stat(rootPath);
  let max = rootStat.mtimeMs;
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    const entryStat = await stat(entryPath);
    max = Math.max(max, entryStat.mtimeMs);
    if (entry.isDirectory()) {
      max = Math.max(max, await maxMtimeMs(entryPath));
    }
  }
  return max;
}

async function reportMtimeIfChangedSinceSnapshot(reportPath, runName, runSnapshotBefore) {
  if (!existsSync(reportPath)) {
    return null;
  }
  const reportMtime = (await stat(reportPath)).mtimeMs;
  const previousMtime = runSnapshotBefore.get(runName);
  return previousMtime === undefined || previousMtime === null || reportMtime > previousMtime ? reportMtime : null;
}

async function listTaktRunNames() {
  const runsRoot = path.join(process.cwd(), ".takt", "runs");
  if (!existsSync(runsRoot)) {
    return [];
  }
  return (await readdir(runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function reportMatchesTarget(reportPath, command, target, options = {}) {
  if (!existsSync(reportPath)) {
    return false;
  }
  const requirePassed = options.requirePassed ?? true;
  const { frontMatter } = parseFrontMatter(await readFile(reportPath, "utf8"));
  return frontMatter.command === command && frontMatter.target === target && (!requirePassed || frontMatter.result === "passed");
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
