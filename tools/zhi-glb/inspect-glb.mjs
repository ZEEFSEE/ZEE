#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node tools/zhi-glb/inspect-glb.mjs <model.glb>");
  process.exit(2);
}

try {
  const data = await readFile(file);
  if (data.length < 12) throw new Error("File is shorter than the 12-byte GLB header.");
  const magic = data.readUInt32LE(0);
  const version = data.readUInt32LE(4);
  const declaredLength = data.readUInt32LE(8);
  if (magic !== 0x46546c67) throw new Error("Invalid GLB magic; expected glTF (glTF binary).");
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}; expected 2.`);
  if (declaredLength !== data.length) {
    throw new Error(`Header length ${declaredLength} does not match actual size ${data.length}.`);
  }

  const sha256 = createHash("sha256").update(data).digest("hex");
  console.log(JSON.stringify({
    status: "header_valid",
    file: basename(file),
    format: "glb",
    glb_version: version,
    bytes: data.length,
    sha256,
    note: "Header-level check only; run a full glTF validator and visual/runtime QA before release."
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
