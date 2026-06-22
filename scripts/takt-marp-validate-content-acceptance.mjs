#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeClaudeDesignSmokeFixture } from "./lib/takt-marp-claude-design-fixtures.mjs";
import {
  cleanGeneratedOutputs,
  formatError,
  parseArgs,
  resolveDeckTarget,
  SlideWorkflowError,
} from "./lib/takt-marp-slide-workflow.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPT_DIR);
const FIXTURE_PATH = path.join(ROOT, "fixtures", "marp-slide-workflow", "_content-acceptance-ddd-slice");
const DEFAULT_TARGET = "slides/_content-acceptance-ddd-slice";
const MAX_ACCEPTANCE_DURATION_MS = 10 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const CAPTURE_MAX_BUFFER = 20 * 1024 * 1024;
const BUILD_SCRIPT = path.join(ROOT, "scripts", "takt-marp-build-slide-artifact.mjs");
const SOURCE_FIXTURE_EXCLUDES = new Set([".DS_Store"]);

async function main() {
  const startedAt = Date.now();
  const options = parseOptions(process.argv.slice(2));
  const checks = [];
  const commands = [];
  const observedPaths = [];
  const failures = [];
  let targetInfo;
  let currentCheckName = "content-acceptance:setup";

  try {
    targetInfo = await setupContentAcceptanceDeck(options.target);
    observedPaths.push(
      relativePath(path.join(targetInfo.deckPath, "brief.md")),
      relativePath(path.join(targetInfo.deckPath, "SLIDES.md")),
      relativePath(path.join(targetInfo.deckPath, "design", "design-brief.md")),
      relativePath(path.join(targetInfo.deckPath, "design", "Claude Design Smoke.zip")),
    );
    checks.push(pass("setup:fixture-to-target", "DDD content acceptance fixture copied into a clean target deck."));
    checks.push(pass("setup:scope-boundary", "Content acceptance uses a dedicated target and does not reuse slides/_workflow-smoke."));

    currentCheckName = "content-acceptance:source-contract";
    const sourceChecks = await assertContentSourceContracts(targetInfo);
    checks.push(...sourceChecks.checks);
    observedPaths.push(...sourceChecks.observedPaths);

    currentCheckName = "content-acceptance:no-copy-before-build";
    const templateSnapshot = await snapshotTemplateAssets(ROOT);

    currentCheckName = "content-acceptance:build-html";
    const htmlCommand = runBuild("html", targetInfo);
    commands.push(htmlCommand.commandLine);
    observedPaths.push(...(await assertHtmlArtifact(targetInfo)).observedPaths);
    checks.push(pass("build:html", "HTML artifact was generated from the content acceptance SLIDES.md."));

    currentCheckName = "content-acceptance:build-pdf";
    const pdfCommand = runBuild("pdf", targetInfo);
    commands.push(pdfCommand.commandLine);
    const pdfResult = await assertPdfArtifact(targetInfo);
    observedPaths.push(...pdfResult.observedPaths);
    checks.push(pass("build:pdf", pdfResult.reason));

    currentCheckName = "content-acceptance:no-copy-after-build";
    await assertTemplateAssetsUnchanged(ROOT, templateSnapshot);
    checks.push(pass("no-copy:template-assets", "Content acceptance did not create or mutate workflow/facet template assets."));

    const elapsedMs = Date.now() - startedAt;
    assert(
      elapsedMs <= MAX_ACCEPTANCE_DURATION_MS,
      `content-acceptance:duration exceeded 10 minute budget: ${elapsedMs}ms`,
    );
    checks.push(pass("duration:under-10-minutes", `Deterministic content acceptance finished in ${elapsedMs}ms.`));
  } catch (error) {
    const reason = formatError(error);
    failures.push(reason);
    checks.push(fail(currentCheckName, reason));
  }

  if (targetInfo) {
    const summaryPath = path.join(targetInfo.reviewPath, "content-acceptance-summary.md");
    observedPaths.push(relativePath(summaryPath));
    await writeSummary(summaryPath, {
      targetInfo,
      result: failures.length === 0 ? "passed" : "failed",
      commands,
      checks,
      observedPaths,
      failures,
      elapsedMs: Date.now() - startedAt,
    });
    console.log(`Content acceptance summary: ${relativePath(summaryPath)}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }
}

function parseOptions(argv) {
  const { positional, flags } = parseArgs(argv);
  if (flags.help || flags.h) {
    console.log(usage());
    process.exit(0);
  }
  if (positional.length > 1) {
    throw new SlideWorkflowError(usage(), "INVALID_ARGS");
  }
  const target = positional[0] ?? flags.target ?? DEFAULT_TARGET;
  if (target !== DEFAULT_TARGET) {
    throw new SlideWorkflowError(
      `Content acceptance target is fixed to ${DEFAULT_TARGET}; got ${target}.`,
      "INVALID_TARGET",
    );
  }
  return Object.freeze({ target });
}

function usage() {
  return [
    "Usage: node scripts/takt-marp-validate-content-acceptance.mjs [slides/_content-acceptance-ddd-slice]",
    "",
    "Runs deterministic DDD lecture content acceptance from a precomputed fixture.",
    "This is not workflow smoke validation and does not use a real provider.",
  ].join("\n");
}

async function setupContentAcceptanceDeck(target) {
  if (!existsSync(FIXTURE_PATH)) {
    throw new SlideWorkflowError(`Content acceptance fixture not found: ${relativePath(FIXTURE_PATH)}`, "FIXTURE_MISSING");
  }

  const targetPath = path.join(ROOT, target);
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(targetPath, { recursive: true });
  await copyFixtureSources(FIXTURE_PATH, targetPath);

  const targetInfo = resolveDeckTarget(target, { root: ROOT });
  await writeClaudeDesignSmokeFixture(targetInfo, { root: ROOT, writeDesignBrief: false });
  await cleanGeneratedOutputs(targetInfo, { root: ROOT });
  await mkdir(targetInfo.reviewPath, { recursive: true });
  return targetInfo;
}

async function copyFixtureSources(sourceRoot, destinationRoot) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (SOURCE_FIXTURE_EXCLUDES.has(entry.name)) continue;
    await cp(path.join(sourceRoot, entry.name), path.join(destinationRoot, entry.name), { recursive: true });
  }
  for (const required of ["README.md", "brief.md", "SLIDES.md", "design/design-brief.md"]) {
    const filePath = path.join(destinationRoot, required);
    if (!existsSync(filePath)) {
      throw new SlideWorkflowError(`Content acceptance fixture must provide ${required}: ${relativePath(filePath)}`, "FIXTURE_INVALID");
    }
  }
}

async function assertContentSourceContracts(targetInfo) {
  const checks = [];
  const observedPaths = [];
  const briefPath = path.join(targetInfo.deckPath, "brief.md");
  const slidesPath = path.join(targetInfo.deckPath, "SLIDES.md");
  const designBriefPath = path.join(targetInfo.deckPath, "design", "design-brief.md");
  const designZipPath = path.join(targetInfo.deckPath, "design", "Claude Design Smoke.zip");
  const brief = await readFile(briefPath, "utf8");
  const slides = await readFile(slidesPath, "utf8");
  const designBrief = await readFile(designBriefPath, "utf8");

  for (const phrase of [
    "DDD講義",
    "precomputed `SLIDES.md`",
    "Target slide count: 9",
    "10 minutes以内",
    "real provider は使わない",
    "備品購入申請・承認",
  ]) {
    assert(brief.includes(phrase), `source:brief-contract missing '${phrase}' in ${relativePath(briefPath)}`);
  }
  checks.push(pass("source:brief-contract", "Brief declares deterministic DDD content acceptance scope and 10 minute budget."));

  for (const phrase of [
    "content-acceptance: ddd-slice",
    "ドメイン駆動設計",
    "備品購入申請・承認",
    "Value Object",
    "Aggregate",
    "Domain Event",
    "Java Before / After",
    "Exercise",
    "演習",
    "模範回答",
    "Appendix",
    "Speaker note intent",
    "このPDFは `_workflow-smoke` の結果ではない",
  ]) {
    assert(slides.includes(phrase), `source:slides-content missing '${phrase}' in ${relativePath(slidesPath)}`);
  }
  checks.push(pass("source:ddd-content-markers", "SLIDES.md contains DDD topic, common example, code, exercise, answer, diagram, and appendix markers."));

  for (const token of ["--accent: #b0241d;", "--bg-page: #faf7f1;", "--font-body: 'Noto Sans JP', sans-serif;", "--space-4: 16px;", "--radius-md: 6px;"]) {
    assert(slides.includes(token), `source:design-token-usage missing '${token}' in ${relativePath(slidesPath)}`);
  }
  for (const usage of ["var(--accent)", "var(--bg-page)", "var(--font-body)", "var(--space-4)", "var(--radius-md)"]) {
    assert(slides.includes(usage), `source:design-token-usage missing '${usage}' in ${relativePath(slidesPath)}`);
  }
  assert(existsSync(designZipPath), `source:design-source missing Claude Design zip: ${relativePath(designZipPath)}`);
  assert(designBrief.includes("Domain-Driven Design training deck"), "source:design-brief-contract must be DDD-specific");
  checks.push(pass("source:design-contract-reflection", "SLIDES.md uses Claude Design fixture tokens and keeps a DDD-specific design brief."));

  const slideCount = countMarpSlides(slides);
  assert(slideCount === 9, `source:slide-count expected 9 slides, got ${slideCount}`);
  checks.push(pass("source:slide-count", "Precomputed DDD content acceptance slice contains 9 slides."));

  observedPaths.push(relativePath(briefPath), relativePath(slidesPath), relativePath(designBriefPath), relativePath(designZipPath));
  return Object.freeze({ checks: Object.freeze(checks), observedPaths: Object.freeze(observedPaths) });
}

function countMarpSlides(source) {
  const separatorCount = (source.match(/^---$/gm) ?? []).length;
  return Math.max(0, separatorCount - 1);
}

function runBuild(kind, targetInfo) {
  const commandLine = `node scripts/takt-marp-build-slide-artifact.mjs ${kind} ${targetInfo.target}`;
  const result = spawnSync(process.execPath, [BUILD_SCRIPT, kind, targetInfo.target], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status === 0, `${commandLine} failed: ${output}`);
  return Object.freeze({ commandLine, output });
}

async function assertHtmlArtifact(targetInfo) {
  const htmlPath = path.join(ROOT, "dist", targetInfo.deckName, "SLIDES.html");
  await assertReadableFile(htmlPath, "build:html");
  const html = await readFile(htmlPath, "utf8");
  for (const phrase of ["ドメイン駆動設計", "備品購入申請", "Java Before", "Appendix"]) {
    assert(html.includes(phrase), `build:html generated HTML missing '${phrase}'`);
  }
  return Object.freeze({ observedPaths: Object.freeze([relativePath(htmlPath)]) });
}

async function assertPdfArtifact(targetInfo) {
  const pdfPath = path.join(ROOT, "dist", targetInfo.deckName, "SLIDES.pdf");
  await assertReadableFile(pdfPath, "build:pdf");
  const pdfStats = await stat(pdfPath);
  assert(pdfStats.size > 30_000, `build:pdf PDF is unexpectedly small (${pdfStats.size} bytes): ${relativePath(pdfPath)}`);
  const pdfHeader = (await readFile(pdfPath)).subarray(0, 4).toString("ascii");
  assert(pdfHeader === "%PDF", `build:pdf output does not look like a PDF: ${relativePath(pdfPath)}`);

  const textCheck = runOptionalPdfTextCheck(pdfPath);
  return Object.freeze({
    observedPaths: Object.freeze([relativePath(pdfPath)]),
    reason: textCheck,
  });
}

function runOptionalPdfTextCheck(pdfPath) {
  const pdftotext = spawnSync("which", ["pdftotext"], { encoding: "utf8" });
  if (pdftotext.status !== 0) {
    return "PDF artifact was generated and readable; pdftotext is unavailable so text extraction was recorded as degraded.";
  }
  const result = spawnSync("pdftotext", [pdfPath, "-"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: CAPTURE_MAX_BUFFER,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status === 0, `build:pdf pdftotext failed: ${output}`);
  for (const phrase of ["ドメイン駆動設計", "備品購入申請", "Value Object", "Appendix"]) {
    assert(output.includes(phrase), `build:pdf text extraction missing '${phrase}'`);
  }
  return "PDF artifact was generated, readable, and pdftotext found DDD content markers.";
}

async function assertReadableFile(filePath, checkName) {
  const fileStats = await stat(filePath).catch((error) => {
    throw new SlideWorkflowError(`${checkName} missing file: ${relativePath(filePath)} (${error.code ?? error.message})`, "FILE_MISSING");
  });
  assert(fileStats.isFile(), `${checkName} expected file: ${relativePath(filePath)}`);
  assert(fileStats.size > 0, `${checkName} expected non-empty file: ${relativePath(filePath)}`);
}

async function snapshotTemplateAssets(root) {
  const entries = {};
  for (const relativeRoot of [".takt/workflows", ".takt/facets"]) {
    const absoluteRoot = path.join(root, relativeRoot);
    if (!existsSync(absoluteRoot)) {
      entries[relativeRoot] = null;
      continue;
    }
    entries[relativeRoot] = await hashDirectory(absoluteRoot, root);
  }
  return Object.freeze(entries);
}

async function assertTemplateAssetsUnchanged(root, before) {
  const after = await snapshotTemplateAssets(root);
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    `no-copy:template-assets changed. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
}

async function hashDirectory(directoryPath, root) {
  const result = {};
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, await hashDirectory(absolutePath, root));
    } else if (entry.isFile()) {
      result[relativePath(absolutePath, root)] = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
    }
  }
  return result;
}

async function writeSummary(summaryPath, data) {
  const slidesPath = path.join(data.targetInfo.deckPath, "SLIDES.md");
  const htmlPath = path.join(ROOT, "dist", data.targetInfo.deckName, "SLIDES.html");
  const pdfPath = path.join(ROOT, "dist", data.targetInfo.deckName, "SLIDES.pdf");
  const lines = [
    "---",
    `target: ${data.targetInfo.target}`,
    "acceptance_kind: ddd-content-slice",
    "provider: deterministic-precomputed-source",
    "real_provider: n/a",
    "workflow_smoke: false",
    "full_deck_generated: false",
    `slides_source: ${relativePath(slidesPath)}`,
    `html_output: ${relativePath(htmlPath)}`,
    `pdf_output: ${relativePath(pdfPath)}`,
    `duration_budget_ms: ${MAX_ACCEPTANCE_DURATION_MS}`,
    `elapsed_ms: ${data.elapsedMs}`,
    `generated_at: ${new Date().toISOString()}`,
    `result: ${data.result}`,
    `commands_run: [${data.commands.map((command) => JSON.stringify(command)).join(", ")}]`,
    `failed_checks: [${data.checks.filter((check) => check.status === "FAIL").map((check) => JSON.stringify(check.name)).join(", ")}]`,
    "---",
    "",
    "# DDD Content Acceptance Summary",
    "",
    "## Scope Boundary",
    "",
    "- This is deterministic content acceptance evidence for a DDD lecture slice.",
    "- This is not workflow smoke validation and does not use `slides/_workflow-smoke`.",
    "- Full 100-140 slide lecture generation and real provider execution are intentionally out of scope.",
    "",
    "## Artifact Origin",
    "",
    `- Input SLIDES.md: ${relativePath(slidesPath)}`,
    `- HTML output: ${relativePath(htmlPath)}`,
    `- PDF output: ${relativePath(pdfPath)}`,
    "- Build command: `node scripts/takt-marp-build-slide-artifact.mjs <html|pdf> slides/_content-acceptance-ddd-slice`",
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
  ];
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, lines.join("\n"), "utf8");
}

function pass(name, reason) {
  return Object.freeze({ name, status: "PASS", reason });
}

function fail(name, reason) {
  return Object.freeze({ name, status: "FAIL", reason });
}

function assert(condition, message) {
  if (!condition) {
    throw new SlideWorkflowError(message, "CONTENT_ACCEPTANCE_FAILED");
  }
}

function relativePath(filePath, root = ROOT) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function listLines(items) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"];
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
