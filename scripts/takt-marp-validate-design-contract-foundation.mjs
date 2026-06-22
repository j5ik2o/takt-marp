#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  approvalPath,
  shouldPreserveDesignContract,
  shouldResolveDesignContract,
  supervisionPath,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";
import {
  buildClaudeDesignSmokeFixtureZipBuffer,
} from "./lib/takt-marp-claude-design-fixtures.mjs";
import {
  importClaudeDesignSourceArchive,
  importClaudeDesignSourceBuffer,
  resolveClaudeDesignContract,
} from "./lib/takt-marp-claude-design-source.mjs";
import {
  createZipArchiveBuffer,
  ZipArchiveReader,
} from "./lib/takt-marp-zip-archive.mjs";
import {
  fakeCommandTaktScript,
  fakeTaktScript,
  listFilesRecursively,
  makeDeck,
  makeFakePackageRoot,
  makeSelectedWorkflowFile,
  makeTaktExecutable,
  writeSupervision,
} from "./lib/takt-marp-validation-harness.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);

export async function runDesignContractFoundationChecks(check) {
  await check("Claude Design zip reader rejects traversal and exposes safe entries", async () => {
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
    const sourcePath = path.join(ROOT_DIR, "slides", "demo", "design", "Claude Design Smoke.zip");
    const first = await importClaudeDesignSourceBuffer(buildClaudeDesignSmokeFixtureZipBuffer(), { sourcePath, root: ROOT_DIR, deckName: "demo" });
    const second = await importClaudeDesignSourceBuffer(buildClaudeDesignSmokeFixtureZipBuffer(), { sourcePath, root: ROOT_DIR, deckName: "demo" });
    const designBriefPath = "slides/demo/design/design-brief.md";
    const designBriefSha256 = "a".repeat(64);
    const changedDesignBriefSha256 = "b".repeat(64);
    const withDesignBrief = await importClaudeDesignSourceBuffer(buildClaudeDesignSmokeFixtureZipBuffer(), {
      sourcePath,
      root: ROOT_DIR,
      deckName: "demo",
      designBrief: { available: true, path: designBriefPath, sha256: designBriefSha256 },
    });
    const withChangedDesignBrief = await importClaudeDesignSourceBuffer(buildClaudeDesignSmokeFixtureZipBuffer(), {
      sourcePath,
      root: ROOT_DIR,
      deckName: "demo",
      designBrief: { available: true, path: designBriefPath, sha256: changedDesignBriefSha256 },
    });

    assert(first.source.kind === "claude-design-zip", `unexpected design source kind: ${first.source.kind}`);
    assert(first.source.path === "slides/demo/design/Claude Design Smoke.zip", `source path must be project-relative: ${first.source.path}`);
    assert(first.source.namespace === "ClaudeDesignSmoke", `namespace mismatch: ${first.source.namespace}`);
    assert(first.authoring?.design_brief?.available === false, `missing Design Brief must be explicit unavailable metadata: ${JSON.stringify(first.authoring)}`);
    assert(withDesignBrief.authoring?.design_brief?.path === designBriefPath, `Design Brief path was not preserved: ${JSON.stringify(withDesignBrief.authoring)}`);
    assert(withDesignBrief.authoring?.design_brief?.sha256 === designBriefSha256, `Design Brief SHA was not preserved: ${JSON.stringify(withDesignBrief.authoring)}`);
    assert(withDesignBrief.authoring?.provenance_verified === false, `Design Brief provenance must not be implicitly verified: ${JSON.stringify(withDesignBrief.authoring)}`);
    assert(first.token_counts.color >= 2, `color token count too small: ${JSON.stringify(first.token_counts)}`);
    assert(first.token_counts.typography >= 2, `typography token count too small: ${JSON.stringify(first.token_counts)}`);
    assert(first.token_counts.spacing >= 1, `spacing token count too small: ${JSON.stringify(first.token_counts)}`);
    assert(first.adherence.available === true, "optional adherence metadata was not detected");
    assert(first.components.names.includes("Metric"), `generic component catalog was not preserved: ${JSON.stringify(first.components)}`);
    assert(first.guidance.documents.some((item) => item.path === "SKILL.md" && item.kind === "skill" && item.text.includes("Generic slide design system")), `SKILL.md guidance was not captured: ${JSON.stringify(first.guidance)}`);
    assert(first.guidance.documents.some((item) => item.path === "readme.md" && item.kind === "readme"), `readme guidance was not captured: ${JSON.stringify(first.guidance)}`);
    assert(first.guidance.component_prompts.some((item) => item.path === "components/demo/Metric.prompt.md" && item.text.includes("Metric")), `component prompt guidance was not captured: ${JSON.stringify(first.guidance)}`);
    assert(first.source_catalog.counts.components === 1, `component catalog count mismatch: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.starting_points.some((item) => item.name === "Lecture kickoff"), `starting point catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.cards.some((item) => item.path === "guidelines/overview.card.html"), `card catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.sample_slides.some((item) => item.path === "slides/cover.html"), `sample slide catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.templates.some((item) => item.entryPath === "templates/generic-deck/GenericDeck.dc.html"), `template catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.themes.some((item) => item.name === "High contrast light"), `theme catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.fonts.some((item) => item.family === "Noto Sans JP"), `font catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.source_catalog.assets.some((item) => item.path === "assets/mark.svg"), `asset catalog was not captured: ${JSON.stringify(first.source_catalog)}`);
    assert(first.fingerprint.contract_sha256 === second.fingerprint.contract_sha256, "contract fingerprint must be deterministic");
    assert(first.fingerprint.contract_sha256 === withDesignBrief.fingerprint.contract_sha256, "Design Brief metadata must not change contract fingerprint");
    assert(withDesignBrief.fingerprint.contract_sha256 === withChangedDesignBrief.fingerprint.contract_sha256, "Design Brief SHA drift must not change contract fingerprint");
    assert(withDesignBrief.authoring.design_brief.sha256 !== withChangedDesignBrief.authoring.design_brief.sha256, "Design Brief SHA drift must stay visible in authoring metadata");

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
      () => importClaudeDesignSourceBuffer(createZipArchiveBuffer({
        "_ds_manifest.json": "null\n",
        "styles.css": "",
        "tokens/colors.css": "",
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
      brandFonts: [{ family: "Noto Sans JP", status: "available" }],
      tokens: [
        { name: "--font-heading", value: "Inter, sans-serif", kind: "font", definedIn: "tokens/typography.css" },
        { name: "--text-body", value: "16px", kind: "font", definedIn: "tokens/typography.css" },
        { name: "--button-text-size", value: "12px", kind: "spacing", definedIn: "tokens/spacing.css" },
        { name: "--bg-page", value: "#ffffff", kind: "color", definedIn: "tokens/colors.css" },
      ],
    };
    const classified = await importClaudeDesignSourceBuffer(createZipArchiveBuffer({
      "_ds_manifest.json": `${JSON.stringify(compoundManifest)}\n`,
      "styles.css": "",
      "tokens/colors.css": ":root { --bg-page: #ffffff; }\n",
      "tokens/typography.css": ":root { --font-heading: Inter, sans-serif; --text-body: 16px; }\n",
      "tokens/spacing.css": ":root { --button-text-size: 12px; }\n",
    }), { sourcePath, root: ROOT_DIR, deckName: "demo" });
    const categories = Object.fromEntries(classified.tokens.map((token) => [token.name, token.category]));
    assert(categories["--text-body"] === "typography", `typography path token misclassified: ${JSON.stringify(categories)}`);
    assert(categories["--button-text-size"] === "spacing", `spacing path token with text in name misclassified: ${JSON.stringify(categories)}`);
    assert(categories["--bg-page"] === "color", `color path token misclassified: ${JSON.stringify(categories)}`);
    assert(classified.brand_fonts.includes("Noto Sans JP"), `object brandFonts family was not preserved: ${JSON.stringify(classified.brand_fonts)}`);
    assert(classified.brand_fonts.includes("Inter"), `unquoted font token family was not preserved: ${JSON.stringify(classified.brand_fonts)}`);
  });

  await check("slide commands resolve or preserve Design Contract by lifecycle phase", async () => {
    assert(shouldResolveDesignContract("plan"), "plan must resolve a fresh Design Contract");
    assert(shouldResolveDesignContract("compose"), "compose must resolve a fresh Design Contract");
    assert(shouldPreserveDesignContract("research"), "research must preserve existing Design Contract marker when available");
    assert(shouldPreserveDesignContract("polish"), "polish must preserve existing Design Contract marker when available");
    assert(shouldPreserveDesignContract("deliver"), "deliver must preserve existing Design Contract marker when available");
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
        if (fileName === "takt-marp-compose-review.md") {
          assert(source.includes("各 `Layout`"), `${rootRelativePath}/${fileName} must compare planned Layout entries`);
          assert(source.includes("slide `_class:`"), `${rootRelativePath}/${fileName} must compare planned Layout to slide _class`);
          assert(source.includes("front matter CSS / token-driven class 定義"), `${rootRelativePath}/${fileName} must compare planned Layout to CSS definitions`);
        }
      }

      const polishInspect = await readFile(path.join(facetRoot, "instructions", "takt-marp-polish-inspect.md"), "utf8");
      assert(polishInspect.includes("design_contract.path"), `${rootRelativePath}/takt-marp-polish-inspect.md must branch on design_contract.path`);
      assert(polishInspect.includes("fingerprint.contract_sha256"), `${rootRelativePath}/takt-marp-polish-inspect.md must compare contract fingerprints when present`);
      assert(polishInspect.includes("token drift"), `${rootRelativePath}/takt-marp-polish-inspect.md must report token drift when Design Contract is present`);
      assert(polishInspect.includes("legacy path"), `${rootRelativePath}/takt-marp-polish-inspect.md must preserve legacy path without Design Contract`);
    }
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
    assert(marker.design_contract?.authoring?.design_brief_available === true, `plan marker missing Design Brief availability: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.authoring?.design_brief_path === "slides/demo/design/design-brief.md", `plan marker missing Design Brief path: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.authoring?.design_brief_sha256, `plan marker missing Design Brief SHA: ${JSON.stringify(marker)}`);
    const contract = JSON.parse(await readFile(path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json"), "utf8"));
    assert(contract.authoring?.design_brief?.available === true, `resolved contract missing Design Brief metadata: ${JSON.stringify(contract.authoring)}`);
    assert(contract.authoring?.design_brief?.path === "slides/demo/design/design-brief.md", `resolved contract missing Design Brief path: ${JSON.stringify(contract.authoring)}`);
    assert(
      existsSync(path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json")),
      "runner did not write resolved design contract",
    );
    assert(!Object.hasOwn(marker, "research_brief_path"), `plan marker included research brief path: ${JSON.stringify(marker)}`);
    assert(!Object.hasOwn(marker, "research_output_dir"), `plan marker included research output dir: ${JSON.stringify(marker)}`);
    assert(!existsSync(path.join(root, ".takt", "workflows")), "selected workflow runner created project-local workflow templates");
  });

  await check("runner accepts missing Design Brief as non-blocking authoring metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-missing-design-brief-"));
    await makeDeck(root, "demo", { writeDesignBrief: false });
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status === 0, `runner rejected missing Design Brief despite valid Claude Design Source: ${result.stderr}`);
    assert(existsSync(argsPath), "TAKT was not invoked for missing Design Brief non-blocking path");
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.design_contract?.authoring?.design_brief_available === false, `marker did not mark missing Design Brief unavailable: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.authoring?.design_brief_path === null, `marker missing Design Brief path must be null: ${JSON.stringify(marker)}`);
    assert(marker.design_contract?.authoring?.design_brief_sha256 === null, `marker missing Design Brief SHA must be null: ${JSON.stringify(marker)}`);
    const contract = JSON.parse(await readFile(path.join(root, ".takt", "design-contracts", "demo", "resolved-design-contract.json"), "utf8"));
    assert(contract.authoring?.design_brief?.available === false, `resolved contract did not mark missing Design Brief unavailable: ${JSON.stringify(contract.authoring)}`);
  });

  await check("runner rejects missing Claude Design Source before TAKT for plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-missing-design-source-"));
    const deckPath = path.join(root, "slides", "demo");
    await mkdir(path.join(deckPath, "review"), { recursive: true });
    await mkdir(path.join(deckPath, "design", "design-brief.md"), { recursive: true });
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

  await check("runner rejects unreadable Design Brief after valid Claude Design Source before TAKT", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-invalid-design-brief-"));
    const targetInfo = await makeDeck(root, "demo");
    await rm(path.join(targetInfo.deckPath, "design", "design-brief.md"), { force: true });
    await mkdir(path.join(targetInfo.deckPath, "design", "design-brief.md"), { recursive: true });
    const selectedWorkflowPath = await makeSelectedWorkflowFile("plan");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeTaktScript(["run-current"], "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "plan", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "runner unexpectedly accepted unreadable Design Brief");
    assert(result.stderr.includes("DESIGN_BRIEF_INVALID:"), `invalid Design Brief did not surface DESIGN_BRIEF_INVALID: ${result.stderr}`);
    assert(result.stderr.includes("slides/demo/design/design-brief.md"), `invalid Design Brief message did not identify file: ${result.stderr}`);
    assert(!existsSync(argsPath), "TAKT was invoked despite unreadable Design Brief");
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

  await check("compose force validates approved plan Design Contract fingerprint before archiving artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-compose-force-plan-fingerprint-"));
    const targetInfo = await makeDeck(root, "demo");
    const currentContract = (await resolveClaudeDesignContract(targetInfo, { root })).contract;
    await writePlanDesignContractArtifacts(targetInfo, currentContract.fingerprint.contract_sha256);
    await markComposeApproved(targetInfo);
    await mkdir(path.join(root, "dist", "demo"), { recursive: true });
    await writeFile(path.join(root, "dist", "demo", "SLIDES.pdf"), "old pdf", "utf8");
    await writeFile(path.join(targetInfo.deckPath, "design", "Claude Design Smoke.zip"), changedClaudeDesignSourceBuffer());
    const selectedWorkflowPath = await makeSelectedWorkflowFile("compose");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-compose", "compose", "composed", "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "compose", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock", "--force"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "compose force unexpectedly accepted stale plan Design Contract fingerprint");
    assert(result.stderr.includes("DESIGN_CONTRACT_PLAN_FINGERPRINT_MISMATCH:"), `compose force mismatch did not surface DESIGN_CONTRACT_PLAN_FINGERPRINT_MISMATCH: ${result.stderr}`);
    assert(existsSync(supervisionPath(targetInfo, "compose")), "compose force archived supervision before validating plan Design Contract fingerprint");
    assert(existsSync(approvalPath(targetInfo, "compose")), "compose force archived approval before validating plan Design Contract fingerprint");
    assert(existsSync(path.join(root, "dist", "demo", "SLIDES.pdf")), "compose force cleaned generated outputs before validating plan Design Contract fingerprint");
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "compose force created review history before validating plan Design Contract fingerprint");
    assert(!existsSync(argsPath), "TAKT was invoked despite stale plan Design Contract fingerprint");
  });

  await check("compose force validates Design Brief fingerprint before archiving artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-compose-force-design-brief-"));
    const targetInfo = await makeDeck(root, "demo");
    const currentContract = (await resolveClaudeDesignContract(targetInfo, { root })).contract;
    await writePlanDesignContractArtifacts(
      targetInfo,
      currentContract.fingerprint.contract_sha256,
      currentContract.authoring.design_brief.sha256,
    );
    await markComposeApproved(targetInfo);
    await mkdir(path.join(root, "dist", "demo"), { recursive: true });
    await writeFile(path.join(root, "dist", "demo", "SLIDES.pdf"), "old pdf", "utf8");
    await writeFile(path.join(targetInfo.deckPath, "design", "design-brief.md"), "# Design Brief\n\nChanged after plan approval.\n", "utf8");
    const selectedWorkflowPath = await makeSelectedWorkflowFile("compose");
    const fakePackage = await makeFakePackageRoot();
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-compose", "compose", "composed", "passed"));
    const argsPath = path.join(root, "takt-args.txt");

    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "compose", "slides/demo", "--workflow-file", selectedWorkflowPath, "--provider", "mock", "--force"],
      { cwd: root, encoding: "utf8", env: { ...process.env, TAKT_ARGS_CAPTURE: argsPath } },
    );
    assert(result.status !== 0, "compose force unexpectedly accepted stale Design Brief fingerprint");
    assert(result.stderr.includes("DESIGN_BRIEF_DRIFT:"), `compose force Design Brief drift did not surface DESIGN_BRIEF_DRIFT: ${result.stderr}`);
    assert(existsSync(supervisionPath(targetInfo, "compose")), "compose force archived supervision before validating Design Brief fingerprint");
    assert(existsSync(approvalPath(targetInfo, "compose")), "compose force archived approval before validating Design Brief fingerprint");
    assert(existsSync(path.join(root, "dist", "demo", "SLIDES.pdf")), "compose force cleaned generated outputs before validating Design Brief fingerprint");
    assert(!existsSync(path.join(targetInfo.reviewPath, "history")), "compose force created review history before validating Design Brief fingerprint");
    assert(!existsSync(argsPath), "TAKT was invoked despite stale Design Brief fingerprint");
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

  await check("runner rejects stale Design Contract hash before polish", async () => {
    const { root, fakePackage } = await prepareApprovedComposeFixture("slide-workflow-polish-stale-design-contract-hash-");
    const planMarker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(planMarker.design_contract?.path, `plan marker did not create design_contract: ${JSON.stringify(planMarker)}`);
    const contractPath = path.join(root, planMarker.design_contract.path);
    const contract = JSON.parse(await readFile(contractPath, "utf8"));
    contract.tokens[0].value = "__tampered_without_rehash__";
    await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

    const polishWorkflowPath = await makeSelectedWorkflowFile("polish");
    await makeTaktExecutable(fakePackage.packageRoot, fakeCommandTaktScript("run-polish", "polish", "polished", "passed"));
    const result = spawnSync(
      process.execPath,
      [fakePackage.runnerScript, "polish", "slides/demo", "--workflow-file", polishWorkflowPath, "--provider", "mock"],
      { cwd: root, encoding: "utf8" },
    );
    assert(result.status === 0, `polish runner failed after stale contract hash setup: ${result.stderr}`);
    const marker = JSON.parse(await readFile(path.join(root, ".takt", "workflow-current-target.json"), "utf8"));
    assert(marker.command === "polish", `polish marker command mismatch after stale contract hash fallback: ${JSON.stringify(marker)}`);
    assert(!marker.design_contract, `polish marker kept stale hash design_contract: ${JSON.stringify(marker)}`);
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

async function writePlanDesignContractArtifacts(targetInfo, contractSha256, designBriefSha256 = null) {
  const lines = [
    "# Slide Plan",
    "",
    "## Design Contract",
    `- Contract fingerprint: ${contractSha256}`,
    ...(designBriefSha256 ? [`- Design Brief fingerprint: ${designBriefSha256}`] : []),
    "",
  ].join("\n");
  await writeFile(path.join(targetInfo.deckPath, "plan.md"), lines, "utf8");
  await writeFile(path.join(targetInfo.deckPath, "slide-blueprint.md"), lines.replace("# Slide Plan", "# Slide Blueprint"), "utf8");
}

function changedClaudeDesignSourceBuffer() {
  const manifest = {
    namespace: "ClaudeDesignChanged",
    globalCssPaths: ["tokens/colors.css", "tokens/typography.css", "tokens/spacing.css", "styles.css"],
    tokens: [
      { name: "--accent", value: "#004488", kind: "color", definedIn: "tokens/colors.css" },
      { name: "--font-body", value: "'Noto Sans JP', sans-serif", kind: "font", definedIn: "tokens/typography.css" },
      { name: "--space-4", value: "20px", kind: "spacing", definedIn: "tokens/spacing.css" },
    ],
  };
  return createZipArchiveBuffer({
    "_ds_manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "styles.css": "",
    "tokens/colors.css": ":root { --accent: #004488; }\n",
    "tokens/typography.css": ":root { --font-body: 'Noto Sans JP', sans-serif; }\n",
    "tokens/spacing.css": ":root { --space-4: 20px; }\n",
  });
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
