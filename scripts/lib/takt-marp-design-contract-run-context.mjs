import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SlideWorkflowError,
  shouldPreserveDesignContract,
  shouldResolveDesignContract,
} from "./takt-marp-slide-workflow.mjs";
import {
  loadDesignContractMarkerPayloadFromPath,
  loadResolvedDesignContractMarker,
  resolveClaudeDesignContract,
  saveResolvedDesignContract,
} from "./takt-marp-claude-design-source.mjs";

export async function pendingDesignContractBeforeInvalidation(command, targetInfo, options = {}) {
  if (!shouldResolveDesignContract(command) || (!options.force && !options.rejectedRerun)) {
    return null;
  }
  const pending = await resolveClaudeDesignContract(targetInfo);
  await assertComposePlanDesignContractMatches(command, targetInfo, pending.contract);
  return pending;
}

export async function resolvedDesignContractForRun(command, targetInfo, options = {}) {
  if (!shouldResolveDesignContract(command)) {
    return null;
  }
  if (options.resolvedDesignContract) {
    return options.resolvedDesignContract;
  }
  const resolved = options.pendingDesignContract ?? await resolveClaudeDesignContract(targetInfo);
  await assertComposePlanDesignContractMatches(command, targetInfo, resolved.contract);
  return saveResolvedDesignContract(resolved.contract, targetInfo);
}

export async function designContractMarkerForRun(command, targetInfo, resolvedDesignContract) {
  if (shouldResolveDesignContract(command)) {
    return resolvedDesignContract?.markerPayload ?? null;
  }
  if (shouldPreserveDesignContract(command)) {
    return existingDesignContractMarker(targetInfo);
  }
  return null;
}

async function existingDesignContractMarker(targetInfo) {
  const markerPath = path.join(process.cwd(), ".takt", "workflow-current-target.json");
  if (existsSync(markerPath)) {
    try {
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      if (marker.target === targetInfo.target && marker.design_contract && designContractMarkerPathExists(marker.design_contract)) {
        const existingMarker = await loadDesignContractMarkerPayloadFromPath(designContractMarkerAbsolutePath(marker.design_contract));
        if (existingMarker) {
          return existingMarker;
        }
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return loadResolvedDesignContractMarker(targetInfo);
}

function designContractMarkerPathExists(designContract) {
  if (typeof designContract.path !== "string" || !designContract.path) {
    return false;
  }
  return existsSync(designContractMarkerAbsolutePath(designContract));
}

function designContractMarkerAbsolutePath(designContract) {
  return path.isAbsolute(designContract.path)
    ? designContract.path
    : path.join(process.cwd(), designContract.path);
}

async function assertComposePlanDesignContractMatches(command, targetInfo, contract) {
  if (command !== "compose") {
    return;
  }
  const expected = contract?.fingerprint?.contract_sha256;
  if (typeof expected !== "string" || !expected) {
    throw new SlideWorkflowError(
      `Resolved Design Contract is missing fingerprint.contract_sha256 for ${targetInfo.target}.`,
      "DESIGN_CONTRACT_PLAN_FINGERPRINT_MISMATCH",
    );
  }
  const artifactSources = [];
  for (const artifactName of ["plan.md", "slide-blueprint.md"]) {
    const artifactPath = path.join(targetInfo.deckPath, artifactName);
    const source = await readFile(artifactPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    artifactSources.push({ artifactName, source });
  }

  const contractMismatches = [];
  for (const { artifactName, source } of artifactSources) {
    const actual = source ? extractContractSha256(source) : null;
    if (actual !== expected) {
      contractMismatches.push(`${artifactName}: ${actual ?? "(missing)"} != ${expected}`);
    }
  }
  if (contractMismatches.length > 0) {
    throw new SlideWorkflowError(
      [
        `Approved plan artifacts were created with a different Design Contract for ${targetInfo.target}.`,
        ...contractMismatches.map((item) => `- ${item}`),
        "Run plan again after updating Claude Design Source before running compose.",
      ].join("\n"),
      "DESIGN_CONTRACT_PLAN_FINGERPRINT_MISMATCH",
    );
  }

  const currentDesignBriefSha256 = contract?.authoring?.design_brief?.available === true
    ? contract.authoring.design_brief.sha256
    : null;
  const designBriefMismatches = [];
  for (const { artifactName, source } of artifactSources) {
    const actual = source ? extractDesignBriefSha256(source) : null;
    if ((currentDesignBriefSha256 || actual) && actual !== currentDesignBriefSha256) {
      designBriefMismatches.push(`${artifactName}: ${actual ?? "(missing)"} != ${currentDesignBriefSha256 ?? "(missing)"}`);
    }
  }
  if (designBriefMismatches.length > 0) {
    throw new SlideWorkflowError(
      [
        `Approved plan artifacts were created with a different Design Brief for ${targetInfo.target}.`,
        ...designBriefMismatches.map((item) => `- ${item}`),
        "Run plan again after updating design/design-brief.md or Claude Design Source before running compose.",
      ].join("\n"),
      "DESIGN_BRIEF_DRIFT",
    );
  }
}

function extractContractSha256(source) {
  for (const pattern of [
    /\bcontract_sha256\s*[:=]\s*`?([a-f0-9]{64})`?/i,
    /\bContract fingerprint:\s*`?([a-f0-9]{64})`?/i,
  ]) {
    const match = source.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractDesignBriefSha256(source) {
  for (const pattern of [
    /\bdesign_brief_sha256\s*[:=]\s*`?([a-f0-9]{64})`?/i,
    /\bDesign Brief fingerprint:\s*`?([a-f0-9]{64})`?/i,
    /\bDesign Brief SHA-?256:\s*`?([a-f0-9]{64})`?/i,
  ]) {
    const match = source.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}
