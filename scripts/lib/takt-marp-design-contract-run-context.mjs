import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  shouldPreserveDesignContract,
  shouldResolveDesignContract,
} from "./takt-marp-slide-workflow.mjs";
import {
  loadDesignContractMarkerPayloadFromPath,
  loadResolvedDesignContractMarker,
  resolveAndSaveClaudeDesignContract,
  resolveClaudeDesignContract,
  saveResolvedDesignContract,
} from "./takt-marp-claude-design-source.mjs";

export async function pendingDesignContractBeforeInvalidation(command, targetInfo, options = {}) {
  if (!shouldResolveDesignContract(command) || (!options.force && !options.rejectedRerun)) {
    return null;
  }
  return resolveClaudeDesignContract(targetInfo);
}

export async function resolvedDesignContractForRun(command, targetInfo, options = {}) {
  if (!shouldResolveDesignContract(command)) {
    return null;
  }
  if (options.resolvedDesignContract) {
    return options.resolvedDesignContract;
  }
  return options.pendingDesignContract
    ? saveResolvedDesignContract(options.pendingDesignContract.contract, targetInfo)
    : resolveAndSaveClaudeDesignContract(targetInfo);
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
