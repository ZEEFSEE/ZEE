#!/usr/bin/env node
/**
 * Create and register a draft scene in Mia's connected scene catalog.
 * Local developer tool only: no network, database, deployment, or runtime writes.
 *
 * Usage:
 *   node world-scenes/create-scene.mjs --id rose-garden --name "玫瑰花园" --parent mia-forest-corner
 */
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "world-manifest.json");
const templatePath = path.join(here, "scene-template.json");
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 1) {
  const key = args[i];
  if (!["--id", "--name", "--parent"].includes(key) || !args[i + 1]) {
    console.error("Usage: node world-scenes/create-scene.mjs --id <kebab-case-id> --name <display-name> --parent <registered-scene-id>");
    process.exit(2);
  }
  options[key] = args[++i];
}
const { "--id": id, "--name": name, "--parent": parentId } = options;
if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id === "replace-with-unique-kebab-case-id") {
  console.error("ERROR: --id must be a unique lowercase kebab-case ID.");
  process.exit(2);
}
if (!name?.trim()) {
  console.error("ERROR: --name must not be empty.");
  process.exit(2);
}
if (!parentId) {
  console.error("ERROR: --parent must name an existing registered scene. The root scene itself cannot be recreated.");
  process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const template = JSON.parse(await readFile(templatePath, "utf8"));
if (manifest.scenes.some(scene => scene.scene_id === id)) {
  console.error(`ERROR: scene ID already registered: ${id}`);
  process.exit(1);
}
const parent = manifest.scenes.find(scene => scene.scene_id === parentId);
if (!parent) {
  console.error(`ERROR: parent is not registered: ${parentId}`);
  process.exit(1);
}
const scenePathRelative = `scenes/${id}.json`;
const scenePath = path.join(here, scenePathRelative);
try {
  await readFile(scenePath, "utf8");
  console.error(`ERROR: scene file already exists; refusing to overwrite: ${scenePathRelative}`);
  process.exit(1);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const scene = structuredClone(template);
scene.scene_id = id;
scene.display_name = name.trim();
scene.status = "draft";
scene.parent_scene_id = parentId;
scene.source_reference = {
  kind: "mia_scene_authoring",
  source_path: null,
  source_record_id: null,
  created_by: "Mia",
  created_at: new Date().toISOString()
};
scene.verification_status = "unverified";
scene.coordinate_reference = {
  coordinate_space: "scene-local",
  origin: "scene origin",
  units: "scene-defined layout units",
  cross_scene_transform: null
};
scene.files = { geometry: null, entities: null, navigation: null, interactions: null };
scene.notes = [
  `Parent scene: ${parentId}`,
  "Draft only. Fill geometry, entities, navigation and interactions with source-backed values.",
  "Unknown coordinates and transforms must remain null; do not infer physical or cross-scene positions.",
  "Creating this file does not render, deploy, persist to a database, or connect it to the running Mia app."
];

const nextManifest = structuredClone(manifest);
nextManifest.scenes.push({
  scene_id: id,
  path: scenePathRelative,
  parent_scene_id: parentId,
  verification_status: "unverified"
});
const sceneTemp = `${scenePath}.tmp`;
const manifestTemp = `${manifestPath}.tmp`;
let sceneCreated = false;
try {
  await writeFile(sceneTemp, JSON.stringify(scene, null, 2) + "\n", { flag: "wx" });
  await rename(sceneTemp, scenePath);
  sceneCreated = true;
  await writeFile(manifestTemp, JSON.stringify(nextManifest, null, 2) + "\n", { flag: "wx" });
  await rename(manifestTemp, manifestPath);
  console.log(`Created draft scene: ${scenePathRelative}`);
  console.log(`Registered under parent: ${parentId}`);
  console.log("Next: node world-scenes/validate-scenes.mjs");
} catch (error) {
  await rm(sceneTemp, { force: true });
  await rm(manifestTemp, { force: true });
  if (sceneCreated) await rm(scenePath, { force: true });
  throw error;
}
