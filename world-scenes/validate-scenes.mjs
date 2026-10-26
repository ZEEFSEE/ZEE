#!/usr/bin/env node
/**
 * Read-only structural and connectivity validator for Mia's extensible scene catalog.
 * No network, database, deployment, or world-state access is performed.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "world-manifest.json");
const errors = [];
const warnings = [];
const info = [];
const safeRelative = (base, relative) => {
  if (typeof relative !== "string" || !relative.trim()) return null;
  const resolved = path.resolve(base, relative);
  const root = path.resolve(path.dirname(here));
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
};
async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
const manifest = await readJson(manifestPath, "world-manifest.json");
if (!manifest || !Array.isArray(manifest.scenes)) {
  errors.push("world-manifest.json: scenes must be an array");
} else {
  const byId = new Map();
  const paths = new Set();
  const loaded = new Map();
  for (const entry of manifest.scenes) {
    if (!entry || typeof entry !== "object") {
      errors.push("manifest contains a non-object scene entry");
      continue;
    }
    if (typeof entry.scene_id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.scene_id)) {
      errors.push(`invalid scene_id: ${String(entry.scene_id)}`);
      continue;
    }
    if (byId.has(entry.scene_id)) errors.push(`duplicate scene_id: ${entry.scene_id}`);
    byId.set(entry.scene_id, entry);
    if (typeof entry.path !== "string" || paths.has(entry.path)) {
      errors.push(`missing or duplicate scene path for ${entry.scene_id}`);
      continue;
    }
    paths.add(entry.path);
    const sceneFile = safeRelative(here, entry.path);
    if (!sceneFile) {
      errors.push(`unsafe path for ${entry.scene_id}: ${entry.path}`);
      continue;
    }
    const scene = await readJson(sceneFile, entry.path);
    if (!scene) continue;
    loaded.set(entry.scene_id, scene);
    if (scene.scene_id !== entry.scene_id) errors.push(`${entry.path}: scene_id does not match manifest`);
    if (typeof scene.display_name !== "string" || !scene.display_name.trim()) errors.push(`${entry.path}: display_name is required`);
    if (!["idea", "draft", "review_required", "validated", "integrated", "deprecated"].includes(scene.status)) {
      errors.push(`${entry.path}: unsupported status ${String(scene.status)}`);
    }
    if (scene.verification_status !== "verified" && !String(scene.verification_status ?? "").startsWith("source-backed")) {
      warnings.push(`${entry.scene_id}: verification is ${String(scene.verification_status ?? "missing")}; not runtime-ready`);
    }
    for (const [kind, relative] of Object.entries(scene.files ?? {})) {
      if (relative === null) continue;
      // HTML interaction pages are stored at the repository root; JSON assets are
      // resolved relative to their scene JSON file.
      const referenceBase = kind === "interactions" && relative.endsWith(".html")
        ? path.dirname(here)
        : path.dirname(sceneFile);
      const referenced = safeRelative(referenceBase, relative);
      if (!referenced) {
        errors.push(`${entry.path}: unsafe ${kind} file reference: ${String(relative)}`);
        continue;
      }
      await readJson(referenced, `${entry.path} -> ${kind}`);
    }
  }

  const rootId = manifest.root_scene_id;
  if (typeof rootId !== "string" || !byId.has(rootId)) {
    errors.push("root_scene_id must name a scene registered in the manifest");
  } else {
    const rootScene = loaded.get(rootId);
    if (rootScene?.parent_scene_id !== null) errors.push(`root scene ${rootId} must have parent_scene_id: null`);
    for (const [id, scene] of loaded) {
      if (id === rootId) continue;
      if (typeof scene.parent_scene_id !== "string" || !byId.has(scene.parent_scene_id)) {
        errors.push(`${id}: parent_scene_id must reference a registered scene`);
      }
    }
    const reachesRoot = (id, visiting = new Set()) => {
      if (id === rootId) return true;
      if (visiting.has(id)) return false;
      visiting.add(id);
      const parent = loaded.get(id)?.parent_scene_id;
      if (typeof parent !== "string" || !loaded.has(parent)) return false;
      return reachesRoot(parent, visiting);
    };
    for (const id of loaded.keys()) {
      if (!reachesRoot(id)) errors.push(`${id}: disconnected from root scene ${rootId} (or parent cycle detected)`);
    }
  }

  if (manifest.catalog_is_exhaustive !== false) warnings.push("catalog_is_exhaustive should be false for open-ended expansion");
  info.push(`Catalog entries checked: ${manifest.scenes.length}`);
  info.push(`Connected to root: ${[...loaded.keys()].filter(id => id === rootId || reachesRootSafe(id, rootId, loaded)).length}`);
}
function reachesRootSafe(id, rootId, loaded) {
  const visited = new Set();
  while (id !== rootId) {
    if (visited.has(id)) return false;
    visited.add(id);
    const parent = loaded.get(id)?.parent_scene_id;
    if (typeof parent !== "string") return false;
    id = parent;
  }
  return true;
}
for (const line of info) console.log(`INFO: ${line}`);
for (const line of warnings) console.warn(`WARN: ${line}`);
for (const line of errors) console.error(`ERROR: ${line}`);
console.log(`Result: ${errors.length ? "FAIL" : "PASS"} (structure/connectivity only; not a 3D geometry, runtime, or deployment test)`);
if (errors.length) process.exitCode = 1;
