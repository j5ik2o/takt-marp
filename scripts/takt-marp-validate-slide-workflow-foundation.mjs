#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
  resolveTemplateSource,
  workflowFilePath,
} from "./lib/takt-marp-project-templates.mjs";
import {
  archiveCommandArtifacts,
  APPROVAL_COMMANDS,
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
  requireCommand,
  resolveDeckTarget,
  supervisionPath,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";
import { runCli } from "./lib/takt-marp-cli.mjs";
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

    const templateEntries = [
      { relativePath: "workflows/takt-marp-slide-plan.yaml" },
      { relativePath: "facets/instructions/takt-marp-compose-fix.md" },
    ];
    const validPackPaths = [
      ...REQUIRED_PACK_FILES,
      "fixtures/marp-slide-workflow/_workflow-smoke/brief.md",
      "templates/project/workflows/takt-marp-slide-plan.yaml",
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
    for (const command of ["eject", "plan", "compose", "polish", "deliver", "approve", "smoke", "build:html", "build:pdf", "build:pptx", "preview"]) {
      assert(new RegExp(`^  ${command}\\b`, "m").test(stdout), `help missing public command '${command}': ${stdout}`);
    }
    assert(!/^  init\b/m.test(stdout), `help must not expose retired init command: ${stdout}`);
  });

  await check("CLI rejects unknown commands and slide:* commands as invalid global commands", async () => {
    const unknown = await captureOutput(() => runCli(["not-a-command"]));
    assert(unknown.result === 1, `unknown command should exit 1, got ${unknown.result}`);
    assert(unknown.stderr.includes("UNKNOWN_COMMAND"), `unknown command must use UNKNOWN_COMMAND: ${unknown.stderr}`);
    assert(!unknown.stderr.includes("init"), `unknown command valid-command guidance must not mention init: ${unknown.stderr}`);

    const slideCommand = await captureOutput(() => runCli(["slide:plan"]));
    assert(slideCommand.result === 1, `slide:plan should exit 1, got ${slideCommand.result}`);
    assert(slideCommand.stderr.includes("UNKNOWN_COMMAND"), `slide:* command must be rejected with UNKNOWN_COMMAND: ${slideCommand.stderr}`);
    assert(slideCommand.stderr.includes("'slide:plan' is not a takt-marp command"), `slide:* rejection should name the invalid command: ${slideCommand.stderr}`);
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
    assert(
      JSON.stringify(researchConfig.invalidationTargets) === JSON.stringify(["research"]),
      `research invalidation targets must stay in research domain, got ${researchConfig.invalidationTargets.join(", ")}`,
    );
    assert(!APPROVAL_COMMANDS.includes("research"), `research must not support approval: ${APPROVAL_COMMANDS.join(", ")}`);
    assert(
      JSON.stringify(downstreamCommands("research")) === JSON.stringify(["research"]),
      `research downstream must stay in research domain, got ${downstreamCommands("research").join(", ")}`,
    );
    assert(JSON.stringify(planConfig.sourceArtifacts) === JSON.stringify(["brief.md"]), `plan prerequisites changed: ${planConfig.sourceArtifacts.join(", ")}`);
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
    const providerArgIndex = args.indexOf("--provider");
    assert(providerArgIndex >= 0, `TAKT args did not include --provider: ${args.join(" ")}`);
    assert(args[providerArgIndex + 1] === "mock", `TAKT provider argument was not preserved: ${args.join(" ")}`);
    assert(!existsSync(path.join(root, ".takt", "workflows")), "selected workflow runner created project-local workflow templates");
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
    const expectedWorkflowPath = path.join(fakePackage.packageRoot, "templates", "project", "workflows", "takt-marp-slide-plan.yaml");
    assert(workflowArgIndex >= 0, `TAKT args did not include -w: ${args.join(" ")}`);
    assert(args[workflowArgIndex + 1] === expectedWorkflowPath, `TAKT did not receive bundled workflow path: ${args.join(" ")}`);
    const providerArgIndex = args.indexOf("--provider");
    assert(providerArgIndex >= 0, `TAKT args did not include --provider: ${args.join(" ")}`);
    assert(args[providerArgIndex + 1] === "mock", `TAKT provider argument was not preserved: ${args.join(" ")}`);
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
  return resolveDeckTarget(`slides/${deckName}`, { root });
}

async function makeSelectedWorkflowFile(command) {
  const selectedSourceRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-selected-source-"));
  const selectedWorkflowPath = path.join(selectedSourceRoot, "workflows", `takt-marp-slide-${command}.yaml`);
  await mkdir(path.dirname(selectedWorkflowPath), { recursive: true });
  await writeFile(selectedWorkflowPath, `name: selected-${command}\n`, "utf8");
  return selectedWorkflowPath;
}

async function makeFakePackageRoot() {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "slide-workflow-package-"));
  // Copy (not symlink) so ESM realpath resolution derives packageRoot from the fake package, not the repo.
  for (const relative of [
    "takt-marp-run-slide-workflow.mjs",
    path.join("lib", "takt-marp-errors.mjs"),
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
