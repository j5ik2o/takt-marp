import { statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveRuntimeContext } from "./takt-marp-runtime-context.mjs";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";

export const TEMPLATE_DOMAINS = Object.freeze(["workflows", "facets"]);
export const WORKFLOW_TEMPLATE_COMMANDS = Object.freeze(["plan", "compose", "polish", "deliver"]);
export const TEMPLATE_DRIFT_KINDS = Object.freeze([
  { key: "missingInTemplate", label: "missing in template (exists only in dev .takt)" },
  { key: "missingInDev", label: "missing in dev .takt (exists only in template)" },
  { key: "contentMismatch", label: "content mismatch" },
]);

export const PROHIBITED_TEMPLATE_PATTERNS = Object.freeze([
  /(^|\/)config\.yaml$/i,
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
