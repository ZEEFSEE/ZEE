import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, "snapshot-manifest.json"), "utf8"));
const failures = [];
for (const entry of manifest.files) {
  const bytes = await readFile(path.join(here, "repo", entry.source_path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) failures.push({ path: entry.snapshot_path, expected: entry.sha256, actual });
}
if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "PASS", snapshot_id: manifest.snapshot_id, verified_files: manifest.files.length }, null, 2));
}
