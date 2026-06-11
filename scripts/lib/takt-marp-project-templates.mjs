import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveRuntimeContext } from "./takt-marp-runtime-context.mjs";
import { SlideWorkflowError } from "./takt-marp-slide-workflow.mjs";

export const TEMPLATE_DOMAINS = Object.freeze(["workflows", "facets"]);

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
