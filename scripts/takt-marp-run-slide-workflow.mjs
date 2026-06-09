#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  archiveCommandArtifacts,
  assertCommandPrerequisites,
  assertTaktExecutableAvailable,
  assertWorkflowAvailable,
  cleanGeneratedOutputs,
  commandSupervisionResult,
  downstreamCommands,
  formatError,
  isSuccessfulCommandState,
  parseFrontMatter,
  parseArgs,
  requireCommand,
  resolveDeckTarget,
  SlideWorkflowError,
  taktExecutablePath,
} from "./lib/takt-marp-slide-workflow.mjs";

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

  await assertCommandPrerequisites(targetInfo, command);
  assertWorkflowAvailable(command);
  // Keep executable availability in preflight so failed setup cannot invalidate current artifacts.
  assertTaktExecutableAvailable();

  if (flags.force) {
    await archiveCommandArtifacts(targetInfo, downstreamCommands(command), "force", { includeApprovals: true });
    await cleanGeneratedOutputs(targetInfo);
  } else if (isSuccessfulCommandState(targetInfo, command)) {
    throw new SlideWorkflowError(
      `Command '${command}' already reached successful state. Use --force to invalidate and rerun.`,
      "RERUN_BLOCKED",
    );
  } else if ((await commandSupervisionResult(targetInfo, command)) === "rejected") {
    await archiveCommandArtifacts(targetInfo, [command], "rejected-rerun");
  }

  await writeCurrentWorkflowTarget(command, targetInfo);
  const runSnapshotBefore = await snapshotTaktRuns(command);
  const code = await runTakt(command, targetInfo.target, { provider: flags.provider });
  if (code !== 0) {
    process.exitCode = code;
    return;
  }
  await syncTaktReportsToDeck(command, targetInfo, runSnapshotBefore);
}

async function writeCurrentWorkflowTarget(command, targetInfo) {
  const markerPath = path.join(process.cwd(), ".takt", "workflow-current-target.json");
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        command,
        target: targetInfo.target,
        deck: targetInfo.deckName,
        started_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function runTakt(command, target, options = {}) {
  const args = ["--pipeline", "--skip-git", "-w", `takt-marp-slide-${command}`, "-t", target];
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
  await replaceDeckReports(targetInfo.reviewPath, reportNameSet, reportCopies);
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
  const entries = await readdir(directory, { withFileTypes: true });
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

async function createdTaktReportsDir(command, targetInfo, runSnapshotBefore) {
  const runsRoot = path.join(process.cwd(), ".takt", "runs");
  const runNames = (await listTaktRunNames()).sort().reverse();
  const candidates = [];

  for (const runName of runNames) {
    const reportsDir = path.join(runsRoot, runName, "reports");
    const reportPath = path.join(reportsDir, `${command}-supervision.md`);
    const reportMtime = await reportMtimeIfChangedSinceSnapshot(reportPath, runName, runSnapshotBefore);
    if (reportMtime !== null && (await reportMatchesSuccessfulTarget(reportPath, command, targetInfo.target))) {
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

async function reportMatchesSuccessfulTarget(reportPath, command, target) {
  if (!existsSync(reportPath)) {
    return false;
  }
  const { frontMatter } = parseFrontMatter(await readFile(reportPath, "utf8"));
  return frontMatter.command === command && frontMatter.target === target && frontMatter.result === "passed";
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
