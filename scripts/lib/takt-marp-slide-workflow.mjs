import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";
import { runtimeExecutablePath } from "./takt-marp-runtime-context.mjs";

export { SlideWorkflowError, formatError } from "./takt-marp-errors.mjs";

const COMMAND_CONFIG_ENTRIES = Object.freeze([
  commandConfig({
    name: "research",
    successfulState: "researched",
    artifactDomain: "research",
    approvalSupported: false,
    invalidationTargets: ["research"],
    sourceArtifacts: [],
  }),
  commandConfig({
    name: "plan",
    successfulState: "planned",
    artifactDomain: "review",
    approvalSupported: true,
    invalidationTargets: ["plan", "compose", "polish", "deliver"],
    sourceArtifacts: ["brief.md"],
  }),
  commandConfig({
    name: "compose",
    successfulState: "composed",
    artifactDomain: "review",
    approvalSupported: true,
    invalidationTargets: ["compose", "polish", "deliver"],
    sourceArtifacts: [],
    requiredState: "plan:planned:approved",
  }),
  commandConfig({
    name: "polish",
    successfulState: "polished",
    artifactDomain: "review",
    approvalSupported: false,
    invalidationTargets: ["polish", "deliver"],
    sourceArtifacts: [],
    requiredState: "compose:composed:approved",
  }),
  commandConfig({
    name: "deliver",
    successfulState: "delivered",
    artifactDomain: "review",
    approvalSupported: false,
    invalidationTargets: ["deliver"],
    sourceArtifacts: [],
    requiredState: "polish:polished",
  }),
]);

export const COMMAND_CONFIGS = Object.freeze(Object.fromEntries(COMMAND_CONFIG_ENTRIES.map((config) => [config.name, config])));
export const COMMANDS = Object.freeze(COMMAND_CONFIG_ENTRIES.map((config) => config.name));
export const COMMAND_STATES = Object.freeze(
  Object.fromEntries(COMMAND_CONFIG_ENTRIES.map((config) => [config.name, config.successfulState])),
);
export const APPROVAL_COMMANDS = Object.freeze(
  COMMAND_CONFIG_ENTRIES.filter((config) => config.approvalSupported).map((config) => config.name),
);
export const RESEARCH_ARTIFACT_FILES = Object.freeze({
  brief: "research-brief.md",
  report: "research-report.md",
  sources: "research-sources.md",
  claims: "research-claims.md",
  openQuestions: "open-questions.md",
  supervision: "research-supervision.md",
});

function commandConfig(config) {
  return Object.freeze({
    ...config,
    invalidationTargets: Object.freeze([...config.invalidationTargets]),
    sourceArtifacts: Object.freeze([...config.sourceArtifacts]),
  });
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new SlideWorkflowError(`Missing value for --${key}`, "INVALID_ARGS");
      }
      flags[key] = value;
      index += 1;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

export function requireCommand(command) {
  return configFor(command).name;
}

export function configFor(command) {
  if (!Object.hasOwn(COMMAND_CONFIGS, command)) {
    throw new SlideWorkflowError(
      `Unsupported command '${command}'. Expected one of: ${COMMANDS.join(", ")}`,
      "INVALID_COMMAND",
    );
  }
  const config = COMMAND_CONFIGS[command];
  return config;
}

export function resolveDeckTarget(target, options = {}) {
  const root = options.root ?? process.cwd();
  if (!target) {
    throw new SlideWorkflowError("Missing target. Expected target: slides/<deck>", "INVALID_TARGET");
  }
  if (target.endsWith(".md")) {
    throw new SlideWorkflowError(
      `Invalid target '${target}'. Expected target: slides/<deck>; pass the deck directory instead of a Markdown file.`,
      "INVALID_TARGET",
    );
  }

  const normalized = path.posix.normalize(target.replaceAll(path.sep, "/"));
  if (normalized.startsWith("../") || normalized === ".." || path.isAbsolute(target)) {
    throw new SlideWorkflowError(`Invalid target '${target}'. Target must be under slides/<deck>`, "INVALID_TARGET");
  }

  const parts = normalized.split("/");
  if (parts.length !== 2 || parts[0] !== "slides" || !parts[1] || parts[1] === "." || parts[1] === "..") {
    throw new SlideWorkflowError(`Invalid target '${target}'. Expected target: slides/<deck>`, "INVALID_TARGET");
  }

  const deckPath = path.join(root, parts[0], parts[1]);
  if (!existsSync(deckPath)) {
    throw new SlideWorkflowError(`Deck directory not found: ${normalized}`, "INVALID_TARGET");
  }

  return Object.freeze({
    deckName: parts[1],
    target: normalized,
    deckPath,
    reviewPath: path.join(deckPath, "review"),
    researchPath: path.join(deckPath, "research"),
  });
}

export function workflowPath(command, options = {}) {
  requireCommand(command);
  if (options.workflowFilePath) {
    return path.resolve(options.root ?? process.cwd(), options.workflowFilePath);
  }
  const root = options.root ?? process.cwd();
  return path.join(root, ".takt", "workflows", `takt-marp-slide-${command}.yaml`);
}

export function assertWorkflowAvailable(command, options = {}) {
  const expectedPath = workflowPath(command, options);
  if (!existsSync(expectedPath)) {
    throw new SlideWorkflowError(
      `Workflow YAML is not implemented: ${path.relative(options.root ?? process.cwd(), expectedPath)}. ` +
        "Implement it in the slide-workflow-orchestration spec before running this command.",
      "WORKFLOW_NOT_IMPLEMENTED",
    );
  }
  return expectedPath;
}

export function taktExecutablePath(options = {}) {
  return runtimeExecutablePath("takt", options);
}

export function assertTaktExecutableAvailable(options = {}) {
  const executablePath = taktExecutablePath(options);
  try {
    accessSync(executablePath, constants.X_OK);
  } catch {
    throw new SlideWorkflowError(
      `TAKT executable is not available: ${executablePath}. Reinstall takt-marp (npm install -g takt-marp) and verify its dependencies.`,
      "TAKT_EXECUTABLE_MISSING",
    );
  }
  return executablePath;
}

export function parseFrontMatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    throw new SlideWorkflowError("Missing YAML front matter", "FRONT_MATTER_MISSING");
  }
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    throw new SlideWorkflowError("Unclosed YAML front matter", "FRONT_MATTER_INVALID");
  }

  const body = markdown.slice(end + 4).replace(/^\n/, "");
  const frontMatter = {};
  const lines = markdown.slice(4, end).split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s/.test(line) || line.trim().startsWith("- ")) {
      throw new SlideWorkflowError(`Unsupported front matter syntax: ${line}`, "FRONT_MATTER_UNSUPPORTED");
    }
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new SlideWorkflowError(`Unsupported front matter syntax: ${line}`, "FRONT_MATTER_UNSUPPORTED");
    }
    frontMatter[match[1]] = parseScalar(match[2] ?? "");
  }

  return Object.freeze({ frontMatter: Object.freeze(frontMatter), body });
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "[]") return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return parseInlineArray(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.includes("[") || trimmed.includes("]") || trimmed.includes("{") || trimmed.includes("}")) {
    throw new SlideWorkflowError(`Unsupported scalar value: ${value}`, "FRONT_MATTER_UNSUPPORTED");
  }
  return trimmed;
}

function parseInlineArray(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  if (inner.includes("[") || inner.includes("]") || inner.includes("{") || inner.includes("}")) {
    throw new SlideWorkflowError(`Unsupported scalar value: ${value}`, "FRONT_MATTER_UNSUPPORTED");
  }
  return inner.split(",").map((item) => parseArrayItem(item.trim()));
}

function parseArrayItem(value) {
  if (!value) {
    throw new SlideWorkflowError("Empty inline array item is unsupported", "FRONT_MATTER_UNSUPPORTED");
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.includes(":")) {
    throw new SlideWorkflowError(`Unsupported inline array item: ${value}`, "FRONT_MATTER_UNSUPPORTED");
  }
  return value;
}

export async function readFrontMatter(filePath) {
  if (!existsSync(filePath)) {
    throw new SlideWorkflowError(`Missing file: ${filePath}`, "FILE_MISSING");
  }
  return parseFrontMatter(await readFile(filePath, "utf8")).frontMatter;
}

export function artifactDomainPath(targetInfo, command) {
  const config = configFor(command);
  if (config.artifactDomain === "research") {
    return targetInfo.researchPath ?? path.join(targetInfo.deckPath, "research");
  }
  if (config.artifactDomain === "review") {
    return targetInfo.reviewPath ?? path.join(targetInfo.deckPath, "review");
  }
  throw new SlideWorkflowError(`Unsupported artifact domain '${config.artifactDomain}' for ${command}`, "INVALID_COMMAND");
}

export function researchArtifactPaths(targetInfo) {
  const researchPath = targetInfo.researchPath ?? path.join(targetInfo.deckPath, "research");
  return Object.freeze(
    Object.fromEntries(Object.entries(RESEARCH_ARTIFACT_FILES).map(([key, fileName]) => [key, path.join(researchPath, fileName)])),
  );
}

export function supervisionPath(targetInfo, command) {
  return path.join(artifactDomainPath(targetInfo, command), `${command}-supervision.md`);
}

export function approvalPath(targetInfo, command) {
  return path.join(targetInfo.reviewPath, `${command}-approval.md`);
}

export async function readSupervision(targetInfo, command) {
  requireCommand(command);
  const filePath = supervisionPath(targetInfo, command);
  const data = await readFrontMatter(filePath);
  validateSupervision(data, targetInfo, command);
  return Object.freeze({ filePath, data });
}

export function validateSupervision(data, targetInfo, command) {
  const expectedState = COMMAND_STATES[command];
  requireField(data, "command", command);
  requireField(data, "target", targetInfo.target);
  requireField(data, "step", "supervision");
  requireField(data, "workflow_run_id");
  requireNumberField(data, "cycle");
  requireField(data, "state");
  requireField(data, "result");
  requireNumberField(data, "blocking_findings");
  requireNumberField(data, "major_findings");
  requireNumberField(data, "minor_findings");
  requireNumberField(data, "info_findings");
  requireDate(data, "generated_at");
  if (data.result === "passed" && data.state !== expectedState) {
    throw new SlideWorkflowError(
      `Invalid supervision state for ${command}. Expected '${expectedState}', got '${data.state}'`,
      "STATE_MISMATCH",
    );
  }
}

export async function readApproval(targetInfo, command, supervision) {
  if (!APPROVAL_COMMANDS.includes(command)) {
    throw new SlideWorkflowError(`Approval is supported only for: ${APPROVAL_COMMANDS.join(", ")}`, "APPROVAL_UNSUPPORTED");
  }
  const filePath = approvalPath(targetInfo, command);
  const data = await readFrontMatter(filePath);
  validateApproval(data, targetInfo, command, supervision);
  return Object.freeze({ filePath, data });
}

export function validateApproval(data, targetInfo, command, supervision) {
  requireField(data, "status", "approved");
  requireField(data, "command", command);
  requireField(data, "target", targetInfo.target);
  requireField(data, "approved_state", COMMAND_STATES[command]);
  requireField(data, "approved_by");
  requireField(data, "supervision_workflow_run_id", supervision.workflow_run_id);
  requireDate(data, "approved_at");
  if (!Array.isArray(data.waivers)) {
    throw new SlideWorkflowError("Approval field 'waivers' must be an array", "APPROVAL_INVALID");
  }
  if (!Array.isArray(data.decisions)) {
    throw new SlideWorkflowError("Approval field 'decisions' must be an array", "APPROVAL_INVALID");
  }
}

function requireField(data, key, expected) {
  if (data[key] === undefined || data[key] === "") {
    throw new SlideWorkflowError(`Missing required field '${key}'`, "FIELD_MISSING");
  }
  if (expected !== undefined && data[key] !== expected) {
    throw new SlideWorkflowError(`Field '${key}' expected '${expected}', got '${data[key]}'`, "FIELD_MISMATCH");
  }
}

function requireNumberField(data, key) {
  requireField(data, key);
  if (typeof data[key] !== "number" || !Number.isFinite(data[key])) {
    throw new SlideWorkflowError(`Field '${key}' must be a finite number`, "FIELD_INVALID");
  }
}

function requireDate(data, key) {
  requireField(data, key);
  const time = Date.parse(data[key]);
  if (Number.isNaN(time)) {
    throw new SlideWorkflowError(`Field '${key}' must be parseable date/time`, "FIELD_INVALID");
  }
}

export function parseRequiredState(value) {
  const [command, state, approval] = (value ?? "").split(":");
  requireCommand(command);
  if (!state) {
    throw new SlideWorkflowError(`Invalid --require '${value}'. Expected command:state[:approved]`, "INVALID_REQUIRE");
  }
  if (approval && approval !== "approved") {
    throw new SlideWorkflowError(`Invalid approval requirement '${approval}'`, "INVALID_REQUIRE");
  }
  return Object.freeze({ command, state, approvalRequired: approval === "approved" });
}

export async function checkRequiredState(targetInfo, requirement) {
  const supervision = await readSupervision(targetInfo, requirement.command);
  if (supervision.data.result !== "passed") {
    throw new SlideWorkflowError(
      `Required supervision is not passed: ${supervision.filePath} result=${supervision.data.result}`,
      "STATE_NOT_PASSED",
    );
  }
  if (supervision.data.state !== requirement.state) {
    throw new SlideWorkflowError(
      `Required state mismatch. Expected ${requirement.command}:${requirement.state}, got ${supervision.data.state}`,
      "STATE_MISMATCH",
    );
  }
  if (requirement.approvalRequired) {
    await readApproval(targetInfo, requirement.command, supervision.data);
  }
  return supervision;
}

export async function assertCommandPrerequisites(targetInfo, command) {
  const config = configFor(command);
  for (const artifactName of config.sourceArtifacts) {
    const artifactPath = path.join(targetInfo.deckPath, artifactName);
    if (!existsSync(artifactPath)) {
      throw new SlideWorkflowError(`Missing ${artifactName}: ${path.relative(process.cwd(), artifactPath)}`, "PREREQUISITE_MISSING");
    }
  }
  if (config.requiredState) {
    await checkRequiredState(targetInfo, parseRequiredState(config.requiredState));
  }
}

export async function writeApproval(targetInfo, command, approvedBy, options = {}) {
  if (!APPROVAL_COMMANDS.includes(command)) {
    throw new SlideWorkflowError(`Approval is supported only for: ${APPROVAL_COMMANDS.join(", ")}`, "APPROVAL_UNSUPPORTED");
  }
  if (!approvedBy) {
    throw new SlideWorkflowError("Missing --by. Approval records must include the human approver.", "APPROVAL_MISSING_BY");
  }
  const supervision = await readSupervision(targetInfo, command);
  if (supervision.data.result !== "passed") {
    throw new SlideWorkflowError(`Cannot approve non-passed supervision: ${supervision.filePath}`, "APPROVAL_REJECTED");
  }

  const filePath = approvalPath(targetInfo, command);
  if (existsSync(filePath) && !options.force) {
    throw new SlideWorkflowError(`Approval already exists: ${filePath}. Use --force to overwrite.`, "APPROVAL_EXISTS");
  }

  await mkdir(targetInfo.reviewPath, { recursive: true });
  const content = [
    "---",
    "status: approved",
    `command: ${command}`,
    `target: ${targetInfo.target}`,
    `approved_state: ${COMMAND_STATES[command]}`,
    `supervision_workflow_run_id: ${supervision.data.workflow_run_id}`,
    `approved_by: ${approvedBy}`,
    `approved_at: ${new Date().toISOString()}`,
    "waivers: []",
    "decisions: []",
    "---",
    "",
    `# ${command} Approval`,
    "",
    `Approved by ${approvedBy}.`,
    "",
  ].join("\n");
  await writeFile(filePath, content, "utf8");
  return filePath;
}

export function isSuccessfulCommandState(targetInfo, command) {
  const filePath = supervisionPath(targetInfo, command);
  if (!existsSync(filePath)) return false;
  try {
    const parsed = parseFrontMatter(readFileSync(filePath, "utf8")).frontMatter;
    validateSupervision(parsed, targetInfo, command);
    return parsed.result === "passed" && parsed.state === COMMAND_STATES[command];
  } catch {
    return false;
  }
}

export async function commandSupervisionResult(targetInfo, command) {
  const filePath = supervisionPath(targetInfo, command);
  if (!existsSync(filePath)) return null;
  const { data } = await readSupervision(targetInfo, command);
  return data.result ?? null;
}

export async function archiveCommandArtifacts(targetInfo, commands, reason, options = {}) {
  const historyPath = path.join(targetInfo.reviewPath, "history");
  const timestamp = timestampForFile();
  const includeApprovals = options.includeApprovals ?? false;
  const moved = [];

  for (const command of commands) {
    const candidates = [supervisionPath(targetInfo, command)];
    if (includeApprovals) candidates.push(approvalPath(targetInfo, command));

    for (const source of candidates) {
      if (!existsSync(source)) continue;
      await mkdir(historyPath, { recursive: true });
      const destination = path.join(historyPath, `${timestamp}-${reason}-${path.basename(source)}`);
      await rename(source, destination);
      moved.push(destination);
    }
  }

  return moved;
}

export async function cleanGeneratedOutputs(targetInfo, options = {}) {
  const root = options.root ?? process.cwd();
  const paths = [
    path.join(root, "dist", targetInfo.deckName),
    path.join(root, ".takt", "render", targetInfo.deckName),
  ];
  for (const generatedPath of paths) {
    await rm(generatedPath, { recursive: true, force: true });
  }
  return paths;
}

export function downstreamCommands(command) {
  return [...configFor(command).invalidationTargets];
}

export function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function hasExecutable(name) {
  const result = spawnSync("which", [name], { stdio: "ignore" });
  return result.status === 0;
}
