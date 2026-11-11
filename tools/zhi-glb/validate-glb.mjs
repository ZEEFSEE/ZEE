#!/usr/bin/env node
import validator from "gltf-validator";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node tools/zhi-glb/validate-glb.mjs <model.glb>");
  process.exit(2);
}

try {
  const bytes = await readFile(file);
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: basename(file),
    maxIssues: 1000
  });
  const issues = report.issues ?? {};
  const result = {
    status: (issues.numErrors ?? 0) === 0 ? "valid_with_possible_warnings" : "rejected",
    file: basename(file),
    validator: "Khronos glTF Validator",
    errors: issues.numErrors ?? 0,
    warnings: issues.numWarnings ?? 0,
    infos: issues.numInfos ?? 0,
    hints: issues.numHints ?? 0,
    messages: (issues.messages ?? []).map(({ code, message, severity, pointer }) => ({
      code, message, severity, pointer
    }))
  };
  console.log(JSON.stringify(result, null, 2));
  if ((issues.numErrors ?? 0) > 0) process.exitCode = 1;
} catch (error) {
  console.error(`VALIDATION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
