#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  packageScriptPath,
  resolveRuntimeContext,
  runtimeExecutablePath,
} from "./lib/takt-marp-runtime-context.mjs";
import { ejectProject } from "./lib/takt-marp-project-eject.mjs";
import {
  assertNoProhibitedEntries,
  diffTemplateTrees,
  formatTemplateDrift,
  listTemplateEntries,
  prepareBundledWorkflowRuntime,
  researchReuseWorkflowFilePath,
  resolveTemplateSource,
  workflowFilePath,
} from "./lib/takt-marp-project-templates.mjs";
import {
  archiveCommandArtifacts,
  APPROVAL_COMMANDS,
  approvalPath,
  assertCommandPrerequisites,
  assertTaktExecutableAvailable,
  assertWorkflowAvailable,
  checkRequiredState,
  cleanGeneratedOutputs,
  COMMANDS,
  COMMAND_STATES,
  commandSupervisionResult,
  configFor,
  downstreamCommands,
  formatError,
  isSuccessfulCommandState,
  parseFrontMatter,
  parseRequiredState,
  readSupervision,
  researchArtifactPaths,
  researchBriefSha256,
  researchReuseSidecarPath,
  requireCommand,
  resolveResearchReuseCandidate,
  resolveDeckTarget,
  shouldCleanGeneratedOutputsOnForce,
  supervisionPath,
  writeResearchReuseSidecar,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";
import { runCli } from "./lib/takt-marp-cli.mjs";
import { writeClaudeDesignSmokeFixture } from "./lib/takt-marp-claude-design-source.mjs";
import {
  FORBIDDEN_PACK_FILES,
  REQUIRED_PACK_FILES,
  checkPackContents,
} from "./takt-marp-validate-package-boundary.mjs";

const checks = [];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);
const BIN_ENTRY_SCRIPT = path.join(ROOT_DIR, "bin", "takt-marp.mjs");
const RUNNER_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-run-slide-workflow.mjs");
const VERIFY_DELIVERY_SCRIPT = path.join(SCRIPT_DIR, "takt-marp-verify-delivery-artifacts.mjs");
const RESEARCH_WORKFLOW_RELATIVE_PATH = ".takt/workflows/takt-marp-slide-research.yaml";
const RESEARCH_REUSE_WORKFLOW_RELATIVE_PATH = ".takt/workflows/takt-marp-slide-research-reuse.yaml";
const RESEARCH_WRAPPER_STEP_NAMES = Object.freeze(["deep_research", "adapt_research", "supervise_research"]);
const RESEARCH_REUSE_STEP_NAMES = Object.freeze(["adapt_research", "supervise_research"]);
const RESEARCH_ADAPTER_INSTRUCTION = Object.freeze({
  name: "takt-marp-adapt-research",
  relativePath: ".takt/facets/instructions/takt-marp-adapt-research.md",
});
const RESEARCH_ADAPTER_OUTPUT_CONTRACTS = Object.freeze([
  {
    artifactName: "research-sources.md",
    format: "takt-marp-research-sources",
    relativePath: ".takt/facets/output-contracts/takt-marp-research-sources.md",
    requiredFields: ["source_id", "title", "url", "retrieved_at", "source_type", "confidence"],
  },
  {
    artifactName: "research-claims.md",
    format: "takt-marp-research-claims",
    relativePath: ".takt/facets/output-contracts/takt-marp-research-claims.md",
    requiredFields: ["claim_id", "claim", "confidence", "source_ids", "slide_use", "caveats"],
  },
  {
    artifactName: "open-questions.md",
    format: "takt-marp-open-questions",
    relativePath: ".takt/facets/output-contracts/takt-marp-open-questions.md",
    requiredFields: ["question_id", "question", "why_it_matters", "suggested_next_step"],
  },
]);
const RESEARCH_SUPERVISION_INSTRUCTION = Object.freeze({
  name: "takt-marp-supervise-research",
  relativePath: ".takt/facets/instructions/takt-marp-supervise-research.md",
});
const RESEARCH_REUSE_SUPERVISION_INSTRUCTION = Object.freeze({
  name: "takt-marp-supervise-research-reuse",
  relativePath: ".takt/facets/instructions/takt-marp-supervise-research-reuse.md",
});
const RESEARCH_SUPERVISION_OUTPUT_CONTRACT = Object.freeze({
  artifactName: "research-supervision.md",
  format: "takt-marp-research-supervision",
  relativePath: ".takt/facets/output-contracts/takt-marp-research-supervision.md",
  requiredFields: [
    "command: research",
    "target: slides/<deck>",
    "generated_at",
    "workflow_run_id",
    "step: supervision",
    "cycle",
    "state: researched",
    "result: passed | rejected",
    "blocking_findings",
    "major_findings",
    "minor_findings",
    "info_findings",
  ],
});
const RESEARCH_ADAPTER_FORBIDDEN_BOUNDARY_TERMS = Object.freeze([
  "web fetch",
  "additional research",
  "source re-evaluation",
  "invented claims",
]);
const BUILTIN_RESEARCH_FACET_IDENTIFIERS = Object.freeze([
  "research-planner",
  "research-digger",
  "research-analyzer",
  "research-supervisor",
  "research-plan",
  "research-dig",
  "research-analyze",
  "research-supervise",
]);
const BUILTIN_RESEARCH_FACET_RELATIVE_PATHS = Object.freeze([
  "instructions/research-plan.md",
  "instructions/research-dig.md",
  "instructions/research-analyze.md",
  "instructions/research-supervise.md",
  "knowledge/research.md",
  "knowledge/research-comparative.md",
  "output-contracts/research-report.md",
  "personas/research-planner.md",
  "personas/research-digger.md",
  "personas/research-analyzer.md",
  "personas/research-supervisor.md",
  "policies/research.md",
]);
const BUILTIN_RESEARCH_OUTPUT_CONTRACT_FILES = Object.freeze(["research-report.md"]);
const RESEARCH_TEMPLATE_RELATIVE_PATHS = Object.freeze([
  "workflows/takt-marp-slide-research.yaml",
  "workflows/takt-marp-slide-research-reuse.yaml",
  "facets/instructions/takt-marp-adapt-research.md",
  "facets/instructions/takt-marp-supervise-research.md",
  "facets/instructions/takt-marp-supervise-research-reuse.md",
  "facets/output-contracts/takt-marp-research-sources.md",
  "facets/output-contracts/takt-marp-research-claims.md",
  "facets/output-contracts/takt-marp-open-questions.md",
  "facets/output-contracts/takt-marp-research-supervision.md",
]);

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

  await check("shared error boundary formats major codes and isolates template imports", async () => {
    const errorModulePath = path.join(SCRIPT_DIR, "lib", "takt-marp-errors.mjs");
    const slideWorkflowPath = path.join(SCRIPT_DIR, "lib", "takt-marp-slide-workflow.mjs");
    const templateModulePaths = [
      path.join(SCRIPT_DIR, "lib", "takt-marp-project-eject.mjs"),
      path.join(SCRIPT_DIR, "lib", "takt-marp-project-templates.mjs"),
    ];

    const templateImports = [];
    for (const modulePath of templateModulePaths) {
      const source = await readFile(modulePath, "utf8");
      if (source.includes("./takt-marp-slide-workflow.mjs")) {
        templateImports.push(path.relative(ROOT_DIR, modulePath));
      }
    }
    assert(
      templateImports.length === 0,
      `template modules must import errors from takt-marp-errors.mjs, not takt-marp-slide-workflow.mjs: ${templateImports.join(", ")}`,
    );
    assert(existsSync(errorModulePath), `shared error module missing: ${path.relative(ROOT_DIR, errorModulePath)}`);

    const [errorModule, errorSource, slideWorkflowSource] = await Promise.all([
      import("./lib/takt-marp-errors.mjs"),
      readFile(errorModulePath, "utf8"),
      readFile(slideWorkflowPath, "utf8"),
    ]);
    assert(
      !/from\s+["']\.\/takt-marp-|import\(\s*["']\.\/takt-marp-/.test(errorSource),
      "takt-marp-errors.mjs must remain a leaf module",
    );
    assert(
      slideWorkflowSource.includes("from \"./takt-marp-errors.mjs\""),
      "slide workflow must import the shared error boundary",
    );

    const cases = [
      ["COMMAND_REMOVED", "`init` has been removed. Use `takt-marp eject .` to copy template assets."],
      ["PROJECT_TEMPLATE_STATE_INVALID", "Project has partial template state: .takt/workflows exists without .takt/facets."],
      ["EJECT_CONFLICT", "Eject conflict: existing template files would be overwritten."],
      ["INVALID_TARGET", "Invalid target 'deck'. Expected target: slides/<deck>"],
      ["WORKFLOW_NOT_IMPLEMENTED", "Workflow YAML is not implemented: .takt/workflows/takt-marp-slide-plan.yaml."],
    ];
    for (const [code, message] of cases) {
      const error = new errorModule.SlideWorkflowError(message, code);
      assert(error.name === "SlideWorkflowError", `${code} has unexpected error name: ${error.name}`);
      assert(error.code === code, `${code} was not stored on the error`);
      assert(errorModule.formatError(error) === `${code}: ${message}`, `${code} formatted unexpectedly: ${errorModule.formatError(error)}`);
    }
  });

  await check("Claude Design zip reader rejects traversal and exposes safe entries", async () => {
    const { ZipArchiveReader, createZipArchiveBuffer } = await import("./lib/takt-marp-zip-archive.mjs");
    const archive = await ZipArchiveReader.fromBuffer(createZipArchiveBuffer({
      "tokens/colors.css": ":root { --accent: #b0241d; }\n",
      "nested/readme.txt": "safe\n",
    }));
    assert(
      JSON.stringify(archive.entryNames()) === JSON.stringify(["nested/readme.txt", "tokens/colors.css"]),
      `zip entry list was not deterministic: ${archive.entryNames().join(", ")}`,
    );
    assert((await archive.readText("tokens/colors.css")).includes("--accent"), "zip text entry read failed");
    const dotPrefixedArchive = await ZipArchiveReader.fromBuffer(createZipArchiveBuffer({
      "./tokens/colors.css": ":root { --accent: #b0241d; }\n",
      "./nested/readme.txt": "safe\n",
    }));
    assert(
      JSON.stringify(dotPrefixedArchive.entryNames()) === JSON.stringify(["nested/readme.txt", "tokens/colors.css"]),
      `dot-prefixed zip entry list was not normalized: ${dotPrefixedArchive.entryNames().join(", ")}`,
    );
    assert(dotPrefixedArchive.hasEntry("tokens/colors.css"), "dot-prefixed zip entry was not addressable without ./ prefix");

    let caught;
    try {
      await ZipArchiveReader.fromBuffer(createZipArchiveBuffer({ "../escape.txt": "bad\n" }));
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "ZIP_ENTRY_PATH_INVALID", `expected ZIP_ENTRY_PATH_INVALID, got ${caught?.code ?? "success"}`);

    await expectFailure(
      () => ZipArchiveReader.fromBuffer(createZipArchiveBuffer({
        "a.txt": "a\n",
        "b.txt": "b\n",
      }), { limits: { maxEntries: 1 } }),
      "ZIP_ARCHIVE_LIMIT_EXCEEDED",
    );
    await expectFailure(
      () => ZipArchiveReader.fromBuffer(createZipArchiveBuffer({ "large.txt": "1234\n" }), { limits: { maxTotalUncompressedBytes: 4 } }),
      "ZIP_ARCHIVE_LIMIT_EXCEEDED",
    );
    await expectFailure(
      () => ZipArchiveReader.fromBuffer(createZipArchiveBuffer({ "archive.txt": "ok\n" }), { limits: { maxArchiveBytes: 1 } }),
      "ZIP_ARCHIVE_LIMIT_EXCEEDED",
    );
  });

  await check("Claude Design fixture imports into a deterministic Resolved Design Contract", async () => {
    const {
      buildClaudeDesignSmokeFixtureZipBuffer,
      importClaudeDesignSourceBuffer,
      importClaudeDesignSourceArchive,
    } = await import("./lib/takt-marp-claude-design-source.mjs");
    const { ZipArchiveReader, createZipArchiveBuffer } = await import("./lib/takt-marp-zip-archive.mjs");
    const sourcePath = path.join(ROOT_DIR, "slides", "demo", "design", "Claude Design Smoke.zip");
    const first = await importClaudeDesignSourceBuffer(buildClaudeDesignSmokeFixtureZipBuffer(), { sourcePath, root: ROOT_DIR, deckName: "demo" });
    const second = await importClaudeDesignSourceBuffer(buildClaudeDesignSmokeFixtureZipBuffer(), { sourcePath, root: ROOT_DIR, deckName: "demo" });

    assert(first.source.kind === "claude-design-zip", `unexpected design source kind: ${first.source.kind}`);
    assert(first.source.path === "slides/demo/design/Claude Design Smoke.zip", `source path must be project-relative: ${first.source.path}`);
    assert(first.source.namespace === "ClaudeDesignSmoke", `namespace mismatch: ${first.source.namespace}`);
    assert(first.token_counts.color >= 2, `color token count too small: ${JSON.stringify(first.token_counts)}`);
    assert(first.token_counts.typography >= 2, `typography token count too small: ${JSON.stringify(first.token_counts)}`);
    assert(first.token_counts.spacing >= 1, `spacing token count too small: ${JSON.stringify(first.token_counts)}`);
    assert(first.adherence.available === true, "optional adherence metadata was not detected");
    assert(first.components.names.includes("Metric"), `generic component catalog was not preserved: ${JSON.stringify(first.components)}`);
    assert(first.guidance.documents.some((item) => item.path === "SKILL.md" && item.kind === "skill" && item.text.includes("Generic slide design system")), `SKILL.md guidance was not captured: ${JSON.stringify(first.guidance)}`);
    assert(first.guidance.documents.some((item) => item.path === "readme.md" && item.kind === "readme"), `readme guidance was not captured: ${JSON.stringify(first.guidance)}`);
    assert(first.guidance.component_prompts.some((item) => item.path === "components/demo/Metric.prompt.md" && item.text.includes("Metric")), `component prompt guidance was not captured: ${JSON.stringify(first.guidance)}`);
    assert(first.source_catalog.counts.components === 1, `component catalog count mismatch: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.cards.some((item) => item.path === "guidelines/overview.card.html"), `card catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.sample_slides.some((item) => item.path === "slides/cover.html"), `sample slide catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.templates.some((item) => item.entryPath === "templates/generic-deck/GenericDeck.dc.html"), `template catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.assets.some((item) => item.path === "assets/mark.svg"), `asset catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.fingerprint.contract_sha256 === second.fingerprint.contract_sha256, "contract fingerprint must be deterministic");

    const mismatchedManifest = {
      namespace: "ClaudeDesignMismatch",
      globalCssPaths: ["styles.css"],
      tokens: [{ name: "--accent", value: "#000000", kind: "color", definedIn: "tokens/colors.css" }],
    };
    await expectFailure(
      () => importClaudeDesignSourceBuffer(createZipArchiveBuffer({
        "_ds_manifest.json": `${JSON.stringify(mismatchedManifest)}\n`,
        "styles.css": "",
        "tokens/colors.css": ":root { --accent: #ffffff; }\n",
        "tokens/typography.css": "",
        "tokens/spacing.css": "",
      }), { sourcePath, root: ROOT_DIR, deckName: "demo" }),
      "CLAUDE_DESIGN_SOURCE_INVALID",
    );
    await expectFailure(
      () => importClaudeDesignSourceArchive(new ZipArchiveReader({
        "_ds_manifest.json": Buffer.from(`${JSON.stringify(mismatchedManifest)}\n`),
        "styles.css": Buffer.from(""),
        "tokens/colors.css": Buffer.from(":root { --accent: #000000; }\n"),
        "tokens/typography.css": Buffer.from(""),
        "tokens/spacing.css": Buffer.from(""),
      }), { sourcePath, root: ROOT_DIR, deckName: "demo" }),
      "CLAUDE_DESIGN_SOURCE_INVALID",
    );

    const compoundManifest = {
      namespace: "ClaudeDesignCompoundTokens",
      globalCssPaths: ["tokens/colors.css", "tokens/typography.css", "tokens/spacing.css", "styles.css"],
      brandFonts: [{ family: "Inter", status: "available" }],
      tokens: [
        { name: "--text-body", value: "16px", kind: "font", definedIn: "tokens/typography.css" },
        { name: "--button-text-size", value: "12px", kind: "spacing", definedIn: "tokens/spacing.css" },
        { name: "--bg-page", value: "#ffffff", kind: "color", definedIn: "tokens/colors.css" },
      ],
    };
    const classified = await importClaudeDesignSourceBuffer(createZipArchiveBuffer({
      "_ds_manifest.json": `${JSON.stringify(compoundManifest)}\n`,
      "styles.css": "",
      "tokens/colors.css": ":root { --bg-page: #ffffff; }\n",
      "tokens/typography.css": ":root { --text-body: 16px; }\n",
      "tokens/spacing.css": ":root { --button-text-size: 12px; }\n",
    }), { sourcePath, root: ROOT_DIR, deckName: "demo" });
    const categories = Object.fromEntries(classified.tokens.map((token) => [token.name, token.category]));
    assert(categories["--text-body"] === "typography", `typography path token misclassified: ${JSON.stringify(categories)}`);
    assert(categories["--button-text-size"] === "spacing", `spacing path token with text in name misclassified: ${JSON.stringify(categories)}`);
    assert(categories["--bg-page"] === "color", `color path token misclassified: ${JSON.stringify(categories)}`);
    assert(classified.brand_fonts.includes("Inter"), `object brandFonts family was not preserved: ${JSON.stringify(classified.brand_fonts)}`);
  });

  await check("project template copy rejects prohibited workflow/facet entries before writing", async () => {
    const prohibitedRelativePath = "workflows/config.yaml";
    const prohibitedTemplatePath = path.join(ROOT_DIR, "templates", "project", ...prohibitedRelativePath.split("/"));
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-template-prohibited-"));
    await mkdir(path.dirname(prohibitedTemplatePath), { recursive: true });
    await writeFile(prohibitedTemplatePath, "provider: should-not-copy\n", "utf8");
    try {
      const entries = await listTemplateEntries();
      assert(
        entries.every((entry) => entry.relativePath.startsWith("workflows/") || entry.relativePath.startsWith("facets/")),
        `template entries must be limited to workflows/facets: ${entries.map((entry) => entry.relativePath).join(", ")}`,
      );
      assert(
        entries.some((entry) => entry.relativePath === prohibitedRelativePath),
        `test setup did not expose prohibited template entry: ${prohibitedRelativePath}`,
      );

      let caught;
      try {
        await ejectProject({ targetDir, force: false });
      } catch (error) {
        caught = error;
      }
      assert(caught?.code === "PACKAGE_BOUNDARY_VIOLATION", `expected PACKAGE_BOUNDARY_VIOLATION, got ${caught?.code ?? "success"}`);
      assert(
        caught.message.includes(prohibitedRelativePath),
        `prohibited template error must include path ${prohibitedRelativePath}: ${caught.message}`,
      );
      assert(
        !existsSync(path.join(targetDir, ".takt", ...prohibitedRelativePath.split("/"))),
        `prohibited template entry was copied: .takt/${prohibitedRelativePath}`,
      );
    } finally {
      await rm(prohibitedTemplatePath, { force: true });
    }
  });

  await check("project ejector rejects invalid target directories", async () => {
    let caught;
    try {
      await ejectProject({ targetDir: "relative-project", force: false });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "TARGET_DIR_NOT_FOUND", `expected TARGET_DIR_NOT_FOUND for relative target, got ${caught?.code ?? "success"}`);

    const root = await mkdtemp(path.join(os.tmpdir(), "project-eject-missing-parent-"));
    const missingTarget = path.join(root, "missing");
    caught = undefined;
    try {
      await ejectProject({ targetDir: missingTarget, force: false });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "TARGET_DIR_NOT_FOUND", `expected TARGET_DIR_NOT_FOUND, got ${caught?.code ?? "success"}`);
    assert(!existsSync(missingTarget), "eject created a missing target directory");

    const fileTarget = path.join(root, "file-target");
    await writeFile(fileTarget, "not a directory\n", "utf8");
    caught = undefined;
    try {
      await ejectProject({ targetDir: fileTarget, force: false });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "TARGET_DIR_NOT_FOUND", `expected TARGET_DIR_NOT_FOUND for file target, got ${caught?.code ?? "success"}`);
  });

  await check("project ejector copies only workflow and facet templates", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-eject-normal-"));
    const entries = await listTemplateEntries();
    const expected = entries.map((entry) => `.takt/${entry.relativePath}`);
    const result = await ejectProject({ targetDir, force: false });

    assert(JSON.stringify(result.created) === JSON.stringify(expected), `created paths differ from template entries: ${JSON.stringify(result.created)}`);
    assert(result.overwritten.length === 0, `normal eject should not overwrite files: ${result.overwritten.join(", ")}`);
    for (const entry of entries) {
      assert(
        existsSync(path.join(targetDir, ".takt", ...entry.relativePath.split("/"))),
        `template entry was not ejected: .takt/${entry.relativePath}`,
      );
      assert(
        entry.relativePath.startsWith("workflows/") || entry.relativePath.startsWith("facets/"),
        `eject exposed non workflow/facet template entry: ${entry.relativePath}`,
      );
    }
    for (const relativePath of RESEARCH_TEMPLATE_RELATIVE_PATHS) {
      const ejectedPath = `.takt/${relativePath}`;
      assert(result.created.includes(ejectedPath), `research template entry was not reported as ejected: ${ejectedPath}`);
      assert(existsSync(path.join(targetDir, ejectedPath)), `research template entry was not copied by eject: ${ejectedPath}`);
    }
    assert(
      !result.created.includes(".takt/facets/output-contracts/research-report.md"),
      "eject must not distribute built-in deep-research research-report.md output contract",
    );
    assert(
      !existsSync(path.join(targetDir, ".takt", "facets", "output-contracts", "research-report.md")),
      "eject copied built-in deep-research research-report.md output contract",
    );
    await assertNoRuntimeOrProviderFiles(targetDir);
  });

  await check("project ejector reports all conflicts and writes nothing without force", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-eject-conflict-"));
    const entries = await listTemplateEntries();
    const conflictEntries = [
      entries.find((entry) => entry.relativePath.startsWith("workflows/")),
      entries.find((entry) => entry.relativePath.startsWith("facets/")),
    ].filter(Boolean);
    const untouchedEntry = entries.find((entry) => !conflictEntries.includes(entry));
    assert(conflictEntries.length === 2 && untouchedEntry, "test requires workflow, facet, and untouched template entries");

    for (const entry of conflictEntries) {
      const destination = path.join(targetDir, ".takt", ...entry.relativePath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, `custom ${entry.relativePath}\n`, "utf8");
    }

    let caught;
    try {
      await ejectProject({ targetDir, force: false });
    } catch (error) {
      caught = error;
    }

    assert(caught?.code === "EJECT_CONFLICT", `expected EJECT_CONFLICT, got ${caught?.code ?? "success"}`);
    for (const entry of conflictEntries) {
      const relativePath = `.takt/${entry.relativePath}`;
      assert(caught.message.includes(relativePath), `conflict message omitted ${relativePath}: ${caught.message}`);
      const content = await readFile(path.join(targetDir, ".takt", ...entry.relativePath.split("/")), "utf8");
      assert(content === `custom ${entry.relativePath}\n`, `conflicting file was changed without force: ${relativePath}`);
    }
    assert(
      !existsSync(path.join(targetDir, ".takt", ...untouchedEntry.relativePath.split("/"))),
      `non-conflicting template file was partially created: .takt/${untouchedEntry.relativePath}`,
    );
  });

  await check("project ejector rejects non-directory template ancestors before writing", async () => {
    const entries = await listTemplateEntries();
    const workflowEntry = entries.find((entry) => entry.relativePath.startsWith("workflows/"));
    const facetEntry = entries.find((entry) => entry.relativePath.startsWith("facets/"));
    assert(workflowEntry && facetEntry, "test requires workflow and facet template entries");

    const bothBlockedTarget = await mkdtemp(path.join(os.tmpdir(), "project-eject-blocked-ancestors-"));
    await mkdir(path.join(bothBlockedTarget, ".takt"), { recursive: true });
    await writeFile(path.join(bothBlockedTarget, ".takt", "workflows"), "not a directory\n", "utf8");
    await writeFile(path.join(bothBlockedTarget, ".takt", "facets"), "not a directory\n", "utf8");

    let caught;
    try {
      await ejectProject({ targetDir: bothBlockedTarget, force: false });
    } catch (error) {
      caught = error;
    }

    assert(caught?.code === "EJECT_CONFLICT", `expected EJECT_CONFLICT, got ${caught?.code ?? "success"}`);
    for (const relativePath of [".takt/workflows", ".takt/facets"]) {
      assert(caught.message.includes(relativePath), `non-directory ancestor conflict omitted ${relativePath}: ${caught.message}`);
    }
    assert(
      !existsSync(path.join(bothBlockedTarget, ".takt", ...workflowEntry.relativePath.split("/"))),
      `workflow template was generated under a non-directory ancestor: .takt/${workflowEntry.relativePath}`,
    );
    assert(
      !existsSync(path.join(bothBlockedTarget, ".takt", ...facetEntry.relativePath.split("/"))),
      `facet template was generated under a non-directory ancestor: .takt/${facetEntry.relativePath}`,
    );

    const singleBlockedCases = [
      { blocked: "workflows", counterpart: "facets", counterpartEntry: facetEntry },
      { blocked: "facets", counterpart: "workflows", counterpartEntry: workflowEntry },
    ];
    for (const { blocked, counterpart, counterpartEntry } of singleBlockedCases) {
      const targetDir = await mkdtemp(path.join(os.tmpdir(), `project-eject-${blocked}-file-`));
      await mkdir(path.join(targetDir, ".takt"), { recursive: true });
      await writeFile(path.join(targetDir, ".takt", blocked), "not a directory\n", "utf8");

      caught = undefined;
      try {
        await ejectProject({ targetDir, force: false });
      } catch (error) {
        caught = error;
      }

      assert(caught?.code === "EJECT_CONFLICT", `expected EJECT_CONFLICT for .takt/${blocked}, got ${caught?.code ?? "success"}`);
      assert(caught.message.includes(`.takt/${blocked}`), `blocked ancestor was not reported: ${caught.message}`);
      assert(!existsSync(path.join(targetDir, ".takt", counterpart)), `counterpart template directory was created before conflict: .takt/${counterpart}`);
      assert(
        !existsSync(path.join(targetDir, ".takt", ...counterpartEntry.relativePath.split("/"))),
        `counterpart template file was created before conflict: .takt/${counterpartEntry.relativePath}`,
      );
      const blockedContent = await readFile(path.join(targetDir, ".takt", blocked), "utf8");
      assert(blockedContent === "not a directory\n", `blocked ancestor was modified: .takt/${blocked}`);
    }
  });

  await check("project ejector force rejects ancestor symlinks before writing", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-eject-ancestor-symlink-"));
    const symlinkTarget = await mkdtemp(path.join(os.tmpdir(), "project-eject-workflows-target-"));
    const entries = await listTemplateEntries();
    const workflowEntry = entries.find((entry) => entry.relativePath === "workflows/takt-marp-slide-plan.yaml");
    const facetEntry = entries.find((entry) => entry.relativePath === "facets/instructions/takt-marp-compose-fix.md");
    assert(workflowEntry && facetEntry, "test requires workflow and facet template entries");

    await mkdir(path.join(targetDir, ".takt"), { recursive: true });
    await symlink(symlinkTarget, path.join(targetDir, ".takt", "workflows"), "dir");

    let caught;
    try {
      await ejectProject({ targetDir, force: true });
    } catch (error) {
      caught = error;
    }

    assert(caught?.code === "EJECT_CONFLICT", `expected EJECT_CONFLICT for ancestor symlink, got ${caught?.code ?? "success"}`);
    assert(Array.isArray(caught.conflicts), "EJECT_CONFLICT must expose conflicts array");
    assert(caught.conflicts.includes(".takt/workflows"), `ancestor symlink conflict omitted from error.conflicts: ${caught.conflicts?.join(", ")}`);
    assert(caught.message.includes(".takt/workflows"), `ancestor symlink conflict omitted from message: ${caught.message}`);
    assert(
      !existsSync(path.join(symlinkTarget, "takt-marp-slide-plan.yaml")),
      "workflow template was written through an ancestor symlink",
    );
    assert(
      !existsSync(path.join(targetDir, ".takt", ...facetEntry.relativePath.split("/"))),
      `facet template was partially created after ancestor symlink conflict: .takt/${facetEntry.relativePath}`,
    );
  });

  await check("project ejector force rejects leaf directory conflicts before writing", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-eject-leaf-dir-conflict-"));
    const entries = await listTemplateEntries();
    const conflictEntries = [
      entries.find((entry) => entry.relativePath === "facets/instructions/takt-marp-compose-fix.md"),
      entries.find((entry) => entry.relativePath === "workflows/takt-marp-slide-plan.yaml"),
    ].filter(Boolean);
    const untouchedEntry = entries.find((entry) => entry.relativePath === "facets/instructions/takt-marp-ai-antipattern-fix.md");
    assert(conflictEntries.length === 2 && untouchedEntry, "test requires leaf directory conflicts and another template path");

    for (const entry of conflictEntries) {
      await mkdir(path.join(targetDir, ".takt", ...entry.relativePath.split("/")), { recursive: true });
    }

    let caught;
    try {
      await ejectProject({ targetDir, force: true });
    } catch (error) {
      caught = error;
    }

    assert(caught?.code === "EJECT_CONFLICT", `expected EJECT_CONFLICT for force leaf directory conflict, got ${caught?.code ?? "success"}`);
    assert(Array.isArray(caught.conflicts), "EJECT_CONFLICT must expose conflicts array");
    for (const entry of conflictEntries) {
      const relativePath = `.takt/${entry.relativePath}`;
      assert(caught.conflicts.includes(relativePath), `leaf directory conflict omitted from error.conflicts: ${relativePath}`);
      assert(caught.message.includes(relativePath), `leaf directory conflict omitted from message: ${relativePath}`);
      assert(existsSync(path.join(targetDir, ".takt", ...entry.relativePath.split("/"))), `leaf directory conflict was removed: ${relativePath}`);
    }
    assert(
      !existsSync(path.join(targetDir, ".takt", ...untouchedEntry.relativePath.split("/"))),
      `force leaf directory conflict partially wrote another template: .takt/${untouchedEntry.relativePath}`,
    );
  });

  await check("project ejector force rejects leaf symlinks before writing", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-eject-leaf-symlink-"));
    const entries = await listTemplateEntries();
    const conflictEntry = entries.find((entry) => entry.relativePath === "workflows/takt-marp-slide-plan.yaml");
    const untouchedEntry = entries.find((entry) => entry.relativePath === "facets/instructions/takt-marp-compose-fix.md");
    assert(conflictEntry && untouchedEntry, "test requires a workflow symlink conflict and another template path");

    const credentialsPath = path.join(targetDir, ".takt", "credentials.env");
    const symlinkPath = path.join(targetDir, ".takt", ...conflictEntry.relativePath.split("/"));
    const credentials = "user-owned credential placeholder\n";
    await mkdir(path.dirname(symlinkPath), { recursive: true });
    await writeFile(credentialsPath, credentials, "utf8");
    await symlink(path.join("..", "credentials.env"), symlinkPath);

    let caught;
    try {
      await ejectProject({ targetDir, force: true });
    } catch (error) {
      caught = error;
    }

    const conflictPath = `.takt/${conflictEntry.relativePath}`;
    assert(caught?.code === "EJECT_CONFLICT", `expected EJECT_CONFLICT for force leaf symlink conflict, got ${caught?.code ?? "success"}`);
    assert(Array.isArray(caught.conflicts), "EJECT_CONFLICT must expose conflicts array");
    assert(caught.conflicts.includes(conflictPath), `leaf symlink conflict omitted from error.conflicts: ${conflictPath}`);
    assert(caught.message.includes(conflictPath), `leaf symlink conflict omitted from message: ${caught.message}`);
    assert((await readFile(credentialsPath, "utf8")) === credentials, "force modified credentials through a leaf symlink");
    assert(
      !existsSync(path.join(targetDir, ".takt", ...untouchedEntry.relativePath.split("/"))),
      `force leaf symlink conflict partially wrote another template: .takt/${untouchedEntry.relativePath}`,
    );
  });

  await check("project ejector force overwrites only template paths and leaves non-template state untouched", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "project-eject-force-"));
    const entries = await listTemplateEntries();
    const existingTemplate = entries.find((entry) => entry.relativePath.startsWith("workflows/"));
    assert(existingTemplate, "test requires at least one workflow template entry");
    const existingDestination = path.join(targetDir, ".takt", ...existingTemplate.relativePath.split("/"));
    await mkdir(path.dirname(existingDestination), { recursive: true });
    await writeFile(existingDestination, "custom workflow\n", "utf8");

    const sentinels = new Map([
      [path.join(targetDir, ".takt", "config.yaml"), "provider: user-owned\n"],
      [path.join(targetDir, ".takt", "runs", "run-1", "state.json"), "{\"state\":\"kept\"}\n"],
      [path.join(targetDir, ".takt", "render", "demo", "metadata.json"), "{\"render\":\"kept\"}\n"],
      [path.join(targetDir, ".takt", "provider-settings.yaml"), "provider: external\n"],
      [path.join(targetDir, ".takt", "credentials.env"), "user-owned credential placeholder\n"],
      [path.join(targetDir, "notes.md"), "outside target template\n"],
    ]);
    for (const [filePath, content] of sentinels) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }

    const result = await ejectProject({ targetDir, force: true });
    const overwrittenPath = `.takt/${existingTemplate.relativePath}`;
    assert(result.overwritten.includes(overwrittenPath), `force result did not report overwritten template: ${JSON.stringify(result)}`);
    const copied = await readFile(existingDestination, "utf8");
    const expected = await readFile(existingTemplate.sourcePath, "utf8");
    assert(copied === expected, `force did not overwrite template path ${overwrittenPath}`);
    for (const [filePath, content] of sentinels) {
      const actual = await readFile(filePath, "utf8");
      assert(actual === content, `force modified non-template file ${path.relative(targetDir, filePath)}`);
    }
  });

  await check("template source resolver selects bundled source without creating project templates", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "template-source-none-"));
    const source = resolveTemplateSource({ projectRoot: root });
    assert(source.kind === "bundled", `expected bundled source, got: ${source.kind}`);
    assert(source.rootDir === path.join(ROOT_DIR, "templates", "project"), `unexpected bundled root: ${source.rootDir}`);
    assert(source.workflowsDir === path.join(source.rootDir, "workflows"), `unexpected bundled workflows dir: ${source.workflowsDir}`);
    assert(source.facetsDir === path.join(source.rootDir, "facets"), `unexpected bundled facets dir: ${source.facetsDir}`);
    assert(
      workflowFilePath(source, "plan") === path.join(source.workflowsDir, "takt-marp-slide-plan.yaml"),
      "workflow path should resolve under bundled workflows",
    );
    assert(!existsSync(path.join(root, ".takt")), "resolver created project-local .takt for bundled source");
  });

  await check("template source resolver selects ejected source when both domains exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "template-source-both-"));
    await mkdir(path.join(root, ".takt", "workflows"), { recursive: true });
    await mkdir(path.join(root, ".takt", "facets"), { recursive: true });
    const source = resolveTemplateSource({ projectRoot: root });
    assert(source.kind === "ejected", `expected ejected source, got: ${source.kind}`);
    assert(source.rootDir === path.join(root, ".takt"), `unexpected ejected root: ${source.rootDir}`);
    assert(source.workflowsDir === path.join(root, ".takt", "workflows"), `unexpected ejected workflows dir: ${source.workflowsDir}`);
    assert(source.facetsDir === path.join(root, ".takt", "facets"), `unexpected ejected facets dir: ${source.facetsDir}`);
    assert(
      workflowFilePath(source, "compose") === path.join(root, ".takt", "workflows", "takt-marp-slide-compose.yaml"),
      "workflow path should resolve under ejected workflows",
    );
  });

  await check("template source resolver rejects partial project template state", async () => {
    const workflowsOnlyRoot = await mkdtemp(path.join(os.tmpdir(), "template-source-workflows-only-"));
    await mkdir(path.join(workflowsOnlyRoot, ".takt", "workflows"), { recursive: true });
    let caught;
    try {
      resolveTemplateSource({ projectRoot: workflowsOnlyRoot });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "PROJECT_TEMPLATE_STATE_INVALID", `expected PROJECT_TEMPLATE_STATE_INVALID, got: ${caught?.code ?? "success"}`);
    assert(caught.message.includes(".takt/workflows exists without .takt/facets"), `missing workflows-only details: ${caught.message}`);
    assert(!existsSync(path.join(workflowsOnlyRoot, ".takt", "facets")), "resolver created missing facets directory");

    const facetsOnlyRoot = await mkdtemp(path.join(os.tmpdir(), "template-source-facets-only-"));
    await mkdir(path.join(facetsOnlyRoot, ".takt", "facets"), { recursive: true });
    caught = undefined;
    try {
      resolveTemplateSource({ projectRoot: facetsOnlyRoot });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "PROJECT_TEMPLATE_STATE_INVALID", `expected PROJECT_TEMPLATE_STATE_INVALID, got: ${caught?.code ?? "success"}`);
    assert(caught.message.includes(".takt/facets exists without .takt/workflows"), `missing facets-only details: ${caught.message}`);
    assert(!existsSync(path.join(facetsOnlyRoot, ".takt", "workflows")), "resolver created missing workflows directory");
  });

  await check("template source resolver treats cwd as project root without parent discovery", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "template-source-parent-"));
    const child = path.join(parent, "nested");
    await mkdir(path.join(parent, ".takt", "workflows"), { recursive: true });
    await mkdir(path.join(parent, ".takt", "facets"), { recursive: true });
    await mkdir(child, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(child);
      const source = resolveTemplateSource();
      assert(source.kind === "bundled", `child cwd should resolve bundled despite parent .takt, got: ${source.kind}`);
      assert(source.rootDir === path.join(ROOT_DIR, "templates", "project"), `unexpected child bundled root: ${source.rootDir}`);
      assert(!existsSync(path.join(child, ".takt")), "resolver created child .takt while checking parent discovery");
    } finally {
      process.chdir(originalCwd);
    }
  });

  await check("template source resolver resolves research workflow from bundled and ejected sources", async () => {
    const bundledRoot = await mkdtemp(path.join(os.tmpdir(), "template-source-research-bundled-"));
    const bundledSource = resolveTemplateSource({ projectRoot: bundledRoot });
    const bundledResearchWorkflow = path.join(ROOT_DIR, "templates", "project", "workflows", "takt-marp-slide-research.yaml");
    const bundledReuseWorkflow = path.join(ROOT_DIR, "templates", "project", "workflows", "takt-marp-slide-research-reuse.yaml");
    assert(bundledSource.kind === "bundled", `expected bundled source, got ${bundledSource.kind}`);
    assert(workflowFilePath(bundledSource, "research") === bundledResearchWorkflow, `bundled research workflow path mismatch: ${workflowFilePath(bundledSource, "research")}`);
    assert(
      researchReuseWorkflowFilePath(bundledResearchWorkflow) === bundledReuseWorkflow,
      `bundled research reuse workflow sibling path mismatch: ${researchReuseWorkflowFilePath(bundledResearchWorkflow)}`,
    );
    assert(existsSync(bundledResearchWorkflow), `bundled research workflow template missing: ${bundledResearchWorkflow}`);

    const ejectedRoot = await mkdtemp(path.join(os.tmpdir(), "template-source-research-ejected-"));
    await mkdir(path.join(ejectedRoot, ".takt", "workflows"), { recursive: true });
    await mkdir(path.join(ejectedRoot, ".takt", "facets"), { recursive: true });
    const ejectedResearchWorkflow = path.join(ejectedRoot, ".takt", "workflows", "takt-marp-slide-research.yaml");
    const ejectedReuseWorkflow = path.join(ejectedRoot, ".takt", "workflows", "takt-marp-slide-research-reuse.yaml");
    await writeFile(ejectedResearchWorkflow, "name: ejected-research\n", "utf8");
    const ejectedSource = resolveTemplateSource({ projectRoot: ejectedRoot });
    assert(ejectedSource.kind === "ejected", `expected ejected source, got ${ejectedSource.kind}`);
    assert(workflowFilePath(ejectedSource, "research") === ejectedResearchWorkflow, `ejected research workflow path mismatch: ${workflowFilePath(ejectedSource, "research")}`);
    assert(
      researchReuseWorkflowFilePath(ejectedResearchWorkflow) === ejectedReuseWorkflow,
      `ejected research reuse workflow sibling path mismatch: ${researchReuseWorkflowFilePath(ejectedResearchWorkflow)}`,
    );
  });

  await check("bundled runtime stages research wrapper and reuse workflow from selected template source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bundled-runtime-selected-research-"));
    const projectRoot = path.join(root, "project");
    const templateRoot = path.join(root, "templates", "project");
    const selectedResearchWorkflow = path.join(templateRoot, "workflows", "takt-marp-slide-research.yaml");
    const selectedReuseWorkflow = researchReuseWorkflowFilePath(selectedResearchWorkflow);
    await writeTemplateTree(templateRoot, new Map([
      [
        "workflows/takt-marp-slide-research.yaml",
        [
          "name: selected-wrapper-runtime-source",
          "steps:",
          "  - name: deep_research",
          "    call: deep-research",
          "",
        ].join("\n"),
      ],
      [
        "workflows/takt-marp-slide-research-reuse.yaml",
        [
          "name: selected-reuse-runtime-source",
          "steps:",
          "  - name: adapt_research",
          "",
        ].join("\n"),
      ],
      ["facets/personas/takt-marp-slide-planner.md", "# Planner\n"],
    ]));
    assert(existsSync(selectedReuseWorkflow), `selected research reuse workflow fixture was not created: ${selectedReuseWorkflow}`);

    const prepared = await prepareBundledWorkflowRuntime(selectedResearchWorkflow, { projectRoot, templateRoot });
    try {
      const runtimeReuseWorkflow = researchReuseWorkflowFilePath(prepared.workflowFilePath);
      const [runtimeWrapperSource, runtimeReuseSource] = await Promise.all([
        readFile(prepared.workflowFilePath, "utf8"),
        readFile(runtimeReuseWorkflow, "utf8"),
      ]);
      assert(
        prepared.workflowFilePath !== selectedResearchWorkflow,
        "bundled runtime must stage a runtime copy instead of using the package template path directly",
      );
      assert(
        runtimeWrapperSource.includes("selected-wrapper-runtime-source"),
        `staged research wrapper did not come from selected template source: ${runtimeWrapperSource}`,
      );
      assert(
        runtimeReuseSource.includes("selected-reuse-runtime-source"),
        `staged research reuse workflow did not come from selected template source: ${runtimeReuseSource}`,
      );
      assert(
        runtimeWrapperSource.includes("call: ./takt-marp-bundled-deep-research.yaml"),
        `staged research wrapper did not rewrite the built-in deep-research call: ${runtimeWrapperSource}`,
      );
      assert(
        existsSync(path.join(path.dirname(prepared.workflowFilePath), "takt-marp-bundled-deep-research.yaml")),
        "bundled runtime did not stage the callable built-in deep-research workflow next to the wrapper",
      );
      assert(
        path.dirname(runtimeReuseWorkflow) === path.dirname(prepared.workflowFilePath),
        `staged research reuse workflow is not a sibling of the staged wrapper: ${runtimeReuseWorkflow}`,
      );
    } finally {
      await prepared.cleanup();
    }
    assert(!existsSync(path.join(projectRoot, "workflows")), "bundled runtime cleanup left project workflows/ staging directory");
  });

  await check("template sync validator detects byte drift between package template and dev .takt trees", async () => {
    const identicalRoot = await mkdtemp(path.join(os.tmpdir(), "template-sync-identical-"));
    const identicalTemplateRoot = path.join(identicalRoot, "templates", "project");
    const identicalDevRoot = path.join(identicalRoot, ".takt");
    await writeTemplateTree(identicalTemplateRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", "name: plan\n"],
      ["facets/instructions/takt-marp-compose-fix.md", "# Compose fix\n"],
    ]));
    await writeTemplateTree(identicalDevRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", "name: plan\n"],
      ["facets/instructions/takt-marp-compose-fix.md", "# Compose fix\n"],
    ]));
    const identical = await diffTemplateTrees(identicalTemplateRoot, identicalDevRoot);
    assert(identical.missingInTemplate.length === 0, `identical trees reported missingInTemplate: ${identical.missingInTemplate.join(", ")}`);
    assert(identical.missingInDev.length === 0, `identical trees reported missingInDev: ${identical.missingInDev.join(", ")}`);
    assert(identical.contentMismatch.length === 0, `identical trees reported contentMismatch: ${identical.contentMismatch.join(", ")}`);

    const devOnlyRoot = await mkdtemp(path.join(os.tmpdir(), "template-sync-dev-only-"));
    const devOnlyTemplateRoot = path.join(devOnlyRoot, "templates", "project");
    const devOnlyDevRoot = path.join(devOnlyRoot, ".takt");
    await writeTemplateTree(devOnlyTemplateRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", "name: plan\n"],
    ]));
    await writeTemplateTree(devOnlyDevRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", "name: plan\n"],
      ["facets/instructions/dev-only.md", "# Dev only\n"],
    ]));
    const devOnly = await diffTemplateTrees(devOnlyTemplateRoot, devOnlyDevRoot);
    assert(
      JSON.stringify(devOnly.missingInTemplate) === JSON.stringify(["facets/instructions/dev-only.md"]),
      `dev-only file should be missingInTemplate with path, got: ${JSON.stringify(devOnly)}`,
    );

    const templateOnlyRoot = await mkdtemp(path.join(os.tmpdir(), "template-sync-template-only-"));
    const templateOnlyTemplateRoot = path.join(templateOnlyRoot, "templates", "project");
    const templateOnlyDevRoot = path.join(templateOnlyRoot, ".takt");
    await writeTemplateTree(templateOnlyTemplateRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", "name: plan\n"],
      ["facets/instructions/template-only.md", "# Template only\n"],
    ]));
    await writeTemplateTree(templateOnlyDevRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", "name: plan\n"],
    ]));
    const templateOnly = await diffTemplateTrees(templateOnlyTemplateRoot, templateOnlyDevRoot);
    assert(
      JSON.stringify(templateOnly.missingInDev) === JSON.stringify(["facets/instructions/template-only.md"]),
      `template-only file should be missingInDev with path, got: ${JSON.stringify(templateOnly)}`,
    );

    const mismatchRoot = await mkdtemp(path.join(os.tmpdir(), "template-sync-mismatch-"));
    const mismatchTemplateRoot = path.join(mismatchRoot, "templates", "project");
    const mismatchDevRoot = path.join(mismatchRoot, ".takt");
    await writeTemplateTree(mismatchTemplateRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", Buffer.from([0x00, 0xff, 0x0a])],
    ]));
    await writeTemplateTree(mismatchDevRoot, new Map([
      ["workflows/takt-marp-slide-plan.yaml", Buffer.from([0x00, 0xfe, 0x0a])],
    ]));
    const mismatch = await diffTemplateTrees(mismatchTemplateRoot, mismatchDevRoot);
    assert(
      JSON.stringify(mismatch.contentMismatch) === JSON.stringify(["workflows/takt-marp-slide-plan.yaml"]),
      `byte mismatch should be contentMismatch with path, got: ${JSON.stringify(mismatch)}`,
    );
  });

  await check("research template distribution matches dev assets and drift detection covers research paths", async () => {
    const templateRoot = path.join(ROOT_DIR, "templates", "project");
    const devTaktRoot = path.join(ROOT_DIR, ".takt");
    const templateEntries = await listTemplateEntries({ templateRoot });
    const templatePaths = new Set(templateEntries.map((entry) => entry.relativePath));
    for (const relativePath of RESEARCH_TEMPLATE_RELATIVE_PATHS) {
      assert(templatePaths.has(relativePath), `research asset missing from template tree: ${relativePath}`);
      const [templateContent, devContent] = await Promise.all([
        readFile(path.join(templateRoot, ...relativePath.split("/"))),
        readFile(path.join(devTaktRoot, ...relativePath.split("/"))),
      ]);
      assert(templateContent.equals(devContent), `research template asset drifted from dev .takt: ${relativePath}`);
    }
    assert(!templatePaths.has("facets/output-contracts/research-report.md"), "built-in deep-research research-report.md must not be distributed as a template");

    const repoDrift = await diffTemplateTrees(templateRoot, devTaktRoot);
    assert(repoDrift.missingInTemplate.length === 0, `repo template missing research/dev files: ${repoDrift.missingInTemplate.join(", ")}`);
    assert(repoDrift.missingInDev.length === 0, `repo template has files absent from dev .takt: ${repoDrift.missingInDev.join(", ")}`);
    assert(repoDrift.contentMismatch.length === 0, `repo template content drift: ${repoDrift.contentMismatch.join(", ")}`);

    const driftRoot = await mkdtemp(path.join(os.tmpdir(), "template-sync-research-drift-"));
    const driftTemplateRoot = path.join(driftRoot, "templates", "project");
    const driftDevRoot = path.join(driftRoot, ".takt");
    await writeTemplateTree(driftTemplateRoot, new Map([
      ["workflows/takt-marp-slide-research.yaml", "name: stale-research\n"],
    ]));
    await writeTemplateTree(driftDevRoot, new Map([
      ["workflows/takt-marp-slide-research.yaml", "name: current-research\n"],
      ["facets/instructions/takt-marp-adapt-research.md", "# Adapter\n"],
    ]));
    const researchDrift = await diffTemplateTrees(driftTemplateRoot, driftDevRoot);
    assert(
      JSON.stringify(researchDrift.contentMismatch) === JSON.stringify(["workflows/takt-marp-slide-research.yaml"]),
      `research workflow byte drift was not detected: ${JSON.stringify(researchDrift)}`,
    );
    assert(
      JSON.stringify(researchDrift.missingInTemplate) === JSON.stringify(["facets/instructions/takt-marp-adapt-research.md"]),
      `research adapter template drift was not detected: ${JSON.stringify(researchDrift)}`,
    );
  });

  await check("template drift formatter reports drift kind labels and paths", async () => {
    const lines = formatTemplateDrift({
      missingInTemplate: ["facets/instructions/dev-only.md"],
      missingInDev: ["workflows/template-only.yaml"],
      contentMismatch: ["workflows/takt-marp-slide-plan.yaml"],
    });
    const output = lines.join("\n");
    assert(output.includes("missing in template (exists only in dev .takt) (1):"), `missingInTemplate label omitted: ${output}`);
    assert(output.includes("  - facets/instructions/dev-only.md"), `missingInTemplate path omitted: ${output}`);
    assert(output.includes("missing in dev .takt (exists only in template) (1):"), `missingInDev label omitted: ${output}`);
    assert(output.includes("  - workflows/template-only.yaml"), `missingInDev path omitted: ${output}`);
    assert(output.includes("content mismatch (1):"), `contentMismatch label omitted: ${output}`);
    assert(output.includes("  - workflows/takt-marp-slide-plan.yaml"), `contentMismatch path omitted: ${output}`);
  });

  await check("package boundary validator requires no-copy/eject runtime files without requiring init", async () => {
    assert(
      REQUIRED_PACK_FILES.includes("scripts/lib/takt-marp-project-eject.mjs"),
      `required package files must include eject runtime: ${REQUIRED_PACK_FILES.join(", ")}`,
    );
    assert(
      REQUIRED_PACK_FILES.includes("scripts/lib/takt-marp-errors.mjs"),
      `required package files must include shared error runtime: ${REQUIRED_PACK_FILES.join(", ")}`,
    );
    assert(
      REQUIRED_PACK_FILES.includes("scripts/lib/takt-marp-claude-design-source.mjs"),
      `required package files must include Claude Design importer runtime: ${REQUIRED_PACK_FILES.join(", ")}`,
    );
    assert(
      REQUIRED_PACK_FILES.includes("scripts/lib/takt-marp-zip-archive.mjs"),
      `required package files must include zip archive runtime: ${REQUIRED_PACK_FILES.join(", ")}`,
    );
    assert(
      !REQUIRED_PACK_FILES.includes("scripts/lib/takt-marp-project-init.mjs"),
      `init compatibility shim must not be mandatory package content: ${REQUIRED_PACK_FILES.join(", ")}`,
    );
    assert(
      FORBIDDEN_PACK_FILES.includes("scripts/lib/takt-marp-project-init.mjs"),
      `init compatibility shim must be a forbidden pack file: ${FORBIDDEN_PACK_FILES.join(", ")}`,
    );
    assert(
      !existsSync(path.join(SCRIPT_DIR, "lib", "takt-marp-project-init.mjs")),
      "stale init compatibility shim file must be removed from scripts/lib",
    );

    const researchReuseTemplatePath = "workflows/takt-marp-slide-research-reuse.yaml";
    const templateEntries = [
      { relativePath: "workflows/takt-marp-slide-plan.yaml" },
      { relativePath: researchReuseTemplatePath },
      { relativePath: "facets/instructions/takt-marp-compose-fix.md" },
    ];
    const validPackPaths = [
      ...REQUIRED_PACK_FILES,
      "fixtures/marp-slide-workflow/_workflow-smoke/brief.md",
      "templates/project/workflows/takt-marp-slide-plan.yaml",
      `templates/project/${researchReuseTemplatePath}`,
      "templates/project/facets/instructions/takt-marp-compose-fix.md",
    ].sort();

    const validViolations = collectPackContentViolations(validPackPaths, templateEntries);
    assert(validViolations.length === 0, `valid no-copy/eject pack paths reported violations: ${formatViolations(validViolations)}`);

    const staleInitViolations = collectPackContentViolations(
      [...validPackPaths, "scripts/lib/takt-marp-project-init.mjs"],
      templateEntries,
    );
    assert(
      staleInitViolations.some((violation) => violation.detail.includes("stale init compatibility shim")),
      `stale init shim pack path was not rejected: ${formatViolations(staleInitViolations)}`,
    );

    for (const missingPath of ["scripts/lib/takt-marp-project-eject.mjs", "scripts/lib/takt-marp-errors.mjs"]) {
      const violations = collectPackContentViolations(
        validPackPaths.filter((packedPath) => packedPath !== missingPath),
        templateEntries,
      );
      assert(
        violations.some((violation) => violation.detail === `required file missing from pack: ${missingPath}`),
        `missing required runtime ${missingPath} was not reported with path: ${formatViolations(violations)}`,
      );
    }

    const missingResearchReuseTemplateViolations = collectPackContentViolations(
      validPackPaths.filter((packedPath) => packedPath !== `templates/project/${researchReuseTemplatePath}`),
      templateEntries,
    );
    assert(
      missingResearchReuseTemplateViolations.some(
        (violation) => violation.detail === `template entry missing from pack: templates/project/${researchReuseTemplatePath}`,
      ),
      `missing research reuse workflow template was not reported with path: ${formatViolations(missingResearchReuseTemplateViolations)}`,
    );

    const prohibitedPath = "templates/project/workflows/config.yaml";
    const prohibitedViolations = collectPackContentViolations([...validPackPaths, prohibitedPath], templateEntries);
    assert(
      prohibitedViolations.some((violation) => violation.detail.includes(prohibitedPath)),
      `prohibited packed path was not reported with path: ${formatViolations(prohibitedViolations)}`,
    );

    const providerSettingsEntry = "facets/provider-settings.yaml";
    let caught;
    try {
      assertNoProhibitedEntries([{ relativePath: providerSettingsEntry }]);
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "PACKAGE_BOUNDARY_VIOLATION", `expected provider settings template entry violation, got ${caught?.code ?? "success"}`);
    assert(
      caught.message.includes(providerSettingsEntry),
      `provider settings template entry violation must include path ${providerSettingsEntry}: ${caught.message}`,
    );

    const providerSettingsPackPath = "templates/project/facets/provider-settings.yaml";
    const providerSettingsViolations = collectPackContentViolations([...validPackPaths, providerSettingsPackPath], templateEntries);
    assert(
      providerSettingsViolations.some((violation) => violation.detail.includes(providerSettingsPackPath)),
      `provider settings packed path was not reported with path: ${formatViolations(providerSettingsViolations)}`,
    );
  });

  await check("CLI entry delegates supported runtime to dispatcher", async () => {
    const result = spawnSync(process.execPath, [BIN_ENTRY_SCRIPT, "--help"], { encoding: "utf8" });
    assert(result.status === 0, `CLI entry help failed: ${result.stderr}`);
    assert(result.stdout.includes("Usage: takt-marp <command>"), `dispatcher usage missing: ${result.stdout}`);
    assert(result.stdout.includes("Workflow options"), `dispatcher help was not reached: ${result.stdout}`);
  });

  await check("CLI entry rejects unsupported Node before dispatcher", async () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "data:text/javascript,Object.defineProperty(process.versions%2C%22node%22%2C%7Bvalue%3A%2220.0.0%22%7D)%3B",
        BIN_ENTRY_SCRIPT,
        "--help",
      ],
      { encoding: "utf8" },
    );
    assert(result.status === 1, `unsupported Node should exit 1, got ${result.status}`);
    assert(result.stderr.includes("NODE_VERSION_UNSUPPORTED"), `missing unsupported code: ${result.stderr}`);
    assert(result.stderr.includes("Node.js >= 24"), `missing required Node version: ${result.stderr}`);
    assert(result.stdout === "", `dispatcher started despite unsupported Node: ${result.stdout}`);
  });

  await check("CLI public surface exposes eject and retained commands without init", async () => {
    const { stdout } = await captureOutput(() => runCli(["--help"]));
    for (const command of ["eject", "research", "plan", "compose", "polish", "deliver", "approve", "smoke", "build:html", "build:pdf", "build:pptx", "preview"]) {
      assert(new RegExp(`^  ${command}\\b`, "m").test(stdout), `help missing public command '${command}': ${stdout}`);
    }
    assert(
      stdout.includes("research <slides/deck>") && stdout.includes("Optional pre-research command"),
      `help must present research as an optional pre-research command: ${stdout}`,
    );
    assert(!/^  init\b/m.test(stdout), `help must not expose retired init command: ${stdout}`);
  });

  await check("CLI rejects unknown commands and slide:* commands as invalid global commands", async () => {
    const unknown = await captureOutput(() => runCli(["not-a-command"]));
    assert(unknown.result === 1, `unknown command should exit 1, got ${unknown.result}`);
    assert(unknown.stderr.includes("UNKNOWN_COMMAND"), `unknown command must use UNKNOWN_COMMAND: ${unknown.stderr}`);
    assert(unknown.stderr.includes("research"), `unknown command valid-command guidance must mention research: ${unknown.stderr}`);
    assert(!unknown.stderr.includes("init"), `unknown command valid-command guidance must not mention init: ${unknown.stderr}`);

    for (const scriptCommand of ["slide:plan", "slide:research"]) {
      const slideCommand = await captureOutput(() => runCli([scriptCommand]));
      assert(slideCommand.result === 1, `${scriptCommand} should exit 1, got ${slideCommand.result}`);
      assert(slideCommand.stderr.includes("UNKNOWN_COMMAND"), `slide:* command must be rejected with UNKNOWN_COMMAND: ${slideCommand.stderr}`);
      assert(slideCommand.stderr.includes(`'${scriptCommand}' is not a takt-marp command`), `slide:* rejection should name the invalid command: ${slideCommand.stderr}`);
    }
  });

  await check("CLI init is removed with eject guidance", async () => {
    const removed = await captureOutput(() => runCli(["init"]));
    assert(removed.result === 1, `retired init should exit 1, got ${removed.result}`);
    assert(removed.stderr.includes("COMMAND_REMOVED"), `init removal must use COMMAND_REMOVED: ${removed.stderr}`);
    assert(removed.stderr.includes("takt-marp eject ."), `init removal must guide to eject: ${removed.stderr}`);
  });

  await check("CLI eject delegates target directory and overwrite aliases to ProjectEjector", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "cli-eject-parent-"));
    const targetDir = path.join(parent, "custom-project");
    await mkdir(targetDir, { recursive: true });
    const entries = await listTemplateEntries();
    const workflowEntry = entries.find((entry) => entry.relativePath.startsWith("workflows/"));
    assert(workflowEntry, "test requires at least one workflow template entry");

    const first = await captureOutput(() => runCli(["eject", targetDir]));
    assert(first.result === 0, `eject should exit 0, got ${first.result}\n${first.stderr}`);
    assert(first.stdout.includes(`Ejected takt-marp templates in ${targetDir}`), `eject output must name target dir: ${first.stdout}`);
    assert(first.stdout.includes(`Created ${entries.length} file(s)`), `eject output must summarize created files: ${first.stdout}`);
    for (const entry of entries) {
      assert(
        existsSync(path.join(targetDir, ".takt", ...entry.relativePath.split("/"))),
        `CLI eject did not create template entry: .takt/${entry.relativePath}`,
      );
    }

    const conflict = await captureOutput(() => runCli(["eject", targetDir]));
    assert(conflict.result === 1, `second eject without force should fail, got ${conflict.result}`);
    assert(conflict.stderr.includes("EJECT_CONFLICT"), `second eject must surface ProjectEjector conflict: ${conflict.stderr}`);

    const mutatedPath = path.join(targetDir, ".takt", ...workflowEntry.relativePath.split("/"));
    await writeFile(mutatedPath, "mutated template\n", "utf8");
    const overwrite = await captureOutput(() => runCli(["eject", targetDir, "--overwrite"]));
    assert(overwrite.result === 0, `eject --overwrite should exit 0, got ${overwrite.result}\n${overwrite.stderr}`);
    assert(overwrite.stdout.includes("Overwrote"), `eject --overwrite output must summarize overwritten files: ${overwrite.stdout}`);
    const restored = await readFile(mutatedPath, "utf8");
    const expected = await readFile(workflowEntry.sourcePath, "utf8");
    assert(restored === expected, "--overwrite did not restore the template file from ProjectEjector");
  });

  await check("runtime context separates package root from package-less project root", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-package-less-project-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(projectRoot);
      const expectedProjectRoot = process.cwd();
      const expectedRuntimeBinDir = path.join(ROOT_DIR, "node_modules", ".bin");
      const ctx = resolveRuntimeContext();
      assert(!existsSync(path.join(expectedProjectRoot, "package.json")), "fixture unexpectedly has project package.json");
      assert(!existsSync(path.join(expectedProjectRoot, "node_modules")), "fixture unexpectedly has project node_modules");
      assert(ctx.projectRoot === expectedProjectRoot, `projectRoot should be current project cwd, got: ${ctx.projectRoot}`);
      assert(ctx.packageRoot === ROOT_DIR, `packageRoot should remain package root, got: ${ctx.packageRoot}`);
      assert(ctx.runtimeBinDir === expectedRuntimeBinDir, `runtimeBinDir should remain package-root based, got: ${ctx.runtimeBinDir}`);
      assert(runtimeExecutablePath("takt") === path.join(expectedRuntimeBinDir, runtimeExecutableName("takt")), "takt executable should resolve from package root");
      assert(runtimeExecutablePath("marp") === path.join(expectedRuntimeBinDir, runtimeExecutableName("marp")), "marp executable should resolve from package root");
      assert(packageScriptPath("scripts/takt-marp-run-slide-workflow.mjs") === RUNNER_SCRIPT, "package script path should resolve from package root");

      const fakePackage = await makeFakePackageRoot();
      const expectedFakeRuntimeBinDir = path.join(fakePackage.packageRoot, "node_modules", ".bin");
      assert(
        runtimeExecutablePath("takt", { root: fakePackage.packageRoot }) === path.join(expectedFakeRuntimeBinDir, runtimeExecutableName("takt")),
        "explicit runtimeExecutablePath root option compatibility changed",
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  await check("global CLI retained utility commands use package Marp without npm project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-utility-package-runtime-"));
    await mkdir(path.join(root, "slides", "demo"), { recursive: true });
    await writeFile(
      path.join(root, "slides", "demo", "SLIDES.md"),
      ["---", "marp: true", "---", "", "# Demo", ""].join("\n"),
      "utf8",
    );

    const fakePackage = await makeFakeCliPackageRoot();
    await makeMarpExecutable(fakePackage.packageRoot);

    const help = spawnSync(process.execPath, [fakePackage.binScript, "--help"], { cwd: root, encoding: "utf8" });
    assert(help.status === 0, `global CLI help failed from package-less project: ${help.stderr}`);
    for (const command of ["build:html", "build:pdf", "build:pptx", "preview"]) {
      assert(new RegExp(`^  ${command}\\b`, "m").test(help.stdout), `global CLI help missing retained utility '${command}': ${help.stdout}`);
    }

    for (const command of ["build:html", "build:pptx", "preview"]) {
      const utilityHelp = spawnSync(process.execPath, [fakePackage.binScript, command, "--help"], { cwd: root, encoding: "utf8" });
      assert(utilityHelp.status === 0, `${command} help dispatch failed from fake package root: ${utilityHelp.stderr}`);
      assert(utilityHelp.stdout.includes("Usage:"), `${command} help dispatch did not reach utility script: ${utilityHelp.stdout}`);
    }

    const marpArgsPath = path.join(root, "marp-args.txt");
    const marpExecutablePath = path.join(root, "marp-executable.txt");
    const build = spawnSync(
      process.execPath,
      [fakePackage.binScript, "build:pdf", "slides/demo"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          MARP_ARGS_CAPTURE: marpArgsPath,
          MARP_EXECUTABLE_CAPTURE: marpExecutablePath,
        },
      },
    );
    assert(build.status === 0, `build:pdf failed from package-less project: ${build.stderr}`);
    assert(!existsSync(path.join(root, "package.json")), "utility command created or required project package.json");
    assert(!existsSync(path.join(root, "node_modules")), "utility command created or required project node_modules");

    const outputPath = path.join(root, "dist", "demo", "SLIDES.pdf");
    assert(existsSync(outputPath), `fake Marp did not create requested output: ${outputPath}`);

    const expectedProjectRoot = await realpath(root);
    const expectedMarpPath = path.join(fakePackage.packageRoot, "node_modules", ".bin", runtimeExecutableName("marp"));
    const actualMarpPath = (await readFile(marpExecutablePath, "utf8")).trim();
    assert(actualMarpPath === expectedMarpPath, `Marp executable should resolve from package root: expected ${expectedMarpPath}, got ${actualMarpPath}`);

    const args = (await readFile(marpArgsPath, "utf8")).trim().split("\n");
    assert(args[0] === path.join(expectedProjectRoot, "slides", "demo", "SLIDES.md"), `Marp did not receive target SLIDES.md first: ${args.join(" ")}`);
    assert(args.includes("--pdf"), `build:pdf did not pass --pdf to Marp: ${args.join(" ")}`);
    const outputArgIndex = args.indexOf("--output");
    assert(outputArgIndex >= 0, `Marp args did not include --output: ${args.join(" ")}`);
    assert(args[outputArgIndex + 1] === path.join(expectedProjectRoot, "dist", "demo", "SLIDES.pdf"), `Marp output path should stay in target project dist: ${args.join(" ")}`);
  });

  await check("invalid target rejects markdown file", async () => {
    const root = await fixtureRoot();
    await makeDeck(root, "demo");
    await expectFailure(() => resolveDeckTarget("slides/demo/brief.md", { root }), "INVALID_TARGET");
  });

  await check("command config registry includes research without requiring it for plan", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const researchConfig = configFor("research");
    const planConfig = configFor("plan");

    assert(requireCommand("research") === "research", "research command was not accepted");
    assert(COMMANDS.includes("research"), `COMMANDS must include research: ${COMMANDS.join(", ")}`);
    assert(COMMAND_STATES.research === "researched", `research state must be researched, got ${COMMAND_STATES.research}`);
    assert(researchConfig.artifactDomain === "research", `research artifact domain must be research, got ${researchConfig.artifactDomain}`);
    assert(researchConfig.cleanGeneratedOutputsOnForce === false, "research force must not clean generated outputs");
    assert(
      JSON.stringify(researchConfig.invalidationTargets) === JSON.stringify(["research"]),
      `research invalidation targets must stay in research domain, got ${researchConfig.invalidationTargets.join(", ")}`,
    );
    assert(!APPROVAL_COMMANDS.includes("research"), `research must not support approval: ${APPROVAL_COMMANDS.join(", ")}`);
    assert(
      JSON.stringify(downstreamCommands("research")) === JSON.stringify(["research"]),
      `research downstream must stay in research domain, got ${downstreamCommands("research").join(", ")}`,
    );
    assert(!shouldCleanGeneratedOutputsOnForce("research"), "research force cleanup predicate must be disabled");
    assert(JSON.stringify(planConfig.sourceArtifacts) === JSON.stringify(["brief.md"]), `plan prerequisites changed: ${planConfig.sourceArtifacts.join(", ")}`);
    assert(planConfig.cleanGeneratedOutputsOnForce === true, "plan force must keep generated output cleanup");
    assert(shouldCleanGeneratedOutputsOnForce("plan"), "plan force cleanup predicate must stay enabled");
    assert(!planConfig.requiredState, `plan must not require a prior command state, got ${planConfig.requiredState}`);

    let caught;
    try {
      requireCommand("not-a-command");
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === "INVALID_COMMAND", `expected INVALID_COMMAND, got ${caught?.code ?? "success"}`);
    assert(caught.message.includes("research"), `invalid command expected list must include research: ${caught.message}`);

    for (const prototypeCommand of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      caught = undefined;
      try {
        configFor(prototypeCommand);
      } catch (error) {
        caught = error;
      }
      assert(
        caught?.code === "INVALID_COMMAND",
        `expected INVALID_COMMAND for prototype command ${prototypeCommand}, got ${caught?.code ?? "success"}`,
      );
    }

    await assertCommandPrerequisites(targetInfo, "plan");
  });

  await check("plan workflow declares research artifacts as optional context without web access", async () => {
    const workflowSource = await readFile(path.join(ROOT_DIR, ".takt", "workflows", "takt-marp-slide-plan.yaml"), "utf8");
    const analyzeInstruction = await readFile(
      path.join(ROOT_DIR, ".takt", "facets", "instructions", "takt-marp-analyze-reference-deck.md"),
      "utf8",
    );
    const planInstruction = await readFile(path.join(ROOT_DIR, ".takt", "facets", "instructions", "takt-marp-plan.md"), "utf8");
    const referenceContract = await readFile(
      path.join(ROOT_DIR, ".takt", "facets", "output-contracts", "takt-marp-reference-analysis.md"),
      "utf8",
    );
    const planContract = await readFile(
      path.join(ROOT_DIR, ".takt", "facets", "output-contracts", "takt-marp-slide-plan.md"),
      "utf8",
    );

    assert(workflowSource.includes("briefをprimary input"), "plan workflow must keep brief as primary input");
    assert(workflowSource.includes("optional context"), "plan workflow must document optional research context");
    assert(workflowSource.includes("network_access: false"), "plan workflow must keep network access disabled");
    assert(!workflowSource.includes("network_access: true"), "plan workflow must not enable network access");

    for (const source of [analyzeInstruction, planInstruction, referenceContract, planContract]) {
      for (const artifactName of ["research-report.md", "research-claims.md", "open-questions.md"]) {
        assert(source.includes(artifactName), `plan optional context contract omitted ${artifactName}`);
      }
      assert(
        source.includes("optional context") || source.includes("optional research context"),
        "plan optional context contract must mark research as optional",
      );
      assert(source.includes("needs_input"), "plan optional context contract must describe non-blocking needs_input behavior");
      assert(source.includes("外部 web access"), "plan optional context contract must forbid external web access as a success condition");
      assert(source.includes("未解決"), "plan optional context contract must keep open questions unresolved");
    }
  });

  await check("compose workflow and facets use Design Contract without design-system step", async () => {
    for (const rootRelativePath of [".takt", "templates/project"]) {
      const workflowPath = path.join(ROOT_DIR, rootRelativePath, "workflows", "takt-marp-slide-compose.yaml");
      const workflowSource = await readFile(workflowPath, "utf8");
      assert(workflowSource.includes("initial_step: compose_sections"), `${workflowPath} must start compose at compose_sections`);
      assert(!workflowSource.includes("initial_step: design_system"), `${workflowPath} still starts with design_system`);
      assert(!/^\s+design_system:/m.test(workflowSource), `${workflowPath} still declares a design_system step`);
      assert(!workflowSource.includes("takt-marp-design-system"), `${workflowPath} still references takt-marp-design-system`);

      const facetRoot = path.join(ROOT_DIR, rootRelativePath, "facets");
      const facetFiles = await listFilesRecursively(facetRoot);
      const violations = [];
      for (const filePath of facetFiles) {
        const source = await readFile(filePath, "utf8");
        const relativePath = path.relative(ROOT_DIR, filePath);
        source.split("\n").forEach((line, index) => {
          const isAllowedLegacyNote = line.includes("既存 deck に `design-system.md` が残っていても");
          if (line.includes("design-system.md") && !isAllowedLegacyNote) {
            violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
          }
          if (line.includes("takt-marp-design-system") || line.includes("design_system")) {
            violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
          }
        });
      }
      assert(violations.length === 0, `Design Contract facet migration violations:\n${violations.join("\n")}`);

      const planInstruction = await readFile(path.join(facetRoot, "instructions", "takt-marp-plan.md"), "utf8");
      assert(planInstruction.includes("design_contract.path"), `${rootRelativePath} plan instruction must open marker design_contract.path`);
      assert(planInstruction.includes("Resolved Design Contract JSON"), `${rootRelativePath} plan instruction must read the Resolved Design Contract JSON`);
      assert(planInstruction.includes("token constraints"), `${rootRelativePath} plan instruction must ground planning in token constraints`);
      assert(planInstruction.includes("guidance"), `${rootRelativePath} plan instruction must use Design System guidance`);
      assert(planInstruction.includes("source_catalog"), `${rootRelativePath} plan instruction must use Design System source_catalog`);

      const planContract = await readFile(path.join(facetRoot, "output-contracts", "takt-marp-slide-plan.md"), "utf8");
      const blueprintContract = await readFile(path.join(facetRoot, "output-contracts", "takt-marp-slide-blueprint.md"), "utf8");
      for (const [label, contractSource] of [["plan", planContract], ["blueprint", blueprintContract]]) {
        assert(contractSource.includes("Design Contract"), `${rootRelativePath} ${label} output contract must include a Design Contract section`);
        assert(contractSource.includes("contract_sha256"), `${rootRelativePath} ${label} output contract must require contract_sha256`);
        assert(contractSource.includes("token constraints"), `${rootRelativePath} ${label} output contract must require token constraints`);
        assert(contractSource.includes("guidance"), `${rootRelativePath} ${label} output contract must require Design System guidance`);
        assert(contractSource.includes("source_catalog"), `${rootRelativePath} ${label} output contract must require Design System source_catalog`);
      }

      const composeInstructionPaths = [
        "takt-marp-compose-sections.md",
        "takt-marp-assemble-slides.md",
        "takt-marp-compose-review.md",
        "takt-marp-compose-work-summary.md",
      ];
      for (const fileName of composeInstructionPaths) {
        const source = await readFile(path.join(facetRoot, "instructions", fileName), "utf8");
        assert(source.includes("fingerprint.contract_sha256"), `${rootRelativePath}/${fileName} must compare marker fingerprint.contract_sha256`);
        assert(source.includes("contract_sha256"), `${rootRelativePath}/${fileName} must compare artifact contract_sha256`);
        assert(source.includes("guidance") || source.includes("source_catalog"), `${rootRelativePath}/${fileName} must read Design System guidance or source_catalog`);
      }
    }
  });

  await check("workflow and report docs describe research command contracts", async () => {
    const workflowDocs = await readFile(path.join(ROOT_DIR, "docs", "marp-slide-workflow.md"), "utf8");
    const reportDocs = await readFile(path.join(ROOT_DIR, "docs", "marp-slide-workflow-reports.md"), "utf8");
    const readme = await readFile(path.join(ROOT_DIR, "README.md"), "utf8");
    const readmeJa = await readFile(path.join(ROOT_DIR, "README.ja.md"), "utf8");

    for (const source of [workflowDocs, readme, readmeJa]) {
      assert(source.includes("takt-marp research"), "docs must expose the CLI research command surface");
      assert(source.includes("slides/<deck>/research/research-brief.md"), "docs must name research-brief.md as research input");
    }

    for (const phrase of [
      "`research` は任意の前段 command",
      "`plan` の必須前提ではない",
      "TAKT built-in `deep-research`",
      "built-in が出力した `research-report.md` を正本",
      "repo-local workflow は deep research 本体を fork せず",
      "外部 web access は `research` command と built-in `deep-research` の境界に閉じる",
      "`reference-analysis.md` または `plan.md`",
      "`research --force` は既存 research artifacts を `slides/<deck>/research/history/` に退避",
    ]) {
      assert(workflowDocs.includes(phrase), `workflow docs missing research contract phrase: ${phrase}`);
    }

    for (const phrase of [
      "slides/<deck>/research/research-supervision.md",
      "state: researched",
      "`research` は approval を持たない",
      "`research-report.md` は TAKT built-in `deep-research` の出力を byte-for-byte copy した正本",
      "source_report_origin: builtin_deep_research",
      "research-sources.md",
      "research-claims.md",
      "open-questions.md",
      "slides/<deck>/research/history/{timestamp}-{reason}-{filename}",
      "`research --force` は research artifacts だけを退避",
    ]) {
      assert(reportDocs.includes(phrase), `report docs missing research contract phrase: ${phrase}`);
    }
  });

  await check("research artifact domain resolves separately from review artifacts", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const expectedResearchPath = path.join(targetInfo.deckPath, "research");
    const briefBefore = await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8");

    assert(targetInfo.researchPath === expectedResearchPath, `researchPath must resolve to deck research directory, got ${targetInfo.researchPath}`);
    assert(supervisionPath(targetInfo, "research") === path.join(expectedResearchPath, "research-supervision.md"), "research supervision path used review domain");
    assert(supervisionPath(targetInfo, "plan") === path.join(targetInfo.reviewPath, "plan-supervision.md"), "plan supervision path changed from review domain");

    const researchArtifacts = researchArtifactPaths(targetInfo);
    assert(researchArtifacts.brief === path.join(expectedResearchPath, "research-brief.md"), "research brief path was not shared from research domain");
    assert(researchArtifacts.report === path.join(expectedResearchPath, "research-report.md"), "research report path was not shared from research domain");
    assert(researchArtifacts.sources === path.join(expectedResearchPath, "research-sources.md"), "research sources path was not shared from research domain");
    assert(researchArtifacts.claims === path.join(expectedResearchPath, "research-claims.md"), "research claims path was not shared from research domain");
    assert(researchArtifacts.openQuestions === path.join(expectedResearchPath, "open-questions.md"), "open questions path was not shared from research domain");
    assert(researchArtifacts.supervision === supervisionPath(targetInfo, "research"), "research supervision path was not shared with artifact manifest");

    await mkdir(expectedResearchPath, { recursive: true });
    await writeFile(
      path.join(expectedResearchPath, "research-supervision.md"),
      [
        "---",
        "command: research",
        `target: ${targetInfo.target}`,
        "generated_at: 2026-06-05T17:10:00+09:00",
        "workflow_run_id: run-research-1",
        "step: supervision",
        "cycle: 1",
        "state: researched",
        "result: passed",
        "blocking_findings: 0",
        "major_findings: 0",
        "minor_findings: 0",
        "info_findings: 0",
        "---",
        "",
        "# Research Supervision",
        "",
      ].join("\n"),
      "utf8",
    );
    assert(isSuccessfulCommandState(targetInfo, "research"), "research supervision in research domain was not detected");

    await rm(path.join(expectedResearchPath, "research-supervision.md"));
    await writeFile(
      path.join(targetInfo.reviewPath, "research-supervision.md"),
      [
        "---",
        "command: research",
        `target: ${targetInfo.target}`,
        "generated_at: 2026-06-05T17:10:00+09:00",
        "workflow_run_id: stale-review-run",
        "step: supervision",
        "cycle: 1",
        "state: researched",
        "result: passed",
        "blocking_findings: 0",
        "major_findings: 0",
        "minor_findings: 0",
        "info_findings: 0",
        "---",
        "",
        "# Stale Review Supervision",
        "",
      ].join("\n"),
      "utf8",
    );
    assert(!isSuccessfulCommandState(targetInfo, "research"), "stale review-domain research supervision satisfied research state");
    assert((await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8")) === briefBefore, "brief.md was touched by research path resolution");
  });

  await check("research reuse sidecar validates target digest and source report before reuse", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReusable topic\n", "utf8");
    const sourceReportPath = path.join(
      root,
      ".takt",
      "runs",
      "run-failed",
      "reports",
      "subworkflows",
      "iteration-1--step-deep_research--workflow-deep-research",
      "reports",
      "research-report.md",
    );
    await mkdir(path.dirname(sourceReportPath), { recursive: true });
    await writeFile(sourceReportPath, "# Built-in Research Report\n\nReusable report\n", "utf8");
    const sourceReportsDir = path.join(root, ".takt", "runs", "run-failed", "reports");
    const sidecarPath = researchReuseSidecarPath(targetInfo, { root });

    const sidecar = await writeResearchReuseSidecar(targetInfo, {
      sourceRun: "run-failed",
      sourceReportsDir,
      sourceReportPath,
    }, { root });
    assert(existsSync(sidecarPath), `research reuse sidecar was not written: ${sidecarPath}`);
    assert(sidecar.target === targetInfo.target, `sidecar target mismatch: ${JSON.stringify(sidecar)}`);
    assert(sidecar.deck === targetInfo.deckName, `sidecar deck mismatch: ${JSON.stringify(sidecar)}`);
    assert(sidecar.research_brief_sha256 === await researchBriefSha256(targetInfo), "sidecar did not persist current research brief digest");

    const reusable = await resolveResearchReuseCandidate(targetInfo, { root });
    assert(reusable, "valid sidecar was not returned as a reuse candidate");
    assert(reusable.source_report_path === sourceReportPath, `reuse candidate source report path mismatch: ${JSON.stringify(reusable)}`);

    await writeResearchReuseSidecar(targetInfo, { sourceRun: "run-target-mismatch", sourceReportsDir, sourceReportPath }, { root });
    const targetMismatch = JSON.parse(await readFile(sidecarPath, "utf8"));
    targetMismatch.target = "slides/other";
    await writeFile(sidecarPath, `${JSON.stringify(targetMismatch, null, 2)}\n`, "utf8");
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "target mismatch sidecar must not become a reuse candidate");
    assert(!existsSync(sidecarPath), "target mismatch sidecar was not deleted as stale");

    await writeResearchReuseSidecar(targetInfo, { sourceRun: "run-digest-mismatch", sourceReportsDir, sourceReportPath }, { root });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nChanged topic\n", "utf8");
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "brief digest mismatch sidecar must not become a reuse candidate");
    assert(!existsSync(sidecarPath), "brief digest mismatch sidecar was not deleted as stale");

    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReusable topic\n", "utf8");
    await writeResearchReuseSidecar(targetInfo, { sourceRun: "run-missing-source", sourceReportsDir, sourceReportPath }, { root });
    await rm(sourceReportPath, { force: true });
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "missing source report sidecar must not become a reuse candidate");
    assert(!existsSync(sidecarPath), "missing source report sidecar was not deleted as stale");

    await mkdir(sourceReportPath, { recursive: true });
    await writeResearchReuseSidecar(targetInfo, { sourceRun: "run-non-file-source", sourceReportsDir, sourceReportPath }, { root });
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "non-file source report sidecar must not become a reuse candidate");
    assert(!existsSync(sidecarPath), "non-file source report sidecar was not deleted as stale");
  });

  await check("research workflow wrapper delegates deep research without copying built-in research facets", async () => {
    const wrapperPath = path.join(ROOT_DIR, ...RESEARCH_WORKFLOW_RELATIVE_PATH.split("/"));
    assert(existsSync(wrapperPath), `research workflow wrapper missing: ${RESEARCH_WORKFLOW_RELATIVE_PATH}`);

    const wrapperSource = await readFile(wrapperPath, "utf8");
    const wrapperSteps = extractWorkflowStepBlocks(wrapperSource);
    const wrapperStepNames = wrapperSteps.map((step) => step.name);
    assert(
      JSON.stringify(wrapperStepNames) === JSON.stringify(RESEARCH_WRAPPER_STEP_NAMES),
      `research wrapper must own only ${RESEARCH_WRAPPER_STEP_NAMES.join(", ")} steps, got: ${wrapperStepNames.join(", ")}`,
    );

    assertWorkflowCallStep(wrapperSource, "deep_research", "deep-research");
    assert(!wrapperSource.includes("network_access: true"), "research wrapper must not enable network_access: true");
    for (const identifier of BUILTIN_RESEARCH_FACET_IDENTIFIERS) {
      assert(!wrapperSource.includes(identifier), `research wrapper must not copy built-in research facet identifier: ${identifier}`);
    }
    for (const fileName of BUILTIN_RESEARCH_OUTPUT_CONTRACT_FILES) {
      assert(!wrapperSource.includes(fileName), `research wrapper must not copy built-in output contract file: ${fileName}`);
    }

    const builtInDeepResearchPath = path.join(ROOT_DIR, "node_modules", "takt", "builtins", "ja", "workflows", "deep-research.yaml");
    assert(existsSync(builtInDeepResearchPath), "built-in deep-research workflow is missing from takt package");
    const builtInDeepResearchSource = await readFile(builtInDeepResearchPath, "utf8");
    assert(builtInDeepResearchSource.includes("network_access: true"), "built-in deep-research must retain its own web access allowance");

    await assertNoLocalBuiltInResearchFacetCopies();
    for (const command of ["plan", "compose", "polish", "deliver"]) {
      const workflowSource = await readFile(path.join(ROOT_DIR, ".takt", "workflows", `takt-marp-slide-${command}.yaml`), "utf8");
      assertWorkflowCallStep(workflowSource, `ai_quality_gate_${command}`, "./takt-marp-slide-ai-quality-gate.yaml");
    }
  });

  await check("research reuse workflow runs adapter and supervision without deep research call", async () => {
    const reuseWorkflowPath = path.join(ROOT_DIR, ...RESEARCH_REUSE_WORKFLOW_RELATIVE_PATH.split("/"));
    assert(existsSync(reuseWorkflowPath), `research reuse workflow missing: ${RESEARCH_REUSE_WORKFLOW_RELATIVE_PATH}`);
    const reuseSource = await readFile(reuseWorkflowPath, "utf8");
    const reuseSteps = extractWorkflowStepBlocks(reuseSource);
    const reuseStepNames = reuseSteps.map((step) => step.name);
    const reuseSuperviseStep = reuseSteps.find((step) => step.name === "supervise_research");
    assert(
      JSON.stringify(reuseStepNames) === JSON.stringify(RESEARCH_REUSE_STEP_NAMES),
      `research reuse workflow must own only ${RESEARCH_REUSE_STEP_NAMES.join(", ")} steps, got: ${reuseStepNames.join(", ")}`,
    );
    assert(reuseSuperviseStep, "research reuse workflow must include supervise_research step");
    assert(!reuseSource.includes("deep_research"), "research reuse workflow must not include a deep_research step");
    assert(!reuseSource.includes("kind: workflow_call"), "research reuse workflow must not call subworkflows");
    assert(!reuseSource.includes("call: deep-research"), "research reuse workflow must not call TAKT built-in deep-research");
    assert(
      reuseSource.includes(`${RESEARCH_ADAPTER_INSTRUCTION.name}: ../facets/instructions/takt-marp-adapt-research.md`),
      `research reuse workflow must register adapter instruction ${RESEARCH_ADAPTER_INSTRUCTION.name}`,
    );
    assert(
      reuseSource.includes(`${RESEARCH_REUSE_SUPERVISION_INSTRUCTION.name}: ../facets/instructions/${path.basename(RESEARCH_REUSE_SUPERVISION_INSTRUCTION.relativePath)}`),
      `research reuse workflow must register reuse supervision instruction ${RESEARCH_REUSE_SUPERVISION_INSTRUCTION.name}`,
    );
    assert(
      reuseSuperviseStep.block.includes(`\n    instruction: ${RESEARCH_REUSE_SUPERVISION_INSTRUCTION.name}\n`),
      `research reuse workflow must use reuse supervision instruction ${RESEARCH_REUSE_SUPERVISION_INSTRUCTION.name}`,
    );
    for (const contract of RESEARCH_ADAPTER_OUTPUT_CONTRACTS) {
      assert(
        reuseSource.includes(`${contract.format}: ../facets/output-contracts/${path.basename(contract.relativePath)}`),
        `research reuse workflow must register output contract format ${contract.format}`,
      );
      assert(
        reuseSource.includes(`name: ${contract.artifactName}`) && reuseSource.includes(`format: ${contract.format}`),
        `research reuse workflow must output ${contract.artifactName} with ${contract.format}`,
      );
    }
    assert(
      reuseSource.includes(`${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}: ../facets/output-contracts/${path.basename(RESEARCH_SUPERVISION_OUTPUT_CONTRACT.relativePath)}`),
      `research reuse workflow must register output contract format ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}`,
    );
    assert(
      reuseSource.includes(`name: ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.artifactName}`) &&
        reuseSource.includes(`format: ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}`),
      `research reuse workflow must output ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.artifactName} with ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}`,
    );
    assert(reuseSource.includes("state: researched"), "research reuse workflow must preserve the researched successful state contract");

    const reuseInstructionPath = path.join(ROOT_DIR, ...RESEARCH_REUSE_SUPERVISION_INSTRUCTION.relativePath.split("/"));
    assert(existsSync(reuseInstructionPath), `research reuse supervision instruction missing: ${RESEARCH_REUSE_SUPERVISION_INSTRUCTION.relativePath}`);
    const reuseInstructionSource = await readFile(reuseInstructionPath, "utf8");
    assert(reuseInstructionSource.includes("research_reuse: true"), "reuse supervision instruction must require reuse marker");
    assert(reuseInstructionSource.includes("research_source_report_path"), "reuse supervision instruction must validate source report path marker");
    assert(reuseInstructionSource.includes("research_source_report_origin: builtin_deep_research"), "reuse supervision instruction must preserve source report origin");
    assert(
      !reuseInstructionSource.includes("workflow_call step"),
      "reuse supervision instruction must not require the full research workflow_call boundary",
    );
  });

  await check("built-in research facet copy detection rejects generic research policy copies", async () => {
    const copiedPolicyPath = path.join(ROOT_DIR, "templates", "project", "facets", "policies", "research.md");
    const builtInPolicyPath = path.join(ROOT_DIR, "node_modules", "takt", "builtins", "ja", "facets", "policies", "research.md");
    await mkdir(path.dirname(copiedPolicyPath), { recursive: true });
    await cp(builtInPolicyPath, copiedPolicyPath);
    try {
      let caught;
      try {
        await assertNoLocalBuiltInResearchFacetCopies();
      } catch (error) {
        caught = error;
      }
      assert(caught, "built-in research policy copy was not rejected");
      assert(
        formatError(caught).includes("templates/project/facets/policies/research.md"),
        `built-in research policy copy error omitted path: ${formatError(caught)}`,
      );
    } finally {
      await rm(copiedPolicyPath, { force: true });
    }
  });

  await check("research adapter derives index artifacts only from built-in report", async () => {
    const wrapperPath = path.join(ROOT_DIR, ...RESEARCH_WORKFLOW_RELATIVE_PATH.split("/"));
    const wrapperSource = await readFile(wrapperPath, "utf8");
    const adapterStep = extractWorkflowStepBlocks(wrapperSource).find((step) => step.name === "adapt_research");
    assert(adapterStep, "adapt_research step is missing");
    assert(
      wrapperSource.includes(`${RESEARCH_ADAPTER_INSTRUCTION.name}: ../facets/instructions/takt-marp-adapt-research.md`),
      `research wrapper must register adapter instruction ${RESEARCH_ADAPTER_INSTRUCTION.name}`,
    );
    assert(adapterStep.block.includes(`\n    instruction: ${RESEARCH_ADAPTER_INSTRUCTION.name}\n`), "adapt_research must use the named adapter instruction");
    assert(adapterStep.block.includes("\n    output_contracts:\n"), "adapt_research must declare output contracts");

    for (const contract of RESEARCH_ADAPTER_OUTPUT_CONTRACTS) {
      assert(
        wrapperSource.includes(`${contract.format}: ../facets/output-contracts/${path.basename(contract.relativePath)}`),
        `research wrapper must register output contract format ${contract.format}`,
      );
      assert(
        adapterStep.block.includes(`name: ${contract.artifactName}`) && adapterStep.block.includes(`format: ${contract.format}`),
        `adapt_research must output ${contract.artifactName} with ${contract.format}`,
      );
    }
    assert(!adapterStep.block.includes("name: research-report.md"), "adapt_research must not output or copy built-in research-report.md");

    const instructionPath = path.join(ROOT_DIR, ...RESEARCH_ADAPTER_INSTRUCTION.relativePath.split("/"));
    assert(existsSync(instructionPath), `research adapter instruction missing: ${RESEARCH_ADAPTER_INSTRUCTION.relativePath}`);
    const instructionSource = await readFile(instructionPath, "utf8");
    assert(instructionSource.includes("research-report.md"), "adapter instruction must name research-report.md");
    assert(instructionSource.includes("only input"), "adapter instruction must state research-report.md is the only input");
    assert(instructionSource.includes("research_reuse"), "adapter instruction must branch on research reuse marker");
    assert(instructionSource.includes("research_source_report_path"), "adapter instruction must read deck-local reuse source report path");
    assert(
      instructionSource.includes("source_report_origin: builtin_deep_research"),
      "adapter instruction must preserve built-in source report origin in reuse mode",
    );
    assert(instructionSource.includes("not_present_in_builtin_report"), "adapter instruction must preserve missing built-in report fields");
    for (const term of RESEARCH_ADAPTER_FORBIDDEN_BOUNDARY_TERMS) {
      assert(instructionSource.toLowerCase().includes(term), `adapter instruction must forbid ${term}`);
    }
    assertResearchAdapterTargetRule(instructionSource, RESEARCH_ADAPTER_INSTRUCTION.relativePath);

    for (const contract of RESEARCH_ADAPTER_OUTPUT_CONTRACTS) {
      const contractPath = path.join(ROOT_DIR, ...contract.relativePath.split("/"));
      assert(existsSync(contractPath), `research adapter output contract missing: ${contract.relativePath}`);
      const contractSource = await readFile(contractPath, "utf8");
      assert(contractSource.includes("not_present_in_builtin_report"), `${contract.relativePath} must document missing built-in report values`);
      assert(contractSource.includes("source_report: research-report.md"), `${contract.relativePath} must trace to built-in research-report.md`);
      for (const field of contract.requiredFields) {
        assert(contractSource.includes(field), `${contract.relativePath} missing model field ${field}`);
      }
      assertResearchAdapterTargetRule(contractSource, contract.relativePath);
    }

    const localResearchReportContractPath = path.join(ROOT_DIR, ".takt", "facets", "output-contracts", "research-report.md");
    assert(!existsSync(localResearchReportContractPath), "repo-local built-in research-report.md output contract must not be added");

    const mockReport = [
      "# Research Report",
      "",
      "## Findings",
      "- Legacy deployment teams still need slide-ready evidence, but this report omits URL, retrieved_at, source mapping, and confidence.",
      "",
      "## Open Questions",
      "- Which migration date is final?",
      "",
    ].join("\n");
    const expectedArtifacts = buildResearchAdapterMissingFieldFixture(mockReport);
    assert(
      Object.values(expectedArtifacts).every((artifact) => artifact.includes("not_present_in_builtin_report")),
      "missing URL, retrieved_at, source mapping, and confidence must remain not_present_in_builtin_report in fixture outputs",
    );
    assert(
      !Object.values(expectedArtifacts).some((artifact) => artifact.includes("https://example.com")),
      "fixture outputs must not fabricate plausible URLs for missing source data",
    );
  });

  await check("research workflow wrapper emits research supervision from handoff marker", async () => {
    const wrapperPath = path.join(ROOT_DIR, ...RESEARCH_WORKFLOW_RELATIVE_PATH.split("/"));
    const wrapperSource = await readFile(wrapperPath, "utf8");
    const superviseStep = extractWorkflowStepBlocks(wrapperSource).find((step) => step.name === "supervise_research");
    assert(superviseStep, "supervise_research step is missing");

    assert(
      wrapperSource.includes(`${RESEARCH_SUPERVISION_INSTRUCTION.name}: ../facets/instructions/${path.basename(RESEARCH_SUPERVISION_INSTRUCTION.relativePath)}`),
      `research wrapper must register supervision instruction ${RESEARCH_SUPERVISION_INSTRUCTION.name}`,
    );
    assert(
      superviseStep.block.includes(`\n    instruction: ${RESEARCH_SUPERVISION_INSTRUCTION.name}\n`),
      "supervise_research must use the named research supervision instruction",
    );
    assert(superviseStep.block.includes("\n    output_contracts:\n"), "supervise_research must declare output contracts");
    assert(
      wrapperSource.includes(`${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}: ../facets/output-contracts/${path.basename(RESEARCH_SUPERVISION_OUTPUT_CONTRACT.relativePath)}`),
      `research wrapper must register output contract format ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}`,
    );
    assert(
      superviseStep.block.includes(`name: ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.artifactName}`) &&
        superviseStep.block.includes(`format: ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}`),
      `supervise_research must output ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.artifactName} with ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.format}`,
    );

    const instructionPath = path.join(ROOT_DIR, ...RESEARCH_SUPERVISION_INSTRUCTION.relativePath.split("/"));
    assert(existsSync(instructionPath), `research supervision instruction missing: ${RESEARCH_SUPERVISION_INSTRUCTION.relativePath}`);
    const instructionSource = await readFile(instructionPath, "utf8");
    assert(instructionSource.includes(".takt/workflow-current-target.json"), "supervision instruction must read the handoff marker");
    assert(instructionSource.includes("user-facing target"), "supervision instruction must distinguish user-facing target");
    assert(
      instructionSource.includes("research-brief.md"),
      "supervision instruction must name the research brief target that must not be used as front matter target",
    );
    assert(instructionSource.includes("research-supervision.md"), "supervision instruction must require research-supervision.md output");

    const contractPath = path.join(ROOT_DIR, ...RESEARCH_SUPERVISION_OUTPUT_CONTRACT.relativePath.split("/"));
    assert(existsSync(contractPath), `research supervision output contract missing: ${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.relativePath}`);
    const contractSource = await readFile(contractPath, "utf8");
    for (const field of RESEARCH_SUPERVISION_OUTPUT_CONTRACT.requiredFields) {
      assert(contractSource.includes(field), `${RESEARCH_SUPERVISION_OUTPUT_CONTRACT.relativePath} missing required field ${field}`);
    }
    assert(
      contractSource.includes(".takt/workflow-current-target.json") && contractSource.includes("research_brief_path"),
      "research supervision contract must document handoff marker awareness",
    );
    assert(
      contractSource.includes("must not be") && contractSource.includes("research-brief.md"),
      "research supervision contract must reject using the research brief path as front matter target",
    );
  });

  await check("research supervision validator covers passed, rejected, and target mismatch fixtures", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    await mkdir(targetInfo.researchPath, { recursive: true });
    const filePath = supervisionPath(targetInfo, "research");

    await writeFile(
      filePath,
      researchSupervisionFixture(targetInfo, {
        state: "researched",
        result: "passed",
        workflowRunId: "run-research-passed",
      }),
      "utf8",
    );
    const passed = await readSupervision(targetInfo, "research");
    assert(passed.data.command === "research", "passed fixture command was not read");
    assert(passed.data.state === "researched", "passed research fixture state was not researched");
    assert(isSuccessfulCommandState(targetInfo, "research"), "passed researched supervision must be successful");

    await writeFile(
      filePath,
      researchSupervisionFixture(targetInfo, {
        state: "planned",
        result: "passed",
        workflowRunId: "run-research-wrong-state",
      }),
      "utf8",
    );
    await expectFailure(() => readSupervision(targetInfo, "research"), "STATE_MISMATCH");
    assert(!isSuccessfulCommandState(targetInfo, "research"), "passed research with wrong state must not be successful");

    await writeFile(
      filePath,
      researchSupervisionFixture(targetInfo, {
        state: "needs_research_revision",
        result: "rejected",
        workflowRunId: "run-research-rejected",
      }),
      "utf8",
    );
    const rejected = await readSupervision(targetInfo, "research");
    assert(rejected.data.result === "rejected", "rejected research fixture was not read");
    assert((await commandSupervisionResult(targetInfo, "research")) === "rejected", "rejected research result was not detected");
    assert(!isSuccessfulCommandState(targetInfo, "research"), "rejected research must not be successful");

    await writeFile(
      filePath,
      researchSupervisionFixture(targetInfo, {
        target: "slides/demo/research/research-brief.md",
        state: "researched",
        result: "passed",
        workflowRunId: "run-research-brief-target",
      }),
      "utf8",
    );
    await expectFailure(() => readSupervision(targetInfo, "research"), "FIELD_MISMATCH");
    assert(!isSuccessfulCommandState(targetInfo, "research"), "research brief target must not satisfy user-facing target validation");
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

  await check("workflow availability accepts selected bundled template source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-bundled-"));
    const source = resolveTemplateSource({ projectRoot: root });
    const selectedWorkflowPath = workflowFilePath(source, "plan");

    assert(source.kind === "bundled", `expected bundled source for project without .takt, got: ${source.kind}`);
    assert(
      assertWorkflowAvailable("plan", { root, workflowFilePath: selectedWorkflowPath }) === selectedWorkflowPath,
      "selected bundled workflow file path was not used by workflow availability",
    );
    assert(!existsSync(path.join(root, ".takt")), "selected bundled workflow availability created project-local .takt");
  });

  await check("workflow availability accepts selected ejected template source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-ejected-"));
    await mkdir(path.join(root, ".takt", "workflows"), { recursive: true });
    await mkdir(path.join(root, ".takt", "facets"), { recursive: true });
    const source = resolveTemplateSource({ projectRoot: root });
    const selectedWorkflowPath = workflowFilePath(source, "compose");
    await writeFile(selectedWorkflowPath, "name: takt-marp-slide-compose\n", "utf8");

    assert(source.kind === "ejected", `expected ejected source, got: ${source.kind}`);
    assert(
      assertWorkflowAvailable("compose", { root: path.join(root, "other-root"), workflowFilePath: selectedWorkflowPath }) === selectedWorkflowPath,
      "selected ejected workflow file path was not used by workflow availability",
    );
  });

  await check("workflow availability keeps project-local .takt default", async () => {
    const root = await fixtureRoot();
    const expected = path.join(root, ".takt", "workflows", "takt-marp-slide-plan.yaml");
    assert(
      assertWorkflowAvailable("plan", { root }) === expected,
      "default workflow availability no longer resolves project-local .takt workflow",
    );
  });

  await check("runner rejects invalid target before workflow or TAKT checks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-invalid-target-order-"));
    const fakePackage = await makeFakePackageRoot();
    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "deck"], { cwd: root, encoding: "utf8" });
    assert(result.status !== 0, "runner unexpectedly accepted invalid target");
    assert(result.stderr.includes("INVALID_TARGET:"), `invalid target did not surface INVALID_TARGET: ${result.stderr}`);
    assert(!result.stderr.includes("WORKFLOW_NOT_IMPLEMENTED"), `workflow availability ran before invalid target: ${result.stderr}`);
    assert(!result.stderr.includes("TAKT_EXECUTABLE_MISSING"), `TAKT check ran before invalid target: ${result.stderr}`);
  });

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

  await check("runner preserves Design Contract marker for polish", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-polish-design-marker-"));
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    const planWorkflowPath = await makeSelectedWorkflowFile("plan");
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-plan"], "passed"));
    let result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", planWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `plan runner failed before polish marker test: ${result.stderr}`);
    await writeApproval(targetInfo, "plan", "foundation-test");
    await writeSupervision(targetInfo, "compose", "composed", "passed", "run-compose");
    await writeApproval(targetInfo, "compose", "foundation-test");

    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    result = spawnSync(
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

  await check("runner ignores stale Design Contract marker for polish", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-polish-stale-design-marker-"));
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    const planWorkflowPath = await makeSelectedWorkflowFile("plan");
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-plan"], "passed"));
    let result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", planWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `plan runner failed before stale marker test: ${result.stderr}`);
    const planMarker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(planMarker.design_contract?.path, `plan marker did not create design_contract: ${JSON.stringify(planMarker)}`);
    await rm(path.join(root, planMarker.design_contract.path), { force: true });
    await writeApproval(targetInfo, "plan", "foundation-test");
    await writeSupervision(targetInfo, "compose", "composed", "passed", "run-compose");
    await writeApproval(targetInfo, "compose", "foundation-test");

    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed after stale marker setup: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch: ${JSON.stringify(marker)}`);
    assert(!marker.design_contract, `polish marker kept stale design_contract: ${JSON.stringify(marker)}`);
  });

  await check("research runner requires research brief before TAKT", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-missing-brief-"));
    const targetInfo = await makeDeck(root, "demo");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");
    const briefBefore = await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "research runner unexpectedly succeeded without research brief");
    assert(result.stderr.includes("PREREQUISITE_MISSING:"), `missing research brief did not report PREREQUISITE_MISSING: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite missing research brief");
    assert((await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8")) === briefBefore, "research runner inferred or changed deck brief.md");
  });

  await check("research runner targets research brief and writes handoff marker", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-valid-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const expectedResearchBriefPath = "slides/demo/research/research-brief.md";
    const expectedResearchOutputDir = "slides/demo/research";
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");
    const briefBefore = await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `research runner failed: ${result.stderr}`);
    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(args[workflowArgIndex + 1] === selectedWorkflowPath, `TAKT did not receive selected research workflow file path: ${args.join(" ")}`);
    const targetArgIndex = args.indexOf("-t");
    assert(targetArgIndex >= 0, `TAKT args did not include -t: ${args.join(" ")}`);
    assert(args[targetArgIndex + 1] === expectedResearchBriefPath, `research TAKT target was not research brief: ${args.join(" ")}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "research", `research marker command mismatch: ${JSON.stringify(marker)}`);
    assert(marker.target === targetInfo.target, `research marker target should stay user-facing: ${JSON.stringify(marker)}`);
    assert(marker.research_brief_path === expectedResearchBriefPath, `research marker missing brief path: ${JSON.stringify(marker)}`);
    assert(marker.research_output_dir === expectedResearchOutputDir, `research marker missing output dir: ${JSON.stringify(marker)}`);
    assert(!path.isAbsolute(marker.research_brief_path), `research marker brief path must be target-relative: ${JSON.stringify(marker)}`);
    assert(!path.isAbsolute(marker.research_output_dir), `research marker output dir must be target-relative: ${JSON.stringify(marker)}`);
    assert(
      !existsSync(path.join(targetInfo.reviewPath, "research-supervision.md")),
      "research runner leaked research supervision into review domain",
    );
    assert((await readFile(path.join(targetInfo.deckPath, "brief.md"), "utf8")) === briefBefore, "research runner changed deck brief.md");
  });

  await check("research runner syncs current built-in report and adapter outputs to research domain", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-sync-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const briefBefore = await readFile(researchArtifacts.brief, "utf8");
    await writeStaleResearchRun(root, targetInfo.target);
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    const expectedReport = "# Built-in Research Report\n\npreferred current report\n";
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target, {
        sourceReports: [
          {
            relativePath: "research-report.md",
            lines: ["# Adapter Shadow Report", "", "must not be synced"],
          },
          {
            relativePath: "subworkflows/iteration-1--step-deep_research--workflow-deep-research/reports/research-report.md",
            lines: expectedReport.trimEnd().split("\n"),
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `research sync run failed: ${result.stderr}`);
    assert((await readFile(researchArtifacts.report, "utf8")) === expectedReport, "research-report.md was not copied byte-for-byte from preferred built-in report");
    assert((await readFile(researchArtifacts.sources, "utf8")).includes("# Research Sources run-current"), "research-sources.md was not synced from current adapter output");
    assert((await readFile(researchArtifacts.claims, "utf8")).includes("# Research Claims run-current"), "research-claims.md was not synced from current adapter output");
    assert((await readFile(researchArtifacts.openQuestions, "utf8")).includes("# Open Questions run-current"), "open-questions.md was not synced from current adapter output");
    assert((await readFile(researchArtifacts.supervision, "utf8")).includes("workflow_run_id: run-current"), "research-supervision.md was not synced from current run");
    assert(!(await readFile(researchArtifacts.report, "utf8")).includes("must not be synced"), "non-preferred research-report.md replaced the built-in deep research report");
    assert(!(await readFile(researchArtifacts.report, "utf8")).includes("stale run"), "stale run research report was synced");
    for (const fileName of ["research-report.md", "research-sources.md", "research-claims.md", "open-questions.md", "research-supervision.md"]) {
      assert(!existsSync(path.join(targetInfo.reviewPath, fileName)), `research artifact leaked into review domain: ${fileName}`);
    }
    assert((await readFile(researchArtifacts.brief, "utf8")) === briefBefore, "research sync changed research-brief.md");
  });

  await check("research runner refuses sync when built-in source report is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-missing-source-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target, { sourceReports: [] }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "research sync unexpectedly succeeded without built-in source report");
    assert(result.stderr.includes("TAKT_RESEARCH_SOURCE_REPORT_MISSING:"), `missing source report did not use explicit error: ${result.stderr}`);
    for (const finalPath of [researchArtifacts.report, researchArtifacts.sources, researchArtifacts.claims, researchArtifacts.openQuestions, researchArtifacts.supervision]) {
      assert(!existsSync(finalPath), `research sync wrote artifact despite missing source report: ${path.relative(root, finalPath)}`);
    }
  });

  await check("research runner refuses non-deep-research subworkflow source report fallback", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-nondeep-source-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target, {
        sourceReports: [
          {
            relativePath: "subworkflows/iteration-1--step-other_research--workflow-other-research/reports/research-report.md",
            lines: ["# Non Deep Research Report"],
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "research sync unexpectedly accepted a non-deep-research subworkflow source report");
    assert(result.stderr.includes("TAKT_RESEARCH_SOURCE_REPORT_MISSING:"), `non-deep-research source report did not use missing error: ${result.stderr}`);
    for (const finalPath of [researchArtifacts.report, researchArtifacts.sources, researchArtifacts.claims, researchArtifacts.openQuestions, researchArtifacts.supervision]) {
      assert(!existsSync(finalPath), `research sync wrote artifact despite non-deep-research source report: ${path.relative(root, finalPath)}`);
    }
  });

  await check("research runner refuses sync when preferred built-in source reports are ambiguous", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-ambiguous-source-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target, {
        sourceReports: [
          {
            relativePath: "subworkflows/iteration-1--step-deep_research--workflow-deep-research/reports/research-report.md",
            lines: ["# First Built-in Report"],
          },
          {
            relativePath: "subworkflows/iteration-2--step-deep_research--workflow-deep-research/reports/research-report.md",
            lines: ["# Second Built-in Report"],
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "research sync unexpectedly succeeded with ambiguous built-in source reports");
    assert(result.stderr.includes("TAKT_RESEARCH_SOURCE_REPORT_AMBIGUOUS:"), `ambiguous source report did not use explicit error: ${result.stderr}`);
    for (const finalPath of [researchArtifacts.report, researchArtifacts.sources, researchArtifacts.claims, researchArtifacts.openQuestions, researchArtifacts.supervision]) {
      assert(!existsSync(finalPath), `research sync wrote artifact despite ambiguous source report: ${path.relative(root, finalPath)}`);
    }
  });

  await check("research runner fails before TAKT when wrapper workflow is unavailable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-missing-wrapper-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScript("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "research runner unexpectedly succeeded without wrapper workflow");
    assert(result.stderr.includes("WORKFLOW_NOT_IMPLEMENTED:"), `missing research wrapper did not report WORKFLOW_NOT_IMPLEMENTED: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite missing research wrapper workflow");
  });

  await check("research runner fails before TAKT when built-in deep research is unavailable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-missing-builtin-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScript("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "research runner unexpectedly succeeded without TAKT built-in deep research");
    assert(result.stderr.includes("BUILTIN_WORKFLOW_NOT_AVAILABLE:"), `missing built-in did not report BUILTIN_WORKFLOW_NOT_AVAILABLE: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite missing TAKT built-in deep research");
  });

  await check("research force checks built-in deep research before invalidating artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-force-missing-builtin-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nForce missing built-in\n", "utf8");
    await writeFile(researchArtifacts.report, "# Existing Research Report\n", "utf8");
    await writeFile(researchArtifacts.sources, "# Existing Research Sources\n", "utf8");
    await writeFile(researchArtifacts.claims, "# Existing Research Claims\n", "utf8");
    await writeFile(researchArtifacts.openQuestions, "# Existing Open Questions\n", "utf8");
    await writeSupervision(targetInfo, "research", "researched", "passed", "run-research-existing");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-should-not-start", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath, "--force"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "research force unexpectedly succeeded without TAKT built-in deep research");
    assert(result.stderr.includes("BUILTIN_WORKFLOW_NOT_AVAILABLE:"), `force missing built-in did not report BUILTIN_WORKFLOW_NOT_AVAILABLE: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked before force built-in preflight completed");
    assert(await resolveResearchReuseCandidate(targetInfo, { root }), "force missing built-in deleted existing reuse sidecar");
    assert(!existsSync(path.join(targetInfo.researchPath, "history")), "force missing built-in archived research artifacts before preflight");
    assert((await readFile(researchArtifacts.report, "utf8")) === "# Existing Research Report\n", "force missing built-in changed research-report.md");
    assert((await readFile(researchArtifacts.sources, "utf8")) === "# Existing Research Sources\n", "force missing built-in changed research-sources.md");
    assert((await readFile(researchArtifacts.claims, "utf8")) === "# Existing Research Claims\n", "force missing built-in changed research-claims.md");
    assert((await readFile(researchArtifacts.openQuestions, "utf8")) === "# Existing Open Questions\n", "force missing built-in changed open-questions.md");
  });

  await check("research reuse mode bypasses built-in deep research availability preflight", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-no-builtin-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse without built-in deep research\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-reuse-no-builtin", "passed", targetInfo.target, { sourceReports: [] }));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `reuse mode should not require TAKT built-in deep research: ${result.stderr}`);
    assert(existsSync(argsPath), "reuse mode did not invoke TAKT after bypassing built-in deep research preflight");
    assert(!result.stderr.includes("BUILTIN_WORKFLOW_NOT_AVAILABLE:"), `reuse mode still failed built-in preflight: ${result.stderr}`);
  });

  await check("bundled research reuse mode skips callable deep research staging", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-bundled-no-builtin-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nBundled reuse without built-in deep research\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const fakePackage = await makeFakePackageRoot();
    const fakeTemplateRoot = path.join(fakePackage.packageRoot, "templates", "project");
    await cp(path.join(ROOT_DIR, "templates", "project"), fakeTemplateRoot, { recursive: true });
    const source = resolveTemplateSource({ projectRoot: root, templateRoot: fakeTemplateRoot });
    const selectedWorkflowPath = workflowFilePath(source, "research");
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-bundled-reuse-no-builtin", "passed", targetInfo.target, { sourceReports: [] }),
    );
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `bundled reuse mode should not stage TAKT built-in deep research: ${result.stderr}`);
    assert(existsSync(argsPath), "bundled reuse mode did not invoke TAKT");
    assert(!result.stderr.includes("BUILTIN_WORKFLOW_NOT_AVAILABLE:"), `bundled reuse mode still failed built-in staging: ${result.stderr}`);
    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(
      args[workflowArgIndex + 1].endsWith("workflows/takt-marp-slide-research-reuse.yaml"),
      `bundled reuse mode did not select the staged sibling reuse workflow: ${args.join(" ")}`,
    );
  });

  await check("research successful rerun without force is blocked before TAKT", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-rerun-blocked-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    await writeSupervision(targetInfo, "research", "researched", "passed", "run-research-1");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "research runner unexpectedly allowed successful rerun");
    assert(result.stderr.includes("RERUN_BLOCKED:"), `research rerun did not report RERUN_BLOCKED: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT started despite research rerun blocking");
  });

  await check("research force archives only research-domain artifacts and preserves review approvals", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-force-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    await writeFile(researchArtifacts.report, "# Existing Research Report\n", "utf8");
    await writeFile(researchArtifacts.sources, "# Existing Research Sources\n", "utf8");
    await writeFile(researchArtifacts.claims, "# Existing Research Claims\n", "utf8");
    await writeFile(researchArtifacts.openQuestions, "# Existing Open Questions\n", "utf8");
    await writeSupervision(targetInfo, "research", "researched", "passed", "run-research-1");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await writeApproval(targetInfo, "plan", "foundation-test");
    const planSupervisionPath = supervisionPath(targetInfo, "plan");
    const planApprovalPath = path.join(targetInfo.reviewPath, "plan-approval.md");
    const planSupervisionBefore = await readFile(planSupervisionPath, "utf8");
    const planApprovalBefore = await readFile(planApprovalPath, "utf8");
    const distDeckPath = path.join(root, "dist", "demo");
    const renderDeckPath = path.join(root, ".takt", "render", "demo");
    await mkdir(distDeckPath, { recursive: true });
    await writeFile(path.join(distDeckPath, "old.pdf"), "stale pdf", "utf8");
    await mkdir(renderDeckPath, { recursive: true });
    await writeFile(path.join(renderDeckPath, "metadata.json"), "{}", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath, "--force"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `research force rerun failed: ${result.stderr}`);
    const researchHistoryFiles = await readdir(path.join(targetInfo.researchPath, "history"));
    assert(
      researchHistoryFiles.some((name) => name.endsWith("force-research-supervision.md")),
      `research force did not archive supervision under research/history: ${researchHistoryFiles.join(", ")}`,
    );
    for (const fileName of ["research-report.md", "research-sources.md", "research-claims.md", "open-questions.md"]) {
      assert(
        researchHistoryFiles.some((name) => name.endsWith(`force-${fileName}`)),
        `research force did not archive ${fileName} under research/history: ${researchHistoryFiles.join(", ")}`,
      );
      assert(existsSync(path.join(targetInfo.researchPath, fileName)), `research force did not sync new ${fileName} into research domain`);
    }
    assert((await readFile(researchArtifacts.report, "utf8")).includes("Current report from run-current."), "research force kept stale research-report.md content");
    assert(existsSync(researchArtifacts.brief), "research force archived research-brief.md source input");
    assert(existsSync(path.join(distDeckPath, "old.pdf")), "research force cleaned dist deck output");
    assert(existsSync(path.join(renderDeckPath, "metadata.json")), "research force cleaned TAKT render output");
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "research force created review/history");
    assert((await readFile(planSupervisionPath, "utf8")) === planSupervisionBefore, "research force changed review plan supervision");
    assert((await readFile(planApprovalPath, "utf8")) === planApprovalBefore, "research force changed review plan approval");
  });

  await check("rejected research rerun archives research supervision under research history and invokes TAKT", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-rejected-rerun-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    await writeSupervision(targetInfo, "research", "none", "rejected", "run-research-1");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `rejected research rerun failed: ${result.stderr}`);
    assert(existsSync(argsPath), "TAKT was not invoked after rejected research archive");
    const researchHistoryFiles = await readdir(path.join(targetInfo.researchPath, "history"));
    assert(
      researchHistoryFiles.some((name) => name.endsWith("rejected-rerun-research-supervision.md")),
      `rejected research supervision was not archived under research/history: ${researchHistoryFiles.join(", ")}`,
    );
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "rejected research rerun created review/history");
  });

  await check("research zero-exit rejected supervision creates reuse sidecar", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-zero-exit-rejected-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nZero exit rejected\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-rejected-zero", "rejected", targetInfo.target));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "zero-exit rejected research unexpectedly succeeded");
    assert(
      result.stderr.includes("TAKT_RESEARCH_SUPERVISION_NOT_PASSED:"),
      `zero-exit rejected research did not report TAKT_RESEARCH_SUPERVISION_NOT_PASSED: ${result.stderr}`,
    );
    const candidate = await resolveResearchReuseCandidate(targetInfo, { root });
    assert(candidate, "zero-exit rejected research did not create a reuse sidecar");
    assert(candidate.source_run === "run-rejected-zero", `zero-exit rejected sidecar source run mismatch: ${JSON.stringify(candidate)}`);
    assert(candidate.source_report_path.includes("workflow-deep-research"), `zero-exit rejected sidecar did not point at built-in report: ${candidate.source_report_path}`);
    assert(!existsSync(researchArtifacts.report), "zero-exit rejected research synced research-report.md despite rejected supervision");
  });

  await check("research zero-exit artifact sync failure creates reuse sidecar", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-zero-exit-sync-missing-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nZero exit sync missing\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-sync-missing-zero", "passed", targetInfo.target, {
        extraLines: ['rm ".takt/runs/run-sync-missing-zero/reports/research-sources.md"'],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "zero-exit artifact sync failure unexpectedly succeeded");
    assert(
      result.stderr.includes("TAKT_RESEARCH_ARTIFACT_SYNC_MISSING:"),
      `zero-exit artifact sync failure did not report TAKT_RESEARCH_ARTIFACT_SYNC_MISSING: ${result.stderr}`,
    );
    const candidate = await resolveResearchReuseCandidate(targetInfo, { root });
    assert(candidate, "zero-exit artifact sync failure did not create a reuse sidecar");
    assert(candidate.source_run === "run-sync-missing-zero", `zero-exit sync failure sidecar source run mismatch: ${JSON.stringify(candidate)}`);
    assert(!existsSync(researchArtifacts.report), "zero-exit artifact sync failure synced research-report.md despite missing adapter artifact");
  });

  await check("research TAKT failure preserves existing plan state and review artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-external-failure-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-plan-1");
    await writeApproval(targetInfo, "plan", "foundation-test");
    const planSupervisionPath = supervisionPath(targetInfo, "plan");
    const planApprovalPath = path.join(targetInfo.reviewPath, "plan-approval.md");
    const planSupervisionBefore = await readFile(planSupervisionPath, "utf8");
    const planApprovalBefore = await readFile(planApprovalPath, "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeFailingTaktScript(42));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 42, `research failure should return TAKT exit code 42, got ${result.status}: ${result.stderr}`);
    assert((await readFile(planSupervisionPath, "utf8")) === planSupervisionBefore, "research failure changed review plan supervision");
    assert((await readFile(planApprovalPath, "utf8")) === planApprovalBefore, "research failure changed review plan approval");
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "research failure archived review artifacts");
  });

  await check("failed research run creates reuse sidecar from current workflow identity and deep report", async () => {
    const workflowCases = [
      { label: "workflow-name", workflow: "takt-marp-slide-research" },
      { label: "workflow-path", workflow: await makeSelectedWorkflowFile("research") },
    ];

    for (const testCase of workflowCases) {
      const root = await mkdtemp(path.join(os.tmpdir(), `slide-workflow-research-reuse-candidate-${testCase.label}-`));
      const targetInfo = await makeDeck(root, "demo");
      const researchArtifacts = researchArtifactPaths(targetInfo);
      await mkdir(targetInfo.researchPath, { recursive: true });
      await writeFile(researchArtifacts.brief, `# Research Brief\n\n${testCase.label}\n`, "utf8");
      const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
      const fakePackage = await makeFakePackageRoot();
      await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
      await makeTaktExecutable(
        fakePackage.packageRoot,
        fakeFailingResearchTaktScriptWithReuseMeta("run-current", targetInfo, {
          workflow: testCase.workflow,
          exitCode: 42,
          sourceReports: [
            {
              relativePath: "subworkflows/iteration-1--step-deep_research--workflow-deep-research/reports/research-report.md",
              lines: [`# Built-in Research Report ${testCase.label}`, "", "Reusable failed run report."],
            },
          ],
        }),
      );

      const result = spawnSync(
        process.execPath,
        [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
        { cwd: root, encoding: "utf8" },
      );
      assert(result.status === 42, `failed research should preserve TAKT exit code for ${testCase.label}, got ${result.status}: ${result.stderr}`);
      const candidate = await resolveResearchReuseCandidate(targetInfo, { root });
      assert(candidate, `failed research did not create a reusable sidecar for ${testCase.label}`);
      assert(candidate.source_run === "run-current", `sidecar source_run mismatch for ${testCase.label}: ${JSON.stringify(candidate)}`);
      assert(
        candidate.source_report_path.endsWith("workflow-deep-research/reports/research-report.md"),
        `sidecar source report path must point at deep research report for ${testCase.label}: ${JSON.stringify(candidate)}`,
      );
      assert(!existsSync(researchArtifacts.report), `failed full research should not sync deck-local report before reuse: ${researchArtifacts.report}`);
    }
  });

  await check("failed research run without reusable deep report does not create reuse sidecar", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-no-report-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nNo report\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeFailingResearchTaktScriptWithReuseMeta("run-current", targetInfo, {
        workflow: "takt-marp-slide-research",
        exitCode: 43,
        sourceReports: [],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 43, `failed research without reusable report should preserve TAKT exit code, got ${result.status}: ${result.stderr}`);
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "missing deep research report created a reuse sidecar");
    assert(!existsSync(researchReuseSidecarPath(targetInfo, { root })), "missing deep research report left a sidecar file");
  });

  await check("failed research run with missing reports directory does not replace TAKT exit code", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-missing-reports-dir-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nMissing reports directory\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeFailingResearchTaktScriptWithReuseMeta("run-current", targetInfo, {
        workflow: selectedWorkflowPath,
        exitCode: 46,
        createReportsDir: false,
        sourceReports: [],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 46, `missing reports directory should preserve TAKT exit code 46, got ${result.status}: ${result.stderr}`);
    assert(!result.stderr.includes("ENOENT"), `missing reports directory leaked raw ENOENT: ${result.stderr}`);
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "missing reports directory created a reuse sidecar");
    assert(!existsSync(researchReuseSidecarPath(targetInfo, { root })), "missing reports directory left a sidecar file");
  });

  await check("failed research run rejects ambiguous reusable reports without sidecar", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-ambiguous-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nAmbiguous report\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeFailingResearchTaktScriptWithReuseMeta("run-current", targetInfo, {
        workflow: selectedWorkflowPath,
        exitCode: 44,
        sourceReports: [
          {
            relativePath: "subworkflows/iteration-1--step-deep_research--workflow-deep-research/reports/research-report.md",
            lines: ["# First Built-in Research Report"],
          },
          {
            relativePath: "subworkflows/iteration-2--step-deep_research--workflow-deep-research/reports/research-report.md",
            lines: ["# Second Built-in Research Report"],
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 44, `ambiguous failed research should preserve TAKT exit code 44, got ${result.status}: ${result.stderr}`);
    assert(result.stderr.includes("TAKT_RESEARCH_REUSE_AMBIGUOUS:"), `ambiguous reuse candidate did not report TAKT_RESEARCH_REUSE_AMBIGUOUS: ${result.stderr}`);
    assert(await resolveResearchReuseCandidate(targetInfo, { root }) === null, "ambiguous reusable reports created a sidecar");
    assert(!existsSync(researchReuseSidecarPath(targetInfo, { root })), "ambiguous reusable reports left a sidecar file");
  });

  await check("research reuse mode writes marker metadata and deletes sidecar on success", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-success-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse success\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-reuse-success", "passed", targetInfo.target));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `reuse research success failed: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.research_reuse === true, `reuse marker flag missing: ${JSON.stringify(marker)}`);
    assert(
      marker.research_source_report_path === "slides/demo/research/research-report.md",
      `reuse marker source report path mismatch: ${JSON.stringify(marker)}`,
    );
    assert(marker.research_source_report_origin === "builtin_deep_research", `reuse marker origin mismatch: ${JSON.stringify(marker)}`);
    assert(!existsSync(researchReuseSidecarPath(targetInfo, { root })), "reuse success did not delete sidecar");
  });

  await check("research reuse mode copies source report before TAKT and keeps it authoritative", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-source-copy-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse source report copy\n", "utf8");
    const reusable = await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const expectedReport = await readFile(reusable.sourceReportPath, "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-reuse-source-copy", "passed", targetInfo.target, { sourceReports: [] }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `reuse source report copy failed: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(
      marker.research_source_report_path === "slides/demo/research/research-report.md",
      `reuse marker must point at deck-local source report copy: ${JSON.stringify(marker)}`,
    );
    assert(
      await readFile(researchArtifacts.report, "utf8") === expectedReport,
      "reuse source report copy was not preserved byte-for-byte as deck-local research-report.md",
    );
  });

  await check("research reuse non-file source report invalidates sidecar and falls back to full research", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-source-copy-fail-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse source report copy failure\n", "utf8");
    await writeFile(researchArtifacts.report, "# Existing Deck Research Report\n", "utf8");
    const reusable = await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    await rm(reusable.sourceReportPath, { force: true });
    await mkdir(reusable.sourceReportPath, { recursive: true });
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-should-not-start", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `non-file reuse source report should fall back to full research: ${result.stderr}`);
    assert(existsSync(argsPath), "TAKT was not invoked for full research fallback");
    assert(!(await resolveResearchReuseCandidate(targetInfo, { root })), "non-file reuse source report sidecar was not invalidated");
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.research_reuse !== true, `non-file reuse source report unexpectedly entered reuse mode: ${JSON.stringify(marker)}`);
    assert(
      await readFile(researchArtifacts.report, "utf8") !== "# Existing Deck Research Report\n",
      "full research fallback did not replace stale deck-local research-report.md",
    );
  });

  await check("research reuse failure preserves sidecar for retry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-failure-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse failure\n", "utf8");
    await writeFile(researchArtifacts.report, "# Existing Successful Research Report\n", "utf8");
    await writeFile(researchArtifacts.sources, "# Existing Research Sources\n", "utf8");
    const reusable = await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeFailingTaktScript(45));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 45, `reuse failure should preserve TAKT exit code 45, got ${result.status}: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.research_reuse === true, `reuse failure marker flag missing: ${JSON.stringify(marker)}`);
    assert(
      marker.research_source_report_path === "slides/demo/research/research-report.md",
      `reuse failure marker source report path mismatch: ${JSON.stringify(marker)}`,
    );
    assert(await resolveResearchReuseCandidate(targetInfo, { root }), "reuse failure did not preserve sidecar for retry");
    assert(
      await readFile(researchArtifacts.report, "utf8") === "# Existing Successful Research Report\n",
      "reuse failure did not roll back deck-local research-report.md",
    );
    assert(
      await readFile(researchArtifacts.sources, "utf8") === "# Existing Research Sources\n",
      "reuse failure changed existing research-sources.md",
    );
  });

  await check("research reuse invalid successful supervision preserves sidecar for retry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-invalid-success-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse invalid successful supervision\n", "utf8");
    await writeFile(researchArtifacts.report, "# Existing Successful Research Report\n", "utf8");
    await writeFile(researchArtifacts.sources, "# Existing Research Sources\n", "utf8");
    await writeFile(researchArtifacts.claims, "# Existing Research Claims\n", "utf8");
    await writeFile(researchArtifacts.openQuestions, "# Existing Open Questions\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-reuse-invalid-success", "passed", targetInfo.target, {
        sourceReports: [],
        supervisionState: "planned",
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "reuse invalid successful supervision unexpectedly succeeded");
    assert(
      result.stderr.includes("TAKT_RESEARCH_SUPERVISION_NOT_PASSED:"),
      `reuse invalid successful supervision did not report TAKT_RESEARCH_SUPERVISION_NOT_PASSED: ${result.stderr}`,
    );
    assert(await resolveResearchReuseCandidate(targetInfo, { root }), "reuse invalid successful supervision did not preserve sidecar for retry");
    assert(
      await readFile(researchArtifacts.report, "utf8") === "# Existing Successful Research Report\n",
      "reuse invalid successful supervision did not roll back deck-local research-report.md",
    );
    assert(
      await readFile(researchArtifacts.sources, "utf8") === "# Existing Research Sources\n",
      "reuse invalid successful supervision changed existing research-sources.md before supervision validation",
    );
    assert(
      await readFile(researchArtifacts.claims, "utf8") === "# Existing Research Claims\n",
      "reuse invalid successful supervision changed existing research-claims.md before supervision validation",
    );
    assert(
      await readFile(researchArtifacts.openQuestions, "utf8") === "# Existing Open Questions\n",
      "reuse invalid successful supervision changed existing open-questions.md before supervision validation",
    );
  });

  await check("research reuse rejects changed source report before committing artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-mutated-report-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse mutated source report\n", "utf8");
    await writeFile(researchArtifacts.report, "# Existing Successful Research Report\n", "utf8");
    await writeFile(researchArtifacts.sources, "# Existing Research Sources\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(
      fakePackage.packageRoot,
      fakeResearchTaktScriptWithArtifacts("run-reuse-mutated-report", "passed", targetInfo.target, {
        sourceReports: [],
        extraLines: [
          `cat > "${path.posix.join(targetInfo.target, "research", "research-report.md")}" <<'EOF'`,
          "# Mutated Reuse Source Report",
          "",
          "Adapter should not rewrite the authoritative source report.",
          "EOF",
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "mutated reuse source report unexpectedly succeeded");
    assert(
      result.stderr.includes("TAKT_RESEARCH_REUSE_SOURCE_REPORT_CHANGED:"),
      `mutated reuse source report did not report TAKT_RESEARCH_REUSE_SOURCE_REPORT_CHANGED: ${result.stderr}`,
    );
    assert(await resolveResearchReuseCandidate(targetInfo, { root }), "mutated reuse source report did not preserve sidecar for retry");
    assert(
      await readFile(researchArtifacts.report, "utf8") === "# Existing Successful Research Report\n",
      "mutated reuse source report did not restore prior deck-local research-report.md",
    );
    assert(
      await readFile(researchArtifacts.sources, "utf8") === "# Existing Research Sources\n",
      "mutated reuse source report synced research-sources.md before source report validation",
    );
  });

  await check("research force deletes existing reuse sidecar and bypasses reuse marker", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-force-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nForce full research\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    await writeSupervision(targetInfo, "research", "researched", "passed", "run-research-old");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-force-success", "passed", targetInfo.target));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath, "--force"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `force full research failed: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.research_reuse !== true, `force research unexpectedly entered reuse mode: ${JSON.stringify(marker)}`);
    assert(!Object.hasOwn(marker, "research_source_report_path"), `force marker leaked reuse source report metadata: ${JSON.stringify(marker)}`);
    assert(!existsSync(researchReuseSidecarPath(targetInfo, { root })), "force full research did not delete existing sidecar");
  });

  await check("research reuse mode selects sibling private workflow and keeps public command surface unchanged", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-workflow-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nReuse workflow selection\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research", { includeResearchReuse: true });
    const selectedReuseWorkflowPath = researchReuseWorkflowFilePath(selectedWorkflowPath);
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-reuse-workflow", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `reuse workflow selection run failed: ${result.stderr}`);
    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(args[workflowArgIndex + 1] === selectedReuseWorkflowPath, `reuse mode did not select sibling private workflow: ${args.join(" ")}`);
    assert(!COMMANDS.includes("research-reuse"), `research-reuse leaked into public command registry: ${COMMANDS.join(", ")}`);
  });

  await check("research reuse mode fails before TAKT when sibling private workflow is unavailable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-workflow-missing-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nMissing reuse workflow\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("research");
    const fakePackage = await makeFakePackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-should-not-start", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "reuse mode unexpectedly succeeded without sibling private workflow");
    assert(result.stderr.includes("WORKFLOW_NOT_IMPLEMENTED:"), `missing reuse workflow did not report WORKFLOW_NOT_IMPLEMENTED: ${result.stderr}`);
    assert(result.stderr.includes("takt-marp-slide-research-reuse.yaml"), `missing reuse workflow error omitted file name: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite missing sibling reuse workflow");
  });

  await check("bundled research reuse missing sibling cleans staged runtime before failing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-research-reuse-bundled-missing-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n\nBundled missing reuse workflow\n", "utf8");
    await writeReusableResearchSidecarFixture(root, targetInfo, "run-reusable");
    const fakePackage = await makeFakePackageRoot();
    const fakeTemplateRoot = path.join(fakePackage.packageRoot, "templates", "project");
    await cp(path.join(ROOT_DIR, "templates", "project"), fakeTemplateRoot, { recursive: true });
    await rm(path.join(fakeTemplateRoot, "workflows", "takt-marp-slide-research-reuse.yaml"), { force: true });
    const source = resolveTemplateSource({ projectRoot: root, templateRoot: fakeTemplateRoot });
    const selectedWorkflowPath = workflowFilePath(source, "research");
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-should-not-start", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "research", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "bundled reuse mode unexpectedly succeeded without sibling private workflow");
    assert(result.stderr.includes("WORKFLOW_NOT_IMPLEMENTED:"), `bundled missing reuse workflow did not report WORKFLOW_NOT_IMPLEMENTED: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite bundled missing sibling reuse workflow");
    assert(!existsSync(path.join(root, "workflows")), "bundled missing reuse workflow left staged runtime under project workflows/");
  });

  await check("global CLI workflow command uses bundled no-copy templates without npm project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-bundled-"));
    await makeDeck(root, "demo");
    const fakePackage = await makeFakeCliPackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.binScript, "plan", "slides/demo", "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `global CLI bundled no-copy workflow failed: ${result.stderr}`);
    assert(!existsSync(path.join(root, "package.json")), "test project unexpectedly has package.json");
    assert(!existsSync(path.join(root, "node_modules")), "test project unexpectedly has node_modules");
    assert(!existsSync(path.join(root, ".takt", "workflows")), "global CLI copied project-local workflow templates");
    assert(!existsSync(path.join(root, ".takt", "facets")), "global CLI copied project-local facet templates");

    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(
      path.basename(args[workflowArgIndex + 1]) === "takt-marp-slide-plan.yaml",
      `TAKT did not receive bundled plan workflow path: ${args.join(" ")}`,
    );
    assert(
      args[workflowArgIndex + 1].includes("takt-marp-bundled-runtime-"),
      `TAKT bundled plan workflow path did not use runtime view: ${args.join(" ")}`,
    );
    assertPathInside(
      path.join(root, "workflows"),
      args[workflowArgIndex + 1],
      `TAKT bundled plan workflow path must be inside the project workflows allowlist root: ${args.join(" ")}`,
    );
    assert(!existsSync(args[workflowArgIndex + 1]), `bundled plan runtime workflow was not cleaned up: ${args[workflowArgIndex + 1]}`);
    assert(!existsSync(path.join(root, "workflows")), "bundled plan runtime parent was not cleaned up");
    const providerArgIndex = args.indexOf("--provider");
    assert(providerArgIndex >= 0, `TAKT args did not include --provider: ${args.join(" ")}`);
    assert(args[providerArgIndex + 1] === "mock", `TAKT provider argument was not preserved: ${args.join(" ")}`);
  });

  await check("global CLI research command uses bundled no-copy templates and preserves provider args", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-research-bundled-"));
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
    const fakePackage = await makeFakeCliPackageRoot();
    await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
    await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.binScript, "research", "slides/demo", "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `global CLI bundled no-copy research failed: ${result.stderr}`);
    assert(!existsSync(path.join(root, "package.json")), "research test project unexpectedly has package.json");
    assert(!existsSync(path.join(root, "node_modules")), "research test project unexpectedly has node_modules");
    assert(!existsSync(path.join(root, ".takt", "workflows")), "global CLI research copied project-local workflow templates");
    assert(!existsSync(path.join(root, ".takt", "facets")), "global CLI research copied project-local facet templates");

    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `research TAKT args did not include -w: ${args.join(" ")}`);
    assert(
      path.basename(args[workflowArgIndex + 1]) === "takt-marp-slide-research.yaml",
      `TAKT did not receive bundled research workflow path: ${args.join(" ")}`,
    );
    assert(
      args[workflowArgIndex + 1].includes("takt-marp-bundled-runtime-"),
      `TAKT bundled research workflow path did not use runtime view: ${args.join(" ")}`,
    );
    assertPathInside(
      path.join(root, "workflows"),
      args[workflowArgIndex + 1],
      `TAKT bundled research workflow path must be inside the project workflows allowlist root: ${args.join(" ")}`,
    );
    assert(!existsSync(args[workflowArgIndex + 1]), `bundled research runtime workflow was not cleaned up: ${args[workflowArgIndex + 1]}`);
    assert(!existsSync(path.join(root, "workflows")), "bundled research runtime parent was not cleaned up");
    const providerArgIndex = args.indexOf("--provider");
    assert(providerArgIndex >= 0, `research TAKT args did not include --provider: ${args.join(" ")}`);
    assert(args[providerArgIndex + 1] === "mock", `research TAKT provider argument was not preserved: ${args.join(" ")}`);
    assert(existsSync(researchArtifacts.report), "global CLI research did not sync research-report.md");
  });

  await check("global CLI research partial template state fails before TAKT and handoff marker", async () => {
    const cases = [
      {
        label: "workflows-only",
        setup: async (root) => {
          await mkdir(path.join(root, ".takt", "workflows"), { recursive: true });
          await writeFile(path.join(root, ".takt", "workflows", "takt-marp-slide-research.yaml"), "name: partial-research\n", "utf8");
        },
        detail: ".takt/workflows exists without .takt/facets",
      },
      {
        label: "facets-only",
        setup: async (root) => {
          await mkdir(path.join(root, ".takt", "facets", "instructions"), { recursive: true });
          await writeFile(path.join(root, ".takt", "facets", "instructions", "takt-marp-adapt-research.md"), "# Partial adapter\n", "utf8");
        },
        detail: ".takt/facets exists without .takt/workflows",
      },
    ];

    for (const testCase of cases) {
      const root = await mkdtemp(path.join(os.tmpdir(), `slide-workflow-cli-research-partial-${testCase.label}-`));
      const targetInfo = await makeDeck(root, "demo");
      const researchArtifacts = researchArtifactPaths(targetInfo);
      await mkdir(targetInfo.researchPath, { recursive: true });
      await writeFile(researchArtifacts.brief, "# Research Brief\n", "utf8");
      await testCase.setup(root);
      const fakePackage = await makeFakeCliPackageRoot();
      await makeBuiltinDeepResearchWorkflow(fakePackage.packageRoot);
      await makeTaktExecutable(fakePackage.packageRoot, fakeResearchTaktScriptWithArtifacts("run-current", "passed", targetInfo.target));
      const argsPath = path.join(root, `takt-args-${testCase.label}.txt`);
      const markerPath = path.join(root, ".takt", "workflow-current-target.json");

      const result = spawnSync(
        process.execPath,
        [fakePackage.binScript, "research", "slides/demo"],
        { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
      );
      assert(result.status !== 0, `global CLI research unexpectedly accepted partial template state: ${testCase.label}`);
      assert(result.stderr.includes("PROJECT_TEMPLATE_STATE_INVALID:"), `research partial state error was not reported for ${testCase.label}: ${result.stderr}`);
      assert(result.stderr.includes(testCase.detail), `research partial state error missed path detail for ${testCase.label}: ${result.stderr}`);
      assert(!existsSync(argsPath), `TAKT was invoked despite research partial template state: ${testCase.label}`);
      assert(!existsSync(markerPath), `research handoff marker was written before template state preflight failed: ${testCase.label}`);
    }
  });

  await check("global CLI smoke uses isolated no-copy temp project and preserves provider args", async () => {
    const userRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-smoke-user-"));
    const capturePath = path.join(userRoot, "smoke-captures.jsonl");
    const fakePackage = await makeFakeCliPackageRoot();
    await makeFakeSmokeScript(fakePackage.packageRoot);

    const defaultResult = spawnSync(process.execPath, [fakePackage.binScript, "smoke"], {
      cwd: userRoot,
      encoding: "utf8",
      env: { ...process.env, TAKT_MARP_SMOKE_CAPTURE: capturePath },
    });
    assert(defaultResult.status === 0, `default smoke failed: ${defaultResult.stderr}`);
    const defaultRecords = await readJsonLines(capturePath);
    assert(defaultRecords.length === 1, `expected one default smoke capture, got ${defaultRecords.length}`);
    assert(
      JSON.stringify(defaultRecords[0].args) === JSON.stringify([]),
      `default smoke should pass no provider args and let smoke validator default to mock: ${JSON.stringify(defaultRecords[0].args)}`,
    );
    assert(defaultRecords[0].cwd !== userRoot, "smoke script ran in the user cwd instead of an isolated temp project");
    await assertNoSmokeTemplateProviderOrRuntimeFiles(userRoot);
    await assertNoSmokeTemplateProviderOrRuntimeFiles(defaultRecords[0].cwd);

    const providerResult = spawnSync(process.execPath, [fakePackage.binScript, "smoke", "--provider", "realish"], {
      cwd: userRoot,
      encoding: "utf8",
      env: { ...process.env, TAKT_MARP_SMOKE_CAPTURE: capturePath },
    });
    assert(providerResult.status === 0, `provider smoke failed: ${providerResult.stderr}`);
    const providerRecords = await readJsonLines(capturePath);
    assert(providerRecords.length === 2, `expected two smoke captures, got ${providerRecords.length}`);
    assert(
      JSON.stringify(providerRecords[1].args) === JSON.stringify(["--provider", "realish"]),
      `provider smoke args were not passed through unchanged: ${JSON.stringify(providerRecords[1].args)}`,
    );
    assert(providerRecords[1].cwd !== userRoot, "provider smoke script ran in the user cwd instead of an isolated temp project");
    await assertNoSmokeTemplateProviderOrRuntimeFiles(userRoot);
    await assertNoSmokeTemplateProviderOrRuntimeFiles(providerRecords[1].cwd);
  });

  await check("smoke validator uses selected template source for inspection, summary, and no-copy evidence", async () => {
    const source = await readFile(path.join(SCRIPT_DIR, "takt-marp-validate-slide-workflow-smoke.mjs"), "utf8");
    assert(source.includes("resolveTemplateSource"), "smoke validator must use TemplateSourceResolver rules");
    assert(source.includes("workflowFilePath"), "smoke validator must derive command workflow paths from the selected template source");
    assert(!source.includes('path.join(ROOT, ".takt", "workflows"'), "smoke validator still reads project-local .takt/workflows directly");
    assert(source.includes("summary_kind:"), "smoke summary must distinguish mock and real validation result kinds");
    assert(source.includes("real_provider:"), "real smoke summary must record the provider name as real provider evidence");
    assert(source.includes("smoke:selected-template-source"), "smoke validator must record the selected template source");
    assert(source.includes("smoke:template-assets-no-copy"), "smoke validator must assert workflow/facet templates were not generated");
  });

  await check("smoke validator selected source helpers cover bundled and ejected no-copy states", async () => {
    const smokeModuleUrl = pathToFileURL(path.join(SCRIPT_DIR, "takt-marp-validate-slide-workflow-smoke.mjs")).href;
    const smoke = await import(`${smokeModuleUrl}?foundation=${Date.now()}`);

    const bundledRoot = await mkdtemp(path.join(os.tmpdir(), "smoke-validator-bundled-"));
    const bundledSnapshot = await smoke.snapshotSmokeTemplateAssets(bundledRoot);
    const bundledContext = smoke.resolveSmokeTemplateContext(bundledRoot);
    assert(bundledContext.source.kind === "bundled", `expected bundled smoke template source, got ${bundledContext.source.kind}`);
    assert(
      bundledContext.workflowFiles.plan === path.join(ROOT_DIR, "templates", "project", "workflows", "takt-marp-slide-plan.yaml"),
      `bundled smoke inspection path did not use package template: ${bundledContext.workflowFiles.plan}`,
    );
    await smoke.assertSmokeTemplateAssetsNotGenerated(bundledRoot, bundledSnapshot);
    assert(!existsSync(path.join(bundledRoot, ".takt", "workflows")), "bundled smoke helper generated workflow templates");
    assert(!existsSync(path.join(bundledRoot, ".takt", "facets")), "bundled smoke helper generated facet templates");

    const ejectedRoot = await mkdtemp(path.join(os.tmpdir(), "smoke-validator-ejected-"));
    await mkdir(path.join(ejectedRoot, ".takt", "workflows"), { recursive: true });
    await mkdir(path.join(ejectedRoot, ".takt", "facets", "instructions"), { recursive: true });
    const ejectedWorkflow = path.join(ejectedRoot, ".takt", "workflows", "takt-marp-slide-plan.yaml");
    await writeFile(ejectedWorkflow, "name: ejected-plan\n", "utf8");
    await writeFile(path.join(ejectedRoot, ".takt", "facets", "instructions", "custom.md"), "# Custom\n", "utf8");
    const ejectedSnapshot = await smoke.snapshotSmokeTemplateAssets(ejectedRoot);
    const ejectedContext = smoke.resolveSmokeTemplateContext(ejectedRoot);
    assert(ejectedContext.source.kind === "ejected", `expected ejected smoke template source, got ${ejectedContext.source.kind}`);
    assert(ejectedContext.workflowFiles.plan === ejectedWorkflow, `ejected smoke inspection path did not use project override: ${ejectedContext.workflowFiles.plan}`);
    await smoke.assertSmokeTemplateAssetsNotGenerated(ejectedRoot, ejectedSnapshot);
  });

  await check("smoke validator preserves provider settings absence and user-owned config files", async () => {
    const smokeSource = await readFile(path.join(SCRIPT_DIR, "takt-marp-validate-slide-workflow-smoke.mjs"), "utf8");
    assert(smokeSource.includes("smoke:provider-settings-no-write"), "smoke validator must report provider settings no-write evidence");
    assert(smokeSource.includes("Check TAKT provider environment/configuration"), "real provider smoke failures must guide environment/config checks");
    assert(smokeSource.includes("Real provider smoke is optional"), "real provider smoke must remain optional guidance, not a CI requirement");

    const smokeModuleUrl = pathToFileURL(path.join(SCRIPT_DIR, "takt-marp-validate-slide-workflow-smoke.mjs")).href;
    const smoke = await import(`${smokeModuleUrl}?providerSettings=${Date.now()}`);
    const missingRoot = await mkdtemp(path.join(os.tmpdir(), "smoke-provider-settings-missing-"));
    const missingSnapshot = await smoke.snapshotSmokeProviderSettings(missingRoot);
    await smoke.assertSmokeProviderSettingsNotGenerated(missingRoot, missingSnapshot);

    const userOwnedRoot = await mkdtemp(path.join(os.tmpdir(), "smoke-provider-settings-owned-"));
    await mkdir(path.join(userOwnedRoot, ".takt"), { recursive: true });
    await writeFile(path.join(userOwnedRoot, ".takt", "provider-settings.yaml"), "provider: user-owned\n", "utf8");
    await writeFile(path.join(userOwnedRoot, ".takt", "credentials.env"), "TAKT_API_KEY=user-owned\n", "utf8");
    const userOwnedSnapshot = await smoke.snapshotSmokeProviderSettings(userOwnedRoot);
    await smoke.assertSmokeProviderSettingsNotGenerated(userOwnedRoot, userOwnedSnapshot);
    const providerSettings = await readFile(path.join(userOwnedRoot, ".takt", "provider-settings.yaml"), "utf8");
    const credentials = await readFile(path.join(userOwnedRoot, ".takt", "credentials.env"), "utf8");
    assert(providerSettings === "provider: user-owned\n", "smoke provider assertion changed provider-settings.yaml");
    assert(credentials === "TAKT_API_KEY=user-owned\n", "smoke provider assertion changed credentials.env");
  });

  await check("global CLI workflow command uses ejected workflow override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-ejected-"));
    await makeDeck(root, "demo");
    await mkdir(path.join(root, ".takt", "workflows"), { recursive: true });
    await mkdir(path.join(root, ".takt", "facets"), { recursive: true });
    const ejectedWorkflowPath = path.join(root, ".takt", "workflows", "takt-marp-slide-plan.yaml");
    const expectedEjectedWorkflowPath = path.join(await realpath(root), ".takt", "workflows", "takt-marp-slide-plan.yaml");
    const ejectedWorkflowContent = "name: ejected-plan\n# user-owned ejected override\n";
    await writeFile(ejectedWorkflowPath, ejectedWorkflowContent, "utf8");
    const fakePackage = await makeFakeCliPackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.binScript, "plan", "slides/demo"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `global CLI ejected workflow failed: ${result.stderr}`);
    const args = (await readFile(argsPath, "utf8")).trim().split("\n");
    const workflowArgIndex = args.indexOf("-w");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(args[workflowArgIndex + 1] === expectedEjectedWorkflowPath, `TAKT did not receive ejected workflow path: ${args.join(" ")}`);
    const afterPlanWorkflowContent = await readFile(ejectedWorkflowPath, "utf8");
    assert(afterPlanWorkflowContent === ejectedWorkflowContent, "global CLI workflow command auto-replaced a user-owned ejected workflow file");
  });

  await check("global CLI partial template state fails before TAKT", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-partial-"));
    await makeDeck(root, "demo");
    await mkdir(path.join(root, ".takt", "workflows"), { recursive: true });
    await writeFile(path.join(root, ".takt", "workflows", "takt-marp-slide-plan.yaml"), "name: partial-plan\n", "utf8");
    const fakePackage = await makeFakeCliPackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.binScript, "plan", "slides/demo"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "global CLI unexpectedly accepted partial template state");
    assert(result.stderr.includes("PROJECT_TEMPLATE_STATE_INVALID:"), `partial state error was not reported: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite partial template state");
  });

  await check("global CLI invalid target is not masked by no-copy template selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-invalid-target-"));
    const fakePackage = await makeFakeCliPackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.binScript, "plan", "deck"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "global CLI unexpectedly accepted invalid target");
    assert(result.stderr.includes("INVALID_TARGET:"), `invalid target did not surface INVALID_TARGET: ${result.stderr}`);
    assert(!result.stderr.includes("PROJECT_NOT_INITIALIZED"), `initialization preflight masked invalid target: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite invalid target");
  });

  await check("runner with selected workflow file path preserves rerun blocking", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-rerun-"));
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-old");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "runner unexpectedly allowed selected-source successful rerun");
    assert(result.stderr.includes("RERUN_BLOCKED:"), `selected-source rerun did not report RERUN_BLOCKED: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT started despite selected-source rerun blocking");
  });

  await check("runner with selected workflow file path preserves force invalidation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-force-"));
    const targetInfo = await makeDeck(root, "demo");
    await writeSupervision(targetInfo, "plan", "planned", "passed", "run-old");
    await writeApproval(targetInfo, "plan", "foundation-test");
    await mkdir(path.join(root, "dist", "demo"), { recursive: true });
    await writeFile(path.join(root, "dist", "demo", "old.pdf"), "stale pdf", "utf8");
    await mkdir(path.join(root, ".takt", "render", "demo"), { recursive: true });
    await writeFile(path.join(root, ".takt", "render", "demo", "metadata.json"), "{}", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--force"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `selected-source force rerun failed: ${result.stderr}`);
    const synced = await readFile(supervisionPath(targetInfo, "plan"), "utf8");
    assert(synced.includes("workflow_run_id: run-current"), `force rerun did not sync current supervision: ${synced}`);
    const historyFiles = await readdir(path.join(targetInfo.reviewPath, "history"));
    assert(historyFiles.some((name) => name.endsWith("force-plan-supervision.md")), `force did not archive supervision: ${historyFiles.join(", ")}`);
    assert(historyFiles.some((name) => name.endsWith("force-plan-approval.md")), `force did not archive approval: ${historyFiles.join(", ")}`);
    assert(!existsSync(path.join(root, "dist", "demo", "old.pdf")), "force did not clean generated output");
    assert(!existsSync(path.join(root, ".takt", "render", "demo", "metadata.json")), "force did not clean TAKT render output");
    assert(!existsSync(path.join(root, ".takt", "workflows")), "selected-source force created project-local workflow templates");
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
    const referenceAnalysis = await readFile(path.join(targetInfo.deckPath, "reference-analysis.md"), "utf8");
    const plan = await readFile(path.join(targetInfo.deckPath, "plan.md"), "utf8");
    const blueprint = await readFile(path.join(targetInfo.deckPath, "slide-blueprint.md"), "utf8");
    assert(normalized.includes("Mock normalized brief for run-current"), `normalized brief was not synced from reports: ${normalized}`);
    assert(referenceAnalysis.includes("Mock reference analysis for run-current"), `reference analysis was not synced from reports: ${referenceAnalysis}`);
    assert(plan.includes("deliverables: [html, pdf]"), `plan deliverables were not synced from reports: ${plan}`);
    assert(blueprint.includes("Mock slide blueprint for run-current"), `slide blueprint was not synced from reports: ${blueprint}`);
  });

  await check("plan optional research context is absent without becoming a prerequisite", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const fakePackage = await makeFakePackageRoot();
    await assertCommandPrerequisites(targetInfo, "plan");
    await makeTaktExecutable(fakePackage.packageRoot, fakePlanTaktScriptWithOptionalResearchContext("run-current", "passed"));

    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner treated missing research artifacts as a plan failure: ${result.stderr}`);
    const referenceAnalysis = await readFile(path.join(targetInfo.deckPath, "reference-analysis.md"), "utf8");
    const plan = await readFile(path.join(targetInfo.deckPath, "plan.md"), "utf8");
    assert(referenceAnalysis.includes("Available: no"), `reference-analysis did not record missing optional research context: ${referenceAnalysis}`);
    assert(referenceAnalysis.includes("Inputs read: none"), `reference-analysis incorrectly consumed research context: ${referenceAnalysis}`);
    assert(plan.includes("Research Context Usage"), `plan omitted research context usage section: ${plan}`);
    assert(plan.includes("Available: no"), `plan did not mark research context as absent: ${plan}`);
    assert(!plan.includes("claim_id C-001"), `plan invented research evidence without artifacts: ${plan}`);
    assert(!plan.includes("Status: needs_input"), `plan turned missing optional research artifacts into needs_input: ${plan}`);
  });

  await check("plan optional research context is synced as identifiable source evidence when present", async () => {
    const root = await fixtureRoot();
    const targetInfo = await makeDeck(root, "demo");
    const researchArtifacts = researchArtifactPaths(targetInfo);
    const fakePackage = await makeFakePackageRoot();
    await mkdir(targetInfo.researchPath, { recursive: true });
    await writeFile(researchArtifacts.report, "# Research Report\n\nsource_id: S-001\n", "utf8");
    await writeFile(researchArtifacts.claims, "# Research Claims\n\nclaim_id: C-001\nsource_ids: [S-001]\n", "utf8");
    await writeFile(researchArtifacts.openQuestions, "# Open Questions\n\nquestion_id: Q-001\n", "utf8");
    await assertCommandPrerequisites(targetInfo, "plan");
    await makeTaktExecutable(fakePackage.packageRoot, fakePlanTaktScriptWithOptionalResearchContext("run-current", "passed"));

    const result = spawnSync(process.execPath, [fakePackage.runnerScript, "plan", "slides/demo"], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `runner failed to plan with optional research context: ${result.stderr}`);
    const referenceAnalysis = await readFile(path.join(targetInfo.deckPath, "reference-analysis.md"), "utf8");
    const plan = await readFile(path.join(targetInfo.deckPath, "plan.md"), "utf8");
    assert(referenceAnalysis.includes("Available: yes"), `reference-analysis did not mark research context as available: ${referenceAnalysis}`);
    assert(
      referenceAnalysis.includes("claim_id C-001 from research-claims.md"),
      `reference-analysis did not preserve research-derived evidence identity: ${referenceAnalysis}`,
    );
    assert(
      referenceAnalysis.includes("question_id Q-001 from open-questions.md; unresolved, do not infer"),
      `reference-analysis did not preserve unresolved open question: ${referenceAnalysis}`,
    );
    assert(plan.includes("Research Context Usage"), `plan omitted research context usage section: ${plan}`);
    assert(plan.includes("Research-derived evidence used: claim_id C-001"), `plan did not identify research-derived evidence: ${plan}`);
    assert(plan.includes("Unresolved assumptions: question_id Q-001"), `plan did not preserve unresolved assumptions: ${plan}`);
    assert(plan.includes("Source: research-claims.md#C-001"), `plan slide source did not point at research evidence: ${plan}`);
    assert(!plan.includes("Status: needs_input"), `plan turned unresolved optional research context into needs_input: ${plan}`);
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

  await check("approve command without supervision fails by approval contract, not template preflight", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-approve-no-template-missing-supervision-"));
    const targetInfo = await makeDeck(root, "demo");
    const result = spawnSync(
      process.execPath,
      [BIN_ENTRY_SCRIPT, "approve", targetInfo.target, "plan", "--by", "foundation-test"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status !== 0, "approve unexpectedly succeeded without supervision");
    assert(result.stderr.includes("FILE_MISSING:"), `expected missing supervision from approval contract, got: ${result.stderr}`);
    assert(!result.stderr.includes("PROJECT_NOT_INITIALIZED"), `template preflight masked approval contract: ${result.stderr}`);
  });

  await check("approve command writes approval file without workflow or facet templates", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-approve-no-template-"));
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
    assert(!existsSync(path.join(root, ".takt", "workflows")), "approve created or required workflow templates");
    assert(!existsSync(path.join(root, ".takt", "facets")), "approve created or required facet templates");
    const approval = await readFile(path.join(targetInfo.reviewPath, "plan-approval.md"), "utf8");
    assert(approval.includes("approved_by: foundation-test"), `approval file missing approver: ${approval}`);
  });

  await check("package scripts expose canonical entrypoints only", async () => {
    const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    const scripts = pkg.scripts ?? {};
    for (const name of ["slide:research", "slide:plan", "slide:compose", "slide:polish", "slide:deliver", "slide:check-state", "slide:approve", "slide:validate-foundation"]) {
      assert(scripts[name], `missing package script ${name}`);
    }
    assert(
      scripts["slide:research"] === "node scripts/takt-marp-run-slide-workflow.mjs research",
      `slide:research must invoke the research workflow runner: ${scripts["slide:research"]}`,
    );
    for (const [name, command] of Object.entries(scripts)) {
      if (command.includes("node scripts/")) {
        assert(command.includes("node scripts/takt-marp-"), `package script ${name} uses unprefixed scripts path: ${command}`);
      }
    }
    for (const oldName of ["slide:draft", "slide:review-revise", "slide:build-qa"]) {
      assert(!scripts[oldName], `old package script remains: ${oldName}`);
    }
    assert(scripts.test?.includes("npm run slide:smoke -- --provider mock"), "npm test must require deterministic mock smoke");
    assert(!scripts.test?.match(/--provider (?!mock\b)[^ ]+/), `npm test must not require real provider smoke: ${scripts.test}`);
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

async function writeTemplateTree(root, entries) {
  for (const [relativePath, content] of entries) {
    const destination = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

function extractWorkflowStepBlocks(source) {
  const stepsStart = source.search(/^steps:\n/m);
  assert(stepsStart >= 0, "workflow YAML missing top-level steps section");
  const stepsSource = source.slice(stepsStart).replace(/^steps:\n/, "");
  return stepsSource
    .split(/\n(?=  - name: )/)
    .filter((block) => block.startsWith("  - name: "))
    .map((block) => {
      const match = block.match(/^  - name: ([^\n]+)/);
      assert(match, `workflow step block missing name: ${block}`);
      return { name: match[1].trim(), block };
    });
}

function assertWorkflowCallStep(source, stepName, expectedCall) {
  const step = extractWorkflowStepBlocks(source).find((candidate) => candidate.name === stepName);
  assert(step, `workflow call step '${stepName}' is missing`);
  assert(step.block.includes("\n    kind: workflow_call\n"), `step '${stepName}' must be kind: workflow_call`);
  assert(step.block.includes(`\n    call: ${expectedCall}\n`), `step '${stepName}' must call ${expectedCall}`);
}

function buildResearchAdapterMissingFieldFixture(mockReport) {
  assert(mockReport.includes("omits URL"), "fixture mock report must describe missing source fields");
  return {
    "research-sources.md": [
      "---",
      "command: research",
      "target: slides/demo",
      "generated_at: 2026-06-05T17:10:00+09:00",
      "workflow_run_id: run-research-1",
      "source_report: research-report.md",
      "source_report_origin: builtin_deep_research",
      "---",
      "",
      "# Research Sources",
      "",
      "| source_id | title | url | retrieved_at | source_type | confidence |",
      "|-----------|-------|-----|--------------|-------------|------------|",
      "| source-001 | not_present_in_builtin_report | not_present_in_builtin_report | not_present_in_builtin_report | other | not_present_in_builtin_report |",
      "",
    ].join("\n"),
    "research-claims.md": [
      "---",
      "command: research",
      "target: slides/demo",
      "generated_at: 2026-06-05T17:10:00+09:00",
      "workflow_run_id: run-research-1",
      "source_report: research-report.md",
      "source_report_origin: builtin_deep_research",
      "---",
      "",
      "# Research Claims",
      "",
      "| claim_id | claim | confidence | source_ids | slide_use | caveats |",
      "|----------|-------|------------|------------|-----------|---------|",
      "| claim-001 | Legacy deployment teams still need slide-ready evidence | not_present_in_builtin_report | [] | Candidate slide claim | source mapping not_present_in_builtin_report |",
      "",
    ].join("\n"),
    "open-questions.md": [
      "---",
      "command: research",
      "target: slides/demo",
      "generated_at: 2026-06-05T17:10:00+09:00",
      "workflow_run_id: run-research-1",
      "source_report: research-report.md",
      "source_report_origin: builtin_deep_research",
      "---",
      "",
      "# Open Questions",
      "",
      "| question_id | question | why_it_matters | suggested_next_step |",
      "|-------------|----------|----------------|---------------------|",
      "| question-001 | Which migration date is final? | not_present_in_builtin_report | not_present_in_builtin_report |",
      "",
    ].join("\n"),
  };
}

async function assertNoLocalBuiltInResearchFacetCopies() {
  const findings = new Set();
  for (const rootRelativePath of [".takt/facets", "templates/project/facets"]) {
    const rootPath = path.join(ROOT_DIR, ...rootRelativePath.split("/"));
    for (const filePath of await listFilesRecursively(rootPath)) {
      const relativePath = path.relative(ROOT_DIR, filePath).split(path.sep).join("/");
      const fileName = path.basename(filePath);
      for (const builtInRelativePath of BUILTIN_RESEARCH_FACET_RELATIVE_PATHS) {
        if (relativePath.endsWith(`/facets/${builtInRelativePath}`)) {
          findings.add(`${relativePath} copies built-in research facet path ${builtInRelativePath}`);
        }
      }
      for (const outputContractFile of BUILTIN_RESEARCH_OUTPUT_CONTRACT_FILES) {
        if (fileName === outputContractFile) {
          findings.add(`${relativePath} copies built-in output contract file ${outputContractFile}`);
        }
      }

      const source = await readFile(filePath, "utf8");
      for (const identifier of BUILTIN_RESEARCH_FACET_IDENTIFIERS) {
        if (relativePath.includes(identifier) || source.includes(identifier)) {
          findings.add(`${relativePath} contains built-in research facet identifier ${identifier}`);
        }
      }
    }
  }
  assert(findings.size === 0, `repo-local built-in research facet copies detected: ${[...findings].join("; ")}`);
}

async function listFilesRecursively(rootPath) {
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

async function assertNoRuntimeOrProviderFiles(root) {
  const forbidden = [
    ".takt/config.yaml",
    ".takt/runs",
    ".takt/render",
    ".takt/provider-settings.yaml",
    ".takt/credentials.env",
  ];
  for (const relativePath of forbidden) {
    assert(!existsSync(path.join(root, ...relativePath.split("/"))), `eject generated non-template path: ${relativePath}`);
  }
}

async function assertNoSmokeTemplateProviderOrRuntimeFiles(root) {
  const forbidden = [
    ".takt/workflows",
    ".takt/facets",
    ".takt/config.yaml",
    ".takt/provider-settings.yaml",
    ".takt/provider.yaml",
    ".takt/providers.yaml",
    ".takt/credentials.env",
    ".takt/credentials.json",
    ".takt/runs",
    ".takt/render",
    ".takt/workflow-current-target.json",
  ];
  for (const relativePath of forbidden) {
    assert(!existsSync(path.join(root, ...relativePath.split("/"))), `smoke generated forbidden path in ${root}: ${relativePath}`);
  }
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function collectPackContentViolations(paths, templateEntries) {
  const violations = [];
  checkPackContents(paths, templateEntries, (group, detail) => violations.push({ group, detail }));
  return violations;
}

function formatViolations(violations) {
  return violations.map((violation) => `${violation.group}: ${violation.detail}`).join("; ");
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

async function captureOutput(fn) {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const stdoutChunks = [];
  const stderrChunks = [];
  process.stdout.write = (chunk, encoding, callback) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  process.stderr.write = (chunk, encoding, callback) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await fn();
    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    return { result, stdout, stderr, output: `${stdout}\n${stderr}` };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

async function makeDeck(root, deckName) {
  const deckPath = path.join(root, "slides", deckName);
  await mkdir(path.join(deckPath, "review"), { recursive: true });
  await writeFile(path.join(deckPath, "brief.md"), "# Brief\n");
  const targetInfo = resolveDeckTarget(`slides/${deckName}`, { root });
  await writeClaudeDesignSmokeFixture(targetInfo, { root });
  return targetInfo;
}

async function makeSelectedWorkflowFile(command, options = {}) {
  const selectedSourceRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-source-"));
  const selectedWorkflowPath = path.join(selectedSourceRoot, "workflows", `takt-marp-slide-${command}.yaml`);
  await mkdir(path.dirname(selectedWorkflowPath), { recursive: true });
  await writeFile(selectedWorkflowPath, `name: selected-${command}\n`, "utf8");
  if (command === "research" && options.includeResearchReuse) {
    await writeFile(researchReuseWorkflowFilePath(selectedWorkflowPath), "name: selected-research-reuse\n", "utf8");
  }
  return selectedWorkflowPath;
}

async function makeFakePackageRoot() {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-package-"));
  // Copy (not symlink) so ESM realpath resolution derives packageRoot from the fake package, not the repo.
  for (const relative of [
    "takt-marp-run-slide-workflow.mjs",
    path.join("lib", "takt-marp-claude-design-source.mjs"),
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

async function makeFakeCliPackageRoot() {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-cli-package-"));
  await mkdir(path.join(packageRoot, "bin"), { recursive: true });
  await cp(path.join(ROOT_DIR, "bin", "takt-marp.mjs"), path.join(packageRoot, "bin", "takt-marp.mjs"));
  await mkdir(path.join(packageRoot, "scripts"), { recursive: true });
  for (const scriptName of [
    "takt-marp-run-slide-workflow.mjs",
    "takt-marp-build-slide-artifact.mjs",
    "takt-marp-preview-slide.mjs",
  ]) {
    await cp(path.join(SCRIPT_DIR, scriptName), path.join(packageRoot, "scripts", scriptName));
  }
  await cp(path.join(SCRIPT_DIR, "lib"), path.join(packageRoot, "scripts", "lib"), { recursive: true });
  await cp(path.join(ROOT_DIR, "templates", "project"), path.join(packageRoot, "templates", "project"), { recursive: true });
  await cp(path.join(ROOT_DIR, "node_modules", "fflate"), path.join(packageRoot, "node_modules", "fflate"), { recursive: true });
  const realPackageRoot = await realpath(packageRoot);
  return {
    binScript: path.join(realPackageRoot, "bin", "takt-marp.mjs"),
    packageRoot: realPackageRoot,
  };
}

async function makeFakeSmokeScript(packageRoot) {
  const smokeScript = path.join(packageRoot, "scripts", "takt-marp-validate-slide-workflow-smoke.mjs");
  await writeFile(
    smokeScript,
    [
      "#!/usr/bin/env node",
      "import { appendFile, mkdir } from \"node:fs/promises\";",
      "import path from \"node:path\";",
      "",
      "const capturePath = process.env.TAKT_MARP_SMOKE_CAPTURE;",
      "if (capturePath) {",
      "  await mkdir(path.dirname(capturePath), { recursive: true });",
      "  await appendFile(capturePath, `${JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) })}\\n`, \"utf8\");",
      "}",
      "console.log(`fake smoke cwd: ${process.cwd()}`);",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );
}

async function makeTaktExecutable(root, script = "#!/bin/sh\nexit 0\n") {
  const executablePath = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "takt.cmd" : "takt");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(executablePath, script, { encoding: "utf8", mode: 0o755 });
}

async function makeBuiltinDeepResearchWorkflow(packageRoot) {
  const workflowPath = path.join(packageRoot, "node_modules", "takt", "builtins", "ja", "workflows", "deep-research.yaml");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, "name: deep-research\n", "utf8");
  return workflowPath;
}

async function makeMarpExecutable(root) {
  const executablePath = path.join(root, "node_modules", ".bin", runtimeExecutableName("marp"));
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(
    executablePath,
    [
      "#!/bin/sh",
      "if [ -n \"$MARP_EXECUTABLE_CAPTURE\" ]; then",
      "  printf '%s\\n' \"$0\" > \"$MARP_EXECUTABLE_CAPTURE\"",
      "fi",
      "if [ -n \"$MARP_ARGS_CAPTURE\" ]; then",
      "  printf '%s\\n' \"$@\" > \"$MARP_ARGS_CAPTURE\"",
      "fi",
      "output=\"\"",
      "while [ \"$#\" -gt 0 ]; do",
      "  if [ \"$1\" = \"--output\" ]; then",
      "    shift",
      "    output=\"$1\"",
      "  fi",
      "  shift",
      "done",
      "if [ -n \"$output\" ]; then",
      "  mkdir -p \"$(dirname \"$output\")\"",
      "  printf 'fake marp output\\n' > \"$output\"",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );
}

function runtimeExecutableName(tool) {
  return process.platform === "win32" ? `${tool}.cmd` : tool;
}

function fakeTaktScript(runNames, result) {
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

function fakeCommandTaktScript(runName, command, state, result) {
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

function fakePlanTaktScriptWithOptionalResearchContext(runName, result) {
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
    "research_dir=\"$target/research\"",
    "research_available=no",
    "if [ -f \"$research_dir/research-report.md\" ] || [ -f \"$research_dir/research-claims.md\" ] || [ -f \"$research_dir/open-questions.md\" ]; then",
    "  research_available=yes",
    "fi",
    `cat > ".takt/runs/${runName}/reports/reference-analysis.md" <<EOF`,
    "# Reference Deck Analysis",
    "",
    "## Research Context",
    "- Available: $research_available",
    "EOF",
    "if [ \"$research_available\" = \"yes\" ]; then",
    `cat >> ".takt/runs/${runName}/reports/reference-analysis.md" <<EOF`,
    "- Inputs read: research-report.md, research-claims.md, open-questions.md",
    "- Research-derived evidence: claim_id C-001 from research-claims.md; source_id S-001 from research-report.md",
    "- Unresolved assumptions: question_id Q-001 from open-questions.md; unresolved, do not infer",
    "EOF",
    "else",
    `cat >> ".takt/runs/${runName}/reports/reference-analysis.md" <<EOF`,
    "- Inputs read: none",
    "- Research-derived evidence: none",
    "- Unresolved assumptions: none",
    "EOF",
    "fi",
    `cat >> ".takt/runs/${runName}/reports/reference-analysis.md" <<EOF`,
    "",
    "## Plan Implications",
    `Mock reference analysis for ${runName}.`,
    "EOF",
    `cat > ".takt/runs/${runName}/reports/plan.md" <<EOF`,
    "# Slide Plan",
    "",
    "## Plan Result",
    "- Status: planned",
    "",
    "deliverables: [html, pdf]",
    "",
    "## Research Context Usage",
    "- Available: $research_available",
    "EOF",
    "if [ \"$research_available\" = \"yes\" ]; then",
    `cat >> ".takt/runs/${runName}/reports/plan.md" <<EOF`,
    "- Inputs read: research-report.md, research-claims.md, open-questions.md",
    "- Research-derived evidence used: claim_id C-001 from research-claims.md; source_id S-001 from research-report.md",
    "- Unresolved assumptions: question_id Q-001 from open-questions.md; unresolved, do not infer",
    "",
    "## Slides",
    "- S01",
    "  - Source: research-claims.md#C-001",
    "EOF",
    "else",
    `cat >> ".takt/runs/${runName}/reports/plan.md" <<EOF`,
    "- Inputs read: none",
    "- Research-derived evidence used: none",
    "- Unresolved assumptions: none",
    "",
    "## Slides",
    "- S01",
    "  - Source: brief.normalized.md",
    "EOF",
    "fi",
    `cat >> ".takt/runs/${runName}/reports/plan.md" <<EOF`,
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
    "exit 0",
    "",
  ].join("\n");
}

function fakeResearchTaktScript(runName, result, reportTarget) {
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    ...fakeResearchSupervisionLines(runName, result, reportTarget),
    "exit 0",
    "",
  ].join("\n");
}

function fakeResearchTaktScriptWithArtifacts(runName, result, reportTarget, options = {}) {
  const sourceReports = options.sourceReports ?? [
    {
      relativePath: "subworkflows/iteration-1--step-deep_research--workflow-deep-research/reports/research-report.md",
      lines: ["# Built-in Research Report", "", `Current report from ${runName}.`],
    },
  ];
  const reportsDir = `.takt/runs/${runName}/reports`;
  const meta = {
    workflow: options.workflow ?? "takt-marp-slide-research",
    task: `${reportTarget}/research/research-brief.md`,
    reportDirectory: reportsDir,
  };
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    `mkdir -p ".takt/runs/${runName}"`,
    `cat > ".takt/runs/${runName}/meta.json" <<'EOF'`,
    JSON.stringify(meta, null, 2),
    "EOF",
    ...fakeResearchSupervisionLines(runName, result, reportTarget, { state: options.supervisionState }),
    ...fakeResearchAdapterArtifactLines(runName),
    ...sourceReports.flatMap(({ relativePath, lines }) => fakeReportFileLines(runName, relativePath, lines)),
    ...(options.extraLines ?? []),
    "exit 0",
    "",
  ].join("\n");
}

function fakeFailingResearchTaktScriptWithReuseMeta(runName, targetInfo, options = {}) {
  const sourceReports = options.sourceReports ?? [
    {
      relativePath: "subworkflows/iteration-1--step-deep_research--workflow-deep-research/reports/research-report.md",
      lines: ["# Built-in Research Report", "", `Reusable report from ${runName}.`],
    },
  ];
  const reportsDir = `.takt/runs/${runName}/reports`;
  const meta = {
    workflow: options.workflow ?? "takt-marp-slide-research",
    task: researchTaktTargetForFixture(targetInfo),
    reportDirectory: reportsDir,
  };
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    `mkdir -p ".takt/runs/${runName}"`,
    ...(options.createReportsDir === false ? [] : [`mkdir -p "${reportsDir}"`]),
    `cat > ".takt/runs/${runName}/meta.json" <<'EOF'`,
    JSON.stringify(meta, null, 2),
    "EOF",
    ...sourceReports.flatMap(({ relativePath, lines }) => fakeReportFileLines(runName, relativePath, lines)),
    `exit ${options.exitCode ?? 42}`,
    "",
  ].join("\n");
}

function researchTaktTargetForFixture(targetInfo) {
  return `${targetInfo.target}/research/research-brief.md`;
}

function fakeResearchSupervisionLines(runName, result, reportTarget, options = {}) {
  return fakeReportFileLines(runName, "research-supervision.md", [
    "---",
    "command: research",
    `target: ${reportTarget}`,
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${runName}`,
    "step: supervision",
    "cycle: 1",
    `state: ${options.state ?? "researched"}`,
    `result: ${result}`,
    "blocking_findings: 0",
    "major_findings: 0",
    "minor_findings: 0",
    "info_findings: 0",
    "---",
    "",
    "# Research Supervision",
  ]);
}

function fakeResearchAdapterArtifactLines(runName) {
  return [
    ...fakeReportFileLines(runName, "research-sources.md", [
      "---",
      "command: research",
      "source_report: research-report.md",
      "source_report_origin: builtin_deep_research",
      "---",
      "",
      `# Research Sources ${runName}`,
    ]),
    ...fakeReportFileLines(runName, "research-claims.md", [
      "---",
      "command: research",
      "source_report: research-report.md",
      "source_report_origin: builtin_deep_research",
      "---",
      "",
      `# Research Claims ${runName}`,
    ]),
    ...fakeReportFileLines(runName, "open-questions.md", [
      "---",
      "command: research",
      "source_report: research-report.md",
      "source_report_origin: builtin_deep_research",
      "---",
      "",
      `# Open Questions ${runName}`,
    ]),
  ];
}

function fakeReportFileLines(runName, relativePath, lines) {
  const reportPath = `.takt/runs/${runName}/reports/${relativePath}`;
  return [
    `mkdir -p "${path.posix.dirname(reportPath)}"`,
    `cat > "${reportPath}" <<'EOF'`,
    ...lines,
    "EOF",
  ];
}

async function writeStaleResearchRun(root, target) {
  const reportsDir = path.join(root, ".takt", "runs", "run-stale", "reports");
  const staleReportPath = path.join(
    reportsDir,
    "subworkflows",
    "iteration-1--step-deep_research--workflow-deep-research",
    "reports",
    "research-report.md",
  );
  await mkdir(path.dirname(staleReportPath), { recursive: true });
  await writeFile(staleReportPath, "# Built-in Research Report\n\nstale run\n", "utf8");
  await writeFile(
    path.join(reportsDir, "research-supervision.md"),
    [
      "---",
      "command: research",
      `target: ${target}`,
      "generated_at: 2026-06-05T17:10:00+09:00",
      "workflow_run_id: run-stale",
      "step: supervision",
      "cycle: 1",
      "state: researched",
      "result: passed",
      "blocking_findings: 0",
      "major_findings: 0",
      "minor_findings: 0",
      "info_findings: 0",
      "---",
      "",
      "# Research Supervision",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeReusableResearchSidecarFixture(root, targetInfo, sourceRun) {
  const reportsDir = path.join(root, ".takt", "runs", sourceRun, "reports");
  const sourceReportPath = path.join(
    reportsDir,
    "subworkflows",
    "iteration-1--step-deep_research--workflow-deep-research",
    "reports",
    "research-report.md",
  );
  await mkdir(path.dirname(sourceReportPath), { recursive: true });
  await writeFile(sourceReportPath, `# Built-in Research Report\n\nReusable report from ${sourceRun}.\n`, "utf8");
  await writeResearchReuseSidecar(targetInfo, {
    sourceRun,
    sourceReportsDir: reportsDir,
    sourceReportPath,
  }, { root });
  return Object.freeze({ sourceRun, reportsDir, sourceReportPath });
}

function fakeFailingTaktScript(exitCode) {
  return [
    "#!/bin/sh",
    "if [ -n \"$TAKT_ARGS_CAPTURE\" ]; then",
    "  printf '%s\\n' \"$@\" > \"$TAKT_ARGS_CAPTURE\"",
    "fi",
    `exit ${exitCode}`,
    "",
  ].join("\n");
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

function researchSupervisionFixture(targetInfo, options = {}) {
  return [
    "---",
    "command: research",
    `target: ${options.target ?? targetInfo.target}`,
    "generated_at: 2026-06-05T17:10:00+09:00",
    `workflow_run_id: ${options.workflowRunId ?? "run-research-1"}`,
    "step: supervision",
    "cycle: 1",
    `state: ${options.state ?? "researched"}`,
    `result: ${options.result ?? "passed"}`,
    "blocking_findings: 0",
    "major_findings: 0",
    "minor_findings: 0",
    "info_findings: 0",
    "---",
    "",
    "# Research Supervision",
    "",
  ].join("\n");
}

function assertResearchAdapterTargetRule(source, label) {
  assert(source.includes(".takt/workflow-current-target.json"), `${label} must read the handoff marker`);
  assert(source.includes("marker `target`"), `${label} must document marker target usage`);
  assert(source.includes("front matter `target`"), `${label} must bind marker target to front matter target`);
  assert(
    source.includes("research_brief_path") && source.includes("research-brief.md"),
    `${label} must document the research brief target prohibition`,
  );
  assert(source.includes("must not"), `${label} must explicitly prohibit using the research brief path as front matter target`);
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

function assertPathInside(basePath, targetPath, message) {
  const resolvedBase = normalizeComparablePath(existsSync(basePath) ? realpathSync(basePath) : path.resolve(basePath));
  const resolvedTarget = normalizeComparablePath(existsSync(targetPath) ? realpathSync(targetPath) : path.resolve(targetPath));
  const relativePath = path.relative(resolvedBase, resolvedTarget);
  assert(relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)), message);
}

function normalizeComparablePath(filePath) {
  return process.platform === "darwin" && filePath.startsWith("/private/var/")
    ? `/var/${filePath.slice("/private/var/".length)}`
    : filePath;
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
