import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";

export const DEFAULT_ZIP_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 50 * 1024 * 1024,
  maxEntries: 2048,
  maxTotalUncompressedBytes: 150 * 1024 * 1024,
});

export class ZipArchiveReader {
  static async fromFile(filePath) {
    try {
      return ZipArchiveReader.fromBuffer(await readFile(filePath), { sourcePath: filePath });
    } catch (error) {
      if (error instanceof SlideWorkflowError) {
        throw error;
      }
      throw new SlideWorkflowError(`Unable to read zip archive: ${filePath}. ${error.message}`, "ZIP_ARCHIVE_INVALID");
    }
  }

  static fromBuffer(buffer, options = {}) {
    const archiveBuffer = Buffer.from(toUint8Array(buffer));
    const limits = resolveZipArchiveLimits(options.limits);
    assertArchiveBufferWithinLimits(archiveBuffer, limits, options.sourcePath);
    let rawEntries;
    try {
      const counter = createZipEntryLimitCounter(limits, options.sourcePath);
      rawEntries = unzipSync(archiveBuffer, {
        filter: (file) => counter.accept(file),
      });
    } catch (error) {
      if (error instanceof SlideWorkflowError) {
        throw error;
      }
      throw new SlideWorkflowError(
        `Unable to parse zip archive${options.sourcePath ? `: ${options.sourcePath}` : ""}. ${error.message}`,
        "ZIP_ARCHIVE_INVALID",
      );
    }
    return new ZipArchiveReader(rawEntries, {
      ...options,
      sourceSha256: createHash("sha256").update(archiveBuffer).digest("hex"),
    });
  }

  constructor(rawEntries, options = {}) {
    const entries = new Map();
    const limits = resolveZipArchiveLimits(options.limits);
    const counter = createRawEntryLimitCounter(limits, options.sourcePath);
    for (const [rawName, content] of Object.entries(rawEntries)) {
      const name = normalizeEntryName(rawName);
      if (name.endsWith("/")) {
        continue;
      }
      if (entries.has(name)) {
        throw new SlideWorkflowError(`Duplicate zip entry after normalization: ${name}`, "ZIP_ENTRY_PATH_INVALID");
      }
      const entry = Buffer.from(content);
      counter.accept(name, entry.byteLength);
      entries.set(name, entry);
    }
    this.sourcePath = options.sourcePath ?? null;
    this.sourceSha256 = options.sourceSha256 ?? null;
    this.entries = entries;
  }

  entryNames() {
    return Object.freeze([...this.entries.keys()].sort());
  }

  hasEntry(name) {
    return this.entries.has(normalizeEntryName(name));
  }

  async readEntry(name) {
    const normalized = normalizeEntryName(name);
    const entry = this.entries.get(normalized);
    if (!entry) {
      throw new SlideWorkflowError(`Zip entry not found: ${normalized}`, "ZIP_ENTRY_MISSING");
    }
    return Buffer.from(entry);
  }

  async readText(name) {
    return (await this.readEntry(name)).toString("utf8");
  }
}

function resolveZipArchiveLimits(limits = {}) {
  return Object.freeze({
    maxArchiveBytes: limits.maxArchiveBytes ?? DEFAULT_ZIP_ARCHIVE_LIMITS.maxArchiveBytes,
    maxEntries: limits.maxEntries ?? DEFAULT_ZIP_ARCHIVE_LIMITS.maxEntries,
    maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes ?? DEFAULT_ZIP_ARCHIVE_LIMITS.maxTotalUncompressedBytes,
  });
}

function assertArchiveBufferWithinLimits(archiveBuffer, limits, sourcePath) {
  if (archiveBuffer.byteLength > limits.maxArchiveBytes) {
    throw new SlideWorkflowError(
      `Zip archive${sourcePath ? ` ${sourcePath}` : ""} exceeds maximum compressed size: ${archiveBuffer.byteLength} > ${limits.maxArchiveBytes} bytes.`,
      "ZIP_ARCHIVE_LIMIT_EXCEEDED",
    );
  }
}

function createZipEntryLimitCounter(limits, sourcePath) {
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  return Object.freeze({
    accept: (file) => {
      const name = normalizeEntryName(file.name);
      if (name.endsWith("/")) {
        return false;
      }
      entryCount += 1;
      totalUncompressedBytes += file.originalSize;
      assertEntryLimits(entryCount, totalUncompressedBytes, limits, sourcePath);
      return true;
    },
  });
}

function createRawEntryLimitCounter(limits, sourcePath) {
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  return Object.freeze({
    accept: (name, byteLength) => {
      entryCount += 1;
      totalUncompressedBytes += byteLength;
      assertEntryLimits(entryCount, totalUncompressedBytes, limits, sourcePath);
    },
  });
}

function assertEntryLimits(entryCount, totalUncompressedBytes, limits, sourcePath) {
  if (entryCount > limits.maxEntries) {
    throw new SlideWorkflowError(
      `Zip archive${sourcePath ? ` ${sourcePath}` : ""} has too many entries: ${entryCount} > ${limits.maxEntries}.`,
      "ZIP_ARCHIVE_LIMIT_EXCEEDED",
    );
  }
  if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
    throw new SlideWorkflowError(
      `Zip archive${sourcePath ? ` ${sourcePath}` : ""} exceeds maximum uncompressed size: ${totalUncompressedBytes} > ${limits.maxTotalUncompressedBytes} bytes.`,
      "ZIP_ARCHIVE_LIMIT_EXCEEDED",
    );
  }
}

export function createZipArchiveBuffer(entries) {
  const zipEntries = {};
  for (const [name, content] of Object.entries(entries)) {
    zipEntries[name] = typeof content === "string" ? strToU8(content) : toUint8Array(content);
  }
  return Buffer.from(zipSync(zipEntries, { level: 9, mtime: new Date("1980-01-01T00:00:00.000Z") }));
}

function normalizeEntryName(name) {
  if (typeof name !== "string" || name.length === 0 || name.includes("\0")) {
    throw new SlideWorkflowError(`Invalid zip entry name: ${JSON.stringify(name)}`, "ZIP_ENTRY_PATH_INVALID");
  }
  let normalized = name.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new SlideWorkflowError(`Unsafe absolute zip entry path: ${name}`, "ZIP_ENTRY_PATH_INVALID");
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  if (normalized.length === 0) {
    throw new SlideWorkflowError(`Invalid zip entry name: ${JSON.stringify(name)}`, "ZIP_ENTRY_PATH_INVALID");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new SlideWorkflowError(`Unsafe zip entry path traversal: ${name}`, "ZIP_ENTRY_PATH_INVALID");
  }
  return normalized;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new SlideWorkflowError("Zip entry content must be a Buffer or Uint8Array", "ZIP_ENTRY_INVALID");
}
