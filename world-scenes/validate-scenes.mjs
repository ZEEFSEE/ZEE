#!/usr/bin/env node
/**
 * Read-only structural validator for the ZHI scene-data catalog.
 * Run from any directory: node world-scenes/validate-scenes.mjs
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
  const root = path.resolve(here);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
};
async function readJson(file, label) {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
const manifest = await readJson(manifestPath, "world-manifest.json");
if (!manifest || !Array.isArray(manifest.scenes)) {
  errors.push("world-manifest.json: scenes must be an array");
} else {
  const ids = new Set();
  const paths = new Set();
  for (const entry of manifest.scenes) {
    if (!entry || typeof entry !== "object") {
      errors.push("manifest contains a non-object scene entry");
      continue;
    }
    if (typeof entry.scene_id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.scene_id)) {
      errors.push(`invalid scene_id: ${String(entry.scene_id)}`);
      continue;
    }
    if (ids.has(entry.scene_id)) errors.push(`duplicate scene_id: ${entry.scene_id}`);
    ids.add(entry.scene_id);
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
    if (scene.scene_id !== entry.scene_id) errors.push(`${entry.path}: scene_id does not match manifest`);
    if (typeof scene.display_name !== "string" || !scene.display_name.trim()) {
      errors.push(`${entry.path}: display_name is required`);
    }
    if (!["idea", "draft", "review_required", "validated", "integrated", "deprecated"].includes(scene.status)) {
      errors.push(`${entry.path}: unsupported status ${String(scene.status)}`);
    }
    if (scene.verification_status !== "verified") {
      warnings.push(`${entry.scene_id}: coordinate/source verification is ${String(scene.verification_status ?? "missing")}; not runtime-ready`);
    }
    for (const [kind, relative] of Object.entries(scene.files ?? {})) {
      const referenced = safeRelative(path.dirname(sceneFile), relative);
      if (!referenced) {
        errors.push(`${entry.path}: unsafe ${kind} file reference: ${String(relative)}`);
        continue;
      }
      await readJson(referenced, `${entry.path} -> ${kind}`);
    }
  }
  if (manifest.catalog_is_exhaustive !== false) {
    warnings.push("catalog_is_exhaustive is not false; open-ended catalog intent may be unclear");
  }
  const coords = manifest.coordinate_system?.world_coordinates;
  if (!coords || coords.verification_status !== "verified" || coords.origin == null || coords.axes == null || coords.units === "unverified") {
    warnings.push("world coordinate convention is not authoritative/verified; do not convert or place scenes in world space");
  }
  info.push(`Catalog entries checked: ${manifest.scenes.length}`);
}
for (const line of info) console.log(`INFO: ${line}`);
for (const line of warnings) console.warn(`WARN: ${line}`);
for (const line of errors) console.error(`ERROR: ${line}`);
console.log(`Result: ${errors.length ? "FAIL" : "PASS"} (structural catalog checks only; not a geometry, runtime, or deployment test)`);
if (errors.length) process.exitCode = 1;
