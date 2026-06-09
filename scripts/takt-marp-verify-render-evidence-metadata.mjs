#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  formatError,
  parseArgs,
  resolveDeckTarget,
  SlideWorkflowError,
} from "./lib/takt-marp-slide-workflow.mjs";

function usage() {
  return [
    "Usage: node scripts/takt-marp-verify-render-evidence-metadata.mjs [target] [--cycle <n>]",
    "",
    "When target is omitted, .takt/render/latest-render-evidence.json is used.",
    "",
    "Examples:",
    "  node scripts/takt-marp-verify-render-evidence-metadata.mjs",
    "  node scripts/takt-marp-verify-render-evidence-metadata.mjs slides/my-talk --cycle 1",
  ].join("\n");
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }

  const currentTarget = positional[0] ? null : readCurrentWorkflowTarget();
  const marker = positional[0] ? null : readLatestMarker();
  if (currentTarget) {
    assert(marker.target === currentTarget.target, `latest render evidence target mismatch: ${marker.target}`);
  }
  const targetInfo = resolveDeckTarget(positional[0] ?? currentTarget?.target ?? marker.target);
  const cycle = Number(flags.cycle ?? marker?.cycle ?? 1);
  if (!Number.isInteger(cycle) || cycle < 1) {
    throw new SlideWorkflowError(`Invalid cycle '${flags.cycle}'. Expected positive integer.`, "INVALID_ARGS");
  }

  const root = path.join(process.cwd(), ".takt", "render", targetInfo.deckName, `cycle-${cycle}`);
  const metadataPath = path.join(root, "metadata.json");
  const data = readJson(metadataPath);

  assert(data.target === targetInfo.target, `metadata target mismatch: ${data.target}`);
  assert(data.cycle === cycle, `metadata cycle mismatch: ${data.cycle}`);
  assertUsableStatus("html_png", data.html_png);
  assertArrayFiles(root, "html_png", data.html_png.files);
  assertUsableStatus("pdf", data.pdf);
  assertFile(root, "pdf", data.pdf.file);

  if (assertReasonedNonUsable("pdf_raster", data.pdf_raster)) {
    assertArrayFiles(root, "pdf_raster", data.pdf_raster.files);
  }

  console.log(`render evidence metadata verified: ${path.relative(process.cwd(), metadataPath)}`);
}

function readLatestMarker() {
  const markerPath = path.join(process.cwd(), ".takt", "render", "latest-render-evidence.json");
  const marker = readJson(markerPath);
  assert(typeof marker.target === "string" && marker.target, "latest render evidence marker target missing");
  assert(Number.isInteger(marker.cycle), "latest render evidence marker cycle missing");
  return marker;
}

function readCurrentWorkflowTarget() {
  const markerPath = path.join(process.cwd(), ".takt", "workflow-current-target.json");
  if (!existsSync(markerPath)) return null;
  const marker = readJson(markerPath);
  if (marker.command !== "polish") return null;
  assert(typeof marker.target === "string" && marker.target, "current workflow target missing");
  return marker;
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    throw new SlideWorkflowError(`Missing file: ${path.relative(process.cwd(), filePath)}`, "FILE_MISSING");
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function assertUsableStatus(key, item) {
  assert(item && typeof item.status === "string", `${key} status missing`);
  assert(!["pending", "failed", "degraded", "skipped"].includes(item.status), `${key} status not usable: ${item.status}`);
}

function assertReasonedNonUsable(key, item) {
  assert(item && typeof item.status === "string", `${key} status missing`);
  assert(!["pending", "failed"].includes(item.status), `${key} status not usable: ${item.status}`);
  if (["degraded", "skipped"].includes(item.status)) {
    assert(typeof item.reason === "string" && item.reason.trim(), `${key} reason missing for ${item.status}`);
    return false;
  }
  return true;
}

function assertArrayFiles(root, key, files) {
  assert(Array.isArray(files) && files.length > 0, `${key} files missing`);
  files.forEach((file, index) => assertFile(root, `${key}[${index}]`, file));
}

function assertFile(root, label, value) {
  assert(typeof value === "string" && value.trim(), `${label} path missing`);
  const filePath = resolveEvidenceFile(root, value);
  assert(existsSync(filePath), `${label} file missing: ${value}`);
  const stat = statSync(filePath);
  assert(stat.isFile() && stat.size > 0, `${label} file missing or empty: ${value}`);
}

function resolveEvidenceFile(root, value) {
  if (path.isAbsolute(value)) {
    return value;
  }
  const rootRelativePath = path.join(root, value);
  if (existsSync(rootRelativePath)) {
    return rootRelativePath;
  }
  return path.join(process.cwd(), value);
}

function assert(condition, message) {
  if (!condition) {
    throw new SlideWorkflowError(message, "RENDER_EVIDENCE_INVALID");
  }
}

try {
  main();
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}
