#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  formatError,
  resolveDeckTarget,
  SlideWorkflowError,
} from "./lib/takt-marp-slide-workflow.mjs";

const EXPECTED_ARTIFACTS = Object.freeze({
  html: "SLIDES.html",
  pdf: "SLIDES.pdf",
  pptx: "SLIDES.pptx",
});

function usage() {
  return [
    "Usage: node scripts/takt-marp-verify-delivery-artifacts.mjs <work|verify> [target]",
    "",
    "When target is omitted, the newest matching deliver report under slides/*/review is used.",
    "",
    "Examples:",
    "  node scripts/takt-marp-verify-delivery-artifacts.mjs work",
    "  node scripts/takt-marp-verify-delivery-artifacts.mjs verify slides/my-talk",
  ].join("\n");
}

function main() {
  const [mode, target] = process.argv.slice(2);
  if (mode === "--help" || mode === "-h") {
    console.log(usage());
    return;
  }
  if (!["work", "verify"].includes(mode)) {
    throw new SlideWorkflowError(usage(), "INVALID_ARGS");
  }

  const currentTarget = target ? null : readCurrentWorkflowTarget();
  const targetInfo = resolveDeckTarget(target ?? currentTarget?.target ?? inferTargetFromNewestReport(mode));
  const requested = readRequestedDeliverables(targetInfo);
  const shouldVerifyArtifacts = mode === "work"
    ? verifyWorkReport(targetInfo, requested)
    : verifyReviewReport(targetInfo, requested);
  if (!shouldVerifyArtifacts) {
    console.log(`delivery artifact verification skipped for non-successful ${mode} report: ${targetInfo.target}`);
    return;
  }

  const artifacts = listOfficialArtifacts(targetInfo);
  assertRequestedArtifacts(targetInfo, requested, artifacts);
  assertNoUnrequestedArtifacts(requested, artifacts);
  console.log(`delivery artifacts verified: ${targetInfo.target}`);
}

function readCurrentWorkflowTarget() {
  const markerPath = path.join(process.cwd(), ".takt", "workflow-current-target.json");
  if (!existsSync(markerPath)) return null;
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.command !== "deliver") return null;
  assert(typeof marker.target === "string" && marker.target, "current workflow target missing");
  return marker;
}

function inferTargetFromNewestReport(mode) {
  const reportName = mode === "work" ? "deliver-work.md" : "deliver-verify.md";
  const slidesRoot = path.join(process.cwd(), "slides");
  const candidates = readdirSync(slidesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(slidesRoot, entry.name, "review", reportName))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => Object.freeze({ reportPath, mtimeMs: statSync(reportPath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (candidates.length === 0) {
    throw new SlideWorkflowError(`No ${reportName} found under slides/*/review`, "DELIVERY_REPORT_MISSING");
  }
  const deck = path.basename(path.dirname(path.dirname(candidates[0].reportPath)));
  return `slides/${deck}`;
}

function readRequestedDeliverables(targetInfo) {
  const plan = readText(path.join(targetInfo.deckPath, "plan.md"));
  const match = plan.match(/deliverables\s*:\s*\[([^\]]*)\]/i);
  assert(match, "plan.md deliverables field missing");
  const requested = match[1]
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
    .filter(Boolean);
  for (const item of requested) {
    assert(EXPECTED_ARTIFACTS[item], `unsupported deliverable ${item}`);
  }
  return Object.freeze(requested);
}

function listOfficialArtifacts(targetInfo) {
  const distPath = path.join(process.cwd(), "dist", targetInfo.deckName);
  assert(existsSync(distPath), "dist/<deck> missing");
  return Object.freeze(
    readdirSync(distPath, { recursive: true })
      .filter((file) => statSync(path.join(distPath, file)).isFile())
      .map((file) => String(file).split(path.sep).join("/"))
      .filter((file) => /\.(html|pdf|pptx)$/.test(file)),
  );
}

function assertRequestedArtifacts(targetInfo, requested, artifacts) {
  const distPath = path.join(process.cwd(), "dist", targetInfo.deckName);
  for (const item of requested) {
    const file = EXPECTED_ARTIFACTS[item];
    assert(artifacts.includes(file), `requested artifact missing: ${file}`);
    const stat = statSync(path.join(distPath, file));
    assert(stat.size > 0, `empty artifact: ${file}`);
  }
}

function assertNoUnrequestedArtifacts(requested, artifacts) {
  for (const file of artifacts) {
    const kind = Object.keys(EXPECTED_ARTIFACTS).find((key) => EXPECTED_ARTIFACTS[key] === file);
    assert(kind && requested.includes(kind), `stale or unrequested official artifact exists: ${file}`);
  }
}

function verifyWorkReport(targetInfo, requested) {
  const work = readText(path.join(targetInfo.reviewPath, "deliver-work.md"));
  const result = matchReportResult(work, ["passed", "needs_input", "failed"], "deliver-work.md");
  if (result !== "passed") return false;

  const cleaned = work.match(/Cleaned directory:\s*(.+)/i);
  assert(
    cleaned && cleaned[1].trim() && !/^\s*(?:no|false|not cleaned\b.*|not_cleaned\b.*|uncleaned\b.*)\s*$/i.test(cleaned[1]),
    "deliver-work.md missing positive cleaned directory evidence",
  );
  assertReportReferences(work, requested, "deliver-work.md");
  return true;
}

function verifyReviewReport(targetInfo, requested) {
  const verify = readText(path.join(targetInfo.reviewPath, "deliver-verify.md"));
  const result = matchReportResult(verify, ["approved", "needs_fix", "blocked"], "deliver-verify.md");
  if (result !== "approved") return false;

  const work = readText(path.join(targetInfo.reviewPath, "deliver-work.md"));
  assertReportReferences(work, requested, "deliver-work.md");
  assertReportReferences(verify, requested, "deliver-verify.md");
  return true;
}

function assertReportReferences(report, requested, reportName) {
  for (const item of requested) {
    const file = EXPECTED_ARTIFACTS[item];
    assert(report.includes(file), `${reportName} missing artifact reference: ${file}`);
  }
}

function matchReportResult(report, values, reportName) {
  const pattern = values.join("|");
  const result = report.match(new RegExp(`^result:\\s*(${pattern})\\s*$`, "m")) ??
    report.match(new RegExp(`^-\\s*Result:\\s*(${pattern})\\s*$`, "im"));
  assert(result, `${reportName} result missing`);
  return result[1];
}

function readText(filePath) {
  if (!existsSync(filePath)) {
    throw new SlideWorkflowError(`Missing file: ${path.relative(process.cwd(), filePath)}`, "FILE_MISSING");
  }
  return readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new SlideWorkflowError(message, "DELIVERY_ARTIFACT_INVALID");
  }
}

try {
  main();
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}
