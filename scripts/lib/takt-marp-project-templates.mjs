import { statSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRuntimeContext } from "./takt-marp-runtime-context.mjs";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";

export const TEMPLATE_DOMAINS = Object.freeze(["workflows", "facets"]);
export const WORKFLOW_TEMPLATE_COMMANDS = Object.freeze(["research", "plan", "compose", "polish", "deliver"]);
export const TEMPLATE_DRIFT_KINDS = Object.freeze([
  { key: "missingInTemplate", label: "missing in template (exists only in dev .takt)" },
  { key: "missingInDev", label: "missing in dev .takt (exists only in template)" },
  { key: "contentMismatch", label: "content mismatch" },
]);

export const PROHIBITED_TEMPLATE_PATTERNS = Object.freeze([
  /(^|\/)config\.yaml$/i,
  /(^|\/)provider-settings\.ya?ml$/i,
  /(^|\/)runs(\/|$)/i,
  /(^|\/)render(\/|$)/i,
  /(^|\/)persona_sessions\.json$/i,
  /(^|\/)session-state\.json$/i,
  /(^|\/)workflow-current-target\.json$/i,
  /(^|\/)\.env(\.|\/|$)/i,
  /credential/i,
  /api[^/]*key/i,
  /secret/i,
  /token/i,
]);

export function templateRootPath() {
  return path.join(resolveRuntimeContext().packageRoot, "templates", "project");
}

function normalizeTemplateSourceOptions(projectRootOrOptions = {}) {
  if (typeof projectRootOrOptions === "string") {
    return {
      projectRoot: path.resolve(projectRootOrOptions),
      templateRoot: templateRootPath(),
    };
  }

  const options = projectRootOrOptions ?? {};
  const runtimeContext = resolveRuntimeContext();
  return {
    projectRoot: path.resolve(options.projectRoot ?? options.root ?? runtimeContext.projectRoot),
    templateRoot: path.resolve(options.templateRoot ?? templateRootPath()),
  };
}

function directoryExists(directoryPath) {
  try {
    return statSync(directoryPath).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

function partialTemplateStateMessage(hasWorkflows, hasFacets) {
  const present = hasWorkflows ? ".takt/workflows" : ".takt/facets";
  const missing = hasWorkflows && !hasFacets ? ".takt/facets" : ".takt/workflows";
  return (
    `Project has partial template state: ${present} exists without ${missing}. ` +
    `Repair the project-local template state by creating ${missing} or removing ${present} to use bundled templates.`
  );
}

export function resolveTemplateSource(projectRootOrOptions = {}) {
  const { projectRoot, templateRoot } = normalizeTemplateSourceOptions(projectRootOrOptions);
  const ejectedRoot = path.join(projectRoot, ".takt");
  const ejectedWorkflowsDir = path.join(ejectedRoot, "workflows");
  const ejectedFacetsDir = path.join(ejectedRoot, "facets");
  const hasWorkflows = directoryExists(ejectedWorkflowsDir);
  const hasFacets = directoryExists(ejectedFacetsDir);

  if (!hasWorkflows && !hasFacets) {
    return Object.freeze({
      kind: "bundled",
      rootDir: templateRoot,
      workflowsDir: path.join(templateRoot, "workflows"),
      facetsDir: path.join(templateRoot, "facets"),
    });
  }

  if (hasWorkflows && hasFacets) {
    return Object.freeze({
      kind: "ejected",
      rootDir: ejectedRoot,
      workflowsDir: ejectedWorkflowsDir,
      facetsDir: ejectedFacetsDir,
    });
  }

  throw new SlideWorkflowError(
    partialTemplateStateMessage(hasWorkflows, hasFacets),
    "PROJECT_TEMPLATE_STATE_INVALID",
  );
}

export function workflowFilePath(source, command) {
  if (!WORKFLOW_TEMPLATE_COMMANDS.includes(command)) {
    throw new SlideWorkflowError(
      `Unsupported workflow command '${command}'. Expected one of: ${WORKFLOW_TEMPLATE_COMMANDS.join(", ")}`,
      "INVALID_COMMAND",
    );
  }
  return path.join(source.workflowsDir, `takt-marp-slide-${command}.yaml`);
}

export function researchReuseWorkflowFilePath(researchWorkflowFilePath) {
  return path.join(path.dirname(researchWorkflowFilePath), "takt-marp-slide-research-reuse.yaml");
}

function isPathInside(basePath, targetPath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function bundledDeepResearchWorkflowPath() {
  return path.join(
    resolveRuntimeContext().packageRoot,
    "node_modules",
    "takt",
    "builtins",
    "ja",
    "workflows",
    "deep-research.yaml",
  );
}

function rewriteWorkflowForTakt(workflowContent) {
  return workflowContent
    .replaceAll("../facets/personas/", "../personas/")
    .replace(/^(\s*)call:\s+deep-research\s*$/m, "$1call: ./takt-marp-bundled-deep-research.yaml");
}

async function writeCallableBundledDeepResearchWorkflow(workflowsDir) {
  const sourcePath = bundledDeepResearchWorkflowPath();
  let source;
  try {
    source = await readFile(sourcePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new SlideWorkflowError(
        `TAKT built-in workflow 'deep-research' is not available: ${sourcePath}. Reinstall takt-marp and verify the bundled takt package.`,
        "BUILTIN_WORKFLOW_NOT_AVAILABLE",
      );
    }
    throw error;
  }
  const callableSource = [
    "subworkflow:",
    "  callable: true",
    "  visibility: internal",
    source,
  ].join("\n");
  await writeFile(path.join(workflowsDir, "takt-marp-bundled-deep-research.yaml"), callableSource, "utf8");
}

export async function prepareBundledWorkflowRuntime(workflowFile, options = {}) {
  const templateRoot = path.resolve(options.templateRoot ?? templateRootPath());
  const bundledWorkflowsRoot = path.join(templateRoot, "workflows");
  const resolvedWorkflowFile = path.resolve(options.root ?? process.cwd(), workflowFile);
  const projectRoot = path.resolve(options.projectRoot ?? options.root ?? process.cwd());
  const ejectedRoot = path.join(projectRoot, ".takt");
  const ejectedWorkflowsRoot = path.join(ejectedRoot, "workflows");
  const stageBundledDeepResearch = options.stageBundledDeepResearch ?? true;
  const shouldStageEjectedResearch =
    stageBundledDeepResearch &&
    path.basename(resolvedWorkflowFile) === "takt-marp-slide-research.yaml" &&
    isPathInside(ejectedWorkflowsRoot, resolvedWorkflowFile);
  const sourceRoot = isPathInside(bundledWorkflowsRoot, resolvedWorkflowFile)
    ? templateRoot
    : shouldStageEjectedResearch
      ? ejectedRoot
      : null;
  if (!sourceRoot) {
    return Object.freeze({
      workflowFilePath: resolvedWorkflowFile,
      cleanup: async () => {},
    });
  }

  const workflowsRoot = path.join(sourceRoot, "workflows");
  const runtimeParent = path.join(projectRoot, "workflows");
  const runtimeParentExisted = directoryExists(runtimeParent);
  await mkdir(runtimeParent, { recursive: true });
  const runtimeRoot = await mkdtemp(path.join(runtimeParent, ".takt-marp-bundled-runtime-"));
  const runtimeWorkflowsDir = path.join(runtimeRoot, "workflows");
  await mkdir(runtimeWorkflowsDir, { recursive: true });
  await cp(path.join(sourceRoot, "facets"), path.join(runtimeRoot, "facets"), { recursive: true });
  await cp(path.join(sourceRoot, "facets", "personas"), path.join(runtimeRoot, "personas"), { recursive: true });

  const workflowEntries = await readdir(workflowsRoot, { withFileTypes: true });
  for (const entry of workflowEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
      continue;
    }
    const sourcePath = path.join(workflowsRoot, entry.name);
    const destinationPath = path.join(runtimeWorkflowsDir, entry.name);
    const source = await readFile(sourcePath, "utf8");
    await writeFile(destinationPath, rewriteWorkflowForTakt(source), "utf8");
  }
  if (stageBundledDeepResearch && path.basename(resolvedWorkflowFile) === "takt-marp-slide-research.yaml") {
    await writeCallableBundledDeepResearchWorkflow(runtimeWorkflowsDir);
  }

  return Object.freeze({
    workflowFilePath: path.join(runtimeWorkflowsDir, path.basename(resolvedWorkflowFile)),
    cleanup: async () => {
      await rm(runtimeRoot, { recursive: true, force: true });
      if (!runtimeParentExisted) {
        await rmdir(runtimeParent).catch((error) => {
          if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") {
            throw error;
          }
        });
      }
    },
  });
}

async function listDomainFiles(templateRoot, domain) {
  const domainDir = path.join(templateRoot, domain);
  let dirents;
  try {
    dirents = await readdir(domainDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return [];
    }
    throw error;
  }
  return dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => {
      const absolutePath = path.join(dirent.parentPath, dirent.name);
      return path.relative(templateRoot, absolutePath).split(path.sep).join("/");
    });
}

export async function listTemplateEntries(options = {}) {
  const templateRoot = options.templateRoot ?? templateRootPath();
  const entries = [];
  for (const domain of TEMPLATE_DOMAINS) {
    for (const relativePath of await listDomainFiles(templateRoot, domain)) {
      entries.push({ domain, relativePath, sourcePath: path.join(templateRoot, relativePath) });
    }
  }
  entries.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return entries;
}

export function assertNoProhibitedEntries(entries) {
  const offending = entries
    .map((entry) => entry.relativePath)
    .filter((relativePath) => PROHIBITED_TEMPLATE_PATTERNS.some((pattern) => pattern.test(relativePath)))
    .sort();
  if (offending.length > 0) {
    throw new SlideWorkflowError(
      `Template tree contains prohibited entries: ${offending.join(", ")}`,
      "PACKAGE_BOUNDARY_VIOLATION",
    );
  }
}

export async function diffTemplateTrees(templateRoot, devTaktRoot) {
  const templateEntries = await listTemplateEntries({ templateRoot });
  const devEntries = await listTemplateEntries({ templateRoot: devTaktRoot });
  assertNoProhibitedEntries(templateEntries);
  assertNoProhibitedEntries(devEntries);
  const templatePaths = new Map(templateEntries.map((entry) => [entry.relativePath, entry.sourcePath]));
  const devPaths = new Map(devEntries.map((entry) => [entry.relativePath, entry.sourcePath]));

  const missingInTemplate = [...devPaths.keys()].filter((relativePath) => !templatePaths.has(relativePath)).sort();
  const missingInDev = [...templatePaths.keys()].filter((relativePath) => !devPaths.has(relativePath)).sort();

  const contentMismatch = [];
  for (const [relativePath, sourcePath] of templatePaths) {
    const devPath = devPaths.get(relativePath);
    if (!devPath) {
      continue;
    }
    const [templateContent, devContent] = await Promise.all([readFile(sourcePath), readFile(devPath)]);
    if (!templateContent.equals(devContent)) {
      contentMismatch.push(relativePath);
    }
  }
  contentMismatch.sort();

  return { missingInTemplate, missingInDev, contentMismatch };
}

export function countTemplateDriftPaths(drift) {
  return TEMPLATE_DRIFT_KINDS.reduce((total, kind) => total + (drift[kind.key]?.length ?? 0), 0);
}

export function formatTemplateDrift(drift) {
  const lines = [];
  for (const kind of TEMPLATE_DRIFT_KINDS) {
    const relativePaths = drift[kind.key] ?? [];
    if (relativePaths.length === 0) {
      continue;
    }
    lines.push(`${kind.label} (${relativePaths.length}):`);
    for (const relativePath of relativePaths) {
      lines.push(`  - ${relativePath}`);
    }
  }
  return lines;
}
