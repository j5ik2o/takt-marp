import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { SlideWorkflowError } from "./takt-marp-errors.mjs";

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
    let rawEntries;
    try {
      rawEntries = unzipSync(archiveBuffer);
    } catch (error) {
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
    for (const [rawName, content] of Object.entries(rawEntries)) {
      const name = normalizeEntryName(rawName);
      if (name.endsWith("/")) {
        continue;
      }
      if (entries.has(name)) {
        throw new SlideWorkflowError(`Duplicate zip entry after normalization: ${name}`, "ZIP_ENTRY_PATH_INVALID");
      }
      entries.set(name, Buffer.from(content));
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
  const normalized = name.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new SlideWorkflowError(`Unsafe absolute zip entry path: ${name}`, "ZIP_ENTRY_PATH_INVALID");
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
