import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";
import { ZipArchiveReader, createZipArchiveBuffer } from "./takt-marp-zip-archive.mjs";

export const CLAUDE_DESIGN_REQUIRED_FILES = Object.freeze([
  "_ds_manifest.json",
  "styles.css",
  "tokens/colors.css",
  "tokens/typography.css",
  "tokens/spacing.css",
]);

export const CLAUDE_DESIGN_OPTIONAL_FILES = Object.freeze([
  ".thumbnail",
  "_ds_bundle.js",
  "_adherence.oxlintrc.json",
  "tokens/fonts.css",
]);

const REQUIRED_MANIFEST_FIELDS = Object.freeze(["namespace", "globalCssPaths", "tokens"]);

export function buildClaudeDesignSmokeFixtureZipBuffer() {
  const manifest = {
    namespace: "ClaudeDesignSmoke",
    source: "smoke-fixture",
    globalCssPaths: ["tokens/fonts.css", "tokens/colors.css", "tokens/typography.css", "tokens/spacing.css", "styles.css"],
    components: [],
    startingPoints: [],
    cards: [],
    templates: [],
    themes: [],
    fonts: [],
    brandFonts: ["Noto Sans JP", "JetBrains Mono"],
    tokens: [
      { name: "--accent", value: "#b0241d", kind: "color", definedIn: "tokens/colors.css" },
      { name: "--bg-page", value: "#faf7f1", kind: "color", definedIn: "tokens/colors.css" },
      { name: "--font-body", value: "'Noto Sans JP', sans-serif", kind: "font", definedIn: "tokens/typography.css" },
      { name: "--fs-md", value: "18px", kind: "font", definedIn: "tokens/typography.css" },
      { name: "--space-4", value: "16px", kind: "spacing", definedIn: "tokens/spacing.css" },
      { name: "--radius-md", value: "6px", kind: "spacing", definedIn: "tokens/spacing.css" },
    ],
  };
  return createZipArchiveBuffer({
    "_ds_manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "styles.css": [
      "@import url('./tokens/fonts.css');",
      "@import url('./tokens/colors.css');",
      "@import url('./tokens/typography.css');",
      "@import url('./tokens/spacing.css');",
      "",
    ].join("\n"),
    "tokens/fonts.css": "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP&family=JetBrains+Mono&display=swap');\n",
    "tokens/colors.css": ":root {\n  --accent: #b0241d;\n  --bg-page: #faf7f1;\n}\n",
    "tokens/typography.css": ":root {\n  --font-body: 'Noto Sans JP', sans-serif;\n  --fs-md: 18px;\n}\n",
    "tokens/spacing.css": ":root {\n  --space-4: 16px;\n  --radius-md: 6px;\n}\n",
    "_adherence.oxlintrc.json": `${JSON.stringify({
      rules: {
        "no-restricted-syntax": [
          "warn",
          { selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]", message: "Raw hex color -- use a design-system color token via var()." },
          { selector: "Literal[value=/\\b\\d+px\\b/]", message: "Raw px value -- use a design-system spacing token via var()." },
        ],
      },
      "x-omelette": { tokens: manifest.tokens.map((token) => token.name), components: {} },
    }, null, 2)}\n`,
  });
}

export async function writeClaudeDesignSmokeFixture(targetInfo, options = {}) {
  const root = options.root ?? process.cwd();
  const designDir = path.join(root, "slides", targetInfo.deckName, "design");
  await mkdir(designDir, { recursive: true });
  const filePath = path.join(designDir, "Claude Design Smoke.zip");
  await writeFile(filePath, buildClaudeDesignSmokeFixtureZipBuffer());
  return filePath;
}

export async function resolveAndSaveClaudeDesignContract(targetInfo, options = {}) {
  const source = await resolveClaudeDesignSource(targetInfo, options);
  const contract = await importClaudeDesignSourceArchive(source.archive, {
    root: options.root ?? process.cwd(),
    sourcePath: source.sourcePath,
    deckName: targetInfo.deckName,
  });
  return saveResolvedDesignContract(contract, targetInfo, options);
}

export async function resolveClaudeDesignSource(targetInfo, options = {}) {
  const root = options.root ?? process.cwd();
  const designDir = path.join(targetInfo.deckPath, "design");
  if (!existsSync(designDir)) {
    throw new SlideWorkflowError(missingSourceMessage(targetInfo), "CLAUDE_DESIGN_SOURCE_MISSING");
  }

  const names = (await readdir(designDir)).filter((name) => name.toLowerCase().endsWith(".zip")).sort();
  if (names.length === 0) {
    throw new SlideWorkflowError(missingSourceMessage(targetInfo), "CLAUDE_DESIGN_SOURCE_MISSING");
  }

  const valid = [];
  const invalid = [];
  for (const name of names) {
    const sourcePath = path.join(designDir, name);
    try {
      const archive = await ZipArchiveReader.fromFile(sourcePath);
      if (archive.hasEntry("_ds_manifest.json")) {
        valid.push(Object.freeze({ sourcePath, archive }));
      } else {
        invalid.push(`${projectRelativePath(sourcePath, root)}: missing _ds_manifest.json`);
      }
    } catch (error) {
      invalid.push(`${projectRelativePath(sourcePath, root)}: ${error.code ?? "ZIP_ARCHIVE_INVALID"}`);
    }
  }

  if (valid.length > 1) {
    throw new SlideWorkflowError(
      [
        `Multiple Claude Design Source zip files were found for ${targetInfo.target}.`,
        ...valid.map((item) => `- ${projectRelativePath(item.sourcePath, root)}`),
      ].join("\n"),
      "CLAUDE_DESIGN_SOURCE_AMBIGUOUS",
    );
  }
  if (valid.length === 0) {
    throw new SlideWorkflowError(
      [
        `Claude Design Source zip could not be imported from ${projectRelativePath(designDir, root)}.`,
        ...invalid,
        "Place exactly one Claude Design export zip containing _ds_manifest.json under slides/<deck>/design/.",
        "Legacy design-system.md and hand-written design-contract.md are not fallback inputs.",
      ].join("\n"),
      "CLAUDE_DESIGN_SOURCE_INVALID",
    );
  }
  return valid[0];
}

export async function importClaudeDesignSourceBuffer(buffer, options = {}) {
  return importClaudeDesignSourceArchive(ZipArchiveReader.fromBuffer(buffer, { sourcePath: options.sourcePath }), options);
}

export async function importClaudeDesignSourceArchive(archive, options = {}) {
  const sourcePath = options.sourcePath ?? archive.sourcePath ?? "Claude Design Source.zip";
  const root = options.root ?? process.cwd();
  const sourceSha256 = archive.sourceSha256 ?? createHash("sha256").update(await archive.readEntry("_ds_manifest.json")).digest("hex");
  assertRequiredFiles(archive, sourcePath);
  const manifest = parseManifest(await archive.readText("_ds_manifest.json"), sourcePath);
  const tokenCss = await readTokenCss(archive);
  const cssTokens = extractCssTokens(tokenCss);
  const manifestTokens = normalizeManifestTokens(manifest.tokens);
  assertTokenConsistency(manifestTokens, cssTokens, sourcePath);
  const adherence = await readAdherenceMetadata(archive);
  const tokens = manifestTokens.map((token) => ({
    ...token,
    category: classifyToken(token),
  })).sort((left, right) => left.name.localeCompare(right.name));
  const contractWithoutContractHash = {
    schema_version: 1,
    source: {
      kind: "claude-design-zip",
      path: projectRelativePath(sourcePath, root),
      sha256: sourceSha256,
      namespace: manifest.namespace,
      export_source: manifest.source ?? null,
    },
    fingerprint: {
      source_sha256: sourceSha256,
    },
    global_css_paths: [...manifest.globalCssPaths],
    required_files: [...CLAUDE_DESIGN_REQUIRED_FILES],
    optional_files_present: CLAUDE_DESIGN_OPTIONAL_FILES.filter((fileName) => archive.hasEntry(fileName)),
    token_counts: tokenCounts(tokens),
    brand_fonts: brandFonts(manifest, tokens),
    components: {
      count: Array.isArray(manifest.components) ? manifest.components.length : 0,
      empty: !Array.isArray(manifest.components) || manifest.components.length === 0,
    },
    adherence,
    tokens,
  };
  const contractSha256 = sha256Stable(contractWithoutContractHash);
  return deepFreeze({
    ...contractWithoutContractHash,
    fingerprint: {
      ...contractWithoutContractHash.fingerprint,
      contract_sha256: contractSha256,
    },
  });
}

export async function saveResolvedDesignContract(contract, targetInfo, options = {}) {
  const root = options.root ?? process.cwd();
  const contractDir = path.join(root, ".takt", "design-contracts", targetInfo.deckName);
  const contractPath = path.join(contractDir, "resolved-design-contract.json");
  await mkdir(contractDir, { recursive: true });
  const tempPath = `${contractPath}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  await rename(tempPath, contractPath);
  return Object.freeze({
    contract,
    contractPath,
    markerPayload: designContractMarkerPayload(contract, contractPath, root),
  });
}

export async function loadResolvedDesignContractMarker(targetInfo, options = {}) {
  const root = options.root ?? process.cwd();
  const contractPath = path.join(root, ".takt", "design-contracts", targetInfo.deckName, "resolved-design-contract.json");
  if (!existsSync(contractPath)) {
    return null;
  }
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  return designContractMarkerPayload(contract, contractPath, root);
}

export function designContractMarkerPayload(contract, contractPath, root = process.cwd()) {
  return Object.freeze({
    source: contract.source,
    path: projectRelativePath(contractPath, root),
    fingerprint: contract.fingerprint,
    namespace: contract.source.namespace,
    token_counts: contract.token_counts,
    brand_fonts: contract.brand_fonts,
    component_count: contract.components.count,
    adherence_available: contract.adherence.available,
  });
}

function missingSourceMessage(targetInfo) {
  return [
    `Claude Design Source is required before running plan or compose for ${targetInfo.target}.`,
    `Place exactly one Claude Design export zip under slides/${targetInfo.deckName}/design/.`,
    "Legacy design-system.md and hand-written design-contract.md are not fallback inputs.",
  ].join(" ");
}

function assertRequiredFiles(archive, sourcePath) {
  const missing = CLAUDE_DESIGN_REQUIRED_FILES.filter((fileName) => !archive.hasEntry(fileName));
  if (missing.length > 0) {
    throw new SlideWorkflowError(
      `Claude Design Source is missing required files in ${sourcePath}: ${missing.join(", ")}`,
      "CLAUDE_DESIGN_SOURCE_INVALID",
    );
  }
}

function parseManifest(source, sourcePath) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw new SlideWorkflowError(`Claude Design manifest is malformed JSON in ${sourcePath}: ${error.message}`, "CLAUDE_DESIGN_SOURCE_INVALID");
  }
  const missing = REQUIRED_MANIFEST_FIELDS.filter((field) => manifest[field] === undefined);
  if (missing.length > 0) {
    throw new SlideWorkflowError(`Claude Design manifest is missing required fields: ${missing.join(", ")}`, "CLAUDE_DESIGN_SOURCE_INVALID");
  }
  if (typeof manifest.namespace !== "string" || !manifest.namespace.trim()) {
    throw new SlideWorkflowError("Claude Design manifest field 'namespace' must be a non-empty string", "CLAUDE_DESIGN_SOURCE_INVALID");
  }
  if (!Array.isArray(manifest.globalCssPaths)) {
    throw new SlideWorkflowError("Claude Design manifest field 'globalCssPaths' must be an array", "CLAUDE_DESIGN_SOURCE_INVALID");
  }
  if (!Array.isArray(manifest.tokens) || manifest.tokens.length === 0) {
    throw new SlideWorkflowError("Claude Design manifest token list is empty", "CLAUDE_DESIGN_SOURCE_INVALID");
  }
  return manifest;
}

async function readTokenCss(archive) {
  const css = {};
  for (const fileName of ["tokens/colors.css", "tokens/typography.css", "tokens/spacing.css", "tokens/fonts.css"]) {
    if (archive.hasEntry(fileName)) {
      css[fileName] = await archive.readText(fileName);
    }
  }
  return css;
}

function extractCssTokens(cssByPath) {
  const tokens = new Map();
  for (const [fileName, source] of Object.entries(cssByPath)) {
    const regex = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
    for (const match of source.matchAll(regex)) {
      tokens.set(match[1], { value: match[2].trim(), definedIn: fileName });
    }
  }
  return tokens;
}

function normalizeManifestTokens(tokens) {
  return tokens.map((token) => {
    if (typeof token?.name !== "string" || !token.name.startsWith("--")) {
      throw new SlideWorkflowError(`Claude Design manifest token has invalid name: ${JSON.stringify(token)}`, "CLAUDE_DESIGN_SOURCE_INVALID");
    }
    return {
      name: token.name,
      value: String(token.value ?? ""),
      kind: String(token.kind ?? "unknown"),
      defined_in: String(token.definedIn ?? token.defined_in ?? ""),
    };
  });
}

function assertTokenConsistency(manifestTokens, cssTokens, sourcePath) {
  const manifestNames = new Set(manifestTokens.map((token) => token.name));
  const cssNames = new Set(cssTokens.keys());
  const missingInCss = [...manifestNames].filter((name) => !cssNames.has(name)).sort();
  const missingInManifest = [...cssNames].filter((name) => !manifestNames.has(name)).sort();
  const valueMismatches = manifestTokens
    .filter((token) => cssTokens.has(token.name))
    .filter((token) => normalizeTokenValue(token.value) !== normalizeTokenValue(cssTokens.get(token.name).value))
    .map((token) => `${token.name}: manifest=${token.value || "(empty)"} css=${cssTokens.get(token.name).value || "(empty)"}`)
    .sort();
  if (missingInCss.length > 0 || missingInManifest.length > 0 || valueMismatches.length > 0) {
    throw new SlideWorkflowError(
      [
        `Claude Design token mismatch in ${sourcePath}.`,
        `Missing in CSS: ${missingInCss.join(", ") || "(none)"}`,
        `Missing in manifest: ${missingInManifest.join(", ") || "(none)"}`,
        `Value mismatch: ${valueMismatches.join(", ") || "(none)"}`,
      ].join("\n"),
      "CLAUDE_DESIGN_SOURCE_INVALID",
    );
  }
}

function normalizeTokenValue(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

async function readAdherenceMetadata(archive) {
  if (!archive.hasEntry("_adherence.oxlintrc.json")) {
    return Object.freeze({ available: false, rule_messages: [], x_omelette_token_count: 0 });
  }
  try {
    const parsed = JSON.parse(await archive.readText("_adherence.oxlintrc.json"));
    const restrictedSyntax = Array.isArray(parsed.rules?.["no-restricted-syntax"]) ? parsed.rules["no-restricted-syntax"] : [];
    const messages = restrictedSyntax
      .filter((entry) => entry && typeof entry === "object" && typeof entry.message === "string")
      .map((entry) => entry.message)
      .sort();
    return Object.freeze({
      available: true,
      rule_messages: Object.freeze(messages),
      x_omelette_token_count: Array.isArray(parsed["x-omelette"]?.tokens) ? parsed["x-omelette"].tokens.length : 0,
    });
  } catch (error) {
    throw new SlideWorkflowError(`Claude Design adherence metadata is malformed: ${error.message}`, "CLAUDE_DESIGN_SOURCE_INVALID");
  }
}

function classifyToken(token) {
  const name = token.name.toLowerCase();
  const definedIn = token.defined_in.toLowerCase();
  if (definedIn.includes("colors") || /^#[0-9a-f]{3,8}$/i.test(token.value) || name.includes("color") || name.includes("accent") || name.includes("bg-") || name.includes("text-")) {
    return "color";
  }
  if (name.includes("radius")) return "radius";
  if (name.includes("shadow")) return "shadow";
  if (definedIn.includes("typography") || name.startsWith("--font") || name.startsWith("--fs") || name.startsWith("--fw") || name.startsWith("--lh") || name.startsWith("--ls")) {
    return "typography";
  }
  if (definedIn.includes("spacing") || name.startsWith("--space") || name.startsWith("--bw") || name.startsWith("--slide") || name.startsWith("--dur") || name.startsWith("--ease")) {
    return "spacing";
  }
  if (token.kind === "font") return "font";
  return "other";
}

function tokenCounts(tokens) {
  const counts = { color: 0, typography: 0, spacing: 0, radius: 0, shadow: 0, font: 0, other: 0, total: tokens.length };
  for (const token of tokens) {
    counts[token.category] = (counts[token.category] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

function brandFonts(manifest, tokens) {
  const fonts = new Set(Array.isArray(manifest.brandFonts) ? manifest.brandFonts.filter((item) => typeof item === "string") : []);
  for (const token of tokens) {
    if (token.name.startsWith("--font")) {
      const match = token.value.match(/['"]([^'"]+)['"]/);
      if (match) {
        fonts.add(match[1]);
      }
    }
  }
  return Object.freeze([...fonts].sort());
}

function sha256Stable(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function projectRelativePath(filePath, root) {
  const absolutePath = path.resolve(root, filePath);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return relativePath.split(path.sep).join("/");
  }
  return absolutePath;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
