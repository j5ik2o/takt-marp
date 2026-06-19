#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  packageScriptPath,
  resolveRuntimeContext,
  runtimeExecutablePath,
} from "./lib/takt-marp-runtime-context.mjs";
import { ejectProject } from "./lib/takt-marp-project-eject.mjs";
import { initializeProject } from "./lib/takt-marp-project-init.mjs";
import {
  listTemplateEntries,
  resolveTemplateSource,
  workflowFilePath,
} from "./lib/takt-marp-project-templates.mjs";
import {
  archiveCommandArtifacts,
  assertTaktExecutableAvailable,
  assertWorkflowAvailable,
  checkRequiredState,
  cleanGeneratedOutputs,
  commandSupervisionResult,
  formatError,
  isSuccessfulCommandState,
  parseFrontMatter,
  parseRequiredState,
  resolveDeckTarget,
  supervisionPath,
  writeApproval,
} from "./lib/takt-marp-slide-workflow.mjs";
import { runCli } from "./lib/takt-marp-cli.mjs";

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
      path.join(SCRIPT_DIR, "lib", "takt-marp-project-init.mjs"),
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
        await initializeProject({ targetDir, force: false });
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

  await check("invalid target rejects markdown file", async () => {
    const root = await fixtureRoot();
    await makeDeck(root, "demo");
    await expectFailure(() => resolveDeckTarget("slides/demo/brief.md", { root }), "INVALID_TARGET");
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

  await check("approve command requires initialized project", async () => {
    const root = await fixtureRoot();
    const originalCwd = process.cwd();
    try {
      process.chdir(root);
      const code = await runCli(["approve", "slides/demo", "plan", "--by", "foundation-test"]);
      assert(code !== 0, "approve unexpectedly succeeded in uninitialized project");
    } finally {
      process.chdir(originalCwd);
    }
  });

  await check("approve command writes approval file", async () => {
    const root = await initializedFixtureRoot();
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

async function makeDeck(root, deckName) {
  const deckPath = path.join(root, "slides", deckName);
  await mkdir(path.join(deckPath, "review"), { recursive: true });
  await writeFile(path.join(deckPath, "brief.md"), "# Brief\n");
  return resolveDeckTarget(`slides/${deckName}`, { root });
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

async function makeTaktExecutable(root, script = "#!/bin/sh\nexit 0\n") {
  const executablePath = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "takt.cmd" : "takt");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(executablePath, script, { encoding: "utf8", mode: 0o755 });
}

function runtimeExecutableName(tool) {
  return process.platform === "win32" ? `${tool}.cmd` : tool;
}

function fakeTaktScript(runNames, result) {
  const lines = [
    "#!/bin/sh",
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
