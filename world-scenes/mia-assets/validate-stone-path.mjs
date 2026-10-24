#!/usr/bin/env node
/**
 * Read-only contract test for Mia's forest stone path.
 * This validates authored JSON only; it does not register physics/navigation
 * or move a production Mia entity.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assetPath = new URL("./stone-path-forest-to-lounge.json", import.meta.url);
const navPath = new URL("./navigation.json", import.meta.url);
const [asset, nav] = await Promise.all([
  readFile(assetPath, "utf8").then(JSON.parse),
  readFile(navPath, "utf8").then(JSON.parse),
]);

assert.equal(asset.asset_id, "stone-path-forest-to-lounge");
assert.equal(asset.scene_id, "mia-forest-corner");
assert.equal(asset.coordinate_space, "scene-local");
assert.equal(nav.scene_id, "mia-forest-corner");
assert.equal(nav.coordinate_space, "scene-local");

const slabs = asset.visual_mesh?.slabs;
const colliders = asset.collision?.colliders;
assert.ok(Array.isArray(slabs), "visual_mesh.slabs must be an array");
assert.ok(Array.isArray(colliders), "collision.colliders must be an array");
assert.equal(slabs.length, 5, "expected five stone slabs");
assert.equal(colliders.length, 5, "expected one collider per slab");
assert.equal(new Set(slabs.map((s) => s.id)).size, slabs.length, "slab IDs must be unique");

const validPolygon = (points) =>
  Array.isArray(points) &&
  points.length >= 3 &&
  points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
  new Set(points.map((p) => p.join(","))).size === points.length;

for (const slab of slabs) {
  assert.ok(validPolygon(slab.polygon_xy), `invalid polygon for ${slab.id}`);
  const collider = colliders.find((c) => c.mesh_id === slab.id);
  assert.ok(collider, `missing collider for ${slab.id}`);
  assert.ok(validPolygon(collider.polygon_xy), `invalid collider polygon for ${slab.id}`);
  assert.deepEqual(collider.polygon_xy, slab.polygon_xy, `collider geometry differs for ${slab.id}`);
  assert.ok(Number.isFinite(slab.z_min) && Number.isFinite(slab.z_max), `missing slab z bounds for ${slab.id}`);
}

assert.deepEqual(asset.endpoints?.start, { x: 0, y: 350, z: null, node_id: "forest-corner-left-boundary-test-entry" });
assert.equal(asset.endpoints?.end?.x, 800);
assert.equal(asset.endpoints?.end?.y, 350);
assert.equal(asset.endpoints?.end?.z, null);
assert.equal(asset.continuous_walkable_route_asserted, false, "authored data must not claim a verified continuous runtime route");

const nodes = new Map((nav.nodes ?? []).map((n) => [n.node_id, n]));
const expected = [
  "forest-corner-left-boundary-test-entry",
  "stone-slab-01-waypoint",
  "stone-slab-02-waypoint",
  "stone-slab-03-waypoint",
  "stone-slab-04-waypoint",
  "stone-slab-05-waypoint",
  "lounge",
];
assert.equal(nodes.size, nav.nodes.length, "navigation node IDs must be unique");
assert.equal(nav.edges?.length, expected.length - 1, "expected six sequential navigation edges");
for (const id of expected) assert.ok(nodes.has(id), `missing navigation node ${id}`);
for (let i = 0; i < expected.length - 1; i++) {
  const edge = nav.edges[i];
  assert.equal(edge.from, expected[i], `edge ${i + 1} has unexpected source`);
  assert.equal(edge.to, expected[i + 1], `edge ${i + 1} has unexpected destination`);
  assert.equal(edge.runtime_registered, false, "runtime registration must remain unverified until a real runtime adapter exists");
  assert.equal(edge.traversal_status, "authored_pending_runtime_validation");
}
for (const id of expected) {
  const p = nodes.get(id).position;
  assert.equal(p.z, null, `z coordinate for ${id} must remain unverified`);
}

console.log("PASS: stone path asset and authored navigation graph satisfy the read-only contract.");
console.log("LIMIT: no runtime registration, physical collision, 3D mapping, database write, or production movement was tested.");
